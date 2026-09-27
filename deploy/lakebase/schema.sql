-- App state in Lakebase Postgres: per-user chat sessions/messages + usage log.
-- Idempotent; run as the database owner. The app's service-principal role is
-- granted access separately by deploy.py (it only exists once the app does).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS chatapp;

CREATE TABLE IF NOT EXISTS chatapp.chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('chat','agent')),
  title TEXT,
  genie_conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatapp.chat_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chatapp.chat_sessions(session_id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT,
  mode TEXT NOT NULL,
  attachment_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatapp.usage_log (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  user_email TEXT NOT NULL,
  mode TEXT NOT NULL,
  question TEXT,
  success BOOLEAN NOT NULL,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v2: the mode is chosen per message, not per session. Genie keeps Chat and
-- Agent conversations separate (neither accepts the other's conversation id),
-- so a session holds one of each; `genie_conversation_id` is the Chat one.
ALTER TABLE chatapp.chat_sessions ADD COLUMN IF NOT EXISTS agent_conversation_id TEXT;
ALTER TABLE chatapp.chat_sessions ALTER COLUMN mode SET DEFAULT 'chat';
-- Name sessions created before titles existed after their first question.
UPDATE chatapp.chat_sessions s
   SET title = left(m.content, 60)
  FROM (SELECT DISTINCT ON (session_id) session_id, content
          FROM chatapp.chat_messages WHERE role = 'user'
         ORDER BY session_id, created_at) m
 WHERE s.session_id = m.session_id AND s.title IS NULL;

-- v3: answer feedback (synced to Genie) and per-question observability details.
-- genie_* ids identify the answer in Genie, which is what its feedback API needs.
ALTER TABLE chatapp.chat_messages ADD COLUMN IF NOT EXISTS genie_conversation_id TEXT;
ALTER TABLE chatapp.chat_messages ADD COLUMN IF NOT EXISTS genie_message_id TEXT;
ALTER TABLE chatapp.chat_messages ADD COLUMN IF NOT EXISTS feedback SMALLINT;      -- 1 helpful, -1 not helpful
ALTER TABLE chatapp.chat_messages ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;
ALTER TABLE chatapp.usage_log ADD COLUMN IF NOT EXISTS assistant_message_id UUID;
ALTER TABLE chatapp.usage_log ADD COLUMN IF NOT EXISTS feedback SMALLINT;
ALTER TABLE chatapp.usage_log ADD COLUMN IF NOT EXISTS details JSONB;           -- SQL run, timings, Genie ids

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chatapp.chat_sessions (user_email, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chatapp.chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON chatapp.usage_log (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_user ON chatapp.usage_log (user_email);
