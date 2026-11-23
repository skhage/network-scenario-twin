// Lakelink Fiber Scenario Twin - brand theme (resources/brand_guide.md v1.0). Tag: telco_project: network_scenario_twin
// Single source for tokens (s2), status semantics (s3), chart rules (s4.2) and number formats (s4.2).
import React, { useId, useState } from 'react';
import { Activity, FlaskConical, TrendingUp, CircleX, TriangleAlert, CircleCheck, ClockAlert, CircleDashed, Flag, type LucideIcon } from 'lucide-react';

export const APP_NAME = 'Lakelink Fiber Scenario Twin';
export const pageTitle = (view: string) => `${view} | ${APP_NAME}`; // brand_guide s8.10

// s2.1 core + s2.2 derived. Text uses navy / inkSecondary / primaryStrong / greenStrong only (s2.4).
export const TOKENS = {
  primary: '#FF3621', navy: '#1B3139', green: '#00A972', surface: '#F9F7F4', white: '#FFFFFF',
  primaryStrong: '#C8250F', greenStrong: '#00704C', inkSecondary: '#4A5A61', border: '#D9D4CC', inputBorder: '#6E8898',
  slate: '#6E8898', salmon: '#FF8C69',
} as const;

// s4.1 categorical order; series 1 is reserved for the headline series.
export const SERIES = [TOKENS.primary, TOKENS.navy, TOKENS.green, TOKENS.slate, TOKENS.salmon] as const;

// s4.2 corridor exhaustion chart spec (binding). Salmon is band-fill only, never a line or marker.
export const CORRIDOR_CHART = {
  observed: { stroke: TOKENS.navy, strokeWidth: 2, dash: undefined, label: 'Observed' },
  forecastP50: { stroke: TOKENS.primary, strokeWidth: 2, dash: '6 4', label: 'Forecast (P50)' },
  bandP10P90: { fill: TOKENS.salmon, fillOpacity: 0.3, label: 'P10-P90 range' },
  threshold: { stroke: TOKENS.primaryStrong, strokeWidth: 1.5, dash: '2 3', value: 95, label: '95% exhaustion threshold' },
  prebuild: { stroke: TOKENS.navy, strokeWidth: 1.5, dash: '4 4' },
  axisText: TOKENS.inkSecondary, grid: TOKENS.border,
} as const;

// s4.2 number formats.
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtDays = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'day' : 'days'}`;
export const fmtDate = (d: string) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtTs = (ts: string | null) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown';
export const fmtMoneyExact = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/month`;
export const fmtMoney = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M/month` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K/month` : `$${n.toFixed(0)}/month`;

/** Compact money with exact value available to pointer (title) and screen-reader users (s4.2). */
export function Money({ value }: { value: number }) {
  const exact = fmtMoneyExact(value);
  return <span className="num" title={exact}><span aria-hidden="true">{fmtMoney(value)}</span><span className="sr-only">{exact}</span></span>;
}

// s3 status semantics: text label + Lucide icon + badge class; never color alone (WCAG 1.4.1).
export type StatusKind = 'down' | 'degraded' | 'ok' | 'stale' | 'empty' | 'flagged';
const STATUS: Record<StatusKind, { label: string; icon: LucideIcon; cls: string }> = {
  down: { label: 'Down', icon: CircleX, cls: 'down' },
  degraded: { label: 'Degraded', icon: TriangleAlert, cls: 'degraded' },
  ok: { label: 'Healthy', icon: CircleCheck, cls: 'ok' },
  stale: { label: 'Stale', icon: ClockAlert, cls: 'stale' },
  empty: { label: 'No simulated result yet', icon: CircleDashed, cls: 'empty' },
  flagged: { label: 'Flagged', icon: Flag, cls: 'flagged' },
};
export function StatusBadge({ kind, label }: { kind: StatusKind; label?: string }) {
  const s = STATUS[kind]; const I = s.icon;
  return <span className={`badge ${s.cls}`}><I size={12} strokeWidth={1.5} aria-hidden="true" />{label ?? s.label}</span>;
}

export type ProvenanceKind = 'Observed' | 'Simulated' | 'Forecast';
export function Provenance({ kind }: { kind: ProvenanceKind }) {
  const I = kind === 'Observed' ? Activity : kind === 'Simulated' ? FlaskConical : TrendingUp;
  return <span className="badge"><I size={12} strokeWidth={1.5} aria-hidden="true" />{kind}</span>;
}

/**
 * s4.2 chart frame: white card, sentence-case title, provenance badge, text summary (s8.9),
 * and a "View as table" toggle rendering the same rows as an accessible table (WCAG 1.1.1).
 */
export interface Column<R> { key: keyof R & string; header: string; format?: (v: R[keyof R], row: R) => React.ReactNode }
export function ChartFrame<R extends Record<string, unknown>>({ title, provenance, summary, rows, columns, children }:
  { title: string; provenance: ProvenanceKind; summary: string; rows: R[]; columns: Column<R>[]; children: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (<section className="card chart-card" aria-labelledby={`${id}-t`}>
    <div className="chart-head"><h3 id={`${id}-t`}>{title}</h3><Provenance kind={provenance} />
      <span className="spacer" />
      <button type="button" className="btn-secondary" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>{asTable ? 'View as chart' : 'View as table'}</button></div>
    <p className="chart-summary">{summary}</p>
    {asTable ? <DataTable caption={title} rows={rows} columns={columns} /> : <div role="img" aria-label={summary}>{children}</div>}
  </section>);
}

/** s6 / s8.5: scrolls inside its card with a sticky first column; th scope set. */
export function DataTable<R extends Record<string, unknown>>({ caption, rows, columns }: { caption: string; rows: R[]; columns: Column<R>[] }) {
  return (<div className="table-scroll" tabIndex={0} role="region" aria-label={`${caption} (table)`}>
    <table className="data-table"><caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c, j) => { const v = c.format ? c.format(r[c.key], r) : String(r[c.key] ?? ''); return j === 0 ? <th key={c.key} scope="row">{v}</th> : <td key={c.key}>{v}</td>; })}</tr>)}</tbody>
    </table></div>);
}
