// game.js - the "game engine" of CashQuest: XP, levels, badges, streaks and challenge progress.
//
// XP is always CALCULATED from the user's real data (not just added up), so it can never be
// farmed by adding and deleting entries. Rules:
//   +5 XP   for each logged transaction (first 3 per day)
//   +1 XP   for every ₹25 moved into goals
//   +100 XP for every completed goal
//   +reward for every completed challenge
//   +25 XP  for every badge earned
const { db, toISO } = require('./db');

const BADGES = {
  first_step:  { name: 'First Step',   icon: '👣', desc: 'Record your first transaction' },
  saver:       { name: 'Saver',        icon: '🐷', desc: 'Move money into a goal for the first time' },
  streak_3:    { name: 'On a Roll',    icon: '🔥', desc: 'Log transactions 3 days in a row' },
  streak_7:    { name: 'Week Warrior', icon: '⚡', desc: 'Log transactions 7 days in a row' },
  big_saver:   { name: 'Big Saver',    icon: '💎', desc: 'Save ₹1,000 in total' },
  goal_getter: { name: 'Goal Getter',  icon: '🏆', desc: 'Complete a savings goal' },
  challenger:  { name: 'Challenger',   icon: '🎯', desc: 'Complete a challenge' },
  budget_boss: { name: 'Budget Boss',  icon: '🛡️', desc: 'Finish a month within your budget' },
  level_5:     { name: 'Rising Star',  icon: '⭐', desc: 'Reach level 5' },
};

const LEVEL_TITLES = ['Rookie', 'Penny Pincher', 'Smart Spender', 'Saver', 'Hustler', 'Strategist',
                      'Money Master', 'Wealth Wizard', 'Legend'];

function todayISO() { return toISO(new Date()); }

function levelInfo(xp) {
  const level = Math.floor(xp / 100) + 1;
  return {
    xp,
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpIntoLevel: xp % 100,
    xpForNext: 100,
  };
}

// ------------------------------------------------------------------ streaks
function txDates(userId) {
  return db.prepare('SELECT DISTINCT date FROM transactions WHERE user_id = ? ORDER BY date').all(userId)
    .map(r => r.date);
}

function dayDiff(a, b) { // whole days between two ISO dates (b - a)
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function longestStreak(userId) {
  const dates = txDates(userId);
  let best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Current streak: consecutive days with a transaction, ending today (or yesterday).
function currentStreak(userId) {
  const set = new Set(txDates(userId));
  const d = new Date();
  if (!set.has(toISO(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(toISO(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ------------------------------------------------------------------ challenges
function challengeProgress(userId, uc) {
  // uc = { kind, target, started_on, status }
  if (uc.status === 'completed') return uc.target;
  const today = todayISO();
  let value = 0;
  if (uc.kind === 'save_amount') {
    value = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ? AND date >= ?')
      .get(userId, uc.started_on).s;
  } else if (uc.kind === 'log_days') {
    value = db.prepare('SELECT COUNT(DISTINCT date) c FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?')
      .get(userId, uc.started_on, today).c;
  } else if (uc.kind === 'no_spend_days') {
    // count fully finished days (started day .. yesterday) that have no expense at all
    const spent = new Set(
      db.prepare("SELECT DISTINCT date FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ?")
        .all(userId, uc.started_on).map(r => r.date)
    );
    const d = new Date(uc.started_on + 'T00:00:00');
    while (toISO(d) < today) {
      if (!spent.has(toISO(d))) value++;
      d.setDate(d.getDate() + 1);
    }
  }
  return Math.min(value, uc.target);
}

function checkChallenges(userId) {
  const rows = db.prepare(`
    SELECT uc.id, uc.started_on, uc.status, c.kind, c.target, c.title, c.icon, c.xp_reward
    FROM user_challenges uc JOIN challenges c ON c.id = uc.challenge_id
    WHERE uc.user_id = ? AND uc.status = 'active'`).all(userId);
  const done = [];
  for (const r of rows) {
    if (challengeProgress(userId, r) >= r.target) {
      db.prepare("UPDATE user_challenges SET status = 'completed', completed_on = ? WHERE id = ?")
        .run(todayISO(), r.id);
      done.push({ title: r.title, icon: r.icon, xp: r.xp_reward });
    }
  }
  return done;
}

// ------------------------------------------------------------------ badges
function monthWithinBudget(userId) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const row = db.prepare(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM transactions
                          WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?`)
    .get(userId, toISO(first), toISO(last));
  const budget = db.prepare('SELECT monthly_budget b FROM users WHERE id = ?').get(userId).b;
  return row.c > 0 && row.s <= budget;
}

function checkBadges(userId) {
  const has = new Set(db.prepare('SELECT code FROM badges WHERE user_id = ?').all(userId).map(r => r.code));
  const earned = [];
  const give = code => {
    if (has.has(code)) return;
    db.prepare('INSERT OR IGNORE INTO badges (user_id, code, earned_on) VALUES (?,?,?)')
      .run(userId, code, todayISO());
    has.add(code);
    earned.push({ code, ...BADGES[code] });
  };

  const txCount = db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ?').get(userId).c;
  const contributed = db.prepare('SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM goal_contributions WHERE user_id = ?').get(userId);
  const goalsDone = db.prepare("SELECT COUNT(*) c FROM goals WHERE user_id = ? AND status = 'completed'").get(userId).c;
  const challengesDone = db.prepare("SELECT COUNT(*) c FROM user_challenges WHERE user_id = ? AND status = 'completed'").get(userId).c;
  const streak = longestStreak(userId);

  if (txCount >= 1) give('first_step');
  if (contributed.c >= 1) give('saver');
  if (streak >= 3) give('streak_3');
  if (streak >= 7) give('streak_7');
  if (contributed.s >= 1000) give('big_saver');
  if (goalsDone >= 1) give('goal_getter');
  if (challengesDone >= 1) give('challenger');
  if (monthWithinBudget(userId)) give('budget_boss');

  // Level badge depends on XP, which depends on the other badges, so settle it last.
  if (levelInfo(computeXp(userId)).level >= 5) give('level_5');
  return earned;
}

// ------------------------------------------------------------------ XP
function computeXp(userId) {
  const logging = db.prepare(`
    SELECT COALESCE(SUM(MIN(n, 3)), 0) * 5 AS xp
    FROM (SELECT COUNT(*) n FROM transactions WHERE user_id = ? GROUP BY date)`).get(userId).xp;
  const saved = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE user_id = ?').get(userId).s;
  const goals = db.prepare("SELECT COUNT(*) c FROM goals WHERE user_id = ? AND status = 'completed'").get(userId).c;
  const challenges = db.prepare(`SELECT COALESCE(SUM(c.xp_reward),0) s FROM user_challenges uc
                                 JOIN challenges c ON c.id = uc.challenge_id
                                 WHERE uc.user_id = ? AND uc.status = 'completed'`).get(userId).s;
  const badges = db.prepare('SELECT COUNT(*) c FROM badges WHERE user_id = ?').get(userId).c;
  return logging + Math.floor(saved / 25) + goals * 100 + challenges + badges * 25;
}

// ------------------------------------------------------------------ main entry point
// Call after ANY change to the user's data. Returns what the user just earned (for the pop-up toast).
function afterChange(userId) {
  const before = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId).xp;
  const completedChallenges = checkChallenges(userId);
  const newBadges = checkBadges(userId);
  const xp = computeXp(userId);
  db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(xp, userId);
  const prev = levelInfo(before), now = levelInfo(xp);
  return {
    xpGained: xp - before,
    xp,
    level: now.level,
    title: now.title,
    levelUp: now.level > prev.level,
    newBadges,
    completedChallenges,
  };
}

module.exports = {
  BADGES, levelInfo, todayISO, currentStreak, longestStreak,
  challengeProgress, afterChange, recalculateEverything: afterChange,
};
