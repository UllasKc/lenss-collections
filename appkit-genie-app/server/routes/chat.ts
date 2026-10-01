import express from 'express';
import { getExecutionContext } from '@databricks/appkit';
import { agentAnswer, stripCitations, type Answer } from '../lib/answers.js';
import { aiConfig, aiConfigSummary } from '../lib/aiConfig.js';
import {
  attachJudge, cacheEnabled, cacheKey, currentVersions, embedQuestions, evict, lookup, semanticLookup, startPrewarm, store,
  type Lakebase, type SemanticMatch,
} from '../lib/answerCache.js';
import { runGenie, type GenieLike, type GenieRun, type Mode } from '../lib/genieRun.js';
import { checkOutput, inputClassifier, inputPatterns, type GuardEvent } from '../lib/guardrails.js';
import { judgeAnswer } from '../lib/judge.js';
import { STARTERS, MORE_SUGGESTIONS } from '../lib/suggestions.js';
import { generateTitle } from '../lib/titles.js';

/** The strongest guardrail action on a question, for Monitoring's counts. */
function strongestAction(events: GuardEvent[]): string | null {
  for (const [action, label] of [['block', 'blocked'], ['redact', 'redacted'], ['warn', 'warned'], ['flag', 'flagged']] as const) {
    if (events.some((e) => e.action === action)) return label;
  }
  return null;
}

/** The slice of the AppKit plugin map this router actually uses (avoids
 * fighting PluginMap<T>'s plugin-array-dependent generic — TS structural
 * typing means the real `appkit` object from server.ts satisfies this). */
interface ChatAppKit {
  lakebase: Lakebase;
  genie: GenieLike;
}

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
   * those turns over as context so follow-ups still make sense. Answers served
   * from the cache never reached this session's Genie conversation either, so
   * they are carried over the same way.
   */
  const crossModeContext = async (sessionId: string, mode: Mode): Promise<string> => {
    const { rows } = await appkit.lakebase.query(
      `SELECT role, content, mode FROM chatapp.chat_messages
        WHERE session_id = $1
          AND created_at > COALESCE(
                (SELECT MAX(created_at) FROM chatapp.chat_messages
                  WHERE session_id = $1 AND mode = $2 AND NOT from_cache), 'epoch')
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

  // One list for the tiles, the side panel and the cache pre-warm.
  router.get('/api/chat/suggestions', (_req, res) => {
    res.json({ starters: STARTERS, more: MORE_SUGGESTIONS });
  });

  // Pre-warmed answers are judged too, so cache hits can show their score.
  startPrewarm(appkit.lakebase, appkit.genie, (key, q, run) => {
    if (!aiConfig.judge || !run.answer?.text) return;
    void judgeAnswer(q, run.answer.text, run.evidence)
      .then((verdict) => (verdict ? attachJudge(appkit.lakebase, key, verdict) : undefined))
      .catch(() => {});
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
      `SELECT message_id, role, content, mode, attachment_json, feedback, from_cache, created_at
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
      const answer = r.attachment_json as Answer | null;
      if (answer && typeof answer.text === 'string') answer.text = stripCitations(answer.text);
      if (typeof r.content === 'string') r.content = stripCitations(r.content);
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
    const startedAt = Date.now();
    // Input guardrails: the pattern checks decide the text at once (PII masked); the
    // classifier model runs while the session and cache are looked up.
    const patterns = inputPatterns(content);
    const guardInPromise = inputClassifier({ ...patterns, events: [...patterns.events] });

    // Refresh: the user asked for a live answer in place of a cached one.
    const refreshOf = typeof req.body?.refreshOf === 'string' ? req.body.refreshOf : null;
    if (refreshOf) {
      const removed = await appkit.lakebase.query(
        `DELETE FROM chatapp.chat_messages
          WHERE message_id = $1 AND session_id = $2 AND role = 'assistant' AND from_cache
          RETURNING cache_key`,
        [refreshOf, session.session_id],
      );
      if (!removed.rows.length) {
        res.status(404).json({ error: 'cached answer not found' });
        return;
      }
    }

    // Only standalone questions use the cache: the first question of a chat,
    // a suggested question, or a refresh of one of those. Follow-ups depend
    // on the conversation, so they always go to Genie.
    const { rows: earlier } = await appkit.lakebase.query(
      `SELECT COUNT(*)::int AS n FROM chatapp.chat_messages WHERE session_id = $1`,
      [session.session_id],
    );
    const standalone = cacheEnabled && (earlier[0].n === 0 || req.body?.standalone === true || Boolean(refreshOf));
    const versions = standalone ? await currentVersions(appkit.lakebase).catch(() => null) : null;

    // What's stored and sent on is the guarded question: PII never reaches Genie, the cache or the logs.
    const question = patterns.text;
    const key = versions && !patterns.blocked ? cacheKey(question, mode, versions) : null;
    let hit = key && !refreshOf ? await lookup(appkit.lakebase, key).catch(() => null) : null;

    // Semantic cache: on an exact miss, the nearest cached question if it's similar enough.
    let questionVector: number[] | null = null;
    let semantic: SemanticMatch | null = null;
    if (key && versions && !hit && aiConfig.semanticCache) {
      [questionVector] = await embedQuestions([question]);
      if (questionVector && !refreshOf) {
        semantic = await semanticLookup(appkit.lakebase, question, mode, versions, questionVector).catch(() => null);
        hit = semantic?.hit ?? null;
      }
    }
    const guardIn = await guardInPromise;
    const guardEvents: GuardEvent[] = [...guardIn.events];
    if (guardIn.blocked) hit = null;

    const preamble = hit || guardIn.blocked ? '' : await crossModeContext(session.session_id as string, mode);
    if (!refreshOf) {
      await appkit.lakebase.query(
        `INSERT INTO chatapp.chat_messages (session_id, user_email, role, content, mode, from_cache)
         VALUES ($1, $2, 'user', $3, $4, $5)`,
        [session.session_id, email, question, mode, Boolean(hit)],
      );
    }

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
      : generateTitle(question).then(async (title) => {
          await appkit.lakebase.query(
            `UPDATE chatapp.chat_sessions SET title = $1 WHERE session_id = $2 AND title IS NULL`,
            [title, session.session_id],
          );
          return title;
        });

    const convColumn = mode === 'agent' ? 'agent_conversation_id' : 'genie_conversation_id';
    const priorConversation = (session[convColumn] as string | null) ?? undefined;

    let answer: Answer | null;
    let success: boolean;
    let errorMessage: string | null = null;
    let genieConversationId: string | null = null;
    let genieMessageId: string | null = null;
    let details: Record<string, unknown>;
    let cacheInfo: Record<string, unknown> | null = null;
    let liveRun: GenieRun | null = null;
    let storedKey: string | null = null;
    const notices: string[] = guardIn.message && !guardIn.blocked ? [guardIn.message] : [];

    if (guardIn.blocked) {
      // Never sent to Genie; the reason is shown as the answer.
      answer = { version: 2, mode, text: guardIn.message ?? 'This question was blocked.', charts: [], guard: { blocked: true } };
      success = false;
      errorMessage = `Blocked by guardrail: ${guardEvents.filter((e) => e.action === 'block').map((e) => e.check).join(', ')}`;
      details = { queries: [] };
    } else if (hit) {
      // Same answer, charts, steps and SQL as when Genie produced it; nothing
      // is sent to Genie, so the session's Genie conversation is untouched.
      answer = {
        ...hit.answer,
        text: stripCitations(hit.answer.text), // entries cached before citations were stripped
        cache: { generatedAt: hit.createdAt, source: hit.source, similarTo: hit.similarTo },
      };
      success = true;
      genieConversationId = (hit.details.genieConversationId as string | null) ?? null;
      genieMessageId = (hit.details.genieMessageId as string | null) ?? null;
      cacheInfo = {
        hit: true, key: hit.key, source: hit.source, generatedAt: hit.createdAt,
        match: hit.similarTo ? 'semantic' : 'exact', similarTo: hit.similarTo ?? null,
        originalLatencyMs: hit.details.latencyMs ?? null, originalTimeline: hit.details.timeline ?? [],
      };
      details = { queries: hit.details.queries ?? [], judge: hit.details.judge ? { ...(hit.details.judge as object), reused: true } : undefined };
    } else {
      const run = await runGenie(appkit.genie, mode, preamble + question, priorConversation, (p) => send('progress', p));
      liveRun = run;
      answer = run.answer;
      success = run.success;
      errorMessage = run.errorMessage;
      genieConversationId = run.conversationId ?? null;
      genieMessageId = run.genieMessageId;
      details = { timeline: run.timeline, queries: run.queries };
      await appkit.lakebase.query(
        `UPDATE chatapp.chat_sessions SET ${convColumn} = $1, updated_at = now() WHERE session_id = $2`,
        [genieConversationId, session.session_id],
      );
      // Output guardrails before the answer is sent or cached.
      if (answer?.text) {
        const g = checkOutput(answer.text);
        answer.text = g.text;
        guardEvents.push(...g.events);
        if (g.notice) notices.push(g.notice);
      }
      // Cache it only if Genie saw the question on its own (no earlier turns),
      // otherwise the answer may lean on context a later asker won't have.
      let stored = false;
      if (key && versions && !priorConversation && !preamble && run.success) {
        stored = await store(appkit.lakebase, key, question, mode, versions, run, 'live', questionVector).then(() => true, () => false);
        if (stored) storedKey = key;
      }
      if (standalone) {
        cacheInfo = { hit: false, refreshed: Boolean(refreshOf), stored, closest: semantic?.best ?? null };
      }
    }
    if (answer && notices.length) answer.guard = { ...(answer.guard ?? {}), notices };
    const latencyMs = Date.now() - startedAt;
    if (hit) details.timeline = [{ stage: 'Answered from cache', ms: latencyMs }];

    let assistantMessageId: string | null = null;
    if (answer && (answer.text || answer.charts.length)) {
      send('answer', answer);
      const saved = await appkit.lakebase.query(
        `INSERT INTO chatapp.chat_messages
           (session_id, user_email, role, content, mode, attachment_json, genie_conversation_id, genie_message_id,
            from_cache, cache_key)
         VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9)
         RETURNING message_id`,
        [session.session_id, email, answer.text, mode, JSON.stringify(answer), genieConversationId, genieMessageId,
          Boolean(hit), hit?.key ?? key],
      );
      assistantMessageId = saved.rows[0]?.message_id as string;
      send('saved', { messageId: assistantMessageId, feedbackEnabled: Boolean(genieConversationId && genieMessageId) });
      if (hit || guardIn.blocked) {
        await appkit.lakebase.query(`UPDATE chatapp.chat_sessions SET updated_at = now() WHERE session_id = $1`, [session.session_id]);
      }
    } else {
      send('error', { error: errorMessage ?? 'No answer was returned' });
    }

    const reusedJudge = details.judge as { score?: number } | undefined;
    const logged = await appkit.lakebase.query(
      `INSERT INTO chatapp.usage_log
         (session_id, user_email, mode, question, success, latency_ms, error_message, assistant_message_id, details,
          from_cache, guard_action, faithfulness)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING event_id`,
      [session.session_id, email, mode, question, success, latencyMs, errorMessage, assistantMessageId, JSON.stringify({
        ...details,
        charts: answer?.charts.length ?? 0,
        agentSteps: answer?.steps?.length ?? null,
        answerPreview: (answer?.text ?? '').slice(0, 1500),
        contextCarriedOver: Boolean(preamble),
        genieConversationId,
        genieMessageId,
        cache: cacheInfo,
        guardrails: guardEvents.length ? { events: guardEvents, classifierMs: guardIn.modelMs } : undefined,
      }), Boolean(hit), strongestAction(guardEvents), reusedJudge?.score ?? null],
    );

    const title = await titlePromise.catch(() => null);
    if (title) send('session_title', { sessionId: session.session_id, title });
    send('done', { success, latencyMs, fromCache: Boolean(hit), blocked: guardIn.blocked });
    res.end();

    // Faithfulness judge: after the user has the answer, so it never adds to their wait.
    if (liveRun?.success && answer?.text) {
      const eventId = logged.rows[0]?.event_id as string | undefined;
      void judgeAnswer(question, answer.text, liveRun.evidence).then(async (verdict) => {
        if (!verdict) return;
        if (eventId) {
          await appkit.lakebase.query(
            `UPDATE chatapp.usage_log SET faithfulness = $2,
                    details = jsonb_set(COALESCE(details, '{}'::jsonb), '{judge}', $3::jsonb)
              WHERE event_id = $1`,
            [eventId, verdict.score, JSON.stringify(verdict)],
          );
        }
        if (storedKey) await attachJudge(appkit.lakebase, storedKey, verdict);
      }).catch((err: unknown) => console.warn('[judge] failed:', err instanceof Error ? err.message : err));
    }
  });

  // --- answer feedback: stored here and sent to Genie's Monitor ----------

  router.post('/api/chat/messages/:id/feedback', async (req, res) => {
    const email = currentUserEmail(req);
    const raw = req.body?.rating;
    const value = raw === 'up' ? 1 : raw === 'down' ? -1 : null;
    const { rows } = await appkit.lakebase.query(
      `UPDATE chatapp.chat_messages SET feedback = $1, feedback_at = now()
        WHERE message_id = $2 AND user_email = $3 AND role = 'assistant'
        RETURNING genie_conversation_id, genie_message_id, cache_key`,
      [value, req.params.id, email],
    );
    if (!rows.length) {
      res.status(404).json({ error: 'answer not found' });
      return;
    }
    // A thumbs-down removes the answer from the cache, so the next person gets a fresh one.
    if (value === -1 && rows[0].cache_key) await evict(appkit.lakebase, rows[0].cache_key as string).catch(() => {});
    await appkit.lakebase.query(`UPDATE chatapp.usage_log SET feedback = $1 WHERE assistant_message_id = $2`, [value, req.params.id]);

    // Genie's feedback API accepts both Chat and Agent answers (verified).
    let sentToGenie = false;
    const { genie_conversation_id: conv, genie_message_id: msg } = rows[0] as Record<string, string | null>;
    if (GENIE_AGENT_ID && conv && msg) {
      try {
        await getExecutionContext().client.apiClient.request({
          path: `/api/2.0/genie/spaces/${GENIE_AGENT_ID}/conversations/${conv}/messages/${msg}/feedback`,
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          raw: false,
          payload: { rating: value === 1 ? 'POSITIVE' : value === -1 ? 'NEGATIVE' : 'NONE' },
        } as never);
        sentToGenie = true;
      } catch (err) {
        console.warn('Genie feedback not delivered:', err instanceof Error ? err.message : err);
      }
    }
    res.json({ rating: raw ?? null, sentToGenie });
  });

  // --- monitoring / observability --------------------------------------

  router.get('/api/admin/usage', async (_req, res) => {
    const [totals, byUser, byMode, recent] = await Promise.all([
      appkit.lakebase.query(
        `SELECT COUNT(*)::int AS total_questions,
                COUNT(*) FILTER (WHERE success)::int AS successful,
                COUNT(*) FILTER (WHERE guard_action = 'blocked')::int AS blocked,
                COUNT(*) FILTER (WHERE faithfulness IS NOT NULL)::int AS judged,
                ROUND(AVG(faithfulness)::numeric, 3) AS avg_faithfulness,
                COUNT(*) FILTER (WHERE faithfulness < 0.7)::int AS low_faithfulness,
                COUNT(*) FILTER (WHERE details->'cache'->>'match' = 'semantic')::int AS semantic_hits,
                ROUND(AVG(latency_ms)) AS avg_latency_ms,
                COUNT(*) FILTER (WHERE feedback = 1)::int AS helpful,
                COUNT(*) FILTER (WHERE feedback = -1)::int AS not_helpful,
                COUNT(*) FILTER (WHERE from_cache)::int AS cache_hits,
                ROUND(AVG(latency_ms) FILTER (WHERE from_cache)) AS avg_cache_latency_ms,
                ROUND(AVG(latency_ms) FILTER (WHERE NOT from_cache)) AS avg_live_latency_ms
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
                COUNT(*) FILTER (WHERE from_cache)::int AS cache_hits,
                ROUND(AVG(latency_ms) FILTER (WHERE NOT from_cache)) AS avg_latency_ms
           FROM chatapp.usage_log
          GROUP BY mode`,
      ),
      appkit.lakebase.query(
        `SELECT u.event_id, u.session_id, s.title AS session_title, u.user_email, u.mode, u.question, u.success,
                u.latency_ms, u.error_message, u.feedback, u.details, u.from_cache, u.guard_action, u.faithfulness, u.created_at
           FROM chatapp.usage_log u
           LEFT JOIN chatapp.chat_sessions s ON s.session_id = u.session_id
          ORDER BY u.created_at DESC
          LIMIT 100`,
      ),
    ]);
    // The cache view is optional: an older schema without the cache tables still gets the rest.
    const cache = await Promise.all([
      appkit.lakebase.query(
        `SELECT question, mode, source, hits, created_at, expires_at, last_hit_at
           FROM chatapp.answer_cache c
          WHERE (c.data_version, c.genie_version) = (
                  (SELECT version FROM chatapp.cache_versions WHERE name = 'data'),
                  (SELECT version FROM chatapp.cache_versions WHERE name = 'genie'))
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY hits DESC, created_at DESC
          LIMIT 50`,
      ),
      appkit.lakebase.query(`SELECT name, version, updated_at FROM chatapp.cache_versions ORDER BY name`),
      appkit.lakebase.query(
        `SELECT versions_key, status, answered, started_at, finished_at FROM chatapp.prewarm_runs
          ORDER BY started_at DESC LIMIT 1`,
      ),
    ]).then(([entries, versions, prewarm]) => ({
      enabled: cacheEnabled, entries: entries.rows, versions: versions.rows, lastPrewarm: prewarm.rows[0] ?? null,
    })).catch(() => null);
    // Guardrails and judge: what's configured, and what has fired.
    const ai = await Promise.all([
      appkit.lakebase.query(
        `SELECT e->>'stage' AS stage, e->>'check' AS check_name, e->>'action' AS action, COUNT(*)::int AS n
           FROM chatapp.usage_log, jsonb_array_elements(details->'guardrails'->'events') e
          GROUP BY 1, 2, 3 ORDER BY n DESC`,
      ),
      appkit.lakebase.query(
        `SELECT u.created_at, u.user_email, u.mode, u.question, u.guard_action, details->'guardrails'->'events' AS events
           FROM chatapp.usage_log u WHERE u.guard_action IS NOT NULL ORDER BY u.created_at DESC LIMIT 50`,
      ),
    ]).then(([counts, events]) => ({
      config: aiConfigSummary(),
      guardCounts: counts.rows,
      guardEvents: events.rows,
    })).catch(() => ({ config: aiConfigSummary(), guardCounts: [], guardEvents: [] }));
    res.json({
      totals: totals.rows[0],
      byUser: byUser.rows,
      byMode: byMode.rows,
      // Older answers still carry Genie's citation links to the workspace.
      recent: recent.rows.map((r) => {
        const d = r.details as { answerPreview?: unknown } | null;
        if (d && typeof d.answerPreview === 'string') d.answerPreview = stripCitations(d.answerPreview);
        return r;
      }),
      cache,
      ai,
    });
  });

  return router;
}
