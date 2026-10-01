import { getExecutionContext } from '@databricks/appkit';

/**
 * Calls to Databricks model serving endpoints (Foundation Model APIs), as the
 * app's service principal. deploy.py grants it CAN_QUERY on each configured
 * endpoint, so no keys are involved.
 */

async function invoke(endpoint: string, payload: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const client = getExecutionContext().client;
  return (await Promise.race([
    client.apiClient.request({
      path: `/serving-endpoints/${endpoint}/invocations`,
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      raw: false,
      payload,
    } as never),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${endpoint} timed out after ${timeoutMs} ms`)), timeoutMs)),
  ])) as Record<string, unknown>;
}

/** One embedding vector per input text. */
export async function embed(endpoint: string, texts: string[], timeoutMs = 8000): Promise<number[][]> {
  const res = await invoke(endpoint, { input: texts }, timeoutMs);
  const data = (res.data ?? []) as Array<{ embedding?: number[]; index?: number }>;
  return data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding ?? []);
}

/** Text of a chat completion. Reasoning models may return content as parts; only text parts are kept. */
export async function chat(
  endpoint: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<{ text: string; usage: Record<string, number> | null }> {
  const res = await invoke(endpoint, { messages, max_tokens: opts.maxTokens ?? 400, temperature: 0 }, opts.timeoutMs ?? 20000);
  const msg = (res.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message;
  const content = msg?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((p: { type?: string; text?: string }) => (p.type === 'text' ? p.text ?? '' : '')).join('')
      : '';
  return { text, usage: (res.usage as Record<string, number> | undefined) ?? null };
}

/** The first JSON object in a model reply (models sometimes wrap it in prose or ```json fences). */
export function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
