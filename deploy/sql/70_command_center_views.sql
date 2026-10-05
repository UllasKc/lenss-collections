-- Command Center views (Step 8i): the executive KPI cards, portfolio risk snapshot,
-- target outlook, action center, channel and regional views. Governed population as
-- everywhere else: accounts in collections (DPD > 0) on the snapshot date. Thresholds
-- come from gold.business_rules_config or are stated here, so every card is reproducible.

-- 1. Executive KPI cards (one row)
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_kpis AS
SELECT
  SUM(Outstanding_Balance)                                                   AS Outstanding_Portfolio,
  SUM(Recovery_MTD)                                                          AS Recovery_MTD,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0)                   AS Recovery_Rate,
  COUNT(DISTINCT Account_ID)                                                 AS Accounts_In_Collections,
  1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
  1.0*SUM(PTP_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0)                     AS PTP_Rate,
  SUM(PTP_Flag)                                                              AS PTP_Accounts,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0)              AS Broken_PTP_Rate,
  SUM(Broken_PTP_Flag)                                                       AS Broken_PTP_Accounts,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date THEN 1 ELSE 0 END),0) AS Broken_Share_Of_Due_Promises,
  1.0*SUM(Roll_Forward_Flag)/NULLIF(COUNT(Account_ID),0)                     AS Roll_Forward_Rate,
  1.0*SUM(Roll_Back_Flag)/NULLIF(COUNT(Account_ID),0)                        AS Roll_Back_Rate,
  SUM(CASE WHEN Nonpayment_Risk >= 0.70 THEN 1 ELSE 0 END)                   AS High_Risk_Accounts,
  SUM(CASE WHEN Nonpayment_Risk >= 0.70 THEN Outstanding_Balance ELSE 0 END) AS High_Risk_Balance,
  SUM(Cost_MTD)                                                              AS Collection_Cost,
  1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0)                              AS Cost_To_Collect
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0;

-- 2. Portfolio risk snapshot: accounts and balance by DPD bucket
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_risk_snapshot AS
SELECT DPD_Bucket,
  CASE DPD_Bucket WHEN '1-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 WHEN '91-180' THEN 4 ELSE 5 END AS Bucket_Order,
  COUNT(DISTINCT Account_ID) AS Accounts,
  SUM(Outstanding_Balance) AS Outstanding_Balance,
  1.0*COUNT(DISTINCT Account_ID)/SUM(COUNT(DISTINCT Account_ID)) OVER () AS Account_Share,
  1.0*SUM(Outstanding_Balance)/SUM(SUM(Outstanding_Balance)) OVER () AS Balance_Share,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY DPD_Bucket;

-- 3. Target outlook. Not a statistical forecast: what is already collected, plus the
-- promises to pay falling due in the rest of the month at the honour rate observed on
-- promises already due. The likelihood band compares that pipeline with the remaining gap.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_target_outlook AS
WITH t AS (
  SELECT SUM(MTD_Collections) AS Recovery_Achieved, SUM(Monthly_Target) AS Recovery_Target
  FROM {{catalog}}.{{prefix}}_gold.qry_mtd_vs_target
), p AS (
  SELECT
    SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= LAST_DAY(Snapshot_Date) THEN PTP_Amount ELSE 0 END) AS Promised_Rest_Of_Month,
    SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= LAST_DAY(Snapshot_Date) THEN 1 ELSE 0 END) AS Promises_Rest_Of_Month,
    1.0*SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date AND Broken_PTP_Flag=0 THEN 1 ELSE 0 END)
      /NULLIF(SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date THEN 1 ELSE 0 END),0) AS Promise_Honour_Rate,
    MAX(Snapshot_Date) AS Snapshot_Date,
    DATEDIFF(LAST_DAY(MAX(Snapshot_Date)), MAX(Snapshot_Date)) AS Days_Remaining
  FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
)
SELECT t.Recovery_Target, t.Recovery_Achieved,
  1.0*t.Recovery_Achieved/NULLIF(t.Recovery_Target,0) AS Achievement_Pct,
  GREATEST(t.Recovery_Target - t.Recovery_Achieved, 0) AS Target_Gap,
  p.Promised_Rest_Of_Month, p.Promises_Rest_Of_Month, p.Promise_Honour_Rate,
  p.Promised_Rest_Of_Month * p.Promise_Honour_Rate AS Expected_From_Promises,
  t.Recovery_Achieved + p.Promised_Rest_Of_Month * p.Promise_Honour_Rate AS Outlook_EOM_Recovery,
  (p.Promised_Rest_Of_Month * p.Promise_Honour_Rate) / NULLIF(GREATEST(t.Recovery_Target - t.Recovery_Achieved, 0), 0) AS Gap_Coverage,
  CASE WHEN t.Recovery_Achieved >= t.Recovery_Target THEN 'Achieved'
       WHEN (p.Promised_Rest_Of_Month * p.Promise_Honour_Rate) >= 1.5 * (t.Recovery_Target - t.Recovery_Achieved) THEN 'High'
       WHEN (p.Promised_Rest_Of_Month * p.Promise_Honour_Rate) >= 1.0 * (t.Recovery_Target - t.Recovery_Achieved) THEN 'Medium'
       ELSE 'Low' END AS Target_Likelihood,
  p.Snapshot_Date, p.Days_Remaining
FROM t CROSS JOIN p;

-- 5. Action center (one row): the five work queues leadership asked for
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_actions AS
WITH base AS (
  SELECT * FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
), top_opp AS (
  SELECT Incremental_Recovery_Opportunity, Outstanding_Balance FROM base
  ORDER BY Incremental_Recovery_Opportunity DESC LIMIT 250
)
SELECT
  -- High propensity + high balance: propensity in the top tier (>= 0.60) and balance >= 100,000
  SUM(CASE WHEN Payment_Propensity >= 0.60 AND Outstanding_Balance >= 100000 THEN 1 ELSE 0 END)                                  AS HighProp_HighBal_Accounts,
  SUM(CASE WHEN Payment_Propensity >= 0.60 AND Outstanding_Balance >= 100000 THEN Outstanding_Balance ELSE 0 END)                AS HighProp_HighBal_Balance,
  SUM(CASE WHEN Payment_Propensity >= 0.60 AND Outstanding_Balance >= 100000 THEN Incremental_Recovery_Opportunity ELSE 0 END)   AS HighProp_HighBal_Recoverable,
  -- Largest incremental recovery opportunities: the 250 accounts with the most to recover
  (SELECT SUM(Incremental_Recovery_Opportunity) FROM top_opp)                                                                     AS Top250_Recoverable,
  (SELECT SUM(Outstanding_Balance) FROM top_opp)                                                                                  AS Top250_Balance,
  -- Promises to pay due in the next 7 days
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7) THEN 1 ELSE 0 END)    AS PTP_Due_7d_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7) THEN PTP_Amount ELSE 0 END) AS PTP_Due_7d_Amount,
  -- Broken-PTP follow-up queue: due in 7 days and likely to break (propensity < 0.35 or risk >= 0.60)
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7)
            AND (Payment_Propensity < 0.35 OR Nonpayment_Risk >= 0.60) THEN 1 ELSE 0 END)                                         AS PTP_Break_Risk_7d_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7)
            AND (Payment_Propensity < 0.35 OR Nonpayment_Risk >= 0.60) THEN PTP_Amount ELSE 0 END)                                AS PTP_Break_Risk_7d_Amount,
  -- Rolling toward 180+: 150–180 days past due, within 30 days of the 180+ bucket
  SUM(CASE WHEN DPD BETWEEN 150 AND 180 THEN 1 ELSE 0 END)                                                                         AS Rolling_To_180_Accounts,
  SUM(CASE WHEN DPD BETWEEN 150 AND 180 THEN Outstanding_Balance ELSE 0 END)                                                       AS Rolling_To_180_Exposure
FROM base;

-- The same queues at account level, so the assistant can list and explain them
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_action_accounts AS
SELECT Account_ID, Product, DPD, DPD_Bucket, Region, Preferred_Channel, Outstanding_Balance, Payment_Propensity,
  Nonpayment_Risk, Incremental_Recovery_Opportunity, PTP_Flag, PTP_Amount, PTP_Due_Date, Primary_Nonpayment_Driver,
  CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7)
            AND (Payment_Propensity < 0.35 OR Nonpayment_Risk >= 0.60) THEN 'Broken-PTP follow-up (due in 7 days, likely to break)'
       WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7) THEN 'PTP due in the next 7 days'
       WHEN DPD BETWEEN 150 AND 180 THEN 'Rolling toward 180+ DPD'
       WHEN Payment_Propensity >= 0.60 AND Outstanding_Balance >= 100000 THEN 'High propensity, high balance'
       ELSE NULL END AS Action_Queue
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
  AND ((PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, 7))
       OR DPD BETWEEN 150 AND 180
       OR (Payment_Propensity >= 0.60 AND Outstanding_Balance >= 100000));

-- 6a. Channel effectiveness by the customer's preferred channel
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_channel AS
SELECT Preferred_Channel AS Channel, COUNT(DISTINCT Account_ID) AS Accounts,
  1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
  1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate,
  1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0) AS Cost_To_Collect
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Preferred_Channel;

-- 6b. Regional view: recovery, contact and risk by region
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_region AS
SELECT Region, COUNT(DISTINCT Account_ID) AS Accounts, SUM(Outstanding_Balance) AS Outstanding_Balance,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate,
  1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
  1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
  1.0*SUM(CASE WHEN Nonpayment_Risk >= 0.70 THEN 1 ELSE 0 END)/NULLIF(COUNT(DISTINCT Account_ID),0) AS High_Risk_Share,
  AVG(Nonpayment_Risk) AS Avg_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Region;

-- 7. Explorer base (v1.8): one row per account in collections, with every dimension the
-- Explorer filters on and the flags its measures are built from. The app computes each
-- measure with the same formula as the metric views and certified views (for example
-- RPC rate = SUM(RPC_Flag) / accounts attempted), so an unfiltered Explorer reconciles
-- exactly to the Command Center. Customer identity is not exposed (account ID only).
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_explorer_base AS
SELECT f.Account_ID, f.Product, f.DPD_Bucket,
  CASE f.DPD_Bucket WHEN '1-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 WHEN '91-180' THEN 4 ELSE 5 END AS Bucket_Order,
  f.Region, f.Preferred_Channel, f.Treatment_Strategy, f.Primary_Nonpayment_Driver, f.Balance_Band,
  COALESCE(f.Vulnerability_Type, 'None') AS Vulnerability_Type,
  f.Collector_ID, c.Team AS Collector_Team, c.Specialization AS Collector_Specialization,
  f.Last_Contact_Date, f.PTP_Due_Date, f.DPD, f.Outstanding_Balance, f.Recovery_MTD, f.Cost_MTD, f.Attempts_MTD,
  CASE WHEN f.Attempts_MTD > 0 THEN 1 ELSE 0 END AS Attempted_Flag,
  f.Contacted_Flag, f.RPC_Flag, f.PTP_Flag, f.PTP_Amount, f.Broken_PTP_Flag,
  CASE WHEN f.PTP_Due_Date <= f.Snapshot_Date THEN 1 ELSE 0 END AS PTP_Due_Flag,
  CASE WHEN f.PTP_Due_Date <= f.Snapshot_Date AND f.Broken_PTP_Flag = 0 THEN 1 ELSE 0 END AS PTP_Kept_Flag,
  f.Cure_Flag, f.Roll_Forward_Flag, f.Roll_Back_Flag,
  CASE WHEN f.Nonpayment_Risk >= 0.70 THEN 1 ELSE 0 END AS High_Risk_Flag,
  f.Payment_Propensity, f.Nonpayment_Risk, f.Incremental_Recovery_Opportunity
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot f
LEFT JOIN {{catalog}}.{{prefix}}_silver.dim_collector c ON f.Collector_ID = c.Collector_ID
WHERE f.Snapshot_Date = DATE '2026-09-15' AND f.DPD > 0 AND f.Outstanding_Balance > 0;
