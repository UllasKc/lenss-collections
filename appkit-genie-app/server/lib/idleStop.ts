import type express from 'express';
import { getExecutionContext } from '@databricks/appkit';
import { evalRunning } from './evals.js';

/**
 * Stops this app after a stretch with no use, because Databricks Apps never stop on their own and
 * bill while running. Someone with CAN_MANAGE on the app starts it again (Compute -> Apps -> Start).
 *
 * Use = a request from a signed-in person or service principal (the platform's proxy adds
 * x-forwarded-email); probes without an identity don't count. An answer still streaming, or an
 * evaluation run in progress, keeps the app up. The app stops itself with its own service
 * principal, which the deploy gives CAN_MANAGE on this app only.
 *
 * LENSS_IDLE_STOP_MINUTES (deploy config `idle_stop_minutes`; 0 = never) and LENSS_APP_NAME come
 * from app.yaml. LENSS_IDLE_STOP_PAUSE (config `idle_stop_pause`), e.g. "17:30-07:00 Asia/Kolkata
 * Mon,Tue,Wed,Thu,Fri", pauses the idle stop in those hours on those days (a window crossing midnight
 * belongs to the day it starts) so the app stays on; no days = every day; empty = no pause. It never
 * starts the app.
 */

const MINUTES = Number(process.env.LENSS_IDLE_STOP_MINUTES ?? 0);
const APP = process.env.LENSS_APP_NAME || process.env.DATABRICKS_APP_NAME || '';
const CHECK_EVERY_MS = 5 * 60_000;
const PAUSE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2}) (\S+)(?: (\S+))?$/.exec(process.env.LENSS_IDLE_STOP_PAUSE ?? '');
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAUSE_DAYS = new Set(PAUSE?.[6] ? PAUSE[6].split(',') : WEEK);

/**
 * True inside the pause window: local time in its time zone, on one of its days. A window that
 * crosses midnight belongs to the day it starts (Fri 17:30-07:00 runs into Saturday morning).
 */
export function paused(at = new Date()): boolean {
  if (!PAUSE) return false;
  const [, fh, fm, th, tm, tz] = PAUSE;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const now = Number(get('hour')) * 60 + Number(get('minute'));
  const today = WEEK.indexOf(get('weekday'));
  const from = Number(fh) * 60 + Number(fm);
  const to = Number(th) * 60 + Number(tm);
  const on = (d: number) => PAUSE_DAYS.has(WEEK[(d + 7) % 7]);
  if (from < to) return now >= from && now < to && on(today);
  return (now >= from && on(today)) || (now < to && on(today - 1));   // early morning: the window began yesterday
}

let lastUse = Date.now();   // a fresh start counts as use, so the app gets a full window first
let inFlight = 0;
let stopping = false;

/** Express middleware: records each request from a signed-in caller. */
export function trackUse(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const who = req.headers['x-forwarded-email'];
  if (typeof who === 'string' && who) {
    lastUse = Date.now();
    inFlight += 1;
    res.on('close', () => { inFlight -= 1; lastUse = Date.now(); });
  }
  next();
}

/** Minutes since the last request from a person or service principal. */
export const idleMinutes = () => (Date.now() - lastUse) / 60_000;

export function startIdleStop(): void {
  if (!MINUTES || !APP) {
    console.log(`[idle stop] off${!APP ? ' (app name unknown)' : ''}`);
    return;
  }
  console.log(`[idle stop] on: ${APP} stops after ${MINUTES} minutes without use`
    + (PAUSE ? `, except ${PAUSE[1]}:${PAUSE[2]}-${PAUSE[3]}:${PAUSE[4]} (${PAUSE[5]}${PAUSE[6] ? `, ${PAUSE[6]}` : ''})` : ''));
  setInterval(async () => {
    if (stopping || inFlight > 0 || evalRunning() || idleMinutes() < MINUTES) return;
    if (paused()) { lastUse = Date.now(); return; }   // paused hours: stay on; a full idle window once they end
    stopping = true;
    console.log(`[idle stop] no use for ${Math.round(idleMinutes())} minutes: stopping ${APP}`);
    try {
      await getExecutionContext().client.apiClient.request({
        path: `/api/2.0/apps/${encodeURIComponent(APP)}/stop`,
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        raw: false,
        payload: {},
      } as never);
    } catch (err) {
      // Most likely the service principal lacks CAN_MANAGE on the app: try again after another window.
      console.warn('[idle stop] could not stop the app:', err instanceof Error ? err.message : err);
      lastUse = Date.now();
      stopping = false;
    }
  }, CHECK_EVERY_MS).unref();
}
