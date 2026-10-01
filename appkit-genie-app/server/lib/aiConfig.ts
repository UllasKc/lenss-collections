/**
 * Optional AI features, configured per deployment in the deploy config and
 * passed in as one JSON env var (LENSS_AI_CONFIG) by deploy.py. deploy.py only
 * includes a model here after checking its serving endpoint exists, and binds
 * it to the app with CAN_QUERY. A missing section means the feature is off.
 */

export type GuardAction = 'block' | 'redact' | 'warn' | 'flag' | 'off';

export interface AiConfig {
  semanticCache: { threshold: number; embeddingModel: string } | null;
  guardrails: {
    model: string | null; // AI classifier; null = pattern checks only
    input: { pii: GuardAction; profanity: GuardAction; prompt_injection: GuardAction; off_topic: GuardAction };
    output: { pii: GuardAction; profanity: GuardAction; policy_checks: GuardAction };
  } | null;
  judge: { model: string | null; samplePercent: number } | null; // model null = numbers check only
}

function parse(): AiConfig {
  const off: AiConfig = { semanticCache: null, guardrails: null, judge: null };
  const raw = process.env.LENSS_AI_CONFIG;
  if (!raw) return off;
  try {
    const c = JSON.parse(raw) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const sc = c.semantic_cache;
    const g = c.guardrails;
    const j = c.faithfulness_judge;
    const action = (v: unknown, d: GuardAction): GuardAction =>
      ['block', 'redact', 'warn', 'flag', 'off'].includes(String(v)) ? (v as GuardAction) : d;
    return {
      semanticCache: sc && sc.embedding_model && Number(sc.threshold) > 0
        ? { threshold: Number(sc.threshold) > 1 ? Number(sc.threshold) / 100 : Number(sc.threshold), embeddingModel: String(sc.embedding_model) }
        : null,
      guardrails: g
        ? {
            model: g.model ? String(g.model) : null,
            input: {
              pii: action(g.input?.pii, 'redact'),
              profanity: action(g.input?.profanity, 'block'),
              prompt_injection: action(g.input?.prompt_injection, 'block'),
              off_topic: action(g.input?.off_topic, 'warn'),
            },
            output: {
              pii: action(g.output?.pii, 'redact'),
              profanity: action(g.output?.profanity, 'redact'),
              policy_checks: action(g.output?.policy_checks, 'flag'),
            },
          }
        : null,
      judge: j ? { model: j.model ? String(j.model) : null, samplePercent: Math.max(0, Math.min(100, Number(j.sample_percent ?? 100))) } : null,
    };
  } catch (err) {
    console.warn('LENSS_AI_CONFIG is not valid JSON; AI features are off:', err instanceof Error ? err.message : err);
    return off;
  }
}

export const aiConfig: AiConfig = parse();

/** What Monitoring shows about the configuration (model names, thresholds, on/off). */
export function aiConfigSummary() {
  const c = aiConfig;
  return {
    semanticCache: c.semanticCache ? { threshold: c.semanticCache.threshold, model: c.semanticCache.embeddingModel } : null,
    guardrails: c.guardrails ? { model: c.guardrails.model, input: c.guardrails.input, output: c.guardrails.output } : null,
    judge: c.judge ? { model: c.judge.model, samplePercent: c.judge.samplePercent } : null,
  };
}
