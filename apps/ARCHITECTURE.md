# Lakelink Fiber Scenario Twin: App Architecture

| Item | Value |
| --- | --- |
| Owner | @app-developer |
| Task | P0-APP-ARCHITECTURE |
| Status | v1.0, 2026-11-17 (design only; no scaffolding until P2-LAKEBASE-TWIN-STATE is completed) |
| Display name | **Lakelink Fiber Scenario Twin** |
| Platform app name | `lakelink-scenario-twin` (22 chars, fits the 26-char AppKit limit) |
| Source folder (future) | `apps/lakelink-scenario-twin/` |
| UC target | `cdm_tmforum.network_scenario_twin` |
| Tag | `telco_project: network_scenario_twin` |
| Governing decisions | D-003 (intelligence layer, read-only), D-004 (exactly one app, reads Lakebase twin state, app state in a separate Lakebase database), D-005 (acceptance = project_plan.md section 11.5) |

This is the **only** Databricks App for the project. Company name in all UI copy, page titles, metadata, and test fixtures is always "Lakelink Fiber". Every number shown is labelled as simulated, forecast, or observed, and the app never writes to the inventory system of record or to the twin.

---

## 1. Framework choice

**AppKit (Node.js + TypeScript server, React + TypeScript client), scaffolded with `databricks apps init`.**

| Option | Verdict | Reason |
| --- | --- | --- |
| AppKit (TS/React) | **Chosen** | Project mandate is a React/TypeScript app. AppKit gives the Lakebase plugin (pooled Postgres with OAuth token rotation), a serving/agent integration for the copilot, `appkit-ui` chart and table components, typed config, and `databricks apps validate` linting and smoke tests. |
| Python (FastAPI/Streamlit) | Rejected | Not React/TypeScript. A second runtime would also break the single-app rule if someone later added a React front end. |
| AI/BI dashboard only | Not a replacement | P4-DASHBOARD already covers the BI view. The app adds the interactive what-if surface, the countdown, and the copilot chat in one place. |

Planned features at scaffold time (confirm exact plugin keys and resource keys from `databricks apps manifest`; do not guess them):

* `lakebase`: primary read path for twin state (section 2).
* `serving` (or the AppKit `agents` beta plugin, if the copilot is exposed as a tool-using agent endpoint): copilot chat (section 4).
* `genie`: **fallback only**, enabled when the copilot endpoint is not yet READY (section 4.3).
* No `analytics` (SQL warehouse) plugin in v1. All view reads come from Lakebase per D-004. If a view ever needs a warehouse read, record that as a decision first.

Execution identity: **service principal (SP)** for all resources. Twin data has no per-user row filters, so on-behalf-of-user (OBO) auth is not needed. Revisit only if ABAC tags introduce per-user restrictions.

---

## 2. Lakebase twin-state read path

### 2.1 Placement (reuse existing infrastructure, D-004)

| Item | Value |
| --- | --- |
| Lakebase project | `telco-network-scenario-twin-project` (**reused**; no new project) |
| Branch | `production` |
| Database | `nst_twin_state` (**new database, separate from `databricks_postgres`**, which holds the task board) |
| Schema `twin` | Read-only synced copies of UC gold and sim tables (owned by @data-engineer) |
| Schema `app_state` | App-owned operational state: copilot sessions and messages only (owned by the app SP) |

The app SP gets `CONNECT` on `nst_twin_state`, `USAGE` + `SELECT` on schema `twin`, and ownership of schema `app_state`. It has no access to `databricks_postgres` (task board).

### 2.2 Data flow

```
UC Delta (cdm_tmforum.network_scenario_twin)
  gold: twin_current_state, corridor_utilization_daily, sla_exposure_by_span
  sim:  sim_failure_result, sim_failure_customer_impact, sim_capacity_forecast
  ref:  corridor, customer, copper_wire_center, maintenance_window
        |
        |  Lakebase synced tables (triggered/snapshot, owned by @data-engineer, P2-LAKEBASE-TWIN-STATE)
        v
Lakebase nst_twin_state.twin.*  --(pg pool, SP OAuth)-->  AppKit server (Express routes)  --JSON-->  React client
```

### 2.3 Required synced tables (read contract for @data-engineer)

Synced tables need a Delta **table** source with a primary key. Views cannot be synced, so the per-customer impact view must also exist as a table.

| Lakebase table (`twin.`) | UC source | Primary key | Used by |
| --- | --- | --- | --- |
| `twin_current_state` | gold `twin_current_state` | `resource_id` | Overview freshness, resource lookup |
| `sim_failure_result` | `sim_failure_result` | `sim_id` (unique `resource_id`) | Blast radius KPIs |
| `sim_failure_customer_impact` | table form of `v_sim_failure_customer_impact` (sim_id, resource_id, customer_id, failure_state DOWN/DEGRADED, sla_exposure_mrr, model_name) | `(sim_id, customer_id, model_name)` | Blast radius customer table, counterfactual toggle |
| `sim_capacity_forecast` | `sim_capacity_forecast` | `forecast_id` | DEN-SLC countdown, forecast band |
| `corridor_utilization_daily` | gold `corridor_utilization_daily` | `(corridor_id, util_date)` | Countdown actuals (90 days) |
| `corridor` | `corridor` | `corridor_id` | Corridor picker, names |
| `customer` | `customer` (id, fictional name, segment, naas_flag, dual_path_flag) | `customer_id` | Customer names in impact table |
| `copper_wire_center` | `copper_wire_center` | `wc_id` | Iowa copper queue |
| `maintenance_window` | `maintenance_window` | `window_id` | S-4471 maintenance window callout |

The customer sync excludes PII beyond the fictional customer name. The app must display `twin_current_state` sync time as the "Twin as of" timestamp.

### 2.4 Server read rules

* All SQL is parameterized (`$1` placeholders through the pg pool). No string concatenation.
* Path and query inputs are validated before use: resource IDs `^[A-Z]{1,4}-\d{1,6}$`, corridor IDs `^[A-Z]{3}-[A-Z]{3}$`, state `^[A-Z]{2}$`. Invalid input returns HTTP 400.
* The connection is read-only for `twin` (`SET default_transaction_read_only = on` for the twin pool). Only the `app_state` pool can write.
* **An empty result does not mean the data is absent.** Every route returns `{ data, as_of, source_table, status }` where `status` is `ok`, `empty`, or `stale`. The UI renders `empty` and `stale` explicitly. It never shows 0 as a fact.
* Latency target: under 300 ms p95 per route from Lakebase, and under 2 s first paint for each wow view.

### 2.5 API routes (Express, registered in `onPluginsReady`)

| Method / path | Returns | Lakebase source |
| --- | --- | --- |
| `GET /api/health` | Pool status, as_of | `twin_current_state` (max sync ts) |
| `GET /api/blast-radius/:resourceId?model=srlg_graph_v1` | Failure set (incl. SRLG-expanded spans), affected services and customers, Dual Path both-failed count, `sla_exposure_mrr`, `degraded_mrr` | `sim_failure_result` |
| `GET /api/blast-radius/:resourceId/customers?model=` | One row per impacted customer: name, segment, DOWN/DEGRADED, exposure | `sim_failure_customer_impact` + `customer` |
| `GET /api/blast-radius/:resourceId/maintenance` | Scheduled windows on that resource | `maintenance_window` |
| `GET /api/corridors?exhausting_within_days=180` | Corridors with exhaustion inside the horizon | `sim_capacity_forecast` + `corridor` |
| `GET /api/corridors/:corridorId/forecast` | 12 monthly P10/P50/P90, exhaustion date + band, days to exhaustion, pre-build trigger (exhaustion minus 180 days) | `sim_capacity_forecast` |
| `GET /api/corridors/:corridorId/actuals` | 90 days of daily mean/p95 utilization | `corridor_utilization_daily` |
| `GET /api/copper/:state` | Wire centers ranked by sequencing score (same ordering as UC function `copper_sequence`) | `copper_wire_center` |
| `POST /api/copilot/chat` | Server-sent events stream of copilot tokens and citations | Copilot endpoint (section 4) |

The copper ranking is decommission_target ascending, high_value_customers descending, active_circuits ascending, copper_miles descending. It must match P5-UC-TOOLS `copper_sequence` exactly, and @qa can check this.

---

## 3. Page map: the three wow views

Global shell: top bar with the Lakelink Fiber wordmark, the "Twin as of <ts>" freshness chip, and the copilot toggle. Left nav: Overview, Blast Radius, Corridor Exhaustion, Copper Sequencing. The copilot is a right-side drawer available on every page.

### 3.0 `/` Overview
Three story cards, one per wow moment. Each card shows its headline metric (Dual Path customers at risk on S-4471, days to DEN-SLC exhaustion, Iowa wire centers flagged) and links to its view. A positioning line reads "Intelligence layer above the inventory system of record" (D-003).

### 3.1 `/blast-radius/:resourceId` (default `S-4471`), Wow 1
* **Header:** resource picker (typeahead over `twin_current_state`), with resource type and corridor.
* **KPI row:** Affected services, Affected customers, **Dual Path customers losing both paths** (expected 12 for S-4471), **SLA exposure (simulated, USD/month)**, Degraded MRR.
* **SRLG callout:** "S-4471 and S-4472 share SRLG-88. They are sold as diverse paths, but one conduit event takes down both." This comes from `srlg_expanded_resource_ids`.
* **Counterfactual toggle:** `srlg_graph_v1` (champion) vs `path_only_v1` (SRLG-blind). It shows 12 DOWN vs 0 DOWN / 12 DEGRADED and the dollar delta, which is the hidden risk an inventory-only diversity check misses.
* **Customer impact table:** customer (fictional), segment, state (DOWN/DEGRADED, shown with a text label and an icon, not color alone), and exposure. The table is sortable and exportable.
* **Maintenance callout:** the scheduled window on S-4471, with its pre-scored exposure.
* **Acceptance link:** this view reproduces section 11.5 query 1.

### 3.2 `/corridors/:corridorId` (default `DEN-SLC`), Wow 2
* **Countdown hero:** days to exhaustion (P50) with P10-P90 range, exhaustion date, and **pre-build trigger date** (exhaustion minus 180-day build lead time), labelled "Forecast".
* **Chart:** 90-day observed daily utilization (line), 12-month forecast P50 (dashed), P10-P90 band (area), and a 95% exhaustion threshold reference line. A "Linear trend would say ~24 days" annotation carries the AI-growth talking point from model_design.md section 2.5, if @ml-engineer publishes the baseline.
* **Side list:** other corridors exhausting within 6 months (expected: DEN-SLC only).
* **Accessibility:** a data-table alternative for the chart.
* **Acceptance link:** this view reproduces section 11.5 query 2.

### 3.3 `/copper/:state` (default `IA`), Wow 3
* **Ranked queue table:** rank, wire center, decommission target, high-value customers, active circuits, copper miles, sequencing score.
* **Flag treatment:** rows with `high_value_customers > 0` and `decommission_target < 2027-06-01` are flagged with a badge and the text "Migrate N high-value customers before retirement".
* **Detail panel:** the flagged wire center's target date countdown and its high-value customers (fictional names), plus a proceeds-protection note.
* **Acceptance link:** this view reproduces section 11.5 query 3.

### 3.4 Required states (every view)
Authoritative spec: `resources/brand_guide.md` section 9. Summary:

| State | Treatment |
| --- | --- |
| Loading | Skeletons matching the final layout; no spinner-only pages. Shimmer disabled under `prefers-reduced-motion`. |
| Empty | Icon + text "No simulated result for <id> yet" + a next action (for example "Pick another resource" or "Ask the copilot"). Never render 0 as a fact. |
| Error | Text error with the route name and a Retry button. No raw stack traces, SQL, or server error bodies in the UI. Invalid input (HTTP 400) renders as text, for example "Resource ID must look like S-4471". |
| Stale | Banner "Twin data is older than 24 hours (as of <ts>)" when as_of is more than 24 hours old. |
| Copilot unavailable | Drawer shows "Copilot not yet available"; the Genie fallback is labelled "Genie mode". |

Loading, stale, and error banners are announced through an `aria-live` region.

---

## 4. Copilot chat integration

### 4.1 Target
The Agent Bricks Supervisor Agent **"Lakelink Fiber Twin Copilot"** (P5-TWIN-COPILOT, @ml-engineer). Its tools are the Genie space "Lakelink Fiber Network Scenario Twin" and the UC functions `blast_radius`, `corridor_forecast`, and `copper_sequence`. It is exposed as a serving endpoint behind AI Gateway guardrails (P5-AI-GATEWAY, @devops).

### 4.2 Wiring
* App resource: the copilot serving endpoint with `CAN_QUERY` for the app SP. The endpoint name is read from `app.yaml` env (`COPILOT_ENDPOINT`), never hard-coded.
* `POST /api/copilot/chat` proxies the request server-side and streams the response to the client over SSE. The client never sees a token.
* Context injection: the current page passes `{ view, resource_id | corridor_id | state }` as a system hint so "what breaks if this fails?" resolves to the resource on screen.
* Seeded prompts: the 8 Genie sample questions from project_plan.md section 11.3, filtered to the current view.
* Rendering: citations (twin table or function) appear as chips under each answer. Answers about sim output carry a "Simulated" or "Forecast" badge. The copilot is read-only, and a request to edit inventory gets the agent's refusal shown as-is.
* Persistence: sessions and messages go to `nst_twin_state.app_state.copilot_session` and `copilot_message` (session_id, user, ts, role, content, citations JSON). This is the only app write path.

### 4.3 Fallback
Until the copilot endpoint is READY, the drawer uses the AppKit `genie` plugin against the Genie space (P4-GENIE-SPACE) and shows a "Genie mode" label. If neither is ready, the drawer shows an explicit "Copilot not yet available" state. It is never silently hidden.

---

## 5. Brand and accessibility (binding @designer authority)

**Tokens: see `resources/brand_guide.md` v1.0 (authoritative).** The app theme implements the core palette (s2.1) and the mandatory accessible derived tokens (s2.2), status semantics (s3), chart rules (s4.2), typography (s5), and breakpoints (s6) exactly as written there. This document does not restate token values, so it cannot drift from the guide. Note in particular that `--lf-primary-strong`, `--lf-green-strong`, `--lf-ink-secondary`, and `--lf-input-border` are required wherever red, green, secondary text, or input borders appear; #FF3621 and #00A972 are not used for normal-size text. Implementation is tracked in P5-APP-BRAND-TOKENS.

Accessibility requirements (WCAG 2.1 AA; full binding checklist in `resources/brand_guide.md` s8):

* Contrast per brand_guide s2.3: text 4.5:1 (large 3:1), UI components and meaningful graphics 3:1.
* Skip-to-content link as the first focusable element.
* Landmarks: `header`, `nav`, `main`, and `aside` (copilot drawer).
* Exactly one `h1` per view.
* Page `<title>` is "<View> | Lakelink Fiber Scenario Twin"; `<html lang="en">`.
* Full keyboard path through every control; visible focus (2px #FF3621 outline + 2px offset on light, 2px white on navy). Esc closes the copilot drawer and returns focus to the toggle.
* ARIA live region (`aria-live="polite"`) for streamed copilot output and state banners.
* Status is never conveyed by color alone (DOWN/DEGRADED carry text and an icon, brand_guide s3).
* `prefers-reduced-motion` respected: no countdown ticking, no skeleton shimmer.
* Responsive at 1280, 1024, and 768 px (demo-laptop priority), with content reflow at 320 px.
* Every chart has a table alternative and a one-sentence text summary.

Shell-level items are tracked in P5-APP-A11Y-SHELL; view-level items in P5-APP-WOW-VIEW-UX-SPEC.

Every @designer finding filed against the app is binding and is tracked as an `@app-developer` task. UX review is requested through P5-UX-REVIEW once P5-APP-WOW-VIEWS lands.

---

## 6. Deployment, governance, testing

* **Bundle:** the app is defined as a resource in `bundle/` (P5-BUNDLE-RESOURCES, @devops), with a dev target first. Resources declared: Lakebase database `nst_twin_state`, the copilot serving endpoint, and the Genie space as fallback.
* **Tagging:** `telco_project: network_scenario_twin` is applied on the app (via budget policy custom tags or app tags, whichever the platform supports at build time), on the Lakebase database, and in `package.json` metadata.
* **Single-app rule:** no second app, preview app, or "v2" app. Iterations redeploy the same app name. Each change is recorded in `asset_ledger`.
* **Smoke tests** (`tests/smoke.spec.ts`): heading "Lakelink Fiber Scenario Twin"; the Blast Radius view shows "12" Dual Path customers for S-4471; the Corridor view shows an exhaustion date in March 2027; the Copper view shows at least one flagged Iowa wire center. A brand lint test fails the build if any non-Lakelink company name appears in `client/` or `server/` strings.
* **Validation:** `databricks apps validate` (tsc, lint, smoke) runs before every deploy.

---

## 7. Dependencies and build sequence

| Step | Task | Blocked by |
| --- | --- | --- |
| 1 | P0-APP-ARCHITECTURE (this document) | none |
| 2 | P5-APP-SCAFFOLD: `databricks apps init` with lakebase (+serving); shell, nav, health route, brand tokens | P2-LAKEBASE-TWIN-STATE |
| 3 | P5-APP-WOW-VIEWS: three views + copilot drawer | P5-APP-SCAFFOLD, P5-TWIN-COPILOT |
| 4 | P5-UX-REVIEW (@designer), then remediation tasks | P5-APP-WOW-VIEWS |
| 5 | P5-BUNDLE-RESOURCES (@devops), P6-E2E-VALIDATION (@qa) | the above |

### 7.1 Open items handed off
1. **@data-engineer** (on P2-LAKEBASE-TWIN-STATE): create database `nst_twin_state` in the existing project, and sync the 9 tables in section 2.3 with the listed primary keys, including a table form of `v_sim_failure_customer_impact` that carries both model names.
2. **@ml-engineer** (on P5-TWIN-COPILOT): expose the copilot as a serving endpoint that accepts a context hint and returns structured citations. Also publish the `path_only_v1` counterfactual rows and the linear-baseline exhaustion figure, so the app can show the deltas.
3. **@designer** (P0-BRAND-GUIDE): the brand guide supersedes section 5 tokens.
4. **@pm / @qa** (2-for-1 consolidation directive): the app is net-new and no project app exists to consolidate. @pm should confirm at P5-APP-SCAFFOLD time which two assets are consolidated or removed to offset it, or record an exemption in `decisions`.
