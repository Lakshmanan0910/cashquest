// routes/goals.js - savings goals ("wishlist") and moving money into them
const express = require('express');
const { db, toISO } = require('../db');
const game = require('../game');
const { parseAmount, isValidDate, cleanText, round2, walletBalance } = require('../lib');

const router = express.Router();

function decorate(userId, g) {
  const remaining = round2(Math.max(g.target_amount - g.saved_amount, 0));
  const percent = Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100));

  // saving pace over the last 28 days -> estimated weeks left
  const since = new Date(); since.setDate(since.getDate() - 28);
  const recent = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ? AND date >= ?')
    .get(userId, toISO(since)).s;
  const perWeek = recent / 4;
  const weeksNeeded = g.status === 'completed' || remaining === 0 ? 0
    : perWeek > 0 ? Math.ceil(remaining / perWeek) : null;

  let daysLeft = null, perWeekNeeded = null;
  if (g.target_date && g.status === 'active') {
    daysLeft = Math.ceil((Date.parse(g.target_date + 'T00:00:00Z') - Date.parse(game.todayISO() + 'T00:00:00Z')) / 86400000);
    if (daysLeft > 0) perWeekNeeded = round2(remaining / (daysLeft / 7));
  }
  return { ...g, remaining, percent, weeksNeeded, daysLeft, perWeekNeeded };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY status ASC, created_at DESC, id DESC').all(req.userId);
  res.json({ goals: rows.map(g => decorate(req.userId, g)), wallet: walletBalance(req.userId) });
});

router.post('/', (req, res) => {
  const title = cleanText(req.body.title, 40);
  const emoji = cleanText(req.body.emoji, 8) || '🎯';
  const target = parseAmount(req.body.target_amount);
  const targetDate = req.body.target_date ? String(req.body.target_date) : null;

  if (title.length < 2) return res.status(400).json({ error: 'Give your goal a name (at least 2 letters).' });
  if (target === null) return res.status(400).json({ error: 'Enter a target amount greater than 0.' });
  if (targetDate && !isValidDate(targetDate)) return res.status(400).json({ error: 'Enter a valid target date.' });
  if (targetDate && targetDate <= game.todayISO()) return res.status(400).json({ error: 'The target date must be in the future.' });

  const id = db.prepare('INSERT INTO goals (user_id, title, emoji, target_amount, target_date) VALUES (?,?,?,?,?)')
    .run(req.userId, title, emoji, target, targetDate).lastInsertRowid;
  res.status(201).json({ id });
});

router.post('/:id/contribute', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  if (goal.status === 'completed') return res.status(400).json({ error: 'This goal is already complete. 🎉' });

  const amount = parseAmount(req.body.amount);
  if (amount === null) return res.status(400).json({ error: 'Enter an amount greater than 0.' });

  const remaining = round2(goal.target_amount - goal.saved_amount);
  if (amount > remaining) return res.status(400).json({ error: `Only ₹${remaining} left to reach this goal.` });
  const wallet = walletBalance(req.userId);
  if (amount > wallet) return res.status(400).json({ error: `Not enough in your wallet (you have ₹${wallet}).` });

  const today = game.todayISO();
  let completed = false;
  db.transaction(() => {
    db.prepare('INSERT INTO goal_contributions (goal_id, user_id, amount, date) VALUES (?,?,?,?)')
      .run(goal.id, req.userId, amount, today);
    const saved = round2(goal.saved_amount + amount);
    completed = saved >= goal.target_amount;
    db.prepare("UPDATE goals SET saved_amount = ?, status = ?, completed_on = ? WHERE id = ?")
      .run(saved, completed ? 'completed' : 'active', completed ? today : null, goal.id);
  })();

  const rewards = game.afterChange(req.userId);
  res.json({ ok: true, completed, rewards });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Goal not found.' });
  game.afterChange(req.userId);
  res.json({ ok: true });
});

module.exports = router;
