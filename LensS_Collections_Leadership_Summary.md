# LensS Collections — What We Built and Why

*Updated 2026-10-06 (version 1.9). First written 2026-09-25.*

## The problem

Collections leaders need quick answers to questions like *"are we going to hit this month's target?"*, *"why are we falling behind?"* and *"who should my teams call today?"*. Today those answers usually mean waiting for an analyst to build a report for one specific question, and a slightly different question means another report. AI assistants could help, but most can't be trusted with the numbers.

We set out to give collections leaders a self-service way to see where they stand, understand why, and act, with answers drawn directly from governed data that they can check and audit.

## What we built

**LensS Collections Intelligence**, a web application in four parts:

- **Command Center.** One page that reads as a story in five steps: *are we on track this month, how healthy is the book, what is holding us back, where is the money, and what should we do this week?* Each step opens with its answer in one sentence. Every number opens the exact list of accounts behind it, which can be exported, so a figure such as "610 promises likely to break this week" becomes a call list.
- **Explorer.** Self-service drill-down: filter by product, arrears stage, region, channel, strategy, team and more, see how a segment compares with the whole portfolio, and open the accounts behind any chart.
- **Assistant.** Ask questions in plain English. A quick answer takes about 20 seconds; a deeper, multi-step analysis with charts and recommendations takes 1–3 minutes, and *Auto* picks the right one. It remembers the conversation, so follow-ups like "which of those is the lowest?" work, and it can explain the platform itself.
- **Observability.** Every question is traced end to end: who asked, which checks ran, which SQL was used, how long it took, and how faithful the answer was to the data. It also covers evaluations, guardrails and responsible-AI information.

It covers the two use cases in scope: **performance and forecasting** (progress against target and the month-end outlook) and **policy and strategy effectiveness** (which strategies, channels and segments work, and which accounts need attention). It runs on Databricks: Unity Catalog for governed data, Genie for questions in plain language, Lakebase for chat history and logs, and Databricks Apps for the interface.

## Why we built it this way

Pointing an AI straight at raw tables is tempting, but it can misread a column, double-count a number, or give an answer that sounds right and isn't. So the application sits on a governed foundation:

- **Raw data**, kept exactly as received.
- **Cleaned, typed data**: one consistent version of the truth.
- **Certified metrics**: every important number (collection rate, cost to collect, promises kept and so on) defined once and reused everywhere, so the same question always gets the same answer.

On top of that:

- **The dashboards use no AI at all.** Every Command Center and Explorer figure is a governed SQL query. AI is used only to answer questions, and every AI answer shows the query behind it.
- **AI answers are checked.** A second model scores each answer for faithfulness to the data, and personal data, offensive language and prompt-injection attempts are caught before a question reaches the data and before an answer reaches the user.
- **Business rules live in the data.** Which accounts are priorities, and what to do with each, come from the business rules in the specification pack, with disputed and vulnerable customers routed to support first.

## Proof this approach matters

A related internal project (the same Databricks and Genie pattern) measured the same AI model twice: once on raw data, once on a governed foundation. On raw data it fabricated an answer and got only 52–69% of test questions right; on the governed foundation it reached **88.9%**.

On this project:

- **All 7 acceptance-test questions pass**, including two deliberately tricky ones: a request for customers' personal details (refused) and a request to claim that one strategy *caused* better results (answered with an honest, observational comparison).
- **Answer quality is measured continuously** (Observability → Answer quality). In the test workspace, over about 140 judged answers, faithfulness runs at about 97% and the figures in answers reconcile to the query results about 95% of the time. The organisation deployment builds its own record from its first questions.
- **Before each release**, an automated end-to-end test of the deployed application passes 27 of 27 checks, and a click-through of every screen passes 23 of 23.

## What it deliberately doesn't do

- **No made-up probabilities or forecasts.** With one month-to-date snapshot, there is no history to forecast from. LensS shows a transparent pipeline outlook for this month (collected so far plus promises due, at the rate promises are being kept) and says plainly that it isn't a statistical forecast.
- **No causal claims without a controlled test.** Strategies are compared like-for-like and labelled as observed, not proven.
- **No personal data.** The data holds account IDs only, and requests for names or contact details are refused.

The dataset is entirely synthetic; no real customer data has been used.

## Where things stand

**Done and verified:** the data foundation, the four-tab application, the governed AI assistant with its checks and audit trail, and a client demonstration playbook. The application is deployed in the organisation workspace and in a separate test workspace, and every release is recorded in the change log with what was verified.

**What it isn't yet:** a production system on real customer data. It is a proof of concept on synthetic data, built with the rigour a real deployment needs, so that moving to real data means connecting a new data source to a proven foundation rather than starting over.

**Natural next steps:**
- A pilot on a client's own portfolio, in their own Databricks workspace.
- Monthly data loads, which unlock trends and an honest forecast.
- A champion/challenger test design, to measure the real uplift of strategy changes.
