import express from 'express';
import { streamAgentResponse } from '../lib/agentMode.js';
import { agentAnswer, chatAnswer, type Answer } from '../lib/answers.js';
import { generateTitle } from '../lib/titles.js';

/** `GenieStreamEvent` isn't part of `@databricks/appkit`'s public export
 * surface (only its internal `shared/src/genie.js`) — mirrored here rather
 * than deep-importing a non-public path that could move between versions. */
type GenieStreamEvent =
  | { type: 'message_start'; conversationId: string; messageId: string; spaceId: string }
  | { type: 'status'; status: string }
  | {
      type: 'message_result';
      message: { content: string; status: string; error?: string; attachments?: unknown[] };
    }
  | { type: 'query_result'; attachmentId: string; statementId: string; data: unknown }
  | { type: 'error'; error: string }
  | { type: 'history_info'; conversationId: string; spaceId: string; nextPageToken: string | null; loadedCount: number };

/** The slice of the AppKit plugin map this router actually uses (avoids
 * fighting PluginMap<T>'s plugin-array-dependent generic — TS structural
 * typing means the real `appkit` object from server.ts satisfies this). */
interface ChatAppKit {
  lakebase: {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  };
  genie: {
    // Plain (service-principal) call — `asUser(req).sendMessage(...)` throws
    // "Cannot read properties of undefined (reading 'resolveSpaceId')" in
    // this AppKit version (confirmed against the real running app); this
    // Genie space grants CAN_RUN to the app's service principal already, so
    // OBO isn't required for this build. Revisit if per-user Genie
    // permissions ever matter here.
    sendMessage: (
      alias: string,
      content: string,
      conversationId?: string,
    ) => AsyncGenerator<GenieStreamEvent>;
  };
}

type Mode = 'chat' | 'agent';

const GENIE_AGENT_ID = process.env.DATABRICKS_GENIE_SPACE_ID ?? '';

function currentUserEmail(req: express.Request): string {
  const email = req.headers['x-forwarded-email'];
  if (typeof email === 'string' && email) return email;
  // Local dev has no reverse proxy setting this header.
  return 'local-dev@localhost';
}

export function buildChatRouter(appkit: ChatAppKit): express.Router {
  const router = express.Router();
  router.use(express.json());

  const ownedSession = async (id: string, email: string) => {
    const { rows } = await appkit.lakebase.query(
      `SELECT session_id, title, genie_conversation_id, agent_conversation_id
         FROM chatapp.chat_sessions
        WHERE session_id = $1 AND user_email = $2`,
      [id, email],
    );
    return rows[0];
  };

  /**
   * Genie keeps Chat and Agent conversations apart (each rejects the other's
   * conversation id — confirmed against the live API). When a question goes
   * to one mode after turns were answered in the other, carry the latest of
   * those turns over as context so follow-ups still make sense.
   */
  const crossModeContext = async (sessionId: string, mode: Mode): Promise<string> => {
    const { rows } = await appkit.lakebase.query(
      `SELECT role, content, mode FROM chatapp.chat_messages
        WHERE session_id = $1
          AND created_at > COALESCE(
                (SELECT MAX(created_at) FROM chatapp.chat_messages WHERE session_id = $1 AND mode = $2), 'epoch')
        ORDER BY created_at DESC
        LIMIT 4`,
      [sessionId, mode],
    );
    if (!rows.length) return '';
    const turns = rows
      .reverse()
      .map((r) => `${r.role === 'user' ? 'Q' : 'A'}: ${String(r.content ?? '').slice(0, 700)}`)
      .join('\n');
    return `Context from earlier in this conversation:\n${turns}\n\nNew question: `;
  };

  router.get('/api/me', (req, res) => {
    res.json({ email: currentUserEmail(req) });
  });

  // --- sessions -------------------------------------------------------

  router.get('/api/chat/sessions', async (req, res) => {
    const email = currentUserEmail(req);
    // Sessions nobody has asked anything in yet aren't worth listing.
    const { rows } = await appkit.lakebase.query(
      `SELECT s.session_id, s.title, s.created_at, s.updated_at,
              (SELECT COUNT(*)::int FROM chatapp.chat_messages m WHERE m.session_id = s.session_id AND m.role = 'user') AS questions
         FROM chatapp.chat_sessions s
        WHERE s.user_email = $1
          AND EXISTS (SELECT 1 FROM chatapp.chat_messages m WHERE m.session_id = s.session_id)
        ORDER BY s.updated_at DESC
        LIMIT 100`,
      [email],
    );
    res.json(rows);
  });

  router.post('/api/chat/sessions', async (req, res) => {
    const email = currentUserEmail(req);
    const { rows } = await appkit.lakebase.query(
      `INSERT INTO chatapp.chat_sessions (user_email, title)
       VALUES ($1, NULL)
       RETURNING session_id, title, created_at, updated_at`,
      [email],
    );
    res.status(201).json(rows[0]);
  });

  router.patch('/api/chat/sessions/:id', async (req, res) => {
    const email = currentUserEmail(req);
    const title = String(req.body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const { rows } = await appkit.lakebase.query(
      `UPDATE chatapp.chat_sessions SET title = $1 WHERE session_id = $2 AND user_email = $3 RETURNING session_id, title`,
      [title, req.params.id, email],
    );
    if (!rows.length) res.status(404).json({ error: 'session not found' });
    else res.json(rows[0]);
  });

  router.delete('/api/chat/sessions/:id', async (req, res) => {
    const email = currentUserEmail(req);
    const { rows } = await appkit.lakebase.query(
      `DELETE FROM chatapp.chat_sessions WHERE session_id = $1 AND user_email = $2 RETURNING session_id`,
      [req.params.id, email],
    );
    if (!rows.length) res.status(404).json({ error: 'session not found' });
    else res.status(204).end();
  });

  router.get('/api/chat/sessions/:id/messages', async (req, res) => {
    const email = currentUserEmail(req);
    if (!(await ownedSession(req.params.id, email))) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const { rows } = await appkit.lakebase.query(
      `SELECT message_id, role, content, mode, attachment_json, created_at
         FROM chatapp.chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC`,
      [req.params.id],
    );
    // Messages stored before answers were normalized hold Agent Mode's raw
    // `output` array — convert so old sessions get their charts too.
    for (const r of rows) {
      const a = r.attachment_json as unknown;
      if (Array.isArray(a) && r.mode === 'agent') r.attachment_json = agentAnswer(a as never);
    }
    res.json(rows);
  });

  // --- send a message (SSE response; the mode is chosen per message) ---

  router.post('/api/chat/sessions/:id/messages', async (req, res) => {
    const email = currentUserEmail(req);
    const content = String(req.body?.content ?? '').trim();
    const mode: Mode = req.body?.mode === 'agent' ? 'agent' : 'chat';
    const session = await ownedSession(req.params.id, email);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const preamble = await crossModeContext(session.session_id as string, mode);
    await appkit.lakebase.query(
      `INSERT INTO chatapp.chat_messages (session_id, user_email, role, content, mode)
       VALUES ($1, $2, 'user', $3, $4)`,
      [session.session_id, email, content, mode],
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Name the session from its first question while Genie works.
    const titlePromise: Promise<string | null> = session.title
      ? Promise.resolve(null)
      : generateTitle(content).then(async (title) => {
          await appkit.lakebase.query(
            `UPDATE chatapp.chat_sessions SET title = $1 WHERE session_id = $2 AND title IS NULL`,
            [title, session.session_id],
          );
          return title;
        });

    const startedAt = Date.now();
    let success = false;
    let errorMessage: string | null = null;
    let answer: Answer | null = null;
    const convColumn = mode === 'agent' ? 'agent_conversation_id' : 'genie_conversation_id';
    let conversationId: string | undefined = (session[convColumn] as string | null) ?? undefined;
    const question = preamble + content;

    try {
      if (mode === 'agent') {
        if (!GENIE_AGENT_ID) throw new Error('DATABRICKS_GENIE_SPACE_ID is not configured');
        for await (const evt of streamAgentResponse(GENIE_AGENT_ID, question, conversationId)) {
          const d = evt.data as Record<string, unknown>;
          if (evt.type === 'response.output_item.done') {
            // Forward progress only; the full answer is sent once, normalized.
            const item = (d?.item ?? {}) as Record<string, unknown>;
            send('progress', agentProgress(item));
          } else if (evt.type === 'response.completed' && d?.response) {
            const responseObj = d.response as { conversation_id?: string; output?: unknown[] };
            conversationId = responseObj.conversation_id ?? conversationId;
            answer = agentAnswer((responseObj.output ?? []) as never);
            success = Boolean(answer.text);
          } else if (evt.type === 'response.failed' || evt.type === 'error') {
            errorMessage = JSON.stringify(d?.error ?? d);
          }
        }
      } else {
        let attachments: unknown[] = [];
        const queryResults = new Map<string, never>();
        for await (const evt of appkit.genie.sendMessage('default', question, conversationId)) {
          if (evt.type === 'message_start') {
            conversationId = evt.conversationId;
          } else if (evt.type === 'status') {
            send('progress', { kind: 'status', text: evt.status });
          } else if (evt.type === 'message_result') {
            attachments = evt.message.attachments ?? [];
            success = evt.message.status !== 'FAILED';
            if (evt.message.error) errorMessage = evt.message.error;
          } else if (evt.type === 'query_result') {
            queryResults.set(evt.attachmentId, evt.data as never);
          } else if (evt.type === 'error') {
            errorMessage = evt.error;
          }
        }
        answer = chatAnswer(attachments as never, queryResults);
        if (!answer.text && !answer.charts.length) success = false;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (answer && (answer.text || answer.charts.length)) {
      send('answer', answer);
      await appkit.lakebase.query(
        `INSERT INTO chatapp.chat_messages (session_id, user_email, role, content, mode, attachment_json)
         VALUES ($1, $2, 'assistant', $3, $4, $5)`,
        [session.session_id, email, answer.text, mode, JSON.stringify(answer)],
      );
    } else {
      send('error', { error: errorMessage ?? 'No answer was returned' });
    }

    await appkit.lakebase.query(
      `UPDATE chatapp.chat_sessions SET ${convColumn} = $1, updated_at = now() WHERE session_id = $2`,
      [conversationId ?? null, session.session_id],
    );
    await appkit.lakebase.query(
      `INSERT INTO chatapp.usage_log (session_id, user_email, mode, question, success, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [session.session_id, email, mode, content, success, Date.now() - startedAt, errorMessage],
    );

    const title = await titlePromise.catch(() => null);
    if (title) send('session_title', { sessionId: session.session_id, title });
    send('done', { success, latencyMs: Date.now() - startedAt });
    res.end();
  });

  // --- monitoring / observability --------------------------------------

  router.get('/api/admin/usage', async (_req, res) => {
    const [totals, byUser, byMode, recent] = await Promise.all([
      appkit.lakebase.query(
        `SELECT COUNT(*)::int AS total_questions,
                COUNT(*) FILTER (WHERE success)::int AS successful,
                ROUND(AVG(latency_ms)) AS avg_latency_ms
           FROM chatapp.usage_log`,
      ),
      appkit.lakebase.query(
        `SELECT u.user_email, COUNT(*)::int AS questions,
                COUNT(*) FILTER (WHERE u.success)::int AS successful,
                ROUND(AVG(u.latency_ms)) AS avg_latency_ms,
                COUNT(DISTINCT u.session_id)::int AS sessions,
                MAX(u.created_at) AS last_active
           FROM chatapp.usage_log u
          GROUP BY u.user_email
          ORDER BY questions DESC
          LIMIT 50`,
      ),
      appkit.lakebase.query(
        `SELECT mode, COUNT(*)::int AS questions,
                COUNT(*) FILTER (WHERE success)::int AS successful,
                ROUND(AVG(latency_ms)) AS avg_latency_ms
           FROM chatapp.usage_log
          GROUP BY mode`,
      ),
      appkit.lakebase.query(
        `SELECT user_email, mode, question, success, latency_ms, error_message, created_at
           FROM chatapp.usage_log
          ORDER BY created_at DESC
          LIMIT 50`,
      ),
    ]);
    res.json({
      totals: totals.rows[0],
      byUser: byUser.rows,
      byMode: byMode.rows,
      recent: recent.rows,
    });
  });

  return router;
}

/** A short, human-readable line for each finished Agent Mode step. */
function agentProgress(item: Record<string, unknown>): { kind: string; text: string } {
  if (item.type === 'reasoning') {
    const content = (item.content ?? []) as Array<{ text?: string }>;
    return { kind: 'reasoning', text: content.map((c) => c.text ?? '').join(' ').trim() || 'Thinking…' };
  }
  if (item.type === 'function_call') {
    let args: { title?: string } = {};
    try { args = JSON.parse(String(item.arguments ?? '{}')); } catch { /* keep empty */ }
    if (item.name === 'execute_sql') return { kind: 'sql', text: args.title ?? 'Running a query' };
    if (item.name === 'generate_visualization') return { kind: 'viz', text: args.title ?? 'Building a chart' };
    return { kind: 'tool', text: String(item.name ?? 'Working') };
  }
  if (item.type === 'message') return { kind: 'writing', text: 'Writing the answer' };
  return { kind: 'other', text: '' };
}
