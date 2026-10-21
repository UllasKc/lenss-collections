# LensS Collections Intelligence

Decision intelligence for collections, built on Databricks by the Concentrix Data & Analytics Practice and presented as **Concentrix LensS**. Governed bronze → silver → gold data feeds a web app with four tabs:

| Tab | What it does |
|---|---|
| **Command Center** | An executive summary ("the month in 30 seconds"), then one story in five chapters: are we on track, how healthy is the book, what is holding us back, what to do this week, and what more can be recovered from high-risk customers. Every figure opens the accounts behind it |
| **Explorer** | Self-service drill-down with filters, diagnostic charts and the accounts behind each chart item, with CSV export |
| **Assistant** | Plain-language questions answered by a Genie space ("LensS query engine"): Quick answer, Deep analysis or Auto, with a conversation-aware router (data or platform guide, quick or deep, escalation to a deep analysis when an answer is not enough or a question is asked again), conversation memory, charts, SQL and a quality score |
| **Observability** | Pipeline traces, answer quality and faithfulness, performance, drift, security and guardrails, Evaluations and Responsible AI |

Every Command Center and Explorer figure comes from certified SQL views; no AI computes them. Current version: **v1.9.2** (see [CHANGELOG.md](CHANGELOG.md)).

> **Deploying to a new workspace or a new laptop? Follow [SETUP_GUIDE.md](SETUP_GUIDE.md).** It covers every step from installing the tools to giving users access, plus troubleshooting.

## Documentation

| Document | For | What's in it |
|---|---|---|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Whoever deploys | Installing tools, configuring a workspace, deploying, updating, troubleshooting |
| [DATABRICKS_IMPLEMENTATION_GUIDE.md](DATABRICKS_IMPLEMENTATION_GUIDE.md) | Engineers | Feature catalogue, the build step by step, design decisions and gotchas |
| [CHANGELOG.md](CHANGELOG.md) | Everyone | Every change by version: what, why, what was verified |
| [LensS_Collections_Leadership_Summary.md](LensS_Collections_Leadership_Summary.md) | Leadership | What was built, why, and where it stands, in plain language |
| [docs/LensS_Client_Demo_Playbook.html](docs/LensS_Client_Demo_Playbook.html) | Presenters | Scene-by-scene client pitch script, Q&A, pre-demo checklist (open in a browser) |
| [docs/LensS_Routing_Reference.html](docs/LensS_Routing_Reference.html) | Engineers, reviewers | Every rule that routes an Assistant question: diagrams, ~90 numbered rules with the functions that implement them, context and token budgets, Genie conversations, cache, guardrails, settings, files, FAQ and search (open in a browser; online copy: https://claude.ai/artifact/HyZSsXXrSw7f3Z5E4pFTXo) |
| [docs/LensS_Routing_Examples.html](docs/LensS_Routing_Examples.html) | Everyone | The routing path stepped through six real conversations (online copy: https://claude.ai/artifact/5f4tqq53k4eXzLoLb5ZTw1) |
| [docs/LensS_Figures_Reference.md](docs/LensS_Figures_Reference.md) | Presenters, analysts | Every Command Center and Explorer figure: what it shows and how it is calculated |
| [docs/LensS_Collections_Product_and_Demo_Guide.docx](docs/LensS_Collections_Product_and_Demo_Guide.docx) | Presenters, clients, leadership | The full Word guide (v1.9): product, architecture, data, AI safeguards, every screen with screenshots, deployment, a 20-minute demo script, safe questions, Q&A, key figures, glossary |
| [PROJECT_UNDERSTANDING_AND_PLAN.md](PROJECT_UNDERSTANDING_AND_PLAN.md) | Background | The original scope, inventory and plan (historical) |
| [APP_SERVICE_PRINCIPAL_SETUP.md](APP_SERVICE_PRINCIPAL_SETUP.md) | Special case | Converting an app created in the Databricks UI to service-principal access (`deploy.py` does this automatically) |
| [appkit-genie-app/README.md](appkit-genie-app/README.md) | App developers | The app's structure, API routes and running it locally |

## Deploy everything with one command

```bash
python deploy/deploy.py --config deploy/config/<your-config>.json
```

That single run, idempotently and in order:

| Step | What it does |
|---|---|
| `schemas` | Creates `<catalog>.lenss_collections_{bronze,silver,gold,context}` and the `raw_files` volume (and the catalog itself if `create_catalog` is true) |
| `ingest` | Uploads the workbook to the volume and lands all 11 sheets as bronze/context tables, verifying row counts |
| `context` | Creates the governance tables that exist only in the Word docs |
| `transform` | Builds silver (typed + primary key), `business_rules_config`, 2 metric views, 16 certified views |
| `views` | Builds the 8 Command Center and Explorer views (`qry_cc_*`, `qry_explorer_base`) in gold |
| `summary` | Writes the executive summary and the time the data was last loaded to `gold.exec_summary` (no LLM); re-run it when the data changes |
| `genie` | Creates or updates the Genie space: sources, instructions, examples, sample questions, benchmarks |
| `lakebase` | Creates or upgrades the Lakebase database: chat history, usage log, answer cache, evaluations, conversation memory |
| `app` | Writes `app.yaml`, creates or updates the Databricks App, binds the Genie space, SQL warehouse and model endpoints, grants the app's service principal read access on gold and access to Lakebase, then syncs and deploys |
| `smoke` | Calls the deployed URL end to end (skipped unless smoke-test credentials are set — see below) |

Re-running is safe. Run part of it with `--only views,summary,app` or `--skip smoke`. Common combinations:

| Situation | Steps |
|---|---|
| App code changed | `--only app` |
| A release that changes views, the summary or the database (e.g. v1.8, v1.9) | `--only lakebase,views,summary,genie,app` |
| New data in the workbook | `--only ingest,transform,views,summary,app` |
| A brand-new workspace | everything (no `--only`) |

### Prerequisites (once per laptop)

1. **Python 3.10+** and the packages: `pip install -r deploy/requirements.txt`
2. **Databricks CLI** on `PATH` (`winget install Databricks.DatabricksCLI` on Windows, `brew install databricks` on Mac). If you only have the one bundled with the VS Code extension, set `DATABRICKS_CLI_PATH` to it.
3. **An authenticated CLI profile:** `databricks auth login --host https://<your-workspace> --profile <name>` (or `databricks configure --profile <name>` with a personal access token). Put the profile name in the config's `profile` field.

VS Code is optional; any terminal works. Node.js is **not** needed to deploy; Databricks builds the app.

### Configuration

Configs live in `deploy/config/`: `personal.json` (Free Edition workspace), `org.json` and `org-v2.json` (templates), and `org2-v2.json` (the current organisation deployment). Every field, including the optional AI features (semantic cache, guardrails, faithfulness judge, follow-ups, the question router (`auto_mode`), platform questions, conversation memory, evaluations), is described in [SETUP_GUIDE.md section 7](SETUP_GUIDE.md#7-point-the-config-at-your-workspace).

Permissions you need in the workspace: `CREATE SCHEMA` on the catalog, permission to create Genie spaces, Lakebase project creation, and Databricks Apps creation. If any of those is missing, the script stops at that step with the platform's error message.

## Giving people access (including people outside the company)

Databricks Apps **cannot** be made public or anonymous — Databricks' own documentation states that bypassing SSO isn't supported. The app is reachable from anywhere on the internet over HTTPS, but every visitor must sign in with a Databricks-recognised identity. Two supported routes:

- **People:** add them to the workspace (external collaborators via your identity provider with SCIM/JIT provisioning — an admin task), then grant them `CAN_USE` on the app (or set `readers_group`).
- **Systems / APIs:** a service principal with an OAuth M2M secret can call the app's API. It needs `CAN_USE` on the app **and the `workspace-access` entitlement** — without that entitlement the app returns 401 even with a valid token.

### Databricks cost (Observability 8)

The cost page reads `gold.qry_platform_cost`, which the deploy's app step creates over `system.billing.usage` and `system.billing.list_prices`, filtered to the app's own workspace and scoped to this project: its apps and Genie spaces in full (every version, v1/v2/v3, counts as the same project), other apps and spaces left out, and shared services (warehouse, Lakebase, model serving, storage) at this project's share of each day's warehouse query time from `system.query.history` (0 before its first day; days after the last deploy use the latest 7 days' share), worked out at each deploy. A view runs with its owner's access, so the app needs nothing beyond its SELECT on gold; the person deploying must be able to read the two billing tables (if not, the deploy warns and the page says the figures aren't available). Costs are list prices, and anyone with `CAN_USE` on the app can see the workspace's spend. The view isn't in the Genie space.

### Idle stop

Databricks Apps never stop on their own and bill while running, so the app stops itself after a stretch with no use. Set it per deployment in the config:

```json
"idle_stop_minutes": 60      // minutes without use before the app stops; null or 0 = never stop
```

The default is 60 (`org2-v3.json` 60, `personal.json` 15).
- **Use** means any request from a signed-in person or service principal: opening a page, a question, an evaluation. An answer still streaming, or an evaluation in progress, keeps the app up.
- **Start it again** from Compute → Apps → Start. That needs CAN_MANAGE on the app, so give it to whoever runs demos. Whoever presses Start must be able to read the app's source folder (it sits in the deployer's home directory), so the deploy gives read access to the app's service principal, everyone with CAN_MANAGE on the app, and anyone in the config's `app_starters` list (for example a demo-giver group). Without it, only the person who deployed can start the app. Starting takes a few minutes. A deploy starts a stopped app by itself.
- **How it stops:** the app stops itself with its own service principal. The deploy gives that principal CAN_MANAGE on this app only (`server/lib/idleStop.ts`).

## Smoke test

```bash
set LENSS_SMOKE_CLIENT_ID=<service principal application id>
set LENSS_SMOKE_CLIENT_SECRET=<its OAuth secret>
set PYTHONIOENCODING=utf-8
python deploy/smoke_test.py --host https://<workspace> --app-url https://<app>.databricksapps.com
```

It runs as a real, non-admin identity, which is what catches missing grants. Its 27 checks cover:
- the UI shell, the account endpoint, the Auto-mode router, and the Command Center and Explorer APIs (the Explorer must reconcile to the Command Center);
- Quick-answer questions (including the personal-data refusal) and Deep-analysis questions (skip those with `--skip-agent`);
- a session end to end: a chart is returned, the session is auto-named, feedback, rename and delete work;
- a platform question and its follow-up keeping context, guardrails, the answer cache with Refresh, Monitoring, Evals and Responsible AI.


### Routing test (live conversations)

`deploy/routing_test.py` plays three scripted conversations through the deployed app, the way the browser does (ask the router, then send). They switch between the data and the platform guide, and between Quick answer and Deep analysis. For every turn it checks:
- where the question went, its mode, and escalation;
- the "You asked this before" choice;
- whether the engine was sent the turns it missed;
- that an answer came back.

It uses the same service principal as the smoke test, and real engine calls (several deep analyses, about 10–15 minutes). Run it after a change to routing:

```bash
python deploy/deploy.py --config deploy/config/<config>.json --only routing   # host and app address from the deploy
python deploy/routing_test.py --host https://<workspace>.cloud.databricks.com --app-url https://<app>.databricksapps.com
python deploy/routing_test.py ... --only 2      # one conversation
```

`--only routing` runs only when named; a full deploy never runs it.

The routing evaluation in the app (Observability → Evaluations → Routing) checks the router alone, in about a minute.

## Repository layout

| Path | Contents |
|---|---|
| `deploy/deploy.py` | The one-command deploy |
| `deploy/config/` | Workspace configs (see above) |
| `deploy/sql/` | All table/view DDL, templated by catalog and schema prefix |
| `deploy/genie/space.py` | Genie space as code: sources, instructions, examples, benchmarks |
| `deploy/lakebase/schema.sql` | Chat history, usage log, answer cache, evaluation and memory tables |
| `deploy/evals/cases.py` | Evaluation cases: ground-truth, red-team guardrail, policy and routing cases (seeded into Lakebase) |
| `deploy/smoke_test.py` | End-to-end test of a deployed app |
| `appkit-genie-app/` | The app: Node/Express server (`server/`) and static UI (`public/`) |
| `docs/` | Product and demo guide (Word), client demo playbook, figures reference |
| `all_details_and _data/` | Source workbook and specification documents |

## Business rules and view descriptions

- **Every threshold is a row in `gold.business_rules_config`** (`deploy/sql/40_gold_config.sql`): high risk 0.70, intervention propensity 0.25, R09's 5-point gap, 4.5 attempts, the 30 and 50 account minimums, the recommended-action and action-queue cut-offs, and the outlook bands. Each row says what it means and where it comes from.
  - **Certified and Command Center views** read the values live through `gold.qry_rules`. In the SQL, `{{live:<rule>}}` is expanded by the deploy into a read of `qry_rules`.
  - **Metric views** can't read a table at query time, so the deploy writes the value in (`{{rule:<rule>}}`) and stops if a rule is missing.
  - **The Genie instructions** quote the same values: `deploy/genie/space.py` writes `{{rule:<rule>}}`, `{{pct:<rule>}}` (90%) or `{{pts:<rule>}}` (5 points), and the deploy's `genie` step fills them in from the table.
  - **To change a threshold:** edit its row in `40_gold_config.sql`, then run the deploy's `transform`, `views` and `genie` steps. An `UPDATE` on the table changes the views at once, but the metric views only on the next transform, and the next transform resets the table to the file.
- **Every gold view has a description** (`COMMENT ON TABLE` / `COLUMN`, next to the view in `deploy/sql/60_certified_views.sql` and `70_command_center_views.sql`). It gives the business question the view answers (from the client's SQL library and query catalog), its grain, its rules, and when to prefer it over a similar view. Genie and Catalog Explorer read these.
  - **Edit descriptions in the SQL files only:** every deploy re-creates the views, so descriptions typed in Catalog Explorer are lost.
  - **The same goes for the Genie space** (instructions, examples, benchmarks): edit `deploy/genie/space.py`, not the Genie UI.
- **The app's account lists use the same rules.** The lists behind the Command Center's cards (`server/routes/dashboard.ts`) read their thresholds from `qry_rules`, and so does the card text that names one. The priority list's size is `priority_top_accounts` (100).

## Known limits and future work

- **Running the app on more than one server (scale-out).** The app assumes a single server, which is how Databricks Apps runs it today. Two things are kept in that server's memory and would need moving to Lakebase first:
  - **The question router's decision** (`rememberRoute` / `takeRoute` in `server/lib/router.ts`). The browser asks for the route, then sends the question, and the decision is kept in memory for up to 10 minutes in between. If the second request reached a different server, the question would be routed a second time: about 1 s extra and one more model call, and the decision could differ. Fix: store the decision in a short-lived Lakebase table keyed by user and question, or send the decision with the question.
  - **The running evaluation** (`evalRunning` in `server/lib/evals.ts`): "one run at a time" is enforced per server. Fix: check `chatapp.eval_runs` for a run in progress instead.

  The rest (chat history, the usage log, the answer cache with its pre-warm lock, conversation memory) already lives in Lakebase.
