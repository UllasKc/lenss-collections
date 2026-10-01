let obsLoaded = false;
let obsModeChartInstance = null;
let obsLatencyChartInstance = null;
let obsRecent = [];
let obsFeedback = [];

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

function faithChip(score) {
  if (score === null || score === undefined) return '<span class="chip neutral" title="Not judged">—</span>';
  const pct = Math.round(Number(score) * 100);
  const tone = pct >= 85 ? 'ok' : pct >= 70 ? 'cache' : 'bad';
  return `<span class="chip ${tone}">${pct}%</span>`;
}

const GUARD_LABELS = {
  pii: 'Personal data', profanity: 'Profanity / abuse', prompt_injection: 'Prompt injection', off_topic: 'Off-topic',
  causal_claim: 'Causal uplift claim', forecast: 'Month-end forecast', cure_rate: 'Cure rate', probability: 'Probability of target',
};
const guardLabel = c => GUARD_LABELS[c] || c;

function renderJudge(j) {
  if (!j) return '<div class="score-reason">Not judged (the faithfulness judge is off, sampled out, or the answer came before it was enabled).</div>';
  const n = j.numeric || {};
  const parts = [
    `<span class="retry-pill">Score ${j.score === null || j.score === undefined ? '—' : Math.round(j.score * 100) + '%'}${j.reused ? ' (from when the cached answer was generated)' : ''}</span>`,
    `<span class="retry-pill">Numbers found in the data: ${n.checked ? `${n.found}/${n.checked}` : 'no figures to check'}</span>`,
    j.llm ? `<span class="retry-pill">Judge ${esc(modelName(j.llm.model))}: ${Math.round(j.llm.score * 100)}%${j.llm.tokens ? ` · ${fmtNum(j.llm.tokens)} tokens` : ''}</span>` : '',
    ...(j.llm && j.llm.metrics ? ['relevance', 'completeness', 'safety'].filter(k => j.llm.metrics[k] !== null && j.llm.metrics[k] !== undefined)
      .map(k => `<span class="retry-pill">${k.charAt(0).toUpperCase() + k.slice(1)} ${Math.round(j.llm.metrics[k] * 100)}%</span>`) : []),
    j.llmError ? `<span class="retry-pill">Judge model error: ${esc(j.llmError)}</span>` : '',
  ].filter(Boolean).join('');
  const missing = (n.missing || []).length ? `<div class="score-reason">Figures not found in the results: ${esc(n.missing.join(', '))}</div>` : '';
  const reason = j.llm && j.llm.reason ? `<div class="score-reason">${esc(j.llm.reason)}</div>` : '';
  const claims = j.llm && j.llm.unsupported && j.llm.unsupported.length
    ? `<div class="score-reason">Unsupported claims:<ul>${j.llm.unsupported.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
  return `<div class="retry-pills">${parts}</div>${reason}${missing}${claims}`;
}

/** Endpoint names as the models' own names ("databricks-gpt-oss-20b" -> "GPT-OSS 20B"). */
function modelName(m) {
  if (!m) return '';
  const known = { 'databricks-gpt-oss-20b': 'GPT-OSS 20B', 'databricks-gpt-oss-120b': 'GPT-OSS 120B', 'databricks-gte-large-en': 'GTE Large (English)',
    'databricks-meta-llama-3-1-8b-instruct': 'Llama 3.1 8B Instruct', 'databricks-meta-llama-3-3-70b-instruct': 'Llama 3.3 70B Instruct' };
  return known[m] || String(m).replace(/^databricks-/, '');
}

function renderTokens(tokens) {
  const rows = Object.entries(tokens || {});
  if (!rows.length) return '<div class="score-reason">No AI model calls for this question (the query engine doesn\'t report its own token counts).</div>';
  return `<table class="mini"><thead><tr><th>Step</th><th>Model</th><th>Calls</th><th>Input</th><th>Output</th></tr></thead><tbody>${rows.map(([f, e]) =>
    `<tr><td>${esc(featureLabel(f))}</td><td>${esc(modelName(e.model))}</td><td>${fmtNum(e.calls)}</td><td>${fmtNum(e.input)}</td><td>${fmtNum(e.output)}</td></tr>`).join('')}</tbody></table>`;
}

function renderGuardEvents(events) {
  if (!events || !events.length) return '<div class="score-reason">No guardrail checks fired.</div>';
  return `<div class="retry-pills">${events.map(e =>
    `<span class="retry-pill" title="${esc(e.detail || '')}">${e.stage}: ${esc(guardLabel(e.check))} → ${e.action} (${e.by})</span>`).join('')}</div>`;
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
    const resultChip = e.guard_action === 'blocked' ? '<span class="chip cache" title="Stopped by a guardrail before reaching the query engine">blocked</span>'
      : e.success ? '<span class="chip ok">answered</span>'
      : `<span class="chip bad" title="${esc(e.error_message || '')}">failed</span>`;
    tr.innerHTML = `<td>${new Date(e.created_at).toLocaleString()}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.user_email)}</td>
      <td><span class="badge ${e.mode === 'agent' ? 'amber' : 'green'}">${esc(e.mode)}</span></td>
      <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.question)}">${esc(e.question)}</td>
      <td>${resultChip}</td><td>${ratingChip(e.feedback)}</td><td>${faithChip(e.faithfulness)}</td>
      <td>${e.from_cache ? `<span class="chip cache" title="Answered from the answer cache">⚡ ${fmtMs(e.latency_ms)}</span>` : fmtMs(e.latency_ms)}</td><td>▸</td>`;

    const detailTr = document.createElement('tr');
    detailTr.className = 'turn-detail-row';
    const td = document.createElement('td');
    td.colSpan = 9;
    const c = d.cache || null;
    const cacheFact = !c ? null
      : c.hit ? `Answered from cache (${c.match === 'semantic' && c.similarTo ? `similar question "${esc(c.similarTo.question.slice(0, 80))}", ${(c.similarTo.similarity * 100).toFixed(1)}% similar, ` : ''}${c.source === 'prewarm' ? 'pre-warmed suggested question' : 'earlier answer'}, generated ${new Date(c.generatedAt).toLocaleString()}${c.originalLatencyMs ? `, originally took ${fmtMs(c.originalLatencyMs)}` : ''})`
      : c.refreshed ? 'Refreshed: cache bypassed, answered live'
      : c.closest ? `Cache miss: closest cached question "${esc(c.closest.question.slice(0, 80))}" was ${(c.closest.similarity * 100).toFixed(1)}% similar${c.closest.sameDetails ? '' : ', with different key details'}${c.stored ? '; answered live and saved to the cache' : ''}`
      : c.stored ? 'Cache miss: answered live and saved to the cache'
      : 'Cache miss: answered live';
    const facts = [
      cacheFact,
      `Session: ${esc(e.session_title || String(e.session_id || '').slice(0, 8))}`,
      `SQL queries: ${(d.queries || []).length}`,
      `Charts: ${d.charts ?? 0}`,
      d.agentSteps != null ? `Agent steps: ${d.agentSteps}` : null,
      d.contextCarriedOver ? 'Context carried over from the other mode' : null,
      (d.sources || []).length ? `Data sources: ${esc(d.sources.join(', '))}` : null,
      d.followUps ? `Follow-ups suggested: ${d.followUps}` : null,
      e.feedback_reason ? `Feedback: ${esc(e.feedback_reason.replace(/_/g, ' '))}${e.feedback_comment ? ` ("${esc(e.feedback_comment)}")` : ''}` : null,
      d.genieConversationId ? `Conversation: ${esc(d.genieConversationId)}` : null,
      d.genieMessageId ? `Message: ${esc(d.genieMessageId)}` : null,
    ].filter(Boolean);
    td.innerHTML = `
      <div class="turn-detail">
        <div class="turn-detail-grid">
          <div class="turn-detail-block">
            <div class="lab">Answer</div>
            <div class="answer-box">${esc(stripCitations(d.answerPreview || (e.success ? '—' : 'No answer was returned.'))
              .replace(/\*\*/g, '').replace(/\[\[chart:[^\]]+\]\]/g, '[chart]').replace(/\\([[\]])/g, '$1'))}</div>
          </div>
          <div class="turn-detail-block">
            <div class="lab">Details</div>
            <div class="retry-pills">${facts.map(f => `<span class="retry-pill">${f}</span>`).join('')}</div>
            ${e.error_message ? `<div class="lab" style="margin-top:12px">Error</div><div class="codebox">${esc(e.error_message)}</div>` : ''}
            <div class="lab" style="margin-top:12px">AI model usage</div>
            ${renderTokens(d.tokens)}
          </div>
        </div>
        <div class="turn-detail-grid">
          <div class="turn-detail-block"><div class="lab">Answer quality</div>${renderJudge(d.judge)}</div>
          <div class="turn-detail-block"><div class="lab">Guardrails</div>${renderGuardEvents(d.guardrails && d.guardrails.events)}</div>
        </div>
        <div class="turn-detail-block"><div class="lab">Request trace</div>${d.trace ? renderWaterfall(d.trace, e.latency_ms, d.timeline) : renderTimeline(d.timeline, e.latency_ms)}</div>
        ${c && c.hit && c.originalTimeline && c.originalTimeline.length ? `<div class="turn-detail-block"><div class="lab">How it was originally answered</div>${renderTimeline(c.originalTimeline, c.originalLatencyMs)}</div>` : ''}
        <div class="turn-detail-block"><div class="lab">Generated SQL${c && c.hit ? ' (when the cached answer was generated)' : ''}</div>${renderQueries(d.queries)}</div>
      </div>`;
    detailTr.appendChild(td);
    tr.addEventListener('click', () => {
      detailTr.classList.toggle('open');
      tr.lastElementChild.textContent = detailTr.classList.contains('open') ? '▾' : '▸';
    });
    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });
  if (!rows.length) tbody.innerHTML = '<tr><td colspan="9">No questions yet.</td></tr>';
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
  kpis.appendChild(kpiCard('Avg Latency', fmtMs(Number(data.totals.avg_live_latency_ms ?? data.totals.avg_latency_ms)),
    'Live answers, excluding cache hits'));
  const hits = data.totals.cache_hits || 0;
  kpis.appendChild(kpiCard('Cache Hits', data.totals.total_questions ? Math.round((100 * hits) / data.totals.total_questions) + '%' : '—',
    `${fmtNum(hits)} answered instantly${data.totals.semantic_hits ? ` (${fmtNum(data.totals.semantic_hits)} similar-question)` : ''}${hits ? ` · avg ${fmtMs(Number(data.totals.avg_cache_latency_ms))}` : ''}${Number(data.totals.engine_ms_saved) ? ` · ${fmtMs(Number(data.totals.engine_ms_saved))} of waiting saved` : ''}`));
  const judgeCfg = data.ai && data.ai.config && data.ai.config.judge;
  const judged = data.totals.judged || 0;
  kpis.appendChild(kpiCard('Faithfulness', judged ? Math.round(Number(data.totals.avg_faithfulness) * 100) + '%' : '—',
    judgeCfg ? `${fmtNum(judged)} judged · ${judgeCfg.model ? esc(judgeCfg.model) : 'numbers check only'}${data.totals.low_faithfulness ? ` · ${fmtNum(data.totals.low_faithfulness)} below ${Math.round((judgeCfg.warnBelow || 0.7) * 100)}%` : ''}` : 'Judge off',
    data.totals.low_faithfulness ? 'warn' : null));
  const pctOrDash = v => (v === null || v === undefined ? '—' : Math.round(Number(v) * 100) + '%');
  if (judgeCfg && data.totals.avg_relevance !== null) {
    kpis.appendChild(kpiCard('Relevance', pctOrDash(data.totals.avg_relevance),
      `Completeness ${pctOrDash(data.totals.avg_completeness)} · Safety ${pctOrDash(data.totals.avg_safety)}`));
  }
  kpis.appendChild(kpiCard('Blocked', fmtNum(data.totals.blocked || 0),
    data.ai && data.ai.config && data.ai.config.guardrails ? 'Questions stopped by guardrails' : 'Guardrails off'));
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

  renderCache(data.cache);
  renderAi(data.ai);
  renderCost(data.cost);
  obsFeedback = data.feedbackQueue || [];
  renderFeedback();

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

/** Tokens by feature and model, and an estimated cost when prices are configured. */
function renderCost(cost) {
  const status = document.getElementById('obsCostStatus');
  const tbody = document.querySelector('#costTable tbody');
  const rows = (cost && cost.rows) || [];
  const tot = rows.reduce((a, r) => ({ calls: a.calls + r.calls, input: a.input + r.input, output: a.output + r.output, cost: a.cost + (r.cost || 0) }), { calls: 0, input: 0, output: 0, cost: 0 });
  status.innerHTML = `<div class="retry-pills">
    <span class="retry-pill">${fmtNum(tot.calls)} model calls</span>
    <span class="retry-pill">${fmtNum(tot.input)} input tokens · ${fmtNum(tot.output)} output tokens</span>
    <span class="retry-pill">${cost && cost.priced ? `Estimated cost $${tot.cost.toFixed(2)}` : 'Cost: set "pricing" in the deploy config to estimate it'}</span>
    <span class="retry-pill">The query engine's own usage is billed with the SQL warehouse and isn't counted here</span></div>`;
  tbody.innerHTML = rows.map(r => `<tr><td>${esc(featureLabel(r.feature))}</td><td>${esc(r.modelLabel)}</td>
    <td>${r.source === 'evals' ? 'Eval runs' : `${fmtNum(r.questions)} question${r.questions === 1 ? '' : 's'}`}</td>
    <td>${fmtNum(r.calls)}</td><td>${fmtNum(r.input)}</td><td>${fmtNum(r.output)}</td><td>${r.cost === null ? '—' : '$' + r.cost.toFixed(4)}</td></tr>`).join('')
    || '<tr><td colspan="7">No AI model calls recorded yet.</td></tr>';
}

const FB_REASON_LABELS = { wrong_numbers: 'Wrong numbers', wrong_data: 'Wrong products, buckets or filters', not_answered: "Didn't answer the question", unclear: 'Hard to understand', other: 'Something else' };
const REVIEW_LABELS = { open: 'Open', fixed: 'Fixed', dismissed: 'Dismissed', added_to_evals: 'Added to evals' };

/** The 👎 review queue: each one can be marked fixed, dismissed, or added to the evaluation suite. */
function renderFeedback() {
  const want = document.getElementById('fbFilter').value;
  const rows = want ? obsFeedback.filter(f => f.review_status === want) : obsFeedback;
  const tbody = document.querySelector('#feedbackTable tbody');
  tbody.innerHTML = '';
  rows.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(f.created_at).toLocaleString()}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.user_email)}</td>
      <td style="max-width:320px;white-space:normal" title="${esc(f.answer_preview)}">${esc(f.question)}</td>
      <td style="white-space:normal">${esc(FB_REASON_LABELS[f.feedback_reason] || 'No reason given')}${f.feedback_comment ? `<div class="score-reason">“${esc(f.feedback_comment)}”</div>` : ''}</td>
      <td>${faithChip(f.faithfulness)}</td>
      <td><span class="chip ${f.review_status === 'open' ? 'warn' : 'neutral'}">${esc(REVIEW_LABELS[f.review_status] || f.review_status)}</span>${f.reviewed_by ? `<div class="score-reason">${esc(f.reviewed_by)}</div>` : ''}</td>
      <td class="fb-actions">${f.review_status === 'open'
        ? '<button data-s="fixed">Fixed</button><button data-s="added_to_evals">Add to evals</button><button data-s="dismissed">Dismiss</button>'
        : '<button data-s="open">Reopen</button>'}</td>`;
    tr.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await fetch(`/api/admin/feedback/${f.event_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: b.dataset.s }),
      });
      if (r.ok) { f.review_status = b.dataset.s; renderFeedback(); } else b.disabled = false;
    }));
    tbody.appendChild(tr);
  });
  if (!rows.length) tbody.innerHTML = `<tr><td colspan="7">${obsFeedback.length ? 'Nothing here.' : 'No 👎 feedback yet.'}</td></tr>`;
}
document.getElementById('fbFilter').addEventListener('change', renderFeedback);

/** What's in the answer cache for the current data and semantic-model versions. */
function renderCache(cache) {
  const status = document.getElementById('obsCacheStatus');
  const tbody = document.querySelector('#cacheTable tbody');
  tbody.innerHTML = '';
  if (!cache) {
    status.innerHTML = '<div class="score-reason">Answer cache unavailable (run the deploy lakebase step to create its tables).</div>';
    return;
  }
  const v = Object.fromEntries((cache.versions || []).map(r => [r.name, r]));
  const p = cache.lastPrewarm;
  const prewarm = !p ? 'not run yet'
    : `${p.status}, ${p.answered} question${p.answered === 1 ? '' : 's'} answered, ${new Date(p.finished_at || p.started_at).toLocaleString()}`;
  status.innerHTML = `<div class="retry-pills">
    <span class="retry-pill">${cache.enabled ? 'Cache on' : 'Cache off (LENSS_ANSWER_CACHE=off)'}</span>
    <span class="retry-pill">Data version: ${esc(v.data ? v.data.version : '—')}</span>
    <span class="retry-pill">Semantic model version: ${esc(v.genie ? v.genie.version : '—')}</span>
    <span class="retry-pill">Last pre-warm: ${esc(prewarm)}</span>
    <span class="retry-pill">${fmtNum(cache.entries.length)} cached answer${cache.entries.length === 1 ? '' : 's'}</span></div>`;
  cache.entries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.question)}">${esc(e.question)}</td>
      <td><span class="badge ${e.mode === 'agent' ? 'amber' : 'green'}">${esc(e.mode)}</span></td>
      <td>${e.source === 'prewarm' ? 'Pre-warmed' : 'Earlier answer'}</td><td>${fmtNum(e.hits)}</td>
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td>${e.expires_at ? new Date(e.expires_at).toLocaleString() : 'When the data or semantic model changes'}</td>`;
    tbody.appendChild(tr);
  });
  if (!cache.entries.length) tbody.innerHTML = '<tr><td colspan="6">Nothing cached for the current versions yet.</td></tr>';
}

/** Which AI features are on, with their models, and what the guardrails have done. */
function renderAi(ai) {
  const status = document.getElementById('obsAiStatus');
  const c = (ai && ai.config) || {};
  const pill = s => `<span class="retry-pill">${s}</span>`;
  const g = c.guardrails;
  status.innerHTML = `<div class="retry-pills">
    ${pill(c.semanticCache ? `Semantic cache: on, ≥ ${(c.semanticCache.threshold * 100).toFixed(0)}% similar · ${esc(c.semanticCache.model)}` : 'Semantic cache: off')}
    ${pill(g ? `Guardrails: on · ${g.model ? 'classifier ' + esc(g.model) : 'pattern checks only'}` : 'Guardrails: off')}
    ${g ? pill(`Input: PII ${g.input.pii}, profanity ${g.input.profanity}, injection ${g.input.prompt_injection}, off-topic ${g.input.off_topic}`) : ''}
    ${g ? pill(`Output: PII ${g.output.pii}, profanity ${g.output.profanity}, policy checks ${g.output.policy_checks}`) : ''}
    ${pill(c.judge ? `Answer-quality judge: on · ${c.judge.model ? esc(c.judge.model) : 'numbers check only'} · ${c.judge.samplePercent}% of answers · warns below ${Math.round((c.judge.warnBelow || 0.7) * 100)}%` : 'Answer-quality judge: off')}
    ${pill(c.followUps ? `Follow-up suggestions: ${esc(c.followUps.model)}` : 'Follow-up suggestions: engine only')}
    ${pill(c.evals ? `Evals: on · up to ${c.evals.maxAccuracyCases} ground-truth questions per run` : 'Evals: off')}
  </div>`;
  const counts = document.querySelector('#guardTable tbody');
  counts.innerHTML = ((ai && ai.guardCounts) || []).map(r =>
    `<tr><td>${esc(r.stage)}</td><td>${esc(guardLabel(r.check_name))}</td><td>${esc(r.action)}</td><td>${fmtNum(r.n)}</td></tr>`).join('')
    || '<tr><td colspan="4">No guardrail checks have fired.</td></tr>';
  const events = document.querySelector('#guardEventsTable tbody');
  events.innerHTML = ((ai && ai.guardEvents) || []).map(e => {
    const checks = (e.events || []).map(x => `${guardLabel(x.check)} (${x.action})`).join(', ');
    return `<tr><td>${new Date(e.created_at).toLocaleString()}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.user_email)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.question)}">${esc(e.question)}</td>
      <td>${esc(e.guard_action)}: ${esc(checks)}</td></tr>`;
  }).join('') || '<tr><td colspan="4">No guardrail events yet.</td></tr>';
}
