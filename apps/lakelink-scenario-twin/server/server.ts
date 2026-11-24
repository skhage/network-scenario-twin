// Lakelink Fiber Scenario Twin - server (Express + pg). Read-only over Lakebase twin state.
// Tag: telco_project: network_scenario_twin. Governing decisions: D-003, D-004, D-005, D-010.
import express, { Request, Response } from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DATABRICKS_APP_PORT || process.env.PORT || 8000);
const SCHEMA = (process.env.TWIN_SCHEMA || 'twin_app').replace(/[^a-z_]/g, '');
const STALE_HOURS = Number(process.env.STALE_HOURS || 24);

// --- SP OAuth token used as the Lakebase password (rotated before expiry) ---
let cached: { token: string; exp: number } | null = null;
async function spToken(): Promise<string> {
  if (cached && Date.now() < cached.exp - 5 * 60_000) return cached.token;
  const rawHost = process.env.DATABRICKS_HOST || '';
  const host = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'all-apis' });
  const auth = Buffer.from(`${process.env.DATABRICKS_CLIENT_ID}:${process.env.DATABRICKS_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${host}/oidc/v1/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`token request failed (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'nst_twin_state',
  user: process.env.PGUSER || process.env.DATABRICKS_CLIENT_ID,
  password: spToken,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30_000,
});
// Twin pool is read-only (ARCHITECTURE s2.4); only a future app_state pool may write.
pool.on('connect', (client) => { client.query('SET default_transaction_read_only = on').catch((e) => console.error('[pool]', e)); });

type Status = 'ok' | 'empty' | 'stale' | 'error';
interface Envelope<T> { data: T | null; as_of: string | null; source_table: string; status: Status; message?: string }

async function asOf(): Promise<string | null> {
  const r = await pool.query(`SELECT MAX(state_as_of_ts) AS ts FROM ${SCHEMA}.twin_current_state`);
  return r.rows[0]?.ts ? new Date(r.rows[0].ts).toISOString() : null;
}
function statusFor(asof: string | null, hasRows: boolean): Status {
  if (!hasRows) return 'empty';
  if (asof && Date.now() - new Date(asof).getTime() > STALE_HOURS * 3600_000) return 'stale';
  return 'ok';
}
function fail(res: Response, route: string, source: string, e: unknown) {
  console.error(`[${route}]`, e); // details stay in server logs, never in the UI
  const body: Envelope<null> = { data: null, as_of: null, source_table: source, status: 'error', message: `Could not load ${route}` };
  res.status(500).json(body);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// GET /api/health - pool status + twin freshness
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const ts = await asOf();
    res.json({ data: { pool: 'ok', schema: SCHEMA }, as_of: ts, source_table: `${SCHEMA}.twin_current_state`, status: statusFor(ts, ts !== null) });
  } catch (e) { fail(res, '/api/health', `${SCHEMA}.twin_current_state`, e); }
});

// GET /api/overview - the 3 wow-moment headline metrics (Simulated / Forecast / Observed provenance)
app.get('/api/overview', async (_req: Request, res: Response) => {
  const src = `${SCHEMA}.sim_failure_result, ${SCHEMA}.sim_capacity_forecast, ${SCHEMA}.copper_wire_center`;
  try {
    const [ts, blast, corridor, copper] = await Promise.all([
      asOf(),
      pool.query(`SELECT resource_id, jsonb_array_length(dual_path_both_failed_customer_ids) AS dual_path_both_failed, sla_exposure_mrr::float8 AS sla_exposure_mrr
                  FROM ${SCHEMA}.sim_failure_result WHERE resource_id = $1 AND model_name = $2 ORDER BY simulated_at DESC LIMIT 1`, ['S-4471', 'srlg_graph_v1']),
      pool.query(`SELECT corridor_id, MIN(days_to_exhaustion)::int AS days_to_exhaustion, MIN(exhaustion_date)::text AS exhaustion_date
                  FROM ${SCHEMA}.sim_capacity_forecast WHERE corridor_id = $1 AND model_alias = $2 GROUP BY corridor_id`, ['DEN-SLC', 'champion']),
      pool.query(`SELECT COUNT(*) FILTER (WHERE high_value_customers > 0 AND decommission_target < DATE '2027-06-01')::int AS flagged, COUNT(*)::int AS total
                  FROM ${SCHEMA}.copper_wire_center WHERE state = $1`, ['IA']),
    ]);
    const data = {
      blast: blast.rows[0] ?? null,
      corridor: corridor.rows[0] ?? null,
      copper: copper.rows[0] && copper.rows[0].total > 0 ? copper.rows[0] : null,
    };
    const any = Boolean(data.blast || data.corridor || data.copper);
    res.json({ data, as_of: ts, source_table: src, status: statusFor(ts, any) });
  } catch (e) { fail(res, '/api/overview', src, e); }
});

// Input validation (ARCHITECTURE s2.4). Invalid input -> HTTP 400 with a plain-text message the UI renders as-is (UX W3).
export const RESOURCE_ID = /^[A-Z]{1,4}-\d{1,6}$/;
export const CORRIDOR_ID = /^[A-Z]{3}-[A-Z]{3}$/;
export const STATE = /^[A-Z]{2}$/;
const MODELS = ['srlg_graph_v1', 'path_only_v1'];
const MSG = { rid: 'Resource ID must look like S-4471', cid: 'Corridor ID must look like DEN-SLC', st: 'State must be a 2-letter code like IA', model: 'Model must be srlg_graph_v1 or path_only_v1', days: 'exhausting_within_days must be a whole number from 1 to 730' };
function bad(res: Response, source: string, message: string) {
  const body: Envelope<null> = { data: null, as_of: null, source_table: source, status: 'error', message };
  res.status(400).json(body);
}
const pickModel = (q: unknown) => { const m = typeof q === 'string' && q ? q : 'srlg_graph_v1'; return MODELS.includes(m) ? m : null; };

// GET /api/resources?q=S-44 - typeahead for the resource combobox (input reduced to [A-Z0-9-], so no LIKE wildcards leak in)
app.get('/api/resources', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.twin_current_state`;
  const qs = String(req.query.q ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(`SELECT resource_id, resource_type, corridor_id FROM ${SCHEMA}.twin_current_state WHERE resource_id LIKE $1 ORDER BY resource_id LIMIT 10`, [`${qs}%`])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/resources', src, e); }
});

// GET /api/blast-radius/:resourceId?model= - Wow 1 KPIs (section 11.5 query 1)
app.get('/api/blast-radius/:resourceId', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.sim_failure_result, ${SCHEMA}.twin_current_state`;
  const id = req.params.resourceId; const model = pickModel(req.query.model);
  if (!RESOURCE_ID.test(id)) return bad(res, src, MSG.rid);
  if (!model) return bad(res, src, MSG.model);
  try {
    const [ts, r, m, s] = await Promise.all([
      asOf(),
      pool.query(`SELECT sim_id, model_name, affected_services, affected_customers, degraded_services,
                    jsonb_array_length(dual_path_both_failed_customer_ids)::int AS dual_path_both_failed,
                    sla_exposure_mrr::float8 AS sla_exposure_mrr, degraded_mrr::float8 AS degraded_mrr, srlg_expanded_resource_ids, simulated_at
                  FROM ${SCHEMA}.sim_failure_result WHERE resource_id = $1 AND model_name = $2 ORDER BY simulated_at DESC LIMIT 1`, [id, model]),
      pool.query(`SELECT COALESCE(array_agg(DISTINCT model_name), '{}') AS models FROM ${SCHEMA}.sim_failure_result WHERE resource_id = $1`, [id]),
      pool.query(`SELECT resource_id, resource_type, corridor_id, srlg FROM ${SCHEMA}.twin_current_state WHERE resource_id = $1`, [id]),
    ]);
    const data = { result: r.rows[0] ?? null, available_models: m.rows[0]?.models ?? [], resource: s.rows[0] ?? null };
    res.json({ data, as_of: ts, source_table: src, status: statusFor(ts, Boolean(data.result)) });
  } catch (e) { fail(res, '/api/blast-radius', src, e); }
});

// GET /api/blast-radius/:resourceId/customers?model= - one row per impacted customer.
// twin_app.sim_failure_customer_impact has no model_name/failure_state yet (P2-SIM-IMPACT-MODEL-COLS): model comes from the parent
// sim_failure_result row; DOWN = both paths failed, otherwise DEGRADED.
app.get('/api/blast-radius/:resourceId/customers', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.sim_failure_customer_impact, ${SCHEMA}.sim_failure_result, ${SCHEMA}.customer`;
  const id = req.params.resourceId; const model = pickModel(req.query.model);
  if (!RESOURCE_ID.test(id)) return bad(res, src, MSG.rid);
  if (!model) return bad(res, src, MSG.model);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(
      `SELECT i.customer_id::text AS customer_id, COALESCE(c.name, 'Customer ' || i.customer_id::text) AS customer, c.segment,
              CASE WHEN i.both_paths_failed THEN 'DOWN' ELSE 'DEGRADED' END AS failure_state, i.sla_exposure_mrr::float8 AS sla_exposure_mrr
         FROM ${SCHEMA}.sim_failure_customer_impact i
         JOIN ${SCHEMA}.sim_failure_result r ON r.sim_id = i.sim_id
         LEFT JOIN ${SCHEMA}.customer c ON c.customer_id = i.customer_id
        WHERE r.resource_id = $1 AND r.model_name = $2
        ORDER BY i.sla_exposure_mrr DESC, customer`, [id, model])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/blast-radius/customers', src, e); }
});

// GET /api/blast-radius/:resourceId/maintenance - scheduled windows on that span
app.get('/api/blast-radius/:resourceId/maintenance', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.maintenance_window`;
  const id = req.params.resourceId;
  if (!RESOURCE_ID.test(id)) return bad(res, src, MSG.rid);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(`SELECT window_id, start_ts, end_ts, status, work_type FROM ${SCHEMA}.maintenance_window WHERE span_id = $1 ORDER BY start_ts DESC LIMIT 5`, [id])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/blast-radius/maintenance', src, e); }
});

// GET /api/corridors?exhausting_within_days=180 - side list (expected: DEN-SLC only)
app.get('/api/corridors', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.sim_capacity_forecast, ${SCHEMA}.corridor`;
  const raw = String(req.query.exhausting_within_days ?? '180');
  const days = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!(days >= 1 && days <= 730)) return bad(res, src, MSG.days);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(
      `SELECT f.corridor_id, MAX(c.corridor_name) AS corridor_name, MIN(f.days_to_exhaustion)::int AS days_to_exhaustion, MIN(f.exhaustion_date)::text AS exhaustion_date
         FROM ${SCHEMA}.sim_capacity_forecast f LEFT JOIN ${SCHEMA}.corridor c ON c.corridor_id = f.corridor_id
        WHERE f.model_alias = 'champion' AND f.days_to_exhaustion IS NOT NULL AND f.days_to_exhaustion <= $1
        GROUP BY f.corridor_id ORDER BY 3`, [days])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/corridors', src, e); }
});

// GET /api/corridors/:corridorId/forecast - 12 monthly P10/P50/P90 + exhaustion and pre-build trigger (exhaustion - 180 days)
app.get('/api/corridors/:corridorId/forecast', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.sim_capacity_forecast`;
  const id = req.params.corridorId;
  if (!CORRIDOR_ID.test(id)) return bad(res, src, MSG.cid);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(
      `SELECT month::text AS month, forecast_utilization_pct::float8 AS p50, forecast_p10_pct::float8 AS p10, forecast_p90_pct::float8 AS p90,
              exhaustion_date::text AS exhaustion_date, exhaustion_date_p10::text AS exhaustion_date_p10, exhaustion_date_p90::text AS exhaustion_date_p90,
              days_to_exhaustion, exhaustion_threshold_pct::float8 AS threshold_pct, (exhaustion_date - 180)::text AS prebuild_trigger_date, model_name, model_version
         FROM ${SCHEMA}.sim_capacity_forecast WHERE corridor_id = $1 AND model_alias = 'champion' ORDER BY month`, [id])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/corridors/forecast', src, e); }
});

// GET /api/corridors/:corridorId/actuals - last 90 days of daily mean / p95 utilization
app.get('/api/corridors/:corridorId/actuals', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.corridor_utilization_daily`;
  const id = req.params.corridorId;
  if (!CORRIDOR_ID.test(id)) return bad(res, src, MSG.cid);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(
      `SELECT util_date::text AS util_date, util_mean_pct::float8 AS util_mean_pct, util_p95_pct::float8 AS util_p95_pct
         FROM ${SCHEMA}.corridor_utilization_daily
        WHERE corridor_id = $1 AND util_date > (SELECT MAX(util_date) FROM ${SCHEMA}.corridor_utilization_daily WHERE corridor_id = $1) - 90
        ORDER BY util_date`, [id])]);
    res.json({ data: r.rows, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/corridors/actuals', src, e); }
});

// GET /api/copper/:state - wire centers in copper_sequence order (s2.5) + high-value customers of flagged centers
app.get('/api/copper/:state', async (req: Request, res: Response) => {
  const src = `${SCHEMA}.copper_wire_center, ${SCHEMA}.customer`;
  const st = req.params.state;
  if (!STATE.test(st)) return bad(res, src, MSG.st);
  try {
    const [ts, r] = await Promise.all([asOf(), pool.query(
      `SELECT wc_id, wc_name, decommission_target::text AS decommission_target, high_value_customers, active_circuits, copper_miles::float8 AS copper_miles,
              retirement_readiness_score::float8 AS readiness_score, (high_value_customers > 0 AND decommission_target < DATE '2027-06-01') AS flagged
         FROM ${SCHEMA}.copper_wire_center WHERE state = $1
        ORDER BY decommission_target ASC, high_value_customers DESC, active_circuits ASC, copper_miles DESC`, [st])]);
    const flaggedIds = r.rows.filter((w) => w.flagged).map((w) => w.wc_id);
    const hv = flaggedIds.length ? (await pool.query(`SELECT copper_wc_id AS wc_id, name, segment FROM ${SCHEMA}.customer WHERE high_value_flag AND copper_wc_id = ANY($1) ORDER BY copper_wc_id, name`, [flaggedIds])).rows : [];
    const data = { wire_centers: r.rows.map((w, i) => ({ rank: i + 1, ...w })), high_value_customers: hv };
    res.json({ data, as_of: ts, source_table: src, status: statusFor(ts, r.rows.length > 0) });
  } catch (e) { fail(res, '/api/copper', src, e); }
});

// POST /api/copilot/chat - proxy to the Lakelink Fiber Twin Copilot (Responses API, ARCHITECTURE s4.3).
// P5-APP-COPILOT-ALL-MESSAGES: the supervisor emits its read-only refusal / Lakelink-Fiber-only notice as an EARLY assistant
// message (after policy_check), then tool calls, then a final message. Return EVERY assistant message in order, never only output[-1].
// Designer F1: user-facing messages never carry internal task codes.
const COPILOT_ENDPOINT = (process.env.COPILOT_ENDPOINT || '').replace(/[^A-Za-z0-9_-]/g, '');
const MAX_MSG = 2000, MAX_TURNS = 10;
interface Turn { role: 'user' | 'assistant'; content: string }
interface RespItem { type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }
export function assistantMessages(output: RespItem[] | undefined): string[] {
  return (output ?? [])
    .filter((o) => o?.type === 'message' && (o.role ?? 'assistant') === 'assistant')
    .map((o) => (o.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('').trim())
    .filter((t) => t.length > 0);
}
app.post('/api/copilot/chat', async (req: Request, res: Response) => {
  const src = 'copilot';
  if (!COPILOT_ENDPOINT) {
    res.status(503).json({ data: null, as_of: null, source_table: src, status: 'empty', message: 'Copilot not yet available' });
    return;
  }
  const raw = (req.body ?? {}) as { message?: unknown; history?: unknown };
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message || message.length > MAX_MSG) return bad(res, src, `Message must be 1 to ${MAX_MSG} characters`);
  const history: Turn[] = Array.isArray(raw.history)
    ? (raw.history as unknown[]).filter((t): t is Turn => typeof t === 'object' && t !== null && ((t as Turn).role === 'user' || (t as Turn).role === 'assistant') && typeof (t as Turn).content === 'string')
        .slice(-MAX_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MSG) }))
    : [];
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 120_000);
  try {
    const rawHost = process.env.DATABRICKS_HOST || '';
    const host = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
    const r = await fetch(`${host}/serving-endpoints/${COPILOT_ENDPOINT}/invocations`, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${await spToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [...history, { role: 'user', content: message }] }),
    });
    if (!r.ok) throw new Error(`copilot endpoint returned ${r.status}`);
    const j = (await r.json()) as { output?: RespItem[] };
    const messages = assistantMessages(j.output);
    res.json({ data: { messages }, as_of: new Date().toISOString(), source_table: src, status: messages.length ? 'ok' : 'empty' });
  } catch (e) { fail(res, '/api/copilot/chat', src, e); }
  finally { clearTimeout(timer); }
});

app.use('/api', (_req, res) => res.status(404).json({ data: null, as_of: null, source_table: '', status: 'error', message: 'Unknown route' }));

const dist = path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`Lakelink Fiber Scenario Twin listening on ${PORT} (schema ${SCHEMA})`));
