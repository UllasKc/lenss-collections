# LensS Collections Intelligence vs. Genie on its own

**In one line:** Genie answers the question you type. LensS turns Genie into a governed collections product: it knows what to show before anyone asks, checks every number it gives, follows the conversation across quick and deep answers, protects the data, and proves its quality, cost and safety at any time.

Genie is the query engine inside LensS. Everything below is what LensS adds around it, strongest first.

---

## 1. Answers you can trust and audit, not just answers

**Genie alone:** writes SQL over whatever tables it's given and explains the result. Accuracy depends on how well the tables, instructions and examples were prepared. Nothing tells you whether a given answer is right.

**LensS:**
- **A governed, certified data layer.** Genie never reads raw data. It answers from certified views and metric views that encode the collections definitions: recovery rate, roll-forward, promise kept and broken, target achievement.
- **Business rules as data, in one place.** All 22 business thresholds (for example, high risk = risk ≥ 0.70, underperforming segment = more than 5 points below the portfolio) live in one rules table. Change a rule once and every view, dashboard figure and Genie answer follows. Nothing is hard-coded.
- **Every view describes itself.** Each certified view states the business question it answers, its grain and its rules. Genie also has an example question with SQL for every data source, plus a guide to which view answers which question. Differently worded questions therefore get the same answer.
- **Every answer is checked after it is written:**
  - **Numeric reconciliation:** every figure in the answer is matched against the query result. In our test environment, 94.9% of figures matched exactly; the rest are flagged.
  - **Groundedness:** an independent AI judge scores each answer for faithfulness, relevance and completeness (96.5% groundedness in testing). Low scores are shown to the user and sent for review.
- **The query is shown.** Every answer can show the exact certified view and SQL behind it.

*Why it matters:* in collections, a wrong number leads to the wrong action on real customers. LensS makes correctness visible and measurable, not assumed.

## 2. One assistant that follows the conversation (Quick and Deep, combined)

**Genie alone:** quick chat and the deeper agent mode are separate experiences. The user picks the mode, each runs its own conversation, and switching loses the thread. Genie also can't tell when an answer wasn't good enough.

**LensS:**
- **One conversation, two depths.** Quick answers and multi-step deep analyses sit in the same chat. LensS gives each engine the turns it missed, so a deep analysis knows what the quick answer said and vice versa.
- **A conversation-aware router decides, about 1 second per question:**
  - whether the question is about the data or about the app itself;
  - whether it needs a quick answer or a deep analysis;
  - whether the user is pushing back, asking for more, or asking again.
- **It reacts like a good analyst:**
  - "This isn't enough" → a fresh, deeper analysis, not the same answer again.
  - "Why is the third one so high?" → resolves "the third one" from the previous answer.
  - Asking the same question again → offers a fuller analysis, or scrolls back to the earlier answer.
  - A thin quick answer → offers "Go deeper" automatically.
  - "No, you do it" after a how-to answer → understood as pushback, not an attack.
- **The user's choice is respected.** If someone picks Quick or Deep, LensS keeps it unless they ask for more.

*Why it matters:* business users don't think in "modes". They ask, push back and dig deeper, and LensS keeps up.

## 3. Insight before anyone asks: the Command Center

**Genie alone:** a blank question box. Value depends on the user knowing what to ask.

**LensS:** a ready-made executive story, refreshed from the governed data. Figures below are from the demo data:
- **Where we stand:** collected against target, days left, month-end outlook and likelihood of hitting target, in one sentence.
- **Promises to pay end to end:** ₹168.4M promised this month; ₹52.7M broken and ₹28.3M kept of what fell due; ₹87.5M still to come.
- **What is holding us back:** issues ranked by money at stake, with the likely driver.
- **What to do this week:** action queues (promises likely to break, high-value accounts, accounts about to reach 180+ days), each with its accounts.
- **What more can we recover:** the top 100 priority accounts (₹4.0M recoverable), with a recommended next step per account.
- **Every figure opens the accounts behind it**, and every panel has an "Ask LensS" button that continues the analysis in the assistant.

*Why it matters:* leaders get the answer and the action list in seconds, without writing a single question.

## 4. Safety and compliance built in

**Genie alone:** answers what it's asked. There are no checks on what goes in or comes out beyond data permissions.

**LensS guardrails, on every question and answer:**
- **Personal data** (emails, phone numbers, card numbers, Aadhaar, PAN and more) is masked before a question is processed or stored, and removed from answers.
- **Prompt injection** and jailbreak attempts are blocked before any data is queried. Abusive language is blocked.
- **Policy wording:** no forecasts presented as fact, no unsupported causal claims; these are flagged in answers.
- **A Responsible AI page** shows which AI models are used and when, every protection in force, quality results and known limits. It comes live from the deployed configuration.

*Why it matters:* customer financial data and regulated decisions need controls that are visible to risk and compliance teams.

## 5. Full audit trail and observability

**Genie alone:** no per-question trace, quality trend or usage view for the business owner.

**LensS Observability (8 areas):**
- **A trace for every question,** in 9 stages: how it was routed, the guardrail checks, cache, plan, data retrieved, verification, answer, delivery, logging. It records the models used, the tokens and the time per step.
- **Answer quality and faithfulness** over time, with a review queue for low-scoring or 👎 answers and the reason given.
- **Performance and latency:** where the time goes, how questions were routed.
- **Data and model drift.**
- **Security:** what the guardrails caught.
- **Automated evaluations:** accuracy, guardrail, policy and routing test suites, run from the app, with history and drift.
- **Databricks cost:** what the project has cost since day 1 by service, separated from other projects in the same workspace.

*Why it matters:* the owner can answer "is it working, is it right, is it safe, what does it cost?" at any time, with evidence.

## 6. Built for collections, not generic analytics

- Collections-specific logic: DPD buckets, roll-forward, promise-to-pay outcomes, contact strategy, over-contact risk, like-for-like strategy comparison, collector scorecards.
- A **recommended action for each priority account:** immediate promise follow-up, assign to a specialist collector, preferred digital journey and so on, driven by the rules table.
- **Vulnerable and disputing customers** are supported first in the action lists.
- **No forecasting by design:** the month-end outlook comes from the promise pipeline (what's been promised and how often promises are kept), not from a model guessing the future.

## 7. Secure access: users never touch the data

**Genie alone:** each user needs access to the Genie space, the SQL warehouse and the underlying tables.

**LensS:** users get one permission, to use the app. The app's own service identity reads the data, runs Genie and stores history, so users have no direct access to tables, the warehouse or Genie. Access is granted to a group, and removing someone from the group removes everything.

## 8. Faster and cheaper to run

- **Answer cache (exact and similar questions):** repeated and suggested questions are answered instantly from verified earlier answers. The cache refreshes automatically when the data or the Genie setup changes.
- **Idle stop:** the app stops itself after 60 minutes without use (configurable), so it doesn't bill overnight.
- **Cost visibility:** the cost tab shows spend by service, so the business sees what the AI costs to run.

## 9. A complete product experience

- Chat history saved per user, with automatically named conversations.
- An explorer with filters (product, DPD bucket, region, channel, strategy, collector team and more) that reconciles exactly to the Command Center.
- Feedback (👍/👎 with a reason) feeding the quality review queue.
- Download a conversation as a PDF, charts included.
- "Answer ready" notifications when a deep analysis finishes while you work elsewhere.
- Voice input.
- A built-in guide that answers "how do I…?" questions about the app itself, so Genie is never asked about the user interface and never makes up app steps.

## 10. Enterprise delivery: repeatable, versioned, tested

- **One-command deploy** to any Databricks workspace: data layers, certified views, rules, Genie space, database, app and permissions. The Genie space itself is defined in code, so it's reviewed, versioned and identical in every environment.
- **Side-by-side versions:** a new release runs next to the current one for testing, with instant rollback.
- **Every release is tested end to end:** a 30-check smoke test, a 40-case routing evaluation, live multi-turn conversation tests and accuracy benchmarks.

---

## At a glance

| Capability | Genie on its own | LensS on Databricks |
|---|---|---|
| Answers questions in natural language | Yes | Yes (Genie is the engine) |
| Governed, certified collections data layer | Built separately by the team | Included: certified views, metric views, 22 rules as data |
| Every figure checked against the data | No | Yes: reconciliation plus an AI quality judge |
| Quick and deep analysis in one conversation | Separate modes, separate memory | One conversation; the router picks the depth and shares context |
| Understands pushback, "not enough", asking again | No | Yes |
| Executive dashboard and action lists without asking | No | Command Center: story, promises, actions, top 100 accounts |
| PII masking, injection blocking, policy checks | No | Yes, on every question and answer |
| Per-question audit trace | No | 9-stage trace with models, tokens and timing |
| Quality, drift, evaluations, cost dashboards | No | Observability, 8 areas |
| Users need data and Genie access | Yes | No: one app permission only |
| Answer cache and idle stop | No | Yes |
| Repeatable deploy, tested releases | Manual | One command, automated tests |

## "Couldn't we just build a Genie app?"

A Genie app gives you the question box: point 2's single mode at best, without the router. To match LensS a team would also need to build:
- the governed data layer and rules table;
- answer verification and the AI judge;
- the Quick and Deep router with shared context;
- the Command Center and action logic;
- guardrails and the Responsible AI view;
- tracing, evaluations and cost observability;
- the access model, cache, idle stop and history;
- the deploy and test automation.

That is the product. Genie is one component of it.
