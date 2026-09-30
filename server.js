const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create connection to your MySQL Local instance 3306
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '784569784569', // Replace with your MySQL root password
    database: 'nbm_bytes_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL Local instance 3306');
});

// Automatically create the referrals table if it doesn't exist yet
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS referrals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255),
        client_name VARCHAR(255),
        contact_person VARCHAR(255),
        client_email VARCHAR(255),
        service_type VARCHAR(255),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;

db.query(createTableQuery, (err) => {
    if (err) {
        console.error('❌ Error creating referrals table:', err);
    } else {
        console.log('✅ Referrals table is verified/ready in MySQL.');
    }
});

// Signup Endpoint
app.post('/api/signup', async (req, res) => {
    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const query = 'INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)';
        db.query(query, [fullname, email, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Email already registered.' });
                }
                return res.status(500).json({ success: false, message: 'Database error.' });
            }
            res.status(200).json({ success: true, message: 'Account created successfully!' });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const query = 'SELECT * FROM users WHERE email = ?';
    db.query(query, [email], async (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error.' });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid email or password.' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid email or password.' });
        }

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            partner: {
                email: user.email,
                name: user.fullname
            }
        });
    });
});

// Handle New Referral Submission from Partner Portal
app.post('/api/submit-referral', (req, res) => {
    const { user_email, client_name, contact_person, client_email, service_type, notes } = req.body;

    if (!user_email || !client_name) {
        return res.status(400).json({ success: false, message: 'User email and client/company name are required.' });
    }

    const query = `
        INSERT INTO referrals (user_email, client_name, contact_person, client_email, service_type, notes, status, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', NOW())
    `;

    db.query(query, [user_email, client_name, contact_person, client_email, service_type, notes], (err, result) => {
        if (err) {
            console.error('Database insertion error:', err);
            return res.status(500).json({ success: false, message: 'Database error while saving referral.' });
        }

        res.status(200).json({
            success: true,
            message: 'Referral submitted successfully!',
            referralId: result.insertId
        });
    });
});

// Get Partner's Own Referrals
app.get('/api/my-referrals', (req, res) => {
    const userEmail = req.query.email;

    if (!userEmail) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const query = 'SELECT * FROM referrals WHERE user_email = ? ORDER BY created_at DESC';

    db.query(query, [userEmail], (err, results) => {
        if (err) {
            console.error('Database fetch error:', err);
            return res.status(500).json({ success: false, message: 'Database error while fetching referrals.' });
        }

        res.status(200).json({
            success: true,
            stats: {
                totalReferrals: results.length
            },
            referrals: results
        });
    });
});

// === ADMIN API: Get All Referrals & Partners for Admin Panel ===
app.get('/api/admin/referrals', (req, res) => {
    const referralsQuery = 'SELECT * FROM referrals ORDER BY created_at DESC';
    db.query(referralsQuery, (err, referrals) => {
        if (err) {
            console.error('Error fetching admin referrals:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }

        const partnersQuery = 'SELECT fullname as name, email FROM users';
        db.query(partnersQuery, (err, partners) => {
            if (err) {
                console.error('Error fetching partners:', err);
                return res.status(500).json({ success: false, message: 'Database error.' });
            }

            // Calculate score/points for each partner
            const partnersWithPoints = partners.map(partner => {
                const userReferrals = referrals.filter(r => r.user_email === partner.email);
                let points = 0;
                userReferrals.forEach(r => {
                    points += 10; // Submission point
                    if (r.status === 'Approved' || r.status === 'Closed Won') {
                        points += 20; // Approval bonus
                    }
                });
                return {
                    name: partner.name,
                    email: partner.email,
                    points: points
                };
            });

            // Sort partners descending by points for leaderboard
            partnersWithPoints.sort((a, b) => b.points - a.points);

            const formattedReferrals = referrals.map(r => ({
                id: r.id,
                partner_email: r.user_email,
                client_name: r.client_name,
                company_name: r.client_name,
                service_type: r.service_type,
                status: r.status
            }));

            res.status(200).json({
                success: true,
                referrals: formattedReferrals,
                partners: partnersWithPoints
            });
        });
    });
});

// === ADMIN API: Update Referral Status (Approve / Reject) ===
app.patch('/api/admin/referrals/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ success: false, message: 'Status is required.' });
    }

    const query = 'UPDATE referrals SET status = ? WHERE id = ?';
    db.query(query, [status, id], (err, result) => {
        if (err) {
            console.error('Error updating referral status:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }

        res.status(200).json({ success: true, message: 'Referral status updated successfully!' });
    });
});

// Start Express Server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});