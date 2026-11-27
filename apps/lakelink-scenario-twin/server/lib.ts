// Lakelink Fiber Scenario Twin - pure server helpers (no I/O), shared by server.ts and tests/smoke.spec.ts.
// Tag: telco_project: network_scenario_twin. Assistant name: Lakelink Fiber Splice (D-013).

// Input validation (ARCHITECTURE s2.4).
export const RESOURCE_ID = /^[A-Z]{1,4}-\d{1,6}$/;
export const CORRIDOR_ID = /^[A-Z]{3}-[A-Z]{3}$/;
export const STATE = /^[A-Z]{2}$/;

// D-011: flagged wire center (high-value customers AND target before 2027-06-01) ranks first.
export const COPPER_ORDER_BY =
  "(high_value_customers > 0 AND decommission_target < DATE '2027-06-01') DESC, decommission_target ASC, high_value_customers DESC, active_circuits ASC, copper_miles DESC";

// Responses API output items from the Splice supervisor endpoint.
export interface RespItem { type?: string; role?: string; name?: string; content?: Array<{ type?: string; text?: string }> }

// Every assistant message in endpoint order (the early read-only / Lakelink-Fiber-only notice comes first), never only output[-1].
export function assistantMessages(output: RespItem[] | undefined): string[] {
  return (output ?? [])
    .filter((o) => o?.type === 'message' && (o.role ?? 'assistant') === 'assistant')
    .map((o) => (o.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('').trim())
    .filter((t) => t.length > 0);
}

// Citation chips: one per distinct twin tool the supervisor called. Route opens the matching wow view (null = no view).
export interface Citation { tool: string; label: string; route: string | null }
const TOOLS: Array<{ match: RegExp; tool: string; label: string; route: string | null }> = [
  { match: /blast_radius/i, tool: 'blast_radius', label: 'Blast radius simulation', route: '/blast-radius/S-4471' },
  { match: /corridor_forecast/i, tool: 'corridor_forecast', label: 'Corridor forecast', route: '/corridors/DEN-SLC' },
  { match: /copper_sequence/i, tool: 'copper_sequence', label: 'Copper sequencing', route: '/copper/IA' },
  { match: /genie|scenario_twin_space/i, tool: 'genie', label: 'Genie space: Lakelink Fiber Network Scenario Twin', route: null },
];
export function citationsFrom(output: RespItem[] | undefined): Citation[] {
  const seen = new Map<string, Citation>();
  for (const o of output ?? []) {
    if (o?.type !== 'function_call' || typeof o.name !== 'string') continue;
    const t = TOOLS.find((x) => x.match.test(o.name as string));
    if (t && !seen.has(t.tool)) seen.set(t.tool, { tool: t.tool, label: t.label, route: t.route });
  }
  return [...seen.values()];
}

// Genie fallback (ARCHITECTURE s4.3 "Genie mode"): text attachments plus the description of any query attachment.
interface GenieAttachment { text?: { content?: string }; query?: { description?: string } }
export function genieText(msg: { attachments?: GenieAttachment[] } | null | undefined): string[] {
  return (msg?.attachments ?? [])
    .map((a) => (a?.text?.content ?? a?.query?.description ?? '').trim())
    .filter((t) => t.length > 0);
}

// Server-Sent Events frame. Data is JSON so newlines in model text never break framing.
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event.replace(/[^a-z_]/g, '')}\ndata: ${JSON.stringify(data)}\n\n`;
}
// Client-side parser for the same framing (also used by the smoke spec).
export function parseSse(buf: string): { events: Array<{ event: string; data: unknown }>; rest: string } {
  const parts = buf.split('\n\n'); const rest = parts.pop() ?? '';
  const events = parts.map((p) => {
    let event = 'message', data = '';
    for (const line of p.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    return { event, data: data ? JSON.parse(data) : null };
  }).filter((e) => !(e.event === 'message' && e.data === null));
  return { events, rest };
}
