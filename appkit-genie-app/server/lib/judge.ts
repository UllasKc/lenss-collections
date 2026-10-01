import { aiConfig } from './aiConfig.js';
import type { Evidence } from './answers.js';
import { chat, parseJsonObject } from './models.js';

/**
 * Faithfulness of an answer to the data Genie actually returned, scored after
 * the answer is sent so it never slows the user down.
 *
 * 1. Numbers check (no model): every figure in the answer is looked up in the
 *    query results, allowing for rounding, K/M/B and % formatting, and column
 *    totals. Score = share of figures found.
 * 2. Judge model: reads the question, the answer and the results, and scores
 *    how well the factual claims are supported (recommendations aren't judged).
 * The final score averages the two (or is whichever one is available).
 */

export interface JudgeResult {
  score: number | null;
  numeric: { checked: number; found: number; score: number | null; missing: string[] };
  llm: { score: number; reason: string; unsupported: string[]; model: string; ms: number; tokens: number | null } | null;
  llmError?: string;
  judgedAt: string;
}

// --- numbers check -------------------------------------------------------------

interface Claim { raw: string; value: number; decimals: number; unit: string; percent: boolean }

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, cr: 1e7, crore: 1e7, l: 1e5, lakh: 1e5 };

export function extractClaims(text: string): Claim[] {
  const clean = text
    .replace(/\[\[chart:[^\]]+\]\]/g, ' ')
    .replace(/^\s*\d+[.)]\s+/gm, ' ')                                     // list numbering
    .replace(/\b(1-30|31-60|61-90|91-180|180\+)\b/g, ' ')                 // DPD bucket names
    .replace(/\b\d{1,2}(:\d{2})?\s*(-|–|to)\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, ' ') // contact-time windows
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');                              // dates
  const re = /([$₹])?\s?(?<![\w.])(-?\d[\d,]*(?:\.\d+)?)\s?(%|percent\b|k\b|m\b|mn\b|b\b|bn\b|thousand\b|million\b|billion\b|cr\b|crore\b|l\b|lakh\b)?/gi;
  const claims: Claim[] = [];
  for (const m of clean.matchAll(re)) {
    const num = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    const unit = (m[3] ?? '').toLowerCase();
    const percent = unit === '%' || unit === 'percent';
    const currency = Boolean(m[1]);
    const decimals = (m[2].split('.')[1] ?? '').length;
    // Small bare integers are usually counts in prose ("top 5", "3 segments"); years are not data.
    if (!unit && !currency && decimals === 0 && (Math.abs(num) < 100 || (num >= 1990 && num <= 2100))) continue;
    claims.push({ raw: m[0].trim(), value: num * (SCALE[unit] ?? 1), decimals, unit, percent });
  }
  return claims;
}

function evidenceNumbers(evidence: Evidence[]): number[] {
  const nums: number[] = [];
  for (const e of evidence) {
    const totals = new Array<number>(e.columns.length).fill(0);
    for (const row of e.rows) {
      row.forEach((cell, i) => {
        const n = Number(String(cell ?? '').replace(/[,$₹%]/g, ''));
        if (cell !== null && cell !== '' && Number.isFinite(n)) { nums.push(n); totals[i] += n; }
      });
    }
    if (e.rows.length > 1) nums.push(...totals.filter((t) => t !== 0));
  }
  return nums;
}

function supported(c: Claim, nums: number[]): boolean {
  const scale = SCALE[c.unit] ?? 1;
  const tol = (0.5 * 10 ** -c.decimals) * scale; // what the displayed rounding allows
  const candidates = c.percent ? [c.value, c.value / 100] : [c.value];
  return nums.some((n) => candidates.some((v, i) => {
    const t = i === 1 ? tol / 100 : tol;
    return Math.abs(n - v) <= t + Math.abs(v) * 0.005 || Math.abs(Math.abs(n) - Math.abs(v)) <= t;
  }));
}

export function numbersCheck(text: string, evidence: Evidence[]): JudgeResult['numeric'] {
  const claims = extractClaims(text);
  const nums = evidenceNumbers(evidence);
  if (!claims.length || !nums.length) return { checked: 0, found: 0, score: null, missing: [] };
  const missing = claims.filter((c) => !supported(c, nums)).map((c) => c.raw);
  const found = claims.length - missing.length;
  return { checked: claims.length, found, score: found / claims.length, missing: [...new Set(missing)].slice(0, 10) };
}

// --- judge model -----------------------------------------------------------------

const JUDGE_PROMPT = `You check whether an analytics assistant's answer is faithful to the data its SQL queries returned.
Judge only FACTUAL claims: figures, rankings, comparisons and statements about what the data shows.
Do not judge recommendations, advice or wording. Arithmetic derived from the data (sums, differences,
percentages of totals) counts as supported if it is correct. A claim about data that is not in the results
is unsupported. If the answer only declines or asks a clarifying question, score 1.
Reply with JSON only:
{"score": <0.0 to 1.0, share of factual claims supported>, "unsupported_claims": ["<claim>", ...max 5], "reason": "<one sentence>"}`;

function evidenceText(evidence: Evidence[], limit = 9000): string {
  let out = '';
  for (const e of evidence) {
    const head = `### ${e.title}\n| ${e.columns.join(' | ')} |\n`;
    const body = e.rows.map((r) => `| ${r.map((c) => c ?? '').join(' | ')} |`).join('\n');
    out += `${head}${body}\n\n`;
    if (out.length > limit) return out.slice(0, limit) + '\n…(results truncated)';
  }
  return out || '(no query results)';
}

export async function judgeAnswer(question: string, text: string, evidence: Evidence[]): Promise<JudgeResult | null> {
  const cfg = aiConfig.judge;
  if (!cfg || Math.random() * 100 >= cfg.samplePercent) return null;
  const result: JudgeResult = { score: null, numeric: numbersCheck(text, evidence), llm: null, judgedAt: new Date().toISOString() };
  if (cfg.model) {
    const t0 = Date.now();
    try {
      const { text: reply, usage } = await chat(cfg.model, [
        { role: 'system', content: JUDGE_PROMPT },
        {
          role: 'user',
          content: `QUESTION:\n${question.slice(0, 1000)}\n\nANSWER:\n${text.replace(/\[\[chart:[^\]]+\]\]/g, '[chart]').slice(0, 6000)}\n\nQUERY RESULTS:\n${evidenceText(evidence)}`,
        },
      ], { maxTokens: 1200, timeoutMs: 60000 });
      const j = parseJsonObject<{ score?: number; unsupported_claims?: string[]; reason?: string }>(reply);
      if (j && typeof j.score === 'number') {
        result.llm = {
          score: Math.max(0, Math.min(1, j.score)),
          reason: String(j.reason ?? '').slice(0, 300),
          unsupported: (j.unsupported_claims ?? []).map((s) => String(s).slice(0, 200)).slice(0, 5),
          model: cfg.model,
          ms: Date.now() - t0,
          tokens: usage?.total_tokens ?? null,
        };
      } else {
        result.llmError = 'judge reply was not valid JSON';
      }
    } catch (err) {
      result.llmError = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
  }
  const parts = [result.llm?.score, result.numeric.score].filter((s): s is number => typeof s === 'number');
  result.score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  return result;
}
