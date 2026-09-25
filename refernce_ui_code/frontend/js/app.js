// ---------- tab switching ----------
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('on');
  });
});

// ---------- formatting helpers ----------
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (abs >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('en-IN');
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(2) + '%';
}
function monthLabel(m) {
  // Inforce.month is a YYYYM/YYYYMM period code, e.g. 20237 or 202311
  const s = String(m);
  const year = s.slice(0, 4);
  const month = s.slice(4);
  return month.padStart(2, '0') + '/' + year;
}

// ---------- Home tab ----------
function kpiCard(label, val, secondary, tone) {
  const div = document.createElement('div');
  div.className = 'card kpi' + (tone ? ' ' + tone : '');
  div.innerHTML = `<div class="lab">${label}</div><div class="val">${val}</div>` +
    (secondary ? `<div class="sec">${secondary}</div>` : '');
  return div;
}

function tile(label, val) {
  const div = document.createElement('div');
  div.className = 'card tile';
  div.innerHTML = `<div class="lab">${label}</div><div class="val">${val}</div>`;
  return div;
}

async function loadHome() {
  const [summary, trend, plans] = await Promise.all([
    fetch('/api/home/summary').then(r => r.json()),
    fetch('/api/home/trend').then(r => r.json()),
    fetch('/api/home/plans').then(r => r.json()),
  ]);

  document.getElementById('narrative').textContent = summary.narrative;

  // KPI strip
  const kpis = document.getElementById('kpis');
  kpis.innerHTML = '';
  kpis.appendChild(kpiCard('Total Policies', fmtNum(summary.total_policies)));
  kpis.appendChild(kpiCard('Total APE', fmtINR(summary.total_ape), 'Primary new-business volume metric'));
  kpis.appendChild(kpiCard('Active Book %', fmtPct(summary.active_book_pct), 'Premium paying (regular)', 'good'));
  kpis.appendChild(kpiCard('Lapse Rate', fmtPct(summary.lapse_pct), 'Policies with status = Lapsed',
    summary.lapse_pct >= 10 ? 'bad' : 'warn'));
  kpis.appendChild(kpiCard('Surrender Rate', fmtPct(summary.surrender_pct), 'Policies with status = Surrendered',
    summary.surrender_pct >= 5 ? 'bad' : 'warn'));
  kpis.appendChild(kpiCard('Persistency Rate', fmtPct(summary.persistency_paid_pct), 'Renewal-paid % — unusually low for the book', 'bad callout'));
  kpis.appendChild(kpiCard('Total Claims', fmtNum(summary.claims_count),
    `Paid ${fmtINR(summary.claims_paid_total)} · Avg ${fmtINR(summary.claims_avg_size)}`));
  kpis.appendChild(kpiCard('Active Agent Count', `${fmtNum(summary.active_agent_count)} / ${fmtNum(summary.total_sales_ids)}`,
    `Avg 1st-yr persistency ${fmtPct(summary.avg_first_year_persistency_active_agents)}`));

  // Trend chart
  const ctx = document.getElementById('trendChart');
  new Chart(ctx, {
    data: {
      labels: trend.series.map(d => monthLabel(d.month)),
      datasets: [
        {
          type: 'bar',
          label: 'Policy Count',
          data: trend.series.map(d => d.policy_count),
          backgroundColor: '#93C5FD',
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'APE (₹)',
          data: trend.series.map(d => d.ape),
          borderColor: '#1D4ED8',
          backgroundColor: '#1D4ED8',
          yAxisID: 'y1',
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { type: 'linear', position: 'left', title: { display: true, text: 'Policy Count' } },
        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'APE (₹)' } },
      },
    },
  });

  // Tiles
  const tiles = document.getElementById('tiles');
  tiles.innerHTML = '';
  const mom = summary.month_over_month;
  const momText = mom
    ? `${mom.policy_count_delta >= 0 ? '+' : ''}${mom.policy_count_delta} policies (${mom.policy_count_delta_pct}%) · ${mom.ape_delta >= 0 ? '+' : ''}${fmtINR(mom.ape_delta)} APE`
    : '—';
  tiles.appendChild(tile('New business vs. prior month', momText));
  tiles.appendChild(tile('Top plan by volume', summary.top_plan_by_volume
    ? `${summary.top_plan_by_volume.plan_name} (${fmtNum(summary.top_plan_by_volume.policy_count)})`
    : '—'));
  tiles.appendChild(tile('Pending renewals', fmtNum(summary.pending_renewals_count)));
  tiles.appendChild(tile('States with active business', fmtNum(summary.distinct_states)));

  // Per-plan table
  const tbody = document.querySelector('#planTable tbody');
  tbody.innerHTML = '';
  plans.plans.forEach(p => {
    const tr = document.createElement('tr');
    let tone = 'green';
    if (p.lapse_surrender_pct >= 20) tone = 'red';
    else if (p.lapse_surrender_pct >= 10) tone = 'amber';
    const barPct = Math.min(100, p.lapse_surrender_pct);
    const barColor = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--green)';
    tr.innerHTML = `
      <td>${p.plan_name}</td>
      <td>${p.product_type}</td>
      <td>${fmtNum(p.policy_count)}</td>
      <td>${fmtINR(p.total_ape)}</td>
      <td>${fmtINR(p.total_sum_assured)}</td>
      <td>
        <span class="badge ${tone}">${fmtPct(p.lapse_surrender_pct)}</span>
        <span class="barwrap"><span class="barfill" style="width:${barPct}%;background:${barColor}"></span></span>
      </td>
      <td>${fmtNum(p.claims_count)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// loadHome() itself is now kicked off from the auth-gated bootstrap at the
// bottom of this file, not here — see initAuthAndBoot().

// ---------- Explorer tab ----------
const explorerCharts = {};

function renderChart(canvasId, config) {
  if (explorerCharts[canvasId]) explorerCharts[canvasId].destroy();
  explorerCharts[canvasId] = new Chart(document.getElementById(canvasId), config);
}

// Closed-by-default checkbox dropdown, used for every categorical Explorer filter.
function makeDropdown(rootId, allLabel) {
  const root = document.getElementById(rootId);
  const btn = root.querySelector('.dd-btn');
  const panel = root.querySelector('.dd-panel');
  let values = [];
  let selected = new Set();

  function renderPanel() {
    panel.innerHTML = '';
    values.forEach(v => {
      const row = document.createElement('label');
      row.className = 'dd-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = v;
      cb.checked = selected.has(v);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(v); else selected.delete(v);
        updateBtnLabel();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(v));
      panel.appendChild(row);
    });
  }
  function updateBtnLabel() {
    btn.textContent = selected.size === 0 ? allLabel : `${selected.size} selected`;
    root.classList.toggle('open', panel.classList.contains('open'));
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    document.querySelectorAll('.dd-panel.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open'));
    if (willOpen) { panel.classList.add('open'); root.classList.add('open'); }
  });
  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => {
    panel.classList.remove('open');
    root.classList.remove('open');
  });

  return {
    setValues(newValues) { values = newValues; renderPanel(); updateBtnLabel(); },
    getSelected() { return Array.from(selected); },
    reset() { selected = new Set(); renderPanel(); updateBtnLabel(); },
  };
}

const explorerDropdowns = {
  plan_name: makeDropdown('dd-plan', 'All plans'),
  product_type: makeDropdown('dd-ptype', 'All types'),
  policy_status: makeDropdown('dd-status', 'All statuses'),
  state: makeDropdown('dd-state', 'All states'),
  occupation: makeDropdown('dd-occ', 'All occupations'),
  education: makeDropdown('dd-edu', 'All education levels'),
  gender: makeDropdown('dd-gender', 'All genders'),
};

async function loadExplorerFilters() {
  const opts = await fetch('/api/explorer/filters').then(r => r.json());
  explorerDropdowns.plan_name.setValues(opts.plan_name);
  explorerDropdowns.product_type.setValues(opts.product_type);
  explorerDropdowns.policy_status.setValues(opts.policy_status);
  explorerDropdowns.state.setValues(opts.state);
  explorerDropdowns.occupation.setValues(opts.occupation);
  explorerDropdowns.education.setValues(opts.education);
  explorerDropdowns.gender.setValues(opts.gender);

  const rangeDefaults = {
    'f-ppt-min': opts.ppt_range.min, 'f-ppt-max': opts.ppt_range.max,
    'f-age-min': Math.floor(opts.age_range.min), 'f-age-max': Math.ceil(opts.age_range.max),
    'f-sa-min': Math.floor(opts.sum_assured_range.min), 'f-sa-max': Math.ceil(opts.sum_assured_range.max),
    'f-ape-min': Math.floor(opts.ape_range.min), 'f-ape-max': Math.ceil(opts.ape_range.max),
  };
  Object.entries(rangeDefaults).forEach(([id, val]) => { document.getElementById(id).value = val; });

  // Track the pre-filled defaults so a range left untouched (the common case —
  // it shows the full domain, e.g. Owner Age 1-97) isn't sent as an active filter.
  // Sending it as-is would silently drop rows with a non-numeric value (e.g. the
  // 8 policies where Owner.Age = 'NA'), which the spec explicitly says not to do.
  window._explorerRangeDefaults = rangeDefaults;
}

function collectFilters() {
  // Only send a range bound if it's been moved off the pre-filled full-domain
  // default — see the note in loadExplorerFilters about why an untouched
  // range must not act as a filter.
  const numOrNull = id => {
    const v = document.getElementById(id).value;
    if (v === '') return null;
    const n = Number(v);
    const defaults = window._explorerRangeDefaults || {};
    return (id in defaults && n === defaults[id]) ? null : n;
  };
  return {
    plan_name: explorerDropdowns.plan_name.getSelected(),
    product_type: explorerDropdowns.product_type.getSelected(),
    policy_status: explorerDropdowns.policy_status.getSelected(),
    state: explorerDropdowns.state.getSelected(),
    occupation: explorerDropdowns.occupation.getSelected(),
    education: explorerDropdowns.education.getSelected(),
    gender: explorerDropdowns.gender.getSelected(),
    ppt_min: numOrNull('f-ppt-min'),
    ppt_max: numOrNull('f-ppt-max'),
    age_min: numOrNull('f-age-min'),
    age_max: numOrNull('f-age-max'),
    sum_assured_min: numOrNull('f-sa-min'),
    sum_assured_max: numOrNull('f-sa-max'),
    ape_min: numOrNull('f-ape-min'),
    ape_max: numOrNull('f-ape-max'),
  };
}

async function applyExplorerFilters() {
  const body = collectFilters();
  // Empty multi-selects mean "all" — drop empty arrays so the backend doesn't filter on them.
  Object.keys(body).forEach(k => { if (Array.isArray(body[k]) && body[k].length === 0) body[k] = null; });

  const data = await fetch('/api/explorer/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());

  const kpis = document.getElementById('explorerKpis');
  kpis.innerHTML = '';
  kpis.appendChild(kpiCard('Policy Count', fmtNum(data.kpis.policy_count)));
  kpis.appendChild(kpiCard('Total APE', fmtINR(data.kpis.total_ape)));
  kpis.appendChild(kpiCard('Lapse + Surrender %', fmtPct(data.kpis.lapse_surrender_pct),
    null, data.kpis.lapse_surrender_pct >= 15 ? 'bad' : 'warn'));
  kpis.appendChild(kpiCard('Claims Count', fmtNum(data.kpis.claims_count)));

  const noteEl = document.getElementById('explorerNote');
  if (data.note) {
    noteEl.style.display = 'block';
    noteEl.textContent = data.note;
  } else {
    noteEl.style.display = 'none';
  }

  renderChart('geoChart', {
    type: 'bar',
    data: {
      labels: data.geographic.map(d => d.state ?? 'Unknown'),
      datasets: [{ label: 'Policies', data: data.geographic.map(d => d.policy_count), backgroundColor: '#1D4ED8' }],
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } },
  });

  renderChart('ageChart', {
    type: 'bar',
    data: {
      labels: data.age_bands.map(d => d.band),
      datasets: [{ label: 'Owners', data: data.age_bands.map(d => d.owner_count), backgroundColor: '#93C5FD' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  renderChart('planMixChart', {
    type: 'doughnut',
    data: {
      labels: data.plan_mix.map(d => d.plan_name.replace('Canara HSBC Life Insurance ', '').replace('Canara HSBC ', '')),
      datasets: [{ data: data.plan_mix.map(d => d.policy_count) }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } },
  });

  renderChart('statusChart', {
    type: 'bar',
    data: {
      labels: ['Policy Status'],
      datasets: data.status_breakdown.map((d, i) => ({
        label: d.status,
        data: [d.policy_count],
        backgroundColor: ['#059669', '#D97706', '#DC2626', '#64748B'][i % 4],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });

  renderChart('explorerTrendChart', {
    data: {
      labels: data.trend.map(d => monthLabel(d.month)),
      datasets: [
        { type: 'bar', label: 'Policy Count', data: data.trend.map(d => d.policy_count), backgroundColor: '#93C5FD', yAxisID: 'y' },
        { type: 'line', label: 'APE (₹)', data: data.trend.map(d => d.ape), borderColor: '#1D4ED8', yAxisID: 'y1', tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { type: 'linear', position: 'left' },
        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
      },
    },
  });
}

document.getElementById('explorerFiltersToggle').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const collapse = document.getElementById('explorerFiltersCollapse');
  const collapsed = collapse.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.querySelector('span').textContent = collapsed ? 'Show filters' : 'Hide filters';
});

document.getElementById('applyFilters').addEventListener('click', () => applyExplorerFilters().catch(console.error));
document.getElementById('resetFilters').addEventListener('click', () => {
  Object.values(explorerDropdowns).forEach(d => d.reset());
  loadExplorerFilters().then(applyExplorerFilters).catch(console.error);
});

// loadExplorerFilters() itself is now kicked off from the auth-gated
// bootstrap at the bottom of this file, not here — see initAuthAndBoot().

// ---------- Assistant tab ----------
let chatSessionId = null;
let chatTurnCount = 0;

function formatAnswer(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let html = '';
  let inList = false;
  lines.forEach(line => {
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${line.slice(2)}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${line}</p>`;
    }
  });
  if (inList) html += '</ul>';
  return html;
}

function renderInlineChart(container, chartData, chartHint) {
  if (!chartData || !chartData.rows || !chartData.rows.length || !chartHint || chartHint === 'none') return;
  const { columns, rows } = chartData;

  const numericIdx = [];
  columns.forEach((c, i) => {
    if (rows.every(r => typeof r[i] === 'number' || r[i] === null)) numericIdx.push(i);
  });
  if (numericIdx.length === 0) return;
  const labelIdx = columns.findIndex((c, i) => !numericIdx.includes(i));
  const labelCol = labelIdx >= 0 ? labelIdx : 0;
  const candidateCols = numericIdx.filter(i => i !== labelCol);
  if (candidateCols.length === 0) return;

  // Pick columns to plot together: anchor on the LAST numeric column (a
  // query's headline computed metric — e.g. a rate or score — is
  // conventionally listed last) and only add other numeric columns if their
  // scale is comparable. Otherwise a raw count column (thousands) drowns out
  // a percentage/rate column (0-100) sharing the same axis.
  const maxAbs = (i) => Math.max(...rows.map(r => Math.abs(r[i] ?? 0)), 1);
  const anchor = candidateCols[candidateCols.length - 1];
  const anchorMax = maxAbs(anchor);
  let valueCols = candidateCols.filter((i) => {
    const m = maxAbs(i);
    return m / anchorMax <= 10 && anchorMax / m <= 10;
  });
  if (!valueCols.includes(anchor)) valueCols.push(anchor);
  valueCols = valueCols.slice(0, 3);

  const displayRows = rows.slice(0, 15);
  const labels = displayRows.map(r => String(r[labelCol]));
  const palette = ['#1D4ED8', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];

  const chartBox = document.createElement('div');
  chartBox.className = 'chatchart';
  const canvas = document.createElement('canvas');
  chartBox.appendChild(canvas);
  container.appendChild(chartBox);

  const isDoughnut = chartHint === 'breakdown' && valueCols.length === 1;
  const type = isDoughnut ? 'doughnut' : (chartHint === 'trend' ? 'line' : 'bar');
  const datasets = isDoughnut
    ? [{ data: displayRows.map(r => r[valueCols[0]]), backgroundColor: palette }]
    : valueCols.map((i, idx) => ({
        label: columns[i], data: displayRows.map(r => r[i]),
        backgroundColor: palette[idx % palette.length], borderColor: palette[idx % palette.length],
      }));

  new Chart(canvas, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: datasets.length > 1 || isDoughnut, labels: { boxWidth: 10, font: { size: 10 } } } },
    },
  });
}

// ---------- SHAP-explainability chart ----------
// Ported verbatim (same drawing math, same colors) from the standalone
// SHAP-explainability project's own UI (app/static/app.js there) —
// horizontal bars, one row per driver, colored by sign (blue = pushes the
// outcome up, red = pushes it down) rather than every bar sharing one
// color the way renderInlineChart()'s Chart.js bars do. Used ONLY for
// tier === 'explainability' responses (see the call site in
// sendChatMessage()) — every other tier keeps using renderInlineChart()
// exactly as before, completely untouched.
const SHAP_PALETTE = ['#2359b8', '#b44a57', '#1f9e6b', '#a5762f', '#7a4fc0'];

function shapChartHeight(rowCount, grouped) {
  const extra = grouped ? 30 : 12; // legend row for grouped (comparison) charts
  return Math.max(120, 30 + rowCount * 34 + extra);
}

function shapHaloText(ctx, text, tx, ty) {
  ctx.lineWidth = 3; ctx.strokeStyle = '#fafcffcc'; ctx.strokeText(text, tx, ty); ctx.fillText(text, tx, ty);
}

function drawShapBarChart(canvas, data) {
  // data: [{label, value}, ...] — one segment's drivers.
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const max = Math.max(...data.map(d => Math.abs(d.value)), .01), mid = 180;
  ctx.font = '12px system-ui'; ctx.textBaseline = 'alphabetic';
  data.forEach((d, i) => {
    const y = 30 + i * 34, bar = (Math.abs(d.value) / max) * 250;
    // Bars drawn first so a long bar never paints over the label/value text.
    ctx.fillStyle = d.value >= 0 ? SHAP_PALETTE[0] : SHAP_PALETTE[1];
    ctx.fillRect(d.value >= 0 ? mid : mid - bar, y - 10, bar, 18);
    ctx.fillStyle = '#27364d'; shapHaloText(ctx, String(d.label).slice(0, 40), 8, y + 4);
    ctx.fillStyle = '#536276'; shapHaloText(ctx, (d.value >= 0 ? '+' : '') + d.value.toFixed(3), w - 60, y + 4);
  });
  ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(mid, 12); ctx.lineTo(mid, h - 12); ctx.stroke();
}

function drawShapGroupedChart(canvas, chart) {
  // chart: {labels: [...], series: [{name, data: [...]}, ...]} — a
  // comparison (2+ segments), same feature set, grouped side-by-side
  // within each row so segments stay directly comparable.
  const ctx = canvas.getContext('2d'), h = canvas.height;
  const labels = chart.labels || [], series = chart.series || [];
  const allValues = series.flatMap(s => s.data || []);
  const max = Math.max(...allValues.map(v => Math.abs(v)), .01), mid = 200;
  const topMargin = 30, rowH = 34, barH = Math.max(6, Math.floor((rowH - 6) / Math.max(1, series.length)));
  ctx.font = '12px system-ui'; ctx.textBaseline = 'alphabetic';

  let legendX = 8;
  series.forEach((s, si) => {
    const color = SHAP_PALETTE[si % SHAP_PALETTE.length], label = (s.name || '').slice(0, 22);
    ctx.fillStyle = color; ctx.fillRect(legendX, 4, 10, 10);
    ctx.fillStyle = '#27364d'; ctx.fillText(label, legendX + 14, 13);
    legendX += 14 + ctx.measureText(label).width + 18;
  });

  labels.forEach((label, i) => {
    const rowY = topMargin + i * rowH;
    series.forEach((s, si) => {
      const val = (s.data || [])[i] || 0, bar = (Math.abs(val) / max) * 220;
      const y = rowY - (rowH / 2) + 2 + si * barH;
      ctx.fillStyle = SHAP_PALETTE[si % SHAP_PALETTE.length];
      ctx.fillRect(val >= 0 ? mid : mid - bar, y, bar, barH - 2);
    });
    ctx.fillStyle = '#27364d'; shapHaloText(ctx, String(label).slice(0, 26), 8, rowY + 4);
  });
  ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(mid, topMargin - 10); ctx.lineTo(mid, h - 8); ctx.stroke();
}

function renderShapChart(container, chartData) {
  // chartData is this app's own {columns, rows} shape (unchanged — built by
  // the backend's chart_adapter.py) — converted here into the shape the
  // ported drawing functions above expect, so the drawing logic itself is
  // an exact copy of the standalone SHAP project's own chart code, not a
  // rewrite of it.
  if (!chartData || !chartData.rows || !chartData.rows.length) return;
  const { columns, rows } = chartData;
  const grouped = columns.length > 2; // ["Driver","Impact"] vs ["Driver", seg1, seg2, ...]

  const chartBox = document.createElement('div');
  chartBox.className = 'chatchart-shap';
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = shapChartHeight(rows.length, grouped);
  chartBox.appendChild(canvas);
  container.appendChild(chartBox);

  if (grouped) {
    const labels = rows.map(r => r[0]);
    const series = columns.slice(1).map((name, si) => ({ name, data: rows.map(r => r[si + 1]) }));
    drawShapGroupedChart(canvas, { labels, series });
  } else {
    const data = rows.map(r => ({ label: r[0], value: r[1] }));
    drawShapBarChart(canvas, data);
  }
}

function renderClarificationOptions(botMsg, options) {
  const wrap = document.createElement('div');
  wrap.className = 'clarify-options';
  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clarify-chip';
    btn.textContent = option.label;
    // A templated-tier option carries resolved_query (the exact slots
    // already extracted this turn, just one metric swapped in) — passing
    // it lets the backend skip re-extracting params from the label text
    // alone, which was confirmed to silently drop grouping context (e.g.
    // "by agent"). An explainability steering option has no resolved_query
    // and just re-asks its label text as a normal fresh question.
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      sendChatMessage(option.label, option.resolved_query);
    });
    wrap.appendChild(btn);
  });
  botMsg.appendChild(wrap);
}

function appendChatMsg(role, innerHTML, extraClass) {
  const wrap = document.createElement('div');
  wrap.className = `turnrow ${role}`;
  const msg = document.createElement('div');
  msg.className = 'msg' + (extraClass ? ' ' + extraClass : '');
  msg.innerHTML = innerHTML;
  wrap.appendChild(msg);
  document.getElementById('chatMsgs').appendChild(wrap);
  document.getElementById('chatMsgs').scrollTop = document.getElementById('chatMsgs').scrollHeight;
  return msg;
}

let currentRequest = null; // { controller, requestId, userAborted }

function setSendingUi(isSending) {
  document.getElementById('chatSend').hidden = isSending;
  document.getElementById('chatStop').hidden = !isSending;
}

async function sendChatMessage(question, resolvedQuery) {
  if (!question.trim()) return;
  if (!chatSessionId) chatSessionId = crypto.randomUUID();

  appendChatMsg('user', question);
  const botMsg = appendChatMsg('bot', 'Thinking…', 'thinking');

  const slowTimer = setTimeout(() => {
    botMsg.textContent = 'Taking longer than expected…';
  }, 10000);

  const controller = new AbortController();
  // Must stay comfortably above chat.py's HARD_TIMEOUT_SECONDS (175s) —
  // otherwise the browser aborts the connection before the backend's own
  // timeout response can arrive, which defeats the point of that timeout
  // entirely and shows a different, less informative message instead.
  const hardTimer = setTimeout(() => controller.abort(), 190000);
  const requestId = crypto.randomUUID();
  currentRequest = { controller, requestId, userAborted: false };
  setSendingUi(true);

  try {
    const res = await fetch('/api/chat/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: chatSessionId, question, request_id: requestId, resolved_query: resolvedQuery ?? null }),
      signal: controller.signal,
    });
    const data = await res.json();
    clearTimeout(slowTimer);
    clearTimeout(hardTimer);

    botMsg.classList.remove('thinking');
    if (data.status === 'ok') {
      botMsg.innerHTML = formatAnswer(data.answer) +
        `<div class="meta">cache: ${data.cache_tier ?? '—'} · SQL faithfulness: ${data.faithfulness_score != null ? data.faithfulness_score.toFixed(2) : '—'} · synthesis accuracy: ${data.synthesis_score != null ? data.synthesis_score.toFixed(2) : '—'} · ${data.elapsed_ms} ms</div>`;
      if (data.tier === 'explainability') {
        renderShapChart(botMsg, data.chart_data);
      } else {
        renderInlineChart(botMsg, data.chart_data, data.chart_hint);
      }
      speakAnswer(data.answer);
    } else {
      botMsg.classList.add(data.status);
      botMsg.innerHTML = formatAnswer(data.answer);
      if (data.status === 'needs_clarification' && Array.isArray(data.options) && data.options.length) {
        renderClarificationOptions(botMsg, data.options);
      }
    }
    chatTurnCount = data.turn_id;
    document.getElementById('turnNo').textContent = chatTurnCount;
  } catch (err) {
    clearTimeout(slowTimer);
    clearTimeout(hardTimer);
    botMsg.classList.remove('thinking');
    if (currentRequest && currentRequest.userAborted) {
      botMsg.textContent = 'Cancelled.';
    } else {
      botMsg.classList.add('timeout');
      botMsg.textContent = "We're facing some technical difficulties — we'll get back to you soon.";
      console.error(err);
    }
  } finally {
    currentRequest = null;
    setSendingUi(false);
  }
}

document.getElementById('chatSend').addEventListener('click', () => {
  const input = document.getElementById('chatInput');
  const q = input.value;
  input.value = '';
  sendChatMessage(q).catch(console.error);
});
document.getElementById('chatStop').addEventListener('click', () => {
  if (!currentRequest) return;
  currentRequest.userAborted = true;
  // Client aborts immediately (instant UI feedback); server-side cleanup is
  // best-effort — it stops at the pipeline's next checkpoint, not mid-call.
  currentRequest.controller.abort();
  fetch('/api/chat/interrupt?request_id=' + encodeURIComponent(currentRequest.requestId), { method: 'POST' }).catch(() => {});
});
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('chatSend').click();
});
document.querySelectorAll('#tab-assistant .suggest').forEach(el => {
  el.addEventListener('click', () => sendChatMessage(el.dataset.q).catch(console.error));
});
document.getElementById('chatReset').addEventListener('click', () => {
  chatSessionId = null;
  chatTurnCount = 0;
  document.getElementById('turnNo').textContent = '0';
  document.getElementById('chatMsgs').innerHTML = '';
});
document.getElementById('chatExportPdf').addEventListener('click', () => {
  if (!chatSessionId) { alert('Ask a question first — nothing to export yet.'); return; }
  window.open(`/api/chat/export/${encodeURIComponent(chatSessionId)}`, '_blank');
});

// ---------- Speech input (mic) ----------
// Browser-native Web Speech API — same underlying Google recognition engine
// class as Cloud Speech-to-Text, zero backend round-trip. "hi-IN" handles
// Hindi-English code-mixing reasonably (there's no separate "Hinglish"
// language code); EN/HI toggle next to the mic covers the three required
// modes without a dedicated third option.
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isRecording = false;

if (SpeechRecognitionCtor) {
  recognizer = new SpeechRecognitionCtor();
  recognizer.continuous = false;
  recognizer.interimResults = false;

  recognizer.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('chatInput').value = transcript;
  };
  recognizer.onerror = () => { isRecording = false; document.getElementById('chatMic').classList.remove('recording'); };
  recognizer.onend = () => { isRecording = false; document.getElementById('chatMic').classList.remove('recording'); };

  document.getElementById('chatMic').addEventListener('click', () => {
    if (isRecording) { recognizer.stop(); return; }
    recognizer.lang = document.getElementById('chatLang').value;
    isRecording = true;
    document.getElementById('chatMic').classList.add('recording');
    try { recognizer.start(); } catch (e) { isRecording = false; document.getElementById('chatMic').classList.remove('recording'); }
  });
} else {
  document.getElementById('chatMic').disabled = true;
  document.getElementById('chatMic').title = 'Speech input not supported in this browser';
}

// ---------- Speech output (read answers aloud) ----------
let ttsEnabled = false;
document.getElementById('chatTts').addEventListener('click', () => {
  ttsEnabled = !ttsEnabled;
  document.getElementById('chatTts').classList.toggle('active', ttsEnabled);
  if (!ttsEnabled) window.speechSynthesis.cancel();
});

function speakAnswer(answerText) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  // Strip markdown bullet markers so it doesn't read "dash" aloud.
  const clean = answerText.replace(/^[-*]\s+/gm, '').replace(/\n+/g, '. ');
  const utterance = new SpeechSynthesisUtterance(clean);
  const lang = document.getElementById('chatLang').value;
  utterance.lang = lang;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
  if (match) utterance.voice = match;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ---------- Observability tab: dashboard-style detail rendering ----------
const STAGE_COLORS = ['#1D4ED8', '#059669', '#D97706', '#9333EA', '#0E9384', '#4338CA', '#DC2626', '#64748B', '#EA580C', '#0891B2'];

const STAGE_LABELS = {
  guardrail_cache_classify: 'Guardrail + cache + classify (parallel)',
  template_build: 'Template build', execute: 'Execute SQL',
  synthesis_0: 'Synthesis (attempt 1)', synthesis_escalation: 'Synthesis escalation (parallel retries)',
  synthesis_final: 'Synthesis (final retry)', synthesis_easy: 'Synthesis (easy tier)',
  sql_gen_0: 'SQL generation (attempt 1)', sql_gen_easy: 'SQL generation (easy tier)',
  sql_gen_easy_retry: 'SQL generation (easy tier retry)', sql_gen_escalation: 'SQL-gen escalation (parallel retries)',
  sql_gen_final: 'SQL generation (final retry)', groundedness_0_and_speculative: 'Groundedness + speculative execute',
  groundedness_0: 'Groundedness (attempt 1)', groundedness_final: 'Groundedness (final retry)',
  easy_check: 'Easy-tier check', easy_check_retry: 'Easy-tier check (retry)',
  tool_match_check: 'Tool-match check', tool_execute: 'Tool execute',
  guardrail: 'Guardrail', intent_classifier: 'Intent classify', param_extractor: 'Param extract',
};
function prettyStageName(key) {
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  const m = key.match(/^(synthesis_check|synthesis|sql_gen|groundedness)_(\d+)$/);
  if (m) {
    const base = { synthesis: 'Synthesis', synthesis_check: 'Faithfulness check', sql_gen: 'SQL generation', groundedness: 'Groundedness' }[m[1]];
    return `${base} (candidate ${Number(m[2]) + 1})`;
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderLatencyBar(latency) {
  const entries = Object.entries(latency || {}).filter(([k]) => k !== 'total_ms');
  if (!entries.length) return '<div class="score-reason">No latency data for this turn.</div>';
  const total = latency.total_ms || entries.reduce((a, [, ms]) => a + ms, 0);
  const segs = entries.map(([k, ms], i) => {
    const pct = total ? (ms / total * 100) : 0;
    return `<div class="stagebar-seg" style="width:${pct.toFixed(2)}%;background:${STAGE_COLORS[i % STAGE_COLORS.length]}" title="${prettyStageName(k)}: ${ms} ms"></div>`;
  }).join('');
  const legend = entries.map(([k, ms], i) =>
    `<div class="stagebar-item"><span class="stagebar-dot" style="background:${STAGE_COLORS[i % STAGE_COLORS.length]}"></span>` +
    `<span class="sname">${prettyStageName(k)}</span><span class="sms">${ms} ms</span></div>`
  ).join('');
  return `<div class="stagebar">${segs}</div><div class="stagebar-legend">${legend}</div>` +
    `<div class="stagebar-total">Total <b>${total.toLocaleString('en-IN')} ms</b></div>`;
}

function renderTokenTable(tokens) {
  const keys = Object.keys(tokens || {});
  if (!keys.length) return '<div class="score-reason">No model calls for this turn.</div>';
  let totalOut = 0;
  const rows = keys.map(k => {
    const t = tokens[k] || {};
    totalOut += t.output_tokens || 0;
    return `<tr><td>${prettyStageName(k)}</td><td class="model-tag">${t.model || '—'}</td>` +
      `<td>${(t.output_tokens ?? 0).toLocaleString('en-IN')}</td></tr>`;
  }).join('');
  return `<table class="token-table"><thead><tr><th>Stage</th><th>Model</th><th>Output</th></tr></thead>` +
    `<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td>${totalOut.toLocaleString('en-IN')}</td></tr></tfoot></table>`;
}

function renderGuardrailBadges(g) {
  if (!g) return '<div class="score-reason">No guardrail data for this turn.</div>';
  const clearIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const flagIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const checks = [['PII filter', g.is_pii_filter], ['Out of scope', g.is_out_of_scope], ['Injection / URL', g.is_injection_or_url]];
  const badges = checks.map(([label, flagged]) =>
    `<span class="gbadge ${flagged ? 'flagged' : 'clear'}">${flagged ? flagIcon : clearIcon}${label}</span>`
  ).join('');
  const reason = g.reason && g.reason !== 'clear' ? `<div class="gbadge-reason">${g.reason}</div>` : '';
  return `<div class="gbadges">${badges}</div>${reason}`;
}

function scoreColor(score) {
  if (score == null) return 'var(--muted)';
  if (score >= 0.85) return 'var(--green)';
  if (score >= 0.6) return 'var(--amber)';
  return 'var(--red)';
}
function renderScoreRow(label, score) {
  if (score == null) return `<div class="scorerow"><span class="slab">${label}</span><span class="scoreval">—</span></div>`;
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return `<div class="scorerow"><span class="slab">${label}</span><div class="scorebar"><div class="scorebar-fill" ` +
    `style="width:${pct}%;background:${scoreColor(score)}"></div></div><span class="scoreval">${score.toFixed(2)}</span></div>`;
}

function statusTone(status) {
  if (status === 'ok') return 'ok';
  if (status === 'blocked' || status === 'no_results' || status === 'no_tool_available' || status === 'needs_clarification') return 'warn';
  return 'bad'; // failed, timeout, interrupted, error, session_limit
}

function cacheBadge(tier) {
  if (!tier) return '<span class="chip neutral">—</span>';
  const tone = tier === 'high' ? 'ok' : tier === 'medium' ? 'warn' : 'neutral';
  return `<span class="chip ${tone}">${tier}</span>`;
}

// ---------- Observability tab ----------
async function safeFetchJson(url) {
  // A plain Promise.all here used to take the whole tab blank the instant
  // ANY ONE of the 3 calls below failed (e.g. a connection-pool timeout
  // under concurrent load) — .json() on a non-JSON error body threw, which
  // rejected the whole Promise.all before any DOM update ran. Each call is
  // now isolated: a failure here returns {ok:false} instead of throwing,
  // so the caller can render whatever DID succeed instead of nothing.
  try {
    const r = await fetch(url);
    const data = await r.json();
    return { ok: r.ok, data };
  } catch (e) {
    console.error('Observability fetch failed:', url, e);
    return { ok: false, data: null };
  }
}

async function loadObservability(sessionId) {
  const [summaryRes, sessionsRes, turnsRes] = await Promise.all([
    safeFetchJson('/api/observability/summary'),
    safeFetchJson('/api/observability/sessions'),
    safeFetchJson('/api/observability/turns' + (sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '')),
  ]);

  if (!summaryRes.ok && !sessionsRes.ok && !turnsRes.ok) {
    document.getElementById('obsKpis').innerHTML =
      '<div class="card placeholder">Observability is temporarily unavailable — please retry in a moment.</div>';
    return;
  }

  const summary = summaryRes.ok ? summaryRes.data : null;
  const sessionsResp = sessionsRes.ok ? sessionsRes.data : { sessions: [] };
  const turnsResp = turnsRes.ok ? turnsRes.data : { turns: [] };

  if (!summary) {
    document.getElementById('obsKpis').innerHTML =
      '<div class="card placeholder">Pipeline health metrics temporarily unavailable — please retry.</div>';
  } else {
  // KPIs
  const cacheCounts = summary.cache_tier_counts || {};
  const cacheTotal = Object.values(cacheCounts).reduce((a, b) => a + b, 0);
  const cacheHits = (cacheCounts.high || 0) + (cacheCounts.medium || 0);
  const cacheHitRate = cacheTotal ? (100 * cacheHits / cacheTotal).toFixed(1) : '—';
  const faithVals = summary.faithfulness_trend || [];
  const avgFaith = faithVals.length
    ? (faithVals.reduce((a, d) => a + d.avg_faithfulness, 0) / faithVals.length).toFixed(2)
    : '—';

  const kpis = document.getElementById('obsKpis');
  kpis.innerHTML = '';
  kpis.appendChild(kpiCard('Total Turns', fmtNum(summary.total_turns)));
  kpis.appendChild(kpiCard('Guardrail Rejection Rate', fmtPct(summary.guardrail_rejection_rate), null,
    summary.guardrail_rejection_rate >= 10 ? 'warn' : null));
  kpis.appendChild(kpiCard('Avg Faithfulness Score', avgFaith, null,
    avgFaith === '—' ? null : avgFaith >= 0.9 ? 'good' : avgFaith >= 0.7 ? 'warn' : 'bad'));
  kpis.appendChild(kpiCard('Cache Hit Rate', cacheHitRate === '—' ? '—' : `${cacheHitRate}%`, null,
    cacheHitRate === '—' ? null : cacheHitRate >= 50 ? 'good' : null));

  // Usage per day
  renderChart('obsUsageChart', {
    type: 'bar',
    data: {
      labels: summary.usage_per_day.map(d => d.day),
      datasets: [{ label: 'Turns', data: summary.usage_per_day.map(d => d.count), backgroundColor: '#1D4ED8' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  // Faithfulness trend
  renderChart('obsFaithChart', {
    type: 'line',
    data: {
      labels: faithVals.map(d => d.day),
      datasets: [{ label: 'Avg Faithfulness', data: faithVals.map(d => d.avg_faithfulness), borderColor: '#059669', tension: 0.3 }],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 1 } } },
  });

  // Token usage by stage — output tokens only (what the model actually
  // wrote; input is mostly fixed prompt/schema boilerplate and swamps the
  // chart without saying much about cost/latency per stage).
  const roles = Object.keys(summary.tokens_by_model_role || {});
  renderChart('obsTokenChart', {
    type: 'bar',
    data: {
      labels: roles,
      datasets: [
        { label: 'Output tokens', data: roles.map(r => summary.tokens_by_model_role[r].output_tokens), backgroundColor: '#1D4ED8' },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  // Cache hit-rate donut
  const cacheLabels = ['high', 'medium', 'miss'].filter(k => cacheCounts[k]);
  renderChart('obsCacheChart', {
    type: 'doughnut',
    data: {
      labels: cacheLabels,
      datasets: [{ data: cacheLabels.map(k => cacheCounts[k]), backgroundColor: ['#059669', '#D97706', '#64748B'] }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  // Guardrail rejection tiles
  const reasons = summary.guardrail_reject_reasons || {};
  const gTiles = document.getElementById('obsGuardrailTiles');
  gTiles.innerHTML = '';
  gTiles.appendChild(tile('PII-as-filter blocks', fmtNum(reasons.pii_filter || 0)));
  gTiles.appendChild(tile('Out-of-scope blocks', fmtNum(reasons.out_of_scope || 0)));
  gTiles.appendChild(tile('Injection/URL blocks', fmtNum(reasons.injection_or_url || 0)));
  }

  // Session filter dropdown
  const sel = document.getElementById('obsSessionFilter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">All sessions (most recent 200 turns)</option>';
  sessionsResp.sessions.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.session_id;
    opt.textContent = `${s.session_id.slice(0, 8)}… (${s.turn_count} turns, last ${s.last_turn_at})`;
    sel.appendChild(opt);
  });
  sel.value = currentVal;

  // Per-turn audit table
  const tbody = document.querySelector('#obsTurnsTable tbody');
  tbody.innerHTML = '';
  turnsResp.turns.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.className = 'turn-row';
    const totalLatency = t.latency && t.latency.total_ms != null ? `${t.latency.total_ms.toLocaleString('en-IN')} ms` : '—';
    tr.innerHTML = `
      <td>${t.turn_id}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.user_email || '—'}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.question}</td>
      <td><span class="chip ${statusTone(t.status)}">${t.status}</span></td>
      <td>${cacheBadge(t.cache_tier)}</td>
      <td>${t.faithfulness_score != null ? t.faithfulness_score.toFixed(2) : '—'}</td>
      <td>${totalLatency}</td>
      <td>▸</td>
    `;
    const detailTr = document.createElement('tr');
    detailTr.className = 'turn-detail-row';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 8;

    const retryPills = [];
    if (t.retries) retryPills.push(`SQL-gen retries: ${t.retries}`);
    if (t.synthesis_retries) retryPills.push(`Synthesis attempts: ${t.synthesis_retries}`);
    if (t.cache_score != null) retryPills.push(`Cache score: ${t.cache_score.toFixed(3)}`);

    detailTd.innerHTML = `
      <div class="turn-detail">
        <div class="turn-detail-grid">
          <div class="turn-detail-block">
            <div class="lab">Answer <span class="model-tag">· session ${t.session_id.slice(0, 8)}…</span></div>
            <div class="answer-box">${t.answer || '—'}</div>
          </div>
          <div class="turn-detail-block">
            <div class="lab">Guardrail</div>
            ${renderGuardrailBadges(t.guardrail)}
            <div class="lab" style="margin-top:12px">Quality checks</div>
            ${renderScoreRow('Faithfulness', t.faithfulness_score)}
            ${t.faithfulness_reason ? `<div class="score-reason">${t.faithfulness_reason}</div>` : ''}
            ${renderScoreRow('Synthesis', t.synthesis_score)}
            ${t.synthesis_reason ? `<div class="score-reason">${t.synthesis_reason}</div>` : ''}
            ${retryPills.length ? `<div class="retry-pills">${retryPills.map(p => `<span class="retry-pill">${p}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="turn-detail-block">
          <div class="lab">Latency breakdown</div>
          ${renderLatencyBar(t.latency)}
        </div>
        <div class="turn-detail-block">
          <div class="lab">Token usage by stage</div>
          ${renderTokenTable(t.tokens)}
        </div>
        ${t.join_reason ? `<div class="turn-detail-block"><div class="lab">Join reasoning</div><div class="score-reason">${t.join_reason}</div></div>` : ''}
        ${t.sql ? `<div class="turn-detail-block"><div class="lab">SQL</div><div class="codebox">${t.sql}</div></div>` : ''}
      </div>
    `;
    detailTr.appendChild(detailTd);

    tr.addEventListener('click', () => {
      detailTr.classList.toggle('open');
    });
    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });
}

document.getElementById('obsSessionFilter').addEventListener('change', (e) => {
  loadObservability(e.target.value || null).catch(console.error);
});
document.querySelector('[data-tab="obs"]').addEventListener('click', () => {
  loadObservability(document.getElementById('obsSessionFilter').value || null).catch(console.error);
});

// ---------- auth gate ----------
// Runs before any tab's data loads — home.py/explorer.py/chat.py/
// observability.py all now 401 without a valid session cookie, so an
// unauthenticated visit would otherwise just show a page full of "Failed
// to load" placeholders instead of redirecting to sign in. Wiring loadHome()
// and loadExplorerFilters() into this gate (rather than calling them
// unconditionally at script top-level, as they used to be) means neither
// fires at all until sign-in is confirmed.
let currentUser = null;

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* redirect regardless */ }
  window.location.href = '/login';
});

async function initAuthAndBoot() {
  let res;
  try {
    res = await fetch('/api/auth/me');
  } catch (e) {
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    window.location.href = '/login';
    return;
  }
  currentUser = await res.json();
  document.getElementById('userNameDisplay').textContent = `Signed in as ${currentUser.name}`;
  document.getElementById('assistantUserGreeting').textContent = `Signed in as ${currentUser.name}`;

  loadHome().catch(err => {
    console.error(err);
    document.getElementById('kpis').innerHTML = '<div class="card placeholder">Failed to load data — is the backend running?</div>';
  });
  loadExplorerFilters().then(applyExplorerFilters).catch(err => {
    console.error(err);
    document.getElementById('explorerKpis').innerHTML = '<div class="card placeholder">Failed to load Explorer data.</div>';
  });
}

initAuthAndBoot();
