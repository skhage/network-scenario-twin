// Lakelink Fiber Scenario Twin - client shell (React + TypeScript). Tag: telco_project: network_scenario_twin
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Network, Gauge, Cable, LayoutDashboard, MessageSquare, Menu, X, ClockAlert, CircleDashed } from 'lucide-react';
import { APP_NAME as APP, pageTitle, Provenance, Money, fmtTs, fmtDate, fmtDays } from './theme';
import { useApi, StateBanner, BlastRadiusView, CorridorView, CopperView } from './views';
import { parseSse } from '../server/lib';
import './styles.css';

const ROUTES = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/blast-radius/S-4471', label: 'Blast radius', icon: Network },
  { path: '/corridors/DEN-SLC', label: 'Corridor exhaustion', icon: Gauge },
  { path: '/copper/IA', label: 'Copper sequencing', icon: Cable },
] as const;

// P5-APP-A11Y-SHELL (P0-UX-ARCH-REVIEW c/d): overlays (<=1023px) trap focus; Esc closes and returns focus to the opener.
const OVERLAY_MQ = '(max-width: 1023px)';
function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
function useOverlayFocus(open: boolean, ref: React.RefObject<HTMLElement>, opener: React.RefObject<HTMLElement>, close: () => void, trap: boolean) {
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); opener.current?.focus(); return; }
      if (!trap || e.key !== 'Tab' || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [open, trap]);
}

function usePath(): [string, (p: string) => void] {
  const [p, setP] = useState(window.location.pathname);
  useEffect(() => { const h = () => setP(window.location.pathname); window.addEventListener('popstate', h); return () => window.removeEventListener('popstate', h); }, []);
  return [p, (n: string) => { window.history.pushState({}, '', n); setP(n); }];
}
// useApi + StateBanner (loading / empty / error / stale, ARCHITECTURE s3.4) live in ./views and are shared by every view.

interface Overview { blast: { resource_id: string; dual_path_both_failed: number; sla_exposure_mrr: number } | null; corridor: { corridor_id: string; days_to_exhaustion: number; exhaustion_date: string } | null; copper: { flagged: number; total: number } | null }

function OverviewView({ go }: { go: (p: string) => void }) {
  const s = useApi<Overview>('/api/overview');
  const d = s.env?.data;
  // Designer F2: provenance-specific empty copy plus a working next action (Retry); the card's Open link stays below.
  const Empty = ({ msg }: { msg: string }) => <p className="secondary empty-state"><CircleDashed size={16} strokeWidth={1.5} aria-hidden="true" /> {msg} <button type="button" className="btn-secondary" onClick={s.retry}>Retry</button></p>;
  // Designer F3: skeleton matches the final layout (3 story cards in the .stories grid).
  const skeleton = <div className="stories" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="card skeleton story-skeleton" />)}</div>;
  return (<>
    <h1>Overview</h1>
    <p className="secondary">Intelligence layer above the inventory system of record.</p>
    <StateBanner {...s} route="/api/overview" what="overview data" loadingLabel="Loading overview" skeleton={skeleton} />
    {!s.loading && !s.err && <section className="stories" aria-label="Key network scenarios">
      <article className="card"><h2>Blast radius: S-4471</h2><Provenance kind="Simulated" />
        {d?.blast ? <><div className="headline">{d.blast.dual_path_both_failed}</div><p>Dual Path customers lose both paths if S-4471 fails (SRLG-88). SLA exposure <Money value={d.blast.sla_exposure_mrr} />.</p></> : <Empty msg="No simulated result for S-4471 yet." />}
        <a className="link" href="/blast-radius/S-4471" onClick={(e) => { e.preventDefault(); go('/blast-radius/S-4471'); }}>Open blast radius</a></article>
      <article className="card"><h2>Corridor exhaustion: DEN-SLC</h2><Provenance kind="Forecast" />
        {d?.corridor ? <><div className="headline">{fmtDays(d.corridor.days_to_exhaustion)}</div><p>DEN-SLC reaches the 95% exhaustion threshold on {fmtDate(d.corridor.exhaustion_date)} (P50).</p></> : <Empty msg="No forecast for DEN-SLC yet." />}
        <a className="link" href="/corridors/DEN-SLC" onClick={(e) => { e.preventDefault(); go('/corridors/DEN-SLC'); }}>Open corridor countdown</a></article>
      <article className="card"><h2>Copper sequencing: Iowa</h2><Provenance kind="Observed" />
        {d?.copper ? <><div className="headline">{d.copper.flagged} of {d.copper.total}</div><p>Iowa wire centers have high-value customers to migrate before Jun 1, 2027.</p></> : <Empty msg="No twin data for IA yet." />}
        <a className="link" href="/copper/IA" onClick={(e) => { e.preventDefault(); go('/copper/IA'); }}>Open copper queue</a></article>
    </section>}
  </>);
}

// Lakelink Fiber Splice drawer (D-013). SSE from /api/assistant/chat: one bubble per assistant message in endpoint order
// (the early read-only / Lakelink-Fiber-only notice comes first), citation chips per twin tool, "Genie mode" label on fallback.
// Text is rendered as plain text (no HTML injection).
interface Cite { tool: string; label: string; route: string | null }
interface ChatTurn { role: 'user' | 'assistant'; content: string; cites?: Cite[] }
const SAMPLE_PROMPTS = ['What is the blast radius if span S-4471 fails?', 'When does DEN-SLC reach exhaustion?', 'Which Iowa wire center should we retire first?'];
function SpliceChat({ go }: { go: (p: string) => void }) {
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'splice' | 'genie'>('splice');
  const ask = async (message: string) => {
    if (!message || busy) return;
    const history = log.slice(-10).map(({ role, content }) => ({ role, content }));
    setLog((l) => [...l, { role: 'user', content: message }]); setText(''); setBusy(true); setErr(null);
    let got = 0;
    try {
      const r = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message, history }) });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => null) as { message?: string } | null; setErr(j?.message || 'Could not reach Lakelink Fiber Splice'); return; }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        const p = parseSse(buf + dec.decode(value, { stream: true })); buf = p.rest;
        for (const ev of p.events) {
          const d = ev.data as Record<string, unknown>;
          if (ev.event === 'meta' && (d?.mode === 'genie' || d?.mode === 'splice')) setMode(d.mode);
          else if (ev.event === 'message' && typeof d?.text === 'string') { got++; setLog((l) => [...l, { role: 'assistant', content: d.text as string }]); }
          else if (ev.event === 'citations' && Array.isArray(ev.data) && ev.data.length) {
            const cites = ev.data as Cite[];
            setLog((l) => { const i = l.map((t) => t.role).lastIndexOf('assistant'); return i < 0 ? l : l.map((t, k) => (k === i ? { ...t, cites } : t)); });
          } else if (ev.event === 'error') setErr(typeof d?.message === 'string' ? d.message : 'Could not reach Lakelink Fiber Splice');
        }
      }
      if (!got) setLog((l) => [...l, { role: 'assistant', content: 'Lakelink Fiber Splice returned no answer. Try rephrasing the question.' }]);
    } catch { setErr('Could not reach Lakelink Fiber Splice'); }
    finally { setBusy(false); }
  };
  const send = (e: React.FormEvent) => { e.preventDefault(); ask(text.trim()); };
  return (<>
    {mode === 'genie' && <p className="mode-label" role="status">Genie mode: answering from the Lakelink Fiber Network Scenario Twin Genie space</p>}
    <div className="assistant-log" aria-live="polite" aria-atomic="false" aria-busy={busy}>
      {log.length === 0 && <><p className="secondary">Ask about blast radius, corridor exhaustion or copper sequencing. Splice is read-only.</p>
        <div className="prompt-list">{SAMPLE_PROMPTS.map((p) => <button key={p} type="button" className="btn-secondary prompt" onClick={() => ask(p)}>{p}</button>)}</div></>}
      {log.map((t, i) => <div key={i} className={`assistant-msg ${t.role}`}><span className="sr-only">{t.role === 'user' ? 'You: ' : 'Splice: '}</span>{t.content}
        {t.cites && t.cites.length > 0 && <ul className="cite-chips" aria-label="Sources">{t.cites.map((c) => <li key={c.tool}>{c.route
          ? <a className="cite-chip" href={c.route} onClick={(e) => { e.preventDefault(); go(c.route as string); }}>{c.label}</a>
          : <span className="cite-chip">{c.label}</span>}</li>)}</ul>}</div>)}
      {busy && <p className="secondary" role="status">Splice is working on it</p>}
      {err && <div className="banner error" role="alert">{err}</div>}
    </div>
    <form className="assistant-form" onSubmit={send}>
      <label htmlFor="assistant-input" className="sr-only">Message Lakelink Fiber Splice</label>
      <textarea id="assistant-input" className="input" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
      <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>Send</button>
    </form>
  </>);
}

function App() {
  const [path, go] = usePath();
  const [navOpen, setNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const overlay = useMedia(OVERLAY_MQ);
  const closeAssistant = () => setAssistantOpen(false);
  const health = useApi<{ pool: string }>('/api/health');
  const seg = path.split('/')[1] || '';
  const view = seg === 'blast-radius' ? 'Blast radius' : seg === 'corridors' ? 'Corridor exhaustion' : seg === 'copper' ? 'Copper sequencing' : 'Overview';
  const id = decodeURIComponent(path.split('/')[2] || '');
  useEffect(() => { document.title = pageTitle(view); }, [view]);
  useOverlayFocus(assistantOpen, drawerRef, toggleRef, closeAssistant, overlay);
  useOverlayFocus(navOpen && overlay, navRef, menuRef, () => setNavOpen(false), true);
  useEffect(() => { if (!overlay) setNavOpen(false); }, [overlay]);
  const nav = (p: string) => { go(p); setNavOpen(false); document.getElementById('main')?.focus(); };
  return (<>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <button ref={menuRef} className="icon-btn menu-btn" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="sidenav" onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X size={20} strokeWidth={1.5} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.5} aria-hidden="true" />}</button>
      <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); nav('/'); }}><span className="dot" aria-hidden="true" /><span className="wm-text">{APP}</span></a>
      <span className="spacer" />
      <span className="chip" role="status" title="Lakebase twin state sync time"><ClockAlert size={14} strokeWidth={1.5} aria-hidden="true" />Twin as of <span className="ts">{health.loading ? 'loading' : fmtTs(health.env?.as_of ?? null)}</span>{health.env?.status === 'stale' ? ' (stale)' : ''}</span>
      <button ref={toggleRef} className="icon-btn tip" data-tip="Splice" aria-label={assistantOpen ? 'Close Lakelink Fiber Splice' : 'Open Lakelink Fiber Splice'} aria-expanded={assistantOpen} aria-controls="assistant" onClick={() => setAssistantOpen(!assistantOpen)}><MessageSquare size={20} strokeWidth={1.5} aria-hidden="true" /></button>
    </header>
    <div className="layout">
      <nav id="sidenav" ref={navRef} className={`sidenav${navOpen ? ' open' : ''}`} aria-label="Primary">
        {ROUTES.map((r) => { const active = r.path === '/' ? seg === '' : r.path.startsWith(`/${seg}`) && seg !== ''; const I = r.icon; return (
          <a key={r.path} href={r.path} aria-current={active ? 'page' : undefined} className="tip" data-tip={r.label} onClick={(e) => { e.preventDefault(); nav(r.path); }}><I size={20} strokeWidth={1.5} aria-hidden="true" /><span className="label">{r.label}</span></a>); })}
      </nav>
      <main id="main" tabIndex={-1}>
        <div aria-live="polite" className="sr-only">{health.env?.status === 'stale' ? 'Twin data is stale' : ''}</div>
        {view === 'Blast radius' ? <BlastRadiusView key={id} id={id} go={go} />
          : view === 'Corridor exhaustion' ? <CorridorView key={id} id={id} go={go} />
          : view === 'Copper sequencing' ? <CopperView key={id} id={id} go={go} />
          : <OverviewView go={nav} />}
      </main>
      {assistantOpen && <aside id="assistant" ref={drawerRef} className="drawer" aria-labelledby="assistant-title" {...(overlay ? { role: 'dialog', 'aria-modal': true } : {})}>
        <h2 id="assistant-title">Lakelink Fiber Splice</h2>
        <SpliceChat go={nav} />
        <button className="btn-secondary" onClick={() => { setAssistantOpen(false); toggleRef.current?.focus(); }}>Close</button>
      </aside>}
      {navOpen && overlay && <div className="scrim" aria-hidden="true" onClick={() => { setNavOpen(false); menuRef.current?.focus(); }} />}
    </div>
  </>);
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
