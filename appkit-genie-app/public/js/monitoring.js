let obsLoaded = false;
let obsModeChartInstance = null;
let obsLatencyChartInstance = null;

window.loadMonitoring = async function loadMonitoring() {
  const data = await fetch('/api/admin/usage').then(r => r.json());

  const kpis = document.getElementById('obsKpis');
  kpis.innerHTML = '';
  const successRate = data.totals.total_questions
    ? Math.round((100 * data.totals.successful) / data.totals.total_questions)
    : 0;
  kpis.appendChild(kpiCard('Total Questions', fmtNum(data.totals.total_questions)));
  kpis.appendChild(kpiCard('Success Rate', successRate + '%', null, successRate < 90 ? 'warn' : 'good'));
  kpis.appendChild(kpiCard('Avg Latency', fmtNum(data.totals.avg_latency_ms) + ' ms'));
  kpis.appendChild(kpiCard('Active Users', fmtNum(data.byUser.length)));

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

  const recentBody = document.querySelector('#recentTable tbody');
  recentBody.innerHTML = '';
  data.recent.forEach(e => {
    const tr = document.createElement('tr');
    const resultBadge = e.success
      ? `<span class="badge green">OK (${e.latency_ms}ms)</span>`
      : `<span class="badge red" title="${esc(e.error_message || '')}">failed</span>`;
    tr.innerHTML = `<td>${new Date(e.created_at).toLocaleString()}</td><td>${esc(e.user_email)}</td>
      <td><span class="badge ${e.mode === 'agent' ? 'amber' : 'green'}">${esc(e.mode)}</span></td>
      <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis" title="${esc(e.question)}">${esc(e.question)}</td><td>${resultBadge}</td>`;
    recentBody.appendChild(tr);
  });

  obsLoaded = true;
};
