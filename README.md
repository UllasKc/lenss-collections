# LensS Collections Intelligence

Decision intelligence for collections, built on Databricks by the Concentrix Data & Analytics Practice and presented as **Concentrix LensS**. Governed bronze → silver → gold data feeds a web app with four tabs:

| Tab | What it does |
|---|---|
| **Command Center** | One story in five chapters: are we on track, how healthy is the book, what is holding us back, where is the money, what to do this week. Every figure opens the accounts behind it |
| **Explorer** | Self-service drill-down with filters, diagnostic charts and the accounts behind each chart item, with CSV export |
| **Assistant** | Plain-language questions answered by a Genie space ("LensS query engine"): Quick answer, Deep analysis or Auto, with conversation memory, answers about the platform itself, charts, SQL and a quality score |
| **Observability** | Pipeline traces, answer quality and faithfulness, performance, drift, security and guardrails, Evaluations and Responsible AI |

Every Command Center and Explorer figure comes from certified SQL views; no AI computes them. Current version: **v1.9.0** (see [CHANGELOG.md](CHANGELOG.md)).

> **Deploying to a new workspace or a new laptop? Follow [SETUP_GUIDE.md](SETUP_GUIDE.md).** It covers every step from installing the tools to giving users access, plus troubleshooting.

## Documentation

| Document | For | What's in it |
|---|---|---|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Whoever deploys | Installing tools, configuring a workspace, deploying, updating, troubleshooting |
| [DATABRICKS_IMPLEMENTATION_GUIDE.md](DATABRICKS_IMPLEMENTATION_GUIDE.md) | Engineers | Feature catalogue, the build step by step, design decisions and gotchas |
| [CHANGELOG.md](CHANGELOG.md) | Everyone | Every change by version: what, why, what was verified |
| [LensS_Collections_Leadership_Summary.md](LensS_Collections_Leadership_Summary.md) | Leadership | What was built, why, and where it stands, in plain language |
| [docs/LensS_Client_Demo_Playbook.html](docs/LensS_Client_Demo_Playbook.html) | Presenters | Scene-by-scene client pitch script, Q&A, pre-demo checklist (open in a browser) |
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

Configs live in `deploy/config/`: `personal.json` (Free Edition workspace), `org.json` and `org-v2.json` (templates), and `org2-v2.json` (the current organisation deployment). Every field, including the optional AI features (semantic cache, guardrails, faithfulness judge, follow-ups, Auto mode, platform questions, conversation memory, evaluations), is described in [SETUP_GUIDE.md section 7](SETUP_GUIDE.md#7-point-the-config-at-your-workspace).

Permissions you need in the workspace: `CREATE SCHEMA` on the catalog, permission to create Genie spaces, Lakebase project creation, and Databricks Apps creation. If any of those is missing, the script stops at that step with the platform's error message.

## Giving people access (including people outside the company)

Databricks Apps **cannot** be made public or anonymous — Databricks' own documentation states that bypassing SSO isn't supported. The app is reachable from anywhere on the internet over HTTPS, but every visitor must sign in with a Databricks-recognised identity. Two supported routes:

- **People:** add them to the workspace (external collaborators via your identity provider with SCIM/JIT provisioning — an admin task), then grant them `CAN_USE` on the app (or set `readers_group`).
- **Systems / APIs:** a service principal with an OAuth M2M secret can call the app's API. It needs `CAN_USE` on the app **and the `workspace-access` entitlement** — without that entitlement the app returns 401 even with a valid token.

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

## Repository layout

| Path | Contents |
|---|---|
| `deploy/deploy.py` | The one-command deploy |
| `deploy/config/` | Workspace configs (see above) |
| `deploy/sql/` | All table/view DDL, templated by catalog and schema prefix |
| `deploy/genie/space.py` | Genie space as code: sources, instructions, examples, benchmarks |
| `deploy/lakebase/schema.sql` | Chat history, usage log, answer cache, evaluation and memory tables |
| `deploy/evals/cases.py` | Evaluation cases: ground-truth, red-team guardrail and policy cases (seeded into Lakebase) |
| `deploy/smoke_test.py` | End-to-end test of a deployed app |
| `appkit-genie-app/` | The app: Node/Express server (`server/`) and static UI (`public/`) |
| `docs/` | Product and demo guide (Word), client demo playbook, figures reference |
| `all_details_and _data/` | Source workbook and specification documents |
