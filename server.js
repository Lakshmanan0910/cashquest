// server.js - CashQuest back-end (Express + SQLite)
// Run with:  npm start      then open  http://localhost:3000
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

require('./db'); // creates tables + demo data on first run
const { requireAuth } = require('./lib');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // hosting services put a proxy in front of the app
app.use(express.json({ limit: '50kb' }));

// Health check: used by the host and by uptime pingers to keep the site awake.
app.get('/health', (req, res) => res.json({ ok: true }));

// Sessions keep you logged in. (Stored in memory: restarting the server logs everyone out,
// which is perfectly fine for a college project. Your DATA stays safe in cashquest.db.)
app.use(session({
  name: 'cashquest.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// ---- API ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/transactions', requireAuth, require('./routes/transactions'));
app.use('/api/goals', requireAuth, require('./routes/goals'));
app.use('/api/challenges', requireAuth, require('./routes/challenges'));
app.use('/api', requireAuth, require('./routes/dashboard'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Front-end (HTML / CSS / JS / images) ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Error handler ----
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(PORT, () => {
  const { db } = require('./db');
  console.log('\n  Database file: ' + db.name);
  console.log('  Accounts stored: ' + db.prepare('SELECT COUNT(*) c FROM users').get().c);
  console.log('\n  CashQuest is running  ->  http://localhost:' + PORT);
  console.log('  Demo login: demo@cashquest.com / demo123\n');
});
