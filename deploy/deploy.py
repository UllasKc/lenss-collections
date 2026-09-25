#!/usr/bin/env python3
"""One-command deploy of LensS Collections into a Databricks workspace.

    python deploy/deploy.py --config deploy/config/org.json

Creates/updates, idempotently and in order:
  schemas    catalog (optional) + bronze/silver/gold/context schemas + raw_files volume
  ingest     uploads the workbook, lands all 11 sheets as bronze/context tables
  context    governance tables that only exist in the Word docs
  transform  silver typed tables, gold config, 2 metric views, 16 certified views
  genie      Genie space: 19 sources, instructions, examples, benchmarks
  lakebase   Postgres project/database + chat-history/usage schema
  app        Databricks App (create/update, bind resources, grants, deploy)
  smoke      end-to-end test of the deployed URL (needs LENSS_SMOKE_CLIENT_ID/SECRET)

Run a subset with --only ingest,transform or --skip smoke. Everything goes
through the `databricks` CLI, so it uses whatever auth the CLI profile has
(the VS Code extension's OAuth login, or DATABRICKS_HOST/DATABRICKS_TOKEN).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEPLOY_DIR = Path(__file__).resolve().parent
REPO_DIR = DEPLOY_DIR.parent
STEPS = ["schemas", "ingest", "context", "transform", "genie", "lakebase", "app", "smoke"]

SHEETS = {  # sheet name -> (layer, table)
    "Fact_Collections_Snapshot": ("bronze", "fact_collections_snapshot"),
    "Dim_Collector": ("bronze", "dim_collector"),
    "Fact_Targets": ("bronze", "fact_targets"),
    "Metric_Catalog": ("context", "metric_catalog"),
    "Business_Rules": ("context", "business_rules"),
    "Synonym_Catalog": ("context", "synonym_catalog"),
    "Query_Catalog": ("context", "query_catalog"),
    "Data_Dictionary": ("context", "data_dictionary"),
    "Model_Requirements": ("context", "model_requirements"),
    "Acceptance_Tests": ("context", "acceptance_tests"),
    "README": ("context", "readme"),
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


class DeployError(RuntimeError):
    pass


# --------------------------------------------------------------------------- CLI

class Databricks:
    def __init__(self, profile: str | None):
        exe = os.environ.get("DATABRICKS_CLI_PATH") or shutil.which("databricks")
        if not exe:
            raise DeployError(
                "Databricks CLI not found. Install it (winget install Databricks.DatabricksCLI, "
                "or brew install databricks) or set DATABRICKS_CLI_PATH."
            )
        self.exe = exe
        self.profile = profile

    def run(self, *args: str, json_body: dict | None = None, check: bool = True, output_json: bool = True):
        cmd = [self.exe, *args]
        if self.profile:
            cmd += ["--profile", self.profile]
        tmp = None
        if json_body is not None:
            tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
            json.dump(json_body, tmp)
            tmp.close()
            cmd += ["--json", f"@{tmp.name}"]
        if output_json:
            cmd += ["-o", "json"]
        try:
            # cwd=REPO_DIR: never run inside the app folder, whose AppKit-generated
            # databricks.yml would otherwise hijack the target host.
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=REPO_DIR)
        finally:
            if tmp:
                os.unlink(tmp.name)
        if proc.returncode != 0:
            if check:
                raise DeployError(f"`databricks {' '.join(args)}` failed:\n{proc.stderr.strip() or proc.stdout.strip()}")
            return None
        out = proc.stdout.strip()
        if not output_json:
            return out
        if not out:
            return {}
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            return out


# --------------------------------------------------------------------------- SQL

def split_sql(text: str) -> list[str]:
    """Splits on ';' outside $$...$$ blocks and single-quoted strings; drops -- comment lines."""
    lines = [ln for ln in text.splitlines() if not ln.strip().startswith("--")]
    text = "\n".join(lines)
    out, buf, i, in_dollar, in_quote = [], [], 0, False, False
    while i < len(text):
        if not in_quote and text.startswith("$$", i):
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = text[i]
        if not in_dollar and ch == "'":
            if in_quote and text.startswith("''", i):
                buf.append("''")
                i += 2
                continue
            in_quote = not in_quote
        if ch == ";" and not in_dollar and not in_quote:
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


class Sql:
    def __init__(self, db: Databricks, warehouse_id: str):
        self.db, self.warehouse_id = db, warehouse_id

    def execute(self, statement: str) -> list[list]:
        resp = self.db.run(
            "api", "post", "/api/2.0/sql/statements",
            json_body={"statement": statement, "warehouse_id": self.warehouse_id, "wait_timeout": "50s"},
        )
        while resp["status"]["state"] in ("PENDING", "RUNNING"):
            time.sleep(2)
            resp = self.db.run("api", "get", f"/api/2.0/sql/statements/{resp['statement_id']}")
        if resp["status"]["state"] != "SUCCEEDED":
            msg = resp["status"].get("error", {}).get("message", resp["status"]["state"])
            raise DeployError(f"SQL failed: {msg}\n--- statement ---\n{statement[:600]}")
        return resp.get("result", {}).get("data_array", []) or []

    def run_file(self, path: Path, cfg: dict) -> None:
        text = path.read_text(encoding="utf-8")
        text = text.replace("{{catalog}}", cfg["catalog"]).replace("{{prefix}}", cfg["schema_prefix"])
        stmts = split_sql(text)
        for n, stmt in enumerate(stmts, 1):
            first = " ".join(stmt.split())[:90]
            log(f"  {path.name} [{n}/{len(stmts)}] {first}")
            self.execute(stmt)


# --------------------------------------------------------------------------- helpers

def ident(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise DeployError(f"Unsafe identifier in config: {name!r}")
    return name


def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    defaults = {
        "profile": None,
        "create_catalog": False,
        "schema_prefix": "lenss_collections",
        "warehouse_id": None,
        "warehouse_name": None,
        "xlsx_path": "all_details_and _data/LensS_Collections_Demo_Development_Pack.xlsx",
        "genie_space_title": "LensS Collections Analytics",
        "genie_space_id": None,
        "lakebase_project": "lenss-collections-app",
        "lakebase_database": "chatapp",
        "app_name": "lenss-collections",
        "app_dir": "appkit-genie-app",
        "app_workspace_path": None,
        "readers_group": None,
        # Chat model that names chat sessions; skipped if the endpoint doesn't exist.
        "title_endpoint": "databricks-meta-llama-3-3-70b-instruct",
    }
    for k, v in defaults.items():
        cfg.setdefault(k, v)
    for key in ("catalog", "schema_prefix"):
        ident(cfg[key])
    return cfg


def state_path(cfg_path: Path) -> Path:
    return DEPLOY_DIR / ".state" / f"{cfg_path.stem}.json"


def load_state(cfg_path: Path) -> dict:
    p = state_path(cfg_path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_state(cfg_path: Path, state: dict) -> None:
    p = state_path(cfg_path)
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(state, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- steps

def step_preflight(db: Databricks, cfg: dict, state: dict) -> None:
    me = db.run("current-user", "me")
    state["user"] = me["userName"]
    log(f"Authenticated as {state['user']}")

    wh_id = cfg["warehouse_id"]
    if not wh_id:
        whs = db.run("warehouses", "list")
        whs = whs if isinstance(whs, list) else whs.get("warehouses", [])
        if cfg["warehouse_name"]:
            whs = [w for w in whs if w["name"] == cfg["warehouse_name"]]
        if not whs:
            raise DeployError("No matching SQL warehouse found — set warehouse_id or warehouse_name in the config.")
        wh_id = whs[0]["id"]
    state["warehouse_id"] = wh_id
    wh = db.run("warehouses", "get", wh_id)
    if wh.get("state") != "RUNNING":
        log(f"Starting warehouse {wh['name']} ({wh_id})…")
        db.run("warehouses", "start", wh_id)
    log(f"Using warehouse {wh['name']} ({wh_id})")


def step_schemas(sql: Sql, cfg: dict) -> None:
    c, p = cfg["catalog"], cfg["schema_prefix"]
    if cfg["create_catalog"]:
        sql.execute(f"CREATE CATALOG IF NOT EXISTS {c}")
    for layer in ("bronze", "silver", "gold", "context"):
        sql.execute(f"CREATE SCHEMA IF NOT EXISTS {c}.{p}_{layer}")
    sql.execute(f"CREATE VOLUME IF NOT EXISTS {c}.{p}_bronze.raw_files")
    log(f"Schemas {c}.{p}_{{bronze,silver,gold,context}} and volume raw_files ready")


def step_ingest(db: Databricks, sql: Sql, cfg: dict) -> None:
    import pandas as pd  # imported lazily so other steps don't need pandas

    c, p = cfg["catalog"], cfg["schema_prefix"]
    xlsx = (REPO_DIR / cfg["xlsx_path"]).resolve()
    if not xlsx.exists():
        raise DeployError(f"Workbook not found: {xlsx}")
    volume = f"/Volumes/{c}/{p}_bronze/raw_files"
    log(f"Reading {xlsx.name}")
    sheets = pd.read_excel(xlsx, sheet_name=None)
    missing = set(SHEETS) - set(sheets)
    if missing:
        raise DeployError(f"Workbook is missing sheets: {sorted(missing)}")

    db.run("fs", "cp", str(xlsx), f"dbfs:{volume}/{xlsx.name}", "--overwrite", output_json=False)
    with tempfile.TemporaryDirectory() as tmp:
        for sheet, (layer, table) in SHEETS.items():
            df = sheets[sheet].copy()
            for col in df.columns:
                if pd.api.types.is_datetime64_any_dtype(df[col]):
                    df[col] = df[col].dt.strftime("%Y-%m-%d")
                elif df[col].dtype == "object":
                    # e.g. README's Detail column mixes strings with a real date
                    df[col] = df[col].map(lambda x: None if pd.isna(x) else str(x))
            csv = Path(tmp) / f"{sheet}.csv"
            df.to_csv(csv, index=False)
            db.run("fs", "cp", str(csv), f"dbfs:{volume}/{sheet}.csv", "--overwrite", output_json=False)

            src = (f"read_files('{volume}/{sheet}.csv', format => 'csv', header => true, "
                   f"inferSchema => true, multiLine => true, escape => '\"')")
            cols = [r[0] for r in sql.execute(f"DESCRIBE QUERY SELECT * FROM {src}") if r[0] != "_rescued_data"]
            col_list = ", ".join(f"`{col}`" for col in cols)
            sql.execute(f"CREATE OR REPLACE TABLE {c}.{p}_{layer}.{table} AS SELECT {col_list} FROM {src}")
            count = sql.execute(f"SELECT COUNT(*) FROM {c}.{p}_{layer}.{table}")[0][0]
            if int(count) != len(df):
                raise DeployError(f"{table}: expected {len(df)} rows, loaded {count}")
            log(f"  {sheet} -> {p}_{layer}.{table} ({count} rows)")


def step_context(sql: Sql, cfg: dict) -> None:
    sql.run_file(DEPLOY_DIR / "sql" / "20_context_manual.sql", cfg)


def step_transform(sql: Sql, cfg: dict) -> None:
    for name in ("30_silver.sql", "40_gold_config.sql", "50_metric_views.sql", "60_certified_views.sql"):
        sql.run_file(DEPLOY_DIR / "sql" / name, cfg)
    c, p = cfg["catalog"], cfg["schema_prefix"]
    n = sql.execute(f"SELECT COUNT(*) FROM {c}.{p}_gold.qry_immediate_intervention")[0][0]
    log(f"Transform done — sanity check: qry_immediate_intervention = {n} accounts (604 expected for the demo pack)")


def step_genie(db: Databricks, cfg: dict, state: dict, cfg_path: Path) -> None:
    sys.path.insert(0, str(DEPLOY_DIR / "genie"))
    from space import build_serialized_space  # noqa: E402

    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    serialized = json.dumps(build_serialized_space(gold))
    title = cfg["genie_space_title"]
    space_id = state.get("genie_space_id") or cfg["genie_space_id"]

    if not space_id:
        token = None
        while True:
            args = ["genie", "list-spaces"] + (["--page-token", token] if token else [])
            page = db.run(*args)
            for s in page.get("spaces", []):
                if s.get("title") == title:
                    space_id = s["space_id"]
            token = page.get("next_page_token")
            if space_id or not token:
                break

    if space_id and db.run("genie", "get-space", space_id, check=False) is None:
        log(f"Genie space {space_id} no longer exists — creating a new one")
        space_id = None

    body = {
        "serialized_space": serialized,
        "title": title,
        "description": "Collections Performance & Forecasting and Policy & Strategy Effectiveness (LensS).",
        "warehouse_id": state["warehouse_id"],
    }
    if space_id:
        db.run("genie", "update-space", space_id, json_body=body)
        log(f"Updated Genie space {space_id}")
    else:
        created = db.run("api", "post", "/api/2.0/genie/spaces",
                         json_body={**body, "parent_path": f"/Users/{state['user']}"})
        space_id = created["space_id"]
        log(f"Created Genie space {space_id} ({created.get('title')})")
    state["genie_space_id"] = space_id
    save_state(cfg_path, state)


def pg_connect(db: Databricks, state: dict, database: str):
    import psycopg2  # noqa: E402

    cred = db.run("postgres", "generate-database-credential", state["lakebase_endpoint"])
    return psycopg2.connect(
        host=state["lakebase_host"], port=5432, dbname=database,
        user=state["user"], password=cred["token"], sslmode="require",
    )


def step_lakebase(db: Databricks, cfg: dict, state: dict, cfg_path: Path) -> None:
    project = f"projects/{cfg['lakebase_project']}"
    proj = db.run("postgres", "get-project", project, check=False)
    if proj is None:
        log(f"Creating Lakebase project {cfg['lakebase_project']} (takes a minute)…")
        proj = db.run("postgres", "create-project", cfg["lakebase_project"])
    branch = proj["status"]["default_branch"]

    endpoints = db.run("postgres", "list-endpoints", branch)
    endpoints = endpoints if isinstance(endpoints, list) else endpoints.get("endpoints", [])
    rw = [e for e in endpoints if e["status"].get("endpoint_type") == "ENDPOINT_TYPE_READ_WRITE"]
    if not rw:
        raise DeployError(f"No read-write endpoint on {branch}")
    # The pooled "-pooler" host rejects OAuth/SASL logins; always use the direct host.
    state["lakebase_host"] = rw[0]["status"]["hosts"]["host"]
    state["lakebase_endpoint"] = rw[0]["name"]

    roles = db.run("postgres", "list-roles", branch)
    roles = roles if isinstance(roles, list) else roles.get("roles", [])
    mine = [r for r in roles if r["status"].get("postgres_role") == state["user"]]
    if not mine:
        raise DeployError(f"No Postgres role for {state['user']} on {branch} — you need CAN_MANAGE on the project.")

    dbs = db.run("postgres", "list-databases", branch)
    dbs = dbs if isinstance(dbs, list) else dbs.get("databases", [])
    if not any(d["status"].get("postgres_database") == cfg["lakebase_database"] for d in dbs):
        db.run("postgres", "create-database", branch, "--database-id", cfg["lakebase_database"],
               json_body={"spec": {"role": mine[0]["name"], "postgres_database": cfg["lakebase_database"]}})
        log(f"Created database {cfg['lakebase_database']}")

    conn = pg_connect(db, state, cfg["lakebase_database"])
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute((DEPLOY_DIR / "lakebase" / "schema.sql").read_text(encoding="utf-8"))
    conn.close()
    state["lakebase_branch"] = branch
    save_state(cfg_path, state)
    log(f"Lakebase ready: {state['lakebase_host']} / {cfg['lakebase_database']}")


def write_app_yaml(app_dir: Path, cfg: dict, state: dict) -> None:
    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    (app_dir / "app.yaml").write_text(
        "# Generated by deploy/deploy.py — edit the config, not this file.\n"
        "command: ['npm', 'run', 'start']\n"
        "env:\n"
        "  - name: DATABRICKS_GENIE_SPACE_ID\n    valueFrom: genie-space\n"
        "  - name: DATABRICKS_WAREHOUSE_ID\n    valueFrom: sql-warehouse\n"
        f"  - name: LENSS_GOLD_SCHEMA\n    value: {gold}\n"
        "  # Direct endpoint host, not the '-pooler' one (it rejects OAuth logins).\n"
        f"  - name: PGHOST\n    value: {state['lakebase_host']}\n"
        f"  - name: PGDATABASE\n    value: {cfg['lakebase_database']}\n"
        "  - name: PGPORT\n    value: '5432'\n"
        "  - name: PGSSLMODE\n    value: require\n"
        f"  - name: LAKEBASE_ENDPOINT\n    value: {state['lakebase_endpoint']}\n"
        + ("  - name: LENSS_TITLE_ENDPOINT\n    valueFrom: title-model\n" if state.get("title_endpoint") else ""),
        encoding="utf-8",
    )


def step_app(db: Databricks, sql: Sql, cfg: dict, state: dict, cfg_path: Path) -> None:
    name = cfg["app_name"]
    app_dir = (REPO_DIR / cfg["app_dir"]).resolve()
    ws_path = cfg["app_workspace_path"] or f"/Workspace/Users/{state['user']}/apps/{name}"
    space = db.run("genie", "get-space", state["genie_space_id"])
    spec = {
        "description": "LensS Collections Intelligence — Genie chat + agent mode, command center, monitoring.",
        "user_api_scopes": ["dashboards.genie"],
        "resources": [
            {"name": "genie-space", "description": "Genie space for natural-language questions",
             "genie_space": {"name": space["title"], "space_id": state["genie_space_id"], "permission": "CAN_RUN"}},
            {"name": "sql-warehouse", "description": "Warehouse for dashboard queries",
             "sql_warehouse": {"id": state["warehouse_id"], "permission": "CAN_USE"}},
        ],
    }
    # Optional model that names chat sessions (the app falls back to the question text).
    state["title_endpoint"] = None
    if cfg["title_endpoint"]:
        if db.run("serving-endpoints", "get", cfg["title_endpoint"], check=False) is not None:
            state["title_endpoint"] = cfg["title_endpoint"]
            spec["resources"].append(
                {"name": "title-model", "description": "Chat model that names chat sessions",
                 "serving_endpoint": {"name": cfg["title_endpoint"], "permission": "CAN_QUERY"}})
        else:
            log(f"Serving endpoint {cfg['title_endpoint']} not found — sessions will be named from the question text")
    # `apps update` replaces the fields it is sent, so always send the full spec.
    if db.run("apps", "get", name, check=False) is None:
        log(f"Creating app {name} (starts compute; a few minutes)…")
        app = db.run("apps", "create", name, json_body=spec)
    else:
        app = db.run("apps", "update", name, json_body=spec)
    sp = app["service_principal_client_id"]
    state["app_url"] = app.get("url")
    log(f"App {name}, service principal {sp}")

    # Unity Catalog: the app (and Genie, which runs SQL as the app) reads gold.
    c, p = cfg["catalog"], cfg["schema_prefix"]
    grantees = [f"`{sp}`"] + ([f"`{cfg['readers_group']}`"] if cfg["readers_group"] else [])
    for g in grantees:
        sql.execute(f"GRANT USE CATALOG ON CATALOG {c} TO {g}")
        sql.execute(f"GRANT USE SCHEMA ON SCHEMA {c}.{p}_gold TO {g}")
        sql.execute(f"GRANT SELECT ON SCHEMA {c}.{p}_gold TO {g}")
    log("Granted USE CATALOG / USE SCHEMA / SELECT on gold to the app" + (" and readers group" if cfg["readers_group"] else ""))

    # Lakebase: a Postgres role for the app's service principal, then table grants.
    branch = state["lakebase_branch"]
    roles = db.run("postgres", "list-roles", branch)
    roles = roles if isinstance(roles, list) else roles.get("roles", [])
    if not any(r["status"].get("postgres_role") == sp for r in roles):
        role_id = re.sub(r"[^a-z0-9-]", "-", f"app-{name}".lower())[:63].strip("-")
        db.run("postgres", "create-role", branch, "--role-id", role_id, json_body={"spec": {
            "identity_type": "SERVICE_PRINCIPAL", "postgres_role": sp, "auth_method": "LAKEBASE_OAUTH_V1"}})
    conn = pg_connect(db, state, cfg["lakebase_database"])
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'GRANT USAGE ON SCHEMA chatapp TO "{sp}"')
        cur.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA chatapp TO "{sp}"')
        cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA chatapp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{sp}"')
    conn.close()
    log("Granted the app's Postgres role access to chatapp.*")

    if cfg["readers_group"]:
        db.run("apps", "update-permissions", name, json_body={"access_control_list": [
            {"group_name": cfg["readers_group"], "permission_level": "CAN_USE"}]})
        log(f"Granted CAN_USE on the app to {cfg['readers_group']}")

    write_app_yaml(app_dir, cfg, state)
    log(f"Syncing {app_dir.name} -> {ws_path}")
    db.run("sync", str(app_dir), ws_path, "--full",
           "--exclude", "node_modules/**", "--exclude", "dist/**", "--exclude", ".git/**", output_json=False)
    log("Deploying (the platform runs npm install + build)…")
    dep = db.run("apps", "deploy", name, "--source-code-path", ws_path)
    status = dep.get("status", {})
    if status.get("state") != "SUCCEEDED":
        raise DeployError(f"App deployment did not succeed: {status}")
    save_state(cfg_path, state)
    log(f"App live at {state['app_url']}")


def step_smoke(cfg: dict, state: dict, db: Databricks) -> None:
    if not (os.environ.get("LENSS_SMOKE_CLIENT_ID") and os.environ.get("LENSS_SMOKE_CLIENT_SECRET")):
        log("Skipping smoke test (set LENSS_SMOKE_CLIENT_ID / LENSS_SMOKE_CLIENT_SECRET — see README)")
        return
    host = db.run("auth", "describe", check=False) or {}
    host = (host.get("details", {}) or {}).get("host") or os.environ.get("DATABRICKS_HOST")
    if not host:
        raise DeployError("Could not determine workspace host for the smoke test; set DATABRICKS_HOST.")
    rc = subprocess.run([sys.executable, str(DEPLOY_DIR / "smoke_test.py"), "--host", host,
                         "--app-url", state["app_url"]]).returncode
    if rc != 0:
        raise DeployError("Smoke test failed — see output above.")


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True, help="Path to a config JSON, e.g. deploy/config/org.json")
    ap.add_argument("--only", help=f"Comma-separated steps to run: {','.join(STEPS)}")
    ap.add_argument("--skip", help="Comma-separated steps to skip")
    args = ap.parse_args()

    cfg_path = Path(args.config).resolve()
    cfg = load_config(cfg_path)
    steps = args.only.split(",") if args.only else list(STEPS)
    if args.skip:
        steps = [s for s in steps if s not in args.skip.split(",")]
    unknown = set(steps) - set(STEPS)
    if unknown:
        sys.exit(f"Unknown steps: {sorted(unknown)}")

    db = Databricks(cfg["profile"])
    state = load_state(cfg_path)
    started = time.time()
    try:
        step_preflight(db, cfg, state)
        sql = Sql(db, state["warehouse_id"])
        for step in STEPS:
            if step not in steps:
                continue
            log(f"=== {step} ===")
            if step == "schemas":
                step_schemas(sql, cfg)
            elif step == "ingest":
                step_ingest(db, sql, cfg)
            elif step == "context":
                step_context(sql, cfg)
            elif step == "transform":
                step_transform(sql, cfg)
            elif step == "genie":
                step_genie(db, cfg, state, cfg_path)
            elif step == "lakebase":
                step_lakebase(db, cfg, state, cfg_path)
            elif step == "app":
                for needed in ("genie_space_id", "lakebase_host"):
                    if needed not in state:
                        raise DeployError(f"'app' needs '{needed}' — run the genie and lakebase steps first.")
                step_app(db, sql, cfg, state, cfg_path)
            elif step == "smoke":
                if "app_url" not in state:
                    raise DeployError("'smoke' needs a deployed app — run the app step first.")
                step_smoke(cfg, state, db)
        save_state(cfg_path, state)
    except DeployError as e:
        log(f"FAILED: {e}")
        sys.exit(1)
    log(f"Done in {int(time.time() - started)}s. App: {state.get('app_url', '(not deployed)')}")


if __name__ == "__main__":
    main()
