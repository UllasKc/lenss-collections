# Changelog and development log

Everything that has changed in LensS Collections Intelligence, newest first, with the reasons and what was verified. For how things work, see:

- `README.md`: overview and quick start
- `SETUP_GUIDE.md`: deploying to a workspace, configuration, troubleshooting
- `DATABRICKS_IMPLEMENTATION_GUIDE.md`: design notes for each build step (Steps 0–9)
- `APP_SERVICE_PRINCIPAL_SETUP.md`: converting a UI-created AppKit Genie app to service-principal authorization

Versions match git tags where one exists. Dates are when the change was committed.

---

## v1.4.0 — Semantic cache, guardrails, faithfulness judge, notifications, Genie fixes (2026-10-01)

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

---

## Open items

- **Org workspace:** an admin still needs to run `GRANT USE CATALOG ON CATALOG cnx_automl_dev TO <app service principal>` (see v1.1.3). Enable the models named in `org.json` before deploying v1.4.0 there.
- **Demo guide docx:** refresh the screenshots and content for v1.2.0 onwards (suggested-questions panel, cache, PDF, guardrails, judge).
- **Verify live** when convenient: the judge on the deployed app, the classifier on borderline questions, and Agent mode with the uplift guardrail and the new features.
- **Evals (proposed, not built):**
  1. an accuracy set of ~50 questions with reference SQL, run as a deploy step that fails below a threshold;
  2. a guardrail test set (refusals, injections, forbidden content);
  3. an Agent-answer rubric judge, e.g. with MLflow `Guidelines`.
- **Personal workspace:** turn `prewarm_suggestions` back on when testing is done.
- **Optional:** restrict Monitoring to admins.
