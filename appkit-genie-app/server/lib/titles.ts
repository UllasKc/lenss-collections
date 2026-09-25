import { getExecutionContext } from '@databricks/appkit';

/** Optional: a chat model serving endpoint (bound to the app as a resource). */
const TITLE_ENDPOINT = process.env.LENSS_TITLE_ENDPOINT ?? '';

/** Deterministic fallback: the question itself, tidied and shortened. */
export function fallbackTitle(question: string): string {
  const q = question.replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
  const short = q.length > 48 ? q.slice(0, 48).replace(/\s+\S*$/, '') + '…' : q;
  return short.charAt(0).toUpperCase() + short.slice(1) || 'New conversation';
}

/** A ChatGPT-style 3–6 word session name for the first question. Never throws. */
export async function generateTitle(question: string): Promise<string> {
  if (!TITLE_ENDPOINT) return fallbackTitle(question);
  try {
    const client = getExecutionContext().client;
    const res = (await Promise.race([
      client.apiClient.request({
        path: `/serving-endpoints/${TITLE_ENDPOINT}/invocations`,
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        raw: false,
        payload: {
          messages: [
            {
              role: 'system',
              content:
                'You name chat sessions for a collections analytics assistant. Reply with a 3 to 6 word title in Title Case ' +
                'that summarises the user\'s question. No quotes, no trailing punctuation, nothing else.',
            },
            { role: 'user', content: question.slice(0, 500) },
          ],
          max_tokens: 20,
          temperature: 0.2,
        },
      } as never),
      new Promise((_, reject) => setTimeout(() => reject(new Error('title timeout')), 8000)),
    ])) as { choices?: Array<{ message?: { content?: unknown } }> };
    const raw = res.choices?.[0]?.message?.content;
    const text = (typeof raw === 'string' ? raw : '')
      .split('\n')[0]
      .replace(/^["'*#\s]+|["'*.\s]+$/g, '')
      .trim();
    return text && text.length <= 60 ? text : fallbackTitle(question);
  } catch (err) {
    console.warn('Session title generation failed, using fallback:', err instanceof Error ? err.message : err);
    return fallbackTitle(question);
  }
}
