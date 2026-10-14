-- Business thresholds as data, not hardcoded logic (guide Step 3). Every certified and Command
-- Center view reads them through gold.qry_rules, and the deploy writes them into the metric views,
-- so changing a value here and re-running the deploy's transform and views steps moves every figure.
-- Rule IDs (R05...) are the workbook's Business_Rules sheet; the others are this app's own choices.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_gold.business_rules_config (
  rule_name STRING COMMENT 'Name used by gold.qry_rules and the views',
  threshold_value DOUBLE COMMENT 'The value in force',
  notes STRING COMMENT 'What the rule means, where it comes from and which views use it'
) COMMENT 'Every business threshold the gold views use, with its meaning and source (workbook rule IDs R05-R14 where they apply). Views read these values through gold.qry_rules; quote this table when asked how a figure is defined (for example what counts as a high-risk account).';

INSERT INTO {{catalog}}.{{prefix}}_gold.business_rules_config VALUES
-- Workbook rules
('broken_ptp_threshold_pct', 0.90, 'R05 (demo assumption): a matured promise is broken when less than 90% of the promised amount was paid. Carried in the data as Broken_PTP_Flag.'),
('cure_threshold_pct', 0.90, 'R06 (demo assumption, confirm with the client): cured = Recovery_MTD >= 90% of Outstanding_Balance. Carried as Cure_Flag; cure rate is not reported (cured accounts leave the DPD > 0 population).'),
('high_risk_threshold', 0.70, 'R07: a high-risk account has Nonpayment_Risk >= 0.70. Used by qry_immediate_intervention, qry_recovery_opportunity_sizing, qry_cc_kpis, qry_cc_region, qry_explorer_base and the metric view measure high_risk_accounts.'),
('intervention_propensity_threshold', 0.25, 'R08: immediate intervention = high risk (R07) AND Payment_Propensity >= 0.25 AND balance > 0. Used by qry_immediate_intervention and qry_recovery_opportunity_sizing.'),
('underperformance_gap_pts', 0.05, 'R09: a product x DPD bucket is materially underperforming when its target achievement is more than 5 percentage points below the portfolio''s. Used by qry_underperforming_segments.'),
('over_contact_attempts_threshold', 4.5, 'R14 (heuristic): a segment averaging 4.5+ contact attempts is flagged as over-contact risk. Recalibrated from the sample document''s 6.0, which the data never reaches (highest segment ~5.3). Used by qry_over_contact_risk.'),
-- Volume minimums (control #7 in the SQL-generation controls)
('min_segment_volume', 30, 'Minimum accounts before a segment, strategy or collector is ranked or recommended. Used by qry_over_contact_risk, qry_strategy_like_for_like, qry_underperforming_segments (supporting detail) and qry_collector_scorecard.'),
('min_channel_volume', 50, 'Minimum accounts per DPD bucket x channel before qry_recommended_channel ranks it.'),
-- Recommended actions (qry_immediate_intervention)
('ptp_followup_propensity', 0.35, 'Broken promise with Payment_Propensity >= 0.35 -> "Immediate PTP follow-up".'),
('specialist_risk_threshold', 0.80, 'Nonpayment_Risk >= 0.80 together with a balance of at least specialist_balance_threshold -> "Assign to specialist collector".'),
('specialist_balance_threshold', 50000, 'Outstanding balance (INR) for "Assign to specialist collector".'),
-- Command Center action queues (qry_cc_actions, qry_cc_action_accounts)
('queue_high_propensity', 0.60, 'High propensity, high balance queue: Payment_Propensity >= 0.60 ...'),
('queue_high_balance', 100000, '... and Outstanding_Balance >= 100,000 INR.'),
('queue_break_propensity', 0.35, 'Broken-PTP follow-up queue: a promise due in the next 7 days is likely to break when Payment_Propensity < 0.35 ...'),
('queue_break_risk', 0.60, '... or Nonpayment_Risk >= 0.60.'),
('queue_ptp_window_days', 7, 'Promises due within this many days after the snapshot form the PTP queues.'),
('queue_roll_from_dpd', 150, 'Rolling-toward-180+ queue: accounts from this many days past due ...'),
('queue_roll_to_dpd', 180, '... up to this many (within 30 days of the 180+ bucket).'),
('queue_top_opportunities', 250, 'The largest-incremental-recovery queue: this many accounts with the most to recover.'),
('priority_top_accounts', 100, 'The Command Center''s priority list (chapter 5): the R08 intervention accounts with the most incremental recovery, this many of them. Used by qry_cc_priority_accounts.'),
-- Target outlook (qry_cc_target_outlook): bands, not a forecast
('outlook_high_coverage', 1.5, 'Target likelihood "High" when the expected recovery from promises due covers at least 1.5x the remaining gap.'),
('outlook_medium_coverage', 1.0, 'Target likelihood "Medium" when it covers at least 1.0x the remaining gap; below that "Low".');

-- One row, one column per rule, for the views to read. Every column is the table's value.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_rules AS
SELECT
  MAX(CASE WHEN rule_name = 'high_risk_threshold' THEN threshold_value END)               AS high_risk_threshold,
  MAX(CASE WHEN rule_name = 'intervention_propensity_threshold' THEN threshold_value END) AS intervention_propensity_threshold,
  MAX(CASE WHEN rule_name = 'underperformance_gap_pts' THEN threshold_value END)          AS underperformance_gap_pts,
  MAX(CASE WHEN rule_name = 'over_contact_attempts_threshold' THEN threshold_value END)   AS over_contact_attempts_threshold,
  MAX(CASE WHEN rule_name = 'min_segment_volume' THEN threshold_value END)                AS min_segment_volume,
  MAX(CASE WHEN rule_name = 'min_channel_volume' THEN threshold_value END)                AS min_channel_volume,
  MAX(CASE WHEN rule_name = 'ptp_followup_propensity' THEN threshold_value END)           AS ptp_followup_propensity,
  MAX(CASE WHEN rule_name = 'specialist_risk_threshold' THEN threshold_value END)         AS specialist_risk_threshold,
  MAX(CASE WHEN rule_name = 'specialist_balance_threshold' THEN threshold_value END)      AS specialist_balance_threshold,
  MAX(CASE WHEN rule_name = 'queue_high_propensity' THEN threshold_value END)             AS queue_high_propensity,
  MAX(CASE WHEN rule_name = 'queue_high_balance' THEN threshold_value END)                AS queue_high_balance,
  MAX(CASE WHEN rule_name = 'queue_break_propensity' THEN threshold_value END)            AS queue_break_propensity,
  MAX(CASE WHEN rule_name = 'queue_break_risk' THEN threshold_value END)                  AS queue_break_risk,
  MAX(CASE WHEN rule_name = 'queue_ptp_window_days' THEN threshold_value END)             AS queue_ptp_window_days,
  MAX(CASE WHEN rule_name = 'queue_roll_from_dpd' THEN threshold_value END)               AS queue_roll_from_dpd,
  MAX(CASE WHEN rule_name = 'queue_roll_to_dpd' THEN threshold_value END)                 AS queue_roll_to_dpd,
  MAX(CASE WHEN rule_name = 'queue_top_opportunities' THEN threshold_value END)           AS queue_top_opportunities,
  MAX(CASE WHEN rule_name = 'priority_top_accounts' THEN threshold_value END)             AS priority_top_accounts,
  MAX(CASE WHEN rule_name = 'outlook_high_coverage' THEN threshold_value END)             AS outlook_high_coverage,
  MAX(CASE WHEN rule_name = 'outlook_medium_coverage' THEN threshold_value END)           AS outlook_medium_coverage
FROM {{catalog}}.{{prefix}}_gold.business_rules_config;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_rules IS 'Every business threshold as one row (one column per rule), read by the gold views. Values come from gold.business_rules_config, which explains each one.';
