// transactions.js - add form + filterable history table
(async function () {
  await bootApp('money');
  const cats = await getCategories();
  const fType = $('#fType'), fCat = $('#fCat'), fMonth = $('#fMonth'), fQ = $('#fQ');

  fCat.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');

  async function load() {
    const p = new URLSearchParams();
    if (fType.value) p.set('type', fType.value);
    if (fCat.value) p.set('category_id', fCat.value);
    if (fMonth.value) p.set('month', fMonth.value);
    if (fQ.value.trim()) p.set('q', fQ.value.trim());
    try {
      const data = await GET('/api/transactions?' + p.toString());
      render(data);
    } catch (e) { toast(esc(e.message), 'error', '⚠️'); }
  }

  function render(data) {
    $('#count').textContent = `${data.count} shown`;
    $('#none').classList.toggle('hidden', data.count > 0);
    $('#totals').innerHTML = `
      <span class="chip pos">💰 Income ${inr(data.totals.income)}</span>
      <span class="chip neg">💸 Spent ${inr(data.totals.expense)}</span>
      <span class="chip ${data.totals.net < 0 ? 'neg' : 'pos'}">Net ${inr(data.totals.net)}</span>`;
    $('#rows').innerHTML = data.transactions.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${t.icon} <b style="font-weight:500">${esc(t.note || t.category)}</b>${t.note ? `<br><span class="muted" style="font-size:.75rem">${esc(t.category)}</span>` : ''}</td>
        <td><span class="chip ${t.type === 'income' ? 'pos' : 'neg'}" style="padding:2px 10px;font-size:.72rem">${t.type}</span></td>
        <td class="num ${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '-'}${inr(t.amount)}</td>
        <td><button class="btn btn-danger btn-sm" data-del="${t.id}" title="Delete">✕</button></td>
      </tr>`).join('');
  }

  $('#rows').addEventListener('click', async e => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    if (!confirm('Delete this transaction?')) return;
    try {
      await DEL('/api/transactions/' + btn.dataset.del);
      toast('Transaction deleted', 'success', '🗑️');
      refreshNavLevel();
      load();
    } catch (ex) { toast(esc(ex.message), 'error', '⚠️'); }
  });

  let timer;
  [fType, fCat, fMonth].forEach(el => el.addEventListener('change', load));
  fQ.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });

  await buildTxnForm($('#addForm'), load);
  load();
})();
