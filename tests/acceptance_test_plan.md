# Lakelink Fiber Network Scenario Twin — Acceptance Test Plan

> Owner: @qa · Task: P0-QA-TEST-PLAN, P0-QA-CONTRACT-REVIEW · Version 1.1 (2026-11-17), aligned to resources/data_contracts.md v1.0
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
| telemetry_span_hourly | 1,296,000 (600 x 24 x 90) | exact (contract s5.1) |
| alarm | 50,000 | exact (contract s5.1) |
| trouble_ticket | 20,000 | exact (contract s5.1) |
| maintenance_window | 200 | exact |
| copper_wire_center | 60 | exact |
| sim_failure_result | 500 (150 node / 300 span / 50 site per model_design.md) | exact |
| sim_capacity_forecast | 480 (40 x 12) | exact |

FK checks (anti-join, expect 0 orphans; list = data_contracts.md s2):
* physical_resource: spec_id -> resource_specification; corridor_id -> corridor (non-null for span and node, null for site); site_a_id/site_z_id -> physical_resource (type node); parent_site_id -> physical_resource (type site); geographic_site_id -> `fiber_capital_intelligence.geographic_site`.
* logical_resource: parent_id -> logical_resource; span_id -> physical_resource (type span); 0 <= utilized_gbps <= capacity_gbps, capacity_gbps > 0.
* corridor: site_a_id/site_z_id -> `fiber_capital_intelligence.geographic_site`; diverse_of -> corridor.
* customer: customer_id ⊆ `dq_customer_candidate_pool`; copper_wc_id -> copper_wire_center.wc_id.
* service: customer_id -> customer; corridor_id -> corridor; primary_logical_resource_id and protect_logical_resource_id -> logical_resource; protect_logical_resource_id NOT NULL when protection_scheme = 'dual_path'; mrr > 0.
* service_level_agreement: service_id -> service, UNIQUE (1:1); customer_id = service.customer_id.
* telemetry_span_hourly: span_id -> physical_resource (type span); corridor_id = span's corridor_id; (span_id, ts) unique; utilization_pct in [0,100].
* alarm: resource_id -> physical_resource; cleared_ts >= ts when not null.
* trouble_ticket: service_id -> service; alarm_id -> alarm (nullable); resolved_ts >= opened_ts; mttr_min = minutes(resolved_ts - opened_ts).
* maintenance_window: span_id -> physical_resource (type span); end_ts > start_ts, duration 2-8 h.
* sim_capacity_forecast: corridor_id -> corridor. sim_failure_result: resource_id -> physical_resource.

PK checks (contract s5.2): every PK in data_contracts.md s1 is unique and non-null. Lineage: origin in (REAL, MIXED, SYNTHETIC) and simulation_run_id = 'nst-sim-001' on every row.

Reuse checks (CEO REUSE FIRST): customer.customer_id ⊆ `dq_customer_candidate_pool` (which ⊆ `cdm_tmforum.tmf_customer.customer`); corridor endpoint site IDs ⊆ `cdm_tmforum.fiber_capital_intelligence.geographic_site`; resource_specification IDs ⊆ `cdm_tmforum.tmf_resource.resource_specification` for EXTEND rows. Time window: all event timestamps in [2026-08-18, 2026-11-17).

## 3. Suite B — Injected anomalies (D-002)

**B1 SRLG-88**
* `physical_resource` rows S-4471 and S-4472 exist, type span, both `srlg = 'SRLG-88'`.
* No other span carries SRLG-88 (count = 2), unless data_contracts.md says otherwise.
* S-4471 corridor_id = 'CHI-DEN', S-4472 corridor_id = 'CHI-DEN-D2', same conduit_id; corridor CHI-DEN-D2.diverse_of = 'CHI-DEN'.
* customer.dual_path_flag = TRUE count = 12. Each of those 12 has at least 1 active `dual_path` service whose primary logical resource rides S-4471 and whose protect logical resource rides S-4472 (contract s2.6). No other customer has a dual_path service riding both spans.
* Every SLA on those 12 customers' dual_path services has credit_pct > 0 (needed for V1 exposure > 0).
* `maintenance_window` has exactly 1 window on S-4471, status 'scheduled', and it is the earliest scheduled window with start_ts > 2026-11-16 (planned start 2026-11-20 06:00 UTC) (contract s2.11, s5.7).

**B2 DEN-SLC RapidRoute exhaustion**
* `corridor` has corridor_id `DEN-SLC` named "DEN-SLC RapidRoute".
* `telemetry_span_hourly` daily mean utilization over DEN-SLC spans: first 7 days ≈ 55% (50-60), last 7 days ≈ 85% (80-90; the analytic curve gives 84.5 for 2026-11-09..11-15 because telemetry ends 2026-11-15 23:00), monotone-ish rise (Spearman ρ ≥ 0.9 on daily means).
* No other corridor's rolling 7-day mean exceeds 75% at any point in the window (contract s2.8, s5.5). Includes DEN-SLC-D2.
* corridor.end_util_pct: DEN-SLC = 85, all others <= 75 (PASS 2026-11-17 on the generated corridor table).

**B3 Iowa copper wire center**
* Validation query 3 (section 11.5) returns ≥1 row; the flagged wire center has `state='IA'`, `high_value_customers = 3`, `decommission_target < '2027-06-01'`.
* Exactly one IA wire center meets all three filters (so the demo answer is unambiguous); it has high_value_customers = 3 and decommission_target = 2027-05-01.
* Reconciliation (contract s2.12, s5.6): for every wire center, high_value_customers = count of customer rows with copper_wc_id = wc_id AND high_value_flag. The flagged WC has exactly 3 such customers.
* IA rows = 8 (SYNTHETIC); reused rows keep source wire_center_id and are MIXED; no reused row has state = 'IA'.

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
| V1 | `SELECT * FROM sim_failure_result WHERE resource_id = 'S-4471'` | Exactly 1 row (contract s2.13 shape); `size(dual_path_both_failed_customer_ids) = 12` and the set equals the customer.dual_path_flag set; `sla_exposure_mrr > 0`. Companion: `SELECT * FROM v_sim_failure_customer_impact WHERE resource_id = 'S-4471' AND both_paths_failed` returns 12 rows, each `sla_exposure_mrr > 0` |
| V2 | `SELECT corridor_id, exhaustion_date FROM sim_capacity_forecast WHERE corridor_id = 'DEN-SLC'` | 12 rows (champion only), one distinct exhaustion_date in 2027-03-01..2027-03-31 (target 2027-03-16 = 120 days); no other corridor has exhaustion_date < 2027-05-16 (6 months) |
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

## 9a. Suite J — data_contracts.md s5 contract checks (added by P0-QA-CONTRACT-REVIEW)

Run with Suites A-B in P1-QA-ANOMALIES. Each check maps to one contract item.

| # | Contract s5 item | Test | Covered by |
| --- | --- | --- | --- |
| J1 | Row counts = s1 | Exact counts per table (telemetry 1,296,000) | Suite A |
| J2 | PK unique, non-null | `count(*) = count(DISTINCT pk)` and `count_if(pk IS NULL) = 0` per table | Suite A |
| J3 | Every FK resolves | Anti-joins in Suite A, including external parents | Suite A |
| J4 | SRLG-88 | Members = {S-4471, S-4472}; dual_path_flag = 12; s2.6 routing | B1 |
| J5 | DEN-SLC curve | 7-day mean ≈ 55 start / ≈ 85 end; no other corridor > 75 | B2 |
| J6 | Iowa | Exactly 1 row for V3 and it reconciles with customer.copper_wc_id | B3 |
| J7 | Maintenance window | One scheduled window on S-4471, next after the anchor | B1 |
| J8 | Branding | No real company or executive name in any STRING column (P1-CUSTOMER-NAME-AUDIT method) | Suite F |
| J9 | Semantics | Every table and column commented; `telco_project` and `domain` tags present | Suite G |
| J10 | High-value flag | customer.high_value_flag = top-decile total service MRR ∪ the 3 IA customers (expect 12-15 TRUE); no high-value customer outside the 3 points to an IA WC with decommission_target < 2027-06-01 | new (contract s2.5) |
| J11 | Determinism | Rerun of src/gen/generate_twin with seed 4471 and run id nst-sim-001 gives identical row hashes for all 14 tables | new (contract s0) |
| J12 | Time window | All event timestamps in [2026-08-18, 2026-11-17); maintenance_window may run to 2027-02-28 | Suite A |

## 10. Reporting

Each @qa run writes one `status_updates` row (`agent_role='@qa'`, `update_type='agent_run'`) listing suites run, PASS/FAIL counts, and the tasks reopened or filed.

## Changelog
* v1.0 2026-11-17 @qa (P0-QA-TEST-PLAN): initial plan.
* v1.1 2026-11-17 @qa (P0-QA-CONTRACT-REVIEW): aligned to data_contracts.md v1.0. Exact counts for telemetry/alarm/ticket; full FK list from s2; B1 routing rule (≥1 dual_path service, not ≥2), exactly one scheduled MW on S-4471; B2 threshold 75% (was 80%); B3 reconciliation; V1 1-row array shape + view; V2 12 rows; added Suite J (s5 checks + J10 high-value flag, J11 determinism).
