// ---------- tab switching ----------
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('on');
    if (btn.dataset.tab === 'obs' && window.loadMonitoring) window.loadMonitoring();
  });
});

// ---------- formatting helpers ----------
function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v).toLocaleString('en-US');
}
function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Math.round(Number(n)).toLocaleString('en-US');
}
function fmtPct(n) {
  if (n === null || n === undefined || n === '') return '—';
  return (Number(n) * 100).toFixed(1) + '%';
}

function kpiCard(label, val, secondary, tone) {
  const div = document.createElement('div');
  div.className = 'card kpi' + (tone ? ' ' + tone : '');
  div.innerHTML = `<div class="lab">${label}</div><div class="val">${val}</div>` +
    (secondary ? `<div class="sec">${secondary}</div>` : '');
  return div;
}

let productChartInstance = null;

async function loadHome() {
  const [summary, byProduct, segments] = await Promise.all([
    fetch('/api/dashboard/summary').then(r => r.json()),
    fetch('/api/dashboard/by-product').then(r => r.json()),
    fetch('/api/dashboard/segments').then(r => r.json()),
  ]);

  const narrativeEl = document.getElementById('narrative');
  narrativeEl.textContent = summary.narrative ||
    'No executive summary yet. Run the deploy\'s summary step: python deploy/deploy.py --config <config> --only summary';
  const gen = summary.narrative_generated_at ? new Date(summary.narrative_generated_at.replace(' ', 'T') + 'Z') : null;
  document.getElementById('narrativeMeta').textContent = summary.narrative_generated_at
    ? `Generated from the certified views on ${gen && !isNaN(gen) ? gen.toLocaleString() : summary.narrative_generated_at}`
    : '';

  const kpis = document.getElementById('kpis');
  kpis.innerHTML = '';
  kpis.appendChild(kpiCard('MTD Collections', fmtMoney(summary.mtd_collections), 'vs. target ' + fmtMoney(summary.monthly_target)));
  kpis.appendChild(kpiCard('Achievement', fmtPct(summary.achievement_pct), 'Gap ' + fmtMoney(summary.target_gap),
    Number(summary.achievement_pct) < 0.9 ? 'bad' : 'good'));
  kpis.appendChild(kpiCard('Immediate Intervention', fmtNum(summary.immediate_intervention_accounts),
    'Recovery opportunity ' + fmtMoney(summary.recovery_opportunity), 'warn'));
  kpis.appendChild(kpiCard('Over-Contact Segments', fmtNum(summary.over_contact_segments),
    'Avg attempts ≥ 4.5, ≥30 accounts', Number(summary.over_contact_segments) > 0 ? 'warn' : 'good'));

  if (productChartInstance) productChartInstance.destroy();
  const ctx = document.getElementById('productChart');
  productChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: byProduct.map(p => p.Product),
      datasets: [{
        label: 'Achievement %',
        data: byProduct.map(p => (Number(p.achievement_pct) * 100).toFixed(1)),
        backgroundColor: byProduct.map(p => Number(p.achievement_pct) < 0.9 ? '#DC2626' : '#059669'),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: 'Achievement %' } } },
      plugins: { legend: { display: false } },
    },
  });

  const tbody = document.querySelector('#segmentTable tbody');
  tbody.innerHTML = '';
  segments.forEach(s => {
    const rate = Number(s.Balance_Recovery_Rate);
    const tone = rate < 0.85 ? 'red' : rate < 0.92 ? 'amber' : 'green';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.Product}</td><td>${s.DPD_Bucket}</td><td>${fmtNum(s.Account_Count)}</td>
      <td>${fmtMoney(s.Outstanding_Balance)}</td><td>${fmtMoney(s.Recovery_MTD)}</td>
      <td><span class="badge ${tone}">${fmtPct(s.Balance_Recovery_Rate)}</span></td>
      <td>${fmtPct(s.RPC_Rate)}</td><td>${fmtPct(s.PTP_Conversion_Rate)}</td><td>${fmtPct(s.Cure_Rate)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadUser() {
  try {
    const me = await fetch('/api/me').then(r => r.json());
    document.getElementById('userNameDisplay').textContent = me.email || '';
    document.getElementById('assistantUserGreeting').textContent = me.email ? `Signed in as ${me.email}` : '';
  } catch { /* non-fatal */ }
}

loadUser();
loadHome().catch(err => console.error('loadHome failed', err));
