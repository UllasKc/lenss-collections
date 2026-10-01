// ---------- tab switching ----------
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('on');
    if (btn.dataset.tab === 'obs' && window.loadMonitoring) window.loadMonitoring();
    if (btn.dataset.tab === 'evals' && window.loadEvals) window.loadEvals();
    if (btn.dataset.tab === 'rai' && window.loadResponsibleAi) window.loadResponsibleAi();
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

// ---------- request trace (shared by the answer panel and Monitoring) ----------
const FEATURE_LABELS = {
  guardrails: 'Guardrail classifier', embeddings: 'Question embedding', judge: 'Answer-quality judge',
  follow_ups: 'Follow-up suggestions', title: 'Session naming', other: 'Other',
};
function featureLabel(f) { return FEATURE_LABELS[f] || f; }

function fmtDur(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/**
 * A waterfall of the request's spans: each bar starts where that step started
 * and is as long as it took, so parallel work (the guardrail classifier running
 * alongside the cache lookups) and the query engine's own stages are visible.
 * Older answers without a trace fall back to their stage timeline.
 */
function renderWaterfall(spans, total, timeline) {
  const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let list = (spans || []).filter(s => s.ms >= 0);
  if (!list.length && timeline && timeline.length) {
    let at = 0;
    list = timeline.filter(s => s.ms > 0).map(s => { const x = { name: s.stage, kind: 'engine', start: at, ms: s.ms }; at += s.ms; return x; });
  }
  if (!list.length) return '<div class="score-reason">No trace was recorded for this question.</div>';
  const end = Math.max(total || 0, ...list.map(s => s.start + s.ms), 1);
  return `<div class="wf">${list.map(s => {
    const left = (s.start / end) * 100;
    const width = Math.max((s.ms / end) * 100, 0.6);
    return `<div class="wf-row${s.parent ? ' child' : ''}" title="${esc2(s.name)}: ${fmtDur(s.ms)} (starts at ${fmtDur(s.start)})">
      <span class="wf-name">${esc2(s.name)}</span>
      <span class="wf-track"><span class="wf-bar k-${esc2(s.kind)}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span></span>
      <span class="wf-ms">${fmtDur(s.ms)}</span></div>`;
  }).join('')}</div>
  <div class="wf-legend"><span class="k-guardrail">Guardrails</span><span class="k-cache">Cache</span><span class="k-engine">Query engine</span><span class="k-model">AI models</span><span class="wf-total">Total ${fmtDur(total)}</span></div>`;
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
      <td>${fmtPct(s.RPC_Rate)}</td><td>${fmtPct(s.PTP_Conversion_Rate)}</td>
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
