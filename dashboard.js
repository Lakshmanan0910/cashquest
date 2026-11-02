// routes/dashboard.js - numbers for the dashboard, reports, profile & budget
const express = require('express');
const { db, toISO } = require('../db');
const game = require('../game');
const { round2, walletBalance, monthBounds, currentMonth, userPayload, parseAmount } = require('../lib');

const router = express.Router();

// ------------------------------------------------------------ dashboard
router.get('/dashboard', (req, res) => {
  const uid = req.userId;
  const { start, end } = monthBounds(currentMonth());
  const sum = (type) => db.prepare(
    'SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = ? AND date >= ? AND date <= ?'
  ).get(uid, type, start, end).s;

  const spent = round2(sum('expense'));
  const income = round2(sum('income'));
  const user = userPayload(uid);
  const budget = user.monthly_budget;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  const savedTotal = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ?').get(uid).s;
  const recent = db.prepare(`
    SELECT t.id, t.type, t.amount, t.note, t.date, c.name AS category, c.icon
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 6`).all(uid);
  const goals = db.prepare("SELECT id, title, emoji, target_amount, saved_amount FROM goals WHERE user_id = ? AND status = 'active' ORDER BY (saved_amount / target_amount) DESC LIMIT 3").all(uid)
    .map(g => ({ ...g, percent: Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)) }));
  const badgeCount = db.prepare('SELECT COUNT(*) c FROM badges WHERE user_id = ?').get(uid).c;

  // budget status: ok / warning (>=80%) / over
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const status = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'ok';
  const projected = round2((spent / dayOfMonth) * daysInMonth);

  res.json({
    user,
    wallet: walletBalance(uid),
    month: { income, spent, budget, percent: Math.round(pct), status, left: round2(budget - spent),
             projected, daysLeft: daysInMonth - dayOfMonth },
    savedTotal: round2(savedTotal),
    streak: game.currentStreak(uid),
    badgeCount,
    goals,
    recent,
  });
});

// ------------------------------------------------------------ reports
router.get('/reports', (req, res) => {
  const uid = req.userId;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : currentMonth();
  const { start, end } = monthBounds(month);

  const byCategory = db.prepare(`
    SELECT c.name, c.icon, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
    GROUP BY c.id ORDER BY total DESC`).all(uid, start, end);
  const totalSpent = round2(byCategory.reduce((s, r) => s + r.total, 0));
  byCategory.forEach(r => { r.total = round2(r.total); r.percent = totalSpent ? Math.round((r.total / totalSpent) * 100) : 0; });

  // daily spend across the chosen month
  const daily = {};
  db.prepare("SELECT date, SUM(amount) s FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ? GROUP BY date")
    .all(uid, start, end).forEach(r => { daily[r.date] = round2(r.s); });
  const days = [];
  const last = Number(end.slice(8));
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    days.push({ date: iso, day: d, spent: daily[iso] || 0 });
  }

  // last 6 months income vs expense
  const [y, m] = month.split('-').map(Number);
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const b = monthBounds(toISO(d).slice(0, 7));
    const get = type => db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = ? AND date >= ? AND date <= ?')
      .get(uid, type, b.start, b.end).s;
    trend.push({ month: toISO(d).slice(0, 7), label: d.toLocaleString('en-IN', { month: 'short' }),
                 income: round2(get('income')), expense: round2(get('expense')) });
  }

  const income = trend[trend.length - 1].income;
  const biggest = db.prepare(`
    SELECT t.amount, t.note, t.date, c.name AS category, c.icon FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ? ORDER BY t.amount DESC LIMIT 1`).get(uid, start, end) || null;
  const spendDays = days.filter(d => d.spent > 0).length;
  const budget = userPayload(uid).monthly_budget;

  // plain-language insights
  const insights = [];
  if (byCategory.length) {
    insights.push(`${byCategory[0].icon} Most of your money (${byCategory[0].percent}%) went on ${byCategory[0].name}.`);
  }
  if (totalSpent > budget) insights.push(`⚠️ You went ₹${round2(totalSpent - budget)} over your ₹${budget} budget this month.`);
  else if (totalSpent > 0) insights.push(`✅ You are ₹${round2(budget - totalSpent)} under your ₹${budget} budget.`);
  if (income > 0 && totalSpent > 0) {
    const rate = Math.round(((income - totalSpent) / income) * 100);
    insights.push(rate >= 0 ? `💡 You kept ${rate}% of what you earned this month.` : `💡 You spent ${Math.abs(rate)}% more than you earned this month.`);
  }
  if (!byCategory.length) insights.push('No spending recorded for this month yet.');

  res.json({ month, totalSpent, income, budget, byCategory, days, trend, biggest,
             avgPerSpendDay: spendDays ? round2(totalSpent / spendDays) : 0, insights });
});

// ------------------------------------------------------------ lookup data
router.get('/categories', (req, res) => {
  res.json({ categories: db.prepare('SELECT id, name, icon, type FROM categories ORDER BY type DESC, id').all() });
});

// ------------------------------------------------------------ profile & budget
router.get('/profile', (req, res) => {
  const uid = req.userId;
  const earned = db.prepare('SELECT code, earned_on FROM badges WHERE user_id = ?').all(uid);
  const earnedMap = Object.fromEntries(earned.map(b => [b.code, b.earned_on]));
  const badges = Object.entries(game.BADGES).map(([code, b]) => ({
    code, ...b, earned: !!earnedMap[code], earned_on: earnedMap[code] || null,
  }));
  const stats = {
    transactions: db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ?').get(uid).c,
    goalsDone: db.prepare("SELECT COUNT(*) c FROM goals WHERE user_id = ? AND status = 'completed'").get(uid).c,
    challengesDone: db.prepare("SELECT COUNT(*) c FROM user_challenges WHERE user_id = ? AND status = 'completed'").get(uid).c,
    saved: round2(db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ?').get(uid).s),
    longestStreak: game.longestStreak(uid),
  };
  res.json({ user: userPayload(uid), badges, stats });
});

router.put('/budget', (req, res) => {
  const amount = parseAmount(req.body.monthly_budget);
  if (amount === null) return res.status(400).json({ error: 'Enter a budget greater than 0.' });
  db.prepare('UPDATE users SET monthly_budget = ? WHERE id = ?').run(amount, req.userId);
  res.json({ ok: true, monthly_budget: amount });
});

module.exports = router;
