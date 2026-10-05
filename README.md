# LensS Collections Intelligence

Natural-language analytics for collections, built on Databricks and presented as **Concentrix LensS**. It has governed bronze → silver → gold data, and a Genie space with curated instructions, examples and benchmarks. The web app has Chat and Agent (deep-analysis) modes and per-user chat history. Every answer carries a quality score, its sources and its trace. The app also has an **Evals** tab, a **Responsible AI** page and Monitoring, which covers cost, feedback review and the audit trail.

> **Deploying to a new workspace or a new laptop? Follow [SETUP_GUIDE.md](SETUP_GUIDE.md)**. It covers every step from installing the tools to giving users access, plus troubleshooting.

## Deploy everything with one command

```bash
python deploy/deploy.py --config deploy/config/org.json
```

That single run, idempotently and in order:

| Step | What it does |
|---|---|
| `schemas` | Creates `<catalog>.lenss_collections_{bronze,silver,gold,context}` and the `raw_files` volume (and the catalog itself if `create_catalog` is true) |
| `ingest` | Uploads the workbook to the volume and lands all 11 sheets as bronze/context tables, verifying row counts |
| `context` | Creates the governance tables that exist only in the Word docs |
| `transform` | Builds silver (typed + primary key), `business_rules_config`, 2 metric views, 16 certified views |
| `summary` | Writes the Command Center's executive summary to `gold.exec_summary`, built from the certified views (no LLM); re-run it when the data changes |
| `genie` | Creates or updates the Genie space: 19 sources, instructions, 19 examples, 8 sample questions, 7 benchmarks |
| `lakebase` | Creates the Lakebase Postgres project/database and the chat-history + usage-log tables |
| `app` | Creates or updates the Databricks App, binds the Genie space + SQL warehouse, grants the app's service principal read access on gold and access to Lakebase, then syncs and deploys |
| `smoke` | Calls the deployed URL end to end (skipped unless smoke-test credentials are set — see below) |

Re-running is safe. Run part of it with `--only ingest,transform` or `--skip smoke`.

### Prerequisites (once per laptop)

1. **Python 3.10+** and the packages: `pip install -r deploy/requirements.txt`
2. **Databricks CLI** on `PATH` (`winget install Databricks.DatabricksCLI` on Windows, `brew install databricks` on Mac). If you only have the one bundled with the VS Code extension, set `DATABRICKS_CLI_PATH` to it.
3. **An authenticated CLI profile:** `databricks auth login --host https://<your-workspace> --profile lenss-org` (or `databricks configure --profile lenss-org` with a personal access token). Put the profile name in the config's `profile` field. `org.json` expects `lenss-org`.

VS Code is optional; any terminal (Command Prompt, PowerShell, bash) works. Node.js is **not** needed to deploy; Databricks builds the app.

### Before the first org run, edit `deploy/config/org.json`

| Field | Meaning |
|---|---|
| `profile` | CLI profile to use |
| `catalog` / `create_catalog` | Target catalog; leave `create_catalog` false in the shared `cnx_automl_dev` catalog |
| `warehouse_id` or `warehouse_name` | SQL warehouse for all SQL and for Genie (Pro or Serverless) |
| `app_name` | Databricks App name (lowercase, hyphens) |
| `readers_group` | Optional workspace group that gets `CAN_USE` on the app, and nothing else. Users need no Genie, warehouse or table permissions, because the app uses its own service principal |
| `title_endpoint` | Optional chat model serving endpoint that names chat sessions, e.g. `databricks-meta-llama-3-3-70b-instruct`. Off by default: sessions are named from their first question |

Permissions you need in the org workspace: `CREATE SCHEMA` on the catalog, permission to create Genie spaces, Lakebase project creation, and Databricks Apps creation. If any of those is missing, the script stops at that step with the platform's error message.

## Giving people access (including people outside the company)

Databricks Apps **cannot** be made public or anonymous — Databricks' own documentation states that bypassing SSO isn't supported. The app is reachable from anywhere on the internet over HTTPS, but every visitor must sign in with a Databricks-recognised identity. Two supported routes:

- **People:** add them to the workspace (external collaborators via your identity provider with SCIM/JIT provisioning — an admin task), then grant them `CAN_USE` on the app (or set `readers_group`).
- **Systems / APIs:** a service principal with an OAuth M2M secret can call the app's API. It needs `CAN_USE` on the app **and the `workspace-access` entitlement** — without that entitlement the app returns 401 even with a valid token.

## Smoke test

```bash
set LENSS_SMOKE_CLIENT_ID=<service principal application id>
set LENSS_SMOKE_CLIENT_SECRET=<its OAuth secret>
python deploy/smoke_test.py --host https://<workspace> --app-url https://<app>.databricksapps.com
```

It runs as a real, non-admin identity, which is what catches missing grants. It checks:
- the UI shell, and the Command Center APIs (including the full overview);
- four Quick-answer questions (including the personal-data refusal), and two Deep-analysis questions (skip them with `--skip-agent`);
- a session end to end: a chart is returned, the session is auto-named, history and charts are stored, and rename, delete and feedback work;
- guardrails, the answer cache with Refresh, Monitoring (usage and insights), Evals and Responsible AI.

## Repository layout

| Path | Contents |
|---|---|
| `deploy/deploy.py` | The one-command deploy |
| `deploy/config/` | `personal.json` (Free Edition mirror), `org.json` (organisation workspace), `org-v2.json` (a second version next to `org.json`; see SETUP_GUIDE 11.1) |
| `deploy/sql/` | All table/view DDL, templated by catalog and schema prefix |
| `deploy/genie/space.py` | Genie space as code: sources, instructions, examples, benchmarks |
| `deploy/lakebase/schema.sql` | Chat-history, usage-log, answer-cache and evaluation tables |
| `deploy/evals/cases.py` | Evaluation cases: ground-truth, red-team guardrail and policy cases (seeded into Lakebase) |
| `deploy/smoke_test.py` | End-to-end test of a deployed app |
| `appkit-genie-app/` | The app: Node/Express server (`server/`) and static UI (`public/`) |
| `all_details_and _data/` | Source workbook and specification documents |
| `DATABRICKS_IMPLEMENTATION_GUIDE.md` | Full build notes, design decisions and gotchas |
| `CHANGELOG.md` | Every change by version: what, why, what was verified, and open items |
| `SETUP_GUIDE.md` | Deploying to a new workspace, configuration (incl. semantic cache, guardrails, judge), troubleshooting |
