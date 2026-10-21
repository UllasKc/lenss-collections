# Auto-stop for a Databricks App: approach and code

**Problem:** Databricks Apps never stop on their own. They bill for compute the whole time they're running, even with nobody using them.

**Approach:** the app stops itself. It keeps a "last used" time, checks it every 5 minutes, and once there has been no use for N minutes it calls the Databricks Apps API to stop itself, using its own service principal. No scheduled job, no extra service.

- **What counts as use:** any request from a signed-in caller. The Databricks Apps proxy adds an `x-forwarded-email` header to real user and service-principal requests. Platform probes don't carry it, so they can't keep the app awake.
- **Never mid-work:** requests still in progress (for example a streaming answer) are counted, and the app won't stop while any are open.
- **Permission:** the app's service principal needs **CAN_MANAGE on its own app only**, so it can stop this app and nothing else.
- **Restarting:** anyone with CAN_MANAGE clicks Compute → Apps → *app* → **Start** (a few minutes). A redeploy also starts it.
- **Nothing is lost:** only compute stops. Data in Unity Catalog and Lakebase is untouched.

## How the stop happens

```
App server (running inside Databricks)
   │  no use for N minutes → POST /api/2.0/apps/<app-name>/stop
   │  (OAuth token of the app's service principal, attached automatically)
   ▼
Databricks Apps API ── checks: does this service principal have CAN_MANAGE on the app? ✓
   ▼
Databricks stops the app's compute → the app (and its timer) shut down
```

## 1. Code: Node / Express (AppKit)

`server/lib/idleStop.ts`:

```ts
import type express from 'express';
import { getExecutionContext } from '@databricks/appkit';

const MINUTES = Number(process.env.IDLE_STOP_MINUTES ?? 0);            // 0 = never stop
const APP = process.env.IDLE_STOP_APP_NAME || process.env.DATABRICKS_APP_NAME || '';
const CHECK_EVERY_MS = 5 * 60_000;

let lastUse = Date.now();   // a fresh start counts as use
let inFlight = 0;
let stopping = false;

/** Middleware: every request from a signed-in caller resets the clock. */
export function trackUse(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const who = req.headers['x-forwarded-email'];
  if (typeof who === 'string' && who) {
    lastUse = Date.now();
    inFlight += 1;
    res.on('close', () => { inFlight -= 1; lastUse = Date.now(); });   // fires after streaming ends too
  }
  next();
}

/** Optional: return true while long background work must keep the app up. */
let busy: () => boolean = () => false;
export const keepAliveWhile = (fn: () => boolean) => { busy = fn; };

export function startIdleStop(): void {
  if (!MINUTES || !APP) { console.log('[idle stop] off'); return; }
  console.log(`[idle stop] on: ${APP} stops after ${MINUTES} minutes without use`);
  setInterval(async () => {
    const idleMin = (Date.now() - lastUse) / 60_000;
    if (stopping || inFlight > 0 || busy() || idleMin < MINUTES) return;
    stopping = true;
    console.log(`[idle stop] no use for ${Math.round(idleMin)} minutes: stopping ${APP}`);
    try {
      // Runs as the app's own service principal (credentials are injected by Databricks Apps).
      await getExecutionContext().client.apiClient.request({
        path: `/api/2.0/apps/${encodeURIComponent(APP)}/stop`,
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        raw: false,
        payload: {},
      } as never);
    } catch (err) {
      // Usually a missing CAN_MANAGE grant: log it and try again after another window.
      console.warn('[idle stop] could not stop the app:', err instanceof Error ? err.message : err);
      lastUse = Date.now();
      stopping = false;
    }
  }, CHECK_EVERY_MS).unref();
}
```

Wire it in `server.ts`. `trackUse` must be the **first** middleware:

```ts
import { startIdleStop, trackUse } from './lib/idleStop.js';

createApp({
  plugins: [/* ... */],
  onPluginsReady(appkit) {
    startIdleStop();
    appkit.server.extend((app) => {
      app.use(trackUse);          // first, so every request counts
      // ... your routers
    });
  },
});
```

If the app isn't on AppKit, use any Databricks SDK client that authenticates as the app; the API call is the same.

## 1b. Code: Python (FastAPI)

```python
import os, time, threading, logging
from databricks.sdk import WorkspaceClient

MINUTES = int(os.getenv("IDLE_STOP_MINUTES", "0"))          # 0 = never stop
APP = os.getenv("IDLE_STOP_APP_NAME") or os.getenv("DATABRICKS_APP_NAME", "")
_last, _in_flight, _lock = time.time(), 0, threading.Lock()

@app.middleware("http")
async def track_use(request, call_next):
    global _last, _in_flight
    if not request.headers.get("x-forwarded-email"):
        return await call_next(request)
    with _lock:
        _in_flight += 1; _last = time.time()
    try:
        return await call_next(request)
    finally:
        with _lock:
            _in_flight -= 1; _last = time.time()

def _watch():
    global _last
    w = WorkspaceClient()        # authenticates as the app's service principal
    while True:
        time.sleep(300)
        if _in_flight == 0 and time.time() - _last >= MINUTES * 60:
            try:
                logging.info("idle stop: stopping %s", APP)
                w.apps.stop(name=APP)
                return
            except Exception as e:
                logging.warning("idle stop: could not stop %s: %s", APP, e)
                _last = time.time()

if MINUTES and APP:
    threading.Thread(target=_watch, daemon=True).start()
```

- **Streaming responses:** for a `StreamingResponse`, the middleware's `finally` runs when the response starts, not when the stream ends. Long streams then need their own in-flight counter.
- **Streamlit:** there's no HTTP middleware. Update a shared "last used" value (held via `st.cache_resource`) on every rerun instead.

## 2. Configuration (`app.yaml`)

```yaml
env:
  - name: IDLE_STOP_MINUTES
    value: '60'              # 0 = never stop
  - name: IDLE_STOP_APP_NAME
    value: my-app-name       # the app's own name
```

## 3. Permission: let the app stop itself (once per app)

Find the app's service principal ID:

```
databricks apps get my-app-name --profile <profile>
```

Copy the `service_principal_client_id` from the output, then grant it CAN_MANAGE on this app. `update-permissions` adds to the existing access and leaves other users' permissions untouched:

```
databricks apps update-permissions my-app-name --profile <profile> --json "{\"access_control_list\":[{\"service_principal_name\":\"<service_principal_client_id>\",\"permission_level\":\"CAN_MANAGE\"}]}"
```

Tip: put this grant in your deploy script so every deploy keeps it in place.

## 4. Test it

1. Set `IDLE_STOP_MINUTES` to `5`, deploy, and don't open the app.
2. Watch the status:
   ```
   databricks apps get my-app-name --profile <profile>
   ```
   `compute_status.state` should go `ACTIVE` → `STOPPING` → `STOPPED` within 5–10 minutes. The app log shows `[idle stop] no use for 5 minutes: stopping …`.
3. Set it back to `60` and redeploy. The redeploy also starts the app.

## Limits to know

- **Only server requests count.** Scrolling or reading data already on screen doesn't reset the clock. A small browser ping while the tab is visible and the user is active would cover that, if needed.
- **One instance assumed.** The clock lives in memory, which matches how Databricks Apps run today. With several instances, store `lastUse` in a shared place such as Lakebase.
- **Stopping only.** A stopped app can't start itself. Starting stays a manual click by someone with CAN_MANAGE, or a redeploy.
