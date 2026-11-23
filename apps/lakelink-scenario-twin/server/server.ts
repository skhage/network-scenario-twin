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
      pool.query(`SELECT corridor_id, MIN(days_to_exhaustion) AS days_to_exhaustion, MIN(exhaustion_date) AS exhaustion_date
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

// Input validation helpers for the wow-view routes (added in P5-APP-WOW-VIEWS)
export const RESOURCE_ID = /^[A-Z]{1,4}-\d{1,6}$/;
export const CORRIDOR_ID = /^[A-Z]{3}-[A-Z]{3}$/;
export const STATE = /^[A-Z]{2}$/;

// Copilot placeholder: explicit unavailable state until P5-TWIN-COPILOT is READY (ARCHITECTURE s4.3)
app.post('/api/copilot/chat', (_req: Request, res: Response) => {
  if (!process.env.COPILOT_ENDPOINT) {
    res.status(503).json({ data: null, as_of: null, source_table: 'copilot', status: 'empty', message: 'Copilot not yet available' });
    return;
  }
  res.status(501).json({ data: null, as_of: null, source_table: 'copilot', status: 'empty', message: 'Copilot wiring lands in P5-APP-WOW-VIEWS' });
});

app.use('/api', (_req, res) => res.status(404).json({ data: null, as_of: null, source_table: '', status: 'error', message: 'Unknown route' }));

const dist = path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`Lakelink Fiber Scenario Twin listening on ${PORT} (schema ${SCHEMA})`));
