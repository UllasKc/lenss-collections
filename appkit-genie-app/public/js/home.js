// ---------------------------------------------------------------- Command Center
// The one-minute view for a collections leader: how the business is doing and what is
// happening (target, outlook, core metrics, brief, watchouts, risk, today's work queues).
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
  ['Contacts per customer', 'Contact intensity (and over-contact risk).', 'Average contact attempts per account this month.'],
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
  e.currentTarget.textContent = sec.hidden ? 'Show 7 more metrics' : 'Show fewer metrics';
});

/** Lets the browser paint before the next panel is built (a hidden tab doesn't paint, so it doesn't wait). */
const nextFrame = () => new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));

/**
 * Loads top to bottom: both requests start at once, the headline and executive summary
 * are drawn as soon as the (small) summary arrives, and the panels below follow in page
 * order when the overview arrives, one per frame so the top of the page shows first.
 */
async function loadHome() {
  skeletons();
  const summaryReq = fetch('/api/dashboard/summary').then(r => r.json());
  const overviewReq = fetch('/api/dashboard/overview').then(r => r.json()).catch(() => ({}));
  // One panel's problem never blanks the page.
  const run = fn => { try { fn(); } catch (err) { console.error('Command Center panel failed', err); } };
  const summary = await summaryReq;
  run(() => renderHero(summary, {}, {}));
  run(() => renderNarrative(summary));
  const o = (await overviewReq) || {};
  const cc = o.cc || {};
  const steps = [
    () => renderHero(summary, o, cc), () => renderPriorities(summary, o),
    () => renderExecKpis(summary, o, cc), () => renderBrief(summary, o, cc), () => renderWatchouts(summary, o, cc),
    () => renderRisk(cc), () => renderTarget(summary, cc), () => renderActionCenter(cc, o),
    () => renderActions(o), () => renderOpportunity(o), () => renderAccounts(summary, o),
  ];
  for (const fn of steps) { run(fn); await nextFrame(); }
}

function renderHero(s, o, cc) {
  document.getElementById('heroGreeting').textContent = greeting();
  const ach = num(s.achievement_pct);
  const out = cc.outlook || {};
  const likely = out.Target_Likelihood;
  // The outlook in plain words: what this month's promises should bring in (at today's
  // keep rate) against what is still needed (qry_cc_target_outlook).
  const expected = money(out.Expected_From_Promises);
  const cover = num(out.Gap_Coverage);
  const outlookLine = {
    Achieved: `Target <b>achieved</b>: ${money(out.Recovery_Achieved ?? s.mtd_collections)} collected against ${money(out.Recovery_Target ?? s.monthly_target)}.`,
    High: `Promises due before month-end could bring in about <b>${expected}</b>, more than <b>${Math.floor(cover)}×</b> what we still need, so we're <b>on track</b> to hit target.`,
    Medium: `Promises due before month-end could bring in about <b>${expected}</b>, just enough to close the gap, so target is <b>within reach</b> but needs promises kept.`,
    Low: `Promises due before month-end could bring in about <b>${expected}</b>, short of what we still need, so target is <b>at risk</b> without extra effort.`,
  }[likely];
  document.getElementById('heroSub').innerHTML =
    `We've collected <b>${money(s.mtd_collections)}</b> of this month's <b>${money(s.monthly_target)}</b> target, with <b>${money(s.target_gap)}</b> still to collect` +
    (likely ? ` and ${count(out.Days_Remaining)} days to go. ${outlookLine ?? ''}` : '.');
  document.getElementById('heroProgress').innerHTML = `
    <div class="hp-track"><div class="hp-fill" style="width:${Math.min(100, (ach || 0) * 100).toFixed(1)}%"></div></div>
    <div class="hp-legend"><span><b>${pct(ach)}</b> of target achieved</span><span>${money(s.mtd_collections)} / ${money(s.monthly_target)}</span></div>`;
  const p = o.portfolio || {};
  const a = cc.actions || {};
  document.getElementById('heroStats').innerHTML = [
    ['Recoverable now', money(s.recovery_opportunity), `from ${count(s.immediate_intervention_accounts)} priority accounts`, 'cash'],
    ['Customers in arrears', count(p.accounts ?? s.eligible_accounts), `${money(p.outstanding)} outstanding`, 'users'],
    ['High-risk customers', count(p.high_risk), 'unlikely to pay without action', 'alert'],
    // Same rule as the Action center's broken-PTP queue: due in 7 days, propensity < 0.35 or risk ≥ 0.60.
    ['Promises at risk this week', count(a.PTP_Break_Risk_7d_Accounts), `${money(a.PTP_Break_Risk_7d_Amount)} due in the next 7 days from customers likely to break`, 'promise'],
  ].map(([l, v, sub, ic]) => `<div class="hs"><div class="hs-ico">${icon(ic)}</div><div><div class="hs-l">${l}</div><div class="hs-v">${v}</div><div class="hs-s">${sub}</div></div></div>`).join('');
}

function renderNarrative(s) {
  const el = document.getElementById('narrative');
  el.textContent = s.narrative || 'No executive summary yet. Run the deploy\'s summary step: python deploy/deploy.py --config <config> --only summary';
  // Timestamps come from the warehouse in UTC; shown in the viewer's local time.
  const when = (v) => { const d = v ? new Date(v.replace(' ', 'T') + 'Z') : null; return d && !isNaN(d) ? d.toLocaleString() : v; };
  document.getElementById('narrativeMeta').textContent = s.data_refreshed_at ? `Data refreshed on ${when(s.data_refreshed_at)}` : '';
}

/** Today's priorities: four cards worked out from the data, each opening the right analysis. */
function renderPriorities(s, o) {
  const cards = [];
  const worst = (o.products || [])[0];
  if (worst) {
    cards.push({ sev: 'bad', ic: 'gap', kicker: 'Biggest gap to target', title: `${worst.Product} is at ${pct(worst.Achievement_Pct)} of target`,
      body: `${money(worst.Target_Gap)} behind plan, the largest gap in the portfolio.`, metric: money(worst.Target_Gap),
      q: `Why is ${worst.Product} behind target this month and what should we do about it?`, mode: 'agent' });
  }
  const topAction = (o.actions || [])[0];
  cards.push({ sev: 'warn', ic: 'alert', kicker: 'Recovery upside', title: `${money(s.recovery_opportunity)} is recoverable from ${count(s.immediate_intervention_accounts)} accounts`,
    body: `High-risk customers who are still likely to pay.${topAction ? ` Most need: ${topAction.Recommended_Action.toLowerCase()}.` : ''}`,
    metric: money(s.recovery_opportunity), q: 'Which accounts require immediate intervention?', mode: 'chat' });
  const r = o.rates || {};
  const f = o.funnel || {};
  if (num(r.Broken_Promise_Rate) !== null) {
    cards.push({ sev: num(r.Broken_Promise_Rate) > 0.5 ? 'bad' : 'warn', ic: 'promise', kicker: 'Promises to pay',
      title: `${pct(r.Broken_Promise_Rate, 0)} of payment promises are being broken`,
      body: `${count(f.PTP_Accounts)} customers committed to pay; ${count(f.Kept_PTP_Accounts)} have honoured it so far.`,
      metric: pct(r.Broken_Promise_Rate, 0), q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?', mode: 'agent' });
  }
  const oc = o.overContact || {};
  cards.push({ sev: 'warn', ic: 'phone', kicker: 'Conduct risk', title: `${count(oc.accounts)} customers may be over-contacted`,
    body: `${count(oc.segments ?? s.over_contact_segments)} customer groups average 4.5+ contacts this month: complaint and regulatory exposure.`,
    metric: count(oc.segments ?? s.over_contact_segments),
    q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.', mode: 'agent' });
  document.getElementById('priorities').innerHTML = cards.map((c, i) => `
    <button class="prio sev-${c.sev}" data-ask="${hEsc(c.q)}" data-mode="${c.mode}">
      <div class="prio-top"><span class="prio-rank">${i + 1}</span><span class="prio-kicker">${icon(c.ic, 'ico-sm')}${c.kicker}</span><span class="prio-metric">${c.metric}</span></div>
      <div class="prio-title">${hEsc(c.title)}</div>
      <div class="prio-body">${hEsc(c.body)}</div>
      <div class="prio-cta">${icon('spark', 'ico-xs')}Ask LensS · ${c.mode === 'agent' ? 'deep analysis' : 'quick answer'} <span aria-hidden="true">→</span></div>
    </button>`).join('');
}

/** 1. Core metrics: five large cards, then the v1.6 metrics (same formulas) on demand. */
function renderExecKpis(s, o, cc) {
  const k = cc.kpis || {};
  const card = (ic, label, value, sub, why, t) => `
    <div class="xkpi${t ? ' x-' + t : ''}" title="${hEsc(why)}">
      <div class="xkpi-top">${icon(ic, 'ico-sm')}<span>${label}</span></div>
      <div class="xkpi-v">${value}</div>
      <div class="xkpi-s">${sub}</div>
      <div class="xkpi-why">${hEsc(why)}</div>
    </div>`;
  const p = o.portfolio || {};
  const r = o.rates || {};
  const keptRate = num(r.Broken_Promise_Rate) === null ? null : 1 - num(r.Broken_Promise_Rate);
  document.getElementById('execKpis').innerHTML = [
    card('cash', 'Total outstanding portfolio', money(k.Outstanding_Portfolio, 2), `${count(k.Accounts_In_Collections)} accounts in collections`, 'Total balance currently under collections'),
    card('target', 'Collected this month', money(k.Recovery_MTD ?? s.mtd_collections), `${pct(s.achievement_pct)} of ${money(s.monthly_target)} target · ${money(s.target_gap)} to go`, 'Total collections recovered this month', tone(num(s.achievement_pct))),
    card('pulse', 'Recovery rate', pct(k.Recovery_Rate, 2), 'collected ÷ outstanding balance', 'How much of the book we turn into cash'),
    card('users', 'Accounts in collections', count(k.Accounts_In_Collections), `${money(k.Outstanding_Portfolio, 2)} outstanding`, 'Total active delinquent accounts'),
    card('alert', 'High-risk accounts', count(k.High_Risk_Accounts), `risk ≥ 0.70 · ${count(s.immediate_intervention_accounts)} still likely to pay`, 'Non-payment risk threshold exceeded; the priority list is the subset still likely to pay', 'warn'),
  ].join('');
  document.getElementById('execKpis2').innerHTML = [
    card('phone', 'Customers reached', pct(r.RPC_Rate), 'of those we tried to contact (RPC)', 'Contact effectiveness'),
    card('handshake', 'Agreed to pay', pct(r.PTP_Conversion_Rate), 'of customers we spoke to (PTP conversion)', 'Customer commitment'),
    card('promise', 'Promises honoured', pct(keptRate), 'of payment promises now due', 'Early-warning signal', keptRate !== null && keptRate < 0.5 ? 'bad' : null),
    card('handshake', 'Amount promised', money(p.ptp_amount), 'promised by customers this month', 'Cash committed by customers'),
    card('slip', 'Accounts worsening', pct(p.roll_forward_rate), `moving to a later arrears stage · ${pct(p.roll_back_rate)} improving`, 'Deterioration indicator', num(p.roll_forward_rate) > num(p.roll_back_rate) ? 'warn' : null),
    card('coin', 'Cost to collect', num(p.cost_to_collect) === null ? '—' : CUR + num(p.cost_to_collect).toFixed(3), `cost per ${CUR}1 collected · ${money(k.Collection_Cost)} spent`, 'Efficiency of collections'),
    card('users', 'Contacts per customer', num(p.average_attempts) === null ? '—' : num(p.average_attempts).toFixed(1), 'average this month', 'Contact intensity'),
  ].join('');
}

/** Executive decision brief: what changed / why / what to do, written from the same certified figures. */
function renderBrief(s, o, cc) {
  const worst = (o.products || [])[0];
  const best = (o.products || []).slice(-1)[0];
  const seg = (o.shortfall || [])[0];
  const drivers = (o.drivers || []).slice().sort((a, b) => num(a.Recovery_Rate) - num(b.Recovery_Rate));
  const k = cc.kpis || {};
  const a = cc.actions || {};
  const out = cc.outlook || {};
  const lowDriver = drivers[0];
  const body = `
    <div class="brief-sec"><span class="brief-n">1</span><div><b>Where we stand</b>
      <p>${pct(s.achievement_pct)} of the ${money(s.monthly_target)} monthly target is collected with ${count(out.Days_Remaining)} days left. ${worst ? `${hEsc(worst.Product)} has the lowest achievement (${pct(worst.Achievement_Pct)}, ${money(worst.Target_Gap)} to go)${best ? `; ${hEsc(best.Product)} leads at ${pct(best.Achievement_Pct)}` : ''}.` : ''} ${seg ? `The largest single gap is ${hEsc(seg.Product)} at ${hEsc(seg.DPD_Bucket)} days (${money(seg.Target_Gap)}).` : ''}</p></div></div>
    <div class="brief-sec"><span class="brief-n">2</span><div><b>What is driving it</b>
      <p>Recovery falls sharply with arrears: early-stage accounts convert best. ${lowDriver ? `${hEsc(lowDriver.Primary_Nonpayment_Driver)} has the lowest recovery (${pct(lowDriver.Recovery_Rate, 2)}).` : ''} ${pct(k.Roll_Forward_Rate)} of accounts slipped to a later stage this month against ${pct(k.Roll_Back_Rate)} improving, and ${pct(k.Broken_Share_Of_Due_Promises, 0)} of promises already due were broken.</p></div></div>
    <div class="brief-sec"><span class="brief-n">3</span><div><b>Recommended actions</b>
      <ul>
        <li>Secure the <b>${count(a.PTP_Due_7d_Accounts)}</b> promises due in the next 7 days (${money(a.PTP_Due_7d_Amount)}), starting with the <b>${count(a.PTP_Break_Risk_7d_Accounts)}</b> likely to break.</li>
        <li>Work the <b>${count(a.HighProp_HighBal_Accounts)}</b> high-propensity, high-balance accounts: ${money(a.HighProp_HighBal_Recoverable)} recoverable.</li>
        <li>Stop <b>${count(a.Rolling_To_180_Accounts)}</b> accounts (${money(a.Rolling_To_180_Exposure)}) rolling into 180+ days.</li>
      </ul></div></div>`;
  panel('pnlBrief', 'LensS executive decision brief', 'Written from the certified views of this snapshot',
    { q: 'Write a one-page executive brief for this month: where we stand against target, what is driving it, the biggest risks, and the top three actions with their value.', mode: 'agent' }, body);
}

/** Priority watchouts, ranked, with a severity filter (Critical / High / Medium). */
function renderWatchouts(s, o, cc) {
  const k = cc.kpis || {};
  const a = cc.actions || {};
  const r = o.rates || {};
  const worst = (o.products || [])[0];
  const oc = o.overContact || {};
  const items = [
    { sev: 'Critical', cat: 'Promises to pay', title: `${pct(k.Broken_Share_Of_Due_Promises, 0)} of promises already due were broken`,
      metric: `${count(k.Broken_PTP_Accounts)} broken · ${count(a.PTP_Break_Risk_7d_Accounts)} more at risk this week`,
      driver: 'Promises taken from customers with low propensity or high non-payment risk.',
      q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?', mode: 'agent' },
    { sev: 'High', cat: 'Deterioration', title: `${money(a.Rolling_To_180_Exposure)} is close to rolling into 180+ days`,
      metric: `${count(a.Rolling_To_180_Accounts)} accounts at 150–180 days · ${pct(k.Roll_Forward_Rate)} roll-forward`,
      driver: 'Late-stage accounts recover at a fraction of early-stage rates.',
      q: 'Which accounts are about to roll into 180+ days past due, and what should we do before they do?', mode: 'agent' },
    worst && { sev: 'High', cat: 'Target', title: `${worst.Product} has the lowest achievement (${pct(worst.Achievement_Pct)})`,
      metric: `${money(worst.Target_Gap)} still to collect`,
      driver: 'Shortfall concentrated in early-stage (1-30 days) accounts.',
      q: `Why is ${worst.Product} behind target this month and what should we do about it?`, mode: 'agent' },
    { sev: 'Medium', cat: 'Conduct risk', title: `${count(oc.accounts)} customers may be over-contacted`,
      metric: `${count(oc.segments ?? s.over_contact_segments)} customer groups at 4.5+ contacts`,
      driver: 'Contact strategies with high attempt counts and low right-party contact.',
      q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.', mode: 'agent' },
    { sev: 'Medium', cat: 'Contact', title: `Only ${pct(r.RPC_Rate)} of attempted customers are reached`,
      metric: `${pct(r.PTP_Conversion_Rate)} of those agree to pay`,
      driver: 'Channel and contact-time mismatch for parts of the book.',
      q: 'Which channels and contact times work best for reaching customers, and how should we change our contact strategy?', mode: 'agent' },
  ].filter(Boolean);
  const el = document.getElementById('pnlWatch');
  const draw = (filter) => {
    const shown = items.filter(i => filter === 'All' || i.sev === filter);
    el.innerHTML = `<div class="panel-head"><div><h3>Priority watchouts</h3><div class="panel-sub">Ranked by risk and money at stake</div></div>
      <div class="chips">${['All', 'Critical', 'High', 'Medium'].map(f => `<button class="chip-btn${f === filter ? ' on' : ''}" data-f="${f}">${f}</button>`).join('')}</div></div>
      <div class="panel-body watch-list">${shown.map(i => `
        <div class="watch sev-${i.sev.toLowerCase()}">
          <div class="watch-top"><span class="sev-tag">${i.sev}</span><span class="watch-cat">${hEsc(i.cat)}</span></div>
          <div class="watch-title">${hEsc(i.title)}</div>
          <div class="watch-meta"><b>Supporting metric:</b> ${hEsc(i.metric)}</div>
          <div class="watch-meta"><b>Likely driver:</b> ${hEsc(i.driver)}</div>
          <button class="ask-link" data-ask="${hEsc(i.q)}" data-mode="${i.mode}">${icon('spark', 'ico-xs')}Ask LensS</button>
        </div>`).join('') || '<div class="empty-note">Nothing at this level.</div>'}</div>`;
    el.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => draw(b.dataset.f)));
  };
  draw('All');
}

/** 2. Portfolio risk snapshot: accounts and balance by arrears stage. */
function renderRisk(cc) {
  const rows = cc.riskSnapshot || [];
  const colors = ['#0E8F80', '#0B6E99', '#D97706', '#EA580C', '#DC2626'];
  const total = rows.reduce((a, r) => a + num(r.Accounts), 0);
  const stack = `<div class="stack">${rows.map((r, i) => `<span style="width:${(100 * num(r.Account_Share)).toFixed(2)}%;background:${colors[i]}" title="${hEsc(r.DPD_Bucket)} days: ${count(r.Accounts)} accounts (${pct(r.Account_Share)})">${num(r.Account_Share) > 0.07 ? pct(r.Account_Share, 0) : ''}</span>`).join('')}</div>`;
  const table = `<table class="mini risk-table"><thead><tr><th>Arrears stage</th><th>Accounts</th><th>Amount</th><th>Distribution</th><th>Recovery</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><span class="dot" style="background:${colors[i]}"></span>${hEsc(r.DPD_Bucket)} days</td><td>${count(r.Accounts)}</td><td>${money(r.Outstanding_Balance)}</td><td>${pct(r.Account_Share)}</td><td>${pct(r.Recovery_Rate, 2)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${count(total)}</td><td>${money(rows.reduce((a, r) => a + num(r.Outstanding_Balance), 0), 2)}</td><td>100%</td><td></td></tr></tbody></table>`;
  panel('pnlRisk', 'Portfolio risk snapshot', 'Accounts and balance by days past due',
    { q: 'How is our portfolio distributed across DPD buckets, and where is the risk concentrated?', mode: 'chat' }, stack + table);
}

/** 3. Target achievement: the six figures leadership asked for, with an honest outlook. */
function renderTarget(s, cc) {
  const t = cc.outlook || {};
  const like = t.Target_Likelihood || '—';
  const tile = (l, v, sub, cls = '') => `<div class="ttile ${cls}"><div class="ttile-l">${l}</div><div class="ttile-v">${v}</div>${sub ? `<div class="ttile-s">${sub}</div>` : ''}</div>`;
  const body = `<div class="ttiles">
      ${tile('Recovery target', money(t.Recovery_Target ?? s.monthly_target), 'this month')}
      ${tile('Recovery achieved', money(t.Recovery_Achieved ?? s.mtd_collections), `day ${new Date((t.Snapshot_Date || '2026-09-15') + 'T00:00:00').getDate()}`)}
      ${tile('Achievement', pct(t.Achievement_Pct ?? s.achievement_pct), '', tone(num(t.Achievement_Pct ?? s.achievement_pct)))}
      ${tile('Target gap', money(t.Target_Gap ?? s.target_gap), 'still to collect')}
      ${tile('Outlook: month-end recovery', money(t.Outlook_EOM_Recovery), `${pct(num(t.Outlook_EOM_Recovery) / num(t.Recovery_Target), 0)} of target`)}
      ${tile('Likelihood of hitting target', hEsc(like), t.Gap_Coverage ? `promises cover the gap ${num(t.Gap_Coverage).toFixed(1)}×` : '', 'like-' + String(like).toLowerCase())}
    </div>
    <div class="panel-note">Outlook = collected so far + ${money(t.Promised_Rest_Of_Month)} promised by ${count(t.Promises_Rest_Of_Month)} customers for the rest of the month × the ${pct(t.Promise_Honour_Rate, 0)} honour rate of promises already due (${money(t.Expected_From_Promises)} expected). A pipeline view, not a statistical forecast.</div>`;
  panel('pnlTarget', 'Target achievement', 'Where we are, and where we are likely to land',
    { q: 'Are we on track to hit this month\'s recovery target, and which products or buckets put it at risk?', mode: 'agent' }, body);
}

/** 5. Action center: the five work queues, each one click from a LensS analysis. */
function renderActionCenter(cc, o) {
  const a = cc.actions || {};
  const cards = [
    { ic: 'cash', t: 'High propensity + high balance', v: money(a.HighProp_HighBal_Recoverable), unit: 'recoverable',
      d: `${count(a.HighProp_HighBal_Accounts)} accounts with propensity ≥ 60% and balance ≥ ₹100K (${money(a.HighProp_HighBal_Balance)} balance).`,
      q: 'Which accounts have both high payment propensity and high balance, and how should we work them?', mode: 'chat', tone: 'good' },
    { ic: 'target', t: 'Largest recovery opportunities', v: money(a.Top250_Recoverable), unit: 'from 250 accounts',
      d: `The 250 accounts with the most incremental recovery available (${money(a.Top250_Balance)} balance).`,
      q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?', mode: 'agent', tone: 'good' },
    { ic: 'promise', t: 'PTP due in next 7 days', v: count(a.PTP_Due_7d_Accounts), unit: 'promises',
      d: `${money(a.PTP_Due_7d_Amount)} promised by customers, due by next week.`,
      q: 'Which promises to pay are due in the next 7 days, and how much is at stake?', mode: 'chat', tone: 'brand' },
    { ic: 'alert', t: 'Broken-PTP follow-up queue', v: count(a.PTP_Break_Risk_7d_Accounts), unit: 'likely to break',
      d: `Promises due in 7 days from customers with low propensity or high risk: ${money(a.PTP_Break_Risk_7d_Amount)} at stake.`,
      q: 'Which customers with promises due in the next 7 days are likely to break them, and what follow-up should we do?', mode: 'agent', tone: 'bad' },
    { ic: 'slip', t: 'Accounts rolling toward 180+', v: money(a.Rolling_To_180_Exposure), unit: 'exposure',
      d: `${count(a.Rolling_To_180_Accounts)} accounts at 150–180 days past due, about to enter the lowest-recovery stage.`,
      q: 'Which accounts are about to roll into 180+ days past due, and what should we do before they do?', mode: 'agent', tone: 'warn' },
  ];
  document.getElementById('actionCenter').innerHTML = cards.map(c => `
    <button class="act-card t-${c.tone}" data-ask="${hEsc(c.q)}" data-mode="${c.mode}">
      <div class="act-top">${icon(c.ic, 'ico-sm')}<span>${hEsc(c.t)}</span></div>
      <div class="act-v">${c.v} <small>${hEsc(c.unit)}</small></div>
      <div class="act-d">${hEsc(c.d)}</div>
      <div class="prio-cta">${icon('spark', 'ico-xs')}Ask LensS · ${c.mode === 'agent' ? 'deep analysis' : 'quick answer'} →</div>
    </button>`).join('');
}

const CHANNEL_ICON = { Voice: '📞', SMS: '💬', Email: '✉️', WhatsApp: '🟢', Field: '🚗', 'Digital Self-Cure': '📱' };
const ACTION_TONE = {
  'Route to hardship support': 'care', 'Route to dispute resolution': 'dispute', 'Immediate PTP follow-up': 'urgent',
  'Initiate preferred digital journey': 'digital', 'Assign to specialist collector': 'urgent', 'Prioritised collector outreach': 'standard',
};
function renderAccounts(s, o) {
  const rows = o.topAccounts || [];
  const body = `<div class="table-scroll flat"><table class="nice">
    <thead><tr><th>Account</th><th>Product</th><th>Days overdue</th><th>Balance</th><th>Recoverable</th><th>Likely to pay</th><th>Why they're not paying</th><th>Next best action</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="mono">${hEsc(r.Account_ID)}</td><td>${hEsc(r.Product)}</td><td>${count(r.DPD)} <span class="muted">(${hEsc(r.DPD_Bucket)})</span></td>
      <td>${money(r.Outstanding_Balance)}</td><td><b>${money(r.Incremental_Recovery_Opportunity)}</b></td>
      <td><span class="pill-bar"><span style="width:${(num(r.Payment_Propensity) * 100).toFixed(0)}%"></span></span>${pct(r.Payment_Propensity, 0)}</td>
      <td>${hEsc(r.Primary_Nonpayment_Driver)}</td>
      <td><span class="action-chip a-${ACTION_TONE[r.Recommended_Action] || 'standard'}">${hEsc(r.Recommended_Action)}</span></td></tr>`).join('')}</tbody></table></div>`;
  panel('pnlAccounts', `Largest recovery opportunities`, `${count(s.immediate_intervention_accounts)} high-risk accounts are still likely to pay. These 8 carry the most value.`,
    { q: 'Which accounts require immediate intervention?', mode: 'chat' }, body);
}

/** Recommended next steps: how the priority accounts should be handled (v1.6). */
function renderActions(o) {
  const rows = o.actions || [];
  const max = Math.max(...rows.map(r => num(r.accounts) || 0), 1);
  panel('pnlActions', 'Recommended next steps', 'How the priority accounts should be handled.',
    { q: 'Which accounts should go to hardship support or dispute resolution, and how should we handle them?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Recommended_Action), num(r.accounts), max, `${count(r.accounts)} <span class="muted">accounts</span>`,
      ACTION_TONE[r.Recommended_Action] === 'care' || ACTION_TONE[r.Recommended_Action] === 'dispute' ? 'warn' : 'brand',
      `${money(r.opportunity)} recoverable`)).join('') || '<div class="empty-note">No data.</div>');
}

/** Recovery opportunity by product (v1.6). */
function renderOpportunity(o) {
  const rows = o.opportunity || [];
  const max = Math.max(...rows.map(r => num(r.opportunity) || 0), 1);
  panel('pnlOpportunity', 'Recovery opportunity by product', 'Money recoverable from high-risk accounts that are still likely to pay.',
    { q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Product), num(r.opportunity), max, money(r.opportunity), 'good', `${count(r.accounts)} accounts`)).join('') || '<div class="empty-note">No data.</div>');
}

loadHome().catch(err => {
  console.error('Command Center failed to load', err);
  document.getElementById('heroSub').textContent = 'Some figures could not be loaded. Please refresh the page.';
});
