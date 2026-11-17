# Lakelink Fiber Network Scenario Twin — Acceptance Test Plan

> Owner: @qa · Task: P0-QA-TEST-PLAN · Version 1.0 (2026-11-17)
> Tag: `telco_project: network_scenario_twin` · UC target: `cdm_tmforum.network_scenario_twin`
> Authority: D-005 (acceptance = project_plan.md section 11.5), D-002 (anomalies), D-004 (one app), CEO directives (branding, tagging, reuse, 2-for-1).

All table names below are relative to `cdm_tmforum.network_scenario_twin` unless fully qualified. Every check records: run timestamp, query, observed result, PASS/FAIL. A FAIL reopens the owning task (or files a new one) with the evidence in `status_notes`.

## 1. When each check runs

| Suite | Gate task | Runs after | Blocks |
| --- | --- | --- | --- |
| A. Row counts and FK integrity | P1-QA-ANOMALIES | P1-PROFILE | P2-SDP-BRONZE |
| B. Injected anomalies (3) | P1-QA-ANOMALIES | P1-PROFILE | P2-SDP-BRONZE |
| C. Gold row counts and pipeline | P2-QA-PIPELINE | P2-SDP-GOLD | P3-* consumers |
| D. Validation queries 1-2 + MLflow | P3-QA-VALIDATION | P3-FORECAST-MODEL, P3-BLAST-RADIUS | P4-GENIE-SPACE |
| E. Genie 8-question benchmark | P4-GENIE-BENCHMARK | P4-GENIE-SPACE | P4-DASHBOARD, P5-TWIN-COPILOT |
| F. Branding scan | every @qa run | — | any release |
| G. Tagging and comments | P2-QA-PIPELINE, P6-E2E-VALIDATION | P1-COLUMN-COMMENTS | P4-SEMANTIC-AUDIT sign-off |
| H. asset_ledger audit | P6-CONSOLIDATION-AUDIT | P5-APP-WOW-VIEWS | demo |
| I. End-to-end (all 3 validation queries + storyline) | P6-E2E-VALIDATION | P5-APP-WOW-VIEWS, P4-DASHBOARD | P6-DEMO-SCRIPT |

## 2. Suite A — Row counts vs spec (project_plan 11.2) and FK integrity

PASS = count within tolerance; FK orphans = 0.

| Table | Spec rows | Tolerance |
| --- | --- | --- |
| resource_specification | 20 | exact |
| physical_resource | 800 (600 span, 150 node, 50 site) | exact per type |
| logical_resource | 2,500 | exact |
| corridor | 40 | exact |
| customer | 120 | exact |
| service | 1,500 | exact |
| service_level_agreement | 1,500 | exact, 1:1 with service |
| telemetry_span_hourly | 1,296,000 (600 x 24 x 90) | ±1% |
| alarm | 50,000 | ±1% |
| trouble_ticket | 20,000 | ±1% |
| maintenance_window | 200 | exact |
| copper_wire_center | 60 | exact |
| sim_failure_result | 500 (150 node / 300 span / 50 site per model_design.md) | exact |
| sim_capacity_forecast | 480 (40 x 12) | exact |

FK checks (anti-join, expect 0 orphans): service.customer_id -> customer; service.corridor_id -> corridor; service_level_agreement.service_id -> service; logical_resource.parent_id -> physical_resource / logical_resource; physical_resource.corridor_id -> corridor; telemetry_span_hourly.span_id -> physical_resource (type span); alarm.resource_id -> physical_resource ∪ logical_resource; trouble_ticket.service_id -> service; maintenance_window.span_id -> physical_resource; sim_capacity_forecast.corridor_id -> corridor; sim_failure_result.resource_id -> physical_resource.

Reuse checks (CEO REUSE FIRST): customer.customer_id ⊆ `dq_customer_candidate_pool` (which ⊆ `cdm_tmforum.tmf_customer.customer`); corridor endpoint site IDs ⊆ `cdm_tmforum.fiber_capital_intelligence.geographic_site`; resource_specification IDs ⊆ `cdm_tmforum.tmf_resource.resource_specification` for EXTEND rows. Time window: all event timestamps in [2026-08-18, 2026-11-17).

## 3. Suite B — Injected anomalies (D-002)

**B1 SRLG-88**
* `physical_resource` rows S-4471 and S-4472 exist, type span, both `srlg = 'SRLG-88'`.
* No other span carries SRLG-88 (count = 2), unless data_contracts.md says otherwise.
* Exactly 12 customers flagged Dual Path whose primary and diverse services route over S-4471 and S-4472 respectively (count distinct customer_id = 12); each has ≥2 services on the two spans.
* `maintenance_window` contains ≥1 window on S-4471 (spec: one).

**B2 DEN-SLC RapidRoute exhaustion**
* `corridor` has corridor_id `DEN-SLC` named "DEN-SLC RapidRoute".
* `telemetry_span_hourly` daily mean utilization over DEN-SLC spans: first 7 days ≈ 55% (50-60), last 7 days ≈ 85% (80-90), monotone-ish rise (Spearman ρ ≥ 0.9 on daily means).
* No other corridor ends the window above 80% (keeps the wow moment unique).

**B3 Iowa copper wire center**
* Validation query 3 (section 11.5) returns ≥1 row; the flagged wire center has `state='IA'`, `high_value_customers = 3`, `decommission_target < '2027-06-01'`.
* Exactly one IA wire center meets all three filters (so the demo answer is unambiguous).

## 4. Suite C — Pipeline and gold

* SDP pipeline exists, tagged, last update COMPLETED; expectations defined on silver resource/service/customer/sla with 0 dropped rows unexplained.
* Gold tables exist: `twin_current_state`, `corridor_utilization_daily`, `sla_exposure_by_span`.
* `corridor_utilization_daily` = 40 corridors x 90 days = 3,600 rows (±0).
* `twin_current_state` row count = physical_resource + logical_resource in scope (document expected grain from data_contracts.md).
* `sla_exposure_by_span` has rows for all 600 spans; S-4471 is in the top 5 by exposure.
* Bronze→silver→gold row counts reconcile per table (no silent drops). Lineage visible in UC for each gold table.
* Lakebase sync (P2-LAKEBASE-TWIN-STATE): synced `twin_current_state` row count equals UC gold; lives in database `nst_twin_state`, not alongside task-board tables (D-004).

## 5. Suite D/I — Validation queries (project_plan 11.5)

| # | Query | PASS when |
| --- | --- | --- |
| V1 | `SELECT * FROM sim_failure_result WHERE resource_id = 'S-4471'` | Affected customers include all 12 Dual Path customers from B1, each with `sla_exposure_mrr > 0` |
| V2 | `SELECT corridor_id, exhaustion_date FROM sim_capacity_forecast WHERE corridor_id = 'DEN-SLC'` | exhaustion_date within ~120 days of 2026-11-16; gate per model_design.md = 2027-03-01..2027-03-31; 0 other corridors exhaust within 6 months |
| V3 | `SELECT * FROM copper_wire_center WHERE state = 'IA' AND high_value_customers > 0 AND decommission_target < '2027-06-01'` | Returns the flagged wire center (B3) |

Extra checks for D: S-4472 sim is symmetric with S-4471 (same 12 customers); the SRLG-blind counterfactual (path_only_v1) shows fewer customers fully down, proving the SRLG delta; reruns are deterministic (same seed → same output). MLflow: forecast and blast-radius runs exist with params, metrics, and signature; UC models have `champion` and `challenger` aliases; all tagged.

E2E (I): run V1-V3 against gold, against Lakebase (app read path), and through the app UI (3 wow views); values must match across all three. Walk the 5-minute storyline (11.4) and record the time.

## 6. Suite E — Genie benchmark (8 sample questions)

Space name must be "Lakelink Fiber Network Scenario Twin". Each question is asked 3 times; PASS = correct on ≥2 of 3 and the generated SQL uses a governed table or metric view. Target ≥7/8 questions PASS.

| # | Question | Expected answer |
| --- | --- | --- |
| G1 | What breaks if span S-4471 goes down? | 12 Dual Path customers + SLA exposure $ = V1 |
| G2 | Which corridors exhaust within 6 months? | DEN-SLC only (= V2) |
| G3 | Which Dual Path customers share a common SRLG? | The 12 customers on SRLG-88 |
| G4 | What is the SLA exposure of the next maintenance window? | Next window after 2026-11-16 with exposure matching sla_exposure_by_span |
| G5 | Which copper wire centers should be sequenced first in Iowa? | Ordering = copper_sequence('IA'); flagged WC visible |
| G6 | What is the utilization trend on DEN-SLC? | 55% → 85% rise over the window |
| G7 | Which customers would be affected by retiring the Iowa wire center? | The 3 high-value customers (+ others on that WC) |
| G8 | What is the blast radius of a node failure in Chicago? | Matches sim_failure_result for a Chicago node |

Failures are filed to @data-analyst (instructions, sample SQL, metric view gaps) with the question, generated SQL, and the expected answer.

## 7. Suite F — Branding scan (every @qa run)

* Workspace files: case-insensitive grep over the project folder (excluding `.git`) using the real-carrier and executive keyword list held in the @qa run prompt. The list is not committed, so the repo itself must scan clean. PASS = 0 hits.
* UC: scan table comments, column comments, and string columns that hold names (customer.name, corridor.name, physical_resource names) with the same list. PASS = 0 hits.
* App UI copy, dashboard titles, Genie space name and instructions, copilot system prompt: PASS = 0 hits, and the company is shown as "Lakelink Fiber".
* Customer names must be fictional (see P1-CUSTOMER-NAME-AUDIT; P1-CUSTOMER-DISPLAY-NAMES).

## 8. Suite G — Tagging and semantic completeness

* Every table, view, and metric view in the schema has tag `telco_project = network_scenario_twin` (`information_schema.table_tags`): missing = 0.
* Every table has a comment, and every column has a comment (`information_schema.columns.comment IS NULL` count = 0).
* Pipeline, jobs, dashboard, Genie space, serving endpoint, app, and models are tagged.

## 9. Suite H — asset_ledger audit (2-for-1, single app)

* Count Lakebase `asset_ledger` rows by asset_type and action.
* 2-for-1 rule: for asset_type in (notebook, app), #consolidated + #removed ≥ 2 x #created. Docs and data files are exempt (as already noted by the agents that created them).
* Single-app rule: exactly 1 Databricks App with the `telco_project=network_scenario_twin` tag (Apps API), named for "Lakelink Fiber Scenario Twin"; ledger app creates = 1.
* Ledger completeness: every notebook, dashboard, and app found in the project folder or by tag has a ledger row (any missing asset = FAIL to its creator).
* Folder size < 200 files (excluding .git) — shared with @repo-pruner.

## 10. Reporting

Each @qa run writes one `status_updates` row (`agent_role='@qa'`, `update_type='agent_run'`) listing suites run, PASS/FAIL counts, and the tasks reopened or filed.
