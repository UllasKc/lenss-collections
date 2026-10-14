-- Command Center views (Step 8i): the executive KPI cards, portfolio risk snapshot,
-- target outlook, action center, channel and regional views. Governed population as
-- everywhere else: accounts in collections (DPD > 0) on the snapshot date. Every threshold is
-- read live from gold.qry_rules ({{live:<name>}}, expanded by the deploy), so every card is
-- reproducible from gold.business_rules_config. Each view carries a description for Genie and
-- Catalog Explorer; edit descriptions here, never in the UI (each deploy re-creates the views).

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
  -- This month's promises, end to end: made = already due (kept + broken) + still to come due this month
  SUM(CASE WHEN PTP_Flag=1 THEN PTP_Amount ELSE 0 END)                       AS PTP_Amount_Total,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date THEN 1 ELSE 0 END) AS PTP_Due_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date AND Broken_PTP_Flag=0 THEN 1 ELSE 0 END) AS PTP_Kept_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date AND Broken_PTP_Flag=0 THEN PTP_Amount ELSE 0 END) AS PTP_Kept_Amount,
  SUM(CASE WHEN Broken_PTP_Flag=1 THEN PTP_Amount ELSE 0 END)                AS Broken_PTP_Amount,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date>Snapshot_Date AND PTP_Due_Date<=LAST_DAY(Snapshot_Date) THEN 1 ELSE 0 END) AS PTP_Upcoming_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date>Snapshot_Date AND PTP_Due_Date<=LAST_DAY(Snapshot_Date) THEN PTP_Amount ELSE 0 END) AS PTP_Upcoming_Amount,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(COUNT(DISTINCT Account_ID),0)              AS Broken_PTP_Rate,
  SUM(Broken_PTP_Flag)                                                       AS Broken_PTP_Accounts,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date<=Snapshot_Date THEN 1 ELSE 0 END),0) AS Broken_Share_Of_Due_Promises,
  1.0*SUM(Roll_Forward_Flag)/NULLIF(COUNT(Account_ID),0)                     AS Roll_Forward_Rate,
  1.0*SUM(Roll_Back_Flag)/NULLIF(COUNT(Account_ID),0)                        AS Roll_Back_Rate,
  SUM(CASE WHEN Nonpayment_Risk >= {{live:high_risk_threshold}} THEN 1 ELSE 0 END)                   AS High_Risk_Accounts,
  SUM(CASE WHEN Nonpayment_Risk >= {{live:high_risk_threshold}} THEN Outstanding_Balance ELSE 0 END) AS High_Risk_Balance,
  SUM(Cost_MTD)                                                              AS Collection_Cost,
  1.0*SUM(Cost_MTD)/NULLIF(SUM(Recovery_MTD),0)                              AS Cost_To_Collect
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_kpis IS 'Answers: "How are we doing overall?" / "Are we good for today?" / the headline KPIs. One row for the whole portfolio in collections on 15 Sep 2026: outstanding balance, recovered MTD, recovery rate, accounts, RPC rate, promises and broken promises, roll rates, high-risk accounts and balance (Nonpayment_Risk >= high_risk_threshold, 0.70) and cost to collect. The Command Center headline cards. For target achievement use qry_mtd_vs_target.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Rate IS 'Accounts with a promise to pay / all accounts in collections';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Broken_PTP_Rate IS 'Broken promises / all accounts in collections';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Broken_Share_Of_Due_Promises IS 'Broken promises / promises already due: the broken-promise rate quoted on the Command Center';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Roll_Forward_Rate IS 'Share of accounts that moved to a later DPD bucket';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Roll_Back_Rate IS 'Share of accounts that moved to an earlier DPD bucket';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Amount_Total IS 'Amount promised (INR) across all promises to pay made this month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Due_Accounts IS 'Promises already due by the snapshot date (kept + broken)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Kept_Accounts IS 'Promises already due that were kept (paid at least 90%, rule R05)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Broken_PTP_Amount IS 'Amount promised (INR) on the promises that were broken';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Upcoming_Accounts IS 'Promises still to come due in the rest of the month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.PTP_Upcoming_Amount IS 'Amount promised (INR) on the promises still to come due this month';

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
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_risk_snapshot IS 'Answers: "How is our portfolio distributed across DPD buckets, and where is the risk concentrated?" One row per DPD bucket (order by Bucket_Order): accounts, outstanding balance, their shares of the portfolio, and recovery rate. Use for the portfolio''s distribution by arrears stage; use qry_kpi_drivers for drivers by product and bucket.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_risk_snapshot.Bucket_Order IS 'Sort order of the DPD buckets, earliest arrears first';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_risk_snapshot.Balance_Share IS 'This bucket''s outstanding balance / the portfolio''s';

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
       WHEN (p.Promised_Rest_Of_Month * p.Promise_Honour_Rate) >= {{live:outlook_high_coverage}} * (t.Recovery_Target - t.Recovery_Achieved) THEN 'High'
       WHEN (p.Promised_Rest_Of_Month * p.Promise_Honour_Rate) >= {{live:outlook_medium_coverage}} * (t.Recovery_Target - t.Recovery_Achieved) THEN 'Medium'
       ELSE 'Low' END AS Target_Likelihood,
  p.Snapshot_Date, p.Days_Remaining
FROM t CROSS JOIN p;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_target_outlook IS 'Answers: "Are we on track for the monthly target?" as a PIPELINE, never a forecast or probability. One row: collected so far, the target and gap, promises to pay falling due in the rest of the month, the share of due promises actually honoured, and the outlook = collected + promises due x honour rate. Target_Likelihood is a band (High when expected promises cover at least 1.5x the gap, Medium at 1.0x; outlook_*_coverage in business_rules_config). Present it as "if customers keep promises at the current rate", never as a projection.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_target_outlook.Promise_Honour_Rate IS 'Promises already due that were kept / promises already due';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_target_outlook.Outlook_EOM_Recovery IS 'Collected so far + promises due in the rest of the month x honour rate: a pipeline, not a forecast';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_target_outlook.Gap_Coverage IS 'Expected from promises / remaining gap';

-- 5. Action center (one row): the five work queues leadership asked for
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_actions AS
WITH base AS (
  SELECT * FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
  WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
), top_opp AS (
  SELECT Incremental_Recovery_Opportunity, Outstanding_Balance FROM (
    SELECT Incremental_Recovery_Opportunity, Outstanding_Balance,
           ROW_NUMBER() OVER (ORDER BY Incremental_Recovery_Opportunity DESC) AS Opportunity_Rank
    FROM base) ranked
  WHERE Opportunity_Rank <= {{live:queue_top_opportunities}}
)
SELECT
  -- High propensity + high balance (queue_high_propensity, queue_high_balance)
  SUM(CASE WHEN Payment_Propensity >= {{live:queue_high_propensity}} AND Outstanding_Balance >= {{live:queue_high_balance}} THEN 1 ELSE 0 END)                                  AS HighProp_HighBal_Accounts,
  SUM(CASE WHEN Payment_Propensity >= {{live:queue_high_propensity}} AND Outstanding_Balance >= {{live:queue_high_balance}} THEN Outstanding_Balance ELSE 0 END)                AS HighProp_HighBal_Balance,
  SUM(CASE WHEN Payment_Propensity >= {{live:queue_high_propensity}} AND Outstanding_Balance >= {{live:queue_high_balance}} THEN Incremental_Recovery_Opportunity ELSE 0 END)   AS HighProp_HighBal_Recoverable,
  -- Largest incremental recovery opportunities (queue_top_opportunities accounts)
  (SELECT SUM(Incremental_Recovery_Opportunity) FROM top_opp)                                                                     AS Top250_Recoverable,
  (SELECT SUM(Outstanding_Balance) FROM top_opp)                                                                                  AS Top250_Balance,
  -- Promises to pay due in the next queue_ptp_window_days days
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT)) THEN 1 ELSE 0 END)    AS PTP_Due_7d_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT)) THEN PTP_Amount ELSE 0 END) AS PTP_Due_7d_Amount,
  -- Broken-PTP follow-up queue: due soon and likely to break (queue_break_propensity, queue_break_risk)
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT))
            AND (Payment_Propensity < {{live:queue_break_propensity}} OR Nonpayment_Risk >= {{live:queue_break_risk}}) THEN 1 ELSE 0 END)                                         AS PTP_Break_Risk_7d_Accounts,
  SUM(CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT))
            AND (Payment_Propensity < {{live:queue_break_propensity}} OR Nonpayment_Risk >= {{live:queue_break_risk}}) THEN PTP_Amount ELSE 0 END)                                AS PTP_Break_Risk_7d_Amount,
  -- Rolling toward 180+ (queue_roll_from_dpd to queue_roll_to_dpd days past due)
  SUM(CASE WHEN DPD BETWEEN {{live:queue_roll_from_dpd}} AND {{live:queue_roll_to_dpd}} THEN 1 ELSE 0 END)                                                                         AS Rolling_To_180_Accounts,
  SUM(CASE WHEN DPD BETWEEN {{live:queue_roll_from_dpd}} AND {{live:queue_roll_to_dpd}} THEN Outstanding_Balance ELSE 0 END)                                                       AS Rolling_To_180_Exposure
FROM base;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_actions IS 'Answers: "What should we do this week?" / "What are the action queues?" One row with the size of each Command Center work queue: high propensity and high balance (propensity >= 0.60, balance >= 100,000 INR); the 250 largest recovery opportunities; promises due in the next 7 days; of those, the ones likely to break (propensity < 0.35 or risk >= 0.60); and accounts 150-180 days past due, rolling toward 180+. All thresholds are queue_* rows in business_rules_config. For the accounts in each queue use qry_cc_action_accounts.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_actions.Top250_Recoverable IS 'Incremental recovery opportunity (INR) of the queue_top_opportunities (250) accounts with the most to recover';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_actions.PTP_Break_Risk_7d_Accounts IS 'Promises due in the next 7 days that are likely to break: propensity < 0.35 or risk >= 0.60';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_actions.Rolling_To_180_Exposure IS 'Outstanding balance (INR) of accounts 150-180 days past due';

-- The same queues at account level, so the assistant can list and explain them
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_action_accounts AS
SELECT Account_ID, Product, DPD, DPD_Bucket, Region, Preferred_Channel, Outstanding_Balance, Payment_Propensity,
  Nonpayment_Risk, Incremental_Recovery_Opportunity, PTP_Flag, PTP_Amount, PTP_Due_Date, Primary_Nonpayment_Driver,
  CASE WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT))
            AND (Payment_Propensity < {{live:queue_break_propensity}} OR Nonpayment_Risk >= {{live:queue_break_risk}}) THEN 'Broken-PTP follow-up (due in 7 days, likely to break)'
       WHEN PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT)) THEN 'PTP due in the next 7 days'
       WHEN DPD BETWEEN {{live:queue_roll_from_dpd}} AND {{live:queue_roll_to_dpd}} THEN 'Rolling toward 180+ DPD'
       WHEN Payment_Propensity >= {{live:queue_high_propensity}} AND Outstanding_Balance >= {{live:queue_high_balance}} THEN 'High propensity, high balance'
       ELSE NULL END AS Action_Queue
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
  AND ((PTP_Flag=1 AND PTP_Due_Date > Snapshot_Date AND PTP_Due_Date <= DATE_ADD(Snapshot_Date, CAST({{live:queue_ptp_window_days}} AS INT)))
       OR DPD BETWEEN {{live:queue_roll_from_dpd}} AND {{live:queue_roll_to_dpd}}
       OR (Payment_Propensity >= {{live:queue_high_propensity}} AND Outstanding_Balance >= {{live:queue_high_balance}}));
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_action_accounts IS 'Answers: "Which accounts are in each action queue?", "Which promises are due in the next 7 days?", "Which accounts are about to roll into 180+?" One row per account in a Command Center work queue, with its queue (Action_Queue) and the fields to act on. Same queue rules as qry_cc_actions. Account IDs only, no customer identity. For the R08 high-risk intervention list use qry_immediate_intervention instead.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_action_accounts.Action_Queue IS 'The work queue this account is in (an account in several queues shows the first that applies: broken-PTP follow-up, PTP due in 7 days, rolling toward 180+, high propensity and high balance)';

-- The priority list (chapter 5): the intervention accounts with the most to recover, priority_top_accounts of them
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_priority_accounts AS
SELECT * FROM (
  SELECT i.*, ROW_NUMBER() OVER (ORDER BY i.Incremental_Recovery_Opportunity DESC, i.Account_ID) AS Priority_Rank
  FROM {{catalog}}.{{prefix}}_gold.qry_immediate_intervention i
) ranked
WHERE Priority_Rank <= {{live:priority_top_accounts}};
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_priority_accounts IS 'Answers: "Which accounts should we prioritise first?" / "Who are the top 100 accounts to work, and how much can we recover from them?" The priority_top_accounts (100) accounts from qry_immediate_intervention (rule R08: high risk, still likely to pay) with the most incremental recovery, ranked 1 = most to recover, with the recommended next step. SUM(Incremental_Recovery_Opportunity) is what the list could recover. For all intervention accounts use qry_immediate_intervention.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_priority_accounts.Priority_Rank IS '1 = the account with the most incremental recovery';

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
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_channel IS 'Answers: "How effective are our SMS, WhatsApp, voice and digital journeys?" / "Which channel works best overall?" (client query 14). One row per preferred channel: accounts, RPC rate, PTP conversion, recovery rate and cost to collect. Recovery is attributed to the preferred channel (demo limitation, rule R11). For the best channel per DPD bucket use qry_recommended_channel; for channels by any other dimension use mv_collections_funnel.';

-- 6b. Regional view: recovery, contact and risk by region
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_region AS
SELECT Region, COUNT(DISTINCT Account_ID) AS Accounts, SUM(Outstanding_Balance) AS Outstanding_Balance,
  1.0*SUM(Recovery_MTD)/NULLIF(SUM(Outstanding_Balance),0) AS Recovery_Rate,
  1.0*SUM(RPC_Flag)/NULLIF(SUM(CASE WHEN Attempts_MTD>0 THEN 1 ELSE 0 END),0) AS RPC_Rate,
  1.0*SUM(PTP_Flag)/NULLIF(SUM(RPC_Flag),0) AS PTP_Conversion_Rate,
  1.0*SUM(CASE WHEN Nonpayment_Risk >= {{live:high_risk_threshold}} THEN 1 ELSE 0 END)/NULLIF(COUNT(DISTINCT Account_ID),0) AS High_Risk_Share,
  AVG(Nonpayment_Risk) AS Avg_Nonpayment_Risk
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
WHERE Snapshot_Date = DATE '2026-09-15' AND DPD > 0
GROUP BY Region;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_region IS 'Answers: "Which regions are underperforming on recovery?" / "How do regions compare?" One row per region: accounts, balance, recovery rate, RPC rate, PTP conversion and the share of high-risk accounts (risk >= high_risk_threshold, 0.70). For other rates by region (e.g. broken promises) use mv_collections_funnel grouped by Region.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_region.High_Risk_Share IS 'Share of the region''s accounts with Nonpayment_Risk >= 0.70 (rule R07)';

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
  CASE WHEN f.Nonpayment_Risk >= {{live:high_risk_threshold}} THEN 1 ELSE 0 END AS High_Risk_Flag,
  f.Payment_Propensity, f.Nonpayment_Risk, f.Incremental_Recovery_Opportunity
FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot f
LEFT JOIN {{catalog}}.{{prefix}}_silver.dim_collector c ON f.Collector_ID = c.Collector_ID
WHERE f.Snapshot_Date = DATE '2026-09-15' AND f.DPD > 0 AND f.Outstanding_Balance > 0;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_explorer_base IS 'The Explorer tab''s data: one row per account in collections on 15 Sep 2026 with every dimension the Explorer filters on and the flags its measures are built from (same formulas as the metric views, so an unfiltered Explorer matches the Command Center). Account IDs only. Read by the app, not a Genie source.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_explorer_base.High_Risk_Flag IS '1 when Nonpayment_Risk >= high_risk_threshold (0.70, rule R07)';
