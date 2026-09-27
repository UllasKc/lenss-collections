let obsLoaded = false;
let obsModeChartInstance = null;
let obsLatencyChartInstance = null;
let obsRecent = [];

const STAGE_COLORS = ['#1D4ED8', '#059669', '#D97706', '#9333EA', '#0E9384', '#4338CA', '#DC2626', '#64748B', '#EA580C', '#0891B2'];

function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function renderTimeline(timeline, total) {
  const stages = (timeline || []).filter(s => s.ms > 0);
  if (!stages.length) return '<div class="score-reason">No timing recorded for this question (asked before timings were added).</div>';
  const sum = stages.reduce((a, s) => a + s.ms, 0) || 1;
  const segs = stages.map((s, i) =>
    `<div class="stagebar-seg" style="width:${(s.ms / sum * 100).toFixed(2)}%;background:${STAGE_COLORS[i % STAGE_COLORS.length]}" title="${esc(s.stage)}: ${fmtMs(s.ms)}"></div>`).join('');
  const legend = stages.map((s, i) =>
    `<div class="stagebar-item"><span class="stagebar-dot" style="background:${STAGE_COLORS[i % STAGE_COLORS.length]}"></span>` +
    `<span class="sname">${esc(s.stage)}</span><span class="sms">${fmtMs(s.ms)}</span></div>`).join('');
  return `<div class="stagebar">${segs}</div><div class="stagebar-legend">${legend}</div>` +
    `<div class="stagebar-total">Total <b>${fmtMs(total)}</b></div>`;
}

function renderQueries(queries) {
  if (!queries || !queries.length) return '<div class="score-reason">No SQL was run for this question.</div>';
  return queries.map((q, i) => `
    <div class="query-item">
      <div class="query-head"><span class="query-no">${i + 1}</span><span class="query-title">${esc(q.title)}</span>
        <span class="chip neutral">${q.rows === null || q.rows === undefined ? 'rows —' : `${fmtNum(q.rows)} row${q.rows === 1 ? '' : 's'}`}</span></div>
      <div class="codebox">${esc(q.sql)}</div>
    </div>`).join('');
}

function ratingChip(v) {
  if (v === 1) return '<span class="chip ok">👍 helpful</span>';
  if (v === -1) return '<span class="chip bad">👎 not helpful</span>';
  return '<span class="chip neutral">—</span>';
}

function renderAuditTrail() {
  const who = document.getElementById('obsUserFilter').value;
  const rows = who ? obsRecent.filter(e => e.user_email === who) : obsRecent;
  const tbody = document.querySelector('#recentTable tbody');
  tbody.innerHTML = '';
  rows.forEach(e => {
    const d = e.details || {};
    const tr = document.createElement('tr');
    tr.className = 'turn-row';
    const resultChip = e.success ? '<span class="chip ok">answered</span>'
      : `<span class="chip bad" title="${esc(e.error_message || '')}">failed</span>`;
    tr.innerHTML = `<td>${new Date(e.created_at).toLocaleString()}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.user_email)}</td>
      <td><span class="badge ${e.mode === 'agent' ? 'amber' : 'green'}">${esc(e.mode)}</span></td>
      <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.question)}">${esc(e.question)}</td>
      <td>${resultChip}</td><td>${ratingChip(e.feedback)}</td><td>${fmtMs(e.latency_ms)}</td><td>▸</td>`;

    const detailTr = document.createElement('tr');
    detailTr.className = 'turn-detail-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    const facts = [
      `Session: ${esc(e.session_title || String(e.session_id || '').slice(0, 8))}`,
      `SQL queries: ${(d.queries || []).length}`,
      `Charts: ${d.charts ?? 0}`,
      d.agentSteps != null ? `Agent steps: ${d.agentSteps}` : null,
      d.contextCarriedOver ? 'Context carried over from the other mode' : null,
      d.genieConversationId ? `Genie conversation: ${esc(d.genieConversationId)}` : null,
      d.genieMessageId ? `Genie message: ${esc(d.genieMessageId)}` : null,
    ].filter(Boolean);
    td.innerHTML = `
      <div class="turn-detail">
        <div class="turn-detail-grid">
          <div class="turn-detail-block">
            <div class="lab">Answer</div>
            <div class="answer-box">${esc((d.answerPreview || (e.success ? '—' : 'No answer was returned.'))
              .replace(/\*\*/g, '').replace(/\[\[chart:[^\]]+\]\]/g, '[chart]').replace(/\\([[\]])/g, '$1'))}</div>
          </div>
          <div class="turn-detail-block">
            <div class="lab">Details</div>
            <div class="retry-pills">${facts.map(f => `<span class="retry-pill">${f}</span>`).join('')}</div>
            ${e.error_message ? `<div class="lab" style="margin-top:12px">Error</div><div class="codebox">${esc(e.error_message)}</div>` : ''}
            <div class="lab" style="margin-top:12px">Token usage</div>
            <div class="score-reason">Not available: Genie doesn't report token counts for Chat or Agent answers.</div>
          </div>
        </div>
        <div class="turn-detail-block"><div class="lab">Where the time went</div>${renderTimeline(d.timeline, e.latency_ms)}</div>
        <div class="turn-detail-block"><div class="lab">SQL generated by Genie</div>${renderQueries(d.queries)}</div>
      </div>`;
    detailTr.appendChild(td);
    tr.addEventListener('click', () => {
      detailTr.classList.toggle('open');
      tr.lastElementChild.textContent = detailTr.classList.contains('open') ? '▾' : '▸';
    });
    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });
  if (!rows.length) tbody.innerHTML = '<tr><td colspan="8">No questions yet.</td></tr>';
}
document.getElementById('obsUserFilter').addEventListener('change', renderAuditTrail);

window.loadMonitoring = async function loadMonitoring() {
  const data = await fetch('/api/admin/usage').then(r => r.json());

  const kpis = document.getElementById('obsKpis');
  kpis.innerHTML = '';
  const successRate = data.totals.total_questions
    ? Math.round((100 * data.totals.successful) / data.totals.total_questions)
    : 0;
  const rated = data.totals.helpful + data.totals.not_helpful;
  kpis.appendChild(kpiCard('Total Questions', fmtNum(data.totals.total_questions)));
  kpis.appendChild(kpiCard('Success Rate', successRate + '%', null, successRate < 90 ? 'warn' : 'good'));
  kpis.appendChild(kpiCard('Avg Latency', fmtMs(Number(data.totals.avg_latency_ms))));
  kpis.appendChild(kpiCard('Helpful Ratings', rated ? Math.round((100 * data.totals.helpful) / rated) + '%' : '—',
    `👍 ${fmtNum(data.totals.helpful)}  ·  👎 ${fmtNum(data.totals.not_helpful)}`,
    rated && data.totals.not_helpful > data.totals.helpful ? 'warn' : null));

  if (obsModeChartInstance) obsModeChartInstance.destroy();
  obsModeChartInstance = new Chart(document.getElementById('obsModeChart'), {
    type: 'doughnut',
    data: {
      labels: data.byMode.map(m => m.mode),
      datasets: [{ data: data.byMode.map(m => m.questions), backgroundColor: ['#1D4ED8', '#9333EA'] }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  if (obsLatencyChartInstance) obsLatencyChartInstance.destroy();
  obsLatencyChartInstance = new Chart(document.getElementById('obsLatencyChart'), {
    type: 'bar',
    data: {
      labels: data.byMode.map(m => m.mode),
      datasets: [{ label: 'Avg latency (ms)', data: data.byMode.map(m => m.avg_latency_ms), backgroundColor: '#0E9384' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const userBody = document.querySelector('#userTable tbody');
  userBody.innerHTML = '';
  data.byUser.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(u.user_email)}</td><td>${fmtNum(u.sessions)}</td><td>${fmtNum(u.questions)}</td><td>${fmtNum(u.successful)}</td>
      <td>${fmtNum(u.avg_latency_ms)} ms</td><td>${new Date(u.last_active).toLocaleString()}</td>`;
    userBody.appendChild(tr);
  });

  obsRecent = data.recent;
  const sel = document.getElementById('obsUserFilter');
  const current = sel.value;
  const users = [...new Set(obsRecent.map(e => e.user_email))];
  sel.innerHTML = '<option value="">All users (latest 100 questions)</option>' +
    users.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  sel.value = users.includes(current) ? current : '';
  renderAuditTrail();

  obsLoaded = true;
};
