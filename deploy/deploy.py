#!/usr/bin/env python3
"""One-command deploy of LensS Collections into a Databricks workspace.

    python deploy/deploy.py --config deploy/config/org.json

Creates/updates, idempotently and in order:
  schemas    catalog (optional) + bronze/silver/gold/context schemas + raw_files volume
  ingest     uploads the workbook, lands all 11 sheets as bronze/context tables
  context    governance tables that only exist in the Word docs
  transform  silver typed tables, gold config, 2 metric views, 16 certified views
  summary    writes the Command Center's executive summary to gold.exec_summary (no LLM)
  genie     Genie space: 19 sources, instructions, examples, benchmarks
  lakebase   Postgres project/database + chat-history/usage schema
  app        Databricks App (create/update, bind resources, grants, deploy)
  smoke      end-to-end test of the deployed URL (needs LENSS_SMOKE_CLIENT_ID/SECRET)

Run a subset with --only ingest,transform or --skip smoke. Everything goes
through the `databricks` CLI, so it uses whatever auth the CLI profile has
(the VS Code extension's OAuth login, or DATABRICKS_HOST/DATABRICKS_TOKEN).
"""
from __future__ import annotations

import argparse
import hashlib
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
STEPS = ["schemas", "ingest", "context", "transform", "summary", "genie", "lakebase", "app", "smoke"]

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
        # Optional chat model that names chat sessions, e.g. "databricks-meta-llama-3-3-70b-instruct".
        # Off by default: sessions are named from the first question.
        "title_endpoint": None,
        # Answer cache (DATABRICKS_IMPLEMENTATION_GUIDE.md, Step 8e): reuse answers to standalone
        # questions until the data or Genie changes, and pre-warm the 10 suggested questions.
        "answer_cache": True,
        "prewarm_suggestions": True,
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


def money(v) -> str:
    v = float(v or 0)
    return f"${v / 1e6:.1f}M" if abs(v) >= 1e6 else f"${v / 1e3:.0f}K" if abs(v) >= 1e3 else f"${v:,.0f}"


def pct(v) -> str:
    return f"{float(v or 0) * 100:.1f}%"


def build_exec_summary(sql: Sql, gold: str) -> tuple[str, str]:
    """The Command Center's executive summary, written from the certified views.

    Deterministic on purpose: every number is read straight from gold, so the
    text can't drift from the dashboard, and it only changes when this step
    re-runs (after new data), not on every page load.
    """
    (snapshot,) = sql.execute(f"SELECT CAST(MAX(Snapshot_Date) AS STRING) FROM {gold}.qry_month_end_forecast")[0]
    collected, target, below, segments = sql.execute(
        f"SELECT SUM(MTD_Collections), SUM(Monthly_Target), COUNT_IF(MTD_Collections < Monthly_Target), COUNT(*) "
        f"FROM {gold}.qry_mtd_vs_target")[0]
    products = sql.execute(
        f"SELECT Product, SUM(MTD_Collections)/SUM(Monthly_Target), SUM(Monthly_Target)-SUM(MTD_Collections) "
        f"FROM {gold}.qry_mtd_vs_target GROUP BY Product ORDER BY 2")
    worst_seg = sql.execute(
        f"SELECT Product, DPD_Bucket, Target_Gap, Target_Achievement_Pct FROM {gold}.qry_mtd_vs_target "
        f"ORDER BY Target_Gap DESC LIMIT 1")[0]
    worst_bucket = sql.execute(
        f"SELECT DPD_Bucket, SUM(Monthly_Target)-SUM(MTD_Collections) FROM {gold}.qry_mtd_vs_target "
        f"GROUP BY DPD_Bucket ORDER BY 2 DESC LIMIT 1")[0]
    dpd_order = ["1-30", "31-60", "61-90", "91-180", "180+"]
    recovery = sorted(
        sql.execute(f"SELECT DPD_Bucket, SUM(Recovery_MTD)/SUM(Outstanding_Balance) FROM {gold}.qry_kpi_drivers "
                    f"GROUP BY DPD_Bucket"),
        key=lambda r: dpd_order.index(r[0]) if r[0] in dpd_order else len(dpd_order))
    accounts, opportunity = sql.execute(
        f"SELECT COUNT(*), SUM(Incremental_Recovery_Opportunity) FROM {gold}.qry_immediate_intervention")[0]
    (over_contact,) = sql.execute(f"SELECT COUNT(*) FROM {gold}.qry_over_contact_risk")[0]

    gap = float(target) - float(collected)
    month = time.strftime("%B %Y", time.strptime(snapshot[:7], "%Y-%m"))
    day = int(snapshot[8:10])
    worst_p, best_p = products[0], products[-1]
    below_txt = f"all {segments}" if int(below) == int(segments) else f"{below} of {segments}"
    parts = [
        f"As of {day} {month.split()[0]}, collections stand at {money(collected)} against a {money(target)} target "
        f"for {month}: {pct(float(collected) / float(target))} achieved, {money(gap)} short, "
        f"with {below_txt} product and delinquency segments below target.",
        f"{worst_p[0]} is furthest behind at {pct(worst_p[1])} of target ({money(worst_p[2])} short), "
        f"while {best_p[0]} leads at {pct(best_p[1])}.",
        f"The single largest gap is {worst_seg[0]} at {worst_seg[1]} days past due ({money(worst_seg[2])} short, "
        f"{pct(worst_seg[3])} of target), and the {worst_bucket[0]} bucket carries the most shortfall overall "
        f"({money(worst_bucket[1])}).",
    ]
    if len(recovery) > 1 and float(recovery[0][1]) > float(recovery[-1][1]):
        parts.append(
            f"Balance recovery falls with delinquency, from {pct(recovery[0][1])} of outstanding balance in the "
            f"{recovery[0][0]} bucket to {pct(recovery[-1][1])} in {recovery[-1][0]}, so early-stage accounts "
            f"are where effort converts best.")
    parts.append(
        f"{int(accounts):,} accounts need immediate intervention, representing {money(opportunity)} of additional "
        f"recovery, and {int(over_contact)} segments are being contacted 4.5 or more times per account, "
        f"a conduct and complaint risk to review.")
    return " ".join(parts), snapshot


def step_summary(sql: Sql, cfg: dict) -> None:
    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    narrative, snapshot = build_exec_summary(sql, gold)
    sql.execute(f"CREATE TABLE IF NOT EXISTS {gold}.exec_summary "
                f"(generated_at TIMESTAMP, snapshot_date DATE, narrative STRING) "
                f"COMMENT 'Command Center executive summary, written by deploy.py from the certified views'")
    escaped = narrative.replace("\\", "\\\\").replace("'", "\\'")
    sql.execute(f"INSERT OVERWRITE {gold}.exec_summary VALUES (current_timestamp(), DATE '{snapshot}', '{escaped}')")
    log(f"Executive summary written ({len(narrative)} characters):\n    {narrative}")


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
    # Same instructions and sources → same answers, so only a real change counts.
    genie_version = hashlib.sha256(f"{space_id}|{serialized}".encode()).hexdigest()[:12]
    bump_cache_version(db, cfg, state, cfg_path, "genie", genie_version)


def pg_connect(db: Databricks, state: dict, database: str):
    import psycopg2  # noqa: E402

    cred = db.run("postgres", "generate-database-credential", state["lakebase_endpoint"])
    return psycopg2.connect(
        host=state["lakebase_host"], port=5432, dbname=database,
        user=state["user"], password=cred["token"], sslmode="require",
    )


def bump_cache_version(db: Databricks, cfg: dict, state: dict, cfg_path: Path, name: str, version: str) -> None:
    """Record a new data or Genie version so the app's answer cache moves on.

    The app keys cached answers by these versions, so bumping one makes every
    older answer unreachable and triggers a fresh pre-warm. Kept in the state
    file too, so a first deploy (Lakebase not created yet) still gets them.
    """
    versions = state.setdefault("cache_versions", {})
    if versions.get(name) == version:
        return
    versions[name] = version
    save_state(cfg_path, state)
    if "lakebase_host" in state:
        write_cache_versions(db, cfg, state)


def write_cache_versions(db: Databricks, cfg: dict, state: dict) -> None:
    versions = state.get("cache_versions") or {}
    if not versions:
        return
    try:
        conn = pg_connect(db, state, cfg["lakebase_database"])
        conn.autocommit = True
        with conn.cursor() as cur:
            for name, version in versions.items():
                cur.execute(
                    "INSERT INTO chatapp.cache_versions (name, version, updated_at) VALUES (%s, %s, now()) "
                    "ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, updated_at = now() "
                    "WHERE chatapp.cache_versions.version <> EXCLUDED.version",
                    (name, version))
        conn.close()
        log(f"Answer cache versions: {', '.join(f'{k}={v}' for k, v in versions.items())}")
    except Exception as e:  # the cache is an optimisation; never fail a deploy over it
        log(f"WARNING: could not update answer-cache versions ({e}); cached answers may be stale until the next deploy")


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
    write_cache_versions(db, cfg, state)
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
        + ("  - name: LENSS_TITLE_ENDPOINT\n    valueFrom: title-model\n" if state.get("title_endpoint") else "")
        + f"  - name: LENSS_ANSWER_CACHE\n    value: '{'on' if cfg.get('answer_cache', True) else 'off'}'\n"
        + f"  - name: LENSS_PREWARM\n    value: '{'on' if cfg.get('prewarm_suggestions', True) else 'off'}'\n",
        encoding="utf-8",
    )


def grant_use_catalog(sql: Sql, catalog: str, sp: str) -> bool:
    """USE CATALOG for the app's service principal. Returns False if it's still missing.

    Granting it needs MANAGE on the catalog (or ownership), which the person
    deploying into a shared catalog often doesn't have. Many shared catalogs
    already give USE CATALOG to `account users`, which every service principal
    belongs to, so that counts too. Otherwise this warns instead of failing,
    so everything else still deploys and only this one grant is left to an admin.
    """
    try:
        sql.execute(f"GRANT USE CATALOG ON CATALOG {catalog} TO `{sp}`")
        log(f"Granted USE CATALOG on {catalog} to the app's service principal")
        return True
    except DeployError as e:
        if "PERMISSION_DENIED" not in str(e):
            raise
    try:
        grants = sql.execute(f"SHOW GRANTS ON CATALOG {catalog}")
    except DeployError:
        grants = []
    for principal, action, *_ in grants:
        if principal in ("account users", sp) and action.replace("_", " ").upper() in ("USE CATALOG", "ALL PRIVILEGES"):
            log(f"USE CATALOG on {catalog} already comes from `{principal}`; no catalog grant needed")
            return True
    log(f"WARNING: you can't grant USE CATALOG on {catalog} (it needs MANAGE on the catalog), and it isn't "
        f"granted to `account users`. Ask the catalog owner or an admin to run:\n"
        f"    GRANT USE CATALOG ON CATALOG {catalog} TO `{sp}`;\n"
        f"  It only lets the app enter the catalog; data access still comes only from your schema grants. "
        f"Until then the app loads, but its dashboard and Genie answers fail.")
    return False


def step_app(db: Databricks, sql: Sql, cfg: dict, state: dict, cfg_path: Path) -> None:
    name = cfg["app_name"]
    app_dir = (REPO_DIR / cfg["app_dir"]).resolve()
    ws_path = cfg["app_workspace_path"] or f"/Workspace/Users/{state['user']}/apps/{name}"
    space = db.run("genie", "get-space", state["genie_space_id"])
    spec = {
        "description": "LensS Collections Intelligence — Genie chat + agent mode, command center, monitoring.",
        # No on-behalf-of-user scopes: the app calls Genie and SQL as its own service
        # principal, so users need only CAN_USE on the app and are never asked to
        # authorize anything. (Empty list also clears a scope set by an older deploy.)
        "user_api_scopes": [],
        "resources": [
            {"name": "genie-space", "description": "Genie space for natural-language questions",
             "genie_space": {"name": space["title"], "space_id": state["genie_space_id"], "permission": "CAN_RUN"}},
            {"name": "sql-warehouse", "description": "Warehouse for dashboard queries",
             "sql_warehouse": {"id": state["warehouse_id"], "permission": "CAN_USE"}},
            # Lakebase database as a declared resource: Databricks creates the app's
            # Postgres login (named dbrx-apps-<sp id>) and grants CONNECT/CREATE on it.
            # Table-level grants on chatapp.* are still applied below.
            {"name": "database", "description": "Lakebase database for chat history and usage log",
             "postgres": {"branch": state["lakebase_branch"],
                          "database": f"{state['lakebase_branch']}/databases/{cfg['lakebase_database']}",
                          "permission": "CAN_CONNECT_AND_CREATE"}},
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
        # With --json the CLI takes the name inside the body, not as an argument.
        app = db.run("apps", "create", json_body={**spec, "name": name})
    else:
        app = db.run("apps", "update", name, json_body=spec)
    sp = app["service_principal_client_id"]
    state["app_url"] = app.get("url")
    log(f"App {name}, service principal {sp}")

    # Unity Catalog: only the app's service principal reads gold (Genie runs its SQL
    # as the app too). App users get no data grants: they see data only through the app.
    c, p = cfg["catalog"], cfg["schema_prefix"]
    catalog_ok = grant_use_catalog(sql, c, sp)
    sql.execute(f"GRANT USE SCHEMA ON SCHEMA {c}.{p}_gold TO `{sp}`")
    sql.execute(f"GRANT SELECT ON SCHEMA {c}.{p}_gold TO `{sp}`")
    log("Granted USE SCHEMA / SELECT on gold to the app's service principal")
    state["catalog_access_pending"] = not catalog_ok

    # Lakebase: a Postgres role for the app's service principal, then table grants.
    branch = state["lakebase_branch"]
    roles = db.run("postgres", "list-roles", branch)
    roles = roles if isinstance(roles, list) else roles.get("roles", [])
    if not any(r["status"].get("postgres_role") == sp for r in roles):
        # Unique per service principal: a recreated app gets a new one, and the old
        # role (same app name) may still exist.
        role_id = re.sub(r"[^a-z0-9-]", "-", f"app-{name}-{sp[:8]}".lower())[:63].strip("-")
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

    # People: CAN_USE on the app is the only permission they get — no Genie space,
    # warehouse, table or Lakebase access.
    if cfg["readers_group"]:
        db.run("apps", "update-permissions", name, json_body={"access_control_list": [
            {"group_name": cfg["readers_group"], "permission_level": "CAN_USE"}]})
        log(f"Granted CAN_USE on the app (and nothing else) to {cfg['readers_group']}")

    write_app_yaml(app_dir, cfg, state)
    log(f"Syncing {app_dir.name} -> {ws_path}")
    db.run("sync", str(app_dir), ws_path, "--full",
           "--exclude", "node_modules/**", "--exclude", "dist/**", "--exclude", ".git/**", output_json=False)
    # A stopped app (idle policy, workspace quota, or someone pressed Stop) rejects deploys.
    compute = (db.run("apps", "get", name).get("compute_status") or {}).get("state")
    if compute != "ACTIVE":
        log(f"App compute is {compute}; starting it (a few minutes)…")
        db.run("apps", "start", name)
    # Starting an app redeploys its previous version, and only one deployment may run at a time.
    for _ in range(120):
        app_now = db.run("apps", "get", name)
        states = {(app_now.get(k) or {}).get("status", {}).get("state") for k in ("active_deployment", "pending_deployment")}
        if "IN_PROGRESS" not in states:
            break
        if _ == 0:
            log("Waiting for the app's current deployment to finish…")
        time.sleep(10)
    log("Deploying (the platform runs npm install + build)…")
    dep = db.run("apps", "deploy", name, "--source-code-path", ws_path)
    status = dep.get("status", {})
    if status.get("state") != "SUCCEEDED":
        raise DeployError(f"App deployment did not succeed: {status}")
    save_state(cfg_path, state)
    log(f"App live at {state['app_url']}")
    if state.get("catalog_access_pending"):
        log(f"Still needed from an admin: GRANT USE CATALOG ON CATALOG {c} TO `{sp}`; (see the warning above). "
            f"No redeploy is needed after they run it.")


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
    run_stamp = time.strftime("%Y%m%d-%H%M%S")
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
            elif step == "summary":
                step_summary(sql, cfg)
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
            if step in ("ingest", "transform", "summary"):
                # New gold data or views → cached answers may be wrong. One stamp per run, so a full deploy bumps once.
                bump_cache_version(db, cfg, state, cfg_path, "data", run_stamp)
        save_state(cfg_path, state)
    except DeployError as e:
        log(f"FAILED: {e}")
        sys.exit(1)
    log(f"Done in {int(time.time() - started)}s. App: {state.get('app_url', '(not deployed)')}")


if __name__ == "__main__":
    main()
