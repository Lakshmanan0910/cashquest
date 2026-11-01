// db.js - SQLite database setup for CashQuest
// The whole database lives in one file: cashquest.db (created automatically).
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// On a hosting service with a persistent disk, set DB_PATH (e.g. /data/cashquest.db) to keep data.
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'cashquest.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// "node db.js --reset" deletes the database so it is rebuilt with fresh demo data
if (require.main === module && process.argv.includes('--reset')) {
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log('Database deleted. It will be recreated (with demo data) next time you run: npm start');
  process.exit(0);
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------- schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  xp              INTEGER NOT NULL DEFAULT 0,
  monthly_budget  REAL    NOT NULL DEFAULT 2000,
  created_at      TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  icon  TEXT NOT NULL,
  type  TEXT NOT NULL CHECK (type IN ('income','expense'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL CHECK (type IN ('income','expense')),
  amount       REAL    NOT NULL CHECK (amount > 0),
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  note         TEXT    NOT NULL DEFAULT '',
  date         TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS goals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  emoji          TEXT    NOT NULL DEFAULT '🎯',
  target_amount  REAL    NOT NULL CHECK (target_amount > 0),
  saved_amount   REAL    NOT NULL DEFAULT 0,
  target_date    TEXT,
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at     TEXT    NOT NULL DEFAULT (date('now')),
  completed_on   TEXT
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id   INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount    REAL    NOT NULL CHECK (amount > 0),
  date      TEXT    NOT NULL
);

-- The catalogue of challenges anyone can join
CREATE TABLE IF NOT EXISTS challenges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  icon         TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('save_amount','log_days','no_spend_days')),
  target       INTEGER NOT NULL,
  xp_reward    INTEGER NOT NULL
);

-- Challenges a user has joined, with their status
CREATE TABLE IF NOT EXISTS user_challenges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id),
  started_on    TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  completed_on  TEXT,
  UNIQUE (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,
  earned_on  TEXT    NOT NULL,
  UNIQUE (user_id, code)
);
`);

// ---------------------------------------------------------------- helpers
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

// ---------------------------------------------------------------- reference data
const CATEGORIES = [
  ['Pocket Money', '💰', 'income'],
  ['Gift', '🎁', 'income'],
  ['Part-time / Odd jobs', '🛠️', 'income'],
  ['Other Income', '➕', 'income'],
  ['Snacks & Food', '🍔', 'expense'],
  ['Games & Apps', '🎮', 'expense'],
  ['Recharge & Data', '📱', 'expense'],
  ['Travel & Fuel', '🛵', 'expense'],
  ['Outings & Movies', '🎬', 'expense'],
  ['Clothes & Sneakers', '👟', 'expense'],
  ['Study & Stationery', '📚', 'expense'],
  ['Other Expense', '🧾', 'expense'],
];

const CHALLENGES = [
  ['Save ₹500', 'Move a total of ₹500 into your goals after you join.', '🏦', 'save_amount', 500, 150],
  ['Save ₹1,000', 'Move a total of ₹1,000 into your goals after you join.', '💎', 'save_amount', 1000, 300],
  ['7-Day Logger', 'Record at least one transaction on 7 different days.', '📝', 'log_days', 7, 120],
  ['Tracker Pro', 'Record at least one transaction on 15 different days.', '📈', 'log_days', 15, 250],
  ['No-Spend Weekend', 'Complete 2 full days with zero spending.', '🧘', 'no_spend_days', 2, 100],
  ['No-Spend Week', 'Complete 5 full days with zero spending.', '🛡️', 'no_spend_days', 5, 250],
];

function seedReference() {
  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const ins = db.prepare('INSERT INTO categories (name, icon, type) VALUES (?,?,?)');
    db.transaction(() => CATEGORIES.forEach(c => ins.run(...c)))();
  }
  if (db.prepare('SELECT COUNT(*) c FROM challenges').get().c === 0) {
    const ins = db.prepare(
      'INSERT INTO challenges (title, description, icon, kind, target, xp_reward) VALUES (?,?,?,?,?,?)'
    );
    db.transaction(() => CHALLENGES.forEach(c => ins.run(...c)))();
  }
}

// ---------------------------------------------------------------- demo data
// A ready-made account so the app looks alive the first time you open it.
//   email: demo@cashquest.com    password: demo123
function seedDemo() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;

  const cat = name => db.prepare('SELECT id FROM categories WHERE name = ?').get(name).id;
  const hash = bcrypt.hashSync('demo123', 10);
  const userId = db
    .prepare('INSERT INTO users (name, email, password_hash, xp, monthly_budget, created_at) VALUES (?,?,?,?,?,?)')
    .run('Arjun', 'demo@cashquest.com', hash, 0, 3000, daysAgo(60)).lastInsertRowid;

  const addTx = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, category_id, note, date) VALUES (?,?,?,?,?,?)'
  );

  db.transaction(() => {
    // money he already had + monthly pocket money (keeps the wallet balance positive)
    addTx.run(userId, 'income', 2500, cat('Gift'), 'Festival money saved up', daysAgo(59));
    addTx.run(userId, 'income', 3000, cat('Pocket Money'), 'Monthly pocket money', daysAgo(58));
    addTx.run(userId, 'income', 3000, cat('Pocket Money'), 'Monthly pocket money', daysAgo(28));
    addTx.run(userId, 'income', 500, cat('Gift'), 'Birthday gift from uncle', daysAgo(21));
    addTx.run(userId, 'income', 400, cat('Part-time / Odd jobs'), 'Helped at the cousin\'s shop', daysAgo(9));

    // a spread of expenses across ~55 days (deterministic so it looks the same every time)
    const spend = [
      [54, 'Snacks & Food', 120, 'Samosa + cold drink'], [52, 'Recharge & Data', 299, 'Monthly recharge'],
      [50, 'Games & Apps', 150, 'Game top-up'], [47, 'Outings & Movies', 350, 'Movie with friends'],
      [45, 'Snacks & Food', 90, 'Evening snacks'], [43, 'Travel & Fuel', 200, 'Petrol'],
      [41, 'Study & Stationery', 180, 'Notebooks & pens'], [38, 'Snacks & Food', 140, 'Biryani'],
      [36, 'Games & Apps', 100, 'Skin pack'], [34, 'Clothes & Sneakers', 650, 'T-shirt'],
      [32, 'Snacks & Food', 70, 'Tea & puffs'], [30, 'Recharge & Data', 299, 'Monthly recharge'],
      [27, 'Snacks & Food', 160, 'Pizza share'], [25, 'Outings & Movies', 300, 'Bowling'],
      [23, 'Travel & Fuel', 180, 'Petrol'], [20, 'Games & Apps', 200, 'Battle pass'],
      [18, 'Snacks & Food', 85, 'Burger'], [16, 'Study & Stationery', 220, 'Record book'],
      [14, 'Snacks & Food', 110, 'Juice & chips'], [12, 'Travel & Fuel', 150, 'Petrol'],
      [10, 'Outings & Movies', 250, 'Cricket turf share'], [8, 'Snacks & Food', 95, 'Shawarma'],
      [6, 'Recharge & Data', 299, 'Monthly recharge'], [5, 'Games & Apps', 120, 'Game top-up'],
      [4, 'Snacks & Food', 60, 'Tea'], [3, 'Travel & Fuel', 100, 'Petrol'],
      [2, 'Snacks & Food', 130, 'Lunch with friends'], [1, 'Study & Stationery', 90, 'Lab manual'],
      [0, 'Snacks & Food', 75, 'Snacks'],
    ];
    spend.forEach(([d, c, a, n]) => addTx.run(userId, 'expense', a, cat(c), n, daysAgo(d)));

    // goals + contributions
    const addGoal = db.prepare(
      'INSERT INTO goals (user_id, title, emoji, target_amount, saved_amount, target_date, status, created_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    const addContribution = db.prepare(
      'INSERT INTO goal_contributions (goal_id, user_id, amount, date) VALUES (?,?,?,?)'
    );
    const future = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };

    const g1 = addGoal.run(userId, 'Gaming headphones', '🎧', 2500, 900, future(75), 'active', daysAgo(40)).lastInsertRowid;
    addContribution.run(g1, userId, 400, daysAgo(35));
    addContribution.run(g1, userId, 300, daysAgo(15));
    addContribution.run(g1, userId, 200, daysAgo(4));

    const g2 = addGoal.run(userId, 'New sneakers', '👟', 3500, 600, future(120), 'active', daysAgo(30)).lastInsertRowid;
    addContribution.run(g2, userId, 350, daysAgo(22));
    addContribution.run(g2, userId, 250, daysAgo(7));

    const g3 = addGoal.run(userId, 'Weekend trip fund', '🏍️', 1500, 1500, future(20), 'completed', daysAgo(55)).lastInsertRowid;
    db.prepare("UPDATE goals SET completed_on = ? WHERE id = ?").run(daysAgo(11), g3);
    addContribution.run(g3, userId, 800, daysAgo(40));
    addContribution.run(g3, userId, 700, daysAgo(11));

    // one challenge in progress
    db.prepare('INSERT INTO user_challenges (user_id, challenge_id, started_on) VALUES (?,?,?)')
      .run(userId, 3, daysAgo(4)); // 7-Day Logger (5 of 7 days done)
  })();

  // Let the game engine hand out the XP and badges the demo user has "earned"
  const game = require('./game');
  game.recalculateEverything(userId);
}

// Export BEFORE seeding: game.js requires this file while the demo data is being created.
module.exports = { db, toISO, daysAgo };

seedReference();
seedDemo();
