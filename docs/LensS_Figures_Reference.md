# LensS figures reference: Command Center and Explorer

What every figure on the Command Center and Explorer shows, how it is calculated, and how to explain it. Values are from the sample data pack (snapshot **15 September 2026**, Indian rupees). If a value on screen differs, the screen is right; the definitions don't change.

For the pitch itself, use the [client demo playbook](LensS_Client_Demo_Playbook.html). In the app, **KPI definitions** (in the banner and at the foot of the Command Center) shows the same definitions.

---

## 0. Three answers that cover most questions

1. **Where do the numbers come from?** Every Command Center and Explorer figure is a SQL query on **certified views** in Unity Catalog (the gold layer). **No AI calculates them.** AI is used only in the Assistant.
2. **Which accounts?** Accounts **in collections**: past due (**DPD > 0**) with a balance, on the snapshot date. This "governed population" is the same everywhere.
3. **How fresh?** The banner shows **Data refreshed on …**: when the data was last loaded. The sample pack has one snapshot, so there are no month-on-month trends yet.

**Every figure opens its accounts.** On the Command Center, **View accounts** (on cards, issues, queues, stages, next steps and products) lists the exact accounts behind the number, with the same rule and the same count, plus totals and **Export CSV**. In the Explorer, **View** does the same for every chart item, within the current filters. Lists over 1,000 accounts show and export the first 1,000.

---

## 1. Command Center

One story in five chapters. Each chapter opens with a one-sentence answer written from the data; the story bar under the banner jumps between chapters.

### Chapter 1 · Are we on track? (the banner)

| Element | Value | How it is worked out |
|---|---|---|
| Verdict | "We're **on track** … but only if customers keep their promises: **65%** of the promises already due were broken (1,234 of 1,886)." | The likelihood (below) in words, plus the broken share of promises already due. Reads "within reach" (Medium), "at risk" (Low) or "achieved" |
| Progress bar | ₹53.4M collected of ₹59.2M · 90.2% · 15 days left | Collected this month ÷ monthly target; days left to month-end |
| Still to collect | ₹5.8M | Monthly target − collected (never below zero) |
| Expected from promises | ₹30.3M, 5.2× what we still need | Promises due between the snapshot and month-end (₹87.5M from 2,059 customers) × the share of due promises kept so far (34.6%) |
| Month-end outlook | ₹83.7M, 141% of target | Collected so far + expected from promises. The banner spells it out: "₹53.4M collected so far + ₹30.3M expected from promises = ₹83.7M. The 2,059 promises still due this month (of 3,945 made) are worth ₹87.5M; so far 35% of the promises that fell due were kept, so we count 35% of that." With one snapshot it is not a statistical forecast; say so if asked |
| Likelihood of hitting target | High | High if expected promises cover the gap ≥ 1.5×; Medium 1.0–1.5×; Low below 1.0× |
| Data refreshed on | e.g. 10/2/2026 | When the account data was last loaded (written by the deploy's `summary` step) |

**Outstanding vs target.** ₹1.93B is the total overdue book; ₹59.2M is what we aim to collect *this month*, about 3% of it. The target is set per product × arrears stage in the workbook's `Fact_Targets` sheet and shrinks with arrears:

| Stage | Outstanding | Monthly target | Target % of balance |
|---|---|---|---|
| 1–30 days | ₹617M | ₹28.2M | 4.6% |
| 31–60 | ₹498M | ₹14.3M | 2.9% |
| 61–90 | ₹361M | ₹11.2M | 3.1% |
| 91–180 | ₹292M | ₹5.0M | 1.7% |
| 180+ | ₹158M | ₹0.6M | 0.4% |

(`Fact_Targets` also has a "Current" row of ₹2.16M for accounts not overdue, which is outside the collections population, so it sums to ₹61.4M there.)

### Chapter 2 · How healthy is the book?

| Card | Value | Calculation |
|---|---|---|
| Overdue balance | ₹1.93B, 19,035 accounts | Sum of outstanding balance; distinct accounts with DPD > 0 |
| Recovery rate | 2.77% (₹53.4M collected of ₹1.93B overdue) | Collected this month ÷ overdue balance. One month's cash over the whole book, including 180+ debt that barely pays; not a cure or settlement rate |
| High-risk accounts | 879 (4.6% of 19,035), of which 604 still likely to pay | Non-payment risk ≥ 0.70 (business rule R07). **View accounts** lists the 879 |
| Accounts worsening | 33.4%, 6.4% improved | Share of accounts in a later arrears stage than before (`Roll_Forward_Flag`, the workbook's "Roll Rate"): 6,351 of 19,035. About 5 worsened for every 1 that improved; most of it is early (Current → 1–30: 2,459; 1–30 → 31–60: 1,915). **View accounts** lists them |
| Cost to collect | ₹0.016 per ₹1 | Collection cost this month (₹838K) ÷ collected (₹53.4M). The workbook notes channel costs are demo assumptions (about ₹44 per account per month), so compare segments rather than quote the level: 1–30 days ₹0.010, 180+ ₹0.132 (13× more) |
| *More:* Customers reached (RPC) | 47.4% (8,563 of 18,074) | Customers actually spoken to ÷ customers we attempted to contact |
| *More:* Agreed to pay | 46.1% (3,945 of 8,563) | Promises to pay ÷ customers reached |
| *More:* Promises honoured | 34.6% (652 of 1,886) | Promises already due that were kept ÷ promises already due (the inverse is the 65% broken) |
| *More:* Amount promised | | Sum of promise-to-pay amounts this month |
| *More:* Contact attempts per customer | 4.5 | Average contact attempts per account this month: calls, SMS, WhatsApp and email, answered or not. Not the same as "reached" (customers actually spoken to, 47%): we try often but reach about half |

**Portfolio risk snapshot:** accounts, balance, share and recovery rate by arrears stage (1–30: 31% of accounts, 4.07% recovery … 180+: 9%, 0.33%). Each stage has **View**.

### This month's promises, in one picture

All the promise figures come from one set: **3,945 customers promised to pay this month.**

| Part | Customers | Where it appears |
|---|---|---|
| Already due | 1,886 | "65% of promises already due were broken" |
| … kept | 652 | Promises honoured 34.6% (652 of 1,886) |
| … broken | 1,234 | Issue 1; the broken-promise list |
| Still to come this month | 2,059 (₹87.5M) | The month-end outlook in chapter 1 |
| … due this week | 1,198 (₹52.6M) | Chapter 4 queues |
| … of which likely to break | 610 (₹27.2M) | "Promises at risk" / Today queue |
| … of which likely kept | 588 (₹25.4M) | "Remind the other promises due" |
| … due later this month | 861 | Part of the outlook |

1,886 + 2,059 = 3,945. Issue 1 shows this as a single bar with the five parts.

### Chapter 3 · What is holding us back? (five ranked issues)

| # | Severity | Issue | Figures | View opens |
|---|---|---|---|---|
| 1 | Critical | Customers are breaking their promises to pay | "3,945 customers promised to pay this month. Of the 1,886 promises already due, 1,234 were broken and only 652 kept. Of the 2,059 still to come, 1,198 fall due this week, and 610 of those look likely to break (₹27.2M)." Plus a bar of the five parts | The 1,234 broken promises |
| 2 | High | Personal Loan is furthest behind target | 87.6% of target, ₹2.1M behind; largest single gap Personal Loan at 1–30 days (₹996K) | Personal Loan accounts |
| 3 | High | Accounts are sliding into late arrears | 33% worsened; 999 accounts (₹95.1M) at 150–180 days | The 999 accounts |
| 4 | Medium | Too few customers are reached | "We tried to contact 18,074 of 19,035 customers but spoke to only 8,563 of them (47.4%), and 3,945 of those 8,563 agreed to pay (46.1%)" | Customers attempted but not reached |
| 5 | Medium | Some customers are over-contacted | 9,393 customers in 83 groups averaging 4.5+ contact attempts a month (card headline: "4.5+ attempts") | The 9,393 customers |

An over-contacted group is treatment strategy × product × arrears stage × vulnerability type, with at least 30 accounts and an average of 4.5+ attempts this month. Severities are set by design (business judgement); each "likely driver" line is a fixed explanation, not a computed result. **Ask LensS why** runs a deep analysis of the issue.

**Attempts vs reached (issues 4 and 5 don't contradict).** Issue 5 counts contact *attempts* (calls, SMS, WhatsApp, email, answered or not): the book averages 4.5 a month. Issue 4 counts customers actually *spoken to*: 47% of those we tried. Together: we try often but reach only about half, so the fix is the right channel at the right time, not more calls.

**Where 4.5 comes from.** Not a client rule. The workbook's R14 is qualitative ("high attempts with low RPC/cure…"); the data pack's sample SQL flags groups averaging 6+ attempts, which finds nothing in this data (the highest group averages about 5.3), so it was recalibrated to 4.5 during the build. Because that sits on the book's average, it flags about half the customers; individually, 3,892 customers (20%) had 7+ attempts and 2,051 (11%) had 8+.

### Chapter 4 · What should we do this week?

| # | When | Queue | Figures | Rule |
|---|---|---|---|---|
| 1 | Today | Save promises likely to break | 610 promises, ₹27.2M | Promise due in the next 7 days, from a customer with payment propensity < 0.35 or non-payment risk ≥ 0.60 |
| 2 | This week | Remind the other promises due | 588 promises, ₹25.4M | Promise due in the next 7 days, from a customer likely to keep it (all 1,198 due this week minus the 610) |
| 3 | This week | Work high-value accounts likely to pay | ₹18.0M from 492 accounts | Payment propensity ≥ 0.60 and balance ≥ ₹100K |
| 4 | This month | Stop accounts reaching 180+ | ₹95.1M across 999 accounts | 150–180 days past due |

### Chapter 5 · What more can we recover from high-risk customers?

Beyond this week's plan: high-risk customers should not be written off, because many are still likely to pay. On screen: "Beyond this week's plan, don't write off high-risk customers: 604 of the 879 are still likely to pay, and ₹6.4M more can be recovered from them, most of it in Credit Card (₹2.0M)."


- **Priority accounts:** 604 accounts with non-payment risk ≥ 0.70 and payment propensity ≥ 0.25 (business rule R08 in the workbook's `Business_Rules` sheet). **Recoverable now** = their incremental recovery opportunity: ₹6.4M.
- **Recoverable from high-risk customers, by product:** Credit Card ₹2.0M (170 accounts), Personal Loan ₹1.5M, Auto Loan ₹1.1M, SME Loan ₹973K, Mortgage ₹854K. Each has **View**.
- **The priority accounts worth the most:** the 8 with the highest recoverable amount, with why they aren't paying and their next step. **View all 604** opens the full list. Account IDs only: the data holds no names or contact details.

Why 879 high-risk but 604 priority? The 604 are the high-risk accounts still likely to pay, so they are worth intervening on now.

Why does the Explorer's "Recovery opportunity" say ₹171.7M? That is the opportunity across **all** 19,035 accounts; ₹6.4M is the 604 priority accounts only.

**How to handle each priority customer.** Each of the 604 gets exactly one next step from the rule in the data pack's sample SQL (`qry_immediate_intervention`), checked in this order:

1. **In dispute** → Route to dispute resolution (72).
2. **Vulnerable** (any vulnerability type) → Route to hardship support (136).
3. **Broke a promise**, propensity ≥ 0.35 → Immediate PTP follow-up (none this month: those customers matched an earlier rule or have lower propensity).
4. **Not yet reached**, prefers WhatsApp / SMS / Email / digital self-cure → Initiate preferred digital journey (229).
5. **Risk ≥ 0.80 and balance ≥ ₹50K** → Assign to specialist collector (24; about ₹27K recoverable each, the highest per account).
6. **Everyone else** → Prioritised collector outreach (143).

A *specialist collector* is an experienced collector for the hardest, highest-value cases, where negotiation (plans, restructuring, settlement) matters more than a scripted call. Disputes and vulnerability are checked first so that those customers are supported, never pushed. Every input is a column of the raw data; the thresholds are configurable business rules.

---

## 2. Explorer

**Purpose:** the Command Center says *what*; the Explorer lets anyone find *where* and *why* without writing a query. It loads in the background after the Command Center, so it opens instantly.

### Filters
- **Dimensions:** product, arrears stage, region, preferred channel, treatment strategy, non-payment driver, collector team, balance band, vulnerability.
- **Dates:** last contact from/to, promise due from/to.
- Active filters show as chips; **Reset** clears them. Clicking a bar in the workspace adds that value as a filter.

### KPI strip (12 tiles for the filtered slice)
Accounts · Outstanding · Collected this month · Recovery rate · Customers reached · Agreed to pay · Promises honoured · High-risk accounts · Accounts worsening · Cost to collect · Recovery opportunity · Contact attempts per customer. With a filter on, each tile shows "X% of portfolio" (amounts and counts) or "± pts vs portfolio" (rates), green when better and red when worse. With no filters it reconciles exactly to the Command Center (19,035 accounts).

### Workspace (dimension × measure)
Pick a dimension and a measure (outstanding, collected, recovery rate, RPC, PTP conversion, promises honoured, high-risk share, roll forward, cost to collect, recovery opportunity, accounts, average risk). Bars show each value, with the portfolio average marked for rates; green ≥ 5% better than the portfolio, red ≥ 5% worse. The table view lists every measure, with **View** per row.

### Diagnostic panels (all follow the filters; every item has **View**)

| Panel | Shows | Point to make |
|---|---|---|
| Achievement by product | Collected vs monthly target; the line marks 100% | Every product is below target this month |
| Where the shortfall comes from | Product × arrears stage with the biggest ₹ gaps and their share | Personal Loan at 1–30 days is the single largest gap |
| Heatmap: product × arrears stage | Target achievement, red = furthest behind; **click a cell** for its accounts | Where inside each product |
| Why customers aren't paying | Recovery rate by non-payment driver | Job loss has the lowest recovery (2.19%) |
| Top non-payment drivers | Accounts, balance and recovery per driver, with cumulative share | Which reasons are biggest, not just worst |
| Treatment strategy results | Recovery rate and cost to collect per strategy, as observed | Observational, not causal: a strategy's result depends on which accounts it got; uplift needs a champion/challenger test |
| From arrears to payment (funnel) | In arrears 19,035 → tried to contact 18,074 → reached 8,563 → promised 3,945 → kept 652 | Where customers drop out; **View** on each step |
| Channel effectiveness | Reach, promise rate, recovery and cost by preferred channel | |
| Best channel for each stage | Per arrears stage, the channel with the highest recovery (tie-break: promise rate), channels with 50+ accounts only | "Use what already works at each stage" |
| Regional view | Recovery, RPC or risk by region | |
| Collector performance | Top and bottom collectors with 30+ accounts, by recovery, RPC or PTP; **View** per collector | |

### Accounts behind the numbers
The 500 accounts with the most recovery opportunity in the current filters: search, sort, page, and **Export CSV**.

---

## 3. Glossary

- **DPD**: days past due. **Arrears stage / bucket**: 1–30, 31–60, 61–90, 91–180, 180+.
- **RPC** (right-party contact): we spoke to the right person.
- **PTP**: promise to pay. **Broken PTP**: a promise that fell due and wasn't kept.
- **Payment propensity / non-payment risk**: model scores from 0 to 1 that come with the data; LensS doesn't compute them.
- **Incremental recovery opportunity**: extra ₹ expected if we intervene (a field in the data).
- **Roll forward / roll back**: moving to a later / earlier arrears stage.
- **Cost to collect**: collection cost ÷ amount collected (₹ per ₹1).
- **Certified views**: governed SQL views in the gold layer; one definition per metric, used by the Command Center, the Explorer and the Assistant.

## 4. Questions people ask

- **Is the AI making up these numbers?** No. These two tabs are SQL on certified views. In the Assistant, each answer shows its SQL, and a faithfulness judge checks its figures against the query results (Observability → Answer quality).
- **Why is everything 15 September?** The sample pack is one month-to-date snapshot. With regular loads, the same views show the latest snapshot.
- **Can it forecast next month?** Not honestly from one snapshot. It shows a pipeline outlook for this month and says so.
- **Which strategy is best?** It compares like-for-like (product, stage, balance band, vulnerability), which is observational. Causal uplift needs a randomised champion/challenger test.
- **How are customers protected?** Disputes and vulnerable customers are routed to support first; over-contact is flagged as a conduct risk; the data holds no personal details, and the Assistant masks personal data in questions and answers.
- **Who built it?** The Concentrix Data & Analytics Practice, on Databricks (Unity Catalog, Genie, Lakebase, Databricks Apps).
