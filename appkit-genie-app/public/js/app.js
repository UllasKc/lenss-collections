// ---------- tab switching ----------
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('on');
    document.body.classList.toggle('assistant-on', btn.dataset.tab === 'assistant');
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
  if (abs >= 1e6) return '₹' + (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '₹' + (v / 1e3).toFixed(1) + 'K';
  return '₹' + Math.round(v).toLocaleString('en-IN');
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

/** "ullas.kc@concentrix.com" -> "Ullas": used to greet people by name. */
function firstNameOf(email) {
  const local = String(email || '').split('@')[0].split(/[._-]/)[0].replace(/\d+$/, '');
  return local && !/^local$/i.test(local) ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}
window.userFirstName = '';

async function loadUser() {
  try {
    const me = await fetch('/api/me').then(r => r.json());
    window.userFirstName = firstNameOf(me.email);
    document.getElementById('userNameDisplay').textContent = me.email || '';
    // Initials like Copilot: "ullas.kc@…" -> "UK", "ullaskc98@…" -> "U".
    const parts = String(me.email || '').split('@')[0].split(/[._-]/).map(x => x.replace(/[^a-z]/gi, '')).filter(Boolean);
    const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?')[0]).toUpperCase();
    ['userAvatar', 'sideAvatar'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = initials; });
    const nameEl = document.getElementById('sideName');
    if (nameEl) nameEl.textContent = window.userFirstName || (me.email || '').split('@')[0];
    const mailEl = document.getElementById('sideEmail');
    if (mailEl) mailEl.textContent = me.email || '';
    document.getElementById('assistantUserGreeting').textContent = me.email ? `Signed in as ${me.email}` : '';
    document.dispatchEvent(new CustomEvent('lenss:user', { detail: { firstName: window.userFirstName } }));
  } catch { /* non-fatal */ }
}

// Anything marked data-ask="<question>" (Command Center panels, priorities) opens the
// assistant and asks it, in the mode given by data-mode; data-tab-jump switches tabs.
document.addEventListener('click', (e) => {
  const ask = e.target.closest('[data-ask]');
  if (ask && window.askAssistant) { e.preventDefault(); window.askAssistant(ask.dataset.ask, ask.dataset.mode || 'agent'); return; }
  const jump = e.target.closest('[data-tab-jump]');
  if (jump) { e.preventDefault(); showTab(jump.dataset.tabJump); }
});

function showTab(name) {
  const b = document.querySelector(`.tabs button[data-tab="${name}"]`);
  if (b) b.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showTab = showTab;

loadUser();

// The assistant fills the screen below the top bar; keep its height in step with the bar.
const navEl = document.querySelector('.nav');
const setNavH = () => document.documentElement.style.setProperty('--nav-h', navEl.offsetHeight + 'px');
setNavH();
if (window.ResizeObserver) new ResizeObserver(setNavH).observe(navEl);
window.addEventListener('resize', setNavH);
