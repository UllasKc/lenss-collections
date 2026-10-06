// ---------------------------------------------------------------- Explorer
// The "why" behind the Command Center. Filters (business unit, arrears stage, region,
// channel, strategy, driver, team, balance band, vulnerability, and contact / promise
// dates) slice one governed view (gold.qry_explorer_base) with the same formulas as the
// Command Center, so with no filters every figure reconciles to it. Layer 1 is a
// dimension × measure slicer (click a bar to drill into it), then the diagnostic panels,
// then the account records behind the numbers. Every panel can hand its question,
// scoped to the current filters, to LensS. Uses the helpers in home.js.

(function setupExplorer() {
  const FILTERS = [
    ['product', 'Product (business unit)', 'All products'],
    ['bucket', 'Arrears stage (DPD)', 'All stages'],
    ['region', 'Region', 'All regions'],
    ['channel', 'Preferred channel', 'All channels'],
    ['strategy', 'Treatment strategy', 'All strategies'],
    ['driver', 'Non-payment driver', 'All drivers'],
    ['team', 'Collector team', 'All teams'],
    ['band', 'Balance band', 'All balances'],
    ['vulnerability', 'Vulnerability', 'All customers'],
  ];
  const DATE_LABELS = { contactFrom: 'Last contact from', contactTo: 'Last contact to', ptpFrom: 'Promise due from', ptpTo: 'Promise due to' };
  const DIM_LABEL = Object.fromEntries(FILTERS.map(([k, l]) => [k, l.replace(/ \(.*\)/, '')]));
  const MEASURES = {
    outstanding: { label: 'Outstanding balance', fmt: v => money(v), rate: false },
    collected: { label: 'Collected this month', fmt: v => money(v), rate: false },
    recovery_rate: { label: 'Recovery rate', fmt: v => pct(v, 2), rate: true, good: true },
    rpc_rate: { label: 'Customers reached (RPC)', fmt: v => pct(v), rate: true, good: true },
    ptp_conversion: { label: 'Agreed to pay (PTP conversion)', fmt: v => pct(v), rate: true, good: true },
    promise_kept_rate: { label: 'Promises honoured', fmt: v => pct(v), rate: true, good: true },
    high_risk_share: { label: 'High-risk share', fmt: v => pct(v), rate: true, good: false },
    roll_forward_rate: { label: 'Accounts worsening (roll forward)', fmt: v => pct(v), rate: true, good: false },
    cost_to_collect: { label: `Cost to collect (per ${CUR}1)`, fmt: v => (num(v) === null ? '—' : CUR + num(v).toFixed(3)), rate: true, good: false },
    opportunity: { label: 'Recovery opportunity', fmt: v => money(v), rate: false },
    accounts: { label: 'Accounts', fmt: v => count(v), rate: false },
    avg_risk: { label: 'Average non-payment risk', fmt: v => (num(v) === null ? '—' : num(v).toFixed(2)), rate: true, good: false },
  };
  const BUCKETS = ['1-30', '31-60', '61-90', '91-180', '180+'];
  const PAGE = 12;

  const state = { filters: {}, dim: 'product', measure: 'outstanding', view: 'bars', data: null, options: null,
    search: '', sort: 'opportunity', page: 0, seq: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem('lenss.explorer') || '{}');
    if (saved && typeof saved === 'object') Object.assign(state, { filters: saved.filters || {}, dim: saved.dim || 'product', measure: saved.measure || 'outstanding' });
  } catch { /* ignore */ }
  const remember = () => { try { localStorage.setItem('lenss.explorer', JSON.stringify({ filters: state.filters, dim: state.dim, measure: state.measure })); } catch { /* ignore */ } };

  /** "for Credit Card, 31-60 days, Mumbai": the current filters in words, for questions and notes. */
  function scopeText() {
    const parts = FILTERS.filter(([k]) => state.filters[k]).map(([k]) => (k === 'bucket' ? `${state.filters[k]} days past due` : state.filters[k]));
    const f = state.filters;
    if (f.contactFrom || f.contactTo) parts.push(`last contacted ${f.contactFrom ? 'from ' + f.contactFrom : ''}${f.contactTo ? ' to ' + f.contactTo : ''}`.trim());
    if (f.ptpFrom || f.ptpTo) parts.push(`promises due ${f.ptpFrom ? 'from ' + f.ptpFrom : ''}${f.ptpTo ? ' to ' + f.ptpTo : ''}`.trim());
    return parts.join(', ');
  }
  const scoped = (q) => { const sc = scopeText(); return sc ? `${q.replace(/\?$/, '')} (for ${sc})?` : q; };
  const ask = (q, mode = 'agent') => ({ q: scoped(q), mode });

  /**
   * "View" on any chart item: the accounts behind it, in the same window as the Command
   * Center. `seg` is the item's own filter (e.g. { product: 'Credit Card' }), a funnel
   * stage or a collector; the current filters still apply.
   */
  const xpView = (seg, title, label = 'View') =>
    `<button class="view-btn sm" data-xpview="${hEsc(JSON.stringify(seg))}" data-title="${hEsc(title)}">${hEsc(label)}</button>`;
  document.getElementById('tab-explorer').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-xpview][role="button"]')) { e.preventDefault(); e.target.click(); }
  });
  const STAGE_RULE = {
    attempted: 'contact was attempted this month', not_reached: 'contact attempted but the right person never reached', reached: 'the right person was reached',
    promised: 'a promise to pay was made', due: 'a promise has fallen due', kept: 'a promise fell due and was kept', broken: 'a promise fell due and was broken',
  };
  document.getElementById('tab-explorer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-xpview]');
    if (!b || !window.showAccountList) return;
    e.stopPropagation();
    const seg = JSON.parse(b.dataset.xpview);
    const merged = { ...state.filters, ...seg };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const words = [
      ...FILTERS.filter(([k]) => merged[k]).map(([k, l]) => `${l.replace(/ \(.*\)/, '')}: ${merged[k]}`),
      ...Object.keys(DATE_LABELS).filter(k => merged[k]).map(k => `${DATE_LABELS[k]} ${merged[k]}`),
      merged.stage ? `where ${STAGE_RULE[merged.stage] || merged.stage}` : '',
      merged.collector ? `collector ${merged.collector}` : '',
    ].filter(Boolean);
    window.showAccountList({
      url: '/api/explorer/accounts' + (qs ? '?' + qs : ''), title: b.dataset.title,
      rule: words.length ? `Accounts in collections · ${words.join(' · ')}` : 'All accounts in collections',
      file: 'lenss-explorer-' + (Object.values(seg).join('-').replace(/\W+/g, '-').toLowerCase() || 'accounts'),
    });
  });

  // ---- filters
  function buildSelects() {
    const o = state.options?.dims || {};
    document.getElementById('xpSelects').innerHTML = FILTERS.map(([k, label, all]) => `
      <div class="field"><label for="xpf-${k}">${hEsc(label)}</label>
        <select id="xpf-${k}" data-f="${k}"><option value="">${hEsc(all)}</option>
          ${(o[k] || []).map(v => `<option value="${hEsc(v)}"${state.filters[k] === v ? ' selected' : ''}>${hEsc(k === 'bucket' ? v + ' days' : v)}</option>`).join('')}
        </select></div>`).join('');
    const d = state.options?.dates || {};
    const setRange = (id, min, max, key) => { const el = document.getElementById(id); if (!el) return; if (min) el.min = min; if (max) el.max = max; el.value = state.filters[key] || ''; };
    setRange('xpContactFrom', d.contactMin, d.contactMax, 'contactFrom');
    setRange('xpContactTo', d.contactMin, d.contactMax, 'contactTo');
    setRange('xpPtpFrom', d.ptpMin, d.ptpMax, 'ptpFrom');
    setRange('xpPtpTo', d.ptpMin, d.ptpMax, 'ptpTo');
  }
  function setFilter(k, v) {
    if (v) state.filters[k] = v; else delete state.filters[k];
    state.page = 0;
    remember();
    buildSelects();
    load();
  }
  document.getElementById('tab-explorer').addEventListener('change', (e) => {
    const el = e.target.closest('[data-f]');
    if (el && (el.tagName === 'SELECT' || el.type === 'date')) setFilter(el.dataset.f, el.value);
  });
  document.getElementById('xpReset').addEventListener('click', () => { state.filters = {}; state.page = 0; state.search = ''; remember(); buildSelects(); load(); });
  document.getElementById('xpExport').addEventListener('click', exportCsv);

  function renderChips() {
    const chips = [
      ...FILTERS.filter(([k]) => state.filters[k]).map(([k, l]) => [k, `${l.replace(/ \(.*\)/, '')}: ${state.filters[k]}`]),
      ...Object.keys(DATE_LABELS).filter(k => state.filters[k]).map(k => [k, `${DATE_LABELS[k]}: ${state.filters[k]}`]),
    ];
    document.getElementById('xpChips').innerHTML = chips.length
      ? chips.map(([k, t]) => `<button class="xp-chip" data-clear="${k}" title="Remove this filter">${hEsc(t)} <span aria-hidden="true">×</span></button>`).join('')
        + `<button class="ask-link" data-ask="${hEsc(scoped('Why does performance here differ from the rest of the portfolio, what is driving it, and what should we do?'))}" data-mode="agent">${icon('spark', 'ico-xs')}Ask LensS about this view</button>`
      : '<span class="muted">No filters: showing the whole portfolio. Pick a filter, or click any bar below to drill in.</span>';
    document.querySelectorAll('#xpChips [data-clear]').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.clear, '')));
  }

  // ---- load
  async function load() {
    const my = ++state.seq;
    renderChips();
    document.getElementById('tab-explorer').classList.add('xp-loading');
    const qs = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v)).toString();
    try {
      const r = await fetch('/api/explorer/data' + (qs ? '?' + qs : ''));
      const d = await r.json();
      if (my !== state.seq) return;
      if (!r.ok) throw new Error(d.error || r.statusText);
      state.data = d;
      render();
    } catch (err) {
      if (my !== state.seq) return;
      console.error('Explorer failed to load', err);
      document.getElementById('xpMatch').textContent = 'Could not load. Please try again.';
      if (/Unknown /.test(String(err.message))) { state.filters = {}; remember(); buildSelects(); }
    } finally {
      if (my === state.seq) document.getElementById('tab-explorer').classList.remove('xp-loading');
    }
  }

  function render() {
    const d = state.data;
    const t = d.totals || {};
    const p = d.portfolio || {};
    const filtered = Object.keys(d.applied || {}).length > 0;
    document.getElementById('xpMatch').innerHTML = `${count(t.accounts)} matching accounts of ${count(p.accounts)} · ${money(t.outstanding, 2)} outstanding${filtered ? ` (${pct(num(t.outstanding) / num(p.outstanding), 1)} of the book)` : ''}`;
    document.getElementById('xpTargetNote').textContent = d.targetsFiltered ? 'targets exist by product and arrears stage only, so other filters do not apply to these three panels' : '';
    const steps = [renderKpis, renderSlicer, renderProducts, renderShortfall, renderHeat, renderDriverBars, renderDrivers,
      renderStrategies, renderFunnel, renderChannelEff, renderBestChannel, renderRegions, renderCollectors, renderAccountsTable, renderSegments];
    steps.forEach(fn => { try { fn(d); } catch (err) { console.error('Explorer panel failed', fn.name, err); } });
  }

  // ---- filtered headline measures, compared with the whole portfolio
  function renderKpis(d) {
    const t = d.totals || {};
    const p = d.portfolio || {};
    const filtered = Object.keys(d.applied || {}).length > 0;
    const delta = (key, good) => {
      if (!filtered || num(t[key]) === null || num(p[key]) === null) return '';
      const diff = num(t[key]) - num(p[key]);
      const pp = key === 'cost_to_collect' ? `${diff >= 0 ? '+' : '−'}${CUR}${Math.abs(diff).toFixed(3)}` : `${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)} pts`;
      const better = good ? diff > 0 : diff < 0;
      return `<span class="xk-d ${Math.abs(diff) < 1e-9 ? '' : better ? 'up' : 'down'}">${pp} vs portfolio</span>`;
    };
    const share = (key) => (filtered && num(p[key]) ? `<span class="xk-d">${pct(num(t[key]) / num(p[key]), 1)} of portfolio</span>` : '');
    const kept = t.promise_kept_rate;
    const tiles = [
      ['Accounts', count(t.accounts), share('accounts')],
      ['Outstanding', money(t.outstanding, 2), share('outstanding')],
      ['Collected this month', money(t.collected), share('collected')],
      ['Recovery rate', pct(t.recovery_rate, 2), delta('recovery_rate', true)],
      ['Customers reached', pct(t.rpc_rate), delta('rpc_rate', true)],
      ['Agreed to pay', pct(t.ptp_conversion), delta('ptp_conversion', true)],
      ['Promises honoured', pct(kept), delta('promise_kept_rate', true)],
      ['High-risk accounts', count(t.high_risk), filtered ? delta('high_risk_share', false) : `<span class="xk-d">${pct(t.high_risk_share)} of accounts</span>`],
      ['Accounts worsening', pct(t.roll_forward_rate), delta('roll_forward_rate', false)],
      ['Cost to collect', num(t.cost_to_collect) === null ? '—' : CUR + num(t.cost_to_collect).toFixed(3), delta('cost_to_collect', false)],
      ['Recovery opportunity', money(t.opportunity), share('opportunity')],
      ['Contact attempts per customer', num(t.avg_attempts) === null ? '—' : num(t.avg_attempts).toFixed(1), ''],
    ];
    document.getElementById('xpKpis').innerHTML = tiles.map(([l, v, sub]) => `<div class="xk"><div class="xk-l">${l}</div><div class="xk-v">${v}</div>${sub || ''}</div>`).join('');
  }

  // ---- Layer 1: dimension × measure slicer
  function renderSlicer(d) {
    const el = document.getElementById('xpSlicer');
    const rows = (d.by[state.dim] || []).slice();
    const m = MEASURES[state.measure];
    const pv = (d.portfolio || {})[state.measure];
    rows.sort((a, b) => (state.dim === 'bucket' ? 0 : num(b[state.measure]) - num(a[state.measure])));
    const max = Math.max(...rows.map(r => num(r[state.measure]) || 0), m.rate && num(pv) ? num(pv) : 0, 1e-9);
    const drillable = !state.filters[state.dim];
    const label = r => (state.dim === 'bucket' ? `${r.k} days` : r.k);
    const toneOf = (v) => {
      if (!m.rate || m.good === undefined || num(pv) === null) return 'brand';
      const better = m.good ? v > num(pv) * 1.05 : v < num(pv) * 0.95;
      const worse = m.good ? v < num(pv) * 0.95 : v > num(pv) * 1.05;
      return better ? 'good' : worse ? 'bad' : 'brand';
    };
    const bars = rows.map(r => {
      const v = num(r[state.measure]) || 0;
      return `<button class="xs-row${drillable ? '' : ' static'}" ${drillable ? `data-drill="${hEsc(r.k)}" title="Filter to ${hEsc(label(r))}"` : ''}>
        <div class="xs-top"><span class="xs-name">${hEsc(label(r))}</span>
          <span class="xs-meta">${count(r.accounts)} accounts · ${money(r.outstanding)} · ${pct(r.recovery_rate, 2)} recovery · ${pct(r.high_risk_share, 0)} high risk</span>
          <b class="xs-val">${m.fmt(r[state.measure])}</b></div>
        <div class="hbar-track">${m.rate && num(pv) !== null ? `<span class="hbar-marker" style="left:${Math.min(100, (num(pv) / max) * 100).toFixed(1)}%" title="Portfolio: ${m.fmt(pv)}"></span>` : ''}<span class="hbar-fill t-${toneOf(v)}" style="width:${Math.max(0.5, (v / max) * 100).toFixed(1)}%"></span></div>
      </button>`;
    }).join('');
    const table = `<div class="table-scroll flat"><table class="nice"><thead><tr><th>${hEsc(DIM_LABEL[state.dim])}</th><th>Accounts</th><th>Outstanding</th><th>Collected</th><th>Recovery</th><th>RPC</th><th>Agreed to pay</th><th>Promises honoured</th><th>High risk</th><th>Opportunity</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${hEsc(label(r))}</td><td>${count(r.accounts)}</td><td>${money(r.outstanding)}</td><td>${money(r.collected)}</td><td>${pct(r.recovery_rate, 2)}</td><td>${pct(r.rpc_rate)}</td><td>${pct(r.ptp_conversion)}</td><td>${pct(r.promise_kept_rate)}</td><td>${pct(r.high_risk_share)}</td><td>${money(r.opportunity)}</td><td>${xpView({ [state.dim]: r.k }, `${label(r)}: accounts`)}</td></tr>`).join('')}</tbody></table></div>`;
    const best = rows.length ? rows.reduce((a, r) => (num(r[state.measure]) > num(a[state.measure]) ? r : a)) : null;
    const worst = rows.length ? rows.reduce((a, r) => (num(r[state.measure]) < num(a[state.measure]) ? r : a)) : null;
    el.innerHTML = `<div class="panel-head"><div><div class="xs-kicker">Layer 1 · dimension &amp; measure</div><h3>Analytical exploration workspace</h3>
        <div class="panel-sub">${best && worst && rows.length > 1 ? `${hEsc(MEASURES[state.measure].label)}: highest <b>${hEsc(label(best))}</b> (${m.fmt(best[state.measure])}), lowest <b>${hEsc(label(worst))}</b> (${m.fmt(worst[state.measure])})${m.rate && num(pv) !== null ? ` · portfolio ${m.fmt(pv)} (marker)` : ''}.` : ''}</div></div>
      <div class="xs-ctl">
        <label>Dimension <select id="xsDim">${FILTERS.map(([k]) => `<option value="${k}"${k === state.dim ? ' selected' : ''}>${hEsc(DIM_LABEL[k])}</option>`).join('')}</select></label>
        <label>Measure <select id="xsMeasure">${Object.entries(MEASURES).map(([k, v]) => `<option value="${k}"${k === state.measure ? ' selected' : ''}>${hEsc(v.label)}</option>`).join('')}</select></label>
        <div class="seg-ctl xs-view"><button data-v="bars" class="${state.view === 'bars' ? 'on' : ''}" title="Bars">Bars</button><button data-v="table" class="${state.view === 'table' ? 'on' : ''}" title="Table">Table</button></div>
        ${askBtn(scoped(`Compare ${MEASURES[state.measure].label.toLowerCase()} by ${DIM_LABEL[state.dim].toLowerCase()} and explain what drives the differences`), 'agent')}
      </div></div>
      <div class="panel-body">${rows.length ? (state.view === 'table' ? table : `<div class="xs-list">${bars}</div>`) : '<div class="empty-note">No accounts match these filters.</div>'}
      ${drillable && rows.length > 1 && state.view === 'bars' ? '<div class="panel-note">Click a bar to filter everything on this page to it.</div>' : ''}</div>`;
    el.querySelector('#xsDim').addEventListener('change', e => { state.dim = e.target.value; remember(); renderSlicer(state.data); });
    el.querySelector('#xsMeasure').addEventListener('change', e => { state.measure = e.target.value; remember(); renderSlicer(state.data); });
    el.querySelectorAll('.xs-view button').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.v; renderSlicer(state.data); }));
    el.querySelectorAll('[data-drill]').forEach(b => b.addEventListener('click', () => setFilter(state.dim, b.dataset.drill)));
  }

  // ---- why: performance against target (targets exist by product × arrears stage)
  const targetRows = d => d.targets || [];
  function byProduct(d) {
    const m = new Map();
    for (const r of targetRows(d)) {
      const x = m.get(r.Product) || { Product: r.Product, collected: 0, target: 0 };
      x.collected += num(r.collected) || 0; x.target += num(r.target) || 0; m.set(r.Product, x);
    }
    return [...m.values()].map(x => ({ ...x, achievement: x.target ? x.collected / x.target : null, gap: Math.max(x.target - x.collected, 0) }));
  }
  function renderProducts(d) {
    const rows = byProduct(d).sort((a, b) => a.achievement - b.achievement);
    panel('xpProducts', 'Achievement by product', 'Collected vs monthly target. The line marks 100%.',
      ask('What is my MTD collections performance versus target by product?', 'chat'),
      rows.map(r => bar(hEsc(r.Product), r.achievement, 1.1, pct(r.achievement), tone(r.achievement),
        `${money(r.collected)} of ${money(r.target)} · <b>${money(r.gap)}</b> to go ${xpView({ product: r.Product }, `${r.Product} accounts`)}`, 1)).join('') || '<div class="empty-note">No data.</div>');
  }
  function renderShortfall(d) {
    const rows = targetRows(d).filter(r => num(r.gap) > 0).sort((a, b) => num(b.gap) - num(a.gap));
    const total = rows.reduce((a, r) => a + num(r.gap), 0) || 1;
    const top = rows.slice(0, 6);
    const max = Math.max(...top.map(r => num(r.gap) / total), 0.01);
    panel('xpShortfall', `Where the ${money(total)} shortfall comes from`, 'The products and arrears stages with the biggest gaps.',
      ask('Which portfolios are contributing most to the shortfall?', 'chat'),
      top.map(r => bar(`${hEsc(r.Product)} <span class="muted">· ${hEsc(r.DPD_Bucket)} days</span>`, num(r.gap) / total, max,
        `${money(r.gap)} <span class="muted">(${pct(num(r.gap) / total, 0)})</span>`, 'bad',
        xpView({ product: r.Product, bucket: r.DPD_Bucket }, `${r.Product} · ${r.DPD_Bucket} days accounts`, 'View accounts'))).join('') || '<div class="empty-note">No shortfall.</div>');
  }
  function renderHeat(d) {
    const cells = targetRows(d);
    const buckets = BUCKETS.filter(b => cells.some(c => c.DPD_Bucket === b));
    const products = byProduct(d).sort((a, b) => a.achievement - b.achievement).map(p => p.Product);
    const get = (p, b) => cells.find(c => c.Product === p && c.DPD_Bucket === b);
    const body = `<div class="heat" style="grid-template-columns:150px repeat(${buckets.length},1fr)">
      <div></div>${buckets.map(b => `<div class="heat-h">${b} days</div>`).join('')}
      ${products.map(p => `<div class="heat-r">${hEsc(p)}</div>${buckets.map(b => {
        const c = get(p, b);
        const a = c ? num(c.achievement) : null;
        return `<div class="heat-c t-${tone(a)}" role="button" tabindex="0" data-xpview="${hEsc(JSON.stringify({ product: p, bucket: b }))}" data-title="${hEsc(`${p} · ${b} days accounts`)}" title="${hEsc(p)} · ${b}: ${pct(a)} of target, ${money(c && c.gap)} to go. Click to see the accounts.">${a === null ? '—' : pct(a, 0)}<small>${c && num(c.gap) > 0 ? money(c.gap, 1) + ' gap' : 'on target'}</small></div>`;
      }).join('')}`).join('')}</div>
      <div class="heat-legend"><span class="t-bad">Below 88%</span><span class="t-warn">88–95%</span><span class="t-good">95% and above</span><span class="muted">· click a cell to see its accounts</span></div>`;
    panel('xpHeat', 'Target achievement by product and arrears stage', 'Red is furthest behind target.',
      ask('Which product and DPD bucket combinations are furthest behind target, and why?'), body);
  }

  // ---- why: drivers, strategies, funnel
  function renderDriverBars(d) {
    const rows = (d.by.driver || []).slice().sort((a, b) => num(a.recovery_rate) - num(b.recovery_rate));
    const max = Math.max(...rows.map(r => num(r.recovery_rate) || 0), 0.0001);
    const worst = rows[0];
    panel('xpDriverBars', "Why customers aren't paying", worst ? `<b>${hEsc(worst.k)}</b> has the lowest recovery rate.` : '',
      ask('Which non-payment drivers have the lowest recovery rate, and what should we do for each?'),
      rows.map((r, i) => bar(hEsc(r.k), num(r.recovery_rate), max * 1.05, pct(r.recovery_rate, 2),
        i < 2 ? 'bad' : 'brand', `${count(r.accounts)} accounts · ${money(r.outstanding)} outstanding ${xpView({ driver: r.k }, `Accounts: ${r.k}`)}`)).join('') || '<div class="empty-note">No data.</div>');
  }
  function renderDrivers(d) {
    const all = (d.by.driver || []).slice().sort((a, b) => num(b.accounts) - num(a.accounts));
    const top = all.slice(0, 4);
    const rest = all.slice(4);
    const rows = top.slice();
    if (rest.length) {
      const o = { k: `Others (${rest.length})`, accounts: 0, outstanding: 0, collected: 0 };
      rest.forEach(r => { o.accounts += num(r.accounts); o.outstanding += num(r.outstanding); o.collected += num(r.collected); });
      o.recovery_rate = o.outstanding ? o.collected / o.outstanding : null;
      rows.push(o);
    }
    const total = all.reduce((a, r) => a + num(r.accounts), 0) || 1;
    const low = all.slice().sort((a, b) => num(a.recovery_rate) - num(b.recovery_rate))[0];
    let cum = 0;
    const body = `<table class="mini drv-table"><thead><tr><th>Non-payment driver</th><th>Count</th><th>Outstanding</th><th>Recovery</th><th>Share (cumulative)</th><th></th></tr></thead><tbody>
      ${rows.map(r => { cum += num(r.accounts); const sh = num(r.accounts) / total; return `<tr${low && r.k === low.k ? ' class="hl"' : ''}>
        <td>${hEsc(r.k)}</td><td>${count(r.accounts)}</td><td>${money(r.outstanding)}</td><td>${pct(r.recovery_rate, 2)}</td>
        <td><span class="pareto"><span style="width:${(sh * 100).toFixed(1)}%"></span></span>${pct(sh, 0)} <span class="muted">(${pct(cum / total, 0)})</span></td>
        <td>${String(r.k).startsWith('Others (') ? '' : xpView({ driver: r.k }, `Accounts: ${r.k}`)}</td></tr>`; }).join('')}</tbody></table>
      <div class="panel-note">${low ? `Lowest recovery: <b>${hEsc(low.k)}</b> at ${pct(low.recovery_rate, 2)}. ` : ''}Drivers are the primary reason recorded for each account.</div>`;
    panel('xpDrivers', 'Top non-payment drivers', 'How many accounts each reason covers, and how much it recovers',
      ask('Which non-payment drivers account for most of the balance, and what should we do for each?'), body);
  }
  function renderStrategies(d) {
    const rows = d.by.strategy || [];
    const max = Math.max(...rows.map(r => num(r.recovery_rate) || 0), 0.0001);
    panel('xpStrategies', 'Treatment strategy results', 'Recovery rate and cost to collect for each strategy, as observed this month.',
      ask('Which treatment strategies perform best like-for-like, and what does that mean for our policy?'),
      rows.map((r, i) => bar(hEsc(r.k), num(r.recovery_rate), max * 1.05, pct(r.recovery_rate, 2), i === 0 ? 'good' : 'brand',
        `${count(r.accounts)} accounts · ${CUR}${num(r.cost_to_collect) === null ? '—' : num(r.cost_to_collect).toFixed(3)} cost per ${CUR}1 · ${pct(r.ptp_conversion, 0)} promise rate ${xpView({ strategy: r.k }, `${r.k} strategy accounts`)}`)).join('')
      + '<div class="panel-note">Strategies serve different customers, so compare like-for-like before changing policy (ask LensS for the matched comparison).</div>');
  }
  function renderFunnel(d) {
    const t = d.totals || {};
    const steps = [
      ['In arrears', t.accounts, 'accounts past due', ''],
      ['Tried to contact', t.attempted, 'at least one attempt', 'attempted'],
      ['Reached the right person', t.rpc_accounts, 'right-party contact', 'reached'],
      ['Promised to pay', t.ptp_accounts, 'promise to pay', 'promised'],
      ['Kept the promise', t.kept_accounts, 'paid when due', 'kept'],
    ];
    const top = num(steps[0][1]) || 1;
    const body = `<div class="funnel">${steps.map((s, i) => {
      const v = num(s[1]) || 0;
      const prev = i ? num(steps[i - 1][1]) || 0 : null;
      const conv = prev ? v / prev : null;
      return `<div class="fstep">
        <div class="fbar" style="width:${Math.max(6, (v / top) * 100).toFixed(1)}%"><span>${count(v)}</span></div>
        <div class="flabel"><b>${s[0]}</b><small>${s[2]}${conv !== null ? ` · <span class="${conv < 0.4 ? 'neg' : ''}">${pct(conv, 0)} of previous step</span>` : ''} ${xpView(s[3] ? { stage: s[3] } : {}, `${s[0]}: accounts`)}</small></div>
      </div>`;
    }).join('')}</div>`;
    panel('xpFunnel', 'From arrears to payment', 'Where we lose customers on the way to a payment.',
      ask('Where are we losing customers in the collections funnel, and how do we improve contact and promise-keeping?'), body);
  }

  // ---- why: channels, regions, collectors
  function renderChannelEff(d) {
    const rows = d.by.channel || [];
    const maxR = Math.max(...rows.map(r => num(r.recovery_rate) || 0), 0.0001);
    const body = `<table class="mini chan-table"><thead><tr><th>Channel</th><th>Accounts</th><th>RPC</th><th>Agreed to pay</th><th>Recovery</th><th>Cost per ${CUR}1</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr${i === 0 ? ' class="hl"' : ''}><td><span aria-hidden="true">${CHANNEL_ICON[r.k] || '•'}</span> ${hEsc(r.k)}</td><td>${count(r.accounts)}</td>
        <td>${pct(r.rpc_rate)}</td><td>${pct(r.ptp_conversion)}</td>
        <td><span class="pareto"><span style="width:${(100 * num(r.recovery_rate) / maxR).toFixed(0)}%"></span></span>${pct(r.recovery_rate, 2)}</td>
        <td>${num(r.cost_to_collect) === null ? '—' : CUR + num(r.cost_to_collect).toFixed(3)}</td><td>${xpView({ channel: r.k }, `Accounts preferring ${r.k}`)}</td></tr>`).join('')}</tbody></table>`;
    panel('xpChannelEff', 'Channel effectiveness', 'By each customer\'s preferred channel',
      ask('Which channels work best for reaching customers and recovering balances, and how should we change our channel mix?'), body);
  }
  function renderBestChannel(d) {
    const rows = d.bestChannel || [];
    const body = rows.length ? `<div class="chan-grid">${rows.map(r => `
      <div class="chan">
        <div class="chan-b">${hEsc(r.DPD_Bucket)} days</div>
        <div class="chan-c"><span aria-hidden="true">${CHANNEL_ICON[r.Preferred_Channel] || '•'}</span>${hEsc(r.Preferred_Channel)}</div>
        <div class="chan-m"><span>${pct(r.recovery_rate, 1)}</span> recovery</div>
        <div class="chan-m"><span>${pct(r.ptp_conversion, 0)}</span> promise rate</div>
        ${xpView({ bucket: r.DPD_Bucket, channel: r.Preferred_Channel }, `${r.DPD_Bucket} days · ${r.Preferred_Channel} accounts`, 'View accounts')}
      </div>`).join('')}</div>` : '<div class="empty-note">Too few accounts in these filters to compare channels (segments need 50+ accounts).</div>';
    panel('xpChannels', 'Best channel for each stage of arrears', 'Use the channel that is already working best at each stage.',
      ask('Which channel should we use for each DPD bucket?', 'chat'),
      body + '<div class="panel-note">Best-performing channel in each bucket, by recovery rate (segments of 50+ accounts). Observed results, not a guarantee of uplift.</div>');
  }
  function renderRegions(d) {
    const rows = d.by.region || [];
    const el = document.getElementById('xpRegions');
    const views = {
      Recovery: { key: 'recovery_rate', dp: 2, sub: r => `${count(r.accounts)} accounts · ${money(r.outstanding)}`, good: true },
      RPC: { key: 'rpc_rate', dp: 1, sub: r => `${pct(r.ptp_conversion)} agree to pay`, good: true },
      Risk: { key: 'high_risk_share', dp: 1, sub: r => `average risk score ${num(r.avg_risk) === null ? '—' : num(r.avg_risk).toFixed(2)}`, good: false },
    };
    const draw = (view) => {
      const v = views[view];
      const sorted = rows.slice().sort((a, b) => num(b[v.key]) - num(a[v.key]));
      const max = Math.max(...sorted.map(r => num(r[v.key]) || 0), 0.0001);
      const avg = sorted.reduce((a, r) => a + num(r[v.key]), 0) / (sorted.length || 1);
      el.innerHTML = `<div class="panel-head"><div><h3>Regional view</h3><div class="panel-sub">${view === 'Risk' ? 'Share of high-risk customers' : view === 'RPC' ? 'Right-party contact rate' : 'Recovery rate'} by region</div></div>
        <div class="chips">${Object.keys(views).map(k => `<button class="chip-btn${k === view ? ' on' : ''}" data-v="${k}">${k}</button>`).join('')}${askBtn(scoped('Which regions are underperforming on recovery and why?'), 'agent')}</div></div>
        <div class="panel-body">${sorted.map(r => {
          const val = num(r[v.key]);
          const bad = v.good ? val < avg * 0.93 : val > avg * 1.07;
          const good = v.good ? val > avg * 1.07 : val < avg * 0.93;
          return bar(hEsc(r.k), val, max * 1.05, pct(val, v.dp), bad ? 'bad' : good ? 'good' : 'brand', `${v.sub(r)} ${xpView({ region: r.k }, `${r.k} accounts`)}`);
        }).join('') || '<div class="empty-note">No data.</div>'}</div>`;
      el.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => draw(b.dataset.v)));
    };
    draw('Recovery');
  }
  function renderCollectors(d) {
    const c = d.collectors || {};
    const all = [...(c.top || []), ...(c.bottom || [])];
    const el = document.getElementById('xpCollectors');
    const metrics = { Recovery: 'recovery_rate', RPC: 'rpc_rate', PTP: 'ptp_conversion' };
    const draw = (m) => {
      const key = metrics[m];
      const uniq = [...new Map(all.map(r => [r.k, r])).values()].sort((a, b) => num(b[key]) - num(a[key]));
      const n = Math.min(10, Math.ceil(uniq.length / 2));
      const top = uniq.slice(0, n);
      const bottom = uniq.slice(-n).reverse();
      const row = (r, i) => `<div class="coll"><span class="coll-rank">${i + 1}</span><span class="mono">${hEsc(r.k)}</span><span class="muted">${hEsc(r.team || '')}${r.specialization ? ' · ' + hEsc(r.specialization) : ''}</span><b>${pct(r[key], m === 'Recovery' ? 2 : 1)}</b>${xpView({ collector: r.k }, `Collector ${r.k}: accounts`)}</div>`;
      const spread = uniq.length > 1 && num(uniq[uniq.length - 1].recovery_rate) ? (num(uniq[0].recovery_rate) / num(uniq[uniq.length - 1].recovery_rate)).toFixed(1) : null;
      el.innerHTML = `<div class="panel-head"><div><h3>Collector performance</h3><div class="panel-sub">${count(c.count)} collectors with 30+ accounts in this view · ranked by ${m === 'Recovery' ? 'recovery rate' : m === 'RPC' ? 'right-party contact' : 'promise-to-pay conversion'}${spread && m === 'Recovery' ? ` · the best recovers <b>${spread}×</b> the lowest` : ''}</div></div>
        <div class="chips">${Object.keys(metrics).map(k => `<button class="chip-btn${k === m ? ' on' : ''}" data-m="${k}">${k}</button>`).join('')}${askBtn(scoped('How do our collectors compare, and what separates the best performers from the rest?'), 'agent')}</div></div>
        <div class="panel-body">${uniq.length ? `<div class="coll-cols"><div><div class="coll-h good">Top ${n}</div>${top.map(row).join('')}</div>
        <div><div class="coll-h bad">Bottom ${n}</div>${bottom.map(row).join('')}</div></div>` : '<div class="empty-note">No collector has 30+ accounts in this view.</div>'}
        <div class="panel-note">Ranks among the top and bottom collectors by recovery; switch the measure to compare contact and promises.</div></div>`;
      el.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => draw(b.dataset.m)));
    };
    draw('Recovery');
  }

  // ---- Layer 2: account records
  const SORTS = {
    opportunity: ['Recovery opportunity', r => -num(r.Incremental_Recovery_Opportunity)],
    balance: ['Balance', r => -num(r.Outstanding_Balance)],
    risk: ['Non-payment risk', r => -num(r.Nonpayment_Risk)],
    propensity: ['Likely to pay', r => -num(r.Payment_Propensity)],
    dpd: ['Days overdue', r => -num(r.DPD)],
  };
  function accountRows() {
    const q = state.search.trim().toLowerCase();
    const rows = (state.data?.accounts || []).filter(r => !q || [r.Account_ID, r.Product, r.Region, r.Primary_Nonpayment_Driver, r.Collector_ID, r.Preferred_Channel, r.Treatment_Strategy]
      .some(v => String(v || '').toLowerCase().includes(q)));
    const key = SORTS[state.sort][1];
    return rows.sort((a, b) => key(a) - key(b));
  }
  function renderAccountsTable(d) {
    const el = document.getElementById('xpAccounts');
    const all = accountRows();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    const rows = all.slice(state.page * PAGE, state.page * PAGE + PAGE);
    const total = num((d.totals || {}).accounts) || 0;
    const prom = r => (num(r.PTP_Flag) ? `${money(r.PTP_Amount)}${r.PTP_Due_Date ? ` <span class="muted">due ${hEsc(r.PTP_Due_Date)}</span>` : ''}${num(r.Broken_PTP_Flag) ? ' <span class="xp-tag bad">broken</span>' : ''}` : '<span class="muted">none</span>');
    const searchHad = document.activeElement && document.activeElement.id === 'xpSearch';
    el.innerHTML = `<div class="panel-head"><div><div class="xs-kicker">Layer 2 · account records</div><h3>Accounts behind the numbers</h3>
        <div class="panel-sub">${all.length < (d.accounts || []).length ? `${count(all.length)} of ` : ''}the ${count((d.accounts || []).length)} accounts with the most recovery opportunity${total > (d.accounts || []).length ? ` (of ${count(total)} in this view)` : ''}</div></div>
      <div class="xs-ctl">
        <input type="search" id="xpSearch" placeholder="Search account, product, region, driver, collector" value="${hEsc(state.search)}" aria-label="Search accounts">
        <label>Sort <select id="xpSort">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div></div>
      <div class="panel-body"><div class="table-scroll flat"><table class="nice xp-acc">
        <thead><tr><th>Account</th><th>Product · stage</th><th>Region</th><th>Balance</th><th>Recoverable</th><th>Likely to pay</th><th>Risk</th><th>Why not paying</th><th>Promise</th><th>Collector</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td class="mono">${hEsc(r.Account_ID)}</td>
          <td>${hEsc(r.Product)} <span class="muted">· ${count(r.DPD)}d (${hEsc(r.DPD_Bucket)})</span></td>
          <td>${hEsc(r.Region)}</td><td>${money(r.Outstanding_Balance)}</td><td><b>${money(r.Incremental_Recovery_Opportunity)}</b></td>
          <td><span class="pill-bar"><span style="width:${(num(r.Payment_Propensity) * 100).toFixed(0)}%"></span></span>${pct(r.Payment_Propensity, 0)}</td>
          <td><span class="xp-tag ${num(r.Nonpayment_Risk) >= 0.7 ? 'bad' : num(r.Nonpayment_Risk) >= 0.4 ? 'warn' : 'ok'}">${num(r.Nonpayment_Risk).toFixed(2)}</span></td>
          <td>${hEsc(r.Primary_Nonpayment_Driver)}</td><td>${prom(r)}</td>
          <td class="mono">${hEsc(r.Collector_ID)} <span class="muted">${hEsc(r.Collector_Team || '')}</span></td>
          <td><button class="ask-link" data-ask="${hEsc(`Tell me about account ${r.Account_ID}: why it is not paying, its risk and propensity, and the next best action.`)}" data-mode="chat">${icon('spark', 'ico-xs')}Ask LensS</button></td></tr>`).join('')
          || '<tr><td colspan="11" class="empty-note">No accounts match.</td></tr>'}</tbody></table></div>
        <div class="xp-pager"><span>Showing ${all.length ? state.page * PAGE + 1 : 0} to ${Math.min(all.length, (state.page + 1) * PAGE)} of ${count(all.length)}</span>
          <span><button class="btn ghost" id="xpPrev" ${state.page ? '' : 'disabled'} aria-label="Previous page">‹</button> Page ${state.page + 1} of ${pages} <button class="btn ghost" id="xpNext" ${state.page < pages - 1 ? '' : 'disabled'} aria-label="Next page">›</button></span></div>
      </div>`;
    const s = el.querySelector('#xpSearch');
    s.addEventListener('input', () => { state.search = s.value; state.page = 0; renderAccountsTable(state.data); });
    if (searchHad) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    el.querySelector('#xpSort').addEventListener('change', e => { state.sort = e.target.value; state.page = 0; renderAccountsTable(state.data); });
    el.querySelector('#xpPrev').addEventListener('click', () => { state.page--; renderAccountsTable(state.data); });
    el.querySelector('#xpNext').addEventListener('click', () => { state.page++; renderAccountsTable(state.data); });
  }

  function renderSegments(d) {
    const tbody = document.querySelector('#segmentTable tbody');
    tbody.innerHTML = '';
    (d.cells || []).forEach(s => {
      const rate = Number(s.recovery_rate);
      const t = rate < 0.025 ? 'red' : rate < 0.035 ? 'amber' : 'green';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${hEsc(s.Product)}</td><td>${hEsc(s.DPD_Bucket)}</td><td>${fmtNum(s.accounts)}</td>
        <td>${fmtMoney(s.outstanding)}</td><td>${fmtMoney(s.collected)}</td>
        <td><span class="badge ${t}">${fmtPct(s.recovery_rate)}</span></td>
        <td>${fmtPct(s.rpc_rate)}</td><td>${fmtPct(s.ptp_conversion)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function exportCsv() {
    const rows = accountRows();
    if (!rows.length) return;
    const cols = ['Account_ID', 'Product', 'DPD_Bucket', 'DPD', 'Region', 'Preferred_Channel', 'Treatment_Strategy', 'Primary_Nonpayment_Driver',
      'Collector_ID', 'Collector_Team', 'Last_Contact_Date', 'PTP_Due_Date', 'PTP_Flag', 'PTP_Amount', 'Broken_PTP_Flag',
      'Outstanding_Balance', 'Recovery_MTD', 'Incremental_Recovery_Opportunity', 'Payment_Propensity', 'Nonpayment_Risk'];
    const cell = v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const sc = scopeText();
    const csv = [`# LensS Collections Explorer, snapshot ${state.data.asOf}${sc ? `, filters: ${sc}` : ''}`, cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `lenss-explorer-accounts-${state.data.asOf}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- first open
  let started = false;
  window.loadExplorer = async function loadExplorer() {
    if (started) return;
    started = true;
    document.querySelectorAll('#tab-explorer .panel').forEach(p => { if (!p.innerHTML.trim()) p.innerHTML = '<div class="skel skel-h"></div><div class="skel"></div><div class="skel"></div><div class="skel short"></div>'; });
    try {
      const r = await fetch('/api/explorer/options');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      state.options = await r.json();
      for (const k of Object.keys(state.filters)) {
        if (DATE_LABELS[k]) continue;
        if (!(state.options.dims[k] || []).includes(state.filters[k])) delete state.filters[k];
      }
    } catch (err) {
      console.error('Explorer options failed', err);
      document.getElementById('xpMatch').textContent = 'The Explorer view is not available yet. Run the deploy\'s views step.';
      started = false;
      return;
    }
    buildSelects();
    load();
  };
  /** Open the Explorer filtered to one value (used by the Command Center). */
  window.exploreBy = (k, v) => { state.filters = v ? { [k]: v } : {}; remember(); if (started) { buildSelects(); load(); } window.showTab && window.showTab('explorer'); };
})();
