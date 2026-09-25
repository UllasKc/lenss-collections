-- Governance content that exists only in the Word docs, not the workbook (guide Step 1.3).
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.sql_generation_controls (
  control_id INT, control_text STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.sql_generation_controls VALUES
(1,  'Apply an explicit Snapshot_Date or resolved as-of date to every query.'),
(2,  'Default delinquency analysis to DPD > 0 AND Outstanding_Balance > 0 unless told otherwise.'),
(3,  'Use COUNT(DISTINCT Account_ID) for every account count.'),
(4,  'Calculate portfolio-level rates as SUM(numerator)/SUM(denominator), never an average of per-segment percentages.'),
(5,  'Aggregate Fact_Targets at its own grain (Target_Month, Product, DPD_Bucket) before joining to account-level facts.'),
(6,  'Exclude future-dated promises (PTP_Due_Date > as-of date) from broken-promise calculations.'),
(7,  'Apply a minimum-volume threshold (>= 30 accounts) before ranking or recommending based on a segment.'),
(8,  'Label observational/like-for-like comparisons separately from causal uplift claims.'),
(9,  'Return a transparent limitation message when required data is unavailable, rather than approximating.'),
(10, 'Apply authorisation controls before returning any account-level identifiers.'),
(11, 'Route dispute and vulnerable-customer segments through appropriate support processes, not pure automation.');

CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.known_limitations (
  topic STRING, question_pattern STRING, why_blocked STRING, required_behavior STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.known_limitations VALUES
('Target Achievement Probability', 'How likely / what confidence are we to hit target?',
 'No historical multi-month volatility exists to calibrate a confidence figure — only one snapshot date.',
 'Give the deterministic run-rate projection for the current month only; state that a calibrated probability is not available.'),
('Champion-Challenger Uplift', 'What uplift would switching strategy X to Y deliver?',
 'No randomized test/control assignment exists in the data (Fact_Strategy_Assignment fields are unpopulated).',
 'Give an observational, like-for-like comparison (matched on Product/DPD_Bucket/Balance_Band/Region/Vulnerability_Type) with an explicit "not a controlled experiment" caveat — never a causal number.'),
('Next-Month Forecasting', 'What will next month''s / October''s collections be?',
 'Only one snapshot date exists in the data — there is no historical time series to project a future month from.',
 'State plainly that historical monthly data is required and not currently available — do not produce a number.');

CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.demo_query_sequence (
  step_order INT, question STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.demo_query_sequence VALUES
(1, 'What is my MTD collections performance versus target?'),
(2, 'Are we on track to achieve month-end target?'),
(3, 'Why are collections lagging this month?'),
(4, 'Which portfolios are contributing most to the gap?'),
(5, 'Which segments have weak cure or increasing roll rates?'),
(6, 'Which treatment strategies and channels perform best like-for-like?'),
(7, 'Which accounts require immediate intervention?'),
(8, 'What recovery opportunity can help close the gap?');
