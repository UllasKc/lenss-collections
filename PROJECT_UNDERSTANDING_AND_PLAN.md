# LensS Collections — Project Understanding & Project Plan

*Compiled from all files in `all_details_and _data/` on 2026-09-23. No code, notebooks, or Databricks assets exist in this repo yet — everything below is derived purely from the specification documents and the sample workbook.*

---

## 1. What this project actually is

**LensS** is a conversational (natural-language) analytics layer — the docs describe a pipeline of:

> NL query → synonym/entity resolution → governed semantic metrics → SQL generation → result validation → narrative/root-cause layer → chart/action recommendation

This project is a **Collections-domain demo** for that engine. Someone (referenced only as an email correspondent in `Details for excel file.docx`) has already produced a "development-ready starter pack" — synthetic data plus a full semantic specification — so that a dev team can wire LensS up against **Databricks** and have it answer natural-language questions about a loan-collections portfolio.

The **confirmed scope is only two of four documented use cases** (this is stated explicitly in the Business_Rules sheet, rule R01):

| Use case | Status |
|---|---|
| **UC1 — Collections Performance Management & Forecasting** | ✅ In scope |
| UC2 — Agency Performance & Allocation Optimization | ❌ Out of scope (documented in `LensS Queries.docx` for context only) |
| **UC3 — Collections Policy & Strategy Effectiveness** | ✅ In scope |
| UC4 — Workforce & Capacity Optimization | ❌ Out of scope |

This matches what you told me (UC1 & UC3, on Databricks), so the file set is internally consistent with your instructions.

---

## 1a. Domain, personas, and client context

**Domain**: Banking / Financial Services (BFSI) — specifically the **debt collections / recoveries function** of a lender. The synthetic portfolio spans five loan products: Credit Card, Personal Loan, Auto Loan, Mortgage, SME Loan.

**What LensS is, vs. what this project is**: LensS is the *product* — a conversational analytics tool that takes a plain-English business question and returns a governed answer (number, chart, root cause, or recommendation). This project is not LensS itself; it is a **demo / proof-of-concept build** that wires LensS up against a Collections dataset so it can answer real collections-manager questions, deployed on Databricks.

**Who actually asks these questions (the personas)** — named explicitly in `LensS Queries.docx` and the `Query_Catalog` sheet:

| Persona | Use case | What they care about |
|---|---|---|
| **Collections Head** | UC1 (in scope) | Will I hit this month's target? Why or why not? What should I do about it? |
| **Collections Strategy Manager** | UC3 (in scope) | Which segments/policies/treatments are working, which aren't, and how do I improve them? |
| Vendor/Collections Manager | UC2 (not in scope) | Which outsourced collections agency to route accounts to |
| Operations Manager | UC4 (not in scope) | Staffing/workforce capacity |

`Query_Catalog` also groups questions under two broader roles — **Executive** (performance, targets, forecasts, intervention lists) and **Strategy** (segmentation, treatment effectiveness, policy tuning). So the people who want these predictions are collections managers and their leadership, deciding day-to-day whether they'll hit the month's recovery number and which levers (channel, strategy, staffing, account prioritization) to pull if not.

**Who the actual client is — updated 2026-09-23, now reasonably well-evidenced.** No company or bank name appears in the original pack itself, but two later pieces of evidence point strongly at an answer: (1) the Databricks catalog access granted for this project is inside `cnx_automl_dev`, and (2) a sibling reference deck, `CNX-Command-Center-Architecture-Review.pdf`, is Concentrix-copyrighted and documents an internal Concentrix operations tool built on this exact same architecture pattern. **CNX = Concentrix.** The most likely read now is that this is an **internal Concentrix initiative** — built for Concentrix's own (or a Concentrix-managed client's) collections operations — rather than a pre-sales demo pack for an unnamed external prospect. This is still an inference, not a confirmed fact — worth a direct confirmation — but it's no longer a total unknown, and it should resolve who owns the Databricks environment and who signs off on the demo-assumption thresholds (Business_Rules): almost certainly someone inside Concentrix's own collections or analytics practice, not an external client-facing sales team.

---

## 2. Inventory of what exists today

```
D:\LensS_Collections\all_details_and _data\
├── Details for excel file.docx                              — cover note explaining the pack
├── LensS Queries.docx                                        — all 4 use cases' business questions (source requirements)
├── LensS_Collections_Demo_Development_Pack.xlsx               — the actual dev pack (11 sheets, ~4.9MB)
├── LensS_Collections_Demo_SQL_and_Event_Level_Data_Model.docx — 4 event-level fact table DDLs + sample queries
└── LensS_Collections_Demo_Sample_SQL_Queries.docx             — 20 sample SQL queries against the snapshot model
```

There is **no Databricks workspace config, no notebooks, no dbt/SQL scripts, no repo (`git init` has not been run), and no application code anywhere**. This is 100% a requirements + synthetic-data package. Everything from here is greenfield build.

### 2.1 The workbook (`LensS_Collections_Demo_Development_Pack.xlsx`) — 11 sheets

| Sheet | Rows | Purpose |
|---|---|---|
| README | 12 | Scope, architecture intent, as-of date, caveats |
| **Fact_Collections_Snapshot** | 20,000 + header | The core synthetic dataset — one row per Account_ID as of Snapshot_Date (41 columns) |
| Dim_Collector | 80 | Collector → team/region/specialization master |
| Fact_Targets | 30 | Monthly recovery target by Product × DPD_Bucket |
| Metric_Catalog | 20 metrics | Business term → definition → SQL logic → output type → rule → synonyms |
| Business_Rules | 15 rules | Hard rules, demo assumptions, configurable thresholds |
| Synonym_Catalog | 95 entries | Vocabulary → canonical metric/dimension mapping, for NL resolution |
| Query_Catalog | 12 queries | Sample NL questions mapped to required metrics/grain/output, by persona (Executive/Strategy) |
| Data_Dictionary | 41 fields | Full field-level spec for Fact_Collections_Snapshot |
| Model_Requirements | 7 capabilities | What's genuinely ML-model-worthy vs. what's a synthetic stand-in for the demo |
| Acceptance_Tests | 7 tests | Concrete Q&A pairs LensS must pass, with expected behavior/guardrails |

**Fact_Collections_Snapshot grain**: one row per `Account_ID` per `Snapshot_Date` (demo has a single snapshot: **2026-09-15**).

Key columns: `Product` (Credit Card/Personal Loan/Auto Loan/Mortgage/SME Loan), `DPD` / `DPD_Bucket` (Current…180+), `Outstanding_Balance`, `Balance_Band`, `Region`, `Vulnerability_Type`, `Dispute_Flag`, `Treatment_Strategy`, `Preferred_Channel`, `Collector_ID`/`Team`, per-channel attempt counts, `RPC_Flag`/`PTP_Flag`/`Broken_PTP_Flag`/`Cure_Flag`/`Roll_Forward_Flag`/`Roll_Back_Flag`, `Recovery_MTD`, `Cost_MTD`, and three **pre-computed synthetic model scores**: `Payment_Propensity`, `Nonpayment_Risk`, `Incremental_Recovery_Opportunity`, plus `Primary_Nonpayment_Driver`.

### 2.2 The Word docs

- **`LensS Queries.docx`** — the original business requirements for all 4 use cases (this is the "why" behind the metrics; UC2/UC4 content is useful context but not build targets).
- **`LensS_Collections_Demo_Sample_SQL_Queries.docx`** — 20 working ANSI-SQL queries against `Fact_Collections_Snapshot`/`Fact_Targets`/`Dim_Collector`, organized by capability (Performance, Forecasting, Root-Cause, Policy/Segmentation, Channel, Prescriptive, Policy Diagnostics, Collector Diagnostics), plus a section of **"LensS SQL-generation controls"** (11 guardrails LensS's SQL generator must always follow) and a **recommended demo query sequence**. It explicitly flags: *"Functions such as DATE_TRUNC, LAST_DAY, EXTRACT, GREATEST and FETCH FIRST vary slightly by SQL engine... create platform-specific templates for Databricks SQL"* — i.e., these queries are ANSI-style references, not yet Databricks-SQL-validated.
- **`LensS_Collections_Demo_SQL_and_Event_Level_Data_Model.docx`** — DDL for **four event-level fact tables that do not exist as data anywhere** (see gap #1 below): `Fact_Collection_Transactions`, `Fact_Contact_Events`, `Fact_Promise_To_Pay`, `Fact_Strategy_Assignment`, plus a `Dim_Business_Calendar` mention. These extend the snapshot model with temporal detail for daily forecasting, channel attribution, PTP lifecycle, and champion/challenger analysis, with a recommended 6-step implementation sequence and temporal-join patterns (join contact/promise/transaction events to the strategy that was `Effective_Start_Timestamp`–`Effective_End_Timestamp` active at the event time).

---

## 3. Target architecture (as specified)

From the README and the SQL-generation controls, the intended pipeline is:

1. **Storage**: Delta tables in Databricks (Unity Catalog implied, not stated).
2. **Governed semantic layer**: views/metrics built per `Metric_Catalog`, not raw table access — the docs explicitly say *"Expose only governed views to LensS rather than allowing direct generation against raw event tables."*
3. **NL resolution layer**: `Synonym_Catalog` maps free-text vocabulary → canonical metric/dimension before SQL generation.
4. **SQL generation** against Databricks SQL, constrained by the 11 rules in section 3 of the Sample Queries doc (e.g., always use `COUNT(DISTINCT Account_ID)`, aggregate targets at their own grain before joining, exclude future-dated promises from broken-PTP calcs, apply minimum-volume thresholds before rankings, label observational vs. causal comparisons, apply authorization before returning account-level identifiers).
5. **Result validation** and a **narrative/root-cause layer** that must reconcile back to the underlying metrics (see Acceptance_Tests Q03).
6. **Governance guardrails**: no fabricated causal claims (Q06), privacy-safe refusal when asked for PII that doesn't exist (Q07), routing disputes/vulnerable customers to support rather than aggressive automated recommendations (Business_Rules R14, Sample Queries note on Q18).

---

## 4. Proposed project plan

### Phase 0 — Environment & foundations
- Confirm Databricks workspace, Unity Catalog catalog/schema naming (e.g. `lens_collections.demo`), cluster/warehouse (SQL Warehouse for BI/NLQ workloads), and access control model.
- Initialize version control (this folder is not yet a git repo) and set up a clean project structure: `/data`, `/ddl`, `/semantic`, `/notebooks`, `/tests`.
- Decide the actual **LensS integration mechanism** (see Open Question A below) before building anything downstream of raw tables.

### Phase 1 — Data ingestion
- Land the three tabular sheets as Delta tables: `fact_collections_snapshot` (20,000 rows), `dim_collector` (80 rows), `fact_targets` (30 rows).
- Apply the Data_Dictionary types exactly (e.g. `DPD_Bucket` as controlled-list string, dates as `DATE`, flags as `INT`/`BOOLEAN`).
- Load the reference/config sheets (`Metric_Catalog`, `Business_Rules`, `Synonym_Catalog`, `Query_Catalog`) as governance tables — these drive the semantic layer and the NL resolver, they are not just documentation.
- Add basic data-quality checks (row counts, null checks on required fields per Data_Dictionary, PK uniqueness on `Account_ID`+`Snapshot_Date`).

### Phase 2 — Semantic / metrics layer
- Translate all 20 `Metric_Catalog` entries into Databricks SQL views/functions, honoring each metric's `Business_Rule` column (e.g., Cure_Rate uses the 90%-of-outstanding demo threshold; Broken_Promise_Rate excludes unmatured PTPs).
- Encode the 15 `Business_Rules` as either view predicates or a parameterized rules table (thresholds marked "Configurable" should be config-driven, not hardcoded, since the workbook itself says several need sign-off from "the collections practice leader" before being finalized).
- Port the 20 sample SQL queries from ANSI-style to validated Databricks SQL (swap `DATE_TRUNC`/`LAST_DAY`/`EXTRACT`/`FETCH FIRST` for Databricks equivalents as the doc itself flags is needed).
- Encode the 11 "LensS SQL-generation controls" as literal constraints in whatever generates SQL (prompt rules, guardrail layer, or query templates).

### Phase 3 — NL layer wiring (UC1 & UC3 query sets)
- Feed `Synonym_Catalog` (95 rows) into the entity/metric resolver.
- Validate against all UC1 and UC3 questions listed in `LensS Queries.docx` and the `Query_Catalog` sheet (Executive + Strategy personas), using the "Recommended demo query sequence" (8 questions) and "Recommended demo storyline" (9 questions, near-duplicate list in the cover note) as the walkthrough script.
- Implement the narrative/root-cause and chart-recommendation layer called for in the README architecture — currently undefined beyond "insights generated by the tool" bullet lists in `LensS Queries.docx`.

### Phase 4 — Testing & acceptance
- Run all 7 `Acceptance_Tests` verbatim (Q01–Q07) and confirm both the returned numbers **and** the required guardrail behavior (e.g. Q06 must refuse to fabricate a causal uplift number; Q07 must give a privacy-safe non-answer).
- Add regression tests for the 11 SQL-generation controls (e.g. a test that a ranking query is rejected/flagged below the minimum-volume threshold).

### Phase 5 — Event-level enhancement (conditional — see Gap #1)
- If daily/intraday forecasting, true channel attribution, PTP lifecycle, or champion/challenger analysis are actually needed for the UC1/UC3 demo (not just the snapshot-level proxies), implement the four event-level fact tables per the DDL in `LensS_Collections_Demo_SQL_and_Event_Level_Data_Model.docx`, generate matching synthetic event data (none currently exists), and follow that doc's stated load sequence (transactions + contacts first, then PTP lifecycle, then strategy assignments, then the 5 semantic views it names: `Daily_Collections`, `Contact_Funnel`, `PTP_Performance`, `Strategy_Outcome`, `Channel_Attribution`).
- Otherwise, explicitly descope this and rely on the snapshot-level proxies, documenting the demo limitations already called out (Business_Rules R11, R14; Model_Requirements rows for Forecasting/Probability/Policy).

### Phase 6 — Governance & sign-off
- Get the collections practice leader (or equivalent SME) to confirm the demo-assumption thresholds (cure %, broken-PTP %, risk cutoff) before presenting results as anything other than illustrative.
- Confirm privacy posture: no real PII exists in this dataset by design (Business_Rules R15) — carry that same discipline into any Databricks access controls/masking on the real tables.

---

## 5. Gaps and things I'm uncertain about

These are things the documents either don't specify, specify inconsistently, or explicitly flag as unresolved. I'd want your (or the client's) input before committing engineering time in the wrong direction:

**A. What "LensS" is, technically, is never defined in these files.** Every document describes it only from the outside — as something that receives governed semantic views and produces NL answers. There's no API spec, no config format LensS expects the Metric_Catalog/Synonym_Catalog to be delivered in, and no mention of whether LensS is a Databricks-native capability (e.g. Genie / AI/BI), a third-party product, or something to be built from scratch as part of this engagement. **This determines almost everything about Phase 2/3 implementation and I don't think we should start building the semantic layer's actual delivery format until this is confirmed.**

**B. The four event-level fact tables have DDL but zero data.** The workbook only populates `Fact_Collections_Snapshot`, `Dim_Collector`, and `Fact_Targets`. `Fact_Collection_Transactions`, `Fact_Contact_Events`, `Fact_Promise_To_Pay`, and `Fact_Strategy_Assignment` exist only as `CREATE TABLE` statements and sample queries in a Word doc — there is no synthetic data to load. Since several UC1/UC3 questions (true daily forecasting, real channel attribution, champion-challenger uplift) explicitly require this event-level detail per `Model_Requirements`, I need to know: **should we generate synthetic event-level data for the demo, or is the account-snapshot level (with its stated proxies and limitations) the actual demo target?**

  - **How big a blocker is this?** Low-to-medium, and arguably not a blocker at all for the *documented* demo. Every one of the 7 `Acceptance_Tests`, the 12 questions in `Query_Catalog`, and all 20 sample SQL queries in `LensS_Collections_Demo_Sample_SQL_Queries.docx` were written and validated against `Fact_Collections_Snapshot` alone — none of them require the event tables. That's because the snapshot already carries point-in-time fields that cover the core promise/contact metrics without needing event-level detail: `PTP_Flag`, `PTP_Amount`, `PTP_Due_Date`, `Broken_PTP_Flag`, `RPC_Flag`, `Contacted_Flag`, `Recovery_MTD`, `Cost_MTD`, `Preferred_Channel`. The event tables would *upgrade precision* (real timestamps instead of a single as-of snapshot) — they don't unlock capability that's actually required by anything currently specified as in-scope. It only becomes a real blocker if the demo needs to *show*: true multi-day trend forecasting (the current model can only do a single-point run-rate, not a real trend line), true multi-touch channel attribution (today's `Preferred_Channel` is a static proxy field — and `Business_Rules` R11 explicitly pre-approves this as a stated demo limitation, not a defect), or real experiment tracking for champion-challenger (tied to Gap C below).
  - **Recommendation**: treat this as out of scope for Phases 1–4 and park it as the optional Phase 5. Don't spend effort generating synthetic event data unless whoever owns the requirements specifically asks for live daily forecasting or real attribution as a headline demo feature.

**C. Champion-challenger / causal uplift has no real basis in the current data.** `Model_Requirements` says outright: *"Dataset lacks randomized flag; use simulated comparison only."* UC3 leans heavily on champion-challenger analysis. Worth deciding now whether we (a) fabricate a plausible randomized experiment for the demo, (b) present only observational/like-for-like comparisons with an explicit "no causal claim" disclaimer (as `Acceptance_Tests` Q06 requires), or (c) treat this as out of scope for the initial build.

  - **How big a blocker is this?** Low as an *engineering* blocker, but medium-to-high as a *business/expectation-setting* risk. It's low-engineering because the pack's own `Acceptance_Tests` Q06 defines "correct" behavior here as declining the causal claim (*"States unavailable as causal estimate without randomized design"*) — that's a guardrail rule ("if there's no real randomized Test_Group/Experiment_ID, don't compute an uplift number"), not a modeling project. It's a real business risk because UC3 explicitly names "Champion-Challenger Analysis" as one of its five named sub-capabilities (`LensS Queries.docx`) — if a demo audience walks in expecting a real uplift percentage and instead gets a disclaimer, that needs to be set up front, not discovered live in the room.
  - **Recommendation**: go with **option (b)** — observational/like-for-like comparison. This is already fully supported today: `Treatment_Strategy` plus matched `Product`/`DPD_Bucket`/`Balance_Band`/`Region`/`Vulnerability_Type` dimensions, exactly as sample queries #12–#13 already do, with an explicit "this reflects observed performance under current assignment, not a controlled experiment" disclaimer. **Avoid option (a)** — fabricating a plausible randomized experiment risks presenting invented facts (which accounts were "randomly" assigned) as if they actually happened, which directly contradicts the pack's own stated design principle (Section 1a/6: never present a correlation as a causal claim). **Option (c)**, full descope, is unnecessarily conservative — the like-for-like comparison is still a genuinely useful, honest answer; it just needs the right label.

**D. No Databricks environment details provided** — workspace, Unity Catalog catalog/schema names, SQL Warehouse sizing, or access-control/RBAC requirements. I'll need these before Phase 0 can actually start.

**E. No timeline or deadline is stated anywhere** in the pack. Worth confirming so the phased plan above can be sized realistically.

**F. Forecasting and "Target Achievement Probability" are explicitly called out as not-really-modeled**: `Model_Requirements` says the month-end forecast "can run deterministic run-rate in demo" and that probability should not "present certainty without calibrated history." The `Metric_Catalog` entry for Target Achievement Probability still lists `MODEL_PREDICT(...)` as its SQL-style logic.
  - **Resolved (2026-09-23):** confirmed no ML model-building is required for UC1/UC3 as currently scoped — every capability except Probability and Champion-Challenger uplift is directly answerable from governed SQL, and both of those are explicitly flagged by the pack itself as "don't fabricate this" rather than "build a model for this." Build the simple deterministic run-rate for the current-month outlook; omit or heavily-disclaim the probability metric.
  - **New sub-issue surfaced (2026-09-23):** "forecasting" in UC1 covers two genuinely different questions that need different answers:
    - *"Are we on track for **this month's** target?"* — answerable today via the run-rate method above (MTD Recovery ÷ days elapsed × days in month), since `Recovery_MTD` is a cumulative-to-date field in the single snapshot row.
    - *"What will **next month's** collections be?"* — **not answerable from the current data at all, regardless of ML.** The workbook contains only one `Snapshot_Date` (2026-09-15) — there is no historical monthly time series to extrapolate from, so there's nothing to fit even a simple trend to, let alone a real forecasting model. If a user asks this in the demo, LensS should hit the pack's own documented fallback — *"return a transparent limitation message when required data is unavailable"* — rather than fabricate a number. If genuine next-month forecasting is required, we need the client to supply several (ideally 12+, for seasonality) months of historical actuals; only then does "simple trend vs. real time-series model" become a live design choice.

**G. `Payment_Propensity`, `Nonpayment_Risk`, and `Incremental_Recovery_Opportunity` are pre-baked synthetic columns already in the snapshot** — the README and Model_Requirements both say these are supplied for the demo rather than modeled.
  - **Resolved (2026-09-23):** confirmed — these are consumed as-is from the existing columns, not built by us. No model training pipeline is in scope for the UC1/UC3 demo. Actual model-building (real risk/propensity scoring, calibrated probability, true uplift modeling, multi-month forecasting) would only become a workstream if/when this moves toward production with real historical data — and is a separate effort from the NL/semantic-layer build.

**H. This directory is not a git repository.** If you want change history/collaboration, I'd suggest initializing one before Phase 1 — I haven't done this yet since it's a repo-level decision.

---

## 6. Why ML models are not required for UC1/UC3 (management brief)

This section exists to answer a direct question: *do we need to build machine-learning models to deliver UC1 and UC3, or can they be answered from the data as supplied?* The short answer is **no ML model-building is required for the current scope**, and this is not a judgment call — it is the explicit, written design intent of the pack itself.

**The pack's own stated philosophy** (`Details for excel file.docx`, "Design improvement incorporated"):

> *"The pack separates descriptive facts, governed calculations, model-generated scores and causal claims. This is important because LensS should not produce a confident recommendation when the underlying data only supports an observation or correlation."*

**Evidence, metric by metric:**

1. **19 of the 20 governed metrics in `Metric_Catalog` are plain SQL** (`SUM`, ratio, `COUNT(DISTINCT...)`, `GROUP BY`). Only one metric, *Target Achievement Probability*, lists `MODEL_PREDICT(...)` — and it is explicitly gated off for the demo (see below).
2. **`Model_Requirements` grades every capability and tells you directly which are demo-safe without a model:**
   - Forecasting → *"Can run deterministic run-rate in demo"*
   - Risk (Nonpayment_Risk) → *"Synthetic score supplied for demo"*
   - Propensity (Payment_Propensity) → *"Synthetic score supplied for demo"*
   - Prescription (next-best-action) → *"Rules-based recommendation acceptable for demo"*
   - Probability → *"Do not present certainty without calibrated history"*
   - Policy (uplift) → *"Dataset lacks randomized flag; use simulated comparison only"*
3. **The "model-like" fields already exist as delivered data.** `Payment_Propensity`, `Nonpayment_Risk`, `Incremental_Recovery_Opportunity`, and `Primary_Nonpayment_Driver` are already columns in `Fact_Collections_Snapshot`, marked `Required` in `Data_Dictionary`. They are consumed, not modeled, for this deliverable.
4. **A written acceptance test requires *refusing* a model-style answer.** `Acceptance_Tests` Q06 ("What uplift would an alternative treatment deliver?") — Expected behavior: *"States unavailable as causal estimate without randomized design"*; Control: *"No fabricated causal claim."*

**Why the data is sufficient for what's actually asked:**
- Grain match: 20,000 account-level rows at exactly the `Account_ID` × `Snapshot_Date` grain every UC1/UC3 sample query uses.
- Completeness: `Data_Dictionary` marks nearly every field `Required` — no missing-data problem to solve first.
- Targets align at the right grain: `Fact_Targets` is keyed by `Product × DPD_Bucket × Month`, matching how the metrics need to join.
- All 20 sample SQL queries in `LensS_Collections_Demo_Sample_SQL_Queries.docx` already run to completion against just `Fact_Collections_Snapshot`, `Fact_Targets`, and `Dim_Collector` — demonstrated in the deliverable, not theoretical.

**Real, measured evidence for this, added 2026-09-23**: `CNX-Command-Center-Architecture-Review.pdf` documents a sibling Concentrix project on the same Databricks + Genie architecture, with a page-8 scorecard comparing an uncurated vs. a curated Genie space on the *same* underlying model. Uncurated: fabricated an answer (sold "occupancy" as "coverage efficiency," no caveat), used 0 of its 2 certified metric views, gave a different wrong number every re-run. Curated (governed metric views + instructions + examples + a benchmark suite): 12/12 questions answered, 11/12 exact, accuracy lifted from a 52–69% pre-curation baseline to 88.9%. Same model, same questions — the entire difference is the governance/curation work, not additional ML. This is concrete, measured, internal proof of the argument above, not just a documented design philosophy.

**The strongest framing for management:** building a model where the spec says not to would be *worse* than not building one. A model trained on a single snapshot (no historical time series) or on non-randomized treatment assignment (no real test/control) cannot be validated — it produces a confident-looking number with no statistical basis. That is the exact failure mode the pack was written to prevent. The three places real ML would eventually matter — calibrated month-end probability, true causal champion-challenger uplift, and genuine next-month (multi-month) forecasting — are gated not because of engineering effort, but because the *data to support them does not yet exist* (see Gap F). Getting that data (historical monthly actuals; a real randomized treatment/control design) is the actual prerequisite, not a modeling exercise done despite its absence.

## 7. Suggested immediate next steps

1. Answer/clarify Open Questions A–C above (they materially change the build) — A in particular blocks meaningful design work.
2. Get Databricks workspace access details (Open Question D).
3. If A is answered, I can start Phase 1 (loading the three populated sheets into Delta tables) immediately — that part of the plan has no open dependencies.
