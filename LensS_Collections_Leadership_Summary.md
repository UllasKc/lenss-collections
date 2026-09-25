# LensS Collections — What We Built and Why

*2026-09-25*

## The problem

Collections teams need to answer questions like *"are we going to hit this month's target?"* or *"why are we falling behind?"* quickly, using real portfolio data. Today, getting these answers usually means waiting on an analyst to pull a report or build a dashboard for one specific question — and if the question changes even slightly, someone has to build a new report.

We wanted a faster, self-service way for collections leaders to ask questions in plain English and get trustworthy answers directly from the data — no analyst in the loop, no waiting.

## What we built

We built a conversational assistant — think of it like a chatbot, but one that looks up real numbers from the collections portfolio instead of guessing. A collections manager can type a question like *"What's my month-to-date collections versus target?"* or *"Which accounts need immediate attention?"* and get back a real, data-backed answer in seconds.

It currently covers the two use cases we scoped in:

- **Performance & Forecasting** — tracking progress against monthly targets, understanding why performance is ahead or behind, and a basic outlook for the rest of the month.
- **Policy & Strategy Effectiveness** — comparing which collection strategies, channels, and customer segments are working best, and flagging accounts that need attention.

It's built on Databricks, the same platform already used elsewhere in the company — the Command Center project follows this identical pattern — using "Genie," Databricks' own natural-language-to-answer technology.

## Why we built it this way

The tempting shortcut would have been to point an AI directly at the raw data tables and let it write its own queries on the fly. We didn't do that, for a specific reason: an AI answering directly off raw data has no guardrails — it can misinterpret a column, double-count a number, or simply produce an answer that sounds right but isn't.

Instead, we built a layered, governed foundation underneath the assistant:

- **Raw data**, kept exactly as received, untouched.
- **Cleaned, typed data** — one consistent version of the truth everything else is built from.
- **Governed business metrics**, where every important number (collections rate, cure rate, cost to collect, etc.) is defined once, correctly, and reused everywhere — so the same question always gets the same, correct answer, no matter how it's phrased.

We also explicitly taught the assistant the business's own rules — for example, how targets should be calculated, and what counts as a "cured" account — and, importantly, what it is not allowed to claim (more on that below).

## Proof this approach actually matters

This isn't just a design preference — we have direct, measured evidence for it. A related project inside the company (the same Databricks + Genie pattern, built earlier for a different team) ran a documented comparison: the same underlying AI model, tested twice — once pointed directly at raw data, once given a governed foundation like the one described above.

- **Without** the governed foundation: it fabricated an answer, confidently stating something that wasn't true, and used none of the safeguards available to it.
- **With** the governed foundation: it went from getting only 52–69% of test questions right to **88.9%** — a large, measured jump, on the exact same AI model.

We ran our own version of this test on this project: **7 real acceptance-test questions**, covering the actual scenarios a collections leader would ask — including two deliberately tricky ones, asking for customer personal information, and asking for a causal "this strategy definitely caused better results" claim. **All 7 now pass.**

## What we deliberately didn't build — and why that's the right call, not a shortfall

Three things the assistant will not do, on purpose:

- **It won't guess a probability of hitting target.** We don't have enough historical data to calculate this honestly, so instead of making up a confidence number, it gives a straightforward projection and says plainly that a calibrated probability isn't available yet.
- **It won't claim one strategy definitely caused better results than another**, unless that claim comes from a real controlled test. We don't have randomized test/control data yet, so it shows an honest side-by-side comparison instead, clearly labeled as observational, not proof of cause and effect.
- **It won't forecast next month.** With only one point-in-time snapshot of data, there's no trend to project from — asking it will get an honest "I don't have enough history for that" instead of an invented number.

We also caught and fixed a real privacy near-miss during testing: when asked for personal information the system correctly doesn't have, an early version declined to share it but then suggested how someone could look the person up elsewhere. We closed that — it now declines cleanly, full stop.

The dataset itself is entirely synthetic — no real customer data has been used anywhere in this build.

## Where things stand, and what's next

**Done and verified**: the full data foundation is built, the assistant is live and tested, and it correctly handles the real business questions from both in-scope use cases, including the tricky edge cases above.

**Optional next steps**, not required for what exists today to work:

- A custom-branded chat screen (instead of Databricks' own interface) for a more polished look, using pre-built components — most of this is configuration, not a from-scratch build.
- Pre-written daily summaries for a dashboard view, generated on a schedule rather than computed live.

**What this isn't yet**: a production system on real customer data. This is a proof-of-concept on synthetic data, deliberately built with the same rigor a real deployment would need — so that moving to real data later is a matter of connecting a new data source to a foundation that's already proven, not starting over.

---

*Also published as a Claude Doc: https://claude.ai/artifact/9xKQtqi1JQhaUmg1qbByiV*
