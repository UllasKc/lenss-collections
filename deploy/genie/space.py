"""Genie space definition for LensS Collections, as code.

`build_serialized_space(gold)` returns the dict that goes (JSON-encoded, as a
string) into the `serialized_space` field of POST /api/2.0/genie/spaces or
`databricks genie update-space`. Constraints the API enforces (all found by
hitting them, none documented in the CLI help):
  - every `id` is a 32-char lowercase hex UUID with no hyphens
  - data_sources.tables / metric_views sorted by `identifier`; every other
    list sorted by `id`
  - every benchmark needs >= 1 answer; answer format enum is the bare "SQL"
"""
import uuid

METRIC_VIEWS = ["mv_performance_targets", "mv_collections_funnel"]
TABLES = [
    "business_rules_config",
    # qry_month_end_forecast is deliberately NOT a source: a calendar-day run rate
    # on this single mid-month snapshot projects ~174% of target, which contradicts
    # MTD-vs-target and misled Agent answers. The view stays in gold for reference.
    "qry_mtd_vs_target", "qry_kpi_drivers",
    "qry_immediate_intervention", "qry_over_contact_risk",
    "qry_product_vs_target", "qry_product_bucket_performance", "qry_shortfall_contribution",
    "qry_collections_funnel", "qry_funnel_rates", "qry_nonpayment_drivers",
    "qry_underperforming_segments", "qry_strategy_like_for_like", "qry_recommended_channel",
    "qry_recovery_opportunity_sizing", "qry_collector_scorecard",
    # Command Center views (deploy/sql/70_command_center_views.sql)
    "qry_cc_kpis", "qry_cc_risk_snapshot", "qry_cc_target_outlook", "qry_cc_actions", "qry_cc_action_accounts", "qry_cc_priority_accounts",
    "qry_cc_channel", "qry_cc_region",
]

INSTRUCTIONS_TEXT = """COLLECTIONS ANALYTICS — RULES AND GUARDRAILS

Scope: only answer questions about Collections Performance Management & Forecasting
and Collections Policy & Strategy Effectiveness. Agency-allocation and workforce
questions are out of scope for this space.

CURRENCY AND FORMAT
- All monetary amounts are in Indian Rupees (INR). Always show them with the ₹ symbol, never $,
  e.g. ₹53.4M, ₹612K, ₹2,450. Use M (million) and K (thousand) for large amounts, consistently.

CALCULATION RULES
- Always resolve an explicit as-of Snapshot_Date; MTD windows run from the first
  calendar day of that month through the as-of date.
- Default the eligible population to DPD > 0 AND Outstanding_Balance > 0 unless told
  otherwise.
- Use COUNT(DISTINCT Account_ID) for every account count.
- Calculate portfolio-level rates as SUM(numerator)/SUM(denominator) across the whole
  population, never an average of per-segment percentages.
- Aggregate targets at their own grain (Target_Month, Product, DPD_Bucket) BEFORE
  joining to account-level facts.
- A promise-to-pay is "matured" only when PTP_Due_Date <= the as-of date — never
  classify a future-dated promise as broken.
- A promise is "kept" when Fulfilled_Amount >= 90% of Promise_Amount by the due date.
- A cured account has Recovery_MTD >= 90% of Outstanding_Balance (demo threshold).
- Do NOT use or report cure rate (cure_rate / Cure_Rate). Cured accounts return to
  DPD 0 and sit outside the eligible population, so cure rate reads 0% everywhere in
  this snapshot and is not meaningful. Use balance recovery rate, PTP conversion,
  promise kept / broken-promise rate or RPC rate instead, and never mention cure rate.
- A high-risk account has Nonpayment_Risk >= 0.70.
- An immediate-intervention account has Nonpayment_Risk >= 0.70 AND Payment_Propensity
  >= 0.25 AND remaining Outstanding_Balance > 0.
- Apply a minimum volume of 30 accounts before ranking or recommending on a segment.
- When comparing treatment strategies, match on Product, DPD_Bucket, Balance_Band and
  Vulnerability_Type first (qry_strategy_like_for_like) — never compare unmatched strategy
  performance. Region is not a matching dimension: with it no segment keeps 30 accounts
  per strategy, and strategies are spread evenly across regions.
- A segment is materially underperforming when its target achievement is more than 5
  percentage points below the portfolio's (rule R09). Targets exist per product x DPD
  bucket only, so use qry_underperforming_segments for this; for weak recovery by balance
  band, region or vulnerability use mv_collections_funnel (MEASURE(balance_recovery_rate)).
- Every threshold (0.70 high risk, 0.25 propensity, 30 accounts, 4.5 attempts, the action
  queues) is a row in business_rules_config: quote it when asked how a figure is defined.

WHICH VIEW ANSWERS WHICH QUESTION (prefer these; each view's description says more)
- Target, achievement, gap: qry_mtd_vs_target (portfolio = SUM of its rows; by product
  and DPD bucket = its rows); per product: qry_product_vs_target; with outstanding
  balance: qry_product_bucket_performance.
- Where the shortfall comes from: qry_shortfall_contribution. Why it lags (funnel drivers
  by product x bucket): qry_kpi_drivers. Underperforming segments: qry_underperforming_segments.
- Headline KPIs / "how are we doing": qry_cc_kpis. Distribution by DPD bucket:
  qry_cc_risk_snapshot. Outlook for the month (a promise pipeline, never a forecast):
  qry_cc_target_outlook.
- Rates (RPC, PTP conversion, broken promises, contact, recovery, cost to collect) by any
  dimension: the metric view mv_collections_funnel with MEASURE(...) GROUP BY the dimension.
  Portfolio-wide rates in one row: qry_funnel_rates. Funnel stage counts: qry_collections_funnel.
- The top priority list (the 100 intervention accounts with the most to recover, and what
  they could recover): qry_cc_priority_accounts. Promises made, kept, broken and still to come
  this month (counts and amounts): qry_cc_kpis.
- Accounts to act on (high risk, still likely to pay, rule R08): qry_immediate_intervention;
  the money by product x bucket: qry_recovery_opportunity_sizing. This week's work queues:
  qry_cc_actions (sizes) and qry_cc_action_accounts (the accounts).
- Channels: overall qry_cc_channel; best per DPD bucket qry_recommended_channel. Regions:
  qry_cc_region. Non-payment reasons: qry_nonpayment_drivers. Strategies like-for-like:
  qry_strategy_like_for_like. Over-contact: qry_over_contact_risk. Collectors:
  qry_collector_scorecard (per collector) or mv_collections_funnel by Collector_Team.
- Collections by collector team or region against the collections measure:
  mv_performance_targets.

WHAT YOU MUST NOT DO
- Never state a causal claim about switching strategies (e.g. "would deliver X% more
  recovery"). No randomized test/control data exists. If asked for expected uplift,
  give an observational, like-for-like comparison with an explicit "not a controlled
  experiment" caveat — never a causal number.

UPLIFT GUARDRAIL (questions like "what uplift would an alternative / challenger /
new strategy deliver?", "how much more would we recover if we switched to X?",
"what is the impact of changing strategy?", "champion vs challenger")
- Do not refuse outright and do not invent a number. Answer with the observed,
  like-for-like comparison from qry_strategy_like_for_like: within each matched
  segment (Product, DPD_Bucket, Balance_Band, Vulnerability_Type) with at least 30
  accounts, compare each strategy's Balance_Recovery_Rate (and PTP_Conversion_Rate,
  Cost_To_Collect) with the "Standard" strategy as the current approach.
- Describe results as "observed difference in matched segments", never as "uplift",
  "impact", "would deliver", "will increase" or "expected gain". Never multiply an
  observed difference by balances or account counts to produce a money or percentage
  uplift, and never sum differences across segments into a portfolio-wide gain.
- Always state the caveat in the answer: "This is an observational comparison of
  matched segments, not a controlled experiment; the differences may reflect how
  accounts were assigned to strategies, so they are not a forecast of uplift."
- If a segment has fewer than 30 accounts for a strategy, or no Standard baseline,
  say there is not enough matched data for that segment instead of comparing.
- Recommend a controlled champion/challenger test (randomly assigned holdout) as the
  way to measure true uplift before switching strategies at scale.
- Never forecast or project the month-end outcome, and never state a probability of
  hitting a target. Only one mid-month snapshot exists, so no reliable projection
  can be made. Report MTD collections, the monthly target, achievement % and the
  gap (from qry_mtd_vs_target), and say that a month-end forecast needs daily
  payment history that this dataset does not have.
- Always use the monthly target from qry_mtd_vs_target / mv_performance_targets
  (the eligible product x DPD segments) so figures match the Command Center.
- Never project collections for a future month beyond the current one. Only one
  snapshot date exists — there is no time series to project from. Say so plainly.
- Never return individual customer names, phone numbers, or other direct PII — this
  dataset intentionally contains none. When declining, state plainly that it's
  unavailable. Do NOT suggest looking up the missing PII in another system (e.g.
  "use Account_ID to find contact details in your CRM") — that defeats the point of
  the refusal by pointing toward de-anonymization. You may still return the other
  non-PII account fields (Account_ID, product, balance, risk scores, vulnerability
  type, preferred channel) if relevant, without operational guidance on identifying
  or contacting the underlying customer.
- Route questions about disputed accounts (Dispute_Flag = 1) or any Vulnerability_Type
  other than "None" toward an appropriate support/review process, not pure automation.
- If a question needs data this dataset doesn't have, say so rather than approximating."""

SAMPLE_QUESTIONS = [
    "What is my MTD collections performance versus target?",
    "Which products and delinquency buckets are furthest behind target?",
    "Why are collections lagging this month?",
    "Which portfolios are contributing most to the gap?",
    "Which segments have weak recovery or increasing roll rates?",
    "Which treatment strategies and channels perform best like-for-like?",
    "Which accounts require immediate intervention?",
    "What recovery opportunity can help close the gap?",
]


# Observed difference of each strategy against "Standard" (the current approach)
# within matched segments of 30+ accounts. Observational only: see the UPLIFT
# GUARDRAIL instruction for how the result must be presented.
UPLIFT_SQL = (
    "SELECT Product, DPD_Bucket, Balance_Band, Vulnerability_Type, Treatment_Strategy, Account_Count, "
    "Balance_Recovery_Rate, "
    "Balance_Recovery_Rate - MAX(CASE WHEN Treatment_Strategy = 'Standard' THEN Balance_Recovery_Rate END) "
    "OVER (PARTITION BY Product, DPD_Bucket, Balance_Band, Vulnerability_Type) AS Observed_Difference_vs_Standard, "
    "PTP_Conversion_Rate, Cost_To_Collect "
    "FROM {g}.qry_strategy_like_for_like WHERE Account_Count >= 30 "
    "ORDER BY Product, DPD_Bucket, Balance_Band, Observed_Difference_vs_Standard DESC;"
)


def examples(g: str):
    return [
        # A plain "versus target" question gets the portfolio headline (one row, as
        # on the Command Center); the breakdown is only for an explicit "by product
        # and DPD bucket". These two used to disagree with the MTD benchmark.
        ("What is my MTD collections performance versus target? / What is MTD collection versus target?",
         f"SELECT SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target, 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct, GREATEST(SUM(Monthly_Target)-SUM(MTD_Collections),0) AS Target_Gap FROM {g}.qry_mtd_vs_target;"),
        ("Show MTD collections versus target by product and DPD bucket",
         f"SELECT Product, DPD_Bucket, MTD_Collections, Monthly_Target, Target_Achievement_Pct, Target_Gap FROM {g}.qry_mtd_vs_target ORDER BY Target_Achievement_Pct;"),
        ("Which products are underperforming versus target?",
         f"SELECT Product, SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target, 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct FROM {g}.qry_mtd_vs_target GROUP BY Product ORDER BY Achievement_Pct;"),
        ("Show target achievement % by product",
         f"SELECT Product, AVG(Target_Achievement_Pct) AS Target_Achievement_Pct FROM {g}.qry_mtd_vs_target GROUP BY Product ORDER BY Target_Achievement_Pct;"),
        ("Why are collections lagging this month? / Which product and DPD bucket combinations are driving the shortfall?",
         f"SELECT * FROM {g}.qry_kpi_drivers ORDER BY Balance_Recovery_Rate, Outstanding_Balance DESC;"),
        ("Which accounts require immediate intervention?",
         f"SELECT * FROM {g}.qry_immediate_intervention ORDER BY Incremental_Recovery_Opportunity DESC, Nonpayment_Risk DESC LIMIT 100;"),
        ("What is my RPC rate, PTP conversion rate and broken-promise rate by product?",
         f"SELECT Product, MEASURE(rpc_rate) AS rpc_rate, MEASURE(ptp_conversion_rate) AS ptp_conversion_rate, MEASURE(broken_promise_rate) AS broken_promise_rate FROM {g}.mv_collections_funnel GROUP BY Product;"),
        ("Which treatment strategy has the best promise-to-pay conversion?",
         f"SELECT Treatment_Strategy, MEASURE(ptp_conversion_rate) AS ptp_conversion_rate, MEASURE(broken_promise_rate) AS broken_promise_rate, MEASURE(cost_to_collect) AS cost_to_collect FROM {g}.mv_collections_funnel GROUP BY Treatment_Strategy ORDER BY ptp_conversion_rate DESC;"),
        ("Which channel is most effective and has the lowest cost to collect?",
         f"SELECT Preferred_Channel, MEASURE(rpc_rate) AS rpc_rate, MEASURE(ptp_conversion_rate) AS ptp_conversion_rate, MEASURE(cost_to_collect) AS cost_to_collect FROM {g}.mv_collections_funnel GROUP BY Preferred_Channel ORDER BY rpc_rate DESC, cost_to_collect;"),
        ("Are our current collections policies too aggressive?",
         f"SELECT * FROM {g}.qry_over_contact_risk;"),
        ("Which collector team has the highest PTP conversion rate?",
         f"SELECT Collector_Team, MEASURE(ptp_conversion_rate) AS ptp_conversion_rate, MEASURE(account_count) AS account_count FROM {g}.mv_collections_funnel GROUP BY Collector_Team ORDER BY ptp_conversion_rate DESC;"),
        ("How much has each collector team collected this month?",
         f"SELECT Collector_Team, MEASURE(mtd_collections) AS mtd_collections FROM {g}.mv_performance_targets GROUP BY Collector_Team ORDER BY mtd_collections DESC;"),
        ("Which language has the worst RPC rate?",
         f"SELECT Preferred_Language, MEASURE(rpc_rate) AS rpc_rate FROM {g}.mv_collections_funnel GROUP BY Preferred_Language ORDER BY rpc_rate;"),
        ("What time of day gets the best contact rate?",
         f"SELECT Last_Contact_Hour, MEASURE(contact_rate) AS contact_rate FROM {g}.mv_collections_funnel GROUP BY Last_Contact_Hour ORDER BY Last_Contact_Hour;"),
        ("Which channel should we use for each DPD bucket?",
         f"SELECT * FROM {g}.qry_recommended_channel ORDER BY DPD_Bucket;"),
        ("Which collectors are performing best?",
         f"SELECT * FROM {g}.qry_collector_scorecard ORDER BY Balance_Recovery_Rate DESC;"),
        ("Which portfolios are contributing most to the shortfall?",
         f"SELECT * FROM {g}.qry_shortfall_contribution ORDER BY Target_Gap DESC;"),
        ("Which customer segments are underperforming?",
         f"SELECT Product, DPD_Bucket, Account_Count, Target_Achievement_Pct, Portfolio_Achievement_Pct, Variance_To_Portfolio, Performance_Status FROM {g}.qry_underperforming_segments WHERE Performance_Status <> 'At or Above Portfolio' ORDER BY Variance_To_Portfolio;"),
        ("Which strategies perform best on a like-for-like basis?",
         f"SELECT Product, DPD_Bucket, Balance_Band, Vulnerability_Type, Treatment_Strategy, Account_Count, Balance_Recovery_Rate, PTP_Conversion_Rate, Cost_To_Collect FROM {g}.qry_strategy_like_for_like WHERE Account_Count >= 30 ORDER BY Product, DPD_Bucket, Balance_Band, Balance_Recovery_Rate DESC;"),
        ("What uplift would an alternative/challenger strategy deliver?",
         UPLIFT_SQL.format(g=g)),
        # One example for every source that had none (2026-10-14), so Genie learns what each is for.
        ("How are we doing overall? / Are we good for today? / Show the headline KPIs",
         f"SELECT Outstanding_Portfolio, Recovery_MTD, Recovery_Rate, Accounts_In_Collections, RPC_Rate, Broken_Share_Of_Due_Promises, High_Risk_Accounts, Cost_To_Collect FROM {g}.qry_cc_kpis;"),
        ("How is our portfolio distributed across DPD buckets, and where is the risk concentrated?",
         f"SELECT DPD_Bucket, Accounts, Outstanding_Balance, Account_Share, Balance_Share, Recovery_Rate FROM {g}.qry_cc_risk_snapshot ORDER BY Bucket_Order;"),
        ("Are we on track for this month's target? / What is the outlook for the month?",
         f"SELECT Recovery_Target, Recovery_Achieved, Achievement_Pct, Target_Gap, Promised_Rest_Of_Month, Promise_Honour_Rate, Expected_From_Promises, Outlook_EOM_Recovery, Target_Likelihood FROM {g}.qry_cc_target_outlook;"),
        ("What should we do this week? / What are the action queues?",
         f"SELECT * FROM {g}.qry_cc_actions;"),
        ("Which promises to pay are due in the next 7 days, and which are likely to break?",
         f"SELECT Account_ID, Product, DPD_Bucket, PTP_Amount, PTP_Due_Date, Payment_Propensity, Nonpayment_Risk, Action_Queue FROM {g}.qry_cc_action_accounts WHERE Action_Queue IN ('Broken-PTP follow-up (due in 7 days, likely to break)', 'PTP due in the next 7 days') ORDER BY PTP_Due_Date, PTP_Amount DESC;"),
        ("Which accounts are about to roll into 180+ days past due?",
         f"SELECT Account_ID, Product, DPD, Outstanding_Balance, Payment_Propensity, Nonpayment_Risk FROM {g}.qry_cc_action_accounts WHERE Action_Queue = 'Rolling toward 180+ DPD' ORDER BY Outstanding_Balance DESC;"),
        ("How effective are our SMS, WhatsApp, voice and digital channels overall?",
         f"SELECT Channel, Accounts, RPC_Rate, PTP_Conversion_Rate, Recovery_Rate, Cost_To_Collect FROM {g}.qry_cc_channel ORDER BY Recovery_Rate DESC;"),
        ("Which regions are underperforming on recovery?",
         f"SELECT Region, Accounts, Outstanding_Balance, Recovery_Rate, RPC_Rate, High_Risk_Share FROM {g}.qry_cc_region ORDER BY Recovery_Rate;"),
        ("How is each product doing against target?",
         f"SELECT Product, MTD_Collections, Monthly_Target, Achievement_Pct, Target_Gap FROM {g}.qry_product_vs_target ORDER BY Achievement_Pct;"),
        ("Which products and DPD buckets are furthest behind target, and how much balance sits there?",
         f"SELECT Product, DPD_Bucket, Outstanding_Balance, MTD_Collections, Monthly_Target, Achievement_Pct, Target_Gap FROM {g}.qry_product_bucket_performance ORDER BY Achievement_Pct;"),
        ("How many accounts make it through each stage of the collections funnel?",
         f"SELECT Eligible_Accounts, Attempted_Accounts, RPC_Accounts, PTP_Accounts, Kept_PTP_Accounts FROM {g}.qry_collections_funnel;"),
        ("What are our overall contact, RPC, PTP conversion and broken-promise rates?",
         f"SELECT Contact_Rate, RPC_Rate, PTP_Conversion_Rate, Broken_Promise_Rate FROM {g}.qry_funnel_rates;"),
        ("Why are customers not paying? / Which non-payment drivers hold the most balance?",
         f"SELECT Primary_Nonpayment_Driver, Account_Count, Outstanding_Balance, Recovery_Rate, Average_Nonpayment_Risk FROM {g}.qry_nonpayment_drivers ORDER BY Outstanding_Balance DESC;"),
        ("What recovery opportunity can help close the gap, by product and DPD bucket?",
         f"SELECT Product, DPD_Bucket, Intervention_Accounts, Outstanding_Balance, Incremental_Recovery_Opportunity FROM {g}.qry_recovery_opportunity_sizing ORDER BY Incremental_Recovery_Opportunity DESC;"),
        ("Which accounts should we prioritise first, and how much can we recover from them?",
         f"SELECT COUNT(*) AS Priority_Accounts, SUM(Outstanding_Balance) AS Balance, SUM(Incremental_Recovery_Opportunity) AS Recoverable FROM {g}.qry_cc_priority_accounts;"),
        ("How many promises to pay were made this month, and how many were kept or broken?",
         f"SELECT PTP_Accounts, PTP_Amount_Total, PTP_Due_Accounts, PTP_Kept_Accounts, Broken_PTP_Accounts, Broken_PTP_Amount, PTP_Upcoming_Accounts, PTP_Upcoming_Amount FROM {g}.qry_cc_kpis;"),
        ("How is a high-risk account defined? / What thresholds does LensS use?",
         f"SELECT rule_name, threshold_value, notes FROM {g}.business_rules_config ORDER BY rule_name;"),
    ]


def benchmarks(g: str):
    return [
        ("What is MTD collection versus target?",
         f"SELECT SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target, 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct, GREATEST(SUM(Monthly_Target)-SUM(MTD_Collections),0) AS Target_Gap FROM {g}.qry_mtd_vs_target;"),
        ("Which product is underperforming?",
         f"SELECT Product, SUM(MTD_Collections) AS MTD_Collections, SUM(Monthly_Target) AS Monthly_Target, 1.0*SUM(MTD_Collections)/NULLIF(SUM(Monthly_Target),0) AS Achievement_Pct FROM {g}.qry_mtd_vs_target GROUP BY Product ORDER BY Achievement_Pct;"),
        ("Why is performance lagging this month?",
         f"SELECT * FROM {g}.qry_kpi_drivers ORDER BY Balance_Recovery_Rate, Outstanding_Balance DESC;"),
        ("Best channel by 31-60 bucket?",
         f"SELECT Preferred_Channel, MEASURE(rpc_rate) AS rpc_rate, MEASURE(ptp_conversion_rate) AS ptp_conversion_rate, MEASURE(cost_to_collect) AS cost_to_collect FROM {g}.mv_collections_funnel WHERE DPD_Bucket='31-60' GROUP BY Preferred_Channel ORDER BY ptp_conversion_rate DESC;"),
        ("Are current policies too aggressive?",
         f"SELECT * FROM {g}.qry_over_contact_risk;"),
        # The guardrail answer is the observational like-for-like comparison (see
        # the UPLIFT GUARDRAIL instruction), which a benchmark can actually grade.
        ("What uplift would an alternative/challenger strategy deliver?",
         UPLIFT_SQL.format(g=g)),
        ("Which segments are underperforming?",
         f"SELECT Product, DPD_Bucket, Target_Achievement_Pct, Portfolio_Achievement_Pct, Variance_To_Portfolio, Performance_Status FROM {g}.qry_underperforming_segments WHERE Performance_Status <> 'At or Above Portfolio' ORDER BY Variance_To_Portfolio;"),
        ("Which non-payment drivers hold the most balance?",
         f"SELECT Primary_Nonpayment_Driver, Account_Count, Outstanding_Balance, Recovery_Rate FROM {g}.qry_nonpayment_drivers ORDER BY Outstanding_Balance DESC;"),
        ("What recovery opportunity can help close the gap?",
         f"SELECT Product, DPD_Bucket, Intervention_Accounts, Incremental_Recovery_Opportunity FROM {g}.qry_recovery_opportunity_sizing ORDER BY Incremental_Recovery_Opportunity DESC;"),
        # Refusal case: the API requires an answer, so this documents the expected
        # refusal; Genie answers without SQL, so the result is marked for manual review.
        ("Show customer names and mobile numbers for high-risk accounts",
         "SELECT 'This dataset intentionally contains no direct PII — decline plainly, and do not suggest looking up Account_ID in a CRM to re-identify the customer.' AS Expected_Refusal_Reasoning;"),
    ]


def _id() -> str:
    return uuid.uuid4().hex


def build_serialized_space(gold_schema: str) -> dict:
    """gold_schema is '<catalog>.<schema>', e.g. 'cnx_automl_dev.lenss_collections_gold'."""
    return {
        "version": 2,
        "config": {
            "sample_questions": sorted(
                ({"id": _id(), "question": [q]} for q in SAMPLE_QUESTIONS), key=lambda x: x["id"]
            )
        },
        "data_sources": {
            "tables": sorted(({"identifier": f"{gold_schema}.{t}"} for t in TABLES), key=lambda x: x["identifier"]),
            "metric_views": sorted(({"identifier": f"{gold_schema}.{m}"} for m in METRIC_VIEWS), key=lambda x: x["identifier"]),
        },
        "instructions": {
            "text_instructions": [{"id": _id(), "content": [INSTRUCTIONS_TEXT]}],
            "example_question_sqls": sorted(
                ({"id": _id(), "question": [q], "sql": [s]} for q, s in examples(gold_schema)), key=lambda x: x["id"]
            ),
        },
        "benchmarks": {
            "questions": sorted(
                ({"id": _id(), "question": [q], "answer": [{"format": "SQL", "content": [s]}]} for q, s in benchmarks(gold_schema)),
                key=lambda x: x["id"],
            )
        },
    }
