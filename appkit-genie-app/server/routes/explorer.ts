import express from 'express';
import { currentVersions, type Lakebase } from '../lib/answerCache.js';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'cnx_automl_dev.lenss_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}
const BASE = `${GOLD}.qry_explorer_base`;

/** Filterable dimensions: query parameter -> column of qry_explorer_base. */
const DIMS: Record<string, string> = {
  product: 'Product', bucket: 'DPD_Bucket', region: 'Region', channel: 'Preferred_Channel',
  strategy: 'Treatment_Strategy', driver: 'Primary_Nonpayment_Driver', team: 'Collector_Team',
  band: 'Balance_Band', vulnerability: 'Vulnerability_Type',
};
const DATES: Record<string, [string, '>=' | '<=']> = {
  contactFrom: ['Last_Contact_Date', '>='], contactTo: ['Last_Contact_Date', '<='],
  ptpFrom: ['PTP_Due_Date', '>='], ptpTo: ['PTP_Due_Date', '<='],
};

/**
 * Every measure uses the same formula as the governed metric view and certified views
 * (deploy/sql/50_metric_views.sql, 60_certified_views.sql), so with no filters the
 * Explorer reconciles exactly to the Command Center.
 */
const MEASURES = `
  COUNT(DISTINCT Account_ID) AS accounts,
  SUM(Outstanding_Balance) AS outstanding,
  SUM(Recovery_MTD) AS collected,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS recovery_rate,
  SUM(Attempted_Flag) AS attempted,
  SUM(RPC_Flag) AS rpc_accounts,
  1.0*SUM(RPC_Flag)/NULLIF(SUM(Attempted_Flag),0) AS rpc_rate,
  SUM(PTP_Flag) AS ptp_accounts,
  1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS ptp_conversion,
  SUM(PTP_Kept_Flag) AS kept_accounts,
  1.0*SUM(PTP_Kept_Flag)/NULLIF(SUM(PTP_Due_Flag),0) AS promise_kept_rate,
  SUM(PTP_Amount) AS ptp_amount,
  SUM(High_Risk_Flag) AS high_risk,
  1.0*SUM(High_Risk_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS high_risk_share,
  1.0*SUM(Roll_Forward_Flag)/NULLIF(COUNT(Account_ID),0) AS roll_forward_rate,
  1.0*SUM(Roll_Back_Flag)/NULLIF(COUNT(Account_ID),0) AS roll_back_rate,
  SUM(Cost_MTD) AS cost,
  1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0) AS cost_to_collect,
  SUM(Incremental_Recovery_Opportunity) AS opportunity,
  AVG(Payment_Propensity) AS avg_propensity,
  AVG(Nonpayment_Risk) AS avg_risk,
  AVG(Attempts_MTD) AS avg_attempts,
  AVG(DPD) AS avg_dpd`;

type Rows = Record<string, string | null>[];
type Options = { dims: Record<string, string[]>; dates: Record<string, string | null> };

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function buildExplorerRouter(db: Lakebase): express.Router {
  const router = express.Router();

  // Results are cached per data version, like the Command Center; filters are part of the key.
  const entries = new Map<string, { version: string | null; at: number; value: unknown }>();
  async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const version = await currentVersions(db).then((v) => v.data, () => null);
    const e = entries.get(key);
    if (e && (version && e.version ? e.version === version : Date.now() - e.at < 10 * 60_000)) return e.value as T;
    const value = await compute();
    if (entries.size > 300) entries.clear();
    entries.set(key, { version, at: Date.now(), value });
    return value;
  }

  const options = () => cached<Options>('options', async () => {
    const dims: Record<string, string[]> = {};
    const lists = await Promise.all(Object.entries(DIMS).map(([k, col]) =>
      runSql(`SELECT ${col} AS v FROM ${BASE} WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY ${col === 'DPD_Bucket' ? 'MIN(Bucket_Order)' : col}`)
        .then((rows) => [k, rows.map((r) => String(r.v))] as const)));
    for (const [k, v] of lists) dims[k] = v;
    const [d] = await runSql(`SELECT CAST(MIN(Last_Contact_Date) AS STRING) AS contactMin, CAST(MAX(Last_Contact_Date) AS STRING) AS contactMax,
      CAST(MIN(PTP_Due_Date) AS STRING) AS ptpMin, CAST(MAX(PTP_Due_Date) AS STRING) AS ptpMax FROM ${BASE}`);
    return { dims, dates: d ?? {} };
  });

  /** Only values that exist in the data are accepted, so nothing user-typed reaches the SQL. */
  /** The WHERE clause for the request's filters; `alias` prefixes the columns (e.g. 'b.') when the query joins tables. */
  async function filtersFrom(query: express.Request['query'], alias = '') {
    const opts = await options();
    const clauses: string[] = [];
    const applied: Record<string, string> = {};
    for (const [k, col] of Object.entries(DIMS)) {
      const v = typeof query[k] === 'string' ? query[k] as string : '';
      if (!v) continue;
      if (!opts.dims[k]?.includes(v)) throw Object.assign(new Error(`Unknown ${k}: ${v}`), { status: 400 });
      clauses.push(`${alias}${col} = ${sqlStr(v)}`);
      applied[k] = v;
    }
    for (const [k, [col, op]] of Object.entries(DATES)) {
      const v = typeof query[k] === 'string' ? query[k] as string : '';
      if (!v) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw Object.assign(new Error(`Bad date for ${k}`), { status: 400 });
      clauses.push(`${alias}${col} ${op} DATE '${v}'`);
      applied[k] = v;
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', applied };
  }

  const fail = (res: express.Response, err: unknown) => {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  };

  router.get('/api/explorer/options', async (_req, res) => {
    try { res.json(await options()); } catch (err) { fail(res, err); }
  });

  /**
   * The accounts behind any Explorer chart item: the current filters plus the item's own
   * (a product, stage, region, … sent as one more filter, so it is checked the same way),
   * optionally narrowed to a funnel stage or one collector. Same columns as the Command
   * Center's lists, so the browser shows them in the same window.
   */
  const STAGES: Record<string, string> = {
    attempted: 'b.Attempted_Flag = 1', not_reached: 'b.Attempted_Flag = 1 AND b.RPC_Flag = 0', reached: 'b.RPC_Flag = 1',
    promised: 'b.PTP_Flag = 1', due: 'b.PTP_Due_Flag = 1', kept: 'b.PTP_Kept_Flag = 1', broken: 'b.Broken_PTP_Flag = 1',
    high_risk: 'b.High_Risk_Flag = 1', worsening: 'b.Roll_Forward_Flag = 1',
  };
  router.get('/api/explorer/accounts', async (req, res) => {
    try {
      const { where, applied } = await filtersFrom(req.query, 'b.');
      const clauses = where ? [where.replace(/^WHERE /, '')] : [];
      const stage = typeof req.query.stage === 'string' ? req.query.stage : '';
      if (stage) {
        if (!STAGES[stage]) throw Object.assign(new Error(`Unknown stage: ${stage}`), { status: 400 });
        clauses.push(STAGES[stage]);
      }
      const collector = typeof req.query.collector === 'string' ? req.query.collector : '';
      if (collector) {
        if (!/^[A-Za-z0-9_-]{1,30}$/.test(collector)) throw Object.assign(new Error('Bad collector'), { status: 400 });
        clauses.push(`b.Collector_ID = ${sqlStr(collector)}`);
      }
      const w = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const from = `FROM ${BASE} b LEFT JOIN ${GOLD}.qry_immediate_intervention i ON i.Account_ID = b.Account_ID`;
      const value = await cached('accounts:' + JSON.stringify({ applied, stage, collector }), async () => {
        const [[totals], rows] = await Promise.all([
          runSql(`SELECT COUNT(*) AS accounts, SUM(b.Outstanding_Balance) AS balance, SUM(b.Incremental_Recovery_Opportunity) AS recoverable ${from} ${w}`),
          runSql(`SELECT b.Account_ID, b.Product, b.DPD, b.DPD_Bucket, b.Region, b.Outstanding_Balance, b.Incremental_Recovery_Opportunity,
                         b.Payment_Propensity, b.Nonpayment_Risk, b.PTP_Amount, CAST(b.PTP_Due_Date AS STRING) AS PTP_Due_Date, b.Broken_PTP_Flag,
                         b.Attempts_MTD, b.RPC_Flag, b.Primary_Nonpayment_Driver, b.Preferred_Channel, b.Vulnerability_Type, b.Collector_ID,
                         i.Recommended_Action
                    ${from} ${w} ORDER BY b.Incremental_Recovery_Opportunity DESC LIMIT 1000`),
        ]);
        return { totals, rows, truncated: Number(totals?.accounts ?? 0) > rows.length };
      });
      res.json(value);
    } catch (err) { fail(res, err); }
  });

  /**
   * One round trip for the whole Explorer: filtered headline measures (and the whole
   * portfolio for comparison), the funnel, the "why" breakdowns, collectors, targets and
   * the accounts behind it all. A breakdown that fails comes back empty.
   */
  router.get('/api/explorer/data', async (req, res) => {
    try {
      const { where, applied } = await filtersFrom(req.query);
      const key = 'data:' + JSON.stringify(applied);
      const value = await cached(key, async () => {
        const q = (sql: string) => runSql(sql).catch((err): Rows => {
          console.warn('[explorer] query failed:', err instanceof Error ? err.message : err);
          return [];
        });
        const by = (col: string, order = 'outstanding DESC') =>
          q(`SELECT ${col} AS k, ${MEASURES} FROM ${BASE} ${where} GROUP BY ${col} ORDER BY ${order}`);
        // Targets exist only at product x arrears-stage grain, so only those two filters apply to them.
        const tWhere = [applied.product && `Product = ${sqlStr(applied.product)}`, applied.bucket && `DPD_Bucket = ${sqlStr(applied.bucket)}`].filter(Boolean);
        const [totals, portfolio, products, buckets, regions, channels, strategies, drivers, teams, bands, vulnerability,
          collectors, targets, accounts, cells, chanBucket] = await Promise.all([
          q(`SELECT ${MEASURES} FROM ${BASE} ${where}`),
          cached('portfolio', () => q(`SELECT ${MEASURES} FROM ${BASE}`)),
          by('Product'),
          q(`SELECT DPD_Bucket AS k, MIN(Bucket_Order) AS ord, ${MEASURES} FROM ${BASE} ${where} GROUP BY DPD_Bucket ORDER BY ord`),
          by('Region', 'recovery_rate DESC'),
          by('Preferred_Channel', 'recovery_rate DESC'),
          by('Treatment_Strategy', 'recovery_rate DESC'),
          by('Primary_Nonpayment_Driver', 'accounts DESC'),
          by('Collector_Team', 'recovery_rate DESC'),
          by('Balance_Band'),
          by('Vulnerability_Type', 'accounts DESC'),
          q(`SELECT Collector_ID AS k, MAX(Collector_Team) AS team, MAX(Collector_Specialization) AS specialization, ${MEASURES}
               FROM ${BASE} ${where} GROUP BY Collector_ID HAVING COUNT(DISTINCT Account_ID) >= 30 ORDER BY recovery_rate DESC`),
          q(`SELECT Product, DPD_Bucket, SUM(MTD_Collections) AS collected, SUM(Monthly_Target) AS target,
                    1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS achievement,
                    GREATEST(SUM(Monthly_Target)-SUM(MTD_Collections),0) AS gap
               FROM ${GOLD}.qry_product_bucket_performance ${tWhere.length ? 'WHERE ' + tWhere.join(' AND ') : ''}
              GROUP BY Product, DPD_Bucket`),
          q(`SELECT Account_ID, Product, DPD_Bucket, DPD, Region, Preferred_Channel, Treatment_Strategy, Primary_Nonpayment_Driver,
                    Collector_ID, Collector_Team, CAST(Last_Contact_Date AS STRING) AS Last_Contact_Date,
                    CAST(PTP_Due_Date AS STRING) AS PTP_Due_Date, PTP_Flag, PTP_Amount, Broken_PTP_Flag,
                    Outstanding_Balance, Recovery_MTD, Incremental_Recovery_Opportunity, Payment_Propensity, Nonpayment_Risk
               FROM ${BASE} ${where} ORDER BY Incremental_Recovery_Opportunity DESC LIMIT 500`),
          q(`SELECT Product, DPD_Bucket, MIN(Bucket_Order) AS ord, ${MEASURES} FROM ${BASE} ${where}
              GROUP BY Product, DPD_Bucket ORDER BY recovery_rate, outstanding DESC`),
          // Best channel per arrears stage: same rule as qry_recommended_channel (segments of 50+
          // accounts, ranked by recovery rate, then promise conversion).
          q(`SELECT DPD_Bucket, Preferred_Channel, MIN(Bucket_Order) AS ord, ${MEASURES} FROM ${BASE} ${where}
              GROUP BY DPD_Bucket, Preferred_Channel HAVING COUNT(DISTINCT Account_ID) >= 50`),
        ]);
        const best = new Map<string, Record<string, string | null>>();
        for (const r of chanBucket) {
          const cur = best.get(String(r.DPD_Bucket));
          const better = !cur || Number(r.recovery_rate) > Number(cur.recovery_rate)
            || (Number(r.recovery_rate) === Number(cur.recovery_rate) && Number(r.ptp_conversion) > Number(cur.ptp_conversion));
          if (better) best.set(String(r.DPD_Bucket), r);
        }
        return {
          asOf: '2026-09-15', applied, totals: totals[0] ?? null, portfolio: portfolio[0] ?? null,
          by: { product: products, bucket: buckets, region: regions, channel: channels, strategy: strategies,
            driver: drivers, team: teams, band: bands, vulnerability },
          collectors: { count: collectors.length, top: collectors.slice(0, 10), bottom: collectors.slice(-10).reverse() },
          targets, targetsFiltered: Object.keys(applied).some((k) => k !== 'product' && k !== 'bucket'),
          accounts, cells,
          bestChannel: [...best.values()].sort((a, b) => Number(a.ord) - Number(b.ord)),
        };
      });
      res.json(value);
    } catch (err) { fail(res, err); }
  });

  return router;
}
