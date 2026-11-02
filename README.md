# 🪙 CashQuest: Gamified Pocket Money & Savings Tracker

A full-stack web project. Track pocket money and spending, set savings goals, earn **XP, levels, streaks and badges**, and take on **quests**.

**Tech stack**

| Layer | Technology |
|---|---|
| Front-end | HTML5, CSS3, vanilla JavaScript, Chart.js (bundled, works offline) |
| Back-end | Node.js + Express 5 (REST API), express-session |
| Database | SQLite (one file: `cashquest.db`, created automatically) |
| Security | Passwords hashed with bcrypt, parameterised SQL queries, HTML escaping on output, server-side validation |

---

## ▶️ How to run it in VS Code (5 minutes)

1. Install **Node.js 20 or newer (LTS)** from https://nodejs.org (skip if `node -v` already shows 20+).
2. Unzip the project and open the **`cashquest`** folder in VS Code (*File → Open Folder*).
3. Open the terminal in VS Code (**Ctrl + `**) and run:
   ```bash
   npm install
   npm start
   ```
4. Open **http://localhost:3000** in your browser.
5. **Demo login:** `demo@cashquest.com` / `demo123` (or click *Use the demo account*). You can also create your own account.

> ⚠️ **Always open the site at http://localhost:3000 after running `npm start`.** Do not double-click `index.html` and do not use Live Server. The pages need the Node server and database behind them. If you do, the page shows a "Start the CashQuest server first" message.
>
> **Windows shortcut:** double-click **`start.bat`**. It installs, starts the server and opens the browser for you.

To stop the server press **Ctrl + C**. To reset all data back to the demo data: `npm run reset-db`, then `npm start`.

Recommended VS Code extensions: *SQLite Viewer* (to open `cashquest.db` and show your database in the viva) and *Prettier*.

### If something goes wrong
| Problem | Fix |
|---|---|
| `npm install` fails on `better-sqlite3` | Your Node is too old. Install Node 20+ LTS, delete the `node_modules` folder, then run `npm install` again. |
| "Port 3000 already in use" | Run `PORT=3001 npm start` (Mac/Linux) or `$env:PORT=3001; npm start` (Windows PowerShell). |
| Login says "No account found" or "Incorrect password" | The message tells you which part is wrong. The server terminal also prints a `[login] FAILED ...` line. Tick *Show password* to check what you typed. The `Accounts stored:` line printed when the server starts shows how many accounts are in the database. The demo account always works. |
| Fonts look plain | The fancy fonts load from Google Fonts and need internet. Everything else works offline. |

---

## 🌐 Deploying online (so a reviewer can open a link)

1. Push the project to a GitHub repository (without `node_modules` and `cashquest.db`).
2. On https://render.com choose **New → Blueprint** (it reads `render.yaml`) or **New → Web Service** with build command `npm install` and start command `npm start`.
3. Open the `https://....onrender.com` link. The demo login `demo@cashquest.com` / `demo123` works straight away.
4. Keep the site awake: create a free monitor at https://uptimerobot.com that pings `https://YOUR-LINK/health` every 5 minutes.

Free hosting has a temporary disk, so accounts created online disappear when the server restarts. The demo account is re-created automatically. To keep data, attach a persistent disk and set the environment variable `DB_PATH=/data/cashquest.db`.

## 📄 Pages (8)

| Page | File | What it does |
|---|---|---|
| Home / landing | `index.html` | Hero background, features, how it works |
| Login | `login.html` | Log in or use the demo account |
| Sign up | `register.html` | Create an account (validated) |
| Dashboard | `dashboard.html` | Level & XP, wallet, budget meter, quick add, spending chart, recent activity |
| Money | `transactions.html` | Add income/expenses; search & filter the history; delete |
| Goals | `goals.html` | Create savings goals, move money into them, countdown and "₹ per week" hints |
| Reports | `reports.html` | 3 charts for any month and plain-English insights |
| Quests & badges | `challenges.html` | Join quests, track progress, badge wall |

Every page has its **own background picture** (`public/img/*.svg`).

## 🗄️ Database tables (SQLite)

`users` · `categories` · `transactions` · `goals` · `goal_contributions` · `challenges` · `user_challenges` · `badges`

Relationships: a user has many transactions, goals, joined challenges and badges. A goal has many contributions. A transaction belongs to a category.
The schema is in `db.js`.

## 🔌 REST API (all `/api/...`, JSON)

| Method & path | Purpose |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Accounts & session |
| `GET /dashboard`, `GET /reports?month=YYYY-MM`, `GET /profile` | Numbers for the pages |
| `GET /categories`, `PUT /budget` | Lookup data, monthly budget |
| `GET/POST /transactions`, `DELETE /transactions/:id` | Income & expenses (filters: type, category, month, search) |
| `GET/POST /goals`, `POST /goals/:id/contribute`, `DELETE /goals/:id` | Savings goals |
| `GET /challenges`, `POST /challenges/:id/join`, `DELETE /challenges/:id/leave` | Quests |

## 🎮 Game rules (in `game.js`)

- **XP** is *calculated from real data*, so it cannot be farmed by adding and deleting entries:
  +5 XP per logged transaction (first 3 per day) · +1 XP per ₹25 moved into goals · +100 per completed goal · quest reward per completed quest · +25 per badge.
- **Level** = 1 level per 100 XP (Rookie → Penny Pincher → … → Legend).
- **Streak** = consecutive days with at least one transaction.
- **Wallet balance** = income − expenses − money moved into goals.
- **Budget alert** turns amber at 80% and red at 100%.
- Quest progress counts from the day you join, so savings you made earlier *the same day* also count.

## 📁 Folder structure

```
cashquest/
├── server.js          Express app: sessions, routes, static files
├── db.js              SQLite schema + demo data
├── game.js            XP, levels, streaks, badges, quests
├── lib.js             Validation helpers & wallet maths
├── routes/            auth, transactions, goals, challenges, dashboard
└── public/            Everything the browser loads
    ├── *.html         The 8 pages
    ├── css/style.css  One shared stylesheet (dark neon theme)
    ├── js/            app.js (shared) + one script per page
    └── img/           Background pictures
```

## 🖼️ Using your own background photos

Drop photos into `public/img/` and change the `url('/img/....svg')` lines at the top of `public/css/style.css` (the `.bg-home`, `.bg-auth`, `.bg-dashboard` … rules). The dark gradient layered on top keeps text readable.

## 🎤 Likely viva questions

- **Why SQLite?** A real SQL database in a single file, with nothing to install. It is perfect for a project of this size.
- **How is the password stored?** Hashed with bcrypt. The real password is never saved.
- **How do front-end and back-end talk?** The JavaScript in the browser uses `fetch()` to call the REST API. The server returns JSON and the page draws it.
- **How do you stop SQL injection?** All queries use `?` placeholders (prepared statements).
- **How do you stop XSS?** User text is escaped with `esc()` before it is shown.
- **How does login persist?** A session cookie (`express-session`). Pages other than the public ones redirect to login when there is no session.
