// Lakelink Fiber Scenario Twin - client shell (React + TypeScript). Tag: telco_project: network_scenario_twin
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Network, Gauge, Cable, LayoutDashboard, MessageSquare, Menu, X, ClockAlert, CircleDashed } from 'lucide-react';
import { APP_NAME as APP, pageTitle, Provenance, Money, fmtTs, fmtDate, fmtDays } from './theme';
import { useApi, StateBanner, BlastRadiusView, CorridorView, CopperView } from './views';
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

// P5-APP-COPILOT-ALL-MESSAGES: one bubble per assistant message, in endpoint order (the early read-only refusal
// or Lakelink-Fiber-only notice comes before the final answer). Text is rendered as plain text (no HTML injection).
interface ChatTurn { role: 'user' | 'assistant'; content: string }
function CopilotChat() {
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim(); if (!message || busy) return;
    const history = log.slice(-10);
    setLog((l) => [...l, { role: 'user', content: message }]); setText(''); setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history }) });
      const j = await r.json().catch(() => null) as { data: { messages: string[] } | null; message?: string } | null;
      if (!r.ok || !j?.data) { setErr(j?.message || 'Could not reach the copilot'); return; }
      const msgs = j.data.messages.length ? j.data.messages : ['The copilot returned no answer. Try rephrasing the question.'];
      setLog((l) => [...l, ...msgs.map((m) => ({ role: 'assistant' as const, content: m }))]);
    } catch { setErr('Could not reach the copilot'); }
    finally { setBusy(false); }
  };
  return (<>
    <div className="copilot-log" aria-live="polite" aria-atomic="false" aria-busy={busy}>
      {log.length === 0 && <p className="secondary">Ask about blast radius, corridor exhaustion or copper sequencing. The copilot is read-only.</p>}
      {log.map((t, i) => <div key={i} className={`copilot-msg ${t.role}`}><span className="sr-only">{t.role === 'user' ? 'You: ' : 'Copilot: '}</span>{t.content}</div>)}
      {busy && <p className="secondary" role="status">Copilot is thinking</p>}
      {err && <div className="banner error" role="alert">{err}</div>}
    </div>
    <form className="copilot-form" onSubmit={send}>
      <label htmlFor="copilot-input" className="sr-only">Message the Lakelink Fiber Twin Copilot</label>
      <textarea id="copilot-input" className="input" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
      <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>Send</button>
    </form>
  </>);
}

function App() {
  const [path, go] = usePath();
  const [navOpen, setNavOpen] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const overlay = useMedia(OVERLAY_MQ);
  const closeCopilot = () => setCopilot(false);
  const health = useApi<{ pool: string }>('/api/health');
  const seg = path.split('/')[1] || '';
  const view = seg === 'blast-radius' ? 'Blast radius' : seg === 'corridors' ? 'Corridor exhaustion' : seg === 'copper' ? 'Copper sequencing' : 'Overview';
  const id = decodeURIComponent(path.split('/')[2] || '');
  useEffect(() => { document.title = pageTitle(view); }, [view]);
  useOverlayFocus(copilot, drawerRef, toggleRef, closeCopilot, overlay);
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
      <button ref={toggleRef} className="icon-btn tip" data-tip="Copilot" aria-label={copilot ? 'Close Lakelink Fiber Twin Copilot' : 'Open Lakelink Fiber Twin Copilot'} aria-expanded={copilot} aria-controls="copilot" onClick={() => setCopilot(!copilot)}><MessageSquare size={20} strokeWidth={1.5} aria-hidden="true" /></button>
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
      {copilot && <aside id="copilot" ref={drawerRef} className="drawer" aria-labelledby="copilot-title" {...(overlay ? { role: 'dialog', 'aria-modal': true } : {})}>
        <h2 id="copilot-title">Lakelink Fiber Twin Copilot</h2>
        <CopilotChat />
        <button className="btn-secondary" onClick={() => { setCopilot(false); toggleRef.current?.focus(); }}>Close</button>
      </aside>}
      {navOpen && overlay && <div className="scrim" aria-hidden="true" onClick={() => { setNavOpen(false); menuRef.current?.focus(); }} />}
    </div>
  </>);
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
