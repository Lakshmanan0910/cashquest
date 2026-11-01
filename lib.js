// lib.js - small helpers shared by the route files
const { db, toISO } = require('./db');
const game = require('./game');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  req.userId = req.session.userId;
  next();
}

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Returns a positive number (max 2 decimals, at most ₹1 crore) or null if invalid.
function parseAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 10000000) return null;
  return round2(n);
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && toISO(d) === s;
}

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Money in the wallet = all income - all expenses - everything moved into goals
function walletBalance(userId) {
  const inc = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'income'").get(userId).s;
  const exp = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'expense'").get(userId).s;
  const sav = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ?').get(userId).s;
  return round2(inc - exp - sav);
}

function monthBounds(ym) { // 'YYYY-MM' -> { start, end } ISO dates
  const [y, m] = ym.split('-').map(Number);
  return { start: toISO(new Date(y, m - 1, 1)), end: toISO(new Date(y, m, 0)) };
}

function currentMonth() { return game.todayISO().slice(0, 7); }

function userPayload(userId) {
  const u = db.prepare('SELECT id, name, email, xp, monthly_budget, created_at FROM users WHERE id = ?').get(userId);
  return { id: u.id, name: u.name, email: u.email, monthly_budget: u.monthly_budget,
           created_at: u.created_at, ...game.levelInfo(u.xp) };
}

module.exports = { requireAuth, round2, parseAmount, isValidDate, cleanText, walletBalance,
                   monthBounds, currentMonth, userPayload };
