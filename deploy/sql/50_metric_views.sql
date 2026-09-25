-- Governed Metric Views (guide Step 3). Requires DBR 16.4+ / a current SQL warehouse.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.mv_performance_targets WITH METRICS LANGUAGE YAML AS $$
version: 1.1
comment: "Collections performance and target metrics - plus collections-only cuts by channel/strategy/vulnerability/collector (no target attached to these, since Fact_Targets has no grain below Product x DPD_Bucket)"
source: {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
filter: source.DPD > 0 AND source.Outstanding_Balance > 0
joins:
  - name: collector
    source: {{catalog}}.{{prefix}}_silver.dim_collector
    on: source.Collector_ID = collector.Collector_ID
    cardinality: many_to_one
fields:
  - name: Product
    expr: source.Product
  - name: DPD_Bucket
    expr: source.DPD_Bucket
    synonyms: [bucket, delinquency stage, arrears band, aging band, days past due band]
  - name: Region
    expr: source.Region
  - name: Vulnerability_Type
    expr: source.Vulnerability_Type
    synonyms: [vulnerable customer, hardship, income shock, medical hardship, special assistance]
  - name: Treatment_Strategy
    expr: source.Treatment_Strategy
    synonyms: [strategy, treatment, collections policy, contact strategy, journey]
  - name: Preferred_Channel
    expr: source.Preferred_Channel
    synonyms: [voice, call, dialler, WhatsApp, WA, SMS, text, email, digital self-cure]
  - name: Collector_Team
    expr: collector.Team
    synonyms: [collector team, agent team]
  - name: Collector_Region
    expr: collector.Region
    synonyms: [collector region, agent location, collector office]
measures:
  - name: mtd_collections
    expr: SUM(source.Recovery_MTD)
    comment: "MTD Collections"
    synonyms: [collections, recoveries, cash collected, amount recovered, payments received, realisation]
  - name: outstanding_balance
    expr: SUM(source.Outstanding_Balance)
    comment: "Outstanding Balance"
$$;

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.mv_collections_funnel WITH METRICS LANGUAGE YAML AS $$
version: 1.1
comment: "Comprehensive collections funnel, rate, strategy, channel and collector metrics - every remaining fact_collections_snapshot column is exposed as a field, joined to the collector roster"
source: {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
filter: source.DPD > 0 AND source.Outstanding_Balance > 0
joins:
  - name: collector
    source: {{catalog}}.{{prefix}}_silver.dim_collector
    on: source.Collector_ID = collector.Collector_ID
    cardinality: many_to_one
fields:
  - name: Snapshot_Date
    expr: source.Snapshot_Date
  - name: Account_ID
    expr: source.Account_ID
  - name: Customer_Token
    expr: source.Customer_Token
  - name: Product
    expr: source.Product
  - name: Security_Type
    expr: source.Security_Type
  - name: Region
    expr: source.Region
  - name: Preferred_Language
    expr: source.Preferred_Language
  - name: Balance_Band
    expr: source.Balance_Band
  - name: DPD_Bucket
    expr: source.DPD_Bucket
    synonyms: [bucket, delinquency stage, arrears band, aging band, days past due band]
  - name: Prior_DPD_Bucket
    expr: source.Prior_DPD_Bucket
  - name: Vulnerability_Type
    expr: source.Vulnerability_Type
    synonyms: [vulnerable customer, hardship, income shock, medical hardship, special assistance]
  - name: Dispute_Flag
    expr: source.Dispute_Flag
  - name: Treatment_Strategy
    expr: source.Treatment_Strategy
    synonyms: [strategy, treatment, collections policy, contact strategy, journey]
  - name: Preferred_Channel
    expr: source.Preferred_Channel
    synonyms: [voice, call, dialler, WhatsApp, WA, SMS, text, email, digital self-cure]
  - name: Collector_ID
    expr: source.Collector_ID
  - name: Team
    expr: source.Team
  - name: PTP_Due_Date
    expr: source.PTP_Due_Date
  - name: Last_Contact_Date
    expr: source.Last_Contact_Date
  - name: Last_Contact_Hour
    expr: source.Last_Contact_Hour
  - name: Primary_Nonpayment_Driver
    expr: source.Primary_Nonpayment_Driver
  - name: Collector_Team
    expr: collector.Team
    synonyms: [collector team, agent team]
  - name: Collector_Region
    expr: collector.Region
    synonyms: [collector region, agent location, collector office]
  - name: Collector_Specialization
    expr: collector.Specialization
    synonyms: [collector specialization, agent specialization, collector skill]
  - name: Collector_Status
    expr: collector.Status
  - name: Collector_Join_Date
    expr: collector.Join_Date
measures:
  - name: account_count
    expr: COUNT(DISTINCT source.Account_ID)
    comment: "Distinct account count"
  - name: contact_rate
    expr: COUNT(DISTINCT CASE WHEN source.Contacted_Flag=1 THEN source.Account_ID END) / NULLIF(COUNT(DISTINCT CASE WHEN source.Attempts_MTD>0 THEN source.Account_ID END),0)
    comment: "Contact Rate"
    synonyms: [contactability, contact rate, reach rate, contact success]
  - name: rpc_rate
    expr: SUM(source.RPC_Flag) / NULLIF(SUM(CASE WHEN source.Attempts_MTD>0 THEN 1 ELSE 0 END),0)
    comment: "RPC Rate"
    synonyms: [right party contact, RPC, customer connect, verified contact]
  - name: ptp_conversion_rate
    expr: SUM(source.PTP_Flag) / NULLIF(SUM(source.RPC_Flag),0)
    comment: "PTP Conversion Rate"
    synonyms: [promise to pay, PTP, payment promise, commitment to pay]
  - name: promise_kept_rate
    expr: SUM(CASE WHEN source.PTP_Due_Date<=source.Snapshot_Date AND source.Broken_PTP_Flag=0 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN source.PTP_Due_Date<=source.Snapshot_Date THEN 1 ELSE 0 END),0)
    comment: "Promise Kept Rate"
    synonyms: [kept promise, PK rate, PTP kept]
  - name: broken_promise_rate
    expr: SUM(source.Broken_PTP_Flag) / NULLIF(SUM(CASE WHEN source.PTP_Due_Date<=source.Snapshot_Date THEN 1 ELSE 0 END),0)
    comment: "Broken Promise Rate"
    synonyms: [broken promise, BPTP, failed promise, unkept commitment]
  - name: cure_rate
    expr: SUM(source.Cure_Flag) / NULLIF(COUNT(DISTINCT source.Account_ID),0)
    comment: "Cure Rate"
    synonyms: [cure, regularisation, normalisation, brought current, resolved delinquency]
  - name: roll_forward_rate
    expr: SUM(source.Roll_Forward_Flag) / NULLIF(COUNT(source.Account_ID),0)
    comment: "Roll Rate"
    synonyms: [roll forward, bucket deterioration, migration to worse bucket, slippage]
  - name: roll_back_rate
    expr: SUM(source.Roll_Back_Flag) / NULLIF(COUNT(source.Account_ID),0)
    comment: "Roll-back Rate"
    synonyms: [roll back, bucket improvement, migration to better bucket]
  - name: digital_penetration
    expr: SUM(CASE WHEN source.WhatsApp_Attempts + source.SMS_Attempts + source.Email_Attempts > 0 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN source.Attempts_MTD>0 THEN 1 ELSE 0 END),0)
    comment: "Digital Penetration"
    synonyms: [digital reach, digital coverage]
  - name: high_risk_accounts
    expr: COUNT(DISTINCT CASE WHEN source.Nonpayment_Risk >= 0.70 THEN source.Account_ID END)
    comment: "High-Risk Accounts (threshold 0.70 - see gold.business_rules_config)"
    synonyms: [high risk, critical, likely nonpayer, red account, high nonpayment risk]
  - name: incremental_recovery_opportunity
    expr: SUM(source.Incremental_Recovery_Opportunity)
    comment: "Incremental Recovery Opportunity"
    synonyms: [upside, recovery opportunity, incremental recovery, collectible potential]
  - name: cost_to_collect
    expr: SUM(source.Cost_MTD) / NULLIF(SUM(source.Recovery_MTD),0)
    comment: "Cost to Collect"
    synonyms: [CTC, collection cost, cost per recovery, recovery expense]
  - name: average_dpd
    expr: AVG(source.DPD)
    comment: "Average days past due"
  - name: average_annual_income
    expr: AVG(source.Annual_Income)
    comment: "Average annual income"
  - name: average_attempts
    expr: AVG(source.Attempts_MTD)
    comment: "Average contact attempts MTD"
  - name: voice_attempts_total
    expr: SUM(source.Voice_Attempts)
    comment: "Total voice attempts"
  - name: whatsapp_attempts_total
    expr: SUM(source.WhatsApp_Attempts)
    comment: "Total WhatsApp attempts"
  - name: sms_attempts_total
    expr: SUM(source.SMS_Attempts)
    comment: "Total SMS attempts"
  - name: email_attempts_total
    expr: SUM(source.Email_Attempts)
    comment: "Total email attempts"
  - name: ptp_count
    expr: SUM(source.PTP_Flag)
    comment: "Count of accounts with an active PTP"
  - name: ptp_amount_total
    expr: SUM(source.PTP_Amount)
    comment: "Total promised amount"
  - name: total_cost
    expr: SUM(source.Cost_MTD)
    comment: "Total collection cost MTD"
  - name: average_payment_propensity
    expr: AVG(source.Payment_Propensity)
    comment: "Average payment propensity score"
  - name: average_nonpayment_risk
    expr: AVG(source.Nonpayment_Risk)
    comment: "Average nonpayment risk score"
  - name: mtd_collections
    expr: SUM(source.Recovery_MTD)
    comment: "MTD Collections"
    synonyms: [collections, recoveries, cash collected, amount recovered, payments received, realisation]
  - name: outstanding_balance
    expr: SUM(source.Outstanding_Balance)
    comment: "Outstanding Balance"
  - name: balance_recovery_rate
    expr: SUM(source.Recovery_MTD) / NULLIF(SUM(source.Outstanding_Balance),0)
    comment: "MTD collections as a share of outstanding balance"
  - name: recovery_per_account
    expr: SUM(source.Recovery_MTD) / NULLIF(COUNT(DISTINCT source.Account_ID),0)
    comment: "Recovery per account"
$$;
