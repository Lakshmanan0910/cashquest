// reports.js - charts for any month (Chart.js is bundled in /js/vendor, so it works offline)
(async function () {
  await bootApp('reports');
  setupCharts();
  const monthInput = $('#month');
  const charts = {};
  function draw(key, canvas, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
  }
  const money = c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${inr(c.parsed.y ?? c.parsed)}`;

  function render(r) {
    // stat cards
    const stats = [
      ['💸', 'Total spent', inr(r.totalSpent), 'neg', '--accent:#ff3d9a'],
      ['💰', 'Income', inr(r.income), 'pos', '--accent:#2cffa5'],
      ['📆', 'Average per spending day', inr(Math.round(r.avgPerSpendDay)), '', '--accent:#22e4ff'],
      ['🧨', 'Biggest purchase', r.biggest ? inr(r.biggest.amount) : '—', '', '--accent:#ffc23d'],
    ];
    $('#stats').innerHTML = stats.map(([i, l, v, c, a], idx) => `
      <div class="card stat" style="${a}"><div class="label">${i} ${l}</div><div class="value ${c}">${v}</div>
      <div class="hint">${idx === 3 && r.biggest ? esc(r.biggest.icon + ' ' + (r.biggest.note || r.biggest.category)) : idx === 0 ? `Budget ${inr(r.budget)}` : '&nbsp;'}</div></div>`).join('');

    // 6-month bar chart
    draw('trend', $('#trend'), {
      type: 'bar',
      data: {
        labels: r.trend.map(t => t.label),
        datasets: [
          { label: 'Income', data: r.trend.map(t => t.income), backgroundColor: '#2cffa5', borderRadius: 6 },
          { label: 'Spent', data: r.trend.map(t => t.expense), backgroundColor: '#ff3d9a', borderRadius: 6 },
        ],
      },
      options: { scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
                 plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${inr(c.parsed.y)}` } } } },
    });

    // category doughnut + legend
    const has = r.byCategory.length > 0;
    $('#donutEmpty').classList.toggle('hidden', has);
    $('#donut').closest('.chart-box').classList.toggle('hidden', !has);
    if (has) {
      draw('donut', $('#donut'), {
        type: 'doughnut',
        data: { labels: r.byCategory.map(c => c.name),
                datasets: [{ data: r.byCategory.map(c => c.total), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 6 }] },
        options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${inr(c.parsed)}` } } } },
      });
    } else if (charts.donut) { charts.donut.destroy(); charts.donut = null; }
    $('#legend').innerHTML = r.byCategory.map((c, i) => `
      <div class="row"><span class="dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        <div class="meta"><b>${c.icon} ${esc(c.name)}</b></div><div class="amt" style="font-size:.8rem">${inr(c.total)} · ${c.percent}%</div></div>`).join('');

    // daily line chart
    $('#dailyLabel').textContent = new Date(r.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    draw('daily', $('#daily'), {
      type: 'line',
      data: { labels: r.days.map(d => d.day),
              datasets: [{ label: 'Spent', data: r.days.map(d => d.spent), borderColor: '#22e4ff', backgroundColor: 'rgba(34,228,255,.18)',
                           fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#22e4ff' }] },
      options: { scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } }, x: { title: { display: true, text: 'Day of month' } } },
                 plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${inr(c.parsed.y)}` } } } },
    });

    $('#insights').innerHTML = r.insights.map(t => `<li>${esc(t)}</li>`).join('');
  }

  async function load() {
    try {
      const r = await GET('/api/reports?month=' + encodeURIComponent(monthInput.value || ''));
      if (!monthInput.value) monthInput.value = r.month;
      render(r);
    } catch (e) { toast(esc(e.message), 'error', '⚠️'); }
  }
  monthInput.addEventListener('change', load);
  load();
})();
