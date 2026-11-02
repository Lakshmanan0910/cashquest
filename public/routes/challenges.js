// routes/challenges.js - browse, join and track challenges
const express = require('express');
const { db } = require('../db');
const game = require('../game');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, uc.status AS uc_status, uc.started_on, uc.completed_on
    FROM challenges c
    LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
    ORDER BY c.id`).all(req.userId);

  const challenges = rows.map(r => {
    const joined = !!r.uc_status;
    const progress = joined
      ? game.challengeProgress(req.userId, { kind: r.kind, target: r.target, started_on: r.started_on, status: r.uc_status })
      : 0;
    return {
      id: r.id, title: r.title, description: r.description, icon: r.icon, kind: r.kind,
      target: r.target, xp_reward: r.xp_reward,
      joined, status: r.uc_status || null, started_on: r.started_on || null, completed_on: r.completed_on || null,
      progress,
    };
  });
  res.json({ challenges, streak: { current: game.currentStreak(req.userId), longest: game.longestStreak(req.userId) } });
});

router.post('/:id/join', (req, res) => {
  const ch = db.prepare('SELECT id FROM challenges WHERE id = ?').get(Number(req.params.id));
  if (!ch) return res.status(404).json({ error: 'Challenge not found.' });
  const existing = db.prepare('SELECT status FROM user_challenges WHERE user_id = ? AND challenge_id = ?').get(req.userId, ch.id);
  if (existing) {
    return res.status(409).json({ error: existing.status === 'completed' ? 'You already completed this challenge.' : 'You already joined this challenge.' });
  }
  db.prepare('INSERT INTO user_challenges (user_id, challenge_id, started_on) VALUES (?,?,?)').run(req.userId, ch.id, game.todayISO());
  const rewards = game.afterChange(req.userId);
  res.status(201).json({ ok: true, rewards });
});

router.delete('/:id/leave', (req, res) => {
  const info = db.prepare("DELETE FROM user_challenges WHERE user_id = ? AND challenge_id = ? AND status = 'active'")
    .run(req.userId, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'No active challenge to leave.' });
  res.json({ ok: true });
});

module.exports = router;
