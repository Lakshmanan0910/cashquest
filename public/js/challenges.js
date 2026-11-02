// challenges.js - quests, level overview and the badge wall
(async function () {
  await bootApp('challenges');

  const progressText = c => c.kind === 'save_amount'
    ? `${inr(c.progress)} / ${inr(c.target)}`
    : `${c.progress} / ${c.target} days`;

  function questCard(c, mode) {
    const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
    let foot = '';
    if (mode === 'active') {
      foot = `<div class="bar"><i data-w="${pct}"></i></div>
        <div class="bar-row"><span>${progressText(c)}</span><button class="btn btn-danger btn-sm" data-leave="${c.id}">Leave</button></div>`;
    } else if (mode === 'available') {
      foot = `<button class="btn btn-primary btn-sm" data-join="${c.id}">Join quest</button>`;
    } else {
      foot = `<span class="ribbon">✅ Completed ${fmtDate(c.completed_on)}</span>`;
    }
    return `
      <article class="card quest">
        <div class="head"><div class="qi">${c.icon}</div>
          <div><h3>${esc(c.title)}</h3></div><span class="xp-tag">+${c.xp_reward} XP</span></div>
        <p>${esc(c.description)}</p>
        ${foot}
      </article>`;
  }

  function fill(id, emptyId, list, mode) {
    $('#' + id).innerHTML = list.map(c => questCard(c, mode)).join('');
    $('#' + emptyId).classList.toggle('hidden', list.length > 0);
  }

  async function load() {
    try {
      const [ch, prof] = await Promise.all([GET('/api/challenges'), GET('/api/profile')]);
      const u = prof.user, s = prof.stats;
      const pct = Math.round((u.xpIntoLevel / u.xpForNext) * 100);

      $('#hero').innerHTML = `
        <div class="lvl-badge"><div><small>LEVEL</small><b>${u.level}</b></div></div>
        <div class="info">
          <h2 class="grad-text">${esc(u.name)} · ${esc(u.title)}</h2>
          <div class="bar thick"><i data-w="${pct}"></i></div>
          <div class="bar-row"><span>${u.xp} XP total</span><span>${u.xpForNext - u.xpIntoLevel} XP to Level ${u.level + 1}</span></div>
          <div class="chips" style="margin-top:14px">
            <span class="chip">🔥 Streak ${ch.streak.current} (best ${ch.streak.longest})</span>
            <span class="chip">📝 ${s.transactions} logged</span>
            <span class="chip">🏦 ${inr(s.saved)} saved</span>
            <span class="chip">🎯 ${s.goalsDone} goal${s.goalsDone === 1 ? '' : 's'} done</span>
            <span class="chip">🏆 ${s.challengesDone} quest${s.challengesDone === 1 ? '' : 's'} done</span>
          </div>
        </div>`;

      fill('active', 'noActive', ch.challenges.filter(c => c.joined && c.status === 'active'), 'active');
      fill('available', 'noAvail', ch.challenges.filter(c => !c.joined), 'available');
      fill('done', 'noDone', ch.challenges.filter(c => c.status === 'completed'), 'done');

      const earned = prof.badges.filter(b => b.earned).length;
      $('#badgeCount').textContent = `${earned} of ${prof.badges.length} earned`;
      $('#badges').innerHTML = prof.badges.map(b => `
        <div class="badge ${b.earned ? 'earned' : 'locked'}" title="${esc(b.desc)}">
          <div class="bi">${b.earned ? b.icon : '🔒'}</div>
          <b>${esc(b.name)}</b>
          <span>${b.earned ? 'Earned ' + fmtDate(b.earned_on) : esc(b.desc)}</span>
        </div>`).join('');
      fillBars();
      refreshNavLevel();
    } catch (e) { toast(esc(e.message), 'error', '⚠️'); }
  }

  document.addEventListener('click', async e => {
    const j = e.target.closest('[data-join]');
    const l = e.target.closest('[data-leave]');
    try {
      if (j) {
        j.disabled = true;
        const res = await POST(`/api/challenges/${j.dataset.join}/join`);
        toast('Quest joined! Good luck.', 'success', '⚔️');
        celebrate(res.rewards);
        load();
      } else if (l) {
        if (!confirm('Leave this quest? Your progress on it will be lost.')) return;
        await DEL(`/api/challenges/${l.dataset.leave}/leave`);
        toast('You left the quest', 'info', '👋');
        load();
      }
    } catch (ex) { toast(esc(ex.message), 'error', '⚠️'); if (j) j.disabled = false; }
  });

  load();
})();
