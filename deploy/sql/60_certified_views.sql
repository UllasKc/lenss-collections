-- 16 certified query views (guide Step 4). Snapshot/target dates are the dataset's as-of values.
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

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_immediate_intervention AS
SELECT Account_ID, Product, DPD, DPD_Bucket, Outstanding_Balance, Preferred_Channel,
 Preferred_Language, Vulnerability_Type, Dispute_Flag, RPC_Flag, PTP_Flag,
 Broken_PTP_Flag, Payment_Propensity, Nonpayment_Risk,
 Incremental_Recovery_Opportunity, Primary_Nonpayment_Driver,
 CASE WHEN Dispute_Flag=1 THEN 'Route to dispute resolution'
      WHEN Vulnerability_Type<>'None' THEN 'Route to hardship support'
      WHEN Broken_PTP_Flag=1 AND Payment_Propensity>=0.35 THEN 'Immediate PTP follow-up'
      WHEN RPC_Flag=0 AND Preferred_Channel IN ('WhatsApp','SMS','Email','Digital Self-Cure')
           THEN 'Initiate preferred digital journey'
      WHEN Nonpayment_Risk>=0.80 AND Outstanding_Balance>=50000
           THEN 'Assign to specialist collector'
      ELSE 'Prioritised collector outreach' END AS Recommended_Action
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0 AND Outstanding_Balance > 0
 AND Nonpayment_Risk>=0.70 AND Payment_Propensity>=0.25;

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_over_contact_risk AS
SELECT Treatment_Strategy, Product, DPD_Bucket, Vulnerability_Type,
 COUNT(DISTINCT Account_ID) AS Account_Count, AVG(Attempts_MTD) AS Average_Attempts,
 1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
 1.0*SUM(Cure_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Cure_Rate,
 1.0*SUM(Dispute_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0) AS Dispute_Rate
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Treatment_Strategy, Product, DPD_Bucket, Vulnerability_Type
HAVING COUNT(DISTINCT Account_ID) >= 30 AND AVG(Attempts_MTD) >= 4.5
ORDER BY Average_Attempts DESC, Cure_Rate;

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_product_vs_target AS
SELECT Product, SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target,
       1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct,
       SUM(Monthly_Target)-SUM(MTD_Collections) AS Target_Gap
FROM {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target
GROUP BY Product ORDER BY Achievement_Pct;

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

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_nonpayment_drivers AS
SELECT Primary_Nonpayment_Driver, COUNT(DISTINCT Account_ID) AS Account_Count,
 SUM(Outstanding_Balance) AS Outstanding_Balance, SUM(Recovery_MTD) AS Recovery_MTD,
 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate,
 AVG(Nonpayment_Risk) AS Average_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
GROUP BY Primary_Nonpayment_Driver
ORDER BY Outstanding_Balance DESC, Average_Nonpayment_Risk DESC;

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_underperforming_segments AS
WITH p AS (
 SELECT 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Portfolio_Rate
 FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
), s AS (
 SELECT Product, DPD_Bucket, Balance_Band, Region, Vulnerability_Type,
 COUNT(DISTINCT Account_ID) AS Account_Count, SUM(Outstanding_Balance) AS Outstanding_Balance,
 1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Segment_Rate
 FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
 GROUP BY Product, DPD_Bucket, Balance_Band, Region, Vulnerability_Type
)
SELECT s.*, p.Portfolio_Rate, s.Segment_Rate-p.Portfolio_Rate AS Variance_To_Portfolio,
 CASE WHEN s.Segment_Rate<p.Portfolio_Rate-0.05 THEN 'Materially Underperforming'
      WHEN s.Segment_Rate<p.Portfolio_Rate THEN 'Below Average'
      ELSE 'At or Above Average' END AS Performance_Status
FROM s CROSS JOIN p WHERE s.Account_Count>=30
ORDER BY Variance_To_Portfolio;

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
HAVING COUNT(DISTINCT Account_ID)>=30
ORDER BY Product, DPD_Bucket, Balance_Band, Cure_Rate DESC;

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
 GROUP BY DPD_Bucket, Preferred_Channel HAVING COUNT(DISTINCT Account_ID)>=50
), ranked AS (
 SELECT *, ROW_NUMBER() OVER(PARTITION BY DPD_Bucket ORDER BY Balance_Recovery_Rate DESC, PTP_Conversion_Rate DESC) AS Channel_Rank FROM cp
)
SELECT DPD_Bucket, Preferred_Channel AS Recommended_Channel, Account_Count,
 Balance_Recovery_Rate, PTP_Conversion_Rate, Cost_To_Collect
FROM ranked WHERE Channel_Rank=1 ORDER BY DPD_Bucket;

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_recovery_opportunity_sizing AS
SELECT Product, DPD_Bucket, COUNT(DISTINCT Account_ID) AS Intervention_Accounts,
 SUM(Outstanding_Balance) AS Outstanding_Balance,
 SUM(Incremental_Recovery_Opportunity) AS Incremental_Recovery_Opportunity,
 AVG(Payment_Propensity) AS Average_Payment_Propensity,
 AVG(Nonpayment_Risk) AS Average_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date=DATE '2026-09-15' AND DPD>0
 AND Nonpayment_Risk>=0.70 AND Payment_Propensity>=0.25
GROUP BY Product, DPD_Bucket
ORDER BY Incremental_Recovery_Opportunity DESC;

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
HAVING COUNT(DISTINCT f.Account_ID)>=30
ORDER BY Balance_Recovery_Rate DESC;
