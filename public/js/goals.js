// goals.js - create goals, move money into them, watch progress
(async function () {
  await bootApp('goals');
  const EMOJIS = ['🎧', '👟', '📱', '🎮', '🏍️', '🚲', '💻', '🎁', '✈️', '📚', '🎸', '⌚'];
  let emoji = EMOJIS[0];
  let wallet = 0;

  // ---- emoji picker
  const pick = $('#emojis');
  pick.innerHTML = EMOJIS.map((e, i) => `<button type="button" data-e="${e}" class="${i === 0 ? 'on' : ''}">${e}</button>`).join('');
  pick.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    emoji = b.dataset.e;
    $$('button', pick).forEach(x => x.classList.toggle('on', x === b));
  });
  const dateInput = $('#date');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  // ---- create goal
  $('#goalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('#gerr'); err.textContent = '';
    try {
      await POST('/api/goals', { title: f.title.value, emoji, target_amount: f.target.value, target_date: f.date.value || null });
      toast('Goal created! Time to start saving.', 'success', '🎯');
      f.reset(); load();
    } catch (ex) { err.textContent = ex.message; }
  });

  // ---- one goal card
  function card(g) {
    const done = g.status === 'completed';
    let facts = '';
    if (done) {
      facts = `<span class="ribbon">🏆 Completed on ${fmtDate(g.completed_on)}</span>`;
    } else {
      facts += `<span>💰 <b>${inr(g.remaining)}</b> still to go</span>`;
      if (g.target_date) {
        const dl = g.daysLeft;
        const txt = dl > 0 ? `${dl} day${dl === 1 ? '' : 's'} left` : dl === 0 ? 'due today' : 'date has passed';
        facts += `<span>⏰ Target ${fmtDate(g.target_date)} · <b>${txt}</b></span>`;
        if (g.perWeekNeeded) facts += `<span>📅 Save about <b>${inr(Math.ceil(g.perWeekNeeded))}</b> a week to make it</span>`;
      }
      facts += g.weeksNeeded == null
        ? '<span>⏳ Save something to see how long it will take</span>'
        : `<span>⏳ At your current pace: about <b>${g.weeksNeeded} week${g.weeksNeeded === 1 ? '' : 's'}</b></span>`;
    }
    const quick = [100, 250, 500].filter(a => a < g.remaining);
    const quickBtns = done ? '' : `<div class="quick">${quick.map(a => `<button type="button" data-amt="${a}">+₹${a}</button>`).join('')}
        <button type="button" data-amt="${g.remaining}">Finish it (${inr(g.remaining)})</button></div>`;
    const form = done ? '' : `
      <form class="contribute" data-id="${g.id}">
        <input type="number" min="1" step="1" placeholder="Amount ₹" required />
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
      </form>${quickBtns}`;
    return `
      <article class="card goal ${done ? 'done' : ''}">
        <button class="btn btn-danger btn-sm del" data-del="${g.id}" data-saved="${g.saved_amount}" title="Delete goal">✕</button>
        <div class="top">
          <div class="emoji">${esc(g.emoji)}</div>
          <div><h3>${esc(g.title)}</h3><span class="muted" style="font-size:.82rem">${inr(g.saved_amount)} of ${inr(g.target_amount)}</span></div>
          <div class="pct ${done ? 'pos' : ''}" style="margin-right:34px">${g.percent}%</div>
        </div>
        <div class="bar thick ${done ? 'ok' : ''}"><i data-w="${g.percent}"></i></div>
        <div class="facts">${facts}</div>
        ${form}
      </article>`;
  }

  async function load() {
    try {
      const data = await GET('/api/goals');
      wallet = data.wallet;
      $('#wallet').innerHTML = `👛 Wallet: <b class="${wallet < 0 ? 'neg' : 'pos'}">${inr(wallet)}</b>`;
      $('#goalGrid').innerHTML = data.goals.map(card).join('');
      $('#noGoals').classList.toggle('hidden', data.goals.length > 0);
      fillBars();
    } catch (e) { toast(esc(e.message), 'error', '⚠️'); }
  }

  // ---- clicks inside the goal grid: quick amounts, delete, contribute
  const grid = $('#goalGrid');
  grid.addEventListener('click', async e => {
    const q = e.target.closest('[data-amt]');
    if (q) { $('input', q.closest('.goal')).value = q.dataset.amt; return; }
    const d = e.target.closest('[data-del]');
    if (d) {
      const saved = Number(d.dataset.saved);
      const extra = saved > 0 ? ` The ${inr(saved)} you saved in it goes back to your wallet.` : '';
      if (!confirm('Delete this goal?' + extra)) return;
      try { await DEL('/api/goals/' + d.dataset.del); toast('Goal deleted', 'success', '🗑️'); refreshNavLevel(); load(); }
      catch (ex) { toast(esc(ex.message), 'error', '⚠️'); }
    }
  });
  grid.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target.closest('.contribute'); if (!form) return;
    const btn = $('button', form); btn.disabled = true;
    try {
      const res = await POST(`/api/goals/${form.dataset.id}/contribute`, { amount: $('input', form).value });
      if (res.completed) toast('<b>Goal complete!</b> You did it! 🎉', 'success', '🏆');
      else toast('Money added to your goal', 'success', '🏦');
      celebrate(res.rewards);
      refreshNavLevel();
      await load();
    } catch (ex) { toast(esc(ex.message), 'error', '⚠️'); btn.disabled = false; }
  });

  load();
})();
