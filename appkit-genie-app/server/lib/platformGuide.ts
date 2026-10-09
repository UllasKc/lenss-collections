/**
 * What LensS knows about itself. Questions about the platform ("What is LensS?",
 * "How do I filter by region?", "What does Observability show?") are answered from
 * this guide instead of the collections data. Keep it in step with the UI: it is the
 * only source the platform answers may use. No data figures here (those come from
 * the query engine), so the guide never goes stale when the data is reloaded.
 */

export interface GuideSection { id: string; title: string; keywords: string[]; text: string }

export const GUIDE: GuideSection[] = [
  {
    id: 'about', title: 'What LensS is',
    keywords: ['lenss', 'lens', 'concentrix', 'what is', 'who built', 'who made', 'platform', 'about', 'purpose', 'what are you', 'who are you', 'what can you do'],
    text: `**LensS** is Concentrix's decision-intelligence platform, built by the **Concentrix Data & Analytics Practice**. It turns governed business data into answers people can act on, with every figure traceable to its source.
**LensS Collections Intelligence** is LensS applied to collections: performance against target, recovery, contact and promises to pay, arrears stages, channels, strategies, collectors and the accounts that need action.
It has four tabs: **Command Center** (how the business is doing, in about a minute), **Explorer** (why, with filters and drill-downs), **Assistant** (ask questions in plain language) and **Observability** (how every answer was made, its quality, cost and safety).
The answers come from the **LensS Intelligence Engine**, which turns a question into SQL over certified, governed views of the collections data, runs it and explains the result. Every figure on the dashboards comes from those same views; no AI computes them.`,
  },
  {
    id: 'command-center', title: 'Command Center tab',
    keywords: ['command center', 'command centre', 'home', 'dashboard', 'first page', 'overview', 'health', 'kpi', 'metrics', 'brief', 'watchouts', 'priorities', 'action center', 'queues', 'target', 'outlook'],
    text: `The **Command Center** is the one-minute view for a collections leader. Top to bottom:
- **Hero:** progress against this month's target, the outlook for month-end, and four headline cards (recoverable now from priority accounts, customers in arrears, high-risk customers, over-contact risk).
- **Executive summary** written from the certified views, and **Today's priorities** (four cards, each opening the right analysis).
- **Core metrics:** five large cards; **Show 7 more metrics** adds contact, promise, roll-forward, cost and contact-intensity measures.
- **Executive brief** (where we stand, what is driving it, recommended actions) and **Priority watchouts** with a Critical / High / Medium filter.
- **Portfolio risk snapshot** by arrears stage and **Target achievement** with the month-end outlook and likelihood.
- **Action center:** five work queues (high propensity and high balance, largest recovery opportunities, promises due in 7 days, promises likely to break, accounts rolling toward 180+ days), plus recommended next steps, recovery opportunity by product and the largest recovery opportunities.
- **KPI definitions** (button in the hero, and at the bottom) explain how every figure is calculated.
Every panel has an **Ask LensS** button; hover over it to see the exact question it will ask.`,
  },
  {
    id: 'explorer', title: 'Explorer tab',
    keywords: ['explorer', 'filter', 'filters', 'drill', 'drill down', 'slice', 'slicer', 'why', 'region', 'product', 'business unit', 'bu', 'date', 'dates', 'export', 'csv', 'download data', 'accounts list', 'records', 'segment'],
    text: `The **Explorer** answers "why": it slices the same governed data by any combination of filters.
- **Filters:** product (business unit), arrears stage (DPD), region, preferred channel, treatment strategy, non-payment driver, collector team, balance band, vulnerability, and date ranges for last contact and promise due date. Active filters show as chips; click a chip's × to remove it, or **Reset filters**.
- **Headline tiles** show the filtered figures compared with the whole portfolio (share of the book, or points above or below).
- **Analytical exploration workspace:** pick a dimension and a measure to compare, as bars or a table. **Click any bar to filter the whole page to it** (drill-down).
- **Why panels**, all following the filters: achievement by product, shortfall, product × stage heatmap, why customers aren't paying, top non-payment drivers, treatment strategies, the funnel, channel effectiveness, best channel per stage, regions and collectors. Targets exist only by product and arrears stage, so the three target panels follow only those two filters.
- **Account records:** the accounts with the most recovery opportunity in the current view, with search, sort and paging. **Export CSV** downloads them.
- **Ask LensS about this view** asks why the filtered slice differs from the portfolio; every panel's question carries the active filters.
With no filters, every Explorer figure reconciles exactly to the Command Center.`,
  },
  {
    id: 'assistant', title: 'Assistant tab',
    keywords: ['assistant', 'chat', 'ask', 'question', 'conversation', 'history', 'new chat', 'search chats', 'sidebar', 'prompts', 'quick start', 'library', 'suggested', 'follow-up', 'pdf', 'download', 'voice', 'microphone', 'rename', 'delete', 'notification'],
    text: `The **Assistant** answers questions about the collections data in plain language, with charts.
- **Modes** (menu at the top left): **Quick answer** (one query, about 20 seconds), **Deep analysis** (investigates step by step with several queries and charts, 1–3 minutes), or **Auto**, which picks one for each question.
- **Quick start prompts and the question library** (lightbulb icon, top right): one-click analyses and questions grouped by Executive, Diagnostic, Operational, Risk & conduct and Strategy.
- **Conversations** are saved per person. The sidebar has **New chat**, **Search** and the list of chats; when it is collapsed, the same three icons stay on the left. Hover a chat to rename or delete it.
- **Under each answer:** copy, 👍 / 👎 (👎 asks what was wrong and goes to a review queue), regenerate, and **Details**: the quality score, the data sources, the SQL that ran and how long each step took, with a link to inspect it in Observability. Follow-up questions appear after the answer.
- **Download PDF** (icon at the top right) saves the conversation, charts included.
- Answers to common questions may come from the **answer cache** (instant); **Refresh** asks the engine again.
- If you switch tabs while a deep analysis runs, you get a notification when it is ready. Where the browser supports it, the microphone lets you ask by voice.`,
  },
  {
    id: 'howto', title: 'How to do common things (exact steps)',
    keywords: ['how do i', 'how can i', 'how to', 'steps', 'filter', 'region', 'product', 'export', 'csv', 'drill', 'pdf', 'download', 'new chat', 'search', 'rename', 'delete', 'mode', 'log out', 'kpi definitions', 'sql', 'feedback', 'evals', 'run evals'],
    text: `- **Filter the Explorer (for example by region):** open the **Explorer** tab. At the top of the page are dropdown boxes, one per filter (Product, Arrears stage, Region, Preferred channel, Treatment strategy, Non-payment driver, Collector team, Balance band, Vulnerability). Choose a value in the **Region** dropdown; the whole page updates. The filter appears as a chip; click its × to remove it, or **Reset filters** (top right of the Explorer) to clear all.
- **Filter by dates:** in the Explorer, use the **Last contact from / to** and **Promise due from / to** date boxes under the dropdowns.
- **Drill down:** in the Explorer's analytical exploration workspace, choose a **Dimension** and a **Measure**, then click any bar.
- **Export accounts:** in the Explorer, click **Export CSV** (top right); it downloads the account records for the current filters.
- **See the SQL and quality of an answer:** in the Assistant, click **Details** under the answer.
- **Choose Quick answer, Deep analysis or Auto:** in the Assistant, click the mode name at the top left (it shows "Auto" by default) and pick one.
- **Start, find, rename or delete a chat:** in the Assistant's left sidebar, **New chat**, **Search**, or hover a chat in the list for rename and delete.
- **Download a conversation:** in the Assistant, the download icon at the top right saves it as a PDF.
- **See how a figure is calculated:** on the Command Center, click **KPI definitions**.
- **Log out:** click the round letter at the top right, then **Log out**.
- **Run the evaluation suite:** Observability → **6. Evaluations** → choose the categories → **Run evals**.`,
  },
  {
    id: 'modes', title: 'Quick answer, Deep analysis and Auto',
    keywords: ['quick answer', 'deep analysis', 'auto', 'auto mode', 'mode', 'agent', 'how long', 'slow', 'fast'],
    text: `**Quick answer** runs one query and answers in about 20 seconds: best for "what is / which / show me" questions.
**Deep analysis** plans and runs several queries, builds charts and explains the reasons and actions: best for "why" and "what should we do" questions. It takes 1–3 minutes.
**Auto** (the default) chooses for each question: depending on the deployment, a small AI model or a word rule decides, and the reason is recorded in Observability. Prompts and Ask LensS buttons that name a mode always use it.`,
  },
  {
    id: 'observability', title: 'Observability tab',
    keywords: ['observability', 'monitoring', 'trace', 'traces', 'audit', 'quality', 'faithfulness', 'groundedness', 'latency', 'performance', 'drift', 'security', 'guardrail', 'guardrails', 'evals', 'evaluation', 'evaluations', 'responsible ai', 'cost', 'tokens', 'feedback review', 'cache'],
    text: `**Observability** shows how every answer was made, from live logs, for a chosen period (24 hours, 7 days, 30 days, all time). A headline row shows groundedness, numeric reconciliation, average latency and the personal-data guardrail. Seven areas:
1. **Pipeline traces:** every question with its path (ask, secure, cache, plan, retrieve, verify, synthesize, deliver, log), timings and SQL; filter by passed, blocked or failed, by user, or search.
2. **Answer quality & faithfulness:** quality per day, low-confidence answers, reasons for 👎, and the **feedback review** queue (mark fixed, dismiss, or add to the evaluation suite).
3. **Performance & latency:** questions and answer time per day, time per stage, the answer cache, AI usage and cost, and usage by user.
4. **Data & model drift:** data and semantic-model versions, the models in use, the quick/deep mix and evaluation pass rates.
5. **Security & guardrails:** checks that fired and recent guardrail events.
6. **Evaluations:** run the test suite (ground-truth accuracy, red-team guardrail tests, policy checks) and see results by run.
7. **Responsible AI:** purpose, the AI models and when they run, the data used, protections, how quality is measured, data handling and known limits.`,
  },
  {
    id: 'trust', title: 'How answers are checked and kept safe',
    keywords: ['trust', 'accurate', 'accuracy', 'hallucinate', 'made up', 'verify', 'quality score', 'faithfulness', 'pii', 'personal data', 'privacy', 'secure', 'security', 'safe', 'governed', 'certified', 'sql', 'source'],
    text: `- **Governed data only:** the engine reads certified gold views of the collections data, read-only, through the app's own service identity. The data holds account IDs, not customer names or contact details.
- **Guardrails** check each question (personal data is masked, abusive language and prompt-injection attempts are blocked, off-topic questions are flagged) and each answer (personal data, profanity, policy wording).
- **Quality check:** after an answer, every figure is looked up in the query results, and a judge model scores faithfulness, relevance, completeness and safety. Answers that score low carry a visible warning. **Details** under each answer shows the score, the sources and the exact SQL.
- **People in the loop:** 👎 feedback goes to a review queue and can become a permanent test case.
- Questions and answers are not used to train any model.`,
  },
  {
    id: 'navigation', title: 'Navigation and account',
    keywords: ['navigate', 'navigation', 'tabs', 'menu', 'account', 'profile', 'log out', 'logout', 'sign out', 'sign in', 'user', 'name', 'email', 'where', 'find', 'open', 'go to', 'mobile', 'phone'],
    text: `- The **top bar** has the four tabs (Command Center, Explorer, Assistant, Observability).
- The **round letter at the top right** is your account: click it to see your full name, email and **Log out**. Log out ends the LensS session in this browser; your organisation (Databricks) sign-in stays active until you sign out of the workspace or close the browser.
- Any **Ask LensS** button on the Command Center or Explorer opens the Assistant with that question; **Explore the why** on the Command Center opens the Explorer.
- The pages also work on tablets and phones.`,
  },
  {
    id: 'data', title: 'What data LensS uses',
    keywords: ['data', 'snapshot', 'as of', 'date', 'refresh', 'updated', 'population', 'accounts in collections', 'dpd', 'currency', 'rupee', 'inr', 'tables', 'views', 'definitions', 'kpi definitions'],
    text: `- **Population:** accounts in collections (more than 0 days past due, with a balance) on the snapshot date, 15 September 2026, across five products and eight regions. Amounts are in Indian rupees (₹).
- **Definitions** of every figure are in **KPI definitions** on the Command Center (for example: customers reached = right-party contacts ÷ accounts attempted; agreed to pay = promises ÷ customers reached; high-risk = non-payment risk of 0.70 or more).
- The dashboards and the Assistant use the same certified views, so their figures agree.`,
  },
  {
    id: 'limits', title: 'Known limits',
    keywords: ['limit', 'limits', 'limitation', 'cannot', "can't", 'forecast', 'predict', 'wrong', 'mistake', 'not able'],
    text: `- The data is a single snapshot; LensS does not forecast results. The month-end outlook is a pipeline estimate (collected so far plus promises due × the share of promises honoured), not a statistical forecast.
- Strategy and channel comparisons show observed differences, not the uplift a change would cause.
- AI answers can be wrong: check the quality score and the SQL under **Details** before acting on an answer.
- It answers about collections data and this platform; it does not give personal details of customers.`,
  },
];

/**
 * Cheap first filter: does the question mention the platform at all? Only these go on
 * to the platform step, so data questions never pay for it. `strict` is used when no
 * model is available to confirm, and leaves out the words data questions also use.
 */
const STRONG = /\b(lenss|concentrix|this (app|application|platform|tool|site|dashboard|assistant)|what can you (do|answer|help)|who (built|made|created|are you)|what are you|command cent(er|re)|explorer tab|observability|kpi (dictionary|definitions)|quick answer|deep analysis|auto mode|responsible ai|log ?out|sign ?out|how (do|can) i (use|ask|filter|export|download|switch|change|log|sign|search|delete|rename|start|open|find the|go to|navigate)|which tab|what tabs|the tabs|navigate|navigation)\b/i;
const LOOSE = /\b(lens|explorer|assistant|tab|tabs|page|evals?|evaluations?|guardrails?|faithfulness|groundedness|trace|traces|cache|pdf|feature|features|help|how does (this|it) work|where (do|can|is))\b/i;
/** Words that make a question about the collections data, not the platform ("and for Mumbai?"). */
export const DATA_WORDS = /\b(accounts?|collect(ed|ions?)?|recover(y|ed)?|targets?|dpd|buckets?|arrears|promises?|ptp|products?|mortgages?|loans?|cards?|sme|regions?|branch(es)?|rates?|balances?|outstanding|collectors?|channels?|segments?|strateg(y|ies)|customers?|portfolio|month|week|lowest|highest|top|figures?|numbers?)\b|₹|\d/i;
/** Things on screen: a data word next to one of these ("where is the DPD filter?") is still a platform question. */
const UI_WORDS = /\b(tabs?|pages?|buttons?|filters?|drop-?downs?|menus?|click|screen|export|download|explorer|assistant|observability|dashboard|chart type|settings)\b/i;
export function platformCandidate(question: string, strict: boolean): boolean {
  if (STRONG.test(question)) return true;
  if (strict || !LOOSE.test(question)) return false;
  // A loose word alone ("where is the risk concentrated?") doesn't make a data question a platform one:
  // a small model asked to confirm can answer it from the guide anyway, with made-up steps.
  return !DATA_WORDS.test(question) || UI_WORDS.test(question);
}

/** The guide sections that best match a question (keyword overlap), for the model or for a no-model answer. */
export function relevantSections(question: string, max = 3): GuideSection[] {
  const q = question.toLowerCase();
  const has = (k: string) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(q);   // whole words: "bu" must not match "built"
  const scored = GUIDE.map((s) => ({ s, score: s.keywords.reduce((a, k) => a + (has(k) ? (k.includes(' ') ? 2 : 1) : 0), 0) }));
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((x) => x.score > 0).slice(0, max).map((x) => x.s);
  return hits.length ? hits : [GUIDE[0]];
}

export const guideText = () => GUIDE.map((s) => `## ${s.title}\n${s.text}`).join('\n\n');
