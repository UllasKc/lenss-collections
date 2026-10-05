import { aiConfig } from './aiConfig.js';
import { chat, forFeature, parseJsonObject, type TokenLedger } from './models.js';

/**
 * Auto mode: decides per question whether a Quick answer (the engine's Chat mode, ~20 s)
 * is enough or the question needs a Deep analysis (its Agent mode, 1-3 min).
 *
 * - "ai": a small model reads the question and decides (configurable per deployment).
 * - "rules": a word rule, no model (used where model calls should be kept to a minimum).
 * The AI route falls back to the rule if the model is slow or its reply can't be read,
 * so a question is never held up.
 */

export type Mode = 'chat' | 'agent';
export interface RouteResult {
  mode: Mode;
  method: 'ai' | 'rules';
  reason: string;
  model?: string;
  ms?: number;
  fallback?: string;
}

const DEEP = /\b(why|how (can|could|should|do|would) we|what should|recommend|strateg(y|ies)|improve|root cause|driving|compare|comparison|analy[sz]e|analysis|investigat|prioriti[sz]e|plan|explain|aggressive|impact|trade-?off|what (is|are) (causing|behind))\b/;
/** "Which / what / show / list / how many …" questions that only look something up. */
const LOOKUP_START = /^\s*(which|what (is|are|was|were)|show|list|give me|how (many|much)|top \d+|count)\b/;

/** The word rule: reasoning words or long multi-part questions go deep; plain lookups stay quick. */
export function rulesMode(question: string): RouteResult {
  const t = String(question).toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 22) return { mode: 'agent', method: 'rules', reason: 'long, multi-part question' };
  const m = t.match(DEEP);
  if (m) return { mode: 'agent', method: 'rules', reason: `asks for reasoning ("${m[0]}")` };
  // "opportunity" / "driver(s)" only mean analysis when the question isn't a plain lookup.
  if (!LOOKUP_START.test(t) && /\b(opportunit|drivers?\b)/.test(t)) return { mode: 'agent', method: 'rules', reason: 'asks about opportunities or drivers' };
  return { mode: 'chat', method: 'rules', reason: 'a direct lookup' };
}

const PROMPT = `You route questions for a collections analytics assistant that has two modes:
- "quick": one SQL query answers it. Looking up, listing, ranking, filtering or comparing a few figures
  ("Which accounts need immediate intervention?", "MTD collections vs target by product", "Which drivers have
  the lowest recovery rate?", "Top 10 collectors by recovery", "What is the RPC rate in Mumbai?").
- "deep": needs several queries and reasoning: explaining why something happened, root causes, what to do,
  recommendations, strategy or policy trade-offs, prioritising actions, or questions with several parts
  ("Why are collections lagging and what should we do?", "Are our policies too aggressive?",
  "Where is the biggest opportunity and which channel should we use for each segment?").
Greetings, help requests and anything unclear are "quick". The question may be in any language.
Reply with JSON only: {"mode": "quick" | "deep", "reason": "<under 12 words>"}`;

export async function routeQuestion(question: string): Promise<RouteResult> {
  const cfg = aiConfig.autoMode;
  if (cfg.method !== 'ai' || !cfg.model) return rulesMode(question);
  const t0 = Date.now();
  try {
    const { text } = await forFeature('auto_mode', () => chat(cfg.model!, [
      { role: 'system', content: PROMPT },
      { role: 'user', content: question.slice(0, 800) },
    ], { maxTokens: 60, timeoutMs: cfg.timeoutMs }));
    const j = parseJsonObject<{ mode?: string; reason?: string }>(text);
    const mode = j?.mode === 'deep' ? 'agent' : j?.mode === 'quick' ? 'chat' : null;
    if (!mode) return { ...rulesMode(question), fallback: 'the model reply could not be read', ms: Date.now() - t0 };
    return { mode, method: 'ai', reason: String(j?.reason ?? '').slice(0, 120), model: cfg.model, ms: Date.now() - t0 };
  } catch (err) {
    return { ...rulesMode(question), fallback: err instanceof Error ? err.message.slice(0, 120) : 'model call failed', ms: Date.now() - t0 };
  }
}

/**
 * The browser asks for the route first (so it can show the right progress), then sends the
 * question. The decision and its tokens are kept briefly so the question's log records them.
 */
const recent = new Map<string, { at: number; route: RouteResult; tokens: TokenLedger }>();
const key = (email: string, q: string) => `${email}\n${q.trim()}`;
export function rememberRoute(email: string, question: string, route: RouteResult, tokens: TokenLedger) {
  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > 10 * 60_000) recent.delete(k);
  recent.set(key(email, question), { at: now, route, tokens });
}
export function takeRoute(email: string, question: string) {
  const k = key(email, question);
  const v = recent.get(k);
  recent.delete(k);
  return v ?? null;
}
