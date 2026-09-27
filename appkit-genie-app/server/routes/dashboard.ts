import express from 'express';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'cnx_automl_dev.lenss_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}

export function buildDashboardRouter(): express.Router {
  const router = express.Router();

  router.get('/api/dashboard/summary', async (_req, res) => {
    try {
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
      res.json({ ...totals, ...funnel, ...intervention, ...overContact, ...narrative });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/api/dashboard/by-product', async (_req, res) => {
    try {
      const rows = await runSql(`
        SELECT Product, SUM(MTD_Collections) AS mtd_collections, SUM(Monthly_Target) AS monthly_target,
               1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement_pct
        FROM ${GOLD}.qry_mtd_vs_target
        GROUP BY Product ORDER BY achievement_pct
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/api/dashboard/segments', async (_req, res) => {
    try {
      const rows = await runSql(`SELECT * FROM ${GOLD}.qry_kpi_drivers ORDER BY Balance_Recovery_Rate, Outstanding_Balance DESC`);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/api/dashboard/funnel-rates', async (_req, res) => {
    try {
      const [rows] = await runSql(`SELECT * FROM ${GOLD}.qry_funnel_rates`);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
