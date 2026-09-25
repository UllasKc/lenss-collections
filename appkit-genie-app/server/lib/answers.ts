/**
 * One answer shape for both modes, so the UI renders — and Lakebase stores —
 * the same thing whether Chat or Agent mode produced it. Text may contain
 * `[[chart:<id>]]` markers where Agent mode placed a visualization inline;
 * charts without a marker are shown after the text.
 */
export interface ChartSpec {
  id: string;
  title: string;
  sql?: string;
  columns: Array<{ name: string; type: string }>;
  rows: Array<Array<string | null>>;
  truncated?: boolean;
}

export interface AgentStep {
  kind: 'reasoning' | 'sql' | 'viz';
  text: string;
  sql?: string;
}

export interface Answer {
  version: 2;
  mode: 'chat' | 'agent';
  text: string;
  charts: ChartSpec[];
  steps?: AgentStep[];
  suggestions?: string[];
}

/** Enough rows for any sensible chart or table; keeps Lakebase rows small. */
const MAX_ROWS = 500;

export function capRows(rows: Array<Array<string | null>>): { rows: Array<Array<string | null>>; truncated: boolean } {
  return rows.length > MAX_ROWS ? { rows: rows.slice(0, MAX_ROWS), truncated: true } : { rows, truncated: false };
}

const NUMERIC = /^(DOUBLE|FLOAT|DECIMAL|INT|INTEGER|BIGINT|LONG|SHORT|SMALLINT|TINYINT|BYTE)/i;

/** "MTD_Collections, Monthly_Target / Product" -> "MTD Collections vs Monthly Target by Product" */
function titleFromColumns(columns: Array<{ name: string; type: string }>): string {
  const pretty = (n: string) => n.replace(/_/g, ' ');
  const measures = columns.filter((c) => NUMERIC.test(c.type) && !/(^|_)(id|key)$/i.test(c.name)).map((c) => pretty(c.name));
  const dims = columns.filter((c) => !NUMERIC.test(c.type)).map((c) => pretty(c.name));
  if (!measures.length) return dims.slice(0, 3).join(', ') || 'Query result';
  const m = measures.length > 2 ? `${measures.slice(0, 2).join(', ')} and more` : measures.join(' vs ');
  return dims.length ? `${m} by ${dims.slice(0, 2).join(' and ')}` : m;
}

// --- Chat mode ---------------------------------------------------------------

interface ChatAttachment {
  attachmentId?: string;
  query?: { title?: string; description?: string; query?: string };
  text?: { content?: string };
  suggestedQuestions?: string[];
}

interface StatementResponse {
  manifest?: { schema?: { columns?: Array<{ name: string; type_name: string }> } };
  result?: { data_array?: Array<Array<string | null>> };
}

export function chatAnswer(
  attachments: ChatAttachment[],
  queryResults: Map<string, StatementResponse>,
): Answer {
  const text = attachments.find((a) => typeof a.text?.content === 'string')?.text?.content ?? '';
  const suggestions = attachments.flatMap((a) => a.suggestedQuestions ?? []);
  const charts: ChartSpec[] = [];
  for (const a of attachments) {
    if (!a.query || !a.attachmentId) continue;
    const data = queryResults.get(a.attachmentId);
    const columns = (data?.manifest?.schema?.columns ?? []).map((c) => ({ name: c.name, type: c.type_name }));
    if (!columns.length) continue;
    const { rows, truncated } = capRows(data?.result?.data_array ?? []);
    charts.push({
      id: a.attachmentId,
      // Genie rarely sets a title; its description is a sentence ("You want to see…"), so name it from the columns.
      title: a.query.title || titleFromColumns(columns),
      sql: a.query.query,
      columns,
      rows,
      truncated,
    });
  }
  return { version: 2, mode: 'chat', text, charts, suggestions };
}

// --- Agent mode --------------------------------------------------------------

interface AgentOutputItem {
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  output?: string;
  content?: Array<{ type?: string; text?: string; metadata?: { viz?: { attachment_id?: string } } }>;
  metadata?: { viz?: { attachment_id?: string; query_attachment_id?: string } };
}

/** `execute_sql` returns its result as "**Title**\n\n| a | b |\n| --- | --- |\n| 1 | 2 |". */
export function parseMarkdownTable(md: string): { columns: string[]; rows: string[][] } | null {
  const lines = md.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (lines.length < 2) return null;
  const cells = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const columns = cells(lines[0]);
  const rows = lines.slice(2).map(cells).filter((r) => r.length === columns.length);
  return { columns, rows };
}

function inferType(values: Array<string | null>): string {
  const present = values.filter((v): v is string => v !== null && v !== '' && v !== 'null');
  if (present.length && present.every((v) => /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v))) return 'DOUBLE';
  if (present.length && present.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return 'DATE';
  return 'STRING';
}

export function agentAnswer(output: AgentOutputItem[]): Answer {
  const steps: AgentStep[] = [];
  const sqlCalls = new Map<string, { title: string; sql: string }>();
  const sqlResults = new Map<string, { columns: string[]; rows: string[][] }>();
  const vizToQuery = new Map<string, { title: string; queryId: string }>();

  for (const item of output) {
    if (item.type === 'reasoning') {
      const t = (item.content ?? []).map((c) => c.text ?? '').join(' ').trim();
      if (t) steps.push({ kind: 'reasoning', text: t });
    } else if (item.type === 'function_call' && item.call_id) {
      let args: { title?: string; sql?: string; query_attachment_id?: string } = {};
      try { args = JSON.parse(item.arguments ?? '{}'); } catch { /* keep empty */ }
      if (item.name === 'execute_sql') {
        sqlCalls.set(item.call_id, { title: args.title ?? 'Query', sql: args.sql ?? '' });
        steps.push({ kind: 'sql', text: args.title ?? 'Running a query', sql: args.sql });
      } else if (item.name === 'generate_visualization' && args.query_attachment_id) {
        vizToQuery.set(item.call_id, { title: args.title ?? '', queryId: args.query_attachment_id });
        steps.push({ kind: 'viz', text: args.title ?? 'Building a chart' });
      }
    } else if (item.type === 'function_call_output' && item.call_id && sqlCalls.has(item.call_id)) {
      const t = parseMarkdownTable(item.output ?? '');
      if (t) sqlResults.set(item.call_id, t);
    }
  }

  const toChart = (id: string, title: string, queryId: string): ChartSpec | null => {
    const res = sqlResults.get(queryId);
    if (!res) return null;
    const { rows, truncated } = capRows(res.rows);
    return {
      id,
      title: title || sqlCalls.get(queryId)?.title || 'Query result',
      sql: sqlCalls.get(queryId)?.sql,
      columns: res.columns.map((name, i) => ({ name, type: inferType(rows.map((r) => r[i])) })),
      rows,
      truncated,
    };
  };

  // The final assistant message interleaves text parts with empty parts whose
  // metadata.viz.attachment_id marks where a chart belongs.
  const charts: ChartSpec[] = [];
  const messages = output.filter((o) => o.type === 'message' && o.role === 'assistant');
  const last = messages[messages.length - 1];
  const parts: string[] = [];
  for (const c of last?.content ?? []) {
    const vizId = c.metadata?.viz?.attachment_id;
    if (vizId && vizToQuery.has(vizId)) {
      const v = vizToQuery.get(vizId)!;
      const chart = toChart(vizId, v.title, v.queryId);
      if (chart) {
        charts.push(chart);
        parts.push(`\n\n[[chart:${vizId}]]\n\n`);
      }
    } else if (c.type === 'output_text' && c.text) {
      parts.push(c.text);
    }
  }
  // Visualizations the agent generated but didn't place inline.
  for (const [vizId, v] of vizToQuery) {
    if (!charts.some((c) => c.id === vizId)) {
      const chart = toChart(vizId, v.title, v.queryId);
      if (chart) charts.push(chart);
    }
  }
  // No visualization at all: still show the data behind the answer.
  if (!charts.length) {
    for (const queryId of [...sqlResults.keys()].filter((id) => (sqlResults.get(id)?.rows.length ?? 0) > 1).slice(-2)) {
      const chart = toChart(queryId, '', queryId);
      if (chart) charts.push(chart);
    }
  }
  return { version: 2, mode: 'agent', text: parts.join('').trim(), charts, steps };
}
