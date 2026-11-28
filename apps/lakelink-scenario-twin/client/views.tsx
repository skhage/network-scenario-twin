// Lakelink Fiber Scenario Twin - the 3 wow views (P5-APP-WOW-VIEWS) built to the binding @designer findings W1-W6
// (P5-APP-WOW-VIEW-UX-SPEC; brand_guide s1, s3, s4, s8). Tag: telco_project: network_scenario_twin.
// Read-only: every call is a GET over Lakebase nst_twin_state.twin_app (D-004, D-010). Numbers always carry a provenance badge (W1).
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CircleDashed, CircleX, ClockAlert, Download, ArrowUpDown, ArrowUp, ArrowDown, Wrench, Layers, ShieldCheck } from 'lucide-react';
import { Provenance, type ProvenanceKind, Money, StatusBadge, ChartFrame, type Column, CORRIDOR_CHART, fmtTs, fmtDate, fmtDays, fmtPct } from './theme';

// ---------- data access + required states (ARCHITECTURE s3.4) ----------
export type Status = 'ok' | 'empty' | 'stale' | 'error';
export interface Envelope<T> { data: T | null; as_of: string | null; source_table: string; status: Status; message?: string }
type ApiState<T> = { loading: boolean; env?: Envelope<T>; err?: string; code?: number };

/** Fetch one read route. Ignores late responses after the URL changes; `null` URL = idle. */
export function useApi<T>(url: string | null) {
  const [s, setS] = useState<ApiState<T>>({ loading: Boolean(url) });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) { setS({ loading: false }); return; }
    let live = true;
    const route = url.split('?')[0];
    setS({ loading: true });
    fetch(url).then(async (r) => {
      let j: Envelope<T> | null = null;
      try { j = (await r.json()) as Envelope<T>; } catch { j = null; }
      if (!live) return;
      setS(r.ok && j ? { loading: false, env: j } : { loading: false, err: j?.message || `Could not load ${route}`, code: r.status });
    }).catch(() => { if (live) setS({ loading: false, err: `Could not load ${route}` }); });
    return () => { live = false; };
  }, [url, nonce]);
  return { ...s, retry: () => setNonce((n) => n + 1) };
}

/**
 * Loading skeleton, error (+Retry, except HTTP 400 which is shown as plain text, W3) and stale banner.
 * Designer F3: loading is a role="status" live region with visually hidden text; `skeleton` lets a view match its final layout.
 * Designer F4: error copy names the data once, then the route; circle-x icon so the state is not signalled by color alone.
 */
export function StateBanner({ loading, err, code, env, retry, route, what = 'data', loadingLabel, skeleton }:
  ApiState<unknown> & { retry: () => void; route: string; what?: string; loadingLabel?: string; skeleton?: React.ReactNode }) {
  if (loading) return <div role="status" aria-busy="true">{skeleton ?? <div className="skeleton" aria-hidden="true" />}<span className="sr-only">{loadingLabel ?? `Loading ${what}`}</span></div>;
  if (err && code === 400) return <div className="banner error" role="alert"><CircleX size={16} strokeWidth={1.5} aria-hidden="true" />{err}</div>;
  if (err) return <div className="banner error" role="alert"><CircleX size={16} strokeWidth={1.5} aria-hidden="true" />Could not load {what} ({route}). <button className="btn-primary" onClick={retry}>Retry</button></div>;
  if (env?.status === 'stale') return <div className="banner" role="status"><ClockAlert size={16} strokeWidth={1.5} aria-hidden="true" />Twin data is older than 24 hours (as of {fmtTs(env.as_of)})</div>;
  return null;
}
// Designer V3 (P5-APP-WOW-STATES-COPY, brand_guide s9 Empty + s1 provenance): empty copy names the provenance of the missing data
// and offers ONE working next action: a link to the demo default when another id is shown, otherwise Retry.
export type EmptyKind = 'simulated' | 'forecast' | 'observed';
const EMPTY_COPY: Record<EmptyKind, (id: string) => string> = {
  simulated: (id) => `No simulated result for ${id} yet.`,
  forecast: (id) => `No forecast for ${id} yet.`,
  observed: (id) => `No twin data for ${id} yet.`,
};
type NextLink = { label: string; href: string; go: (p: string) => void };
export function EmptyState({ kind, id, next, retry }: { kind: EmptyKind; id: string; next?: NextLink; retry?: () => void }) {
  return <p className="secondary empty-state"><CircleDashed size={16} strokeWidth={1.5} aria-hidden="true" />{EMPTY_COPY[kind](id)}{' '}
    {next ? <a className="link" href={next.href} onClick={(e) => { e.preventDefault(); next.go(next.href); }}>{next.label}</a>
      : retry ? <button type="button" className="btn-secondary" onClick={retry}>Retry</button> : null}</p>;
}
/** Link to the demo default (e.g. 'Open S-4471') only when a different id is on screen. */
const nextOr = (cur: string, def: string, base: string, go: (p: string) => void): NextLink | undefined =>
  cur !== def ? { label: `Open ${def}`, href: `${base}/${encodeURIComponent(def)}`, go } : undefined;

// Designer V5 (s9 Loading): skeletons match each view's final layout.
const SkKpis = ({ n = 5 }: { n?: number }) => <div className="kpis">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton sk-kpi" />)}</div>;
const SkTable = ({ rows = 0 }: { rows?: number }) => rows
  ? <div className="sk-table-rows">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton sk-row" />)}</div>
  : <div className="skeleton sk-table" />;
const SkHero = () => <div className="skeleton sk-hero" />;
const SkChart = () => <div className="skeleton sk-chart" />;
const SkList = () => <div className="skeleton sk-list" />;
const ready = (s: ApiState<unknown>) => !s.loading && !s.err;

// ---------- W5 sortable, exportable table (th scope, aria-sort, tabular-nums) ----------
export interface SortCol<R> { key: keyof R & string; header: string; numeric?: boolean; render?: (row: R) => React.ReactNode }
const csvCell = (v: unknown) => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
export function SortableTable<R extends Record<string, unknown>>({ caption, rows, columns, initial = null, exportName }:
  { caption: string; rows: R[]; columns: SortCol<R>[]; initial?: { key: string; dir: 'ascending' | 'descending' } | null; exportName?: string }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      const o = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
      return sort.dir === 'ascending' ? o : -o;
    });
  }, [rows, sort]);
  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: 'ascending' }));
  const download = () => {
    const lines = [columns.map((c) => csvCell(c.header)).join(','), ...sorted.map((r) => columns.map((c) => csvCell(r[c.key])).join(','))];
    const href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = href; a.download = `${exportName}.csv`; a.click(); URL.revokeObjectURL(href);
  };
  const sortedBy = sort ? `, sorted by ${columns.find((c) => c.key === sort.key)?.header} ${sort.dir}` : '';
  return (<div>
    {exportName && <div className="table-tools"><button type="button" className="btn-secondary" onClick={download}><Download size={16} strokeWidth={1.5} aria-hidden="true" /> Download CSV</button></div>}
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${caption} (table)`}>
      <table className="data-table"><caption className="sr-only">{caption}{sortedBy}</caption>
        <thead><tr>{columns.map((c) => {
          const dir = sort?.key === c.key ? sort.dir : undefined;
          const I = dir === 'ascending' ? ArrowUp : dir === 'descending' ? ArrowDown : ArrowUpDown;
          return <th key={c.key} scope="col" aria-sort={dir ?? 'none'} className={c.numeric ? 'num-col' : undefined}>
            <button type="button" className="sort-btn" onClick={() => toggle(c.key)}>{c.header}<I size={14} strokeWidth={1.5} aria-hidden="true" /></button></th>;
        })}</tr></thead>
        <tbody>{sorted.map((r, i) => <tr key={i}>{columns.map((c, j) => {
          const v = c.render ? c.render(r) : String(r[c.key] ?? '');
          const cls = c.numeric ? 'num-col' : undefined;
          return j === 0 ? <th key={c.key} scope="row" className={cls}>{v}</th> : <td key={c.key} className={cls}>{v}</td>;
        })}</tr>)}</tbody>
      </table></div></div>);
}

function Kpi({ label, value, kind }: { label: string; value: React.ReactNode; kind: ProvenanceKind }) {
  return <div className="card kpi"><div className="kpi-head"><span className="kpi-label">{label}</span><Provenance kind={kind} /></div><div className="kpi-value num">{value}</div></div>;
}
const int = (n: number) => Number(n).toLocaleString('en-US');
const daysUntil = (d: string) => Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86_400_000);

// ---------- W3 resource picker: ARIA combobox with a visible label ----------
const RESOURCE_ID = /^[A-Z]{1,4}-\d{1,6}$/;
type ResOpt = { resource_id: string; resource_type: string; corridor_id: string | null };
function ResourcePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  useEffect(() => { setText(value); setError(''); }, [value]);
  const q = text.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const opts = useApi<ResOpt[]>(open && q ? `/api/resources?q=${encodeURIComponent(q)}` : null);
  const list = opts.env?.data ?? [];
  const shown = open && list.length > 0;
  const commit = (v: string) => {
    const t = v.trim().toUpperCase();
    if (!RESOURCE_ID.test(t)) { setError('Resource ID must look like S-4471'); return; }
    setError(''); setOpen(false); onPick(t);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(shown && active >= 0 && list[active] ? list[active].resource_id : text); }
    else if (e.key === 'Escape' && shown) { e.stopPropagation(); setOpen(false); }
  };
  return (<div className="picker">
    <label htmlFor={`${id}-in`} className="field-label">Resource ID</label>
    <div className="combo">
      <input id={`${id}-in`} className="input" role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={`${id}-lb`}
        aria-activedescendant={shown && active >= 0 ? `${id}-o${active}` : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : `${id}-hint`}
        value={text} autoComplete="off" spellCheck={false} onKeyDown={onKey} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); setError(''); }} />
      <button type="button" className="btn-secondary" onClick={() => commit(text)}>Show impact</button>
      <ul id={`${id}-lb`} role="listbox" className="listbox" aria-label="Matching resources" hidden={!shown}>
        {list.map((o, i) => <li key={o.resource_id} id={`${id}-o${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); commit(o.resource_id); }}>
          {o.resource_id} <span className="secondary">{o.resource_type}{o.corridor_id ? `, ${o.corridor_id}` : ''}</span></li>)}
      </ul>
    </div>
    {error ? <p id={`${id}-err`} className="field-error" role="alert">{error}</p> : <p id={`${id}-hint`} className="secondary">Type a span or resource ID, for example S-4471.</p>}
  </div>);
}

// ---------- Wow 1: /blast-radius/:resourceId (section 11.5 query 1) ----------
// W2: plain-language model labels; raw model ids never shown.
const MODEL_LABEL: Record<string, string> = { srlg_graph_v1: 'SRLG-aware (champion)', path_only_v1: 'Path-only (SRLG-blind)' };
type BlastResult = { sim_id: string; model_name: string; affected_services: number; affected_customers: number; degraded_services: number; dual_path_both_failed: number; sla_exposure_mrr: number; degraded_mrr: number; srlg_expanded_resource_ids: string[] | null; simulated_at: string };
type Blast = { result: BlastResult | null; available_models: string[]; resource: { resource_id: string; resource_type: string; corridor_id: string | null; srlg: string | null } | null };
type Impact = { customer_id: string; customer: string; segment: string | null; failure_state: 'DOWN' | 'DEGRADED'; sla_exposure_mrr: number };
type Mw = { window_id: string; start_ts: string; end_ts: string; status: string; work_type: string };

export function BlastRadiusView({ id, go }: { id: string; go: (p: string) => void }) {
  const rid = id || 'S-4471';
  const [model, setModel] = useState('srlg_graph_v1');
  const base = `/api/blast-radius/${encodeURIComponent(rid)}`;
  const b = useApi<Blast>(`${base}?model=${model}`);
  const c = useApi<Impact[]>(`${base}/customers?model=${model}`);
  const m = useApi<Mw[]>(`${base}/maintenance`);
  const d = b.env?.data; const r = d?.result; const avail = d?.available_models ?? [];
  const rows = c.env?.data ?? [];
  const down = rows.filter((x) => x.failure_state === 'DOWN').length;
  const others = (r?.srlg_expanded_resource_ids ?? []).filter((x) => x !== rid);
  const windows = m.env?.data ?? [];
  return (<>
    <h1>Blast radius: {rid}</h1>
    <p className="secondary">What breaks if {rid} fails{d?.resource ? ` (${d.resource.resource_type}${d.resource.corridor_id ? ` on ${d.resource.corridor_id}` : ''})` : ''}. These results are simulated by the twin. They are not observed outages.</p>
    <div className="toolbar">
      <ResourcePicker value={rid} onPick={(n) => go(`/blast-radius/${encodeURIComponent(n)}`)} />
      <fieldset className="segmented"><legend className="field-label">Simulation model</legend>
        {Object.entries(MODEL_LABEL).map(([k, label]) => { const off = Boolean(d) && !avail.includes(k); return (
          <label key={k} className={`seg${model === k ? ' on' : ''}${off ? ' off' : ''}`}>
            <input type="radio" name="blast-model" value={k} checked={model === k} disabled={off} onChange={() => setModel(k)} />{label}</label>); })}
        {d && !avail.includes('path_only_v1') && <p className="secondary">Path-only (SRLG-blind) results for {rid} are not published yet, so the comparison is not available.</p>}
      </fieldset>
    </div>
    <div aria-live="polite" className="sr-only">{ready(c) && rows.length ? `${MODEL_LABEL[model]}: ${down} customers down, ${rows.length - down} degraded.` : ''}</div>
    <StateBanner {...b} route="/api/blast-radius" what="blast radius results" skeleton={<><SkKpis /><SkTable /></>} />
    {ready(b) && (!r ? <div className="card section-gap"><EmptyState kind="simulated" id={rid} next={nextOr(rid, 'S-4471', '/blast-radius', go)} retry={b.retry} /></div> : <>
      <section className="kpis" aria-label="Blast radius KPIs">
        <Kpi label="Affected services" value={int(r.affected_services)} kind="Simulated" />
        <Kpi label="Affected customers" value={int(r.affected_customers)} kind="Simulated" />
        <Kpi label="Dual Path customers losing both paths" value={<span className="headline">{int(r.dual_path_both_failed)}</span>} kind="Simulated" />
        <Kpi label="SLA exposure" value={<Money value={r.sla_exposure_mrr} />} kind="Simulated" />
        <Kpi label="Degraded MRR" value={<Money value={r.degraded_mrr} />} kind="Simulated" />
      </section>
      {others.length > 0 && <div className="card callout" role="note"><Layers size={20} strokeWidth={1.5} aria-hidden="true" />
        <p><strong>{[rid, ...others].join(' and ')} share {d?.resource?.srlg ?? 'one shared-risk link group'}.</strong> They are sold as diverse paths, but one conduit event takes down both.</p></div>}
      <div className="card callout neutral" role="note"><Wrench size={20} strokeWidth={1.5} aria-hidden="true" />
        {m.loading ? <p className="secondary" role="status">Loading maintenance windows</p>
          : m.err ? <div className="empty-state" role="alert"><CircleX size={16} strokeWidth={1.5} aria-hidden="true" />Could not load maintenance windows (/api/blast-radius/maintenance). <button type="button" className="btn-primary" onClick={m.retry}>Retry</button></div>
          : windows.length ? <p>Maintenance {windows[0].window_id} ({windows[0].work_type}, {windows[0].status}) runs {fmtTs(windows[0].start_ts)} to {fmtTs(windows[0].end_ts)}. A failure during this window carries the simulated SLA exposure of <Money value={r.sla_exposure_mrr} />. <Provenance kind="Simulated" /></p>
          : <p className="secondary">No maintenance windows are scheduled on {rid}.</p>}
      </div>
    </>)}
    <section className="card section-gap" aria-labelledby="cust-h">
      <div className="chart-head"><h2 id="cust-h">Customer impact</h2><Provenance kind="Simulated" /><span className="secondary">{MODEL_LABEL[model]}</span></div>
      <StateBanner {...c} route="/api/blast-radius/customers" what="customer impact" skeleton={<SkTable />} />
      {ready(c) && (rows.length
        ? <SortableTable caption={`Customer impact if ${rid} fails, ${MODEL_LABEL[model]}`} rows={rows} exportName={`lakelink-fiber-blast-radius-${rid}`}
            initial={{ key: 'sla_exposure_mrr', dir: 'descending' }} columns={[
              { key: 'customer', header: 'Customer' },
              { key: 'segment', header: 'Segment' },
              { key: 'failure_state', header: 'State', render: (x) => <StatusBadge kind={x.failure_state === 'DOWN' ? 'down' : 'degraded'} /> },
              { key: 'sla_exposure_mrr', header: 'SLA exposure', numeric: true, render: (x) => <Money value={x.sla_exposure_mrr} /> },
            ]} />
        : <EmptyState kind="simulated" id={rid} next={nextOr(rid, 'S-4471', '/blast-radius', go)} retry={c.retry} />)}
    </section>
  </>);
}

// ---------- Wow 2: /corridors/:corridorId (section 11.5 query 2), chart per brand_guide s4.2 (W4) ----------
type Fc = { month: string; p50: number; p10: number; p90: number; exhaustion_date: string | null; exhaustion_date_p10: string | null; exhaustion_date_p90: string | null; days_to_exhaustion: number | null; threshold_pct: number; prebuild_trigger_date: string | null; model_name: string; model_version: string };
type Act = { util_date: string; util_mean_pct: number; util_p95_pct: number };
type Cor = { corridor_id: string; corridor_name: string | null; days_to_exhaustion: number; exhaustion_date: string };
type ChartRow = { date: string; series: string; p50: string; p10: string; p90: string };
const utc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const monthLabel = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

// P5-APP-WOW-REFLOW-320 V2 (WCAG 1.4.4): render the SVG at its real container width so text is never scaled below 12px.
function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { const cw = Math.floor(el.getBoundingClientRect().width); if (cw > 0) setW(cw); };
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function CorridorChart({ act, fc }: { act: Act[]; fc: Fc[] }) {
  const [box, W] = useWidth<HTMLDivElement>(800);
  // P5-APP-WOW-CHART-RULES V7 + P5-APP-CHART-LABEL-FIT: room for axis titles (left/bottom) and a right pad of half the widest tick.
  const H = 340, P = { l: 64, r: 32, t: 24, b: 52 };
  const xs_ = W < 480, narrow = W < 600; const tickStep = xs_ ? 6 : narrow ? 4 : 2;
  const tickText = (ms: number) => narrow ? shortMonth(ms) : monthLabel(ms);
  const xs = [...act.map((a) => utc(a.util_date)), ...fc.map((f) => utc(f.month))];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const thr = fc[0]?.threshold_pct ?? CORRIDOR_CHART.threshold.value;
  const lo = Math.min(...act.map((a) => a.util_mean_pct), ...fc.map((f) => f.p10));
  const hi = Math.max(...act.map((a) => a.util_mean_pct), ...fc.map((f) => f.p90), thr);
  const y0 = Math.max(0, Math.floor((lo - 5) / 10) * 10), y1 = Math.ceil((hi + 2) / 10) * 10;
  const X = (ms: number) => P.l + ((ms - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const Y = (v: number) => H - P.b - ((v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = act[act.length - 1];
  const obs = path(act.map((a) => [X(utc(a.util_date)), Y(a.util_mean_pct)]));
  const p50 = path([...(last ? [[X(utc(last.util_date)), Y(last.util_mean_pct)] as [number, number]] : []), ...fc.map((f) => [X(utc(f.month)), Y(f.p50)] as [number, number])]);
  const band = fc.length ? `${path(fc.map((f) => [X(utc(f.month)), Y(f.p90)]))}${[...fc].reverse().map((f) => `L${X(utc(f.month)).toFixed(1)},${Y(f.p10).toFixed(1)}`).join('')}Z` : '';
  const yTicks: number[] = []; for (let v = y0; v <= y1; v += 10) yTicks.push(v);
  const xTicks: number[] = []; const t = new Date(x0); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + 1);
  for (; t.getTime() <= x1; t.setUTCMonth(t.getUTCMonth() + tickStep)) xTicks.push(t.getTime());
  // LABEL-FIT (1)+(3): anchor each tick so its box stays inside [0, W]; drop any tick that would overlap the previous one.
  const ticks: { ms: number; x: number; anchor: 'start' | 'middle' | 'end'; label: string }[] = [];
  let prevRight = -Infinity;
  for (const ms of xTicks) {
    const label = tickText(ms), w = textW(label, 12), x = X(ms);
    const anchor = x + w / 2 > W - 2 ? 'end' : x - w / 2 < 2 ? 'start' : 'middle';
    const left = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    if (left < prevRight + 8) continue;
    ticks.push({ ms, x, anchor, label }); prevRight = left + w;
  }
  const pb = fc[0]?.prebuild_trigger_date; const pbIn = pb && utc(pb) >= x0 && utc(pb) <= x1;
  // LABEL-FIT (2): clamp the pre-build label inside [P.l, W-P.r]; if it cannot fit the plot (below 480px), it moves to the legend.
  const pbLabel = pb ? `Pre-build trigger ${fmtDate(pb)}` : ''; const pbW = textW(pbLabel, 14, 500);
  const pbFits = pbIn && pbW <= W - P.l - P.r;
  const pbX = pbIn ? X(utc(pb!)) : 0; const pbFlip = pbX > W / 2;
  const pbTx = pbFlip ? Math.max(P.l + pbW, pbX - 6) : Math.min(W - P.r - pbW, pbX + 6);
  // V7 direct end labels (more than hue): 'Observed' at last actual point (navy), 'Forecast (P50)' at last forecast point (#C8250F text, s2.4).
  const lastFc = fc[fc.length - 1];
  const obsLbl = CORRIDOR_CHART.observed.label, fcLbl = CORRIDOR_CHART.forecastP50.label;
  const obsX = last ? Math.max(P.l + textW(obsLbl, 14, 500), X(utc(last.util_date)) - 6) : 0, obsY = last ? Math.max(P.t + 14, Y(last.util_mean_pct) - 10) : 0;
  const fcX = W - P.r, fcYRaw = lastFc ? Y(lastFc.p50) - 10 : 0;
  // keep the forecast end label and the threshold label from colliding: move the threshold label under its line when close.
  const thrBelow = lastFc ? Math.abs(fcYRaw - (Y(thr) - 6)) < 18 : false;
  const fcY = Math.max(P.t + 14, fcYRaw);
  const C = CORRIDOR_CHART;
  return (<div ref={box} className="chart-box"><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart-svg" aria-hidden="true" focusable="false">
    {yTicks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke={C.grid} strokeWidth={1} /><text x={P.l - 8} y={Y(v) + 4} textAnchor="end">{v}%</text></g>)}
    {ticks.map((k) => <text key={k.ms} x={k.x} y={H - P.b + 18} textAnchor={k.anchor}>{k.label}</text>)}
    <text className="chart-axis-title" x={P.l + (W - P.l - P.r) / 2} y={H - 8} textAnchor="middle">Month</text>
    <text className="chart-axis-title" x={16} y={P.t + (H - P.t - P.b) / 2} textAnchor="middle" transform={`rotate(-90 16 ${P.t + (H - P.t - P.b) / 2})`}>Utilization (%)</text>
    {band && <path d={band} fill={C.bandP10P90.fill} fillOpacity={C.bandP10P90.fillOpacity} />}
    <path d={obs} fill="none" stroke={C.observed.stroke} strokeWidth={C.observed.strokeWidth} />
    <path d={p50} fill="none" stroke={C.forecastP50.stroke} strokeWidth={C.forecastP50.strokeWidth} strokeDasharray={C.forecastP50.dash} />
    <line x1={P.l} x2={W - P.r} y1={Y(thr)} y2={Y(thr)} stroke={C.threshold.stroke} strokeWidth={C.threshold.strokeWidth} strokeDasharray={C.threshold.dash} />
    <text className="chart-key-label" x={W - P.r} y={thrBelow ? Y(thr) + 18 : Y(thr) - 6} textAnchor="end">{xs_ ? `${thr}% threshold` : `${thr}% exhaustion threshold`}</text>
    {pbIn && <g><line x1={pbX} x2={pbX} y1={P.t} y2={H - P.b} stroke={C.prebuild.stroke} strokeWidth={C.prebuild.strokeWidth} strokeDasharray={C.prebuild.dash} />
      {pbFits && <text className="chart-key-label" x={pbTx} y={P.t + 4} textAnchor={pbFlip ? 'end' : 'start'}>{pbLabel}</text>}</g>}
    {last && <text className="chart-key-label" x={obsX} y={obsY} textAnchor="end">{obsLbl}</text>}
    {lastFc && <text className="chart-key-label chart-end-forecast" x={fcX} y={fcY} textAnchor="end">{fcLbl}</text>}
  </svg></div>);
}
// Text width estimate for Inter (avg advance ~0.56em regular, ~0.6em medium); used only for clamping/overlap tests.
const textW = (s: string, px: number, weight = 400) => s.length * px * (weight >= 500 ? 0.6 : 0.56);
const shortMonth = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }); // 'Sep 26' (LABEL-FIT s4.2)
function Legend({ prebuild }: { prebuild?: string | null }) {
  const C = CORRIDOR_CHART;
  const sw = (stroke: string, dash?: string) => <svg width="24" height="8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" stroke={stroke} strokeWidth={2} strokeDasharray={dash} /></svg>;
  return (<ul className="legend" aria-label="Chart legend">
    <li>{sw(C.observed.stroke)}{C.observed.label}</li>
    <li>{sw(C.forecastP50.stroke, C.forecastP50.dash)}{C.forecastP50.label}</li>
    <li><svg width="24" height="12" aria-hidden="true"><rect width="24" height="12" fill={C.bandP10P90.fill} fillOpacity={C.bandP10P90.fillOpacity} /></svg>{C.bandP10P90.label}</li>
    <li>{sw(C.threshold.stroke, C.threshold.dash)}{C.threshold.label}</li>
    <li>{sw(C.prebuild.stroke, C.prebuild.dash)}{prebuild ? `Pre-build trigger (${fmtDate(prebuild)})` : 'Pre-build trigger'}</li>
  </ul>);
}

export function CorridorView({ id, go }: { id: string; go: (p: string) => void }) {
  const cid = id || 'DEN-SLC';
  const f = useApi<Fc[]>(`/api/corridors/${encodeURIComponent(cid)}/forecast`);
  const a = useApi<Act[]>(`/api/corridors/${encodeURIComponent(cid)}/actuals`);
  const l = useApi<Cor[]>('/api/corridors?exhausting_within_days=180');
  const fc = f.env?.data ?? []; const act = a.env?.data ?? []; const h = fc[0]; const list = l.env?.data ?? [];
  const pbDays = h?.prebuild_trigger_date ? daysUntil(h.prebuild_trigger_date) : null;
  const passed = pbDays != null && pbDays < 0; const overdue = passed ? -pbDays! : 0;
  // V9 / s8.9: days for the P10-P90 exhaustion range, derived from the data (offset of each bound from the P50 date).
  const dayDiff = (a: string, b: string) => Math.round((utc(a.slice(0, 10)) - utc(b.slice(0, 10))) / 86_400_000);
  const rangeDays = h?.days_to_exhaustion != null && h.exhaustion_date && h.exhaustion_date_p10 && h.exhaustion_date_p90
    ? [h.exhaustion_date_p10, h.exhaustion_date_p90].map((d) => h.days_to_exhaustion! + dayDiff(d, h.exhaustion_date!)).sort((x, y) => x - y) : null;
  const first = act[0], last = act[act.length - 1];
  // Designer V6: never print 'Invalid Date' when a P10/P90 bound is missing.
  const range = h?.exhaustion_date_p10 && h?.exhaustion_date_p90 ? `${fmtDate(h.exhaustion_date_p10)} to ${fmtDate(h.exhaustion_date_p90)}` : null;
  const summary = h && first && last
    ? `${cid} observed mean utilization ${last.util_mean_pct >= first.util_mean_pct ? 'rose' : 'fell'} from ${fmtPct(first.util_mean_pct)} to ${fmtPct(last.util_mean_pct)} over the last 90 days. `
      + (h.exhaustion_date
        ? `${cid} reaches ${h.threshold_pct}% on ${fmtDate(h.exhaustion_date)}${h.days_to_exhaustion != null ? `, in ${fmtDays(h.days_to_exhaustion)}` : ''} (${rangeDays ? `P10-P90: ${rangeDays[0]} to ${rangeDays[1]} days` : 'P10-P90 range not available'}).`
        : 'The forecast does not cross the exhaustion threshold in the next 12 months.')
      + (passed ? ` Build start overdue by ${fmtDays(overdue)}: the pre-build trigger was ${fmtDate(h.prebuild_trigger_date!)}.` : '')
    : '';
  const rows: ChartRow[] = [
    ...act.map((x) => ({ date: fmtDate(x.util_date), series: 'Observed', p50: fmtPct(x.util_mean_pct), p10: '', p90: '' })),
    ...fc.map((x) => ({ date: monthLabel(utc(x.month)), series: 'Forecast', p50: fmtPct(x.p50), p10: fmtPct(x.p10), p90: fmtPct(x.p90) })),
  ];
  const cols: Column<ChartRow>[] = [{ key: 'date', header: 'Date' }, { key: 'series', header: 'Series' }, { key: 'p50', header: 'Utilization (mean or P50)' }, { key: 'p10', header: 'P10' }, { key: 'p90', header: 'P90' }];
  return (<>
    <h1>Corridor exhaustion: {cid}</h1>
    <p className="secondary">When this corridor runs out of capacity, and when the build has to start to get ahead of it.</p>
    <StateBanner {...f} route="/api/corridors/forecast" what="corridor forecast" skeleton={<><SkHero /><div className="corridor-grid"><SkChart /><SkList /></div></>} />
    {ready(f) && (!h ? <div className="card"><EmptyState kind="forecast" id={cid} next={nextOr(cid, 'DEN-SLC', '/corridors', go)} retry={f.retry} /></div> : <>
      <section className="card" aria-labelledby="cd-h">
        <div className="chart-head"><h2 id="cd-h">Days to exhaustion (P50)</h2><Provenance kind="Forecast" /></div>
        {/* W4: Display 40/700 is the only size allowed for #FF3621 text; static value, no ticking animation. */}
        <div className="hero-row"><div className="headline">{h.days_to_exhaustion != null ? fmtDays(h.days_to_exhaustion) : 'Not within 12 months'}</div>
          {/* V9: lead with the consequence; icon + text + fill, never color alone (s3). */}
          {passed && <StatusBadge kind="degraded" label={`Build start overdue by ${fmtDays(overdue)}`} />}</div>
        {h.exhaustion_date && <dl className="facts">
          <div><dt>Exhaustion date (P50)</dt><dd>{fmtDate(h.exhaustion_date)}</dd></div>
          <div><dt>P10-P90 range</dt><dd>{range ?? 'Range not available'}</dd></div>
          <div><dt>Pre-build trigger</dt><dd>{h.prebuild_trigger_date ? fmtDate(h.prebuild_trigger_date) : 'Not available'}</dd></div>
        </dl>}
        <p className="secondary">The pre-build trigger is the exhaustion date minus the 180-day build lead time.</p>
      </section>
      <div className="corridor-grid">
        <div>
          <StateBanner {...a} route="/api/corridors/actuals" what="corridor utilization" skeleton={<SkChart />} />
          {ready(a) && <ChartFrame title={`${cid} utilization: 90 days observed, 12 months forecast`} provenance={['Observed', 'Forecast']} summary={summary} rows={rows} columns={cols}>
            <CorridorChart act={act} fc={fc} /><Legend prebuild={h.prebuild_trigger_date} />
          </ChartFrame>}
        </div>
        <section className="card" aria-labelledby="cl-h">
          <div className="chart-head"><h2 id="cl-h">Exhausting within 6 months</h2><Provenance kind="Forecast" /></div>
          <StateBanner {...l} route="/api/corridors" what="corridor list" skeleton={<SkList />} />
          {ready(l) && (list.length ? <ul className="plain-list">{list.map((c) => <li key={c.corridor_id}>
            <a className="link" href={`/corridors/${c.corridor_id}`} aria-current={c.corridor_id === cid ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(`/corridors/${c.corridor_id}`); }}>{c.corridor_name ?? c.corridor_id}</a>
            <div className="secondary num">{fmtDays(c.days_to_exhaustion)}, {fmtDate(c.exhaustion_date)}</div></li>)}</ul>
            : <p className="secondary">No corridor is forecast to exhaust within 6 months.</p>)}
        </section>
      </div>
    </>)}
  </>);
}

// ---------- Wow 3: /copper/:state (section 11.5 query 3) ----------
type Wc = { rank: number; wc_id: string; wc_name: string; decommission_target: string; high_value_customers: number; active_circuits: number; copper_miles: number; readiness_score: number; flagged: boolean };
type Hv = { wc_id: string; name: string; segment: string | null };

export function CopperView({ id, go }: { id: string; go: (p: string) => void }) {
  const st = id || 'IA';
  const s = useApi<{ wire_centers: Wc[]; high_value_customers: Hv[] }>(`/api/copper/${encodeURIComponent(st)}`);
  const wcs = s.env?.data?.wire_centers ?? []; const hv = s.env?.data?.high_value_customers ?? [];
  const flagged = wcs.filter((w) => w.flagged);
  return (<>
    <h1>Copper sequencing: {st}</h1>
    <p className="secondary">Wire centers in decommissioning order: target date, then high-value customers, active circuits, and copper miles. A row is flagged when it retires before Jun 1, 2027 with high-value customers still on copper.</p>
    <StateBanner {...s} route="/api/copper" what="copper queue" skeleton={<SkTable rows={8} />} />
    {ready(s) && (!wcs.length ? <div className="card"><EmptyState kind="observed" id={st} next={nextOr(st, 'IA', '/copper', go)} retry={s.retry} /></div> : <>
      <section className="card" aria-labelledby="cq-h">
        <div className="chart-head"><h2 id="cq-h">Decommissioning queue</h2><Provenance kind="Observed" /><span className="secondary">{flagged.length} of {wcs.length} flagged</span></div>
        <SortableTable caption={`Copper decommissioning queue for ${st}`} rows={wcs} exportName={`lakelink-fiber-copper-queue-${st}`} columns={[
          { key: 'rank', header: 'Rank', numeric: true },
          { key: 'wc_name', header: 'Wire center' },
          { key: 'decommission_target', header: 'Decommission target', render: (w) => fmtDate(w.decommission_target) },
          { key: 'high_value_customers', header: 'High-value customers', numeric: true, render: (w) => int(w.high_value_customers) },
          { key: 'active_circuits', header: 'Active circuits', numeric: true, render: (w) => int(w.active_circuits) },
          { key: 'copper_miles', header: 'Copper miles', numeric: true, render: (w) => w.copper_miles.toFixed(1) },
          { key: 'readiness_score', header: 'Readiness score', numeric: true, render: (w) => w.readiness_score.toFixed(1) },
          { key: 'flagged', header: 'Status', render: (w) => w.flagged
            ? <><StatusBadge kind="flagged" /> Migrate {w.high_value_customers} high-value customers before retirement</>
            : <span className="secondary">Not flagged</span> },
        ]} />
      </section>
      {flagged.length > 0 && <div className="wc-detail">{flagged.map((w) => { const left = daysUntil(w.decommission_target); const names = hv.filter((c) => c.wc_id === w.wc_id); return (
        <section key={w.wc_id} className="card" aria-labelledby={`wc-${w.wc_id}`}>
          <div className="chart-head"><h2 id={`wc-${w.wc_id}`}>{w.wc_name}</h2><StatusBadge kind="flagged" /></div>
          <div className="headline">{left >= 0 ? fmtDays(left) : 'Target passed'}</div>
          <p className="secondary">until the decommission target of {fmtDate(w.decommission_target)} <Provenance kind="Observed" /></p>
          <h3>High-value customers to migrate</h3>
          {names.length ? <ul className="plain-list">{names.map((c) => <li key={c.name}>{c.name}{c.segment ? <span className="secondary"> ({c.segment})</span> : null}</li>)}</ul>
            : <p className="secondary">The customer list for {w.wc_id} is not in the twin yet.</p>}
          <p className="callout-note"><ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" /> Moving these customers to fiber before cutover protects their recurring revenue and the proceeds from retiring this copper.</p>
        </section>); })}</div>}
    </>)}
  </>);
}
