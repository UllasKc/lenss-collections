import express from 'express';
import { currentVersions, type Lakebase } from '../lib/answerCache.js';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'cnx_automl_dev.lenss_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}

/** Keep results this long if the data version can't be read (e.g. Lakebase down). */
const FALLBACK_TTL_MS = 10 * 60_000;

/** How often the app checks whether the data changed, to have the Command Center ready again. */
const WARM_EVERY_MS = 5 * 60_000;

/**
 * The Command Center only changes when deploy.py reloads gold data, so each
 * panel's result is kept in memory for the current data version: every
 * visitor gets it instantly and the warehouse isn't queried. The app fills it
 * itself when it starts and when the data changes (see `warm`), so the first
 * visitor doesn't wait for the warehouse either; visitors arriving while it is
 * being computed share that one computation.
 */
function dashboardCache(db: Lakebase) {
  const entries = new Map<string, { version: string | null; at: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  const get = async (name: string, compute: () => Promise<unknown>): Promise<{ value: unknown; hit: boolean }> => {
    const version = await currentVersions(db).then((v) => v.data, () => null);
    const e = entries.get(name);
    if (e && (version && e.version ? e.version === version : Date.now() - e.at < FALLBACK_TTL_MS)) return { value: e.value, hit: true };
    const key = `${name}|${version}`;
    let p = inflight.get(key);
    if (!p) {
      p = compute()
        .then((value) => { entries.set(name, { version, at: Date.now(), value }); return value; })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return { value: await p, hit: false };
  };
  const send = async (name: string, res: express.Response, compute: () => Promise<unknown>) => {
    try {
      const { value, hit } = await get(name, compute);
      res.setHeader('X-Cache', hit ? 'hit' : 'miss');
      res.json(value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  return { get, send };
}

export function buildDashboardRouter(db: Lakebase): express.Router {
  const router = express.Router();
  const cache = dashboardCache(db);
  const cached = cache.send;

  const computeSummary = async () => {
    // Independent queries: run together, not one after another.
    const [[totals], [funnel], [intervention], [overContact], [narrative]] = await Promise.all([
    runSql(`
      SELECT
        SUM(MTD_Collections) AS mtd_collections,
        SUM(Monthly_Target) AS monthly_target,
        1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement_pct,
        GREATEST(SUM(Monthly_Target)-SUM(MTD_Collections),0) AS target_gap
      FROM ${GOLD}.qry_mtd_vs_target
    `),
    runSql(`
      SELECT COUNT(DISTINCT Account_ID) AS eligible_accounts
      FROM ${GOLD}.mv_collections_funnel
    `),
    runSql(`
      SELECT COUNT(*) AS immediate_intervention_accounts,
             SUM(Incremental_Recovery_Opportunity) AS recovery_opportunity
      FROM ${GOLD}.qry_immediate_intervention
    `),
    runSql(`
      SELECT COUNT(*) AS over_contact_segments FROM ${GOLD}.qry_over_contact_risk
    `),
    // Written once by deploy.py's `summary` step; missing until that step has run.
    // data_refreshed_at was added later: an older table without it still shows the summary.
    runSql(`
      SELECT narrative, CAST(generated_at AS STRING) AS narrative_generated_at,
             CAST(data_refreshed_at AS STRING) AS data_refreshed_at FROM ${GOLD}.exec_summary LIMIT 1
    `).catch(() => runSql(`
      SELECT narrative, CAST(generated_at AS STRING) AS narrative_generated_at FROM ${GOLD}.exec_summary LIMIT 1
    `)).catch(() => [{ narrative: null, narrative_generated_at: null }]),
    ]);
    return { ...totals, ...funnel, ...intervention, ...overContact, ...narrative };
  };
  router.get('/api/dashboard/summary', (_req, res) => cached('summary', res, computeSummary));

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

  /**
   * Everything the Command Center shows beyond the headline, in one round trip:
   * each panel is a certified-view query (no AI), run in parallel and cached per
   * data version like the rest. A panel that fails comes back empty rather than
   * failing the page.
   */
  const computeOverview = async () => {
    // The app reads gold only; account-level cuts come from the governed metric view.
    const MV = `${GOLD}.mv_collections_funnel`;
    const q = (sql: string) => runSql(sql).catch((err) => {
      console.warn('[dashboard] overview panel failed:', err instanceof Error ? err.message : err);
      return [] as Record<string, string | null>[];
    });
    const [portfolio, funnel, rates, products, shortfall, buckets, heat, channels, actions, topAccounts,
      drivers, strategies, regions, vulnerability, collectors, overContact, opportunity,
      ccKpis, outlook, ccActions, riskSnapshot, channelEff, regionView] = await Promise.all([
      q(`SELECT MEASURE(account_count) AS accounts, MEASURE(outstanding_balance) AS outstanding,
                MEASURE(mtd_collections) AS recovered, MEASURE(total_cost) AS cost,
                MEASURE(cost_to_collect) AS cost_to_collect, MEASURE(high_risk_accounts) AS high_risk,
                MEASURE(digital_penetration) AS digital_penetration, MEASURE(promise_kept_rate) AS promise_kept_rate,
                MEASURE(roll_forward_rate) AS roll_forward_rate, MEASURE(roll_back_rate) AS roll_back_rate,
                MEASURE(average_attempts) AS average_attempts, MEASURE(ptp_amount_total) AS ptp_amount
           FROM ${MV}`),
      q(`SELECT * FROM ${GOLD}.qry_collections_funnel`),
      q(`SELECT * FROM ${GOLD}.qry_funnel_rates`),
      q(`SELECT * FROM ${GOLD}.qry_product_vs_target`),
      q(`SELECT Product, DPD_Bucket, Target_Gap, Contribution_To_Gap_Pct FROM ${GOLD}.qry_shortfall_contribution
          WHERE Target_Gap > 0 ORDER BY Target_Gap DESC LIMIT 6`),
      q(`SELECT DPD_Bucket, SUM(Outstanding_Balance) AS outstanding, SUM(MTD_Collections) AS collected,
                SUM(Monthly_Target) AS target, 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement
           FROM ${GOLD}.qry_product_bucket_performance GROUP BY DPD_Bucket`),
      q(`SELECT Product, DPD_Bucket, Achievement_Pct, Target_Gap FROM ${GOLD}.qry_product_bucket_performance`),
      q(`SELECT * FROM ${GOLD}.qry_recommended_channel`),
      q(`SELECT Recommended_Action, COUNT(*) AS accounts, SUM(Incremental_Recovery_Opportunity) AS opportunity
           FROM ${GOLD}.qry_immediate_intervention GROUP BY Recommended_Action ORDER BY accounts DESC`),
      q(`SELECT Account_ID, Product, DPD, DPD_Bucket, Outstanding_Balance, Incremental_Recovery_Opportunity,
                Payment_Propensity, Preferred_Channel, Primary_Nonpayment_Driver, Recommended_Action
           FROM ${GOLD}.qry_immediate_intervention ORDER BY Incremental_Recovery_Opportunity DESC LIMIT 8`),
      q(`SELECT * FROM ${GOLD}.qry_nonpayment_drivers`),
      q(`SELECT Treatment_Strategy, MEASURE(account_count) AS accounts, MEASURE(balance_recovery_rate) AS recovery_rate,
                MEASURE(cost_to_collect) AS cost_to_collect, MEASURE(ptp_conversion_rate) AS ptp_conversion
           FROM ${MV} GROUP BY Treatment_Strategy ORDER BY recovery_rate DESC`),
      q(`SELECT Region, MEASURE(account_count) AS accounts, MEASURE(outstanding_balance) AS outstanding,
                MEASURE(balance_recovery_rate) AS recovery_rate
           FROM ${MV} GROUP BY Region ORDER BY recovery_rate DESC`),
      q(`SELECT COALESCE(Vulnerability_Type, 'None') AS vulnerability, MEASURE(account_count) AS accounts,
                MEASURE(balance_recovery_rate) AS recovery_rate
           FROM ${MV} GROUP BY 1 ORDER BY accounts DESC`),
      q(`SELECT Collector_ID, Team, Specialization, Assigned_Accounts, Balance_Recovery_Rate, Recovery_MTD, RPC_Rate, PTP_Conversion_Rate
           FROM ${GOLD}.qry_collector_scorecard ORDER BY Balance_Recovery_Rate DESC`),
      q(`SELECT COUNT(*) AS segments, SUM(Account_Count) AS accounts, MAX(Average_Attempts) AS max_attempts
           FROM ${GOLD}.qry_over_contact_risk`),
      q(`SELECT Product, SUM(Intervention_Accounts) AS accounts, SUM(Incremental_Recovery_Opportunity) AS opportunity
           FROM ${GOLD}.qry_recovery_opportunity_sizing GROUP BY Product ORDER BY opportunity DESC`),
      // Command Center views (deploy/sql/70_command_center_views.sql); empty until the deploy's views step has run.
      // All in the same round as the queries above, not after them.
      q(`SELECT * FROM ${GOLD}.qry_cc_kpis`),
      q(`SELECT * FROM ${GOLD}.qry_cc_target_outlook`),
      q(`SELECT * FROM ${GOLD}.qry_cc_actions`),
      q(`SELECT * FROM ${GOLD}.qry_cc_risk_snapshot ORDER BY Bucket_Order`),
      q(`SELECT * FROM ${GOLD}.qry_cc_channel ORDER BY Recovery_Rate DESC`),
      q(`SELECT * FROM ${GOLD}.qry_cc_region ORDER BY Recovery_Rate DESC`),
    ]);
    const top = collectors.slice(0, 10);
    const bottom = collectors.slice(-10).reverse();
    return {
      asOf: '2026-09-15',
      portfolio: portfolio[0] ?? null, funnel: funnel[0] ?? null, rates: rates[0] ?? null,
      products, shortfall, buckets, heat, channels, actions, topAccounts, drivers, strategies, regions, vulnerability,
      collectors: { count: collectors.length, top, bottom, best: collectors[0] ?? null, worst: collectors[collectors.length - 1] ?? null },
      overContact: overContact[0] ?? null, opportunity,
      cc: {
        kpis: ccKpis[0] ?? null, outlook: outlook[0] ?? null, actions: ccActions[0] ?? null,
        riskSnapshot, channels: channelEff, regions: regionView,
      },
    };
  };
  router.get('/api/dashboard/overview', (_req, res) => cached('overview', res, computeOverview));

  router.get('/api/dashboard/funnel-rates', (_req, res) =>
    cached('funnel-rates', res, async () => (await runSql(`SELECT * FROM ${GOLD}.qry_funnel_rates`))[0]));

  // Have the Command Center ready before anyone asks: when the app starts, then whenever the
  // data version changes (a quick Lakebase read every few minutes; the warehouse is only
  // queried when something changed).
  const warm = () => {
    void Promise.all([cache.get('summary', computeSummary), cache.get('overview', computeOverview)])
      .catch((err: unknown) => console.warn('[dashboard] warm-up failed:', err instanceof Error ? err.message : err));
  };
  setTimeout(warm, 3000).unref();
  setInterval(warm, WARM_EVERY_MS).unref();

  return router;
}
