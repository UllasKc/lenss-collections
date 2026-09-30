import express from 'express';
import { currentVersions, type Lakebase } from '../lib/answerCache.js';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'cnx_automl_dev.lenss_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}

/** Keep results this long if the data version can't be read (e.g. Lakebase down). */
const FALLBACK_TTL_MS = 10 * 60_000;

/**
 * The Command Center only changes when deploy.py reloads gold data, so each
 * panel's result is kept in memory for the current data version: every
 * visitor after the first gets it instantly and the warehouse isn't queried.
 */
function dashboardCache(db: Lakebase) {
  const entries = new Map<string, { version: string | null; at: number; value: unknown }>();
  return async (name: string, res: express.Response, compute: () => Promise<unknown>) => {
    const version = await currentVersions(db).then((v) => v.data, () => null);
    const e = entries.get(name);
    if (e && (version && e.version ? e.version === version : Date.now() - e.at < FALLBACK_TTL_MS)) {
      res.setHeader('X-Cache', 'hit');
      res.json(e.value);
      return;
    }
    try {
      const value = await compute();
      entries.set(name, { version, at: Date.now(), value });
      res.setHeader('X-Cache', 'miss');
      res.json(value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function buildDashboardRouter(db: Lakebase): express.Router {
  const router = express.Router();
  const cached = dashboardCache(db);

  router.get('/api/dashboard/summary', (_req, res) =>
    cached('summary', res, async () => {
      const [totals] = await runSql(`
        SELECT
          SUM(MTD_Collections) AS mtd_collections,
          SUM(Monthly_Target) AS monthly_target,
          1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement_pct,
          GREATEST(SUM(Monthly_Target)-SUM(MTD_Collections),0) AS target_gap
        FROM ${GOLD}.qry_mtd_vs_target
      `);
      const [funnel] = await runSql(`
        SELECT COUNT(DISTINCT Account_ID) AS eligible_accounts
        FROM ${GOLD}.mv_collections_funnel
      `);
      const [intervention] = await runSql(`
        SELECT COUNT(*) AS immediate_intervention_accounts,
               SUM(Incremental_Recovery_Opportunity) AS recovery_opportunity
        FROM ${GOLD}.qry_immediate_intervention
      `);
      const [overContact] = await runSql(`
        SELECT COUNT(*) AS over_contact_segments FROM ${GOLD}.qry_over_contact_risk
      `);
      // Written once by deploy.py's `summary` step; missing until that step has run.
      const [narrative] = await runSql(`
        SELECT narrative, CAST(generated_at AS STRING) AS narrative_generated_at FROM ${GOLD}.exec_summary LIMIT 1
      `).catch(() => [{ narrative: null, narrative_generated_at: null }]);
      return { ...totals, ...funnel, ...intervention, ...overContact, ...narrative };
    }));

  router.get('/api/dashboard/by-product', (_req, res) =>
    cached('by-product', res, () => runSql(`
        SELECT Product, SUM(MTD_Collections) AS mtd_collections, SUM(Monthly_Target) AS monthly_target,
               1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement_pct
        FROM ${GOLD}.qry_mtd_vs_target
        GROUP BY Product ORDER BY achievement_pct
      `)));

  router.get('/api/dashboard/segments', (_req, res) =>
    cached('segments', res, () =>
      runSql(`SELECT * FROM ${GOLD}.qry_kpi_drivers ORDER BY Balance_Recovery_Rate, Outstanding_Balance DESC`)));

  router.get('/api/dashboard/funnel-rates', (_req, res) =>
    cached('funnel-rates', res, async () => (await runSql(`SELECT * FROM ${GOLD}.qry_funnel_rates`))[0]));

  return router;
}
