/**
 * The suggested questions: the six tiles on an empty chat, plus four more in
 * the side panel (five per mode). One list, served to the front end and used
 * to pre-warm the answer cache. Every question was run against the live Genie
 * space (Agent questions twice) and checked for strong, consistent answers.
 */
export interface Suggestion {
  mode: 'chat' | 'agent';
  label: string;
  q: string;
}

export const STARTERS: Suggestion[] = [
  { mode: 'chat', label: 'MTD performance vs target by product', q: 'What is my MTD collections performance versus target by product?' },
  { mode: 'chat', label: 'Accounts needing immediate intervention', q: 'Which accounts require immediate intervention?' },
  { mode: 'chat', label: 'Portfolios contributing most to the shortfall', q: 'Which portfolios are contributing most to the shortfall?' },
  { mode: 'agent', label: 'Why are collections lagging, and what should we do?', q: 'Why are collections lagging this month and what should we do about it?' },
  { mode: 'agent', label: 'Are our policies too aggressive?', q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.' },
  { mode: 'agent', label: 'Biggest recovery opportunity and best channel', q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?' },
];

export const MORE_SUGGESTIONS: Suggestion[] = [
  { mode: 'chat', label: 'Best channel for each DPD bucket', q: 'Which channel should we use for each DPD bucket?' },
  { mode: 'chat', label: 'Non-payment drivers with the lowest recovery', q: 'Which non-payment drivers have the lowest recovery rate?' },
  { mode: 'agent', label: 'Why so many broken promises, and where to act first', q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?' },
  { mode: 'agent', label: 'Best channels and contact times, and what to change', q: 'Which channels and contact times work best for reaching customers, and how should we change our contact strategy?' },
];

export const ALL_SUGGESTIONS: Suggestion[] = [...STARTERS, ...MORE_SUGGESTIONS];

/**
 * Quick-start prompts: one-click analyses shown on the Assistant's welcome screen
 * and at the top of the prompts panel (icon, category, title, one-line description).
 */
export interface QuickStart { icon: string; category: string; title: string; desc: string; q: string; mode: 'chat' | 'agent' }

export const QUICK_START: QuickStart[] = [
  { icon: 'gap', category: 'Diagnostic', title: 'Why we are behind target', desc: 'Root causes of the gap and what to do', mode: 'agent',
    q: 'Why are collections lagging this month and what should we do about it?' },
  { icon: 'alert', category: 'Operational', title: 'Accounts to act on today', desc: 'High-risk accounts still likely to pay', mode: 'chat',
    q: 'Which accounts require immediate intervention?' },
  { icon: 'promise', category: 'Promises', title: 'Broken-promise risk', desc: 'Why promises break and where to act first', mode: 'agent',
    q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?' },
  { icon: 'cash', category: 'Strategy', title: 'Biggest recovery opportunity', desc: 'Where the money is and the channel for each segment', mode: 'agent',
    q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?' },
  { icon: 'shield', category: 'Conduct risk', title: 'Are we over-contacting?', desc: 'Over-contact, complaints and vulnerable customers', mode: 'agent',
    q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.' },
  { icon: 'brief', category: 'Executive', title: 'Executive decision brief', desc: 'One page: position, drivers, risks, actions', mode: 'agent',
    q: 'Write a one-page executive brief for this month: where we stand against target, what is driving it, the biggest risks, and the top three actions with their value.' },
];

/** The categorized question library, by what a leader is trying to do. */
export const LIBRARY: Array<{ category: string; items: Array<{ q: string; tag: string; mode: 'chat' | 'agent' }> }> = [
  { category: 'Executive', items: [
    { q: 'What can you help me with?', tag: 'capabilities', mode: 'chat' },
    { q: 'What is my MTD collections performance versus target by product?', tag: 'performance', mode: 'chat' },
    { q: "Are we on track to hit this month's recovery target, and which products or buckets put it at risk?", tag: 'outlook', mode: 'agent' },
    { q: 'Write a one-page executive brief for this month: where we stand against target, what is driving it, the biggest risks, and the top three actions with their value.', tag: 'brief', mode: 'agent' },
  ] },
  { category: 'Diagnostic', items: [
    { q: 'Why are collections lagging this month and what should we do about it?', tag: 'root cause', mode: 'agent' },
    { q: 'Which portfolios are contributing most to the shortfall?', tag: 'shortfall', mode: 'chat' },
    { q: 'Which non-payment drivers have the lowest recovery rate?', tag: 'drivers', mode: 'chat' },
    { q: 'Which regions are underperforming on recovery and why?', tag: 'regions', mode: 'agent' },
  ] },
  { category: 'Operational', items: [
    { q: 'Which accounts require immediate intervention?', tag: 'work queue', mode: 'chat' },
    { q: 'Which promises to pay are due in the next 7 days, and how much is at stake?', tag: 'promises due', mode: 'chat' },
    { q: 'Which accounts are about to roll into 180+ days past due, and what should we do before they do?', tag: 'deterioration', mode: 'agent' },
    { q: 'How do our collectors compare, and what separates the best performers from the rest?', tag: 'collectors', mode: 'agent' },
  ] },
  { category: 'Risk & conduct', items: [
    { q: 'Are our current collections policies too aggressive? Look at over-contact risk, complaints and vulnerable customers.', tag: 'conduct', mode: 'agent' },
    { q: 'Why are so many promises to pay being broken, and which segments should we prioritise to fix it?', tag: 'broken promises', mode: 'agent' },
    { q: 'Which customers with promises due in the next 7 days are likely to break them, and what follow-up should we do?', tag: 'early warning', mode: 'agent' },
  ] },
  { category: 'Strategy', items: [
    { q: 'Which channel should we use for each DPD bucket?', tag: 'channels', mode: 'chat' },
    { q: 'Where is the biggest recovery opportunity and which channel should we use for each segment?', tag: 'opportunity', mode: 'agent' },
    { q: 'Which channels and contact times work best for reaching customers, and how should we change our contact strategy?', tag: 'contact strategy', mode: 'agent' },
    { q: 'Which treatment strategies perform best like-for-like, and what does that mean for our policy?', tag: 'treatment', mode: 'agent' },
  ] },
];
