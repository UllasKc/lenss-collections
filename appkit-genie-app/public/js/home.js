// ---------------------------------------------------------------- Command Center
// The one-minute view for a collections leader, told as one story in five chapters:
// are we on track, how healthy is the book, what is holding us back, where is the money,
// and what to do this week.
// The "why" (drill-downs by product, stage, region, channel, strategy, driver, collector,
// with filters) lives in the Explorer (explorer.js). Every figure comes from the certified
// views (no AI). Each panel has an "Ask LensS" link that opens the assistant with the right question.

const hEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CUR = '₹';
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

/** ₹53.4M, ₹612K, ₹940. The portfolio is in Indian rupees (Currency_Code INR in the data model). */
function money(v, digits = 1) {
  const n = num(v);
  if (n === null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return CUR + (n / 1e9).toFixed(digits) + 'B';
  if (a >= 1e6) return CUR + (n / 1e6).toFixed(digits) + 'M';
  if (a >= 1e3) return CUR + (n / 1e3).toFixed(a >= 1e5 ? 0 : digits) + 'K';
  return CUR + Math.round(n).toLocaleString('en-IN');
}
const pct = (v, d = 1) => (num(v) === null ? '—' : (num(v) * 100).toFixed(d) + '%');
const count = v => (num(v) === null ? '—' : Math.round(num(v)).toLocaleString('en-US'));
const tone = a => (a === null ? 'neutral' : a < 0.88 ? 'bad' : a < 0.95 ? 'warn' : 'good');

const ICONS = {
  cash: '<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>',
  gap: '<path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  handshake: '<path d="M8 12l3 3 6-6"/><circle cx="12" cy="12" r="9"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15"/>',
  digital: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  slip: '<path d="M4 6l7 7 4-4 5 5"/><path d="M20 10v4h-4"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.8"/>',
  promise: '<path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="5" y="11" width="14" height="10" rx="2"/>',
  spark: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>',
};
const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const askBtn = (q, mode = 'agent', label = 'Ask LensS') =>
  `<button class="ask-link" data-ask="${hEsc(q)}" data-mode="${mode}" title="${hEsc(q)}">${icon('spark', 'ico-xs')}${label}</button>`;

/** A panel: title, a one-line "so what", its Ask LensS question, and a body. */
function panel(id, title, sub, ask, body) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="panel-head"><div><h3>${hEsc(title)}</h3>${sub ? `<div class="panel-sub">${sub}</div>` : ''}</div>${ask ? askBtn(ask.q, ask.mode) : ''}</div><div class="panel-body">${body}</div>`;
}

/** A labelled horizontal bar; `scale` is the value that fills the track. */
function bar(label, value, scale, shown, t = 'brand', sub = '', marker = null) {
  const w = Math.max(0, Math.min(100, (num(value) / scale) * 100));
  return `<div class="hbar"><div class="hbar-top"><span class="hbar-label">${label}</span><span class="hbar-val">${shown}</span></div>
    <div class="hbar-track">${marker !== null ? `<span class="hbar-marker" style="left:${Math.min(100, (marker / scale) * 100)}%" title="Target"></span>` : ''}<span class="hbar-fill t-${t}" style="width:${w.toFixed(1)}%"></span></div>
    ${sub ? `<div class="hbar-sub">${sub}</div>` : ''}</div>`;
}

function skeletons() {
  document.querySelectorAll('#tab-home .panel').forEach(p => { if (!p.innerHTML.trim()) p.innerHTML = '<div class="skel skel-h"></div><div class="skel"></div><div class="skel"></div><div class="skel short"></div>'; });
  const k = document.getElementById('execKpis');
  if (!k.innerHTML.trim()) k.innerHTML = Array.from({ length: 5 }, () => '<div class="xkpi skel-card"><div class="skel"></div><div class="skel skel-h"></div></div>').join('');
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  return window.userFirstName ? `${part}, ${window.userFirstName}` : part;
}
document.addEventListener('lenss:user', () => { const g = document.getElementById('heroGreeting'); if (g) g.textContent = greeting(); });

// ---------------------------------------------------------------- KPI dictionary
// One place that says what every figure means and how it is calculated (the "KPI Dict").
const KPI_DICT = [
  ['Total Outstanding Portfolio', 'Total balance currently under collections.', 'Sum of outstanding balance for accounts past due (DPD > 0) on the snapshot date.'],
  ['Recovery Collected MTD', 'Total collections recovered this month.', 'Sum of month-to-date recoveries for accounts in collections.'],
  ['Recovery Rate %', 'How much of the book we are turning into cash.', 'Recovery collected ÷ outstanding portfolio.'],
  ['Accounts in Collections', 'Size of the active delinquent book.', 'Distinct accounts past due (DPD > 0).'],
  ['High-Risk Accounts', 'Customers unlikely to pay without action.', 'Accounts with non-payment risk ≥ 0.70 (business rule R07).'],
  ['Priority accounts / Recoverable now', 'High-risk customers who are still likely to pay: the immediate-intervention list.', 'High-risk accounts (risk ≥ 0.70) with payment propensity ≥ 0.25; recoverable now = their incremental recovery opportunity.'],
  ['Customers reached (RPC rate)', 'Contact effectiveness.', 'Accounts where we reached the right person ÷ accounts we attempted to contact.'],
  ['Agreed to pay (PTP conversion)', 'Customer commitment.', 'Accounts with a promise to pay ÷ accounts we reached (right-party contact).'],
  ['Promises honoured', 'Early-warning signal: the inverse is the broken-promise rate.', 'Promises already due that were kept ÷ promises already due.'],
  ['Amount promised', 'Cash committed by customers.', 'Sum of promise-to-pay amounts this month.'],
  ['Accounts worsening (roll forward)', 'Deterioration indicator.', 'Accounts that moved to a later arrears stage this month ÷ accounts in collections; roll back is the share that improved.'],
  ['Cost to collect', 'Efficiency of collections.', 'Month-to-date collection cost ÷ recovery collected (cost per ₹1 collected).'],
  ['Contact attempts per customer', 'Contact intensity (and over-contact risk). Attempts include calls, SMS, WhatsApp and email, answered or not; customers actually spoken to are "Customers reached".', 'Average contact attempts per account this month.'],
  ['Target Achievement %', 'Progress to the monthly recovery target.', 'Recovery collected ÷ monthly target (product × arrears-stage targets).'],
  ['Target Gap', 'Still to collect this month.', 'Monthly target − recovery collected (never below zero).'],
  ['Outlook: end-of-month recovery', 'Where we are likely to land.', 'Collected so far + promises falling due by month-end × the honour rate of promises already due. A pipeline view, not a statistical forecast.'],
  ['Likelihood of hitting target', 'How safe the target is.', 'High if expected promise collections cover the remaining gap 1.5× or more; Medium if 1.0–1.5×; Low below 1.0×.'],
  ['Action center queues', 'Where to put effort today.', 'High propensity + high balance: propensity ≥ 0.60 and balance ≥ ₹100K. PTP due: promises due in the next 7 days. Broken-PTP queue: due in 7 days with propensity < 0.35 or risk ≥ 0.60. Rolling to 180+: 150–180 days past due.'],
];
function openKpiDict() {
  document.getElementById('kpiDictBody').innerHTML = `<p class="score-reason">Governed population: accounts in collections (past due) on the snapshot date. Every figure comes from certified views; no AI computes them.</p>
    <table class="mini kpi-table"><thead><tr><th>Metric</th><th>Why it matters</th><th>How it is calculated</th></tr></thead><tbody>
    ${KPI_DICT.map(([m, w, c]) => `<tr><td><b>${hEsc(m)}</b></td><td>${hEsc(w)}</td><td>${hEsc(c)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('kpiDict').showModal();
}
['kpiDictBtn', 'kpiDictBtn2'].forEach(id => document.getElementById(id)?.addEventListener('click', openKpiDict));
document.getElementById('kpiDictClose').addEventListener('click', () => document.getElementById('kpiDict').close());
document.getElementById('kpiDict').addEventListener('click', (e) => { if (e.target.id === 'kpiDict') e.target.close(); });
document.getElementById('kpiMoreBtn').addEventListener('click', (e) => {
  const sec = document.getElementById('execKpis2');
  sec.hidden = !sec.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!sec.hidden));
  e.currentTarget.textContent = sec.hidden ? 'Show 5 more metrics' : 'Show fewer metrics';
});
const setTake = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

/** Lets the browser paint before the next panel is built (a hidden tab doesn't paint, so it doesn't wait). */
const nextFrame = () => new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));

/**
 * One story, top to bottom, each chapter answering one question and leading to the next:
 *   1. Are we on track? (hero)  2. How healthy is the book?  3. What is holding us back?
 *   4. What should we do this week?  5. What more can we recover from high-risk customers?
 * Each figure appears in one place only. Both requests start at once; the hero is drawn
 * from the (small) summary first, then the chapters follow in page order, one per frame.
 */
async function loadHome() {
  skeletons();
  const summaryReq = fetch('/api/dashboard/summary').then(r => r.json());
  const overviewReq = fetch('/api/dashboard/overview').then(r => r.json()).catch(() => ({}));
  // One panel's problem never blanks the page.
  const run = fn => { try { fn(); } catch (err) { console.error('Command Center panel failed', err); } };
  const summary = await summaryReq;
  run(() => renderHero(summary, {}, {}));
  const o = (await overviewReq) || {};
  const cc = o.cc || {};
  const steps = [
    () => renderHero(summary, o, cc), () => renderExecSummary(summary, o, cc),
    () => renderBookHealth(summary, o, cc), () => renderRisk(cc),
    () => renderIssues(summary, o, cc),
    () => renderActionCenter(cc, o),
    () => renderMoney(summary, o), () => renderOpportunity(o), () => renderAccounts(summary, o), () => renderActions(o),
  ];
  for (const fn of steps) { run(fn); await nextFrame(); }
  // Then the other tabs load in the background while the browser is idle, so they open
  // instantly. The Command Center always comes first; the Assistant loads its own when idle.
  (window.requestIdleCallback || (f => setTimeout(f, 1000)))(() => {
    if (window.loadExplorer) window.loadExplorer();
    if (window.loadMonitoring) window.loadMonitoring({ maxAgeMs: 60_000 });
  }, { timeout: 3000 });
}

/**
 * The counts behind the rates, so a figure can say "1,234 of 1,886" where it is read.
 * Each comes from the certified views; the two not stored as counts are derived exactly
 * from them (promises already due = broken ÷ broken share; accounts worsening = rate × accounts).
 */
function counts(o, cc) {
  const k = cc.kpis || {}, f = o.funnel || {}, a = cc.actions || {};
  const share = num(k.Broken_Share_Of_Due_Promises);
  const roll = num(k.Roll_Forward_Rate);
  return {
    accounts: num(k.Accounts_In_Collections),
    broken: num(k.Broken_PTP_Accounts),
    due: share ? Math.round(num(k.Broken_PTP_Accounts) / share) : null,
    worsened: roll !== null && num(k.Accounts_In_Collections) !== null ? Math.round(roll * num(k.Accounts_In_Collections)) : null,
    attempted: num(f.Attempted_Accounts), reached: num(f.RPC_Accounts), promised: num(f.PTP_Accounts), kept: num(f.Kept_PTP_Accounts),
    due7: num(a.PTP_Due_7d_Accounts),
  };
}
/** "1,234 of 1,886", or just the first number when the second isn't known yet. */
const ofN = (a, b) => (num(a) === null ? '—' : num(b) === null ? count(a) : `${count(a)} of ${count(b)}`);

/** 1. Are we on track? The verdict, progress to target, and the month-end outlook. */
function renderHero(s, o, cc) {
  document.getElementById('heroGreeting').textContent = greeting();
  const ach = num(s.achievement_pct);
  const out = cc.outlook || {};
  const k = cc.kpis || {};
  const likely = out.Target_Likelihood;
  const broken = num(k.Broken_Share_Of_Due_Promises);
  // The answer first, in one sentence; the figures are in the tiles beside it.
  const c = counts(o, cc);
  const caveat = broken !== null ? `, but only if customers keep their promises: <b>${pct(broken, 0)}</b> of the promises already due were broken (${ofN(c.broken, c.due)})` : '';
  document.getElementById('heroSub').innerHTML = {
    Achieved: `We've <b>achieved</b> this month's target.`,
    High: `We're <b>on track</b> to hit this month's target${caveat}.`,
    Medium: `This month's target is <b>within reach</b>${caveat}.`,
    Low: `This month's target is <b>at risk</b>: the promises due before month-end won't cover what we still need.`,
  }[likely] || `We've collected <b>${money(s.mtd_collections)}</b> of this month's <b>${money(s.monthly_target)}</b> target.`;
  document.getElementById('heroProgress').innerHTML = `
    <div class="hp-track"><div class="hp-fill" style="width:${Math.min(100, (ach || 0) * 100).toFixed(1)}%"></div></div>
    <div class="hp-legend"><span><b>${money(s.mtd_collections)}</b> collected of <b>${money(s.monthly_target)}</b> · ${pct(ach)}</span><span>${likely ? `${count(out.Days_Remaining)} days left` : ''}</span></div>`;
  const outlookShare = num(out.Outlook_EOM_Recovery) !== null && num(out.Recovery_Target) ? num(out.Outlook_EOM_Recovery) / num(out.Recovery_Target) : null;
  document.getElementById('heroStats').innerHTML = [
    ['Still to collect', money(s.target_gap), likely ? `in ${count(out.Days_Remaining)} days` : 'this month', 'target'],
    ['Expected from promises', money(out.Expected_From_Promises), num(out.Gap_Coverage) !== null ? `${num(out.Gap_Coverage).toFixed(1)}× what we still need` : '', 'promise'],
    ['Month-end outlook', money(out.Outlook_EOM_Recovery), outlookShare !== null ? `${pct(outlookShare, 0)} of target` : '', 'gap'],
    ['Likelihood of hitting target', hEsc(likely || '—'), 'High ≥ 1.5× · Medium ≥ 1× · Low < 1×', 'check'],
  ].map(([l, v, sub, ic]) => `<div class="hs"><div class="hs-ico">${icon(ic)}</div><div><div class="hs-l">${l}</div><div class="hs-v">${v}</div><div class="hs-s">${sub}</div></div></div>`).join('');
  // Timestamps come from the warehouse in UTC; shown in the viewer's local time.
  const when = (v) => { const d = v ? new Date(v.replace(' ', 'T') + 'Z') : null; return d && !isNaN(d) ? d.toLocaleString() : v; };
  // The outlook's arithmetic in words, with the real figures.
  document.getElementById('heroNote').innerHTML = (likely
    ? `<div><b>How the outlook is worked out:</b> ${money(out.Recovery_Achieved ?? s.mtd_collections)} collected so far + ${money(out.Expected_From_Promises)} expected from promises = ${money(out.Outlook_EOM_Recovery)}. ` +
      `The ${count(out.Promises_Rest_Of_Month)} promises still due this month (of ${count(counts(o, cc).promised)} made) are worth ${money(out.Promised_Rest_Of_Month)}; ` +
      `so far ${pct(out.Promise_Honour_Rate, 0)} of the promises that fell due were kept, so we count ${pct(out.Promise_Honour_Rate, 0)} of that.</div>`
    : '') + (s.data_refreshed_at ? `<div class="hero-refresh">Data refreshed on ${when(s.data_refreshed_at)}</div>` : '');
}

/**
 * Executive summary: the five chapters in five plain lines, for a CEO, plus a bottom line.
 * Written from the same certified figures as the chapters, so it can't drift from them.
 * Each line jumps to its chapter.
 */
function renderExecSummary(s, o, cc) {
  const out = cc.outlook || {}, k = cc.kpis || {}, a = cc.actions || {}, r = o.rates || {};
  const c = counts(o, cc);
  const likely = out.Target_Likelihood;
  if (!likely) return;   // the overview hasn't arrived yet: the skeleton stays
  const risk = cc.riskSnapshot || [];
  const first = risk[0], last = risk[risk.length - 1];
  const better = first && last && num(last.Recovery_Rate) ? Math.round(num(first.Recovery_Rate) / num(last.Recovery_Rate)) : null;
  const brokenShare = num(k.Broken_Share_Of_Due_Promises);
  const inThree = brokenShare !== null && Math.abs(brokenShare * 3 - Math.round(brokenShare * 3)) < 0.1 ? `${Math.round(brokenShare * 3)} in 3` : pct(brokenShare, 0);
  const worst = (o.products || [])[0];
  // Plain-language shares where they are close to a simple fraction, otherwise the percentage.
  const share = (v) => { const x = num(v); if (x === null) return '—';
    for (const [f, w] of [[1 / 4, 'a quarter'], [1 / 3, 'a third'], [1 / 2, 'half'], [2 / 3, 'two thirds'], [3 / 4, 'three quarters']]) if (Math.abs(x - f) < 0.02) return w;
    return pct(x, 0); };
  const rpc = num(r.RPC_Rate);
  const reach = rpc === null ? '' : rpc < 0.5 ? 'we reach fewer than half the customers we try' : `we reach ${pct(rpc, 0)} of the customers we try`;
  const verdict = {
    Achieved: 'Target achieved.',
    High: `On track to beat the ${money(s.monthly_target)} target, but only if customers keep their promises.`,
    Medium: `The ${money(s.monthly_target)} target is within reach, but only if customers keep their promises.`,
    Low: `The ${money(s.monthly_target)} target is at risk; this week's promises decide it.`,
  }[likely];
  document.getElementById('execSumBottom').innerHTML = `<span class="es-bl">Bottom line</span>${hEsc(verdict)}`;
  const rows = [
    ['ch1', 'Where we stand', `${money(s.mtd_collections)} of ${money(s.monthly_target)} collected with ${count(out.Days_Remaining)} days left; on today's promises we land near ${money(out.Outlook_EOM_Recovery)}.`,
      money(out.Outlook_EOM_Recovery), 'month-end outlook', likely === 'Low' ? 'bad' : 'good'],
    ['ch2', 'The book', `${money(k.Outstanding_Portfolio, 2)} overdue across ${count(c.accounts)} accounts. ${share(k.Roll_Forward_Rate).replace(/^./, (ch) => ch.toUpperCase())} slipped further behind this month${better ? `, and early arrears recover about ${better}× better than the oldest debt` : ''}.`,
      money(k.Outstanding_Portfolio, 2), 'overdue', 'brand'],
    ['ch3', 'What is hurting us', `${inThree} promises are broken, and ${reach}${worst ? `. ${hEsc(worst.Product)} is furthest behind target` : ''}. Calling harder won't fix it.`,
      pct(brokenShare, 0), 'promises broken', 'bad'],
    ['ch4', 'This week', `Save ${count(a.PTP_Break_Risk_7d_Accounts)} promises at risk (${money(a.PTP_Break_Risk_7d_Amount)}), work ${count(a.HighProp_HighBal_Accounts)} high-value accounts (${money(a.HighProp_HighBal_Recoverable)}), and stop ${count(a.Rolling_To_180_Accounts)} accounts sliding past 180 days.`,
      count(a.PTP_Break_Risk_7d_Accounts), 'promises to save', 'warn'],
    ['ch5', 'Extra upside', `${money(s.recovery_opportunity)} more from ${count(s.immediate_intervention_accounts)} high-risk customers who are still likely to pay. Don't write them off.`,
      money(s.recovery_opportunity), 'more to recover', 'good'],
  ];
  document.getElementById('execSumList').innerHTML = rows.map(([id, label, line, fig, figLabel, tone], i) => `
    <li><a class="es-row" href="#${id}">
      <span class="es-n">${i + 1}</span>
      <span class="es-text"><span class="es-label">${hEsc(label)}</span><span class="es-line">${hEsc(line)}</span></span>
      <span class="es-fig es-${tone}"><b>${fig}</b><small>${hEsc(figLabel)}</small></span>
    </a></li>`).join('');
}

/** 2. How healthy is the book? The portfolio's vital signs (the target figures are in chapter 1). */
function renderBookHealth(s, o, cc) {
  const k = cc.kpis || {};
  const p = o.portfolio || {};
  const r = o.rates || {};
  const risk = cc.riskSnapshot || [];
  const first = risk[0], last = risk[risk.length - 1];
  const c = counts(o, cc);
  setTake('ch2Take', `<b>${money(k.Outstanding_Portfolio, 2)}</b> is overdue across <b>${count(k.Accounts_In_Collections)}</b> accounts. ` +
    `<b>${pct(k.Roll_Forward_Rate, 0)}</b> of them (${count(counts(o, cc).worsened)}) slipped into a later arrears stage this month` +
    (first && last ? `, and recovery falls from <b>${pct(first.Recovery_Rate)}</b> of the balance at ${hEsc(first.DPD_Bucket)} days to <b>${pct(last.Recovery_Rate)}</b> at ${hEsc(last.DPD_Bucket)}: the earlier we act, the more we recover.` : '.'));
  const card = (ic, label, value, sub, why, t, view = '') => `
    <div class="xkpi${t ? ' x-' + t : ''}" title="${hEsc(why)}">
      <div class="xkpi-top">${icon(ic, 'ico-sm')}<span>${label}</span></div>
      <div class="xkpi-v">${value}</div>
      <div class="xkpi-s">${sub}</div>
      <div class="xkpi-why">${hEsc(why)}</div>${view}
    </div>`;
  const keptRate = num(r.Broken_Promise_Rate) === null ? null : 1 - num(r.Broken_Promise_Rate);
  document.getElementById('execKpis').innerHTML = [
    card('cash', 'Overdue balance', money(k.Outstanding_Portfolio, 2), `${count(k.Accounts_In_Collections)} accounts in collections`, 'Total balance currently under collections'),
    card('pulse', 'Recovery rate', pct(k.Recovery_Rate, 2), `${money(k.Recovery_MTD)} collected this month of ${money(k.Outstanding_Portfolio, 2)} overdue`, 'How much of the book we turn into cash'),
    card('alert', 'High-risk accounts', count(k.High_Risk_Accounts), `${pct(num(k.High_Risk_Accounts) / num(k.Accounts_In_Collections))} of ${count(k.Accounts_In_Collections)} accounts (risk ≥ 0.70) · ${count(s.immediate_intervention_accounts)} still likely to pay`, 'Non-payment risk threshold exceeded; the priority list is the subset still likely to pay', 'warn', viewBtn('high_risk', 'View accounts', '', 'High-risk accounts', true)),
    card('slip', 'Accounts worsening', pct(k.Roll_Forward_Rate ?? p.roll_forward_rate), `${ofN(c.worsened, c.accounts)} moved to a later arrears stage · ${pct(p.roll_back_rate)} improved`, 'Deterioration indicator', 'warn', viewBtn('worsening', 'View accounts', '', 'Accounts worsening this month', true)),
    card('coin', 'Cost to collect', num(p.cost_to_collect) === null ? '—' : CUR + num(p.cost_to_collect).toFixed(3), `per ${CUR}1 collected: ${money(k.Collection_Cost)} spent ÷ ${money(k.Recovery_MTD)} collected`, 'Efficiency of collections'),
  ].join('');
  document.getElementById('execKpis2').innerHTML = [
    card('phone', 'Customers reached', pct(r.RPC_Rate), `${ofN(c.reached, c.attempted)} we tried to contact (RPC)`, 'Contact effectiveness'),
    card('handshake', 'Agreed to pay', pct(r.PTP_Conversion_Rate), `${ofN(c.promised, c.reached)} customers we spoke to (PTP conversion)`, 'Customer commitment'),
    card('promise', 'Promises honoured', pct(keptRate), `${ofN(c.kept, c.due)} payment promises now due`, 'Early-warning signal', keptRate !== null && keptRate < 0.5 ? 'bad' : null),
    card('handshake', 'Amount promised', money(p.ptp_amount), 'promised by customers this month', 'Cash committed by customers'),
    card('users', 'Contact attempts per customer', num(p.average_attempts) === null ? '—' : num(p.average_attempts).toFixed(1), 'calls, SMS, WhatsApp and email, answered or not · average this month', 'Contact intensity'),
  ].join('');
}
/** 2. (continued) Where the book sits: accounts, balance and recovery by arrears stage. */
function renderRisk(cc) {
  const rows = cc.riskSnapshot || [];
  const colors = ['#0E8F80', '#0B6E99', '#D97706', '#EA580C', '#DC2626'];
  const total = rows.reduce((a, r) => a + num(r.Accounts), 0);
  const stack = `<div class="stack">${rows.map((r, i) => `<span style="width:${(100 * num(r.Account_Share)).toFixed(2)}%;background:${colors[i]}" title="${hEsc(r.DPD_Bucket)} days: ${count(r.Accounts)} accounts (${pct(r.Account_Share)})">${num(r.Account_Share) > 0.07 ? pct(r.Account_Share, 0) : ''}</span>`).join('')}</div>`;
  const table = `<table class="mini risk-table"><thead><tr><th>Arrears stage</th><th>Accounts</th><th>Amount</th><th>Distribution</th><th>Recovery</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><span class="dot" style="background:${colors[i]}"></span>${hEsc(r.DPD_Bucket)} days</td><td>${count(r.Accounts)}</td><td>${money(r.Outstanding_Balance)}</td><td>${pct(r.Account_Share)}</td><td>${pct(r.Recovery_Rate, 2)}</td><td>${viewBtn('bucket', 'View', r.DPD_Bucket, `${r.DPD_Bucket} days past due`, true)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${count(total)}</td><td>${money(rows.reduce((a, r) => a + num(r.Outstanding_Balance), 0), 2)}</td><td>100%</td><td></td><td></td></tr></tbody></table>`;
  panel('pnlRisk', 'Portfolio risk snapshot', 'Accounts and balance by days past due',
    { q: 'How is our portfolio distributed across DPD buckets, and where is the risk concentrated?', mode: 'chat' }, stack + `<div class="table-scroll flat">${table}</div>`);
}


/** 3. What is holding us back? The issues, ranked by risk and money at stake (one list). */
/**
 * This month's promises as one bar: kept, broken, due this week (likely kept / at risk) and
 * due later. All from the same certified figures; the parts add up to the promises made.
 */
function promiseBar(c, a, out) {
  const later = num(out.Promises_Rest_Of_Month) - num(a.PTP_Due_7d_Accounts);
  const atRisk = num(a.PTP_Break_Risk_7d_Accounts);
  const weekOk = num(a.PTP_Due_7d_Accounts) - atRisk;
  const parts = [
    ['Kept', c.kept, 'kept'], ['Broken', c.broken, 'broken'],
    ['Due this week, likely kept', weekOk, 'week'], ['Due this week, at risk', atRisk, 'risk'], ['Due later this month', later, 'later'],
  ].filter(([, v]) => Number.isFinite(v) && v > 0);
  const total = parts.reduce((t, [, v]) => t + v, 0);
  if (!total) return '';
  return `<div class="pbar" role="img" aria-label="${hEsc(parts.map(([l, v]) => `${l}: ${count(v)}`).join(', '))}">
      ${parts.map(([l, v, k]) => `<span class="pb-${k}" style="width:${(100 * v / total).toFixed(2)}%" title="${hEsc(l)}: ${count(v)}"></span>`).join('')}</div>
    <div class="pbar-legend">
      <span class="pbar-group">Already due: ${parts.filter(([, , k]) => k === 'kept' || k === 'broken').map(([l, v, k]) => `<i class="pb-${k}"></i>${l.toLowerCase()} ${count(v)}`).join(' · ')}</span>
      <span class="pbar-group">Still to come: ${parts.filter(([, , k]) => k !== 'kept' && k !== 'broken').map(([l, v, k]) => `<i class="pb-${k}"></i>${l.replace('Due ', '').toLowerCase()} ${count(v)}`).join(' · ')}</span>
    </div>`;
}

function renderIssues(s, o, cc) {
  const p = o.portfolio || {};
  const out = cc.outlook || {};
  const k = cc.kpis || {};
  const a = cc.actions || {};
  const r = o.rates || {};
  const oc = o.overContact || {};
  const worst = (o.products || [])[0];
  const seg = (o.shortfall || [])[0];
  const c = counts(o, cc);
  setTake('ch3Take', `Broken promises are the biggest threat to the month: <b>${pct(k.Broken_Share_Of_Due_Promises, 0)}</b> of the promises already due were broken (${ofN(c.broken, c.due)}). ` +
    `Calling harder won't fix it: <b>${count(oc.accounts)}</b> customers (${pct(num(oc.accounts) / c.accounts, 0)} of accounts) are in customer groups already averaging 4.5+ contact attempts a month.`);
  const issues = [
    { sev: 'Critical', ic: 'promise', view: ['broken_ptp', `View ${count(k.Broken_PTP_Accounts)} broken promises`], title: 'Customers are breaking their promises to pay',
      metric: pct(k.Broken_Share_Of_Due_Promises, 0),
      body: `${count(c.promised)} customers promised to pay this month. Of the ${count(c.due)} promises already due, ${count(c.broken)} were broken and only ${count(c.kept)} kept. ` +
        `Of the ${count(num(out.Promises_Rest_Of_Month))} still to come, ${count(c.due7)} fall due this week, and ${count(a.PTP_Break_Risk_7d_Accounts)} of those look likely to break (${money(a.PTP_Break_Risk_7d_Amount)}).`,
      extra: promiseBar(c, a, out),
      driver: 'Promises taken from customers with low propensity or high non-payment risk.',
      q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?' },
    worst && { sev: 'High', ic: 'gap', view: ['product', `View ${worst.Product} accounts`, worst.Product], title: `${worst.Product} is furthest behind target`,
      metric: pct(worst.Achievement_Pct),
      body: `${money(worst.MTD_Collections)} collected of a ${money(worst.Monthly_Target)} target: ${money(worst.Target_Gap)} behind, the largest product gap.${seg ? ` The largest single gap is ${seg.Product} at ${seg.DPD_Bucket} days (${money(seg.Target_Gap)}).` : ''}`,
      driver: 'Every product and arrears stage is below target; the shortfall is concentrated in early-stage accounts.',
      q: `Why is ${worst.Product} behind target this month and what should we do about it?` },
    { sev: 'High', ic: 'slip', view: ['rolling_180', `View ${count(a.Rolling_To_180_Accounts)} accounts near 180+`], title: 'Accounts are sliding into late arrears',
      metric: pct(k.Roll_Forward_Rate, 0),
      body: `${ofN(c.worsened, c.accounts)} accounts moved to a later stage this month; ${count(a.Rolling_To_180_Accounts)} accounts (${money(a.Rolling_To_180_Exposure)}) are 150–180 days overdue, about to reach 180+.`,
      driver: 'Late-stage accounts recover at a fraction of early-stage rates.',
      q: 'Which accounts are about to roll into 180+ days past due, and what should we do before they do?' },
    { sev: 'Medium', ic: 'phone', view: ['not_reached', 'View customers not reached'], title: 'Too few customers are reached',
      metric: pct(r.RPC_Rate, 0),
      body: `We tried to contact ${ofN(c.attempted, c.accounts)} customers but spoke to only ${count(c.reached)} of them (${pct(r.RPC_Rate)}), and ${count(c.promised)} of those ${count(c.reached)} agreed to pay (${pct(r.PTP_Conversion_Rate)}).`,
      driver: 'Channel and contact-time mismatch for parts of the book.',
      q: 'Which channels and contact times work best for reaching customers, and how should we change our contact strategy?' },
    { sev: 'Medium', ic: 'users', view: ['over_contact', 'View these customers'], title: 'Some customers are over-contacted',
      metric: '4.5+ attempts',
      body: `${ofN(oc.accounts, c.accounts)} customers (${pct(num(oc.accounts) / c.accounts, 0)}) are in ${count(oc.segments ?? s.over_contact_segments)} customer groups that average 4.5+ contact attempts a month (calls, SMS, WhatsApp, email; the whole book averages ${num(p.average_attempts) === null ? '—' : num(p.average_attempts).toFixed(1)}): a complaint and regulatory risk to review.`,
      driver: 'Contact strategies that make more attempts per customer than the rest of the book.',
      q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.' },
  ].filter(Boolean);
  document.getElementById('issues').innerHTML = issues.map((c, i) => `
    <div class="prio issue sev-${c.sev.toLowerCase()}">
      <div class="prio-top"><span class="prio-rank">${i + 1}</span><span class="sev-tag">${c.sev}</span><span class="prio-metric">${c.metric}</span></div>
      <div class="prio-title">${icon(c.ic, 'ico-sm')} ${hEsc(c.title)}</div>
      <div class="prio-body">${hEsc(c.body)}</div>${c.extra || ''}
      <div class="issue-driver"><b>Likely driver:</b> ${hEsc(c.driver)}</div>
      <div class="card-btns">${viewBtn(c.view[0], c.view[1], c.view[2] || '', c.title)}${askBtn(c.q, 'agent', 'Ask LensS why')}</div>
    </div>`).join('');
}

/**
 * 5. What more can we recover from high-risk customers? Beyond this week's plan: the
 * priority accounts (high-risk, still likely to pay), what they are worth, and one next step each.
 */
function renderMoney(s, o) {
  const top = (o.opportunity || [])[0];
  setTake('ch5Take', `Beyond this week's plan, don't write off high-risk customers: <b>${count(s.immediate_intervention_accounts)}</b> of the ${count(((o.cc || {}).kpis || {}).High_Risk_Accounts)} are still likely to pay, ` +
    `and <b>${money(s.recovery_opportunity)}</b> more can be recovered from them` + (top ? `, most of it in ${hEsc(top.Product)} (${money(top.opportunity)})` : '') +
    `. Each gets one next step, with disputing and vulnerable customers supported first.`);
}

/** 4. What should we do this week? The work queues, most urgent first; together they are the plan. */
function renderActionCenter(cc, o) {
  const a = cc.actions || {};
  const otherDue = num(a.PTP_Due_7d_Accounts) !== null ? num(a.PTP_Due_7d_Accounts) - num(a.PTP_Break_Risk_7d_Accounts) : null;
  const otherAmt = num(a.PTP_Due_7d_Amount) !== null ? num(a.PTP_Due_7d_Amount) - num(a.PTP_Break_Risk_7d_Amount) : null;
  setTake('ch4Take', `First save the <b>${ofN(a.PTP_Break_Risk_7d_Accounts, a.PTP_Due_7d_Accounts)}</b> promises due this week that are likely to break (${money(a.PTP_Break_Risk_7d_Amount)}), ` +
    `then work the <b>${count(a.HighProp_HighBal_Accounts)}</b> high-value accounts likely to pay (${money(a.HighProp_HighBal_Recoverable)}), ` +
    `and stop <b>${count(a.Rolling_To_180_Accounts)}</b> accounts reaching 180+ days.`);
  const cards = [
    { ic: 'alert', when: 'Today', list: 'ptp_at_risk', t: 'Save promises likely to break', v: count(a.PTP_Break_Risk_7d_Accounts), unit: 'promises',
      d: `${ofN(a.PTP_Break_Risk_7d_Accounts, a.PTP_Due_7d_Accounts)} promises due in the next 7 days (${money(a.PTP_Break_Risk_7d_Amount)}), from customers with low propensity (< 0.35) or high risk (≥ 0.60). Call before the due date.`,
      q: 'Which customers with promises due in the next 7 days are likely to break them, and what follow-up should we do?', mode: 'agent', tone: 'bad' },
    { ic: 'promise', when: 'This week', list: 'ptp_due_other', t: 'Remind the other promises due', v: count(otherDue), unit: 'promises',
      d: `${ofN(otherDue, a.PTP_Due_7d_Accounts)} promises due in the next 7 days (${money(otherAmt)}), from customers likely to pay: a reminder on their preferred channel.`,
      q: 'Which promises to pay are due in the next 7 days, and how much is at stake?', mode: 'chat', tone: 'brand' },
    { ic: 'cash', when: 'This week', list: 'high_value', t: 'Work high-value accounts likely to pay', v: money(a.HighProp_HighBal_Recoverable), unit: 'recoverable',
      d: `${count(a.HighProp_HighBal_Accounts)} accounts with propensity ≥ 60% and balance ≥ ₹100K (${money(a.HighProp_HighBal_Balance)} balance).`,
      q: 'Which accounts have both high payment propensity and high balance, and how should we work them?', mode: 'chat', tone: 'good' },
    { ic: 'slip', when: 'This month', list: 'rolling_180', t: 'Stop accounts reaching 180+', v: money(a.Rolling_To_180_Exposure), unit: 'exposure',
      d: `${count(a.Rolling_To_180_Accounts)} accounts at 150–180 days past due, about to enter the lowest-recovery stage.`,
      q: 'Which accounts are about to roll into 180+ days past due, and what should we do before they do?', mode: 'agent', tone: 'warn' },
  ];
  document.getElementById('actionCenter').innerHTML = cards.map((c, i) => `
    <div class="act-card t-${c.tone}">
      <div class="act-step"><span class="prio-rank">${i + 1}</span><span class="act-when">${c.when}</span></div>
      <div class="act-top">${icon(c.ic, 'ico-sm')}<span>${hEsc(c.t)}</span></div>
      <div class="act-v">${c.v} <small>${hEsc(c.unit)}</small></div>
      <div class="act-d">${hEsc(c.d)}</div>
      <div class="card-btns">${viewBtn(c.list, 'View accounts', '', c.t)}${askBtn(c.q, c.mode)}</div>
    </div>`).join('');
}

const CHANNEL_ICON = { Voice: '📞', SMS: '💬', Email: '✉️', WhatsApp: '🟢', Field: '🚗', 'Digital Self-Cure': '📱' };
const ACTION_TONE = {
  'Route to hardship support': 'care', 'Route to dispute resolution': 'dispute', 'Immediate PTP follow-up': 'urgent',
  'Initiate preferred digital journey': 'digital', 'Assign to specialist collector': 'urgent', 'Prioritised collector outreach': 'standard',
};
function renderAccounts(s, o) {
  const rows = o.topAccounts || [];
  const body = `<div class="table-scroll flat"><table class="nice">
    <thead><tr><th>Account</th><th>Product · days overdue</th><th>Balance</th><th>Recoverable</th><th>Likely to pay</th><th>Why not paying</th><th>Next step</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="mono">${hEsc(r.Account_ID)}</td><td>${hEsc(r.Product)} <span class="muted">· ${count(r.DPD)} days</span></td>
      <td>${money(r.Outstanding_Balance)}</td><td><b>${money(r.Incremental_Recovery_Opportunity)}</b></td>
      <td><span class="pill-bar"><span style="width:${(num(r.Payment_Propensity) * 100).toFixed(0)}%"></span></span>${pct(r.Payment_Propensity, 0)}</td>
      <td>${hEsc(r.Primary_Nonpayment_Driver)}</td>
      <td><span class="action-chip a-${ACTION_TONE[r.Recommended_Action] || 'standard'}">${hEsc(r.Recommended_Action)}</span></td></tr>`).join('')}</tbody></table></div>`;
  panel('pnlAccounts', 'The priority accounts worth the most', `The 8 of ${count(s.immediate_intervention_accounts)} priority accounts with the most to recover, and the next step for each. ${viewBtn('priority', `View all ${count(s.immediate_intervention_accounts)}`, '', 'Priority accounts', true)}`,
    { q: 'Which accounts require immediate intervention?', mode: 'chat' }, body);
}

/** Recommended next steps: how the priority accounts should be handled (v1.6). */
function renderActions(o) {
  const rows = o.actions || [];
  const max = Math.max(...rows.map(r => num(r.accounts) || 0), 1);
  panel('pnlActions', 'How to handle each priority customer', 'One next step per priority account, from the business rules: disputing and vulnerable customers are supported first.',
    { q: 'Which accounts should go to hardship support or dispute resolution, and how should we handle them?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Recommended_Action), num(r.accounts), max, `${count(r.accounts)} <span class="muted">accounts</span>`,
      ACTION_TONE[r.Recommended_Action] === 'care' || ACTION_TONE[r.Recommended_Action] === 'dispute' ? 'warn' : 'brand',
      `${money(r.opportunity)} recoverable ${viewBtn('action', 'View accounts', r.Recommended_Action, r.Recommended_Action, true)}`)).join('') || '<div class="empty-note">No data.</div>');
}

/** Recovery opportunity by product (v1.6). */
function renderOpportunity(o) {
  const rows = o.opportunity || [];
  const max = Math.max(...rows.map(r => num(r.opportunity) || 0), 1);
  panel('pnlOpportunity', 'Recoverable from high-risk customers, by product', 'The priority accounts: high-risk customers who are still likely to pay.',
    { q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Product), num(r.opportunity), max, money(r.opportunity), 'good',
      `${count(r.accounts)} accounts ${viewBtn('priority_product', 'View', r.Product, `Priority accounts: ${r.Product}`, true)}`)).join('') || '<div class="empty-note">No data.</div>');
}

// ---------------------------------------------------------------- the accounts behind a figure
// Every card can show its accounts: the same rule as its number, at account level.
const LIST_RULES = {
  high_risk: 'Non-payment risk ≥ 0.70.',
  worsening: 'Moved to a later arrears stage than last month (roll forward).',
  bucket: 'All accounts in this arrears stage.',
  broken_ptp: 'A promise to pay fell due and was not kept.',
  product: 'All accounts in collections for this product, most to recover first.',
  rolling_180: '150–180 days past due: about to enter 180+, the lowest-recovery stage.',
  not_reached: 'Contact was attempted this month but the right person was never reached.',
  over_contact: 'In a customer group (strategy × product × stage × vulnerability, 30+ accounts) averaging 4.5+ contact attempts this month.',
  priority: 'Priority accounts: non-payment risk ≥ 0.70 and payment propensity ≥ 0.25 (business rule R08).',
  priority_product: 'Priority accounts (risk ≥ 0.70, propensity ≥ 0.25) for this product.',
  action: 'Priority accounts given this next step by the intervention rules.',
  ptp_at_risk: 'Promise due in the next 7 days, from a customer with payment propensity < 0.35 or non-payment risk ≥ 0.60.',
  ptp_due_other: 'Promise due in the next 7 days, from a customer likely to keep it.',
  high_value: 'Payment propensity ≥ 0.60 and balance ≥ ₹100K.',
};
const viewBtn = (list, label, value = '', title = '', sm = false) =>
  `<button class="view-btn${sm ? ' sm' : ''}" data-accounts="${list}" data-value="${hEsc(value)}" data-title="${hEsc(title)}">${hEsc(label)}</button>`;
let acctRows = [];
function openAccounts(list, value, title) {
  return showAccountList({
    url: `/api/dashboard/accounts?list=${encodeURIComponent(list)}${value ? '&value=' + encodeURIComponent(value) : ''}`,
    title, rule: LIST_RULES[list] || '', file: `lenss-${list}${value ? '-' + value.replace(/\W+/g, '-').toLowerCase() : ''}`,
  });
}
/** The accounts window, shared by the Command Center and the Explorer (window.showAccountList). */
async function showAccountList({ url, title, rule, file }) {
  const dlg = document.getElementById('acctDialog');
  document.getElementById('acctTitle').textContent = title || 'Accounts';
  document.getElementById('acctRule').textContent = rule || '';
  document.getElementById('acctSum').textContent = 'Loading accounts…';
  document.getElementById('acctBody').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel short"></div>';
  document.getElementById('acctCsv').disabled = true;
  if (!dlg.open) dlg.showModal();
  let d;
  try {
    const r = await fetch(url);
    d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  } catch (err) {
    document.getElementById('acctSum').textContent = 'These accounts could not be loaded. Please try again.';
    document.getElementById('acctBody').innerHTML = '';
    return;
  }
  const t = d.totals || {};
  acctRows = d.rows || [];
  document.getElementById('acctSum').innerHTML = `<b>${count(t.accounts)}</b> accounts · <b>${money(t.balance)}</b> balance · <b>${money(t.recoverable)}</b> recoverable` +
    (num(t.promised_7d) ? ` · <b>${money(t.promised_7d)}</b> promised in the next 7 days` : '') +
    (d.truncated ? ` <span class="muted">(the first ${count(acctRows.length)} are listed and exported)</span>` : '');
  // "Next step" exists only for priority accounts; a list without any leaves the column out.
  const hasStep = acctRows.some(r => r.Recommended_Action);
  document.getElementById('acctBody').innerHTML = `<table class="nice"><thead><tr><th>Account</th><th>Product · days overdue</th><th>Region</th><th>Balance</th><th>Recoverable</th>
      <th>Likely to pay</th><th>Risk</th><th>Promise</th><th>Why not paying</th>${hasStep ? '<th>Next step</th>' : ''}<th>Collector</th></tr></thead>
    <tbody>${acctRows.map(r => `<tr><td class="mono">${hEsc(r.Account_ID)}</td>
      <td>${hEsc(r.Product)} <span class="muted">· ${count(r.DPD)} days</span></td><td>${hEsc(r.Region)}</td>
      <td>${money(r.Outstanding_Balance)}</td><td><b>${money(r.Incremental_Recovery_Opportunity)}</b></td>
      <td>${pct(r.Payment_Propensity, 0)}</td><td>${pct(r.Nonpayment_Risk, 0)}</td>
      <td>${num(r.PTP_Amount) ? `${money(r.PTP_Amount)} <span class="muted">due ${hEsc(String(r.PTP_Due_Date || '').slice(0, 10))}${String(r.Broken_PTP_Flag) === '1' ? ', broken' : ''}</span>` : '<span class="muted">—</span>'}</td>
      <td>${hEsc(r.Primary_Nonpayment_Driver)}</td>
      ${hasStep ? `<td>${r.Recommended_Action ? `<span class="action-chip a-${ACTION_TONE[r.Recommended_Action] || 'standard'}">${hEsc(r.Recommended_Action)}</span>` : '<span class="muted">—</span>'}</td>` : ''}
      <td class="mono">${hEsc(r.Collector_ID)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('acctCsv').disabled = !acctRows.length;
  document.getElementById('acctCsv').onclick = () => {
    const cols = ['Account_ID', 'Product', 'DPD', 'DPD_Bucket', 'Region', 'Outstanding_Balance', 'Incremental_Recovery_Opportunity', 'Payment_Propensity',
      'Nonpayment_Risk', 'PTP_Amount', 'PTP_Due_Date', 'Broken_PTP_Flag', 'Primary_Nonpayment_Driver', 'Preferred_Channel', 'Vulnerability_Type', 'Recommended_Action', 'Collector_ID'];
    const cell = v => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [`# ${title}: ${rule || ''}`, cols.join(','), ...acctRows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${file || 'lenss-accounts'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
window.showAccountList = showAccountList;
document.getElementById('acctClose').addEventListener('click', () => document.getElementById('acctDialog').close());
document.getElementById('acctDialog').addEventListener('click', (e) => { if (e.target.id === 'acctDialog') e.target.close(); });
document.getElementById('tab-home').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accounts]');
  if (b) openAccounts(b.dataset.accounts, b.dataset.value, b.dataset.title);
});

// The story bar follows the reader: the chapter in view is highlighted.
if (window.IntersectionObserver) {
  const links = [...document.querySelectorAll('.story-nav a')];
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const id = e.target.id === 'homeHero' ? 'ch1' : e.target.id;
    links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  ['homeHero', 'ch2', 'ch3', 'ch4', 'ch5'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}

loadHome().catch(err => {
  console.error('Command Center failed to load', err);
  document.getElementById('heroSub').textContent = 'Some figures could not be loaded. Please refresh the page.';
});
