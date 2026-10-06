# Changelog and development log

Everything that has changed in LensS Collections Intelligence, newest first, with the reasons and what was verified. For how things work, see:

- `README.md`: overview and quick start
- `SETUP_GUIDE.md`: deploying to a workspace, configuration, troubleshooting
- `DATABRICKS_IMPLEMENTATION_GUIDE.md`: design notes for each build step (Steps 0–9)
- `APP_SERVICE_PRINCIPAL_SETUP.md`: converting a UI-created AppKit Genie app to service-principal authorization

Versions match git tags where one exists. Dates are when the change was committed.

---

## v1.9.0 — Command Center as one story; every figure opens the accounts behind it (2026-10-06)

### End-to-end test before the client demo
- **Deployed smoke test (personal): 27/27 passed**: APIs, quick-answer questions, the guardrail block, sessions and feedback, platform questions with follow-up context, answer cache, audit trail.
- **Browser pass of every tab, 23/23 passed**:
  - Account menu.
  - The Command Center's five chapters and their opening lines (no "NaN", "undefined" or "—").
  - **All 27 "View accounts" lists** open with rows, and the ones checked match their cards: 610, 999, 9,393, 879, 604, 229, 5,993.
  - Hover tooltips, KPI definitions, the story bar.
  - The Explorer: preloaded; reconciles to the Command Center at 19,035 accounts; a Personal Loan filter and reset; funnel, heatmap, driver and collector lists matching their charts.
  - The Assistant: a platform question answered from the guide.
  - All 7 Observability areas render, with no internal IDs.
  - Phone width.
- **Fixed:** at phone width the Command Center scrolled sideways, because the arrears-stage table (wider since its "View" column) wasn't in a scroll box. It is now.

### Explorer charts open their accounts too; the other tabs load in the background
- **Every Explorer chart item has a "View" button** that opens its accounts in the same window as the Command Center (totals, Export CSV), within the current filters:
  - achievement by product;
  - shortfall segments;
  - **heatmap cells** (click a cell);
  - non-payment drivers (bars and table);
  - treatment strategies;
  - **each funnel step** (tried to contact, reached, promised, kept);
  - channel effectiveness;
  - best channel per stage;
  - regions;
  - **each collector**;
  - the workspace's table view.
- **Server:** `GET /api/explorer/accounts`.
  - It takes the Explorer's own filters (checked against the data as before), plus a funnel `stage` from a fixed list or a `collector` ID.
  - It is cached per data version.
  - The filter builder now takes a table alias for the join.
- **Background loading:**
  - The Explorer and Observability used to load only when opened, to keep the first page fast.
  - Now, once the Command Center has drawn, they load in the background while the browser is idle, so they open instantly. Request order: Command Center → Assistant → Explorer → Observability.
  - Observability is a live view: opening it refreshes it, unless it was loaded in the last minute (so a preload isn't fetched twice).
- **Verified (local):**
  - Each list's count matches its chart exactly:
    - funnel 18,074 / 8,563 / 3,945 / 652;
    - Credit Card 5,395; Dispute 3,048; Hyderabad 2,341;
    - Personal Loan + reached 2,243; collector COL012 245.
  - A bad stage or product returns 400.
  - 99 view buttons on the Explorer.
  - Opening the Explorer and Observability after the preload made no new requests, and Observability's charts render correctly after loading hidden.
  - No console errors.

### Every Command Center figure shows the accounts behind it
A card said "610 promises" or "999 accounts" with no way to see which. Every card now has a **View accounts** button that opens the accounts behind its number: same rule, same count. The list shows account, product and days overdue, region, balance, recoverable, likely to pay, risk, promise (amount, due date, broken), why not paying, next step (for priority accounts) and collector, with totals and **Export CSV**.
- **Where:**
  - chapter 2: high-risk accounts, accounts worsening, each arrears stage in the risk snapshot;
  - chapter 3: each of the five issues (broken promises, the product behind target, accounts near 180+, customers not reached, over-contacted customers);
  - chapter 4: all 604 priority accounts and each product's;
  - chapter 5: each of the four queues and each next step.
- **Server:** `GET /api/dashboard/accounts?list=…&value=…`.
  - The lists are fixed in code. A request only picks one, plus a product, arrears stage or next step that is checked against the values in the data (anything else is rejected with a 400).
  - It reads `qry_explorer_base` joined to `qry_immediate_intervention`, and caches per data version like the rest of the Command Center.
  - Lists over 1,000 accounts show and export the first 1,000, ordered by what matters for that list (due date for promises, recoverable amount for opportunities).
- **"Ask LensS"** on issue and queue cards is now a button next to "View accounts" (the whole card used to be the button).
- **Verified (local, personal data):** all 14 lists match their card exactly, for example:
  - 610 promises likely to break, 588 other promises due, 492 high-value, 999 near 180+;
  - 879 high-risk, 1,234 broken promises, 9,393 over-contacted, 604 priority accounts;
  - 24 specialist-collector, 5,993 in 1–30 days, 170 Credit Card priority accounts.
  
  An injected value and an unknown list return 400. 27 view buttons on the page, no console errors.
- The story-only version (before this change) is commit `d45c299`, tagged `cc-story-only`.

### Command Center rebuilt as one story, top to bottom
Presenters found the page hard to follow: the same figures appeared in several places (hero tiles, executive summary, priorities, watchouts, core metrics, brief, target panel), with no order to tell them in. It is now five numbered chapters, each answering one question and leading to the next. Each opens with a one-sentence answer written from the certified figures, and each figure appears once.

| Chapter | Question | What's there |
|---|---|---|
| 1 (hero) | Are we on track this month? | One-line verdict (on track / within reach / at risk, with the broken-promise caveat); progress to target with days left; tiles for still to collect, expected from promises, month-end outlook and likelihood; how the outlook is worked out; data refresh time |
| 2 | How healthy is the book? | Overdue balance, recovery rate, high-risk accounts, accounts worsening, cost to collect (+5 contact and promise metrics on demand); portfolio risk snapshot by arrears stage |
| 3 | What is holding us back? | One ranked list of five issues (it replaces both Today's priorities and the watchouts): broken promises (critical, shown twice as wide), the product furthest behind, slide into late arrears, low reach, over-contact. Each has its metric, likely driver and an Ask LensS deep analysis |
| 4 | Where is the money? | Recoverable now by product, and the 8 priority accounts worth the most, with their next step |
| 5 | What should we do this week? | Four work queues numbered by urgency: Today (save the promises likely to break), This week (remind the other promises due, which no longer double-counts the at-risk ones; work high-value accounts), This month (stop accounts reaching 180+). Then how to handle each priority customer |

- **Removed as repeats:**
  - the executive summary paragraph (its refresh time is now in the hero);
  - the executive decision brief (chapter 5's opening line is the plan);
  - the target achievement panel (now the hero);
  - the "Collected this month" metric card;
  - the hero's arrears, high-risk and at-risk-promises tiles (now in chapters 2, 3 and 5);
  - the "largest recovery opportunities" queue (its 250 accounts overlapped the priority list).
  
  No figure or definition changed. The data and API are unchanged.
- **A story bar** under the hero ("1 · On track? … 5 · What to do this week") jumps to each chapter, stays in view while scrolling, and highlights the chapter being read.
- **Verified (local, 1440px):**
  - every chapter renders with its opening line from live figures;
  - 5 issues and 4 queues are present;
  - the accounts table fits without scrolling;
  - there are no console errors.

### Faster first load, top to bottom
- **The Command Center is ready before anyone opens it.**
  - The app computes the Command Center data itself, a few seconds after it starts. Every 5 minutes it checks the data version, a quick Lakebase read, and recomputes only if the data changed. So the first visitor no longer waits for the warehouse; before, the first visitor after a restart waited about 16 s on a cold warehouse.
  - Visitors who arrive while it is being computed share that one computation.
  - The summary's 5 queries now run in parallel instead of one after another.
  - The overview's 23 queries run in one parallel round instead of two.
- **The page loads in order:**
  - The headline and executive summary are drawn as soon as the small summary arrives.
  - The panels below follow in page order, one per frame, when the overview arrives.
  - The Explorer and Observability already loaded only when opened.
  - The Assistant's chat list and suggestions now wait until the browser is idle, unless the Assistant is opened first.
- **Standard script loading:** Chart.js and the app's scripts are `defer` (they no longer block the first paint, and still run in order), and the font host is preconnected.
- **Command Center wording:**
  - The hero button "Explore the why" is now "Drill into the data", and the banner "Need the why?" is now "Want to dig deeper?".
  - The outlook line "Promises due this month cover the gap 5.2×, so the outlook is high" now reads "Promises due before month-end could bring in about ₹30.2M, more than 5× what we still need, so we're on track to hit target."
  - It reads "within reach" when the outlook is Medium, "at risk" when Low, and "Target achieved: …" once the target is met. The figures come from `qry_cc_target_outlook`.
- **Executive summary footer** shows only "Data refreshed on …" (the "Written from the certified views on …" part is removed).
- **Hero tile "Over-contact risk" replaced by "Promises at risk this week"**: promises due in the next 7 days from customers likely to break them (propensity < 0.35 or risk ≥ 0.60, the Action center's broken-PTP queue), with the ₹ at stake. Over-contact stays in Today's priorities and the watchouts.
- **Greeting** in title case: "Good Morning / Afternoon / Evening".
- **Verified (local, 1440px):**
  - Fresh browser with the server's data already loaded: headline and executive summary at 0.7 s, priorities at 2.9 s, last panel at 3.1 s.
  - Same browser, second load: everything within 0.3 s.
  - Request order: summary, overview, then the Assistant's requests; no console errors.
  - Deployed to personal with `--only app`.

- `deploy/config/org2-v2.json` (the `lenss-collections-v2` org app) is now in git, with `auto_mode`, `platform_help` and `conversation_memory` stated explicitly (`7c2934f`). `org2.json` stays out of git.

## v1.8.0 — The Assistant answers about the platform, remembers the conversation, and routes as one assistant (2026-10-05, `fcb90c4`)

The Assistant answered "What is LensS" with "not related to the database schema": the query engine only knows the collections data. Questions about the platform itself are now answered from a written platform guide, without changing how data questions are handled. Then "tell me more about this" after that answer got "Your question is too vague", and "I am asking about my previous question" got "You have not asked a previous question yet": follow-ups carried no context, because the earlier answer never reached the engine's conversation. Follow-ups now carry the conversation, compacted every 5 questions.

### Fixed (conversation context)
- **Follow-ups lost their context.** The old context carried only the other mode's turns since the last answer in the same mode. A platform answer (or a cached one) counts as an answer in that mode, so nothing was carried. Now every follow-up carries the conversation so far (`server/lib/memory.ts`): a running summary of older turns plus the recent questions and answers, across both modes and including cached and platform answers.

### Added (conversation memory, platform switch)
- **Compaction every 5 questions:** after every 5 questions in a chat, older turns are folded into a short summary stored on the session; the last two stay word for word. It runs after the answer is sent, so it adds no wait. `conversation_memory` in the deploy config: `enabled`, `compact_every` (default 5), `model` (default: the follow-up or guardrail model; without one, a short digest). Lakebase schema v8 adds `context_summary` and `context_summary_upto` to `chat_sessions`.
- **Platform follow-ups:** "tell me more", "explain that", "my previous question" right after a platform answer go back to the platform guide, with only the parts not shown yet (so it adds detail instead of repeating).
- **`platform_help.enabled`:** `false` sends every question straight to the query engine (same as `method: "off"`). All three configs now state `platform_help` and `conversation_memory` explicitly.
- **Visible:** each question's trace says how many earlier questions were carried and how many were summarised; summary tokens count under "Conversation memory"; Responsible AI and the models list show the feature.

### Fixed (routing review: one assistant, whichever path answers)
- **Auto ignored the conversation.**
  - It routed each question as if it were new, so "tell me more about this" after a Deep analysis came back as a shallow Quick answer.
  - The browser now sends the chat's ID, and the router reads the history (`routeFollowUp` in `server/lib/autoMode.ts`).
  - A short follow-up to a Deep analysis stays Deep. A follow-up to a Quick answer can still go deeper ("why is that?").
  - The AI router is given the previous question when the new one is a follow-up.
  - A new, unrelated lookup in the same chat still gets a Quick answer.
- **Platform follow-ups and the router now agree.** A "tell me more" after a platform answer is routed to the guide (Quick) by Auto too, instead of being classified on its own words.
- **Data follow-ups after a platform answer reach the data.** "And what is the recovery rate for it this month?" right after "What is LensS?" was treated as a platform follow-up, because it was short and vague. A follow-up that names data (accounts, products, regions, rates, months, figures and similar) now goes to the engine. With a model this was caught later anyway; without one, the guide would have answered it.
- **Retries keep the context.** When the engine is busy, the retry (in a fresh engine conversation) now gets the same conversation context as the original question: the summary plus recent turns, rather than the last 5 raw messages. A self-contained question is still retried on its own.

### Fixed (empty tables)
- **Tables with no rows are no longer shown** (`server/lib/emptyResults.ts`):
  - An empty table with the same title as one that has data is dropped.
  - Otherwise, a one-line reason takes its place, written by the follow-up model from the query, for example "No Mortgage accounts in Mumbai had a broken promise to pay." (about 200 tokens). Without a model, a plain sentence is used.
  - A Quick answer already explains its single query, so an empty table there is dropped without a note.
  - The same applies to pre-warmed answers.
  - Answers saved earlier hide their empty tables in the browser.
  - The trace records how many were removed and explained, and the tokens count under "Empty-result notes".
- **Agent tables lost rows with a "|" in a value:** escaped pipes in the engine's result table split the row, so the row was discarded. They are now parsed correctly.
- **Verified:**
  - Auto routing with seeded chats (no engine calls): 11/11. For example, "tell me more about this" after a Deep analysis → Deep; "why is that?" after a Quick answer → Deep; a new lookup after a Deep analysis → Quick; "tell me more" after a platform answer → guide; a data follow-up after a platform answer → engine.
  - AI router (Llama 3.1 8B) with the previous question: "why is that?" → deep, "Which of those is the lowest?" → quick.
  - Empty-table logic: a unit test of duplicate, inline, unplaced and Quick-answer cases.
  - Wording of the notes: two real queries.
  - Deployed to personal (`--only app`). The full smoke test was not re-run, to save engine calls.

### Changed (large monitors, Command Center, Observability)
- **Large monitors use the width:** on screens 1600px and wider, pages grow from a 1280px column to up to 1800px (2100px from 2200px wide), and the Assistant's reading column grows from 1080px to 1280px (1440px). Laptops are unchanged.
- **Command Center:** the hero's "Snapshot · Tuesday, September 15, 2026 · day 15 of 30" line is removed. Under the executive summary: "Written from the certified views on …, data refreshed on …". The deploy's `summary` step reads when the data was last loaded (Unity Catalog `last_altered` of the silver fact table) and stores it in `exec_summary.data_refreshed_at`, because the app can only read gold. The table is now rewritten each run, so older tables gain the column. Before the next `summary` run, the line shows only the written time.
- **Observability: no internal IDs.**
  - Traces show their date and time instead of "TRC-xxxx".
  - The trace heading reads "Quick answer", "Deep analysis, from the answer cache" or "Platform question" instead of `CACHED_DEEP_ANALYSIS`.
  - Stage names are no longer upper case.
  - Service principals (the smoke test) show as "Automated test" instead of their ID, in traces, user lists, the audit trail and the user filter.
  - The audit trail shows the chat title (or "Untitled chat") instead of a session ID, and no longer shows the engine's conversation ID.
- **Verified:**
  - Personal workspace: `--only summary` stored the refresh time; the app was deployed with `--only app`.
  - In a headless browser at 1920px: the page is 1800px wide, and at 1440px it stays at 1280px.
  - The summary reads "Written from the certified views on 10/5/2026, 6:08:04 PM, data refreshed on 10/2/2026, 7:27:38 PM", and the snapshot line is gone.
  - Observability has no "TRC-" or ID text left, and there were no console errors.

### Added
- **Platform guide** (`server/lib/platformGuide.ts`): what LensS and LensS Collections Intelligence are (a Concentrix decision-intelligence platform, built by the Concentrix Data & Analytics Practice), each tab, exact how-to steps, Quick answer / Deep analysis / Auto, how answers are checked and kept safe, navigation and account, the data used, and known limits. No data figures, so it never goes stale when data is reloaded.
- **Platform answers** (`server/lib/platformHelp.ts`, wired into the send pipeline before the answer cache):
  - a word check lets through only questions that mention the platform (stricter when there is no model);
  - `platform_help` in the deploy config: `ai` (a small model answers from the guide only, or replies `DATA_QUESTION` and the question goes to the engine as usual), `guide` (the guide's sections, no model) or `off`. Left out: `ai` with the follow-up or guardrail model, else `guide`. Personal uses Llama 3.1 8B (only for platform questions);
  - guardrails still run first; an off-topic warning or block doesn't apply to a platform question (other blocks do);
  - the answer carries a note "From the LensS platform guide, not the collections data", and three platform follow-ups;
  - Auto sends platform questions to Quick answer; Observability records the guide sections used and counts the tokens under "Platform questions"; Responsible AI lists the feature.

### Verified
- **Detection (no model):** 10 platform questions and 8 data questions: every platform question flagged, every data question passed through to the engine; one data question with "help" in it is flagged only by the looser check, where the model decides.
- **No-model path (local):** "What is LensS", "How do I filter by region in the Explorer?" (in Deep analysis mode) and "What is Concentrix LensS and who built it?" answered from the guide in about 6 s; "Help me find accounts with broken promises in Mumbai" still went to the engine and was answered from the data.
- **AI path (local, Llama 3.1 8B):** the first try invented UI ("Filters tab", "search bar"); after adding exact how-to steps to the guide and tightening the prompt, "What is LensS", "How do I filter by region…" and "How do I export the accounts to CSV?" were answered correctly from the guide (about 8 s each). In the browser the answer shows the guide note and platform follow-ups, with no console errors.
- **Personal deploy:** `--only app` (log: "Platform questions: answered from the platform guide by databricks-meta-llama-3-1-8b-instruct"). Smoke test (`--skip-agent`, with a new platform check): 27/27 passed; "What is LensS and what tabs does it have?" was answered from the guide in 4.0 s.
- **Not verified:** the org deploy (it will use its follow-up model, Llama 3.3 70B, unless `platform_help` says otherwise).
- **Conversation memory (local, Llama 3.1 8B, one chat):** the reported sequence now works: "Tell me about Lens" → guide; "tell me more about this" → guide, follow-up; "I am asking about my previous question" → guide, understood; "What is the recovery rate by product?" → engine with 3 earlier questions carried; "Which of those is the lowest…" → engine with 4 carried, understood "those"; "Going back to the first thing we discussed, what are its four tabs?" → answered. After the 5th question the session summary was written (3 turns folded, last 2 kept) and its tokens (588 in, 140 out) were logged on that question.
- **Prompt tuning found during testing:** "tell me more" first repeated the previous answer and the 8B summary padded itself with "not specified"; fixed by giving a follow-up only the unseen guide sections (and the earlier question, not the answer) and a stricter summary prompt. Re-test: "tell me more" now adds the Explorer and Command Center details.
- **Seen, not ours:** in one data follow-up the engine's own answer compared 0.0018 and 0.0015 the wrong way round; the context was correct. The answer-quality judge is there to flag such answers.

## v1.7.0 — Four tabs like the benchmark: Command Center, Explorer, Assistant, Observability (2026-10-05, `edb2d53`)

The leadership spec (`all_details_and _data/Book6.xlsx`) defines six Command Center sections, and a healthcare referral demo was named as the UX benchmark to beat. This release builds the spec on governed views, adopts the benchmark's best ideas (quick-start prompts, an executive brief, watchouts, a KPI dictionary, Observability split into areas with a trace console) and goes further: one-click "Ask LensS" from every panel, account-level action queues, and a trace link under every answer. Deployed to the personal workspace; not committed.

For the org v2 app: `git pull`, then `python deploy\deploy.py --config deploy\config\org2-v2.json --only views,genie,summary,app`.

### Changed (second review: Auto classifier, faithfulness, account menu, theme)
- **Auto mode can use an AI classifier** (`server/lib/autoMode.ts`, `POST /api/chat/route`). Before, Auto was a word rule in the browser; "Which non-payment drivers have the lowest recovery rate?" went to the 1–3 minute Deep analysis because it contains "drivers". Now:
  - **`auto_mode` in the deploy config:** `"ai"` (a small model routes each question, any language, with the word rule as a fallback if it is slow or unreadable) or `"rules"` (no model). Left out, it uses `ai` with the guardrail classifier's model when there is one. `personal.json` is set to `rules`; `org.json` and `org-v2.json` use `ai` with Llama 3.3 70B.
  - **The word rule is better too:** "driver(s)" and "opportunity" no longer force Deep analysis on plain "which / what is / show / top N" lookups.
  - **Logged:** each question's trace records the decision, the method and the reason; the classifier's tokens count under "Auto mode router"; Responsible AI and the Observability models list show which method is on.
  - **Refresh no longer changes your mode.** "↻ Refresh" on a cached answer used to switch the mode menu to that answer's mode; it now re-asks in that mode without touching the setting.
- **Faithfulness check no longer penalises correct figures** (`server/lib/judge.ts`). Investigation of the 90% answer ("Why are collections lagging…", 46 of 51 figures): the three "missing" figures were all right. 1,633 accounts and ₹158M are the five 180+ rows of the query added up; 0.15% is Auto Loan's 180+ recovery (0.0015), written as the range "0.15-0.54%" so the check read "0.15" without the %. The check now also accepts subtotals by group, both ends of a range, more business-rule constants (0.60, ₹100K, 150/180 days, 7 days, 1.5×) and figures from the question. Re-running that answer's 8 queries: the old check gives 46/51 (90%, identical to the log), the new one 53/54 (98%). The one figure still flagged is a genuine approximation ("65–85% of promises broken"; the segments range 62–100%). Older answers keep the score they were given.
- **Account menu, top right on every tab:** one letter in the Concentrix colours; it opens the full name (from the workspace user directory, or worked out from the email), the email, and Log out. The profile at the bottom of the Assistant's sidebar is gone. Databricks Apps can't end the platform sign-in, so Log out ends the LensS session in that browser (clears its local settings and shows a signed-out screen with "Sign in again" and a link to the workspace).
- **Assistant sidebar, collapsed:** new chat, search and chats icons, like ChatGPT. Search opens the list with the search box focused; chats opens the list.
- **One Concentrix theme across tabs, kept subtle:** the Command Center hero's navy-to-teal gradient as a slim title band on the Explorer and Observability, teal instead of purple for the Explorer's buttons and chips, the Observability area tabs, selected traces and the deep/quick chart colours, an aqua marker on section headings, and a gradient edge on the headline cards. The purple "Ask LensS" pills stay, as on the Command Center.

- **Responsible AI page:** the Auto row's status now uses the same green "On" badge as the other rows (it was plain text).

- **Every "Ask LensS" control shows its question on hover or keyboard focus** (`public/js/app.js`): a tooltip with the mode and the exact question, for every element that asks LensS (panel buttons, priority cards, action queues, watchouts, hero buttons, the executive summary, Explorer panels, chips and account rows). Before, only the panel buttons had a slow native tooltip; the cards and queues had none. Checked by hovering every control with real mouse events: Command Center 22/22, Explorer 24/24.

### Verified (second review)
- **Numbers audit (48/48):** every Command Center and Explorer headline figure recomputed straight from silver with independent SQL matches what the app serves: accounts, outstanding, collected, 879 high-risk, 604 priority and ₹6.4M recoverable, RPC, agreed to pay, broken and kept promises, roll forward and back, cost to collect, amount promised, contacts per customer, the funnel, all five action queues (counts and amounts), target, achievement, gap, outlook, and every Explorer breakdown adding up to 19,035. A filtered Explorer view (31-60 days, promises due 16–22 Sep: 360 accounts, ₹36.3M) matches SQL.
- **Auto classifier prompt:** 12 sample questions with Llama 3.1 8B on the personal workspace (one-off, about 3,000 tokens): 12/12 routed as expected, about 2 s each, including Spanish and "what's going on?" phrasing that the word rule misses.
- **Local browser QA (27/27, no console errors, no failed requests):** four tabs, strip and footer, account letter and menu (name, email, Log out, closes on outside click), no "Ask AI", Command Center figures as displayed (hero, 5 + 7 metrics, queues, outlook, KPI dictionary), aqua section markers, the Explorer band, filter, date filter, scoped question, CSV export and reset, Observability band, seven areas on one row, every area opening, Auto router listed in Responsible AI and the models list, the Assistant rail (toggle, new chat, search, chats; search focuses the box), no sidebar profile, the Auto router, an existing answer signed by the engine with its chart fitting on screen, the mode menu, Log out and Sign in again, and mobile.
- **Personal deploy:** `--only app` (log: "Auto mode: word rule (no model)"). Smoke test with `--skip-agent`, now also checking `/api/me` (name and email) and the Auto router: 26/26 passed.
- **Not verified:** the AI classifier inside the deployed app (personal uses the word rule; the prompt itself was tested above); the full name for a real signed-in user (the smoke test signs in as a service principal); the org deploy.


The spreadsheet is a reference, not a definition change; nothing from v1.6 should be lost; the app should have the benchmark's four tabs; the Command Center is the one-minute health check and the Explorer answers "why", with filters.
- **High-risk accounts did not change.** 879 is, and was in v1.6, the count of accounts with non-payment risk ≥ 0.70. The 604 shown in v1.6 is a different figure: the high-risk accounts still likely to pay (propensity ≥ 0.25), the "Recoverable now / priority accounts" list. The first v1.7 build put 879 at the front, which read as a jump. Both are back in their v1.6 places, and the high-risk card now says "879 · 604 still likely to pay". The KPI dictionary defines both.
- **Previous calculations restored.** The first v1.7 build showed the spreadsheet's per-account promise rate (20.7%) and broken-promise rate (6.5%). The Command Center is back on the v1.6 definitions: agreed to pay = promises ÷ customers reached (46.1%), promises honoured = kept ÷ promises due (34.6%), customers reached 47.4%. These come from the governed metric view and certified views, as before.
- **Nothing from v1.6 removed.** Restored: the executive summary (AI narrative), Today's priorities (4 cards), all ten v1.6 metrics (five large cards plus seven under "Show 7 more metrics"), Recommended next steps, Recovery opportunity by product, and the "Why customers aren't paying" bar chart. Every other chart moved to the Explorer unchanged.
- **Four top tabs, as in the benchmark:** Command Center, Explorer, Assistant, Observability. Evals and Responsible AI are now areas 6 and 7 of Observability and load when opened.
- **Command Center = how the business is doing, in about a minute:** hero with target progress and outlook, executive summary, priorities, core metrics, brief and watchouts, portfolio risk and target, action center, next steps, opportunity, largest recovery opportunities, and a hand-off to the Explorer.
- **"Ask AI" is now "Ask LensS"** everywhere. Answers in the Assistant are signed "LensS Intelligence Engine".
- **"Built by the Concentrix Data & Analytics Practice":** a strip above the top bar ("Proprietary & Confidential to Concentrix") and a footer with the engine badge, as in the benchmark. Both are hidden in the full-screen Assistant.
- **Assistant density:** smaller type (13.5px), tighter spacing, a shorter header and question box, wider answers (1,080px) and 230px charts. An answer with its chart and follow-ups now fits on a 1440×900 screen without scrolling (the chart measured 287px of a 712px message area).

### Added (leadership review)
- **Explorer tab** (`public/js/explorer.js`, `server/routes/explorer.ts`), the "why":
  - **Filters:** product (business unit), arrears stage, region, preferred channel, treatment strategy, non-payment driver, collector team, balance band, vulnerability, plus date ranges for last contact and promise due date. Active filters show as removable chips; Reset and Export CSV. Filters are remembered per browser.
  - **Filtered headline measures** (12 tiles) compared with the whole portfolio (share of the book, or points above or below).
  - **Layer 1: dimension × measure slicer.** Any of the nine dimensions by any of twelve measures, as bars (with the portfolio value as a marker) or a table. Clicking a bar filters the whole page to it (drill-down).
  - **Why panels, all following the filters:** achievement by product, shortfall, product × stage heatmap, why customers aren't paying, top non-payment drivers (Pareto), treatment strategies, the funnel, channel effectiveness, best channel per stage, regional view, collector top and bottom 10. Targets exist only by product × stage, so the three target panels follow only those two filters (the page says so).
  - **Layer 2: account records.** The 500 accounts with the most recovery opportunity in the current view: search, sort, paging, CSV export, and "Ask LensS" about any account.
  - **"Ask LensS about this view"** and every panel's question carry the current filters ("… (for Credit Card, Hyderabad)?").
- **Governed view `qry_explorer_base`** (in `70_command_center_views.sql`, deployed by the `views` step): one row per account in collections with the Explorer's dimensions and the flags its measures use. The server computes each measure with the same formula as the metric views and certified views.
- **API:** `GET /api/explorer/options` (filter values and date ranges) and `GET /api/explorer/data` (everything on the page for a set of filters). Only values that exist in the data are accepted (anything else is a 400), so nothing typed reaches the SQL. Results are cached per data version.

### Added
- **Seven governed Command Center views** (`deploy/sql/70_command_center_views.sql`). They are built in gold from silver and run by the new deploy step `views`, which also bumps the data cache version.
  - **The views:**
    - `qry_cc_kpis`: headline KPIs;
    - `qry_cc_risk_snapshot`: DPD buckets;
    - `qry_cc_target_outlook`: achieved, gap, outlook and likelihood;
    - `qry_cc_actions` and `qry_cc_action_accounts`: five action queues;
    - `qry_cc_channel` and `qry_cc_region`: channel and region effectiveness.
  - **Where they're used:** they are Genie sources (now 23) and are served in `/api/dashboard/overview` as `cc`.
- **Command Center, sections 1–6 of the spec:**
  - **Core metrics with "show more":** outstanding portfolio, recovery MTD and rate, accounts in collections, contact, promise, broken promise, roll forward/back, high-risk, cost to collect.
  - **Executive brief** (where we stand / what's driving it / what we're doing).
  - **Priority watchouts,** with a severity filter.
  - **Portfolio risk snapshot:** a stacked bar and table by bucket.
  - **Target vs achieved:** six tiles plus the outlook and likelihood.
  - **Driver analysis:** a Pareto of non-payment reasons.
  - **Action Center:**
    - 492 high-propensity high-balance accounts, ₹18.0M;
    - the top 250 by recoverable amount, ₹15.5M;
    - 1,198 promises due in 7 days, ₹52.6M;
    - 610 at risk of breaking, ₹27.2M;
    - 999 rolling to 180+, ₹95.1M exposure.
  - **Channel effectiveness.**
  - **Region tabs:** recovery / contact / risk.
  - **Top and bottom 10 collectors,** with a Recovery / Contact / Promise toggle.
  - **KPI dictionary:** 15 definitions, including the population of each figure.
- **Quick-start prompts and a question library** in the Assistant:
  - six one-click analyses, each with a mode, on the welcome screen and in a prompts panel;
  - five categories (Executive, Diagnostic, Operational, Risk & conduct, Strategy);
  - shortcuts for PDF and a new conversation.
- **Observability in five areas:**
  - pipeline traces;
  - answer quality and faithfulness;
  - performance and latency;
  - data and model drift;
  - security and guardrails.

  These sit under a headline row: groundedness, numeric reconciliation, average end-to-end latency and the personal-data guardrail pass rate.
  - **Trace console:** a searchable trace list (filter by passed / blocked / failed and by user) and the 9-stage governed path for each question (ask, secure, cache, plan, retrieve, verify, synthesize, deliver, log), with a timing waterfall and copyable SQL.
  - **Drift:** data and Genie versions, models in use, the deep/quick mix per day and the eval pass rate per run.
  - **Insights API:** `/api/admin/insights` adds reconciliation, personal-data checks, average time per stage, low-confidence answers and trace counts.
- **"Inspect in Observability ›"** under each answer opens its trace.

### Changed
- **Deploy log:** `money()` prints billions (₹1.93B, not ₹1926.6M).
- **Observability user filter:** it now reads "All users".

### Definitions (differences from the spec workbook)
- **Population:**
  - The spec's figures use the whole book (20,000 accounts).
  - The app keeps the governed population, accounts in arrears (DPD > 0, 19,035), so it matches every other view and the AI's answers.
  - Hence the differences:
    - ₹1.93B outstanding (spec ₹2.03B);
    - ₹53.4M collected (spec ₹55.4M);
    - contact rate 47.4% of attempted accounts (spec 44.3%);
    - roll forward 33.4% (spec 31.8%).
  - Promise rate per account (20.7%) and broken promises per account (6.5%) match the spec closely, but after the leadership review the app shows the v1.6 definitions instead (agreed to pay 46.1% of customers reached; promises honoured 34.6% of promises due, so 65% broken).
- **High propensity is ≥ 0.60:** the spec asks for > 0.80, but no account scores above about 0.6.
- **Target outlook is a pipeline estimate, not a statistical forecast:**
  - outlook = achieved + promises due in the rest of the month × the honour rate (34.6%), giving ₹83.7M;
  - the likelihood is High when the outlook covers the gap 1.5× or more (it covers 5.2×).

### Verified (leadership review)
- **Reconciliation:** with no filters, `qry_explorer_base` gives exactly the metric view's figures: 19,035 accounts, ₹1,926,555,082 outstanding, ₹53,428,965 collected, 879 high-risk, RPC 47.38%, agreed to pay 46.07%, promises honoured 34.57%, roll forward 33.36%, cost to collect 0.0157. The funnel matches `qry_collections_funnel` (18,074 / 8,563 / 3,945 / 652), the best channel per stage matches `qry_recommended_channel`, and there are 80 collectors, as in `qry_collector_scorecard`.
- **Filters:** Credit Card + Mumbai + contacted from 1 Sep gives 397 accounts. An injected value (`x' OR 1=1`) is rejected with a 400.
- **Local browser checks (13/13 passed, no console errors, no failed requests):**
  - four tabs, the Concentrix strip and footer;
  - the 604 and 879 cards;
  - the v1.6 secondary metrics (47.4% / 46.1% / 34.6%);
  - no "Ask AI" text;
  - the why panels are off the Command Center;
  - the Explorer reconciles, filters by select, drills by bar click, and searches and pages the account records;
  - Observability has seven areas on one row, and Evals and Responsible AI load;
  - an existing Assistant answer is signed by the engine, and its chart fits on screen.

  Screenshots reviewed: Command Center, Explorer unfiltered and filtered, Observability Evals and Responsible AI, Assistant, mobile Explorer.
- **Personal workspace:** the `views` step created `qry_explorer_base`; `--only app` deployed the app. The smoke test (`deploy/smoke_test.py`, now with an Explorer check that the unfiltered totals match the Command Center and a filtered call works) passed 28/28 against the deployed app.
- **Not verified:** live AI answers to the Explorer's scoped questions (no model calls on the personal workspace); the org deploy.

### Verified (first build)
- **Local UI regression script:** 31/31 checks passed, with no console errors. Screenshots of every Command Center section, the prompts panel and all five Observability areas were reviewed.
- **Personal deploy:** `--only genie,app` ran; the views had been deployed and the counts checked earlier.
- **Smoke test against the deployed app:** 24/24 passed, including the overview with every panel filled.
- **Not verified:**
  - live Agent-mode answers using the new views (no model calls on the personal workspace);
  - the org deploy.

---

## v1.6.0 — Leadership-ready UX: Command Center, Copilot-style Assistant, Observability (2026-10-05, `01a741a`)

Leadership feedback on the first demo was that the UI was not end-user friendly; the demo stopped at the Command Center and Chat + Agent. This release rebuilds both for a CEO/director audience, enriches Monitoring (now Observability), and fixes the issues found in four review rounds and a senior-QA pass. Deployed to the personal workspace.

For the org v2 app: `git pull`, then `python deploy\deploy.py --config deploy\config\org2-v2.json --only genie,summary,app`. The `genie` step adds the rupee rule to v2's space. The `summary` step rewrites the shared executive summary in ₹, which v1 shows too.

The updated demo guide (with Appendix C, the feature catalogue) is not in this commit: the original was open in Word. It is waiting as `docs/LensS_Collections_Demo_Guide (with feature catalogue).docx`.

### Added
- **Command Center rebuilt for a collections leader.**
  - **Hero:** a greeting by first name, progress to target ($53.4M of $59.2M, 90.2%), and four headline stats: recoverable now ($6.4M, 604 accounts), accounts in arrears, high-risk accounts, over-contacted segments.
  - **Today's priorities:** four action cards worked out from the data. Personal Loan is $2.1M behind; 604 accounts need action; 65% of promises due were broken; 83 segments are over-contacted. Each runs the right AI analysis on click.
  - **10 metrics** with plain-English context: collected, achievement, recovery rate, right-party contact, promise-to-pay conversion, promises kept, cost to collect, amount promised, roll-forward, average attempts.
  - **12 insight panels:**
    - achievement by product (with a 100% marker);
    - where the shortfall comes from;
    - a product × DPD-bucket heatmap;
    - the collections funnel;
    - the best channel per arrears stage;
    - the top 8 accounts to act on, with the next best action;
    - recommended next steps;
    - recovery opportunity by product;
    - why customers aren't paying;
    - treatment strategy results;
    - recovery by region;
    - top and bottom collectors.
  - **"Ask AI" on every card and panel** opens the Assistant with the right question in the right mode.
  - **New endpoint:** `GET /api/dashboard/overview` (16 parallel queries, cached per data version, gold and metric views only).
- **Monitoring insights.**
  - **Time range:** 24 hours, 7 days, 30 days or all time.
  - **Health banner** with a plain verdict.
  - **Seven tiles:** answer rate, quality, typical and p90 speed per mode, cache use, satisfaction, safety actions.
  - **Trends:** questions per day by mode, answer time, quality and cache use, hour of day.
  - **Breakdowns:** most-asked questions, answer-time percentiles, 👎 reasons.
  - **New endpoint:** `GET /api/admin/insights`.
- **Feature catalogue: what was built and why.** One line per capability, now 76 rows in 12 areas: data, query engine, app, speed and cost, safety, quality and trust, evaluation and oversight, monitoring, branding, security, deployment, documentation.
  - **In the implementation guide:** a section near the top of `DATABRICKS_IMPLEMENTATION_GUIDE.md`.
  - **In the demo guide:** a new **Appendix C** in `docs/LensS_Collections_Demo_Guide.docx`, styled like the document's other tables. The contents page refreshes to list it when the file is opened.
  - **One source:** both come from the same list, so they match.
### Changed
- **"Chat + Agent" is now "Assistant".**
  - **Modes:** **Deep analysis** (the default) and **Quick answer**, chosen from a dropdown with plain descriptions, replacing the Chat/Agent pills. The labels are used everywhere: message tags, suggestions, Monitoring, the answer panel.
  - **Empty state:** a personal greeting, a "how it works" strip, and starter cards tagged by mode.
  - **While it works:** Deep analysis shows a progress bar and a "keep working, we'll notify you" hint.
- **Visual refresh.**
  - **Palette:** Concentrix navy and aqua for the hero, tabs (now with icons) and the send button.
  - **Components:** a user avatar, metric tiles, bar rows, a heatmap, a funnel, and loading skeletons.
  - **Modes:** purple marks Deep analysis and blue marks Quick answer.
  - **Phones:** the layout is responsive at phone width.
- **Monitoring:** the old "questions by mode" and "latency by mode" charts are replaced by the trends.
- **Segment table:** recovery-rate colours now use realistic thresholds (2.5% / 3.5%). The old ones (85% / 92%) made every row red.

### Changed (fourth review)
- **The low-confidence warning moved into Details.** Answers stay clean, and the red dot on the Details button still signals low confidence.
- **The profile is at the bottom-left of the chat list,** like Copilot: initials ("UK" for ullas.kc@…), first name and email. On the collapsed rail only the initials show. The top-bar profile icon is removed.
- **"Message LensS" is now "Ask LensS"** in the question box.
- **The "Monitoring" tab is now "Observability",** along with its page heading and the Responsible AI page's mentions of it.

### Fixed (fourth review)
- **The numbers check flagged correct answers.**
  - **"180":** read as an unsupported figure from the "180+" arrears bucket, because the bucket-name filter missed "180+" when a space followed it.
  - **Business-rule thresholds** (0.70 high-risk, 0.25 propensity, 4.5 contacts, 30 accounts, ₹50,000, 0.80, 0.35, 0.90, 50) were treated as data claims. Quoting them is now accepted.
  - **Example:** an answer citing "180+ days, 543 accounts, risk of 0.70 or more, ₹158M, 3.0%" with matching data now scores 100%, where it scored 60%.

### Changed (third review: Copilot-style assistant)
- **Mode picker like Microsoft Copilot,** at the top-left of the chat: **Auto** (the new default), **Quick answer** and **Deep analysis**, each with a one-line description and a checkmark on the selected one.
  - **How Auto chooses:** "why", "what should we do", "how can we", "compare", "prioritise", "drivers", "recommend" and similar questions, or long multi-part questions, get a Deep analysis. Direct "what is / which / show" questions get a Quick answer.
  - **Fixed modes:** suggested questions and Command Center cards still use their own mode without changing the picker.
  - **Preference:** the stored choice is `lenss.mode.v3`, so everyone starts on Auto.
- **No question title** at the top of the chat. The header has the mode picker plus two icon buttons: suggestions and PDF.
- **Answers are clean, like Copilot.**
  - **Action row:** the answer text and charts, then copy, 👍, 👎, regenerate and **Details ▾**.
  - **What Details holds,** only when clicked: quality score and sources, safety checks, mode and timing, the cache note, "How the analysis worked it out" steps, and "How this answer was made". A coloured dot on the Details button gives the quality verdict at a glance.
  - **Still visible:** the low-confidence warning and guardrail notes (such as removed personal details), because they change how the answer should be read.
  - **Regenerate:** replaces a cached answer with a live one in place, or asks a live answer again.
  - **PDF:** the export now shows just the conversation, without the action rows and Details.
- **Copilot-like surfaces.**
  - **Background and messages:** a warm off-white background, user messages as light grey bubbles, plain-text answers.
  - **Follow-ups:** suggestions are right-aligned under the answer.
  - **Question box:** one rounded row with mic and send, and the notice "AI-generated content may be incorrect".
  - **Chat list:** New chat, Search and a **Chats** list, open by default on desktop (collapsible, and remembered).
- **The profile icon no longer drops onto a second row.** The top bar stays on one row on desktop. The email is hidden below 1500 px, and the avatar stays.

### Changed (second leadership review: full-screen assistant, executive language, rupees)
- **The Assistant is a full-screen chat app, like ChatGPT or Microsoft 365 Copilot.**
  - **Layout:** no page heading. The chat fills the screen below the top bar, and the page itself never scrolls.
  - **Conversation list:** a slim rail by default (minimized; each person's choice is remembered), which opens to a panel with **search**. On phones it slides over the chat.
  - **Suggested questions:** a drawer opened from the header, closed by default, which closes itself after a question is picked.
  - **Reading layout:** messages and the question box sit in a centred reading column, answers read as plain text rather than in boxes, and the question box floats at the bottom.
  - **Less text:** the welcome is a greeting and six starter cards. The mode hints are "1–3 min" and "~20 sec", and the notice reads "AI can make mistakes…".
- **The Command Center speaks to leadership.**
  - **Hero:** "We've collected ₹53.4M of this month's ₹59.2M target, with ₹5.8M still to close."
  - **Plain terms:** "Customers reached" (was right-party contact), "Agreed to pay", "Promises honoured", "Accounts worsening" (was roll-forward), "Contacts per customer", "arrears stage" (was DPD bucket), "Largest recovery opportunities", "From arrears to payment".
  - **Priority cards:** reworded as outcomes, for example "₹6.4M is recoverable from 604 accounts", "65% of payment promises are being broken" and "9,393 customers may be over-contacted".
- **Money is shown in Indian rupees everywhere.**
  - **Why:** the data model's `Currency_Code` is `INR`, but the app and the executive summary had been showing `$`, and the query engine mixed `$` and `₹` between answers.
  - **App:** the Command Center and the segment table use ₹, as do the executive summary (`deploy.py summary`) and the PDF, which captures the page.
  - **Query engine:** a new **CURRENCY AND FORMAT** rule in the Genie instructions requires ₹ with M/K.
  - **Exception:** AI cost estimates in Monitoring stay in USD, because model price lists are in dollars.
- **Deploy output is safe on Windows consoles.** Characters such as ₹ are replaced rather than crashing `deploy.py` on a non-UTF-8 console.

### Fixed (found by a senior-QA pass: 25 scripted UI checks plus the end-to-end smoke test)
- **The welcome screen stayed visible under an active conversation,** and the conversation panel wouldn't open. Higher-priority style rules overrode the hidden and open states.
- **Two buttons for the same thing:** on desktop, the header and the rail both had a "show conversations" button. The header one now shows only on small screens.
- **👍/👎 felt broken.** The button waited more than a second while the server forwarded the rating to the query engine. It now lights up at once (reverting only if saving fails), and the server replies first and forwards in the background.
- **A 404 error appeared just after each answer,** because the quality badge asked for details before they were saved. The server now answers "pending", and the badge stops checking once its answer is closed or deleted.

### Fixed
- **Answers not coming back.** Deep analysis is now the default, so every question goes to the query engine's Agent service. On the personal workspace that service was often at capacity.
  - **Symptoms:** `RESOURCE_EXHAUSTED: The service is temporarily at capacity` (2 failures in 6 minutes), plus `Self-suppression not permitted` at the same moments (2 more).
  - **Retry:** a busy answer is retried twice (after about 3 s and 8 s) in a fresh conversation that carries the recent turns as context. The user sees "The analysis service is busy, retrying…".
  - **Fall back:** if Deep analysis is still busy, the question is answered in Quick answer mode, with the note "Deep analysis was busy, so this is a quick answer…". A fallback answer is never cached as the Deep analysis answer.
  - **Session state:** a failed run no longer becomes the session's engine conversation. Before, the next follow-up was sent into the failed conversation and failed too.
  - **What the user sees:** a failed answer gives a plain explanation ("The analysis service is busy right now…") and a **Try again** button, instead of a generic apology.
  - **Monitoring:** retries and fallbacks are recorded in the audit details (`retries`, `fallbackFrom`).
- **Header spilled out at narrower window widths.** The product name wrapped onto three lines and overflowed the fixed-height header.
  - **Text:** the header now grows with its content, the name never wraps, and the subtitle, divider and avatar drop off as the window narrows.
  - **Tabs:** they scroll sideways instead of wrapping.
- **Assistant welcome screen didn't scroll.** It was an overlay that ignored the mouse, and it ran behind the taller question box, which cut off the last row of question cards. It is now part of the chat column: it scrolls normally and stops above the question box.
- **Greeting showed "Hi Ullaskc98".** Trailing digits are now dropped from the name taken from the email address.
- **Verified in headless Chrome at 1440, 1100, 760 and 390 px:**
  - **Header:** no element overflows (64 px tall at 1100 px and wider, 84 px when the tabs wrap), and the title stays on one line.
  - **Welcome screen:** a real mouse-wheel event scrolls it at every width where it overflows, and it never overlaps the question box.

### Verified (personal workspace)
- **After the Copilot-style changes: 27 of 27 UI checks pass.** The two new checks cover Auto as the default with three options, clean answers with Details hidden until clicked, copy and regenerate present, no title, and the profile icon on the top-bar row at 1280 and 1440 px. The **smoke test against the deployed app passes 24 of 24.** One phone-layout defect (a 1 px border left on the closed chat list) was found and fixed.
- **Senior-QA pass, 25 of 25 UI checks in headless Chrome:**
  - **Command Center:** panels, executive wording, every Ask-AI control, no NaN or undefined values, rupees throughout.
  - **Assistant layout:** fills the screen, conversation rail and panel, search, suggestions drawer, mode dropdown, Esc closes.
  - **Asking and answers:** Enter sends and Shift+Enter makes a new line; answers show trust bar, follow-ups and feedback; the answer panel opens; PDF download.
  - **Conversations:** rename, search, reopen, delete; Command Center to Assistant.
  - **Other tabs:** Monitoring ranges and audit row; a policy-only eval run; Responsible AI.
  - **Phone:** drawers over the chat and no sideways scroll.
  - **Errors:** no failed requests and no console errors.
- **Smoke test against the deployed app,** as the real non-admin service identity: **24 of 24 checks**. That includes the three new checks for the Command Center overview, Monitoring insights, and Evals plus Responsible AI.
- **Command Center:**
  - all 12 panels filled from live data with no empty or failed panel, in headless Chrome at 1440 px and 390 px;
  - no horizontal scroll, and the header no longer overlaps the hero on phones;
  - clicking the "604 accounts" priority opened the Assistant and asked the question in Quick answer mode; it was served from the cache with its trust bar.
- **Assistant:** defaults to Deep analysis, and the dropdown switches modes.
- **Monitoring:** the health banner, tiles, four trend charts and three breakdown panels render, and the 7-day range switch works.
- **Fix for answers not coming back:** the question that had failed, "Which regions are underperforming on recovery and why?" (Deep analysis), answered in 93 s with 3 charts, 12 steps, follow-ups and judging.
  - **Busy-error detection:** checked offline against the two logged errors (both caught) and a SQL error (correctly not retried).
  - **Not exercised live:** the retry and fallback paths themselves, since the service can't be made busy on demand.
- **Errors:** one script error was found and fixed (a duplicate helper name stopped `evals.js` from loading), with none after.
- **Catalogue documents:** the regenerated demo-guide copy passes the document-format validation (Paragraphs 988 → 1190).
- **Earlier catalogue check:**
  - **Document check:** the rebuilt .docx passes the document-format validation (Paragraphs 988 → 1172).
  - **Word export:** exported to PDF through Word, it is 42 pages, Appendix C starts on page 38, and the contents page (page 3) lists it.

---

## v1.5.1 — Agent citation markers, deploy name checks (2026-10-01, `9321f55`)

### Fixed
- **`org-v2.json` used an invalid Lakebase database name.** `chatapp_v2` was rejected by Lakebase, whose database IDs allow only lowercase letters, digits and hyphens. It's now `chatappv2`.
  - **Where it failed:** the first org v2 deploy created its Genie space, then failed at the `lakebase` step. Re-running after the rename reuses that space.
- **The deploy now checks `lakebase_project`, `lakebase_database` and `app_name` before doing anything,** with a clear message, instead of failing halfway.
- **Verified offline:** `org.json`, `org-v2.json` and `personal.json` pass the check, and `chatapp_v2` is rejected.
- **Agent answers showed `*[unrendered:citation[<id>]]*` markers.** The query engine's Agent mode started returning citations in this new format, which the existing filter didn't catch.
  - **Fix:** `stripCitations` (server `answers.ts` and browser `chat.js`) now also removes them: italic or plain, escaped, several in a row, or cut off at the end of a preview.
  - **Coverage:** every place answer text is shown goes through this filter, so it applies to new answers, cached answers, chat history, Monitoring previews and the PDF.
  - **Verified offline:** 7 sample strings, including the exact text reported. Normal links and bold text are unchanged.

---

## v1.5.0 — Demo showcase: answer trust, evals, Responsible AI, Concentrix branding (2026-10-01, `f575708`)

Deployed to the personal workspace. For the org it can run next to the existing version: `deploy/config/org-v2.json` with `--only genie,lakebase,app` (see `SETUP_GUIDE.md` 11.1). The `lakebase` step adds schema v6 and seeds the eval cases.

### Added
- **Trust bar under every answer.**
  - **Quality chip:** "✓ Verified · 96%" (green 85% and up, amber from the warning threshold, red below it). It shows "Checking accuracy…" while the judge runs and updates when the score lands.
  - **Other chips:** the number of certified data sources used, and whether personal details were masked or other safety checks acted.
  - **How this answer was made** opens a panel with:
    - the four quality scores, with the judge's reason and any unsupported claims;
    - the data sources and each SQL query;
    - the safety checks;
    - the request trace;
    - the AI models and tokens used.
- **Low-confidence warning.** An answer scoring below `faithfulness_judge.warn_below` (default 70%) shows a red box listing what couldn't be verified. It also appears in the PDF.
- **Multi-metric judge.** The judge model now scores **faithfulness, relevance, completeness and safety** in one call.
  - The faithfulness score is still the average of the numbers check and the judge.
  - The other three are shown in the answer panel, the audit trail, and as a new **Relevance** KPI in Monitoring.
- **Evals tab.** An evaluation suite run on demand, with run history and the change against the previous run. Cases live in `chatapp.eval_cases`, are seeded by the deploy from `deploy/evals/cases.py`, and can be switched on or off in the tab. There are 29 cases:
  - **Accuracy (7):** the Genie benchmark questions with their ground-truth SQL. Each is asked live and the figures returned are compared with the ground truth (recall and precision). The answer is then scored by the judge; one case checks that the engine declines.
    - **Cap:** `evals.max_accuracy_cases` limits how many are asked per run (1 in the personal workspace, 10 in the org).
  - **Guardrails (15):** red-team prompts covering injection, jailbreak, profanity, PII and off-topic, plus false-positive checks. The false-positive checks are legitimate questions, account IDs, thanks, and Hindi and Spanish questions.
  - **Policy (7):** answer sentences the output checks must flag (forecast, causal uplift, cure rate, probability), redact, or leave alone (the negated caveat).
- **Responsible AI tab.** It covers purpose and intended use, and each AI model with when it runs and whether it's on. It also lists the certified data sources (read live from the gold schema) and the protections in force, with counts. It explains how quality is measured, using the latest eval run and the feedback review numbers, and covers data handling, known limitations and a NIST AI RMF / EU AI Act alignment table (described as design, not certification).
- **Feedback review queue (Monitoring).** A 👎 now asks why: wrong numbers, wrong products/buckets/filters, didn't answer, hard to understand, or something else, with an optional note. Each one waits in **Monitoring → Feedback review**, where a reviewer can mark it fixed, dismiss it, or **add it to evals** (it becomes an accuracy case).
- **AI usage and cost (Monitoring).**
  - **What's counted:** every model call's tokens by feature (guardrail classifier, embeddings, judge, follow-ups, session naming) and model, for questions and eval runs separately.
  - **Cost:** an estimated cost appears when an optional `pricing` section (USD per million tokens per endpoint) is set.
  - **Cache savings:** the Cache Hits KPI now shows the total waiting time saved.
- **Request trace (waterfall).** Each question records spans with start offsets: input checks, the classifier (in parallel), the exact and similar-question cache lookups, the embedding, the query engine and its stages, output checks, follow-ups and the judge. It's shown in the answer panel and the audit trail.
- **Suggested follow-up questions.** The engine's own suggestions are topped up to three by a small model (`follow_ups.model`). Agent mode now gets them too. Each suggestion passes the input pattern checks, and they're written in the language of the question.
- **Voice input.** A mic button dictates the question using the browser's speech recognition, in the browser's language (Chrome and Edge; hidden elsewhere). Nothing is recorded by the app.
- **Concentrix branding.**
  - **Logos**, made from the files supplied in `all_details_and _data/` and used sparingly:
    - **Full wordmark** (`public/img/concentrix-logo.png`, trimmed to the wordmark): in the header next to LensS, and at the top of the PDF's first page.
    - **Small mark** (`public/img/cnx-mark.png`): as the assistant's avatar beside each reply in the chat, which carries into the PDF, and as the browser-tab icon (`favicon.png`).
    - **Not used elsewhere:** tabs, Monitoring, Evals and toasts. If the logo file is missing, the header shows "Concentrix" as text.
  - **Product name:** the page title is now "LensS Collections Intelligence | Concentrix".
- **AI-generated notice** under the question box.
- **`deploy/config/org-v2.json`** deploys this version next to the existing org app. It uses its own app name, Genie space and Lakebase database, and the same data.
- **Tab order:** Command Center, Chat + Agent, Monitoring, Evals, Responsible AI.
- **Long tables scroll inside their card.** Every table in Monitoring and Evals shows about 10 rows, with a header that stays put, so the page no longer grows with every question.

### Changed
- **No platform names in the app.** "Genie" and "Databricks" no longer appear anywhere users look.
  - **Wording:** "Refresh gets a fresh live answer", "LensS query engine", "Generated SQL", "Semantic model version", "answered live".
  - **Model names:** shown by their own names (e.g. "GPT-OSS 20B", "Llama 3.1 8B Instruct"), not endpoint names.
  - **Unchanged:** code, deploy scripts and the technical guides still name the platform.
- **PDF export.**
  - **Header and file name:** every page's header is "LensS Collections Intelligence" with no session name. The first page shows the Concentrix logo or name, the product name, and "Conversation export · N questions · date". The file is named "LensS Collections Intelligence - <date>.pdf".
  - **Footer:** "Generated by Concentrix LensS Collections Intelligence".
- **Session names from guarded questions.** A first question that was blocked, or had personal details removed, no longer names the session. The session is called "⚠ Blocked question" or "⚠ Personal details removed", and the next clean question renames it. Schema v6 also renamed older sessions named that way.
- **Answers appear as soon as they're saved.** Follow-ups and the session name arrive a moment later, so a cache hit appears in under a second.
- **Exact cache hits skip the classifier wait.** The identical question was screened when it was first answered, and the pattern checks still run; semantic hits still wait for the classifier. A warm exact hit went from about 2.5 s to 0.8 s.
- **Guardrail classifier and multilingual questions:**
  - **Languages:** the classifier is told questions may be in any language.
  - **Courtesy messages:** thanks and greetings are never marked off-topic. The eval suite caught the 8B classifier doing this.
- **Lakebase schema v6:** `eval_cases`, `eval_runs`, `eval_results`; feedback reason, comment and review status on `chat_messages` and `usage_log`.

### Verified (personal workspace, a handful of model calls)
- **One live Chat question:**
  - **Trace:** the classifier ran in parallel (2.4 s) with the cache lookups and embedding; the query engine took 27.9 s with its stages.
  - **Sources:** `qry_product_vs_target`.
  - **Quality:** the judge (GPT-OSS 20B, 702 tokens) scored 100% on all four metrics, and the trust bar went from "Checking accuracy…" to "Verified · 100%".
  - **Feedback:** a 👎 with a reason appeared in the review queue and was marked fixed.
- **Blocked question:** a profane question was blocked by the pattern check and the session got "⚠ Blocked question".
- **Eval runs:**
  - **First run:** accuracy 1/1 ("What is MTD collection versus target?": 100% of the ground-truth figures matched, faithfulness 100%) and policy 7/7. Guardrails were 14/15: the 8B classifier called "Thanks, that's really helpful!" off-topic.
  - **After the courtesy fix:** guardrails 15/15.
  - **Cost:** 11 classifier calls (about 2.8k tokens) and 1 judge call for the first run.
- **Table scrolling:** the audit trail (133 rows) scrolls in a 453 px box with its header fixed; the page dropped to about 3,800 px tall. The answer cache, eval results and eval cases tables scroll the same way.
- **UI in headless Chrome, at desktop and phone widths:**
  - **Tabs:** Concentrix wordmark, new tabs, mic button, trust bar, the answer panel, the 👎 reason popover, the Evals tab, Monitoring (cost table, feedback queue, audit trace), Responsible AI.
  - **PDF:** the downloaded PDF's text is "CONCENTRIX / LensS Collections Intelligence / Conversation export…" with the new footer and no session name.
  - **Layout:** no horizontal scroll on a phone and no console errors.
- **Logos:** the header wordmark loads (shown at 141×22), the favicon is served, each reply has the mark, and the PDF's first page shows the wordmark above the product name. The layout was also checked at phone width.
- **Not verified live:** Agent mode with the new follow-ups and trace, voice input with a real microphone (needs a person), cost figures (no `pricing` set), and anything in the org workspace.

---

## v1.4.0 — Semantic cache, guardrails, faithfulness judge, notifications, Genie fixes (2026-10-01, `9a502e8`)

Built and deployed to the personal workspace. The org workspace still needs `--only genie,lakebase,app`.

### Added
- **Semantic cache.** A standalone question that isn't an exact repeat can reuse the answer to a cached question that means the same thing.
  - **When it reuses an answer:** the embedding similarity must be at least the configured threshold (e.g. `98`), *and* the key details must match exactly. Key details are numbers and DPD buckets, products, channels, strategies, the dimension asked about, and best vs worst.
  - **Storage:** embeddings come from `databricks-gte-large-en` and are stored in `answer_cache.embedding` (`REAL[]`). The nearest match is computed in the app; pgvector isn't needed.
  - **Older entries:** entries cached before this get embeddings filled in on first use.
  - **Label:** "⚡ Answered from cache · similar to '…'".
  - **Monitoring:** every miss records its closest cached question and similarity, for tuning the threshold.
- **Guardrails** on questions and answers.
  - **Input checks:**
    - PII (emails, phone numbers incl. +91, Luhn-valid card numbers, Aadhaar, PAN, SSN, IBAN) is masked or blocked. Masked text is all that reaches Genie, the cache and the logs.
    - Profanity and abuse: Hindi/Hinglish word list plus the model.
    - Prompt injection: patterns plus the model.
    - Off-topic: the model.
  - **Output checks:** PII and profanity are redacted. Policy wording is flagged: causal "would deliver X uplift" claims, month-end forecasts, cure rate, probabilities of hitting target. Negated sentences are skipped, so required caveats don't trigger it.
  - **Configuration:** an action per check (`block`, `redact`, `warn`, `flag`, `off`).
  - **Speed:** a pattern block returns immediately. The classifier model runs in parallel with the cache lookups, and a classifier failure never blocks a question.
- **Faithfulness judge**, run after each live answer without delaying it.
  - **Numbers check:** every figure in the answer is looked up in the query results and their column totals, handling K/M/B/% and ignoring digits inside IDs.
  - **Judge model:** scores how well the factual claims are supported and lists unsupported claims.
  - **Score:** the mean of the two, stored in `usage_log.faithfulness` and with the cache entry. Cache hits and pre-warmed answers reuse it.
  - **Evidence:** Agent mode keeps every query result for the judge, not only the charted ones.
- **Answer-ready notifications.**
  - **On another app tab or chat:** an in-app toast with **View**.
  - **Browser tab hidden:** also a browser notification and a "(n)" title badge.
  - **Permission:** offered once, from a banner, on the first question.
- **Monitoring additions:**
  - **Faithfulness** KPI (with the judge model name) and **Blocked** KPI; cache hits show how many were similar-question hits.
  - A "Guardrails and answer quality" section: features on/off with their models, check counts, recent events.
  - Audit trail: a **Faithful** column, plus judge, guardrail and closest-match details in each row.
- **Deploy config sections** `semantic_cache`, `guardrails` and `faithfulness_judge`; a missing section means off.
  - **Endpoint check:** `deploy.py` checks that each configured model endpoint exists, the same way it re-finds the Genie space and Lakebase. If one is missing, it warns and leaves that feature or model off.
  - **Permissions and settings:** it binds each model to the app with `CAN_QUERY`, and passes the settings as `LENSS_AI_CONFIG`.
  - **Models per config:** `personal.json` uses lightweight models (`gte-large-en`, `llama-3-1-8b-instruct`, `gpt-oss-20b`); `org.json` uses stronger ones (`gte-large-en`, `llama-3-3-70b-instruct`, `gpt-oss-120b`).
- **Lakebase schema v5:** `answer_cache.embedding`, `usage_log.guard_action`, `usage_log.faithfulness`.
- **Smoke test:** a prompt-injection question must be blocked before Genie (skipped when guardrails are off; uses no model calls).
- **Genie space:**
  - **Uplift guardrail instruction.** "What uplift would a challenger strategy deliver?" type questions get an observational like-for-like comparison against the Standard strategy in matched segments of 30+ accounts. The answer always carries the "not a controlled experiment" caveat, never states a money or percentage uplift, and recommends a proper champion/challenger test.
  - **Matching example query** for that type of question.

### Changed
- **Genie: MTD example vs benchmark conflict fixed.**
  - "What is my MTD collections performance versus target?" / "What is MTD collection versus target?" now has an example returning the one-row portfolio total, matching the benchmark and the Command Center.
  - The breakdown example is reworded "…by product and DPD bucket".
- **Genie: the uplift benchmark** now has a real, gradable query as its expected answer instead of a placeholder sentence.
- **Genie: the like-for-like example** lists its columns instead of `SELECT *`, so the all-zero `Cure_Rate` column is no longer returned.
- **`personal.json`:** `prewarm_suggestions` is `false`, to save model and Genie calls while testing. Turn it back on when needed.
- **Answer-ready toast enlarged.** It was too small to notice. It's now about 28% of the screen width (380–600 px) and at least 20% of the screen height, in the bottom right. Other changes:
  - larger title, question text and icon;
  - the question wraps to three lines instead of being cut off;
  - a prominent **View answer** button.

  On phones it spans the width at the bottom. Checked in headless Chrome at 1440×900 (403×197 px) and 390×844.

### Verified
Kept to a handful of model calls on the personal workspace.
- **Offline tests:**
  - PII: 7 kinds caught, nothing wrongly flagged in account IDs, money, percentages or buckets.
  - Policy checks, including negated sentences.
  - Numbers check: caught a fabricated $25.0M and confirmed a total built from column sums.
  - Key-detail matching: 31-60 vs 61-90, Personal Loan vs Credit Card, best vs worst, product vs bucket.
- **Live:**
  - A prompt injection was blocked.
  - One Chat answer was judged by `gpt-oss-20b` (100% supported, ~4,000 tokens, 1.4 s).
  - "Which accounts need immediate intervention?" was served from the semantic cache (98.9% match) on the deployed app in 757 ms, with no Genie call.
  - Toast, banner and Monitoring panels checked in headless Chrome.
- **Genie:** both fixed benchmark questions now produce exactly the ground-truth SQL; the uplift answer opens with the required caveat.
- **Not yet verified live:** the judge on the deployed app; the classifier flagging a borderline question; these features with Agent-mode answers; the uplift guardrail in Agent mode.

---

## v1.3.0 — Answer caching, PDF export, answer-text fixes (2026-10-01, `ae49149`)

### Added
- **Answer cache (Phase 1)** in Lakebase (`chatapp.answer_cache`) for standalone questions: the first question of a chat, suggested questions, and refreshes.
  - **Key:** normalized question + mode + data version + Genie version. `deploy.py` bumps the data version on `ingest`/`transform`/`summary` and the Genie version (a hash of the space definition) on `genie`, so stale answers can't be served.
  - **Expiry:** live answers last 24 h; pre-warmed ones last until the versions change.
  - **Eviction:** 👎 evicts the entry.
- **Pre-warm** of the 10 suggested questions in the background, once per version pair.
  - It's claimed through `chatapp.prewarm_runs` so only one app instance runs it.
  - A heartbeat lets a claim orphaned by a redeploy be taken over after 10 minutes. This was found in testing: a redeploy briefly starts the old deployment and stops it 5 s later.
  - An existing live answer for a suggested question is promoted so it no longer expires.
- **Command Center cache:** in memory, per data version (`X-Cache: hit|miss`). A repeat load took 0.2 s instead of 16 s.
- **Cache in the UI and Monitoring:**
  - Cached answers render exactly like live ones, labelled "⚡ Answered from cache · generated <time>", with **↻ Refresh**, which asks Genie live and replaces the answer in place.
  - Cached turns are carried as context into the next follow-up.
  - Monitoring: a Cache Hits KPI, live-only latency, cache details with the original timings in the audit trail, and an Answer cache panel (versions, last pre-warm, cached questions).
- **Download PDF** of a conversation as it looks on screen, charts included. Pages break between blocks (not through charts), with a header and page numbers. Built with html2canvas and jsPDF, loaded on first use.
- **`GET /api/chat/suggestions`:** the 10 questions now live in one server file, `server/lib/suggestions.ts`, used by the tiles, the side panel and the pre-warm.
- **Config keys** `answer_cache` and `prewarm_suggestions`.
- **Smoke test:** 23 checks, including the cache, Refresh and the Command Center cache.

### Changed
- **Code structure:** Genie calls were moved into `server/lib/genieRun.ts`, shared by live questions and the pre-warm.

### Fixed
- **Genie citation links removed.** These were `[[1](https://<workspace>/genie/rooms/…)]` links in answers. They're stripped from new answers, stored history, cached answers and Monitoring, including links cut off by preview truncation. Users can't open them, and they exposed the workspace address.
- **List numbering:** numbered lists with blank lines between items no longer restart at "1."
- **Chart axes:** labels show one decimal below 10 ("1.5K" instead of a row of "1K"s).

---

## Demo guide (2026-09-29, `9bc022a`)

- Added `docs/LensS_Collections_Demo_Guide.docx`: a 37-page presenter guide covering architecture, data foundation, the agent and its guardrails, an app walkthrough, a timed demo script, a question bank and prepared Q&A.
- **Out of date:** it was written before v1.2.0, so its screenshots and demo-boundary notes need a refresh (see Open items).

---

## v1.2.0 — Suggested-questions panel; forecast and cure rate removed (2026-09-29, `318db07`)

### Added
- **Suggested questions:** six starter tiles on an empty chat, plus a collapsible "Suggested questions" panel once a conversation starts (10 questions: 5 Chat, 5 Agent). Every question was checked against the live Genie space.

### Changed
- **Genie: `qry_month_end_forecast` removed** from the sources. A calendar-day run rate on a single mid-month snapshot projected ~174% of target against a different total, which contradicted MTD-vs-target. Genie now reports MTD achievement and the gap, and says a forecast needs daily history.
- **Genie: no cure rate.** A new instruction says not to use or report it, because cured accounts drop to DPD 0 and leave the eligible population, so it reads 0% everywhere. Six examples and one benchmark moved to PTP conversion, RPC and recovery rates.
- **`qry_recommended_channel`** now ranks by balance recovery rate, then PTP conversion, instead of cure rate (all 0, which picked the cheapest channel).
- **Command Center:** the Cure Rate column was removed from the segment table.

---

## v1.1.4 — Lakebase database as an app resource (2026-09-28, `a6b5b46`)

- **App resource:** `chatapp` is declared as an app resource (`postgres`, `CAN_CONNECT_AND_CREATE`), in the format the Databricks UI uses. Databricks creates the app's Postgres login, and `deploy.py` still applies the table grants.
- **New guide:** `APP_SERVICE_PRINCIPAL_SETUP.md` covers converting a UI-created AppKit Genie app to service-principal authorization.

## v1.1.3 — Shared-catalog deploys (2026-09-28, `4980443`)

- **USE CATALOG no longer fails the deploy** when it can't be granted (it needs MANAGE). The deploy accepts it if `account users` already has it; otherwise it warns with the exact GRANT for an admin and carries on.

## v1.1.2 — First-time app creation (2026-09-28, `e6fd352`)

- **`apps create`:** the app name now goes inside the JSON body. The CLI rejected a positional name together with `--json`, which broke the first org deploy.
- **Postgres role names** include the service principal ID, so a recreated app doesn't clash with the old role.
- **Verified** by deleting and recreating the personal app.

## v1.1.1 — App-only access for users (2026-09-28, `40706e9`)

- **Users get only Can use on the app;** Unity Catalog grants go to the app's service principal alone. Verified: a user with only Can use is refused (403) on the Genie space, tables and warehouse directly, but can use the app fully.
- **No on-behalf-of-user scopes** (`user_api_scopes = []`), so users never see a consent prompt.

## v1.1.0 — Executive summary, feedback, audit trail (2026-09-27, `afd3bca`)

- **Executive summary:** Command Center summary card, written by a new `summary` deploy step from the certified views (no LLM, so the figures always match).
- **Feedback:** 👍/👎 on every answer, stored in Lakebase and sent to the Genie space's Monitor through Genie's feedback API (works for Chat and Agent answers).
- **Audit trail in Monitoring:** per question, the answer, the SQL with row counts, stage timings and Genie IDs, filterable by user.
- **Session titles** come from the first question; the title model is optional and off by default.
- **Lakebase schema v3**; smoke test at 20 checks.

## v1.0.1 — Stopped apps (2026-09-27, `6435ad3`)

- **`deploy.py`** starts the app if its compute is stopped, and waits for any running deployment before deploying.

## v1.0.0 — First release (2026-09-25, `141c951`)

- **Data:** the workbook is ingested to bronze/context, then typed silver, gold config, 2 metric views and 16 certified views in Unity Catalog.
- **Genie space as code:** sources, instructions, examples and benchmarks.
- **Databricks App:** Command Center, Chat + Agent (mode per question, charts, named per-user sessions), and Monitoring.
- **Lakebase Postgres** for chat history and the usage log.
- **One-command deploy** (`deploy/deploy.py`) and a smoke test run against the deployed URL as a non-admin identity.

---

## Key decisions and lessons

- **Service principal, not on-behalf-of-user.** The app calls Genie, SQL, Lakebase and models as its own identity, so users need only Can use. This is also why one shared answer cache is safe: everyone gets the same answer. Per-user row-level security would need per-user caching.
- **Metric views and certified views instead of raw tables.** Measures are defined once and Genie has fewer, cleaner sources. Removing a misleading source (the forecast view) was more effective than an instruction alone.
- **Genie benchmarks grade result sets.** "Why" questions and refusals don't fit them: refusals stay as manual-review benchmarks or go into our own guardrail tests. Conflicting example queries make benchmarks fail even when Genie is consistent.
- **"It works" must be proven as a non-admin identity against the deployed URL.** The first Agent-mode failure was missing grants on the app's service principal, not a timeout.
- **A redeploy briefly starts the old deployment.** Anything claimed at startup needs a heartbeat or a timeout.
- **Models are enabled per workspace by hand.** The deploy checks they exist and degrades gracefully rather than failing.
- **Test against the personal workspace with few model calls.** It has unknown usage limits, so use lightweight models there and offline tests for the rest.
- **Show the platform's work, not its name.** The app is presented as Concentrix LensS: users see what the AI did (sources, SQL, checks, scores, trace) but no vendor names. The technical docs keep the platform names because engineers need them.
- **Evals pay for themselves early.** The first guardrail run found a real false positive (thanks marked off-topic by the 8B classifier) that no one had noticed in manual testing.
- **Cache hits shouldn't wait for checks that already ran.** An identical question was screened the first time it was answered; only near-matches need the classifier again.

---

## Open items

- **Org workspace:** an admin still needs to run `GRANT USE CATALOG ON CATALOG cnx_automl_dev TO <app service principal>` (see v1.1.3). Enable the models named in `org.json` before deploying v1.4.0 there.
- **Demo guide docx:** refresh the screenshots and content for v1.2.0 onwards (suggested-questions panel, cache, PDF, guardrails, judge, trust bar, Evals, Responsible AI).
- **Verify live** when convenient: the judge on the deployed app, the classifier on borderline questions, and Agent mode with the uplift guardrail and the new features.
- **Cost estimates:** add a `pricing` section (USD per million input/output tokens per endpoint, from your price sheet) to show estimated cost in Monitoring.
- **Evals, next steps:** grow the accuracy set (aim for ~50 ground-truth questions, including Agent questions), and consider running it as a deploy step that fails below a threshold.
- **Personal workspace:** turn `prewarm_suggestions` back on when testing is done.
- **v1.7 spec differences (resolved):** leadership confirmed the spreadsheet's figures are a reference only; the governed population and the v1.6 calculations stay.
- **Demo guide docx:** add the v1.7 Command Center, Explorer, prompts and Observability (seven areas) screens to `docs/LensS_Collections_Demo_Guide (with feature catalogue).docx`.
- **Org config:** `org2-v2.json` (kept out of git) has no `auto_mode` section, so Auto uses AI with its guardrail model if one is set; add `"auto_mode": { "method": "ai", "model": "<an enabled small model>" }` to choose the model, or `"rules"` to turn it off.
- **Optional:** restrict Monitoring and Evals to admins (today any app user can open them and start an eval run).
