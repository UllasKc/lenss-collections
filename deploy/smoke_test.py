"""End-to-end smoke test against a *deployed* LensS Collections app.

Databricks Apps reject PATs at their front door and require OAuth. For headless
testing this script authenticates as a service principal (M2M client
credentials), which must have CAN_USE on the app.

Usage:
  set LENSS_SMOKE_CLIENT_ID=<service principal application id>
  set LENSS_SMOKE_CLIENT_SECRET=<oauth secret>
  python deploy/smoke_test.py --host https://<workspace> --app-url https://<app>.databricksapps.com
"""
import argparse
import json
import os
import sys
import time

import requests


def get_m2m_token(host: str, client_id: str, client_secret: str) -> str:
    r = requests.post(
        f"{host.rstrip('/')}/oidc/v1/token",
        data={"grant_type": "client_credentials", "scope": "all-apis"},
        auth=(client_id, client_secret),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def read_sse(resp):
    """Yields (event, data) pairs from a text/event-stream response."""
    event, data_lines = "message", []
    for raw in resp.iter_lines(decode_unicode=True):
        if raw is None:
            continue
        line = raw.rstrip("\r")
        if line == "":
            if data_lines:
                payload = "\n".join(data_lines)
                try:
                    yield event, json.loads(payload)
                except json.JSONDecodeError:
                    yield event, payload
            event, data_lines = "message", []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())


def new_session(base, headers):
    s = requests.post(f"{base}/api/chat/sessions", headers=headers, json={}, timeout=30)
    s.raise_for_status()
    return s.json()["session_id"]


def ask(base, headers, mode, question, session_id=None):
    """Sends one question (mode chosen per message) and returns the normalized answer."""
    session_id = session_id or new_session(base, headers)
    started = time.time()
    with requests.post(
        f"{base}/api/chat/sessions/{session_id}/messages",
        headers={**headers, "Accept": "text/event-stream"},
        json={"content": question, "mode": mode},
        stream=True,
        timeout=600,
    ) as r:
        r.raise_for_status()
        events, answer, success, error, title, saved = [], {}, False, None, None, {}
        for event, data in read_sse(r):
            events.append(event)
            if event == "answer":
                answer = data
            elif event == "saved":
                saved = data
            elif event == "error":
                error = data
            elif event == "session_title":
                title = data.get("title")
            elif event == "done":
                success = bool(isinstance(data, dict) and data.get("success"))
    return {
        "session_id": session_id,
        "mode": mode,
        "question": question,
        "success": success and not error and bool(answer.get("text")),
        "seconds": round(time.time() - started, 1),
        "answer_preview": (answer.get("text") or "")[:200].replace("\n", " "),
        "charts": answer.get("charts") or [],
        "title": title,
        "message_id": saved.get("messageId"),
        "error": error,
        "event_types": sorted(set(events)),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True, help="Workspace URL, e.g. https://dbc-xxxx.cloud.databricks.com")
    p.add_argument("--app-url", required=True, help="App URL, e.g. https://appkit-genie-123.aws.databricksapps.com")
    p.add_argument("--skip-agent", action="store_true", help="Skip the slower Agent-mode question")
    args = p.parse_args()

    client_id = os.environ.get("LENSS_SMOKE_CLIENT_ID")
    client_secret = os.environ.get("LENSS_SMOKE_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Set LENSS_SMOKE_CLIENT_ID and LENSS_SMOKE_CLIENT_SECRET")

    token = get_m2m_token(args.host, client_id, client_secret)
    base = args.app_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    results, failures = [], 0

    def check(name, fn):
        nonlocal failures
        try:
            detail = fn()
            results.append((name, "PASS", detail))
        except Exception as e:  # noqa: BLE001 — report every failure, keep going
            failures += 1
            results.append((name, "FAIL", str(e)[:300]))

    def get_ok(path, expect_json=True):
        r = requests.get(f"{base}{path}", headers=headers, timeout=120)
        r.raise_for_status()
        return r.json() if expect_json else f"HTTP {r.status_code}, {len(r.text)} bytes"

    check("GET / (UI shell)", lambda: get_ok("/", expect_json=False))
    check("GET /css/style.css", lambda: get_ok("/css/style.css", expect_json=False))
    check("GET /api/me", lambda: get_ok("/api/me"))
    check("GET /api/dashboard/summary", lambda: get_ok("/api/dashboard/summary"))
    check("GET /api/dashboard/by-product", lambda: f"{len(get_ok('/api/dashboard/by-product'))} products")
    check("GET /api/dashboard/segments", lambda: f"{len(get_ok('/api/dashboard/segments'))} segments")

    questions = [
        ("chat", "What is my MTD collections performance versus target?"),
        ("chat", "Which accounts require immediate intervention?"),
        ("chat", "Are our current collections policies too aggressive?"),
        ("chat", "Show customer names and mobile numbers for high-risk accounts"),
        ("agent", "Hi"),
    ]
    if not args.skip_agent:
        questions.append(("agent", "Why are collections lagging this month and what should we do about it?"))

    for mode, q in questions:
        def run(mode=mode, q=q):
            res = ask(base, headers, mode, q)
            if not res["success"]:
                raise RuntimeError(json.dumps(res)[:300])
            return f"{res['seconds']}s, {len(res['charts'])} chart(s) — {res['answer_preview']}"
        check(f"[{mode}] {q}", run)

    # One session, mode switched per question: charts, naming, history, rename, delete.
    convo = {}

    def mixed_chat():
        res = ask(base, headers, "chat", "Show MTD collections versus target by product")
        convo.update(session_id=res["session_id"], title=res["title"], message_id=res["message_id"])
        if not res["success"]:
            raise RuntimeError(json.dumps(res)[:300])
        if not any(len(c["rows"]) > 1 for c in res["charts"]):
            raise RuntimeError(f"expected a multi-row chart, got {[(c['title'], len(c['rows'])) for c in res['charts']]}")
        c = res["charts"][0]
        return f"{res['seconds']}s, chart '{c['title']}' {len(c['rows'])} rows x {len(c['columns'])} cols; session named '{res['title']}'"

    def mixed_agent():
        if "session_id" not in convo:
            raise RuntimeError("previous step failed")
        res = ask(base, headers, "agent",
                  "For the weakest product in that answer, why is it lagging and what should we do?", convo["session_id"])
        if not res["success"]:
            raise RuntimeError(json.dumps(res)[:300])
        return f"{res['seconds']}s, {len(res['charts'])} chart(s) — {res['answer_preview']}"

    def history():
        sid = convo["session_id"]
        listed = [s for s in get_ok("/api/chat/sessions") if s["session_id"] == sid]
        if not listed or not listed[0]["title"]:
            raise RuntimeError(f"session not listed with a title: {listed}")
        msgs = get_ok(f"/api/chat/sessions/{sid}/messages")
        modes = [m["mode"] for m in msgs]
        charts = sum(len((m.get("attachment_json") or {}).get("charts") or []) for m in msgs if m["role"] == "assistant")
        if modes != ["chat", "chat", "agent", "agent"] or not charts:
            raise RuntimeError(f"unexpected history: modes={modes}, charts={charts}")
        return f"title '{listed[0]['title']}', 4 messages (chat, agent), {charts} stored chart(s)"

    def rename_delete():
        sid = convo["session_id"]
        r = requests.patch(f"{base}/api/chat/sessions/{sid}", headers=headers, json={"title": "Smoke test (renamed)"}, timeout=30)
        r.raise_for_status()
        if r.json()["title"] != "Smoke test (renamed)":
            raise RuntimeError(r.text)
        requests.delete(f"{base}/api/chat/sessions/{sid}", headers=headers, timeout=30).raise_for_status()
        if any(s["session_id"] == sid for s in get_ok("/api/chat/sessions")):
            raise RuntimeError("session still listed after delete")
        return "renamed and deleted"

    def feedback():
        mid = convo.get("message_id")
        if not mid:
            raise RuntimeError("no saved answer id from the chat step")
        url = f"{base}/api/chat/messages/{mid}/feedback"
        up = requests.post(url, headers=headers, json={"rating": "up"}, timeout=60)
        up.raise_for_status()
        if not up.json().get("sentToGenie"):
            raise RuntimeError(f"rating saved but not delivered to Genie: {up.text}")
        stored = [m for m in get_ok(f"/api/chat/sessions/{convo['session_id']}/messages") if m["message_id"] == mid]
        if not stored or stored[0].get("feedback") != 1:
            raise RuntimeError(f"rating not stored: {stored[:1]}")
        requests.post(url, headers=headers, json={"rating": None}, timeout=60).raise_for_status()
        return "👍 stored, delivered to Genie, then cleared"

    def audit_trail():
        recent = get_ok("/api/admin/usage")["recent"]
        mine = [e for e in recent if e.get("session_id") == convo.get("session_id") and e.get("details")]
        if not mine:
            raise RuntimeError("no audit-trail entry with details for the smoke session")
        d = mine[-1]["details"]
        if not d.get("queries") or not d["queries"][0].get("sql") or not d.get("timeline"):
            raise RuntimeError(f"details missing SQL or timings: {json.dumps(d)[:300]}")
        stages = ", ".join(f"{s['stage']} {s['ms']}ms" for s in d["timeline"])
        return f"{len(d['queries'])} SQL query, {d['queries'][0].get('rows')} rows; stages: {stages}"

    def exec_summary():
        text = get_ok("/api/dashboard/summary").get("narrative")
        if not text:
            raise RuntimeError("no narrative; run the deploy's summary step")
        return text[:120] + "…"

    check("GET /api/dashboard/summary has the executive summary", exec_summary)
    check("[session] chat question returns a chart + auto-named session", mixed_chat)
    check("[session] 👍/👎 feedback is stored and sent to Genie", feedback)
    check("[monitoring] audit trail records the SQL and stage timings", audit_trail)
    if not args.skip_agent:
        check("[session] agent follow-up in the same session", mixed_agent)
        check("[session] history keeps both modes and the charts", history)
    check("[session] rename + delete", rename_delete)

    check("GET /api/admin/usage", lambda: get_ok("/api/admin/usage")["totals"])

    print()
    for name, status, detail in results:
        print(f"{status}  {name}\n      {detail}")
    print(f"\n{len(results) - failures}/{len(results)} checks passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
