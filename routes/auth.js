// routes/auth.js - register, login, logout, who am I
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { cleanText, userPayload } = require('../lib');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function startSession(req, userId, cb) {
  req.session.regenerate(err => {
    if (err) return cb(err);
    req.session.userId = userId;
    cb(null);
  });
}

router.post('/register', (req, res, next) => {
  const name = cleanText(req.body.name, 40);
  const email = cleanText(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 letters).' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'That email is already registered. Try logging in.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const id = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)').run(name, email, hash).lastInsertRowid;
  startSession(req, id, err => (err ? next(err) : res.status(201).json({ user: userPayload(id) })));
});

router.post('/login', (req, res, next) => {
  const email = cleanText(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password) return res.status(400).json({ error: 'Please enter your password.' });

  // 1) is there an account with this email in the database?
  const u = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!u) {
    console.log(`[login] FAILED - no account with email "${email}"`);
    return res.status(401).json({ error: 'No account found with that email. Please sign up first.' });
  }
  // 2) does the password match the hash stored in the database?
  if (!bcrypt.compareSync(password, u.password_hash)) {
    console.log(`[login] FAILED - wrong password for "${email}"`);
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }
  console.log(`[login] OK - ${email}`);
  startSession(req, u.id, err => (err ? next(err) : res.json({ user: userPayload(u.id) })));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.session.userId);
  if (!exists) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ user: userPayload(req.session.userId) });
});

module.exports = router;
