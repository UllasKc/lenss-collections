-- Silver: typed, constrained, canonical (guide Step 2). Full verified 41-column set.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot AS
SELECT
  CAST(Snapshot_Date AS DATE)              AS Snapshot_Date,
  CAST(Account_ID AS STRING)               AS Account_ID,
  CAST(Customer_Token AS STRING)           AS Customer_Token,
  CAST(Product AS STRING)                  AS Product,
  CAST(Security_Type AS STRING)            AS Security_Type,
  CAST(Region AS STRING)                   AS Region,
  CAST(Preferred_Language AS STRING)       AS Preferred_Language,
  CAST(Outstanding_Balance AS DECIMAL(18,2)) AS Outstanding_Balance,
  CAST(Balance_Band AS STRING)             AS Balance_Band,
  CAST(DPD AS INT)                         AS DPD,
  CAST(DPD_Bucket AS STRING)               AS DPD_Bucket,
  CAST(Prior_DPD_Bucket AS STRING)         AS Prior_DPD_Bucket,
  CAST(Annual_Income AS DECIMAL(18,2))     AS Annual_Income,
  CAST(Vulnerability_Type AS STRING)       AS Vulnerability_Type,
  CAST(Dispute_Flag AS INT)                AS Dispute_Flag,
  CAST(Treatment_Strategy AS STRING)       AS Treatment_Strategy,
  CAST(Preferred_Channel AS STRING)        AS Preferred_Channel,
  CAST(Collector_ID AS STRING)             AS Collector_ID,
  CAST(Team AS STRING)                     AS Team,
  CAST(Attempts_MTD AS INT)                AS Attempts_MTD,
  CAST(Voice_Attempts AS INT)              AS Voice_Attempts,
  CAST(WhatsApp_Attempts AS INT)           AS WhatsApp_Attempts,
  CAST(SMS_Attempts AS INT)                AS SMS_Attempts,
  CAST(Email_Attempts AS INT)              AS Email_Attempts,
  CAST(RPC_Flag AS INT)                    AS RPC_Flag,
  CAST(Contacted_Flag AS INT)              AS Contacted_Flag,
  CAST(PTP_Flag AS INT)                    AS PTP_Flag,
  CAST(PTP_Amount AS DECIMAL(18,2))        AS PTP_Amount,
  CAST(PTP_Due_Date AS DATE)               AS PTP_Due_Date,
  CAST(Recovery_MTD AS DECIMAL(18,2))      AS Recovery_MTD,
  CAST(Broken_PTP_Flag AS INT)             AS Broken_PTP_Flag,
  CAST(Cure_Flag AS INT)                   AS Cure_Flag,
  CAST(Roll_Forward_Flag AS INT)           AS Roll_Forward_Flag,
  CAST(Roll_Back_Flag AS INT)              AS Roll_Back_Flag,
  CAST(Cost_MTD AS DECIMAL(18,2))          AS Cost_MTD,
  CAST(Last_Contact_Date AS DATE)          AS Last_Contact_Date,
  CAST(Last_Contact_Hour AS INT)           AS Last_Contact_Hour,
  CAST(Payment_Propensity AS DECIMAL(10,6)) AS Payment_Propensity,
  CAST(Nonpayment_Risk AS DECIMAL(10,6))   AS Nonpayment_Risk,
  CAST(Incremental_Recovery_Opportunity AS DECIMAL(18,2)) AS Incremental_Recovery_Opportunity,
  CAST(Primary_Nonpayment_Driver AS STRING) AS Primary_Nonpayment_Driver
FROM {{catalog}}.{{prefix}}_bronze.fact_collections_snapshot;

-- A PRIMARY KEY needs NOT NULL columns first; CTAS doesn't infer it.
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ALTER COLUMN Account_ID SET NOT NULL;
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ALTER COLUMN Snapshot_Date SET NOT NULL;
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ADD CONSTRAINT pk_snapshot PRIMARY KEY (Account_ID, Snapshot_Date);

-- Explicit casts rather than SELECT *: bronze is loaded via read_files() CSV
-- inference, which can add a _rescued_data column and infer dates differently
-- than the original pandas/Spark notebook did.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_silver.dim_collector AS
SELECT
  CAST(Collector_ID AS STRING)   AS Collector_ID,
  CAST(Team AS STRING)           AS Team,
  CAST(Region AS STRING)         AS Region,
  CAST(Specialization AS STRING) AS Specialization,
  CAST(Status AS STRING)         AS Status,
  CAST(Join_Date AS DATE)        AS Join_Date
FROM {{catalog}}.{{prefix}}_bronze.dim_collector;

CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_silver.fact_targets AS
SELECT
  CAST(Target_Month AS DATE)       AS Target_Month,
  CAST(Product AS STRING)          AS Product,
  CAST(DPD_Bucket AS STRING)       AS DPD_Bucket,
  CAST(Eligible_Balance AS DOUBLE) AS Eligible_Balance,
  CAST(Monthly_Target AS DOUBLE)   AS Monthly_Target,
  CAST(Daily_Target AS DOUBLE)     AS Daily_Target
FROM {{catalog}}.{{prefix}}_bronze.fact_targets;
