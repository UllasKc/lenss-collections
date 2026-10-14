-- 16 certified query views (guide Step 4), built from the client's SQL library
-- (LensS_Collections_Demo_Sample_SQL_Queries.docx, queries 1-20). Snapshot/target dates are the
-- dataset's as-of values. Thresholds are read live from gold.qry_rules ({{live:<name>}} is expanded
-- by the deploy), so every value comes from gold.business_rules_config.
-- Each view carries a description (COMMENT ON TABLE / COLUMN) saying the business question it
-- answers, its grain and rules, and when to use it. Genie and Catalog Explorer read these; edit them
-- here, never in the UI (CREATE OR REPLACE on every deploy would wipe UI edits).

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target AS
WITH recovery AS (
  SELECT DATE_TRUNC('month', Snapshot_Date) AS Reporting_Month, Product, DPD_Bucket,
         SUM(Recovery_MTD) AS MTD_Collections
  FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
  GROUP BY DATE_TRUNC('month', Snapshot_Date), Product, DPD_Bucket
), target AS (
  SELECT Target_Month, Product, DPD_Bucket, SUM(Monthly_Target) AS Monthly_Target,
         SUM(Eligible_Balance) AS Eligible_Balance, SUM(Daily_Target) AS Daily_Target
  FROM {{catalog}}.{{prefix}}_silver.fact_targets
  WHERE Target_Month = DATE '2026-09-01'
  GROUP BY Target_Month, Product, DPD_Bucket
)
SELECT r.Reporting_Month, r.Product, r.DPD_Bucket, r.MTD_Collections, t.Monthly_Target,
       t.Eligible_Balance, t.Daily_Target,
       1.0*r.MTD_Collections/NULLIF(t.Monthly_Target,0) AS Target_Achievement_Pct,
       GREATEST(t.Monthly_Target-r.MTD_Collections,0) AS Target_Gap
FROM recovery r LEFT JOIN target t
  ON r.Reporting_Month=t.Target_Month AND r.Product=t.Product AND r.DPD_Bucket=t.DPD_Bucket;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target IS 'Answers: "What is my MTD collections performance versus target?" (client query 1). One row per product x DPD bucket for September 2026: collections month to date (accounts in collections, snapshot 15 Sep 2026) against the monthly target, achievement % and remaining gap. The source of truth for every target question: SUM the columns for the portfolio headline (as on the Command Center); use qry_product_vs_target for the per-product summary.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target.MTD_Collections IS 'Recovered month to date (INR), accounts with DPD > 0';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target.Monthly_Target IS 'September 2026 recovery target (INR), aggregated at its own grain before the join';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target.Target_Achievement_Pct IS 'MTD_Collections / Monthly_Target (a fraction: 0.9 = 90%)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target.Target_Gap IS 'Target still to collect (INR), never negative';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_month_end_forecast AS
WITH c AS (
 SELECT Snapshot_Date, SUM(Recovery_MTD) AS MTD_Collections
 FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
 WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0 GROUP BY Snapshot_Date
), t AS (
 SELECT SUM(Monthly_Target) AS Monthly_Target FROM {{catalog}}.{{prefix}}_silver.fact_targets
 WHERE Target_Month = DATE '2026-09-01'
)
SELECT c.Snapshot_Date, c.MTD_Collections, t.Monthly_Target,
       1.0*c.MTD_Collections/EXTRACT(DAY FROM c.Snapshot_Date) AS Average_Daily_Recovery,
       1.0*c.MTD_Collections/EXTRACT(DAY FROM c.Snapshot_Date)
         * EXTRACT(DAY FROM LAST_DAY(c.Snapshot_Date)) AS Forecast_Collections,
       (1.0*c.MTD_Collections/EXTRACT(DAY FROM c.Snapshot_Date)
         * EXTRACT(DAY FROM LAST_DAY(c.Snapshot_Date)))/NULLIF(t.Monthly_Target,0) AS Forecast_Target_Achievement_Pct
FROM c CROSS JOIN t;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_month_end_forecast IS 'Client query 5 (calendar-day run-rate forecast), kept for reference only and deliberately NOT a Genie source: on a single mid-month snapshot it projects ~174% of target, contradicting MTD versus target. The app never forecasts; the Command Center outlook (qry_cc_target_outlook) is a promise pipeline, not a forecast.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_kpi_drivers AS
SELECT Product, DPD_Bucket, COUNT(DISTINCT Account_ID) AS Account_Count,
 SUM(Outstanding_Balance) AS Outstanding_Balance, SUM(Recovery_MTD) AS Recovery_MTD,
 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Balance_Recovery_Rate,
 1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
 1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
 1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date THEN 1 ELSE 0 END),0) AS Broken_Promise_Rate,
 1.0*SUM(Cure_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Cure_Rate,
 AVG(Attempts_MTD) AS Average_Attempts
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Product, DPD_Bucket
ORDER BY Balance_Recovery_Rate, Outstanding_Balance DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_kpi_drivers IS 'Answers: "Why are collections lagging this month?" and "Which product and DPD bucket combinations are driving the shortfall?" (client query 8). One row per product x DPD bucket with the funnel drivers: balance recovery rate, RPC rate, PTP conversion, broken-promise rate and average attempts. Use for root cause by product and bucket; for the shortfall in money use qry_shortfall_contribution. Do not report Cure_Rate (always 0 in this population).';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_kpi_drivers.Balance_Recovery_Rate IS 'Recovered MTD / outstanding balance';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_kpi_drivers.RPC_Rate IS 'Right-party contacts / accounts attempted';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_kpi_drivers.PTP_Conversion_Rate IS 'Promises to pay / right-party contacts';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_kpi_drivers.Broken_Promise_Rate IS 'Broken promises / promises already due (matured)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_kpi_drivers.Cure_Rate IS 'Always 0 here (cured accounts leave the DPD > 0 population): do not report';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_immediate_intervention AS
SELECT Account_ID, Product, DPD, DPD_Bucket, Outstanding_Balance, Preferred_Channel,
 Preferred_Language, Vulnerability_Type, Dispute_Flag, RPC_Flag, PTP_Flag,
 Broken_PTP_Flag, Payment_Propensity, Nonpayment_Risk,
 Incremental_Recovery_Opportunity, Primary_Nonpayment_Driver,
 CASE WHEN Dispute_Flag=1 THEN 'Route to dispute resolution'
      WHEN Vulnerability_Type<>'None' THEN 'Route to hardship support'
      WHEN Broken_PTP_Flag=1 AND Payment_Propensity>={{live:ptp_followup_propensity}} THEN 'Immediate PTP follow-up'
      WHEN RPC_Flag=0 AND Preferred_Channel IN ('WhatsApp','SMS','Email','Digital Self-Cure')
           THEN 'Initiate preferred digital journey'
      WHEN Nonpayment_Risk>={{live:specialist_risk_threshold}} AND Outstanding_Balance>={{live:specialist_balance_threshold}}
           THEN 'Assign to specialist collector'
      ELSE 'Prioritised collector outreach' END AS Recommended_Action
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0 AND Outstanding_Balance > 0
 AND Nonpayment_Risk>={{live:high_risk_threshold}} AND Payment_Propensity>={{live:intervention_propensity_threshold}};
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_immediate_intervention IS 'Answers: "Which accounts require immediate intervention?" (client query 16, workbook rule R08). One row per account: high risk (Nonpayment_Risk >= high_risk_threshold, 0.70) yet still likely to pay (Payment_Propensity >= intervention_propensity_threshold, 0.25), with a balance, on 15 Sep 2026, plus the recommended next action. Account IDs only, no customer identity. Use for "which accounts to prioritise / act on"; for the money by product and bucket use qry_recovery_opportunity_sizing.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_immediate_intervention.Account_ID IS 'Account identifier (no customer identity)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_immediate_intervention.Incremental_Recovery_Opportunity IS 'Estimated extra recovery (INR) from working this account';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_immediate_intervention.Recommended_Action IS 'Next step, in order: dispute -> dispute resolution; vulnerable -> hardship support; broken promise and propensity >= 0.35 -> PTP follow-up; not reached and prefers a digital channel -> digital journey; risk >= 0.80 and balance >= 50,000 -> specialist collector; otherwise prioritised outreach (thresholds in business_rules_config)';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_over_contact_risk AS
SELECT Treatment_Strategy, Product, DPD_Bucket, Vulnerability_Type,
 COUNT(DISTINCT Account_ID) AS Account_Count, AVG(Attempts_MTD) AS Average_Attempts,
 1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
 1.0*SUM(Cure_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Cure_Rate,
 1.0*SUM(Dispute_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Dispute_Rate
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Treatment_Strategy, Product, DPD_Bucket, Vulnerability_Type
HAVING COUNT(DISTINCT Account_ID) >= {{live:min_segment_volume}} AND AVG(Attempts_MTD) >= {{live:over_contact_attempts_threshold}}
ORDER BY Average_Attempts DESC, Cure_Rate;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_over_contact_risk IS 'Answers: "Are our current collections policies too aggressive?" (client query 18, workbook rule R14). One row per strategy x product x DPD bucket x vulnerability segment with at least min_segment_volume (30) accounts whose average contact attempts reach over_contact_attempts_threshold (4.5, recalibrated from 6.0 which the data never reaches), with RPC and dispute rates. An empty result means no segment is over-contacted. Do not report Cure_Rate.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_over_contact_risk.Average_Attempts IS 'Average contact attempts month to date per account';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_over_contact_risk.Dispute_Rate IS 'Share of accounts with a dispute';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_product_vs_target AS
SELECT Product, SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target,
       1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct,
       SUM(Monthly_Target)-SUM(MTD_Collections) AS Target_Gap
FROM {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target
GROUP BY Product ORDER BY Achievement_Pct;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_product_vs_target IS 'Answers: "Which product is underperforming versus target?" and "How is each product doing against target?" (client query 2). One row per product: qry_mtd_vs_target summed to product. Use for product-level target questions; use qry_mtd_vs_target for product x DPD bucket or the portfolio headline.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_product_vs_target.Achievement_Pct IS 'MTD collections / monthly target (a fraction)';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_product_bucket_performance AS
SELECT r.Product, r.DPD_Bucket, r.Outstanding_Balance, r.MTD_Collections, t.Monthly_Target,
       1.0*r.MTD_Collections/NULLIF(t.Monthly_Target,0) AS Achievement_Pct,
       GREATEST(t.Monthly_Target-r.MTD_Collections,0) AS Target_Gap
FROM (
  SELECT Product, DPD_Bucket, SUM(Outstanding_Balance) AS Outstanding_Balance, SUM(Recovery_MTD) AS MTD_Collections
  FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
  GROUP BY Product, DPD_Bucket
) r
LEFT JOIN (
  SELECT Product, DPD_Bucket, SUM(Monthly_Target) AS Monthly_Target
  FROM {{catalog}}.{{prefix}}_silver.fact_targets WHERE Target_Month=DATE '2026-09-01'
  GROUP BY Product, DPD_Bucket
) t ON r.Product=t.Product AND r.DPD_Bucket=t.DPD_Bucket
ORDER BY Achievement_Pct, Target_Gap DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_product_bucket_performance IS 'Answers: "Which products and delinquency buckets are furthest behind target, and how much balance sits there?" (client query 3). One row per product x DPD bucket with outstanding balance, MTD collections, target, achievement and gap. Same figures as qry_mtd_vs_target plus the outstanding balance; prefer qry_mtd_vs_target unless the balance is needed. Feeds the Command Center heatmap.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_shortfall_contribution AS
WITH perf AS (
  SELECT Product, DPD_Bucket, SUM(Recovery_MTD) AS MTD_Collections
  FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
  GROUP BY Product, DPD_Bucket
), tgt AS (
  SELECT Product, DPD_Bucket, SUM(Monthly_Target) AS Monthly_Target
  FROM {{catalog}}.{{prefix}}_silver.fact_targets WHERE Target_Month = DATE '2026-09-01'
  GROUP BY Product, DPD_Bucket
), gaps AS (
  SELECT p.Product, p.DPD_Bucket, p.MTD_Collections, t.Monthly_Target,
         GREATEST(t.Monthly_Target - p.MTD_Collections, 0) AS Target_Gap
  FROM perf p LEFT JOIN tgt t ON p.Product=t.Product AND p.DPD_Bucket=t.DPD_Bucket
)
SELECT *, 1.0*Target_Gap/NULLIF(SUM(Target_Gap) OVER(),0) AS Contribution_To_Gap_Pct
FROM gaps ORDER BY Target_Gap DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_shortfall_contribution IS 'Answers: "Which portfolios are contributing most to the shortfall / the gap?" (client query 4). One row per product x DPD bucket with its target gap and its share of the total gap. Use for "where is the shortfall coming from" in money; use qry_kpi_drivers for why.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_shortfall_contribution.Contribution_To_Gap_Pct IS 'This segment''s gap / the total gap (a fraction)';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_collections_funnel AS
SELECT
 COUNT(DISTINCT CASE WHEN DPD>0 THEN Account_ID END) AS Eligible_Accounts,
 COUNT(DISTINCT CASE WHEN Attempts_MTD>0 THEN Account_ID END) AS Attempted_Accounts,
 COUNT(DISTINCT CASE WHEN RPC_Flag=1 THEN Account_ID END) AS RPC_Accounts,
 COUNT(DISTINCT CASE WHEN PTP_Flag=1 THEN Account_ID END) AS PTP_Accounts,
 COUNT(DISTINCT CASE WHEN PTP_Due_Date<=Snapshot_Date AND Broken_PTP_Flag=0 THEN Account_ID END) AS Kept_PTP_Accounts,
 COUNT(DISTINCT CASE WHEN Cure_Flag=1 THEN Account_ID END) AS Cured_Accounts
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_collections_funnel IS 'Answers: "How many accounts make it through each stage of the collections funnel?" (client query 6). One row of portfolio-wide account COUNTS: eligible, attempted, right-party contact, promise to pay, promise kept. For the funnel as RATES use qry_funnel_rates; for rates by product, region or any other dimension use the metric view mv_collections_funnel. Do not report Cured_Accounts.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_funnel_rates AS
SELECT
 1.0*COUNT(DISTINCT CASE WHEN Contacted_Flag=1 THEN Account_ID END)
  /NULLIF(COUNT(DISTINCT CASE WHEN Attempts_MTD>0 THEN Account_ID END),0) AS Contact_Rate,
 1.0*COUNT(DISTINCT CASE WHEN RPC_Flag=1 THEN Account_ID END)
  /NULLIF(COUNT(DISTINCT CASE WHEN Attempts_MTD>0 THEN Account_ID END),0) AS RPC_Rate,
 1.0*COUNT(DISTINCT CASE WHEN PTP_Flag=1 THEN Account_ID END)
  /NULLIF(COUNT(DISTINCT CASE WHEN RPC_Flag=1 THEN Account_ID END),0) AS PTP_Conversion_Rate,
 1.0*COUNT(DISTINCT CASE WHEN Broken_PTP_Flag=1 THEN Account_ID END)
  /NULLIF(COUNT(DISTINCT CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date
                              THEN Account_ID END),0) AS Broken_Promise_Rate
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_funnel_rates IS 'Answers: "What are our contact, RPC, PTP conversion and broken-promise rates?" for the whole portfolio (client query 7). One row of portfolio-wide RATES. For the same rates by product, region, channel, strategy or any other dimension use the metric view mv_collections_funnel (MEASURE(rpc_rate) ... GROUP BY ...); for stage counts use qry_collections_funnel.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_funnel_rates.Contact_Rate IS 'Accounts contacted / accounts attempted';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_funnel_rates.RPC_Rate IS 'Accounts with a right-party contact / accounts attempted';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_funnel_rates.PTP_Conversion_Rate IS 'Accounts promising to pay / accounts reached (RPC)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_funnel_rates.Broken_Promise_Rate IS 'Broken promises / promises already due';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_nonpayment_drivers AS
SELECT Primary_Nonpayment_Driver, COUNT(DISTINCT Account_ID) AS Account_Count,
 SUM(Outstanding_Balance) AS Outstanding_Balance, SUM(Recovery_MTD) AS Recovery_MTD,
 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate,
 AVG(Nonpayment_Risk) AS Average_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
GROUP BY Primary_Nonpayment_Driver
ORDER BY Outstanding_Balance DESC, Average_Nonpayment_Risk DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_nonpayment_drivers IS 'Answers: "Why are customers not paying?", "Which non-payment drivers hold the most balance or recover worst?" and the reasons behind broken promises (client query 9). One row per primary non-payment driver (job loss, medical hardship, temporary cash flow, dispute...) with accounts, balance, recovery rate and average risk.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_nonpayment_drivers.Primary_Nonpayment_Driver IS 'Main reason the customer is not paying';

-- R09 (workbook): a segment underperforms when its target achievement is more than
-- underperformance_gap_pts below the portfolio's. Targets exist only per product x DPD bucket,
-- so that is the grain the rule can be applied at. (Before 2026-10-14 this view compared balance
-- recovery rates, where a 5-point gap can never occur at ~4% recovery, so it flagged nothing.)
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_underperforming_segments AS
WITH a AS (
 SELECT Product, DPD_Bucket, COUNT(DISTINCT Account_ID) AS Account_Count,
  SUM(Outstanding_Balance) AS Outstanding_Balance, SUM(Recovery_MTD) AS MTD_Collections
 FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
 WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
 GROUP BY Product, DPD_Bucket
), t AS (
 SELECT Product, DPD_Bucket, SUM(Monthly_Target) AS Monthly_Target
 FROM {{catalog}}.{{prefix}}_silver.fact_targets WHERE Target_Month=DATE '2026-09-01'
 GROUP BY Product, DPD_Bucket
), j AS (
 SELECT a.*, t.Monthly_Target, 1.0*a.MTD_Collections/NULLIF(t.Monthly_Target,0) AS Target_Achievement_Pct,
  1.0*a.MTD_Collections/NULLIF(a.Outstanding_Balance,0) AS Balance_Recovery_Rate
 FROM a JOIN t ON a.Product=t.Product AND a.DPD_Bucket=t.DPD_Bucket
), p AS (
 SELECT 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Portfolio_Achievement_Pct FROM j
)
SELECT j.Product, j.DPD_Bucket, j.Account_Count, j.Outstanding_Balance, j.MTD_Collections, j.Monthly_Target,
 j.Target_Achievement_Pct, p.Portfolio_Achievement_Pct,
 j.Target_Achievement_Pct - p.Portfolio_Achievement_Pct AS Variance_To_Portfolio,
 j.Balance_Recovery_Rate,
 CASE WHEN j.Target_Achievement_Pct < p.Portfolio_Achievement_Pct - {{live:underperformance_gap_pts}} THEN 'Materially Underperforming'
      WHEN j.Target_Achievement_Pct < p.Portfolio_Achievement_Pct THEN 'Below Portfolio'
      ELSE 'At or Above Portfolio' END AS Performance_Status
FROM j CROSS JOIN p
WHERE j.Account_Count >= {{live:min_segment_volume}}
ORDER BY Variance_To_Portfolio;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_underperforming_segments IS 'Answers: "Which segments are underperforming?" (client query 10, workbook rule R09). One row per product x DPD bucket (the grain targets exist at): target achievement against the portfolio''s achievement. Materially Underperforming = more than underperformance_gap_pts (5 points) below the portfolio; Below Portfolio = below it by less. For weak recovery by balance band, region or vulnerability (no targets at that grain) use the metric view mv_collections_funnel, MEASURE(balance_recovery_rate) grouped by those columns.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_underperforming_segments.Target_Achievement_Pct IS 'MTD collections / monthly target for this product x bucket (a fraction)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_underperforming_segments.Portfolio_Achievement_Pct IS 'The same for the whole portfolio (matches the Command Center)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_underperforming_segments.Variance_To_Portfolio IS 'Target_Achievement_Pct minus Portfolio_Achievement_Pct (a fraction: -0.05 = 5 points below)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_underperforming_segments.Performance_Status IS 'Materially Underperforming (more than 5 points below the portfolio, rule R09), Below Portfolio, or At or Above Portfolio';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_strategy_like_for_like AS
SELECT Product, DPD_Bucket, Balance_Band, Vulnerability_Type, Treatment_Strategy,
 COUNT(DISTINCT Account_ID) AS Account_Count,
 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Balance_Recovery_Rate,
 1.0*SUM(Cure_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Cure_Rate,
 1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
 1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0) AS Cost_To_Collect
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
GROUP BY Product, DPD_Bucket, Balance_Band, Vulnerability_Type, Treatment_Strategy
HAVING COUNT(DISTINCT Account_ID)>={{live:min_segment_volume}}
ORDER BY Product, DPD_Bucket, Balance_Band, Cure_Rate DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_strategy_like_for_like IS 'Answers: "Which treatment strategies perform best like-for-like?" and, with the uplift guardrail, "What uplift would another strategy deliver?" (client query 13, workbook rule R12). One row per strategy within a matched segment (product x DPD bucket x balance band x vulnerability) with at least min_segment_volume (30) accounts. Region is not a matching dimension: with it no segment keeps 30 accounts per strategy (57 comparable segments become 0), and strategies are spread evenly across regions (~13% each). Observational, not a controlled experiment. Do not report Cure_Rate.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_strategy_like_for_like.Cost_To_Collect IS 'Collection cost / amount recovered';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_recommended_channel AS
-- Ranked by balance recovery rate, then PTP conversion. (Cure rate is not used:
-- cured accounts drop to DPD 0 and fall outside this population, so it is always 0.)
WITH cp AS (
 SELECT DPD_Bucket, Preferred_Channel, COUNT(DISTINCT Account_ID) AS Account_Count,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Balance_Recovery_Rate,
  1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
  1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0) AS Cost_To_Collect
 FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
 WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
 GROUP BY DPD_Bucket, Preferred_Channel HAVING COUNT(DISTINCT Account_ID)>={{live:min_channel_volume}}
), ranked AS (
 SELECT *, ROW_NUMBER() OVER(PARTITION BY DPD_Bucket ORDER BY Balance_Recovery_Rate DESC, PTP_Conversion_Rate DESC) AS Channel_Rank FROM cp
)
SELECT DPD_Bucket, Preferred_Channel AS Recommended_Channel, Account_Count,
 Balance_Recovery_Rate, PTP_Conversion_Rate, Cost_To_Collect
FROM ranked WHERE Channel_Rank=1 ORDER BY DPD_Bucket;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_recommended_channel IS 'Answers: "Which channel should we use for each DPD bucket?" (client query 15, workbook rule R11). One row per DPD bucket: the preferred channel with the best balance recovery rate (then PTP conversion), among channels with at least min_channel_volume (50) accounts. Recovery is attributed to the customer''s preferred channel (a demo limitation; production needs event-level attribution). For channel effectiveness overall use qry_cc_channel.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_recovery_opportunity_sizing AS
SELECT Product, DPD_Bucket, COUNT(DISTINCT Account_ID) AS Intervention_Accounts,
 SUM(Outstanding_Balance) AS Outstanding_Balance,
 SUM(Incremental_Recovery_Opportunity) AS Incremental_Recovery_Opportunity,
 AVG(Payment_Propensity) AS Average_Payment_Propensity,
 AVG(Nonpayment_Risk) AS Average_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
 AND Nonpayment_Risk>={{live:high_risk_threshold}} AND Payment_Propensity>={{live:intervention_propensity_threshold}}
GROUP BY Product, DPD_Bucket
ORDER BY Incremental_Recovery_Opportunity DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_recovery_opportunity_sizing IS 'Answers: "What recovery opportunity can help close the gap?" and "Where is the biggest recovery opportunity?" (client query 17). One row per product x DPD bucket: the immediate-intervention accounts (same rule as qry_immediate_intervention, R08) and their incremental recovery opportunity in INR. Use for the money; use qry_immediate_intervention for the account list.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_collector_scorecard AS
SELECT f.Collector_ID, d.Team, d.Specialization,
 COUNT(DISTINCT f.Account_ID) AS Assigned_Accounts, SUM(f.Outstanding_Balance) AS Assigned_Balance,
 SUM(f.Recovery_MTD) AS Recovery_MTD,
 1.0*SUM(f.Recovery_MTD)/NULLIF(SUM(f.Outstanding_Balance),0) AS Balance_Recovery_Rate,
 1.0*SUM(f.RPC_Flag)/NULLIF(SUM(CASE WHEN f.Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
 1.0*SUM(f.PTP_Flag)/NULLIF(SUM(f.RPC_Flag),0) AS PTP_Conversion_Rate,
 1.0*SUM(f.Cure_Flag)/NULLIF(COUNT(DISTINCT f.Account_ID),0) AS Cure_Rate,
 1.0*SUM(f.Recovery_MTD)/NULLIF(COUNT(DISTINCT f.Account_ID),0) AS Recovery_Per_Account,
 1.0*SUM(f.Cost_MTD)/NULLIF(SUM(f.Recovery_MTD),0) AS Cost_To_Collect
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot f
LEFT JOIN {{catalog}}.{{prefix}}_silver.dim_collector d ON f.Collector_ID=d.Collector_ID
WHERE f.Snapshot_Date=DATE '2026-09-15' AND f.DPD>0
GROUP BY f.Collector_ID, d.Team, d.Specialization
HAVING COUNT(DISTINCT f.Account_ID)>={{live:min_segment_volume}}
ORDER BY Balance_Recovery_Rate DESC;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_collector_scorecard IS 'Answers: "Which collectors are performing best?" and "How do our collectors compare?" (client query 20). One row per collector with at least min_segment_volume (30) accounts: recovery, RPC, PTP conversion, recovery per account and cost to collect, with team and specialisation. For team-level rates use the metric view mv_collections_funnel grouped by Collector_Team. Do not report Cure_Rate.';
