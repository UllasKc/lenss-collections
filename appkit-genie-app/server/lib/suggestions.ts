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
