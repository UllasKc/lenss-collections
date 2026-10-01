// Chat + Agent: ChatGPT-style sessions, per-question mode, rendered markdown and charts.

const MODE_HINT = { chat: 'Quick answer · ~20s', agent: 'Deep multi-step analysis · 1–3 min' };

let currentMode = readPref('lenss.mode', 'chat');
let activeSessionId = null;
let sessions = [];
let sending = false;

const msgsEl = document.getElementById('chatMsgs');
const inputEl = document.getElementById('chatInput');
const sendBtn = document.getElementById('chatSend');
const sessionListEl = document.getElementById('sessionList');
const emptyEl = document.getElementById('chatEmpty');
const titleEl = document.getElementById('chatTitle');

function readPref(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function writePref(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- mode switch

function setMode(mode) {
  currentMode = mode === 'agent' ? 'agent' : 'chat';
  writePref('lenss.mode', currentMode);
  document.querySelectorAll('.mode-pill').forEach(b => {
    const on = b.dataset.mode === currentMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  document.getElementById('modeHint').textContent = MODE_HINT[currentMode];
}
document.querySelectorAll('.mode-pill').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); inputEl.focus(); }));
setMode(currentMode);

// ---------------------------------------------------------------- composer

sendBtn.addEventListener('click', () => sendMessage());
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
inputEl.addEventListener('input', autosize);
function autosize() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px'; }

// ---------------------------------------------------------------- starter questions
// One list feeds both the empty-state tiles and the side panel shown once a
// conversation has started. Each question is checked against the live Genie
// space for a strong answer before being listed. The server owns the list
// (it also pre-warms the answer cache with it); these copies are only a
// fallback until /api/chat/suggestions answers.
let STARTERS = [
  { mode: 'chat', label: 'MTD performance vs target by product', q: 'What is my MTD collections performance versus target by product?' },
  { mode: 'chat', label: 'Accounts needing immediate intervention', q: 'Which accounts require immediate intervention?' },
  { mode: 'chat', label: 'Portfolios contributing most to the shortfall', q: 'Which portfolios are contributing most to the shortfall?' },
  { mode: 'agent', label: 'Why are collections lagging, and what should we do?', q: 'Why are collections lagging this month and what should we do about it?' },
  { mode: 'agent', label: 'Are our policies too aggressive?', q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.' },
  { mode: 'agent', label: 'Biggest recovery opportunity and best channel', q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?' },
];

function starterButton(s, cls) {
  const b = document.createElement('button');
  b.className = cls;
  b.title = s.q;
  b.innerHTML = `<span class="tag ${s.mode}">${s.mode === 'agent' ? 'Agent' : 'Chat'}</span><span class="starter-text">${esc(s.label)}</span>`;
  b.addEventListener('click', () => {
    if (sending) return;
    setMode(s.mode);
    // A suggested question stands on its own, so it can be answered from the cache.
    sendMessage(s.q, { standalone: true });
  });
  return b;
}
// The side panel shows the six starters plus four more (five per mode), also
// checked against the live Genie space for strong answers.
let MORE_SUGGESTIONS = [
  { mode: 'chat', label: 'Best channel for each DPD bucket', q: 'Which channel should we use for each DPD bucket?' },
  { mode: 'chat', label: 'Non-payment drivers with the lowest recovery', q: 'Which non-payment drivers have the lowest recovery rate?' },
  { mode: 'agent', label: 'Best channels and contact times, and what to change', q: 'Which channels and contact times work best for reaching customers, and how should we change our contact strategy?' },
  { mode: 'agent', label: 'Why so many broken promises, and where to act first', q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?' },
];

function renderSuggestions() {
  const grid = document.getElementById('starterGrid');
  const list = document.getElementById('suggestList');
  grid.innerHTML = '';
  list.innerHTML = '';
  STARTERS.forEach(s => grid.appendChild(starterButton(s, 'starter')));
  const all = STARTERS.concat(MORE_SUGGESTIONS);
  [['chat', 'Chat · quick answers'], ['agent', 'Agent · deep analysis']].forEach(([mode, title]) => {
    const h = document.createElement('div');
    h.className = 'suggest-group';
    h.textContent = title;
    list.appendChild(h);
    all.filter(s => s.mode === mode).forEach(s => list.appendChild(starterButton(s, 'suggest-item')));
  });
}
renderSuggestions();
fetch('/api/chat/suggestions').then(r => r.ok ? r.json() : null).then(d => {
  if (!d || !Array.isArray(d.starters) || !d.starters.length) return;
  STARTERS = d.starters;
  MORE_SUGGESTIONS = d.more || [];
  renderSuggestions();
}).catch(() => {});

// The side panel can be collapsed to a slim rail; the choice is remembered.
const chatWrapEl = document.querySelector('#tab-assistant .chatwrap');
const suggestPanel = document.getElementById('suggestPanel');
const suggestToggle = document.getElementById('suggestToggle');
function setSuggestOpen(open) {
  chatWrapEl.classList.toggle('suggest-collapsed', !open);
  suggestToggle.setAttribute('aria-expanded', String(open));
  suggestToggle.title = open ? 'Hide suggested questions' : 'Show suggested questions';
  writePref('lenss.suggestOpen', open ? '1' : '0');
}
suggestToggle.addEventListener('click', () => setSuggestOpen(suggestToggle.getAttribute('aria-expanded') !== 'true'));
setSuggestOpen(readPref('lenss.suggestOpen', '1') === '1');

document.getElementById('newSessionBtn').addEventListener('click', newChat);

function newChat() {
  activeSessionId = null;
  msgsEl.innerHTML = '';
  titleEl.textContent = 'New chat';
  updateEmpty();
  renderSessionList();
  inputEl.focus();
}

// Empty conversation: starter tiles in the middle. Once it has messages: the same
// questions move to the collapsible panel on the right.
function updateEmpty() {
  const started = msgsEl.children.length > 0;
  emptyEl.classList.toggle('hidden', started);
  suggestPanel.hidden = !started;
  chatWrapEl.classList.toggle('has-suggest', started);
  document.getElementById('pdfBtn').hidden = !started;
}

// ---------------------------------------------------------------- sessions

async function loadSessions() {
  sessions = await fetch('/api/chat/sessions').then(r => r.json());
  renderSessionList();
}

function dayGroup(ts) {
  const d = new Date(ts), now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 7) return 'Previous 7 days';
  if (diff <= 30) return 'Previous 30 days';
  return 'Older';
}

function renderSessionList() {
  sessionListEl.innerHTML = '';
  if (!sessions.length) {
    sessionListEl.innerHTML = '<div class="sessions-empty">Your conversations will appear here.</div>';
    return;
  }
  let lastGroup = null;
  sessions.forEach(s => {
    const g = dayGroup(s.updated_at);
    if (g !== lastGroup) {
      const h = document.createElement('div');
      h.className = 'sgroup';
      h.textContent = g;
      sessionListEl.appendChild(h);
      lastGroup = g;
    }
    const div = document.createElement('div');
    div.className = 'session-item' + (s.session_id === activeSessionId ? ' on' : '');
    div.title = s.title || 'Untitled chat';
    div.innerHTML = `<span class="stitle">${esc(s.title || 'Untitled chat')}</span>
      <button class="sact" data-act="rename" title="Rename">✎</button>
      <button class="sact" data-act="delete" title="Delete">🗑</button>`;
    div.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'rename') { e.stopPropagation(); startRename(div, s); }
      else if (act === 'delete') { e.stopPropagation(); deleteSession(s); }
      else if (!div.querySelector('input')) openSession(s.session_id);
    });
    sessionListEl.appendChild(div);
  });
}

function startRename(div, s) {
  const span = div.querySelector('.stitle');
  const input = document.createElement('input');
  input.value = s.title || '';
  span.replaceWith(input);
  div.querySelectorAll('.sact').forEach(b => b.remove());
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const title = input.value.trim();
    if (save && title && title !== s.title) {
      const r = await fetch(`/api/chat/sessions/${s.session_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      if (r.ok) {
        s.title = title;
        if (s.session_id === activeSessionId) titleEl.textContent = title;
      }
    }
    renderSessionList();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}

async function deleteSession(s) {
  if (!confirm(`Delete "${s.title || 'Untitled chat'}"? This can't be undone.`)) return;
  const r = await fetch(`/api/chat/sessions/${s.session_id}`, { method: 'DELETE' });
  if (!r.ok) return;
  sessions = sessions.filter(x => x.session_id !== s.session_id);
  if (s.session_id === activeSessionId) newChat();
  else renderSessionList();
}

async function openSession(id) {
  if (sending) return;
  activeSessionId = id;
  const session = sessions.find(s => s.session_id === id);
  titleEl.textContent = (session && session.title) || 'Untitled chat';
  renderSessionList();
  msgsEl.innerHTML = '';
  const messages = await fetch(`/api/chat/sessions/${id}/messages`).then(r => r.json());
  if (activeSessionId !== id) return;
  let question = '';
  messages.forEach((m, i) => {
    if (m.role === 'user') { addUserBubble(m.content, m.mode); question = m.content; }
    else addAnswer(normalizeStored(m), {
      mode: m.mode, at: m.created_at, messageId: m.message_id, feedback: m.feedback,
      question, canRefresh: i === messages.length - 1,
    });
  });
  updateEmpty();
}

/** Stored messages carry the normalized answer in attachment_json (v2); older ones only text. */
function normalizeStored(m) {
  const a = m.attachment_json;
  if (a && a.version === 2) return a;
  return { mode: m.mode, text: m.content || '', charts: [] };
}

// ---------------------------------------------------------------- bubbles

function addRow(role) {
  const row = document.createElement('div');
  row.className = 'turnrow ' + role;
  const msg = document.createElement('div');
  msg.className = 'msg';
  row.appendChild(msg);
  msgsEl.appendChild(row);
  updateEmpty();
  return msg;
}

function scrollToEnd() { msgsEl.scrollTop = msgsEl.scrollHeight; }

function addUserBubble(text) {
  const msg = addRow('user');
  msg.textContent = text;
  scrollToEnd();
}

function metaLine(mode, extra) {
  return `<div class="meta"><span class="tag ${mode}">${mode === 'agent' ? 'Agent' : 'Chat'}</span>${extra ? `<span>${esc(extra)}</span>` : ''}</div>`;
}

function addAnswer(answer, opts) {
  const msg = addRow('bot');
  renderAnswer(msg, answer, opts);
  return msg;
}

function renderAnswer(msg, answer, opts) {
  const mode = answer.mode || opts.mode || 'chat';
  const charts = answer.charts || [];
  const placed = new Set();
  const body = document.createElement('div');
  body.className = 'md';
  body.innerHTML = renderMarkdown(answer.text || (charts.length ? '' : 'No answer text was returned.'));
  body.querySelectorAll('[data-chart]').forEach(ph => {
    const c = charts.find(x => x.id === ph.dataset.chart);
    if (c) { ph.replaceWith(renderViz(c)); placed.add(c.id); } else ph.remove();
  });
  charts.filter(c => !placed.has(c.id)).forEach(c => body.appendChild(renderViz(c)));
  msg.innerHTML = '';
  msg.appendChild(body);

  if (answer.steps && answer.steps.length) {
    const d = document.createElement('details');
    d.className = 'steps';
    const n = answer.steps.filter(s => s.kind === 'sql').length;
    d.innerHTML = `<summary>How the agent worked it out · ${answer.steps.length} steps, ${n} ${n === 1 ? 'query' : 'queries'}</summary>
      <ol>${answer.steps.map(s => `<li>${s.kind === 'sql' ? '🔎 ' : s.kind === 'viz' ? '📊 ' : ''}${esc(s.text)}${s.sql ? `<br><code>${esc(s.sql.replace(/\s+/g, ' ').slice(0, 300))}</code>` : ''}</li>`).join('')}</ol>`;
    msg.appendChild(d);
  }

  if (answer.suggestions && answer.suggestions.length && opts.live) {
    const f = document.createElement('div');
    f.className = 'followups';
    answer.suggestions.slice(0, 3).forEach(q => {
      const b = document.createElement('button');
      b.className = 'followup';
      b.textContent = q;
      b.addEventListener('click', () => sendMessage(q));
      f.appendChild(b);
    });
    msg.appendChild(f);
  }

  // Guardrails: a blocked question shows its reason as the answer; notes (e.g. removed PII) sit above the footer.
  if (answer.guard && answer.guard.blocked) msg.classList.add('guard-blocked');
  ((answer.guard && answer.guard.notices) || []).forEach(n => {
    msg.insertAdjacentHTML('beforeend', `<div class="guard-note"><span aria-hidden="true">🛡</span> ${esc(n)}</div>`);
  });

  const when = opts.at ? new Date(opts.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const took = opts.latencyMs && !answer.cache ? `${(opts.latencyMs / 1000).toFixed(0)}s` : '';
  msg.insertAdjacentHTML('beforeend', metaLine(mode, [took, when].filter(Boolean).join(' · ')));
  if (answer.cache) addCacheNote(msg, msg.lastElementChild, answer, opts);
  if (opts.messageId) addFeedback(msg.lastElementChild, opts.messageId, opts.feedback);
}

/** Cached answers say so, with when they were generated, and can be re-asked live. */
function addCacheNote(msg, metaEl, answer, opts) {
  const g = new Date(answer.cache.generatedAt);
  const sameDay = g.toDateString() === new Date().toDateString();
  const at = (sameDay ? '' : g.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ') +
    g.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const note = document.createElement('span');
  note.className = 'cache-note';
  const similar = answer.cache.similarTo;
  note.title = similar
    ? `Your question matched an earlier one closely (${(similar.similarity * 100).toFixed(1)}% similar, same products, buckets and figures), so its answer was reused. Refresh asks Genie again.`
    : 'This question was answered recently on the same data, so the saved answer was reused. Refresh asks Genie again.';
  note.innerHTML = `<span class="cache-bolt" aria-hidden="true">⚡</span>Answered from cache` +
    (similar ? ` · similar to “${esc(similar.question.length > 70 ? similar.question.slice(0, 70) + '…' : similar.question)}”` : '') +
    ` · generated ${esc(at)}`;
  metaEl.appendChild(note);
  if (opts.messageId && opts.question && opts.canRefresh !== false) {
    const b = document.createElement('button');
    b.className = 'cache-refresh';
    b.textContent = '↻ Refresh';
    b.title = 'Ask Genie again for a live answer';
    b.addEventListener('click', () => {
      if (sending) return;
      setMode(answer.mode || opts.mode || 'chat');
      sendMessage(opts.question, { refreshOf: opts.messageId, target: msg });
    });
    metaEl.appendChild(b);
  }
}

/** 👍/👎 on an answer: saved in the app and sent to the Genie space's Monitor. Click again to clear. */
function addFeedback(metaEl, messageId, current) {
  const box = document.createElement('span');
  box.className = 'fb';
  const thumb = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/></svg>';
  box.innerHTML = `<span class="fb-note"></span>
    <button class="fb-up" data-r="up" title="Helpful" aria-label="Helpful">${thumb}</button>
    <button class="fb-down" data-r="down" title="Not helpful" aria-label="Not helpful">${thumb}</button>`;
  let rating = current === 1 ? 'up' : current === -1 ? 'down' : null;
  const paintFb = () => box.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.r === rating);
    b.setAttribute('aria-pressed', String(b.dataset.r === rating));
  });
  paintFb();
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const next = rating === b.dataset.r ? null : b.dataset.r;
    box.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try {
      const r = await fetch(`/api/chat/messages/${messageId}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: next }),
      });
      if (r.ok) {
        rating = next;
        box.querySelector('.fb-note').textContent = next ? 'Thanks for the feedback' : '';
      }
    } finally {
      box.querySelectorAll('button').forEach(x => { x.disabled = false; });
      paintFb();
    }
  }));
  metaEl.appendChild(box);
}

// ---------------------------------------------------------------- sending

async function ensureSession() {
  if (activeSessionId) return activeSessionId;
  const s = await fetch('/api/chat/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }).then(r => r.json());
  activeSessionId = s.session_id;
  return activeSessionId;
}

async function sendMessage(preset, opts = {}) {
  const text = (preset || inputEl.value).trim();
  if (!text || sending) return;
  if (window.offerNotifications) window.offerNotifications();
  const mode = currentMode;
  sending = true;
  sendBtn.disabled = true;
  if (!opts.refreshOf) inputEl.value = '';
  autosize();
  document.querySelectorAll('.followups, .cache-refresh').forEach(f => f.remove());

  // A refresh re-asks the same question and replaces the cached answer in place.
  let thinking = opts.target;
  if (!thinking) {
    addUserBubble(text);
    thinking = addRow('bot');
  }
  thinking.classList.add('thinking');
  const started = Date.now();
  const steps = [];
  let status = mode === 'agent' ? 'Planning the analysis…' : 'Understanding the question…';
  const paint = () => {
    const secs = Math.floor((Date.now() - started) / 1000);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    thinking.innerHTML = `<div class="tline"><span class="dot"></span><span>${esc(status)}</span><span style="margin-left:auto;font:11px var(--mono)">${clock}</span></div>` +
      (steps.length ? `<div class="steps-live">${steps.slice(-5).map(s => `<div>${esc(s)}</div>`).join('')}</div>` : '') +
      metaLine(mode);
  };
  paint();
  const timer = setInterval(paint, 1000);
  scrollToEnd();

  let answer = null;
  let errorText = null;
  let latencyMs = null;
  let savedId = null;
  let sentSessionId = null;
  try {
    const sessionId = await ensureSession();
    sentSessionId = sessionId;
    const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, mode, standalone: Boolean(opts.standalone), refreshOf: opts.refreshOf || undefined }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        let type = 'message';
        const lines = [];
        for (const line of part.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) lines.push(line.slice(5).trim());
        }
        if (!lines.length) continue;
        let data;
        try { data = JSON.parse(lines.join('\n')); } catch { continue; }

        if (type === 'progress') {
          if (data.kind === 'status') status = humanizeStatus(data.text);
          else if (data.kind === 'sql') { status = 'Running queries…'; steps.push('🔎 ' + data.text); }
          else if (data.kind === 'viz') { status = 'Building a chart…'; steps.push('📊 ' + data.text); }
          else if (data.kind === 'reasoning') { status = 'Reasoning…'; if (data.text) steps.push('💭 ' + data.text.slice(0, 140)); }
          else if (data.kind === 'writing') status = 'Writing the answer…';
          paint();
          scrollToEnd();
        } else if (type === 'answer') {
          answer = data;
        } else if (type === 'saved') {
          savedId = data.messageId;
        } else if (type === 'error') {
          errorText = data.error;
        } else if (type === 'session_title') {
          titleEl.textContent = data.title;
        } else if (type === 'done') {
          latencyMs = data.latencyMs;
        }
      }
    }
  } catch (err) {
    console.error(err);
    errorText = 'Could not reach the assistant.';
  }

  clearInterval(timer);
  thinking.classList.remove('thinking');
  if (answer) {
    renderAnswer(thinking, answer, { mode, latencyMs, at: new Date(), live: true, messageId: savedId, question: text });
  } else {
    thinking.classList.add('failed');
    thinking.innerHTML = `Sorry — that question couldn't be answered. Please try again${mode === 'chat' ? ', or switch to Agent for a deeper analysis' : ''}.` +
      metaLine(mode, errorText ? 'error' : '');
    console.warn('Assistant error:', errorText);
  }
  scrollToEnd();
  sending = false;
  sendBtn.disabled = false;
  loadSessions().catch(console.error);
  if (window.notifyAnswerReady) {
    window.notifyAnswerReady({ sessionId: sentSessionId, question: text, ok: Boolean(answer && !(answer.guard && answer.guard.blocked)) });
  }
}

function humanizeStatus(status) {
  const map = {
    SUBMITTED: 'Sending the question…',
    FETCHING_METADATA: 'Looking up the data…',
    FILTERING_CONTEXT: 'Understanding the question…',
    ASKING_AI: 'Writing the SQL…',
    PENDING_WAREHOUSE: 'Starting the warehouse…',
    EXECUTING_QUERY: 'Running the query…',
    COMPLETED: 'Finishing up…',
  };
  return map[status] || 'Working…';
}

// ---------------------------------------------------------------- markdown

/** Small, safe markdown renderer: everything is escaped first. */
function renderMarkdown(src) {
  const text = stripCitations(String(src)).replace(/\\([[\]])/g, '$1').replace(/\r/g, '');
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const chart = line.trim().match(/^\[\[chart:([^\]]+)\]\]$/);
    if (chart) { out.push(`<div data-chart="${esc(chart[1])}"></div>`); i++; continue; }
    if (/^```/.test(line.trim())) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="mdtable"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const isItem = l => (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/).test(l);
      const items = [];
      let n = 0;
      for (;;) {
        // Agent answers often put a blank line between items; that's still one list.
        while (i < lines.length && isItem(lines[i])) {
          const num = ordered ? parseInt(lines[i].match(/\d+/)[0], 10) : 0;
          // Keep the author's numbering, but count on when every item is "1." (auto-numbering).
          n = ordered && num > n ? num : n + 1;
          items.push(`<li${ordered ? ` value="${n}"` : ''}>${inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`);
          i++;
        }
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j > i && j < lines.length && isItem(lines[j])) { i = j; continue; }
        break;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||\s*([-*•]|\d+[.)])\s+|\[\[chart:)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}

/** Genie's citation links point into the Genie space in the workspace, which app users
 * can't open; removed here too for answers stored before the server stripped them. */
function stripCitations(s) {
  return s
    .replace(/[ \t]*\\?\[\\?\[\d+\\?\]\([^)\s]*\)\\?\]/g, '') // [[1](url)]
    .replace(/[ \t]*\\?\[\\?\[\d+\\?\]\\?\]\([^)\s]*\)/g, '') // [[1]](url)
    .replace(/[ \t]*\\?\[\\?\[\d+\\?\]\\?\]?\([^)\s]*$/, '') // a citation cut off by truncation
    .replace(/[ \t]+([.,;:])/g, '$1');
}

function inline(s) {
  let t = esc(s);
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}

// ---------------------------------------------------------------- charts

const NUMERIC_TYPES = /^(DOUBLE|FLOAT|DECIMAL|INT|INTEGER|BIGINT|LONG|SHORT|SMALLINT|TINYINT|BYTE|NUMBER)/i;
const PALETTE = ['#1D4ED8', '#9333EA', '#0E9384', '#D97706', '#DC2626', '#4338CA'];

function analyse(chart) {
  const cols = chart.columns.map((c, i) => {
    const vals = chart.rows.map(r => r[i]).filter(v => v !== null && v !== '');
    const numeric = NUMERIC_TYPES.test(c.type || '') || (vals.length > 0 && vals.every(v => !isNaN(Number(v))));
    const nums = numeric ? vals.map(Number) : [];
    const max = nums.length ? Math.max(...nums.map(Math.abs)) : 0;
    const ratio = numeric && max <= 1.5 && /pct|percent|rate|ratio|achievement|share|conversion/i.test(c.name);
    const idLike = /(^|_)(id|key|token)$/i.test(c.name);
    const dateLike = /DATE|TIMESTAMP/i.test(c.type || '') || /date|month|day|week/i.test(c.name);
    return { name: c.name, i, numeric: numeric && !idLike, ratio, max, dateLike };
  });
  return cols;
}

function fmtCell(v, col) {
  if (v === null || v === undefined || v === '') return '—';
  if (!col.numeric) return esc(v);
  const n = Number(v);
  if (col.ratio) return (n * 100).toFixed(1) + '%';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function compact(n) {
  const a = Math.abs(n);
  // One decimal below 10 (1.5K, 2.5M) so neighbouring axis ticks don't all read "1K"; trailing ".0" dropped.
  const unit = (v, s) => (Math.abs(v) < 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(0)) + s;
  if (a >= 1e9) return unit(n / 1e9, 'B');
  if (a >= 1e6) return unit(n / 1e6, 'M');
  if (a >= 1e3) return unit(n / 1e3, 'K');
  return String(Math.round(n * 100) / 100);
}

function chartPlan(chart) {
  const cols = analyse(chart);
  const labels = cols.filter(c => !c.numeric);
  const nums = cols.filter(c => c.numeric);
  if (chart.rows.length < 2 || !nums.length || !labels.length) return null;
  const big = nums.filter(c => !c.ratio);
  const ratios = nums.filter(c => c.ratio);
  let bars, line = null;
  if (big.length) {
    const top = big[0].max || 1;
    bars = big.filter(c => c.max >= top / 25 && c.max <= top * 25).slice(0, 3);
    line = ratios[0] || null;
  } else {
    bars = ratios.slice(0, 3);
  }
  const labelCols = labels.slice(0, 2);
  const timeSeries = labelCols[0].dateLike && chart.rows.length > 2;
  return { labelCols, bars, line, timeSeries, cols };
}

function renderViz(chart) {
  const plan = chartPlan(chart);
  const wrap = document.createElement('div');
  wrap.className = 'viz';
  const views = [plan && 'Chart', 'Table', chart.sql && 'SQL'].filter(Boolean);
  wrap.innerHTML = `<div class="viz-head"><div class="viz-title" title="${esc(chart.title)}">${esc(chart.title)}</div>
    <div class="viz-tabs">${views.map((v, k) => `<button class="${k === 0 ? 'on' : ''}" data-view="${v}">${v}</button>`).join('')}</div></div>
    <div class="viz-body"></div>${chart.truncated ? '<div class="viz-note">Showing the first 500 rows.</div>' : ''}`;
  const bodyEl = wrap.querySelector('.viz-body');
  let chartObj = null;
  const show = (view) => {
    wrap.querySelectorAll('.viz-tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    if (chartObj) { chartObj.destroy(); chartObj = null; }
    if (view === 'Chart') {
      bodyEl.innerHTML = '<div class="cv"><canvas></canvas></div>';
      chartObj = drawChart(bodyEl.querySelector('canvas'), chart, plan);
    } else if (view === 'Table') {
      const cols = plan ? plan.cols : analyse(chart);
      bodyEl.innerHTML = `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${
        chart.rows.map(r => `<tr>${cols.map(c => `<td>${fmtCell(r[c.i], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else {
      bodyEl.innerHTML = `<pre>${esc(chart.sql)}</pre>`;
    }
  };
  wrap.querySelector('.viz-tabs').addEventListener('click', (e) => { if (e.target.dataset.view) show(e.target.dataset.view); });
  // Draw once attached so Chart.js can measure the container.
  requestAnimationFrame(() => show(views[0]));
  return wrap;
}

function drawChart(canvas, chart, plan) {
  if (typeof Chart === 'undefined') return null;
  const rows = plan.timeSeries ? chart.rows : chart.rows.slice(0, 25);
  const labels = rows.map(r => plan.labelCols.map(c => r[c.i] ?? '—').join(' · '));
  const horizontal = !plan.timeSeries && (rows.length > 10 || labels.some(l => l.length > 18));
  const datasets = plan.bars.map((c, k) => ({
    type: plan.timeSeries ? 'line' : 'bar',
    label: c.name.replace(/_/g, ' '),
    data: rows.map(r => (r[c.i] === null ? null : Number(r[c.i]) * (c.ratio && !plan.line ? 100 : 1))),
    backgroundColor: PALETTE[k] + (plan.timeSeries ? '33' : 'CC'),
    borderColor: PALETTE[k],
    borderWidth: plan.timeSeries ? 2 : 0,
    borderRadius: 4,
    tension: .25,
    yAxisID: 'y',
    xAxisID: 'x',
  }));
  const ratioOnly = !plan.line && plan.bars.every(c => c.ratio);
  if (plan.line && !horizontal) {
    datasets.push({
      type: 'line', label: plan.line.name.replace(/_/g, ' ') + ' (%)',
      data: rows.map(r => (r[plan.line.i] === null ? null : Number(r[plan.line.i]) * 100)),
      borderColor: '#D97706', backgroundColor: '#D97706', pointRadius: 3, borderWidth: 2, yAxisID: 'y2', xAxisID: 'x',
    });
  }
  const valueAxis = { beginAtZero: !ratioOnly, ticks: { callback: v => (ratioOnly ? v + '%' : compact(v)), font: { size: 10 } }, grid: { color: '#EEF1F5' } };
  const catAxis = { ticks: { font: { size: 10 }, autoSkip: true, maxRotation: 40 }, grid: { display: false } };
  const scales = horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis };
  if (plan.line && !horizontal) scales.y2 = { position: 'right', ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { display: false } };
  return new Chart(canvas, {
    type: plan.timeSeries ? 'line' : 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y2' || ratioOnly ? ctx.parsed[horizontal ? 'x' : 'y'].toFixed(1) + '%' : Number(ctx.parsed[horizontal ? 'x' : 'y']).toLocaleString()}` } },
      },
      scales,
    },
  });
}

updateEmpty();
loadSessions().catch(console.error);
