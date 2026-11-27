// Lakelink Fiber Scenario Twin - smoke spec (node:test via tsx). Run: npm run test:smoke
// Tag: telco_project: network_scenario_twin. Covers P5-APP-WOW-VIEWS done criteria that can be checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESOURCE_ID, CORRIDOR_ID, STATE, COPPER_ORDER_BY, assistantMessages, citationsFrom, genieText, sseFrame, parseSse } from '../server/lib.ts';

const server = readFileSync('server/server.ts', 'utf8');
const main = readFileSync('client/main.tsx', 'utf8');
const views = readFileSync('client/views.tsx', 'utf8');

test('3 wow views are exported and routed', () => {
  for (const v of ['BlastRadiusView', 'CorridorView', 'CopperView']) {
    assert.match(views, new RegExp(`export function ${v}\\b`));
    assert.ok(main.includes(`<${v} `), `${v} not rendered in shell`);
  }
  for (const p of ['/blast-radius/S-4471', '/corridors/DEN-SLC', '/copper/IA']) assert.ok(main.includes(`'${p}'`), `nav route ${p}`);
});

test('views read Lakebase-backed API routes (twin_app schema)', () => {
  for (const r of ['/api/blast-radius/:resourceId', '/api/corridors/:corridorId/forecast', '/api/corridors/:corridorId/actuals', '/api/copper/:state', '/api/assistant/chat']) assert.ok(server.includes(`'${r}'`), `route ${r}`);
  assert.match(server, /TWIN_SCHEMA \|\| 'twin_app'/);
  assert.match(server, /default_transaction_read_only = on/);
});

test('input validators accept demo ids and reject injection', () => {
  assert.ok(RESOURCE_ID.test('S-4471')); assert.ok(!RESOURCE_ID.test("S-4471';--"));
  assert.ok(CORRIDOR_ID.test('DEN-SLC')); assert.ok(!CORRIDOR_ID.test('den-slc'));
  assert.ok(STATE.test('IA')); assert.ok(!STATE.test('IOWA'));
});

test('copper queue order follows D-011 (flagged wire center first)', () => {
  assert.ok(COPPER_ORDER_BY.startsWith("(high_value_customers > 0 AND decommission_target < DATE '2027-06-01') DESC"));
  assert.ok(server.includes('ORDER BY ${COPPER_ORDER_BY}'));
});

// Shape of the live reply recorded on 2026-11-25 (2 tool calls + 1 message) plus an early read-only notice.
const reply = [
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'I am read-only and answer for Lakelink Fiber only.' }] },
  { type: 'function_call', name: 'cdm_tmforum__network_scenario_twin__policy_check' },
  { type: 'function_call', name: 'cdm_tmforum__network_scenario_twin__blast_radius' },
  { type: 'function_call', name: 'blast_radius' },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '12 affected customers; SLA exposure $75,472.41.' }] },
];

test('every assistant message is kept in order', () => {
  assert.deepEqual(assistantMessages(reply), ['I am read-only and answer for Lakelink Fiber only.', '12 affected customers; SLA exposure $75,472.41.']);
  assert.deepEqual(assistantMessages(undefined), []);
});

test('citation chips: one per distinct twin tool, policy_check ignored', () => {
  const c = citationsFrom(reply);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { tool: 'blast_radius', label: 'Blast radius simulation', route: '/blast-radius/S-4471' });
});

test('Genie mode fallback extracts text and query descriptions', () => {
  assert.deepEqual(genieText({ attachments: [{ text: { content: 'DEN-SLC exhausts on 2027-03-16.' } }, { query: { description: 'Champion forecast for DEN-SLC' } }, {}] }),
    ['DEN-SLC exhausts on 2027-03-16.', 'Champion forecast for DEN-SLC']);
  assert.ok(server.includes('/start-conversation') && main.includes('Genie mode'));
});

test('SSE framing round-trips, including newlines and split chunks', () => {
  const wire = sseFrame('meta', { mode: 'splice' }) + ': ping\n\n' + sseFrame('message', { text: 'line 1\nline 2' }) + sseFrame('citations', []) + sseFrame('done', { status: 'ok' });
  const cut = 37; const a = parseSse(wire.slice(0, cut)); const b = parseSse(a.rest + wire.slice(cut));
  const events = [...a.events, ...b.events];
  assert.deepEqual(events.map((e) => e.event), ['meta', 'message', 'citations', 'done']);
  assert.deepEqual(events[1].data, { text: 'line 1\nline 2' });
  assert.equal(b.rest, '');
});

test('drawer is Lakelink Fiber Splice with no retired assistant name', () => {
  const retired = ['co', 'pilot'].join('');
  for (const [f, s] of [['main.tsx', main], ['server.ts', server], ['views.tsx', views], ['app.yaml', readFileSync('app.yaml', 'utf8')]] as const) assert.ok(!s.toLowerCase().includes(retired), `${f} still names the retired assistant`);
  assert.ok(main.includes('<h2 id="assistant-title">Lakelink Fiber Splice</h2>'));
  assert.ok(main.includes("Accept: 'text/event-stream'"));
});
