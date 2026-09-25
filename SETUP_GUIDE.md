# Setup Guide — deploying LensS Collections to a new Databricks workspace

This guide takes you from a fresh laptop to a running app in any Databricks workspace. Every step, what it needs, and how to check it worked.

**Time:** about 30 minutes the first time (most of it installing tools), then about 10 minutes per deploy.

**What you end up with**, all created by one command:

| Piece | Where it lives |
|---|---|
| Bronze / silver / gold / context tables and views | Unity Catalog: `<catalog>.lenss_collections_*` |
| The source workbook | Unity Catalog volume `<catalog>.lenss_collections_bronze.raw_files` |
| Genie space "LensS Collections Analytics" (instructions, 19 examples, 7 benchmarks) | Genie |
| Chat-history and usage database | Lakebase Postgres project `lenss-collections-app` |
| The web app (Command Center, Chat + Agent, Monitoring) | Databricks Apps |

---

## 1. Do I need VS Code?

**No.** Everything runs from a terminal. Pick whichever you have:

| Terminal | Works? | Notes |
|---|---|---|
| Windows **Command Prompt** (`cmd`) | ✅ | Commands in this guide show a `cmd` version where syntax differs |
| Windows **PowerShell** | ✅ | Shown as `PowerShell` where syntax differs |
| VS Code's built-in terminal | ✅ | Same as the above — it just runs PowerShell or cmd inside VS Code |
| macOS / Linux terminal | ✅ | Shown as `bash` where syntax differs |

VS Code is only useful for **editing** files (for example the config in step 6). The Databricks VS Code extension is **not required**.

---

## 2. What to install on the laptop

| Tool | Needed for | Version used to build this | Required? |
|---|---|---|---|
| **Git** | Downloading the project from GitHub | 2.55 | Yes (or download the ZIP from GitHub instead) |
| **Python** | Running the deploy script | 3.12.10 (3.10 or newer works) | **Yes** |
| Python packages `pandas`, `openpyxl`, `psycopg2-binary`, `requests` | Reading the Excel file, talking to Lakebase | from `deploy/requirements.txt` | **Yes** |
| **Databricks CLI** | Every call to the workspace | **v1.18.0** | **Yes**. It must be a recent version: the script uses the `genie` and `postgres` command groups, which older CLIs don't have |
| Node.js | Only for running the app **on your laptop** for development | 24.19 (22 or newer works) | **No** for deploying. Databricks builds the app itself |
| Databricks **SDK for Python** (`databricks-sdk`) | — | — | **No.** Not used; the CLI does everything |
| VS Code | Editing files | any | No |

> **About "the Databricks SDK".** The app itself uses the Databricks JavaScript SDK (through `@databricks/appkit`). You don't install it: Databricks runs `npm install` on its side when the app is deployed. The deploy script needs only the **Databricks CLI**.

### 2.1 Install Git

- **Windows:** download from https://git-scm.com/download/win, or `winget install Git.Git`
- **macOS:** `xcode-select --install` (or `brew install git`)

Check it: `git --version`

### 2.2 Install Python

- **Windows:** https://www.python.org/downloads/ (tick **"Add python.exe to PATH"** in the installer), or `winget install Python.Python.3.12`
- **macOS:** `brew install python@3.12`

Check it: `python --version` (on macOS/Linux you may need `python3`)

### 2.3 Install the Databricks CLI

- **Windows:** `winget install Databricks.DatabricksCLI`
- **macOS:** `brew tap databricks/tap` then `brew install databricks`
- **Linux / macOS without Homebrew:** `curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh`

**Close and reopen the terminal** after installing so it picks up the new `PATH`, then check:

```
databricks --version
```

It should print `Databricks CLI v1.18.0` or newer.

> **Only have the CLI that came with the VS Code extension?** That's fine. Find its path and point the script at it: `set DATABRICKS_CLI_PATH=C:\path\to\databricks.exe` (cmd), `$env:DATABRICKS_CLI_PATH="C:\path\to\databricks.exe"` (PowerShell), or `export DATABRICKS_CLI_PATH=/path/to/databricks` (bash).

---

## 3. What the Databricks workspace must have

Check these with your workspace admin **before** the first run. The script stops with the platform's own error message at the first missing permission, so you won't break anything, but it saves time to know up front.

| Feature | Why | How to check |
|---|---|---|
| **Unity Catalog** | All tables and views | Left sidebar → **Catalog** shows your catalogs |
| A **SQL warehouse**, Serverless or Pro | Runs all SQL; Genie requires Serverless or Pro | Sidebar → **SQL Warehouses** |
| **Genie** | The natural-language space | Sidebar → **Genie** |
| **Genie Agent mode** | The app's "Agent" button | Open any Genie space; the question box has an **Agent** option. If it's missing, Chat mode still works but Agent questions will fail |
| **Databricks Apps** | Hosts the web app | Sidebar → **Compute → Apps** tab |
| **Lakebase Postgres** | Chat history, sessions, usage log | Sidebar → **Compute → Lakebase / Database** (or ask the admin whether Lakebase is enabled) |
| *(optional)* A chat model endpoint, e.g. `databricks-meta-llama-3-3-70b-instruct` | Names chat sessions automatically | Sidebar → **Serving**. If missing, sessions are named from the question text instead |

**Permissions you need** (a workspace admin has all of them):

- `USE CATALOG` and `CREATE SCHEMA` on the target catalog (or `CREATE CATALOG` if you set `create_catalog: true`)
- `CAN_USE` on the SQL warehouse
- Permission to create Genie spaces, Databricks Apps and Lakebase projects
- `CAN_MANAGE` on the Lakebase project the script creates (you get this automatically as its creator)

**Network (important on corporate laptops):** the script connects to Lakebase over **PostgreSQL port 5432** at `*.database.<region>.cloud.databricks.com`. Some corporate networks and VPNs block outbound 5432. If the `lakebase` step times out, see [Troubleshooting](#10-troubleshooting).

---

## 4. Get the code

```
git clone https://github.com/<your-github-user>/lenss-collections.git
cd lenss-collections
```

(Or on GitHub click **Code → Download ZIP**, unzip, and `cd` into the folder.)

**Run every command in this guide from this project root folder**, the one containing `README.md` and `deploy/`.

---

## 5. Install the Python packages

Using a virtual environment is recommended, so this project's packages don't clash with anything else:

| Terminal | Commands |
|---|---|
| cmd | `python -m venv .venv` then `.venv\Scripts\activate.bat` |
| PowerShell | `python -m venv .venv` then `.venv\Scripts\Activate.ps1` |
| bash | `python3 -m venv .venv` then `source .venv/bin/activate` |

If PowerShell says *"running scripts is disabled on this system"*, use Command Prompt for these steps instead (or skip the virtual environment).

Then install:

```
pip install -r deploy/requirements.txt
```

**Check:** `python -c "import pandas, openpyxl, psycopg2, requests; print('ok')"` prints `ok`.

> **Behind a corporate proxy?** `pip install --proxy http://<proxy>:<port> -r deploy/requirements.txt`

---

## 6. Log the CLI in to the workspace

You create a named **profile**, and the config file refers to it by name. Replace the URL with your workspace's address, which is everything up to `.com` in the browser bar.

### Option A — browser login (OAuth), recommended

```
databricks auth login --host https://<your-workspace>.cloud.databricks.com --profile lenss-org
```

A browser window opens. Sign in and approve, then return to the terminal.

### Option B — personal access token (use this if the browser login does nothing)

1. In the workspace: click your avatar (top right) → **Settings → Developer → Access tokens → Generate new token**. Copy it.
2. Run:
   ```
   databricks configure --profile lenss-org
   ```
   Paste the host when asked, then the token.

**Check (both options):**

```
databricks current-user me --profile lenss-org
```

It should print JSON containing your `userName` (email). If it errors, fix this before going further.

---

## 7. Point the config at your workspace

Configs live in `deploy/config/`. There are two:

- `personal.json` — the original Free Edition workspace this was built in. Don't use it for a new workspace.
- `org.json` — a template for an organisation workspace. **Edit this one**, or copy it to a new name such as `deploy/config/myteam.json`.

Open it in any editor (Notepad works):

```json
{
  "profile": "lenss-org",
  "catalog": "cnx_automl_dev",
  "create_catalog": false,
  "schema_prefix": "lenss_collections",
  "warehouse_id": null,
  "warehouse_name": "Starter Warehouse",
  "genie_space_title": "LensS Collections Analytics",
  "lakebase_project": "lenss-collections-app",
  "lakebase_database": "chatapp",
  "app_name": "lenss-collections",
  "readers_group": null
}
```

| Field | What to put | Notes |
|---|---|---|
| `profile` | The profile name from step 6 (`lenss-org`) | `null` means "use `DATABRICKS_HOST` / `DATABRICKS_TOKEN` environment variables instead" |
| `catalog` | An existing catalog you can create schemas in | |
| `create_catalog` | `false` for a shared/org catalog, `true` to have the script create it | Creating catalogs usually needs admin rights |
| `schema_prefix` | Leave as `lenss_collections` | Schemas become `<prefix>_bronze`, `_silver`, `_gold`, `_context`. Change it only to run a second copy side by side |
| `warehouse_id` **or** `warehouse_name` | Which SQL warehouse to use | Find the ID with `databricks warehouses list --profile lenss-org`, or in the UI under **SQL Warehouses → your warehouse → Overview**. If both are `null`, the first warehouse found is used |
| `genie_space_title` | Name of the Genie space | Re-runs find the space by this title, so keep it stable |
| `lakebase_project` | Lakebase project name | lowercase letters, digits, hyphens |
| `lakebase_database` | Leave as `chatapp` | |
| `app_name` | The app's name, which becomes part of its URL | lowercase letters, digits, hyphens; must be unique in the workspace |
| `readers_group` | *(optional)* A workspace group, e.g. `"lenss-users"` | Gets `CAN_USE` on the app and `SELECT` on the gold schema |
| `title_endpoint` | *(optional, not in the file by default)* Chat model endpoint used to name sessions | Default `databricks-meta-llama-3-3-70b-instruct`. Set to `null` to always name sessions from the question |

---

## 8. Deploy — the one command

```
python deploy/deploy.py --config deploy/config/org.json
```

(Use your own file name if you copied the config.)

Output looks like this. Each step prints as it goes:

```
[10:00:01] Authenticated as you@company.com
[10:00:02] Using warehouse Starter Warehouse (abcd1234…)
[10:00:02] === schemas ===          creates the 4 schemas + volume                     ~20 s
[10:00:22] === ingest ===           uploads the workbook, loads all 11 sheets           ~3 min
[10:03:30] === context ===          governance tables                                   ~20 s
[10:03:50] === transform ===        silver, gold config, 2 metric views, 16 views       ~1 min
           Transform done — sanity check: qry_immediate_intervention = 604 accounts (604 expected for the demo pack)
[10:05:00] === genie ===            creates or updates the Genie space                   ~5 s
[10:05:05] === lakebase ===         Postgres project, database, tables                   ~1–2 min the first time
[10:06:30] === app ===              creates the app, grants access, uploads and builds   ~2–5 min the first time
[10:10:00] App live at https://lenss-collections-<id>.<region>.databricksapps.com
[10:10:00] === smoke ===            skipped unless you set up a test identity (step 9.2)
[10:10:00] Done in 600s. App: https://…
```

**Check:** the last line says `Done` and prints the app URL. On failure it prints `FAILED:` with the reason. Fix the cause (see [Troubleshooting](#10-troubleshooting)) and run the same command again.

**Re-running is always safe.** Every step creates things if they are missing and updates them if they exist. Nothing is deleted or duplicated.

### Running only some steps

```
python deploy/deploy.py --config deploy/config/org.json --only app
python deploy/deploy.py --config deploy/config/org.json --only ingest,transform
python deploy/deploy.py --config deploy/config/org.json --skip smoke
```

Steps, in order: `schemas, ingest, context, transform, genie, lakebase, app, smoke`. The `app` step needs `genie` and `lakebase` to have run at least once on this laptop, because it reads their IDs from `deploy/.state/<config-name>.json`. On a new laptop, run the full command once. It re-finds everything that already exists instead of creating duplicates.

---

## 9. After the deploy

### 9.1 Open the app and give people access

1. Open the URL printed at the end. You'll sign in with your normal Databricks login.
2. Give other people access: workspace sidebar → **Compute → Apps → (your app) → Permissions → Add** → the user or group → **Can use**. Setting `readers_group` in the config does this for a whole group on every deploy.
3. People who aren't in the workspace yet must first be added by an admin (**Settings → Identity and access → Users**). For people outside the company this goes through your identity provider (SSO/SCIM). Databricks Apps **cannot** be made public or anonymous; everyone signs in.

Every user gets their own private chat history. The **Monitoring** tab shows usage across all users.

### 9.2 (Optional) Automatic end-to-end test

The `smoke` step asks real questions through the deployed URL as a separate, non-admin identity. That catches permission problems that don't show up when you test as yourself. To enable it once:

1. **Settings → Identity and access → Service principals → Add service principal**, named e.g. `lenss-smoke-test`.
2. Open it → **Secrets → Generate secret**. Copy the **client ID** and the **secret** (the secret is shown only once).
3. On the same page → **Configurations / Entitlements** → tick **Workspace access**. Without this the app answers `401` even with a valid token.
4. The app → **Permissions** → add the service principal with **Can use**.
5. Set the two values in your terminal, then run the smoke step:

| Terminal | Commands |
|---|---|
| cmd | `set LENSS_SMOKE_CLIENT_ID=<client id>` then `set LENSS_SMOKE_CLIENT_SECRET=<secret>` |
| PowerShell | `$env:LENSS_SMOKE_CLIENT_ID="<client id>"` then `$env:LENSS_SMOKE_CLIENT_SECRET="<secret>"` |
| bash | `export LENSS_SMOKE_CLIENT_ID=<client id>` then `export LENSS_SMOKE_CLIENT_SECRET=<secret>` |

```
python deploy/deploy.py --config deploy/config/org.json --only smoke
```

It ends with `17/17 checks passed`. It covers the UI, the dashboard, Chat and Agent questions, the personal-data refusal, charts, session naming, history, rename/delete and monitoring. The Agent questions take 1–2 minutes each.

**Never commit the secret** or paste it into a file in this folder.

### 9.3 Things to try in the app

- **Command Center:** portfolio KPIs, achievement by product, segment table.
- **Chat + Agent:** choose **Chat** under the question box for quick answers (~20 s), or **Agent** for "why / what should we do" analysis (1–3 min). You can switch modes within one conversation. Answers include charts with **Chart / Table / SQL** tabs.
- **Monitoring:** questions, success rate, latency by mode, per-user activity.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Databricks CLI not found` | CLI not installed, or the terminal was opened before installing | Reopen the terminal; or set `DATABRICKS_CLI_PATH` (step 2.3) |
| `unknown command "postgres"` or `"genie"` | CLI too old | Upgrade: `winget upgrade Databricks.DatabricksCLI` / `brew upgrade databricks` |
| `databricks auth login` opens nothing / hangs | Browser OAuth blocked on this machine | Use Option B (token) in step 6 |
| `FAILED: … PERMISSION_DENIED … CREATE SCHEMA` | Missing catalog privileges | Ask an admin for `USE CATALOG` + `CREATE SCHEMA` on the catalog, or point `catalog` at one you own |
| `No matching SQL warehouse found` | `warehouse_name` doesn't match exactly | Use `warehouse_id` from `databricks warehouses list --profile <p>` |
| `Workbook not found` | Running from the wrong folder, or the xlsx was not downloaded | `cd` to the project root; check `all_details_and _data/LensS_Collections_Demo_Development_Pack.xlsx` exists |
| `No Postgres role for <you>` | You don't manage the Lakebase project (someone else created it) | Ask its owner for `CAN_MANAGE`, or set a different `lakebase_project` name |
| `lakebase` step hangs, or `could not connect to server … 5432` | Corporate network/VPN blocks PostgreSQL port 5432 | Try off VPN or another network, or ask IT to allow outbound 5432 to `*.cloud.databricks.com`. Every other step works without it: run `--skip lakebase` for the rest, then run `--only lakebase,app` from a network that allows 5432 |
| `App deployment did not succeed` | Build or start failure on the Databricks side | Workspace → **Apps → (your app) → Logs** shows the npm/Node error |
| App opens but Agent answers "Sorry — that question couldn't be answered" | Agent mode not enabled in this workspace, or the app lost its grants | Check that Agent mode exists in Genie (section 3); re-run `--only app`, which re-applies the grants |
| Smoke test: `401` for the service principal | Missing **Workspace access** entitlement | Section 9.2, step 3 |
| Sessions are named after the question instead of a short title | No `title_endpoint` model in this workspace | Expected; set `title_endpoint` to a chat model that exists (sidebar → **Serving**) |
| Warehouse takes minutes on the first command | Warehouse was stopped; the script starts it | Wait. Serverless starts in seconds, Pro in a few minutes |

---

## 11. Updating later

| You changed… | Run |
|---|---|
| Pulled new code from GitHub (`git pull`) | `python deploy/deploy.py --config deploy/config/org.json` (or `--only app` if only the app changed) |
| The app (`appkit-genie-app/`) | `--only app` |
| Genie instructions / examples / benchmarks (`deploy/genie/space.py`) | `--only genie` |
| The workbook (new data, same sheets) | `--only ingest,transform` |
| Any SQL in `deploy/sql/` | `--only context,transform` |

Deploying to **another workspace** is the same procedure: a new CLI profile (step 6), a new config file (step 7), and run it. Each config keeps its own IDs in `deploy/.state/<config-name>.json`, which stays on your laptop and is not committed.

---

## 12. (Optional) Run the app on your laptop for development

Only needed to change the app and see the result before deploying. It needs **Node.js 22+** and a completed deploy (it uses the same Genie space, warehouse and Lakebase).

```
cd appkit-genie-app
npm install
```

Set these environment variables, using values from `appkit-genie-app/app.yaml` (written by the last deploy) and your profile. `DATABRICKS_CONFIG_PROFILE=lenss-org` works in place of host + token:

```
DATABRICKS_HOST, DATABRICKS_TOKEN (or DATABRICKS_CONFIG_PROFILE)
DATABRICKS_GENIE_SPACE_ID, DATABRICKS_WAREHOUSE_ID, LENSS_GOLD_SCHEMA
PGHOST, PGDATABASE=chatapp, PGPORT=5432, PGSSLMODE=require, LAKEBASE_ENDPOINT
DATABRICKS_APP_PORT=8000
```

Then:

- **bash / Git Bash / macOS:** `npm run dev`
- **Windows cmd / PowerShell:** `npm run dev` uses Unix-style `NODE_ENV=…` syntax that Windows shells don't understand. Set `NODE_ENV=development` yourself, then run `npx tsx watch --tsconfig ./tsconfig.server.json ./server/server.ts`

Open http://localhost:8000. Locally you're signed in as `local-dev@localhost`.

---

## 13. Where things are

See [README.md](README.md) for the repository layout, and [DATABRICKS_IMPLEMENTATION_GUIDE.md](DATABRICKS_IMPLEMENTATION_GUIDE.md) for the design decisions and every gotcha found while building this.
