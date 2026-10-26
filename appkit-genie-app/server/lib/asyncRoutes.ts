import type express from 'express';

/**
 * Express 4 does not catch a rejected async route handler: the rejection goes unhandled and Node
 * exits, taking the whole app down. That happened when the shared Lakebase endpoint was disabled
 * (GET /api/chat/sessions awaited a query with no try/catch). catchAsync wraps every route handler
 * of a router so a thrown error or a rejected promise reaches next(err); errorHandler answers it.
 */
export function catchAsync(router: express.Router): express.Router {
  type Layer = { route?: { stack: { handle: express.RequestHandler }[] } };
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    for (const h of layer.route?.stack ?? []) {
      const fn = h.handle;
      if (fn.length > 3) continue;   // already an error handler
      h.handle = (req, res, next) => {
        try {
          const out = fn(req, res, next) as unknown;
          if (out && typeof (out as Promise<unknown>).then === 'function') (out as Promise<unknown>).catch(next);
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}

// Only messages that mean a service is down or unreachable; an ordinary SQL or Postgres error stays a 500.
const UNAVAILABLE = /endpoint has been disabled|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|connection terminated|too many (clients|connections)|password authentication failed|Cannot create the resource|RESOURCE_EXHAUSTED|TEMPORARILY_UNAVAILABLE|Service Unavailable|warehouse (is )?(stopped|starting|not running)/i;

/** Last middleware: a failed request gets a clean JSON error instead of crashing the server. */
export function errorHandler(err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[error] ${req.method} ${req.path}:`, message);
  if (res.headersSent) {   // e.g. a streamed answer already under way: just close it
    res.end();
    return;
  }
  const unavailable = UNAVAILABLE.test(message);
  res.status(unavailable ? 503 : 500).json({
    error: unavailable ? 'A data service LensS depends on (its chat database or SQL warehouse) is unavailable. Please try again shortly.'
      : 'Something went wrong handling this request.',
  });
}
