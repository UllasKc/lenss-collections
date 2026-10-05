// ---------------------------------------------------------------- Command Center
// Written for a collections leader, not an analyst: where we stand against target,
// what needs action today, and why — every figure from the certified views (no AI).
// Each panel has an "Ask AI" link that opens the assistant with the right question.

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
const askBtn = (q, mode = 'agent', label = 'Ask AI') =>
  `<button class="ask-link" data-ask="${hEsc(q)}" data-mode="${mode}" title="${hEsc(q)}">${icon('spark', 'ico-xs')}${label}</button>`;

/** A panel: title, a one-line "so what", its Ask-AI question, and a body. */
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
  const k = document.getElementById('homeKpis');
  if (!k.innerHTML.trim()) k.innerHTML = Array.from({ length: 10 }, () => '<div class="metric skel-card"><div class="skel"></div><div class="skel skel-h"></div></div>').join('');
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return window.userFirstName ? `${part}, ${window.userFirstName}` : part;
}
document.addEventListener('lenss:user', () => { const g = document.getElementById('heroGreeting'); if (g) g.textContent = greeting(); });

async function loadHome() {
  skeletons();
  const [summary, overview, segments] = await Promise.all([
    fetch('/api/dashboard/summary').then(r => r.json()),
    fetch('/api/dashboard/overview').then(r => r.json()).catch(() => ({})),
    fetch('/api/dashboard/segments').then(r => r.json()).catch(() => []),
  ]);
  const o = overview || {};
  renderHero(summary, o);
  renderNarrative(summary);
  renderPriorities(summary, o);
  renderKpis(summary, o);
  renderProducts(o);
  renderShortfall(summary, o);
  renderHeat(o);
  renderFunnel(o);
  renderChannels(o);
  renderAccounts(summary, o);
  renderActions(o);
  renderOpportunity(o);
  renderDrivers(o);
  renderStrategies(o);
  renderRegions(o);
  renderCollectors(o);
  renderSegments(segments);
}

function renderHero(s, o) {
  const asOf = new Date((o.asOf || '2026-09-15') + 'T00:00:00');
  const days = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  document.getElementById('heroDate').textContent =
    `Snapshot · ${asOf.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · day ${asOf.getDate()} of ${days}`;
  document.getElementById('heroGreeting').textContent = greeting();
  const ach = num(s.achievement_pct);
  const worst = (o.products || [])[0];
  document.getElementById('heroSub').innerHTML =
    `We've collected <b>${money(s.mtd_collections)}</b> of this month's <b>${money(s.monthly_target)}</b> target, ` +
    `with <b>${money(s.target_gap)}</b> still to close${worst ? `. <b>${hEsc(worst.Product)}</b> is furthest behind at ${pct(worst.Achievement_Pct)}` : ''}.`;
  document.getElementById('heroProgress').innerHTML = `
    <div class="hp-track"><div class="hp-fill" style="width:${Math.min(100, (ach || 0) * 100).toFixed(1)}%"></div></div>
    <div class="hp-legend"><span><b>${pct(ach)}</b> of target achieved</span><span>${money(s.mtd_collections)} / ${money(s.monthly_target)}</span></div>`;
  const p = o.portfolio || {};
  const oc = o.overContact || {};
  document.getElementById('heroStats').innerHTML = [
    ['Recoverable now', money(s.recovery_opportunity), `from ${count(s.immediate_intervention_accounts)} priority accounts`, 'cash'],
    ['Customers in arrears', count(p.accounts ?? s.eligible_accounts), `${money(p.outstanding)} outstanding`, 'users'],
    ['High-risk customers', count(p.high_risk), 'unlikely to pay without action', 'alert'],
    ['Over-contact risk', count(oc.segments ?? s.over_contact_segments), `customer groups contacted 4.5+ times this month`, 'phone'],
  ].map(([l, v, sub, ic]) => `<div class="hs"><div class="hs-ico">${icon(ic)}</div><div><div class="hs-l">${l}</div><div class="hs-v">${v}</div><div class="hs-s">${sub}</div></div></div>`).join('');
}

function renderNarrative(s) {
  const el = document.getElementById('narrative');
  el.textContent = s.narrative || 'No executive summary yet. Run the deploy\'s summary step: python deploy/deploy.py --config <config> --only summary';
  const gen = s.narrative_generated_at ? new Date(s.narrative_generated_at.replace(' ', 'T') + 'Z') : null;
  document.getElementById('narrativeMeta').textContent = s.narrative_generated_at
    ? `Written from the certified views on ${gen && !isNaN(gen) ? gen.toLocaleString() : s.narrative_generated_at}` : '';
}

/** Four cards, worked out from the data, each opening the right analysis. */
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
      <div class="prio-cta">${icon('spark', 'ico-xs')}${c.mode === 'agent' ? 'Run deep analysis' : 'Get a quick answer'} <span aria-hidden="true">→</span></div>
    </button>`).join('');
}

function renderKpis(s, o) {
  const p = o.portfolio || {};
  const r = o.rates || {};
  const recRate = num(p.recovered) && num(p.outstanding) ? num(p.recovered) / num(p.outstanding) : null;
  const keptRate = num(r.Broken_Promise_Rate) === null ? null : 1 - num(r.Broken_Promise_Rate);
  const metrics = [
    ['cash', 'Collected this month', money(s.mtd_collections), `of ${money(s.monthly_target)} target`, null],
    ['target', 'Target achievement', pct(s.achievement_pct), `${money(s.target_gap)} still to collect`, num(s.achievement_pct), tone(num(s.achievement_pct))],
    ['pulse', 'Recovery rate', pct(recRate, 2), 'collected ÷ outstanding balance', null],
    ['phone', 'Customers reached', pct(r.RPC_Rate), 'of those we tried to contact', num(r.RPC_Rate)],
    ['handshake', 'Agreed to pay', pct(r.PTP_Conversion_Rate), 'of customers we spoke to', num(r.PTP_Conversion_Rate)],
    ['promise', 'Promises honoured', pct(keptRate), 'of payment promises now due', keptRate, keptRate !== null && keptRate < 0.5 ? 'bad' : null],
    ['coin', 'Cost to collect', num(p.cost_to_collect) === null ? '—' : CUR + num(p.cost_to_collect).toFixed(3), `cost per ${CUR}1 collected`, null],
    ['handshake', 'Amount promised', money(p.ptp_amount), 'promised by customers this month', null],
    ['slip', 'Accounts worsening', pct(p.roll_forward_rate), `moving to a later arrears stage · ${pct(p.roll_back_rate)} improving`, null, num(p.roll_forward_rate) > num(p.roll_back_rate) ? 'warn' : null],
    ['users', 'Contacts per customer', num(p.average_attempts) === null ? '—' : num(p.average_attempts).toFixed(1), 'average this month', null],
  ];
  document.getElementById('homeKpis').innerHTML = metrics.map(([ic, l, v, sub, ratio, t]) => `
    <div class="metric${t ? ' m-' + t : ''}">
      <div class="metric-top">${icon(ic, 'ico-sm')}<span>${l}</span></div>
      <div class="metric-v">${v}</div>
      ${ratio !== null && ratio !== undefined ? `<div class="metric-bar"><span style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span></div>` : ''}
      <div class="metric-s">${sub}</div>
    </div>`).join('');
}

function renderProducts(o) {
  const rows = (o.products || []).slice().sort((a, b) => num(a.Achievement_Pct) - num(b.Achievement_Pct));
  panel('pnlProducts', 'Achievement by product', 'Collected vs monthly target. The line marks 100%.',
    { q: 'What is my MTD collections performance versus target by product?', mode: 'chat' },
    rows.map(r => bar(hEsc(r.Product), num(r.Achievement_Pct), 1.1, `${pct(r.Achievement_Pct)}`, tone(num(r.Achievement_Pct)),
      `${money(r.MTD_Collections)} of ${money(r.Monthly_Target)} · <b>${money(r.Target_Gap)}</b> to go`, 1)).join('') || '<div class="empty-note">No data.</div>');
}

function renderShortfall(s, o) {
  const rows = o.shortfall || [];
  const max = Math.max(...rows.map(r => num(r.Contribution_To_Gap_Pct) || 0), 0.01);
  panel('pnlShortfall', `Where the ${money(s.target_gap)} shortfall comes from`, 'The products and arrears stages with the biggest gaps.',
    { q: 'Which portfolios are contributing most to the shortfall?', mode: 'chat' },
    rows.map(r => bar(`${hEsc(r.Product)} <span class="muted">· ${hEsc(r.DPD_Bucket)} days</span>`, num(r.Contribution_To_Gap_Pct), max,
      `${money(r.Target_Gap)} <span class="muted">(${pct(r.Contribution_To_Gap_Pct, 0)})</span>`, 'bad')).join('') || '<div class="empty-note">No shortfall.</div>');
}

function renderHeat(o) {
  const cells = o.heat || [];
  const buckets = ['1-30', '31-60', '61-90', '91-180', '180+'].filter(b => cells.some(c => c.DPD_Bucket === b));
  const products = [...new Set((o.products || []).map(p => p.Product))].filter(p => cells.some(c => c.Product === p));
  const get = (p, b) => cells.find(c => c.Product === p && c.DPD_Bucket === b);
  const body = `<div class="heat" style="grid-template-columns:150px repeat(${buckets.length},1fr)">
    <div></div>${buckets.map(b => `<div class="heat-h">${b} days</div>`).join('')}
    ${products.map(p => `<div class="heat-r">${hEsc(p)}</div>${buckets.map(b => {
      const c = get(p, b);
      const a = c ? num(c.Achievement_Pct) : null;
      return `<div class="heat-c t-${tone(a)}" title="${hEsc(p)} · ${b}: ${pct(a)} of target, ${money(c && c.Target_Gap)} to go">${a === null ? '—' : pct(a, 0)}<small>${c && num(c.Target_Gap) > 0 ? money(c.Target_Gap, 1) + ' gap' : 'on target'}</small></div>`;
    }).join('')}`).join('')}</div>
    <div class="heat-legend"><span class="t-bad">Below 88%</span><span class="t-warn">88–95%</span><span class="t-good">95% and above</span></div>`;
  panel('pnlHeat', 'Target achievement by product and arrears stage', 'Red is furthest behind target.',
    { q: 'Which product and DPD bucket combinations are furthest behind target, and why?', mode: 'agent' }, body);
}

function renderFunnel(o) {
  const f = o.funnel || {};
  const steps = [
    ['In arrears', f.Eligible_Accounts, 'accounts past due'],
    ['Tried to contact', f.Attempted_Accounts, 'at least one attempt'],
    ['Reached the right person', f.RPC_Accounts, 'right-party contact'],
    ['Promised to pay', f.PTP_Accounts, 'promise to pay'],
    ['Kept the promise', f.Kept_PTP_Accounts, 'paid when due'],
  ];
  const top = num(steps[0][1]) || 1;
  const body = `<div class="funnel">${steps.map((s, i) => {
    const v = num(s[1]) || 0;
    const prev = i ? num(steps[i - 1][1]) || 0 : null;
    const conv = prev ? v / prev : null;
    return `<div class="fstep">
      <div class="fbar" style="width:${Math.max(6, (v / top) * 100).toFixed(1)}%"><span>${count(v)}</span></div>
      <div class="flabel"><b>${s[0]}</b><small>${s[2]}${conv !== null ? ` · <span class="${conv < 0.4 ? 'neg' : ''}">${pct(conv, 0)} of previous step</span>` : ''}</small></div>
    </div>`;
  }).join('')}</div>`;
  panel('pnlFunnel', 'From arrears to payment', 'Where we lose customers on the way to a payment.',
    { q: 'Where are we losing customers in the collections funnel, and how do we improve contact and promise-keeping?', mode: 'agent' }, body);
}

const CHANNEL_ICON = { Voice: '📞', SMS: '💬', Email: '✉️', WhatsApp: '🟢', Field: '🚗', 'Digital Self-Cure': '📱' };
function renderChannels(o) {
  const rows = o.channels || [];
  const body = `<div class="chan-grid">${rows.map(r => `
    <div class="chan">
      <div class="chan-b">${hEsc(r.DPD_Bucket)} days</div>
      <div class="chan-c"><span aria-hidden="true">${CHANNEL_ICON[r.Recommended_Channel] || '•'}</span>${hEsc(r.Recommended_Channel)}</div>
      <div class="chan-m"><span>${pct(r.Balance_Recovery_Rate, 1)}</span> recovery</div>
      <div class="chan-m"><span>${pct(r.PTP_Conversion_Rate, 0)}</span> promise rate</div>
    </div>`).join('')}</div>
    <div class="panel-note">Best-performing channel in each bucket, by recovery rate (segments of 50+ accounts). Observed results, not a guarantee of uplift.</div>`;
  panel('pnlChannels', 'Best channel for each stage of arrears', 'Use the channel that is already working best at each stage.',
    { q: 'Which channel should we use for each DPD bucket?', mode: 'chat' }, body);
}

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

function renderActions(o) {
  const rows = o.actions || [];
  const max = Math.max(...rows.map(r => num(r.accounts) || 0), 1);
  panel('pnlActions', 'Recommended next steps', 'How the accounts needing action should be handled.',
    { q: 'Which accounts should go to hardship support or dispute resolution, and how should we handle them?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Recommended_Action), num(r.accounts), max, `${count(r.accounts)} <span class="muted">accounts</span>`,
      ACTION_TONE[r.Recommended_Action] === 'care' || ACTION_TONE[r.Recommended_Action] === 'dispute' ? 'warn' : 'brand',
      `${money(r.opportunity)} recoverable`)).join(''));
}

function renderOpportunity(o) {
  const rows = o.opportunity || [];
  const max = Math.max(...rows.map(r => num(r.opportunity) || 0), 1);
  panel('pnlOpportunity', 'Recovery opportunity by product', 'Money recoverable from high-risk accounts that are still likely to pay.',
    { q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Product), num(r.opportunity), max, money(r.opportunity), 'good', `${count(r.accounts)} accounts`)).join(''));
}

function renderDrivers(o) {
  const rows = (o.drivers || []).slice().sort((a, b) => num(a.Recovery_Rate) - num(b.Recovery_Rate));
  const max = Math.max(...rows.map(r => num(r.Recovery_Rate) || 0), 0.0001);
  const worst = rows[0];
  panel('pnlDrivers', "Why customers aren't paying", worst ? `<b>${hEsc(worst.Primary_Nonpayment_Driver)}</b> has the lowest recovery rate.` : '',
    { q: 'Which non-payment drivers have the lowest recovery rate, and what should we do for each?', mode: 'agent' },
    rows.map((r, i) => bar(hEsc(r.Primary_Nonpayment_Driver), num(r.Recovery_Rate), max * 1.05, pct(r.Recovery_Rate, 2),
      i < 2 ? 'bad' : 'brand', `${count(r.Account_Count)} accounts · ${money(r.Outstanding_Balance)} outstanding`)).join(''));
}

function renderStrategies(o) {
  const rows = o.strategies || [];
  const max = Math.max(...rows.map(r => num(r.recovery_rate) || 0), 0.0001);
  panel('pnlStrategies', 'Treatment strategy results', 'Recovery rate and cost to collect for each strategy, as observed this month.',
    { q: 'Which treatment strategies perform best like-for-like, and what does that mean for our policy?', mode: 'agent' },
    rows.map((r, i) => bar(hEsc(r.Treatment_Strategy), num(r.recovery_rate), max * 1.05, pct(r.recovery_rate, 2), i === 0 ? 'good' : 'brand',
      `${count(r.accounts)} accounts · ${CUR}${num(r.cost_to_collect) === null ? '—' : num(r.cost_to_collect).toFixed(3)} cost per ${CUR}1 · ${pct(r.ptp_conversion, 0)} promise rate`)).join('')
    + '<div class="panel-note">Strategies serve different customers, so compare like-for-like before changing policy (ask AI for the matched comparison).</div>');
}

function renderRegions(o) {
  const rows = o.regions || [];
  const max = Math.max(...rows.map(r => num(r.recovery_rate) || 0), 0.0001);
  const avg = rows.length ? rows.reduce((a, r) => a + num(r.recovery_rate), 0) / rows.length : 0;
  panel('pnlRegions', 'Recovery by region', rows.length ? `${hEsc(rows[0].Region)} leads; ${hEsc(rows[rows.length - 1].Region)} trails.` : '',
    { q: 'Which regions are underperforming on recovery and why?', mode: 'agent' },
    rows.map(r => bar(hEsc(r.Region), num(r.recovery_rate), max * 1.05, pct(r.recovery_rate, 2), num(r.recovery_rate) < avg * 0.9 ? 'bad' : num(r.recovery_rate) > avg * 1.1 ? 'good' : 'brand',
      `${count(r.accounts)} accounts · ${money(r.outstanding)} outstanding`)).join(''));
}

function renderCollectors(o) {
  const c = o.collectors || {};
  const row = r => `<div class="coll"><span class="mono">${hEsc(r.Collector_ID)}</span><span class="muted">${hEsc(r.Team || '')}${r.Specialization ? ' · ' + hEsc(r.Specialization) : ''}</span><b>${pct(r.Balance_Recovery_Rate, 2)}</b></div>`;
  const spread = c.best && c.worst && num(c.worst.Balance_Recovery_Rate) ? (num(c.best.Balance_Recovery_Rate) / num(c.worst.Balance_Recovery_Rate)).toFixed(1) : null;
  panel('pnlCollectors', 'Collector performance', `${count(c.count)} collectors with 30+ accounts.${spread ? ` The best recovers <b>${spread}×</b> as much per rupee as the lowest.` : ''}`,
    { q: 'How do our collectors compare, and what separates the best performers from the rest?', mode: 'agent' },
    `<div class="coll-cols"><div><div class="coll-h good">Top 5</div>${(c.top || []).map(row).join('')}</div>
     <div><div class="coll-h bad">Bottom 5</div>${(c.bottom || []).map(row).join('')}</div></div>`);
}

function renderSegments(segments) {
  const tbody = document.querySelector('#segmentTable tbody');
  tbody.innerHTML = '';
  (segments || []).forEach(s => {
    const rate = Number(s.Balance_Recovery_Rate);
    const t = rate < 0.025 ? 'red' : rate < 0.035 ? 'amber' : 'green';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${hEsc(s.Product)}</td><td>${hEsc(s.DPD_Bucket)}</td><td>${fmtNum(s.Account_Count)}</td>
      <td>${fmtMoney(s.Outstanding_Balance)}</td><td>${fmtMoney(s.Recovery_MTD)}</td>
      <td><span class="badge ${t}">${fmtPct(s.Balance_Recovery_Rate)}</span></td>
      <td>${fmtPct(s.RPC_Rate)}</td><td>${fmtPct(s.PTP_Conversion_Rate)}</td>`;
    tbody.appendChild(tr);
  });
}

loadHome().catch(err => {
  console.error('Command Center failed to load', err);
  document.getElementById('heroSub').textContent = 'Some figures could not be loaded. Please refresh the page.';
});
