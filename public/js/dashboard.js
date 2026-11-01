// dashboard.js - the home screen after login
(async function () {
  const user = await bootApp('dashboard');
  setupCharts();
  $('#hello').textContent = `Hey ${user.name} 👋`;
  let donut = null;

  function renderLevel(d) {
    const u = d.user;
    const pct = Math.round((u.xpIntoLevel / u.xpForNext) * 100);
    $('#levelCard').innerHTML = `
      <div class="lvl-badge"><div><small>LEVEL</small><b>${u.level}</b></div></div>
      <div class="info">
        <h2 class="grad-text">${esc(u.title)}</h2>
        <div class="bar thick"><i data-w="${pct}"></i></div>
        <div class="bar-row"><span>${u.xpIntoLevel} / ${u.xpForNext} XP</span><span>${u.xpForNext - u.xpIntoLevel} XP to Level ${u.level + 1}</span></div>
      </div>
      <div class="chips">
        <span class="chip">🔥 ${d.streak}-day streak</span>
        <span class="chip">🏅 ${d.badgeCount} badge${d.badgeCount === 1 ? '' : 's'}</span>
        <a class="chip" href="/challenges.html">View quests →</a>
      </div>`;
  }

  function renderStats(d) {
    const m = d.month;
    const stats = [
      ['👛', 'Wallet balance', inr(d.wallet), d.wallet < 0 ? 'neg' : 'pos', 'Money you can spend or save', '--accent:#2cffa5'],
      ['💸', 'Spent this month', inr(m.spent), '', `of ${inr(m.budget)} budget`, '--accent:#ff3d9a'],
      ['💰', 'Income this month', inr(m.income), 'pos', 'Pocket money, gifts & more', '--accent:#22e4ff'],
      ['🏦', 'Saved in goals', inr(d.savedTotal), '', 'Across all your goals', '--accent:#8b5cf6'],
    ];
    $('#stats').innerHTML = stats.map(([i, l, v, c, h, a]) =>
      `<div class="card stat" style="${a}"><div class="label">${i} ${l}</div><div class="value ${c}">${v}</div><div class="hint">${h}</div></div>`).join('');
  }

  function renderBudget(d) {
    const m = d.month;
    const msg = {
      ok: '👍 You are on track. Keep it up!',
      warning: `⚠️ Careful! You have used ${m.percent}% of your budget.`,
      over: `🚨 You are ${inr(Math.abs(m.left))} over budget.`,
    }[m.status];
    $('#budgetCard').innerHTML = `
      <h2>🛡️ Monthly budget <button class="btn btn-ghost btn-sm sub" id="editBudget" style="margin-left:auto">Change</button></h2>
      <div class="bar thick ${m.status}"><i data-w="${Math.min(100, m.percent)}"></i></div>
      <div class="bar-row"><span>${inr(m.spent)} spent</span><span>${inr(m.budget)} budget</span></div>
      <p style="margin-top:14px;font-weight:500">${msg}</p>
      <p class="muted" style="font-size:.85rem;margin-top:4px">
        ${m.left >= 0 ? `${inr(m.left)} left` : 'No budget left'} · ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'} to go ·
        at this pace you will spend about <b>${inr(Math.round(m.projected))}</b> this month.</p>
      <form id="budgetForm" class="hidden" style="display:flex;gap:8px;margin-top:14px">
        <input type="number" min="1" step="1" id="budgetInput" value="${m.budget}" />
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
      </form>`;
    $('#budgetForm').classList.add('hidden');
    $('#editBudget').addEventListener('click', () => $('#budgetForm').classList.toggle('hidden'));
    $('#budgetForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await PUT('/api/budget', { monthly_budget: $('#budgetInput').value });
        toast('Budget updated', 'success', '🛡️');
        load();
      } catch (ex) { toast(esc(ex.message), 'error', '⚠️'); }
    });
  }

  function renderDonut(rep) {
    const has = rep.byCategory.length > 0;
    $('#donutEmpty').classList.toggle('hidden', has);
    $('.chart-box', $('#donut').closest('.card')).classList.toggle('hidden', !has);
    if (donut) { donut.destroy(); donut = null; }
    if (!has) return;
    donut = new Chart($('#donut'), {
      type: 'doughnut',
      data: {
        labels: rep.byCategory.map(c => `${c.icon} ${c.name}`),
        datasets: [{ data: rep.byCategory.map(c => c.total), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 8 }],
      },
      options: { cutout: '64%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => ` ${inr(c.parsed)}` } } } },
    });
  }

  function renderRecent(d) {
    $('#recent').innerHTML = d.recent.length ? d.recent.map(t => `
      <div class="row"><div class="ico">${t.icon}</div>
        <div class="meta"><b>${esc(t.note || t.category)}</b><span>${esc(t.category)} · ${fmtDate(t.date)}</span></div>
        <div class="amt ${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '-'}${inr(t.amount)}</div></div>`).join('')
      : '<p class="empty"><span class="big">✨</span>Nothing yet. Add your first transaction to earn XP!</p>';
  }

  function renderGoals(d) {
    $('#goals').innerHTML = d.goals.length ? d.goals.map(g => `
      <div style="padding:8px 6px">
        <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:6px"><span>${esc(g.emoji)} ${esc(g.title)}</span><b class="mono" style="font-size:.8rem">${g.percent}%</b></div>
        <div class="bar"><i data-w="${g.percent}"></i></div>
        <div class="bar-row"><span>${inr(g.saved_amount)}</span><span>${inr(g.target_amount)}</span></div>
      </div>`).join('')
      : '<p class="empty"><span class="big">🎯</span>No active goals. <a href="/goals.html">Create one</a>!</p>';
  }

  async function load() {
    const [d, rep] = await Promise.all([GET('/api/dashboard'), GET('/api/reports')]);
    renderLevel(d); renderStats(d); renderBudget(d); renderDonut(rep); renderRecent(d); renderGoals(d);
    fillBars();
  }

  try {
    await buildTxnForm($('#quickAdd'), load);
    await load();
  } catch (e) { toast(esc(e.message), 'error', '⚠️'); }
})();
