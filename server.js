// require('dotenv').config(); // Load environment variables from .env

// const express = require('express');
// const mysql = require('mysql2');
// const bcrypt = require('bcrypt');
// const cors = require('cors');
// const bodyParser = require('body-parser');

// const app = express();
// app.use(cors());
// app.use(bodyParser.json());

// // Serve static assets (images, CSS, JS) so users can see them
// app.use(express.static(__dirname));
// app.use('/assets', express.static('assets'));

// // Connect to Cloud MySQL Database
// const db = mysql.createConnection({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT || 11244,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASS,
//   database: process.env.DB_NAME,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

// db.connect((err) => {
//   if (err) {
//     console.error('Database connection failed:', err);
//     return;
//   }
//   console.log('Connected to Cloud MySQL Database successfully!');
// });
// require('dotenv').config(); // Load environment variables from .env

// const express = require('express');
// const mysql = require('mysql2');
// const bcrypt = require('bcrypt');
// const cors = require('cors');
// const bodyParser = require('body-parser');

// const app = express();
// app.use(cors());
// app.use(bodyParser.json());

// // Serve static assets (images, CSS, JS) so users can see them
// app.use(express.static(__dirname));
// app.use('/assets', express.static('assets'));

// // Connect to Cloud MySQL Database
// const db = mysql.createConnection({
//     host: process.env.DB_HOST,
//     port: process.env.DB_PORT || 11244,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASS,
//     database: process.env.DB_NAME,
//     ssl: {
//         rejectUnauthorized: false
//     }
// });

// db.connect((err) => {
//     if (err) {
//         console.error('Database connection failed:', err);
//         return;
//     }
//     console.log('Connected to Cloud MySQL Database successfully!');
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server running on http://localhost:${PORT}`);
// });
require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static assets (images, CSS, JS)
app.use(express.static(__dirname));
app.use('/assets', express.static('assets'));

// Connect to Cloud MySQL Database
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 11244,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to Cloud MySQL Database successfully!');
});

// Signup Route
app.post('/api/signup', async (req, res) => {
    const { fullname, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)';

        db.query(sql, [fullname, email, hashedPassword], (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ message: 'Database error while creating account.' });
            }
            res.status(200).json({ message: 'Account created successfully!' });
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});
// Login Route
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ error: 'Database error during login.' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = results[0];

        // Compare entered password with hashed password in database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Return response matching your frontend's expected properties
        res.status(200).json({
            message: 'Login successful!',
            partner: {
                id: user.id,
                name: user.fullname,
                email: user.email
            }
        });
    });
});
// Submit Referral Route
app.post('/api/submit-referral', (req, res) => {
    const { user_email, client_name, contact_person, client_email, service_type, notes } = req.body;

    if (!user_email || !client_name || !contact_person || !client_email || !service_type) {
        return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }

    const sql = `
        INSERT INTO referrals (user_email, client_name, contact_person, client_email, service_type, notes) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [user_email, client_name, contact_person, client_email, service_type, notes], (err, result) => {
        if (err) {
            console.error('Database error saving referral:', err);
            return res.status(500).json({ success: false, message: 'Database error saving referral.' });
        }

        res.status(200).json({
            success: true,
            message: 'Referral submitted successfully!',
            referralId: result.insertId
        });
    });
});
// Get Logged-in Partner's Referrals & Stats Route
app.get('/api/my-referrals', (req, res) => {
    const userEmail = req.query.email;

    if (!userEmail) {
        return res.status(400).json({ message: 'User email query parameter is required.' });
    }

    const sql = 'SELECT * FROM referrals WHERE user_email = ? ORDER BY created_at DESC';

    db.query(sql, [userEmail], (err, results) => {
        if (err) {
            console.error('Database error fetching referrals:', err);
            return res.status(500).json({ message: 'Database error fetching referrals.' });
        }

        res.status(200).json({
            referrals: results,
            stats: {
                totalReferrals: results.length
            }
        });
    });
});
// Admin Route: Get all referrals and leaderboards
app.get('/api/admin/referrals', (req, res) => {
    // 1. Fetch all referrals joined or queried
    const referralsSql = 'SELECT id, user_email AS partner_email, client_name, service_type, status, created_at FROM referrals ORDER BY created_at DESC';
    const usersSql = 'SELECT id, fullname AS name, email FROM users';

    db.query(referralsSql, (err, referrals) => {
        if (err) {
            console.error('Error fetching referrals for admin:', err);
            return res.status(500).json({ message: 'Database error.' });
        }

        db.query(usersSql, (err, users) => {
            if (err) {
                console.error('Error fetching users for admin:', err);
                return res.status(500).json({ message: 'Database error.' });
            }

            // Calculate points per user
            const partnerPoints = {};
            referrals.forEach(ref => {
                const email = ref.partner_email;
                if (!partnerPoints[email]) partnerPoints[email] = 0;

                partnerPoints[email] += 10; // 10 pts base submission
                if (ref.status === 'Approved' || ref.status === 'Closed Won') {
                    partnerPoints[email] += 20; // 20 bonus pts on approval
                }
            });

            // Format partners list for Leaderboard
            const partners = users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                points: partnerPoints[user.email] || 0
            })).sort((a, b) => b.points - a.points);

            res.status(200).json({
                referrals: referrals,
                partners: partners
            });
        });
    });
});

// Admin Route: Update referral status (Approve / Reject)
app.patch('/api/admin/referrals/:id/status', (req, res) => {
    const referralId = req.params.id;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ message: 'Status is required.' });
    }

    const sql = 'UPDATE referrals SET status = ? WHERE id = ?';
    db.query(sql, [status, referralId], (err, result) => {
        if (err) {
            console.error('Error updating status:', err);
            return res.status(500).json({ message: 'Database error updating status.' });
        }

        res.status(200).json({ message: 'Referral status updated successfully.' });
    });
});
// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});