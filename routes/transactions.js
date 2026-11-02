// routes/transactions.js - add, list, delete income & expenses
const express = require('express');
const { db } = require('../db');
const game = require('../game');
const { parseAmount, isValidDate, cleanText, round2 } = require('../lib');

const router = express.Router();

router.get('/', (req, res) => {
  const where = ['t.user_id = ?'];
  const args = [req.userId];

  if (req.query.type === 'income' || req.query.type === 'expense') { where.push('t.type = ?'); args.push(req.query.type); }
  if (/^\d+$/.test(req.query.category_id || '')) { where.push('t.category_id = ?'); args.push(Number(req.query.category_id)); }
  if (/^\d{4}-\d{2}$/.test(req.query.month || '')) { where.push("substr(t.date, 1, 7) = ?"); args.push(req.query.month); }
  const q = cleanText(req.query.q, 60);
  if (q) { where.push('t.note LIKE ?'); args.push('%' + q.replace(/[%_]/g, '') + '%'); }

  const rows = db.prepare(`
    SELECT t.id, t.type, t.amount, t.note, t.date, c.id AS category_id, c.name AS category, c.icon
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC LIMIT 500`).all(...args);

  const income = round2(rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0));
  const expense = round2(rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0));
  res.json({ transactions: rows, totals: { income, expense, net: round2(income - expense) }, count: rows.length });
});

router.post('/', (req, res) => {
  const type = req.body.type;
  const amount = parseAmount(req.body.amount);
  const note = cleanText(req.body.note, 80);
  const date = req.body.date || game.todayISO();
  const categoryId = Number(req.body.category_id);

  if (type !== 'income' && type !== 'expense') return res.status(400).json({ error: 'Choose income or expense.' });
  if (amount === null) return res.status(400).json({ error: 'Enter an amount greater than 0.' });
  if (!isValidDate(date)) return res.status(400).json({ error: 'Enter a valid date.' });
  if (date > game.todayISO()) return res.status(400).json({ error: 'The date cannot be in the future.' });

  const cat = db.prepare('SELECT id, type FROM categories WHERE id = ?').get(categoryId);
  if (!cat) return res.status(400).json({ error: 'Choose a category.' });
  if (cat.type !== type) return res.status(400).json({ error: `That category is for ${cat.type}, not ${type}.` });

  const id = db.prepare('INSERT INTO transactions (user_id, type, amount, category_id, note, date) VALUES (?,?,?,?,?,?)')
    .run(req.userId, type, amount, categoryId, note, date).lastInsertRowid;
  const rewards = game.afterChange(req.userId);
  res.status(201).json({ id, rewards });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Transaction not found.' });
  game.afterChange(req.userId);
  res.json({ ok: true });
});

module.exports = router;
