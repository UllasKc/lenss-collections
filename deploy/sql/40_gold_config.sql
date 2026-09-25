-- Configurable business thresholds as data, not hardcoded logic (guide Step 3).
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_gold.business_rules_config (
  rule_name STRING, threshold_value DOUBLE, notes STRING
);

INSERT INTO {{catalog}}.{{prefix}}_gold.business_rules_config VALUES
('cure_threshold_pct', 0.90, 'Recovery_MTD >= 90% of Outstanding_Balance (R06 - demo assumption, confirm with practice leader)'),
('broken_ptp_threshold_pct', 0.90, 'Fulfilled_Amount < 90% of Promise_Amount at matured PTP = broken (R05 - demo assumption)'),
('high_risk_threshold', 0.70, 'Nonpayment_Risk >= 0.70 (R07 - configurable)'),
('intervention_propensity_threshold', 0.25, 'Payment_Propensity >= 0.25, paired with high_risk_threshold (R08)'),
('min_segment_volume', 30, 'Minimum accounts before ranking/recommending on a segment (control #7)'),
('over_contact_attempts_threshold', 4.5, 'Segment average attempts >= this = flagged as over-contact risk; recalibrated from the sample-doc value of 6.0, which was unreachable in the actual data (max observed ~5.3)');
