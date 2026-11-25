# Lakelink Fiber Network Scenario Twin: Data Contracts v1.3

> Owner: @data-planner (P0-DATA-CONTRACTS, 2026-11-17). Tag: `telco_project: network_scenario_twin`.
> Binding for P1-GEN-*, P2-SDP-*, P3-* and the app. Changes go through @data-planner; record them in the changelog at the end of this file.
> Company name in every asset is **Lakelink Fiber**. Customer names are fictional.

## 0. Global standards (all 14 tables)

| Rule | Contract |
| --- | --- |
| Location | `cdm_tmforum.network_scenario_twin.<table>` (managed Delta) |
| Tags | Table: `telco_project=network_scenario_twin` (required), `domain=operations` (matches the schema tag). See section 4 for ABAC tags. |
| Comments | Every table and every column has a comment (CEO semantic mandate). The table comment states grain, row count, origin, and the injected anomaly, if any. |
| Lineage columns | Every EXTEND table carries `source_table STRING` (fully qualified parent), `source_id STRING` (parent key value as a string), `origin STRING` in (`REAL`,`MIXED`,`SYNTHETIC`), and `simulation_run_id STRING` (`nst-sim-001` for the v1 build). GENERATE tables carry `origin` and `simulation_run_id`; their `source_*` columns are null. |
| Timestamps | `TIMESTAMP` in UTC. Demo window `[2026-08-18 00:00, 2026-11-17 00:00)`; anchor date 2026-11-16 (D-002). Intervals are half-open `[start, end)`. |
| Money | `DECIMAL(18,2)` USD, monthly recurring (`mrr`). |
| Percent | `DOUBLE` on a 0-100 scale (not 0-1). |
| Determinism | Generator seed 4471. A rerun with the same seed and run id produces identical rows. |
| FK rule | Where a parent exists in cdm_tmforum, FK values come from that parent (REUSE FIRST). Twin-internal FKs reference twin tables only. Never invent a key that is missing from the referenced parent. |
| Generator | ONE consolidated generator notebook: `src/gen/generate_twin.py` (D-006). One section per P1-GEN task. No per-table notebooks. |

### 0.1 Twin ID formats

| Entity | Format | Notes |
| --- | --- | --- |
| Span | `S-4001`..`S-4600` (600) | Spec IDs. S-4471 and S-4472 are reserved for SRLG-88. The source key `provable_resilience_intelligence.physical_resource_span.span_id` (format `SPAN-NNNNNN`; verified that no S-4471 or S-4472 exists there) goes in `source_id`. |
| Node | `N-1001`..`N-1150` (150) | |
| Site | `SITE-<geographic_site_id>` (50) | `geographic_site_id` comes from `cdm_tmforum.fiber_capital_intelligence.geographic_site` |
| SRLG | `SRLG-01`..`SRLG-99` | Remapped from source `derived_srlg_shared_conduit.srlg_id` (format `SRLG-COND-...`). SRLG-88 is reserved. |
| Corridor | `<A>-<Z>` (alphabetical 3-letter city codes DEN, SLC, CHI, DAL, ASH, SEA, ATL, PHX), metro `<CITY>-MET`, diverse `<base>-D2` | Ratified from `data/corridor_reference.csv` |
| Maintenance window | `MW-0001`..`MW-0200` | |
| Simulation | `SIM-0001`..`SIM-0500` | |
| Wire center (generated) | `IA-WC-01`.. | Reused wire centers keep the source `wire_center_id` |

All other entity IDs (customer, service, SLA, logical resource, spec, alarm, ticket) reuse the parent table's native key. Native key types are preserved (LONG where the parent is LONG; STRING for the provable_resilience alarm id).

## 1. Classification summary (from P0-CATALOG-REUSE-SCAN)

| # | Table | Class | Rows | Grain / PK | Primary parent |
| --- | --- | --- | --- | --- | --- |
| 1 | resource_specification | EXTEND | 20 | 1 per spec / `spec_id` | `tmf_resource.resource_specification` |
| 2 | physical_resource | EXTEND | 800 | 1 per resource / `resource_id` | `provable_resilience_intelligence.physical_resource_span` + `fiber_capital_intelligence.geographic_site` |
| 3 | logical_resource | EXTEND | 2,500 | 1 per logical resource / `resource_id` | `tmf_resource.logical_resource` |
| 4 | corridor | EXTEND | 40 | 1 per corridor / `corridor_id` | `fiber_capital_intelligence.silver_corridor` |
| 5 | customer | EXTEND | 120 | 1 per customer / `customer_id` | `network_scenario_twin.dq_customer_candidate_pool` -> `tmf_customer.customer` |
| 6 | service | EXTEND | 1,500 | 1 per service / `service_id` | `tmf_service.service` |
| 7 | service_level_agreement | EXTEND | 1,500 | 1 per service (1:1) / `sla_id` | `tmf_customer.service_level_agreement` |
| 8 | telemetry_span_hourly | GENERATE | 1,296,000 | span x hour / (`span_id`,`ts`) | none |
| 9 | alarm | EXTEND | 50,000 | 1 per alarm / `alarm_id` | `provable_resilience_intelligence.resource_alarm` |
| 10 | trouble_ticket | EXTEND | 20,000 | 1 per ticket / `ticket_id` | `tmf_service.service_problem` |
| 11 | maintenance_window | GENERATE | 200 | 1 per window / `window_id` | none |
| 12 | copper_wire_center | EXTEND | 60 | 1 per wire center / `wc_id` | `copper_retirement.wire_center_boundary` + `gold_wire_center_scorecard` |
| 13 | sim_failure_result | GENERATE (model) | 500 | 1 per simulation / `sim_id` | output of P3-BLAST-RADIUS |
| 14 | sim_capacity_forecast | GENERATE (model) | 480 | corridor x month / (`corridor_id`,`month`) | output of P3-FORECAST-MODEL |

Under a single-value FK, every non-null value must exist in the parent. Profiling (P1-PROFILE) and QA (P1-QA-ANOMALIES) test each FK listed below.

## 2. Table contracts

### 2.1 resource_specification (20)
| Column | Type | Semantics |
| --- | --- | --- |
| spec_id | LONG PK | = `tmf_resource.resource_specification.resource_specification_id` (subset of 20) |
| name | STRING | Lakelink Fiber display name, e.g. `Lakelink Fiber 400G Coherent Wavelength`. No real vendor branding in display names. |
| type | STRING | Enum: `fiber_span`, `optical_node`, `site`, `wavelength`, `port`, `och` |
| capacity_gbps | DOUBLE | Nominal capacity. If the source has `max_bandwidth_mbps`, use max_bandwidth_mbps/1000; otherwise use the twin value |
| source_table, source_id, origin (MIXED), simulation_run_id | | lineage |

### 2.2 physical_resource (800 = 600 span + 150 node + 50 site)
| Column | Type | Semantics |
| --- | --- | --- |
| resource_id | STRING PK | Span `S-####`, node `N-####`, site `SITE-<id>` |
| type | STRING | `span` / `node` / `site` |
| spec_id | LONG FK | -> resource_specification.spec_id |
| corridor_id | STRING FK | -> corridor.corridor_id. Required for spans and nodes; null for sites |
| site_a_id, site_z_id | STRING FK | Span endpoints -> physical_resource.resource_id (type node). Null for nodes and sites |
| parent_site_id | STRING FK | Node -> physical_resource.resource_id (type site) |
| geographic_site_id | INT FK | Sites -> `fiber_capital_intelligence.geographic_site.geographic_site_id` |
| srlg | STRING | Shared-risk link group of the span's conduit (`SRLG-##`). Null for nodes and sites |
| conduit_id | STRING | From the source span. Spans in one SRLG share the conduit |
| length_km | DOUBLE | Span length (source `length_km` for EXTEND spans) |
| status | STRING | `in_service` / `planned` / `retired` |
| lineage cols | | Spans: source = `physical_resource_span`, origin MIXED. Nodes: SYNTHETIC. Sites: MIXED |

**Injected anomaly SRLG-88 (binding):** S-4471 (`corridor_id='CHI-DEN'`) and S-4472 (`corridor_id='CHI-DEN-D2'`) both have `srlg='SRLG-88'` and the same `conduit_id`. No other span has SRLG-88. The two corridors are sold as diverse (`CHI-DEN-D2.diverse_of='CHI-DEN'`).

### 2.3 logical_resource (2,500)
| Column | Type | Semantics |
| --- | --- | --- |
| resource_id | LONG PK | = `tmf_resource.logical_resource.logical_resource_id` |
| parent_id | LONG FK nullable | -> logical_resource.resource_id (e.g. a wavelength inside an OCh) |
| type | STRING | `och`, `wavelength`, `port` |
| span_id | STRING FK | realizesOn -> physical_resource.resource_id (type span) |
| capacity_gbps | DOUBLE | > 0 |
| utilized_gbps | DOUBLE | 0 <= utilized_gbps <= capacity_gbps; latest snapshot at the anchor date |
| source_physical_resource_id | LONG | Source `physical_resource_id`, kept for lineage only (not a twin FK) |
| lineage cols | | origin MIXED |

### 2.4 corridor (40) — ratified from data/corridor_reference.csv
| Column | Type | Semantics |
| --- | --- | --- |
| corridor_id | STRING PK | Format in section 0.1. Acceptance query 2 keys on `'DEN-SLC'` |
| corridor_name | STRING | Lakelink Fiber names. `DEN-SLC` = `DEN-SLC RapidRoute` |
| route_type | STRING | `long_haul` / `metro` |
| site_a_id, site_z_id | INT FK | -> `fiber_capital_intelligence.geographic_site.geographic_site_id` (all 80 verified by @data-engineer in P0-CORRIDOR-REFERENCE) |
| distance_km | DOUBLE | **Long-haul: great-circle(site_a, site_z) x 1.25; diverse -D2 routes x 1.12 on top of that; metro ring: round(source_distance_km x 0.2, 2), which must fall in 40-120 km (P1-CORRIDOR-REF-FIXES, 2026-11-20).** Endpoint rule: both endpoints must be `active` sites. SEA-MET site_z_id was re-keyed from 100124 (data center, planned) to 100126 (Seattle Cable Landing 6, active, carrier-neutral). This is the documented exception: the only active Seattle data_center/central_office is 100128, which is already site_a. |
| source_distance_km | DOUBLE nullable | Raw `silver_corridor.total_distance_km`. This is a sum of segment lengths, NOT a route length (e.g. Dallas-Phoenix 35,543 km), so never use it for analysis |
| fiber_count | INT | |
| capacity_gbps | DOUBLE | Rule in corridor_generator_config.json; DEN-SLC = 9,600 |
| diverse_of | STRING FK nullable | -> corridor.corridor_id |
| baseline_util_pct, end_util_pct | DOUBLE | Generator targets at 2026-08-18 and 2026-11-16 |
| injected_anomaly | STRING nullable | `DEN-SLC_EXHAUSTION`, `SRLG-88_DIVERSE_PAIR` |
| lineage cols | | 33 MIXED (source_id = `silver_corridor.canonical_corridor_key`), 7 SYNTHETIC |

Composition: 25 long-haul + 8 metro EXTEND; 3 GENERATE missing pairs (ASH-CHI, ASH-PHX, DEN-SEA); 4 GENERATE diverse routes (ASH-ATL-D2, CHI-DEN-D2, DAL-PHX-D2, DEN-SLC-D2).

### 2.5 customer (120)
| Column | Type | Semantics |
| --- | --- | --- |
| customer_id | LONG PK FK | Drawn ONLY from `network_scenario_twin.dq_customer_candidate_pool` (1,276 audited rows; all present in `tmf_customer.customer`) |
| name | STRING | Fictional display name produced by P1-CUSTOMER-DISPLAY-NAMES. Never a real company. The source `name` is not exposed |
| segment | STRING | `enterprise`, `wholesale`, `hyperscaler`, `government`, `smb`. Derived from the source `segment_classification` and kept in `source_segment` |
| naas_flag | BOOLEAN | NaaS / on-demand customer |
| dual_path_flag | BOOLEAN | Exactly **12** TRUE: the SRLG-88 Dual Path customers |
| copper_wc_id | STRING FK nullable | -> copper_wire_center.wc_id. Exactly 3 customers point to the flagged Iowa wire center (section 2.12) |
| high_value_flag | BOOLEAN | TRUE for top-decile total service MRR, and always TRUE for the 3 Iowa customers |
| lineage cols | | origin MIXED |

### 2.6 service (1,500)
| Column | Type | Semantics |
| --- | --- | --- |
| service_id | LONG PK | = `tmf_service.service.service_id` (distinct sample of 1,500) |
| customer_id | LONG FK | -> customer.customer_id (twin assignment). `tmf_service.service` has no customer_id column; its `party_id` goes in `source_party_id` for lineage only |
| corridor_id | STRING FK | -> corridor.corridor_id |
| service_type | STRING | `wavelength`, `ethernet`, `dia`, `naas_on_demand` |
| protection_scheme | STRING | `dual_path` / `protected` / `unprotected` |
| primary_logical_resource_id | LONG FK | -> logical_resource.resource_id |
| protect_logical_resource_id | LONG FK nullable | -> logical_resource.resource_id. Required when protection_scheme = `dual_path` |
| mrr | DECIMAL(18,2) | > 0 |
| status | STRING | `active` (default) / `pending` / `disconnected` |
| lineage cols | | origin MIXED |

**SRLG-88 routing (binding):** each of the 12 `dual_path_flag` customers has at least 1 active `dual_path` service whose primary path rides S-4471 and whose protect path rides S-4472. A failure of either span (with SRLG expansion) therefore takes down both paths. No other customer has a dual_path service that rides both S-4471 and S-4472.

### 2.7 service_level_agreement (1,500, 1:1 with service)
| Column | Type | Semantics |
| --- | --- | --- |
| sla_id | LONG PK | = `tmf_customer.service_level_agreement.service_level_agreement_id` (every value must exist in the parent; UNIQUE). First assign the SLAs whose source `customer_id` equals the twin customer. The 120 twin customers own only 1,226 source SLAs, so the remaining 274 services reuse other, unused source SLA ids (amended v1.1) |
| service_id | LONG FK UNIQUE | -> service.service_id |
| customer_id | LONG FK | -> customer.customer_id; = service.customer_id (twin assignment, which may differ from the source owner) |
| source_customer_id | LONG | Lineage only (added v1.1): `customer_id` of the source SLA row. Equals `customer_id` for 1,226 rows and differs for 274. Not an FK, and not for joins or reporting |
| latency_target_ms | DOUBLE | GENERATED (amended v1.1): the source `latency_threshold_milliseconds` is an unparsable alphanumeric code for all 1,226 twin-customer rows (for example `61477T7E6I80`). Value is uniform 5-60 ms, seed 4471. Use `try_cast` if a later source refresh has numeric values; generate only when the cast is null |
| availability_target_pct | DOUBLE | 99.9 / 99.99 / 99.999 (unprotected / protected / dual_path) |
| credit_pct | DOUBLE | 0-100 scale, > 0 (amended v1.1). The source `penalty_cap_percentage` is NOT on a 0-100 scale: it ranges 134.56-99,957.01 for the twin customers, and 0 rows fall in 0-100. Rule: `credit_pct = source value` if it is between 0 and 100, otherwise `5 + pmod(source value, 20)`, which gives 5.00-24.99. Must be > 0 for all 12 Dual Path customers' services |
| lineage cols | | origin MIXED; `source_table` = `cdm_tmforum.tmf_customer.service_level_agreement`, `source_id` = sla_id as a string |

**v1.1 verification (2026-11-18, @data-planner):** 1,500 rows, 1,500 distinct sla_id and service_id. 0 orphan sla_id against the parent. 0 rows where source_customer_id differs from the parent's customer_id. 0 service FK or customer mismatches. 0 rows deviate from the credit rule; range 5.00-24.99. latency 5.1-60.0. All 12 Dual Path customers have a dual_path SLA with credit_pct > 0. Tags and table/column comments are present.

### 2.8 telemetry_span_hourly (600 x 24 x 90 = 1,296,000)
| Column | Type | Semantics |
| --- | --- | --- |
| ts | TIMESTAMP | Hour start, UTC, 2026-08-18 00:00 to 2026-11-15 23:00 |
| span_id | STRING FK | -> physical_resource.resource_id (type span) |
| corridor_id | STRING | Denormalized from the span (lets queries skip a join) |
| utilization_pct | DOUBLE | 0-100 |
| latency_ms | DOUBLE | > 0 |
| optical_margin_db | DOUBLE | Typical 2-12. Lower is worse |
| origin, simulation_run_id | | SYNTHETIC |

**Injected anomaly DEN-SLC (binding):** for spans with corridor_id = `DEN-SLC`, the corridor-level 7-day mean follows `u(t)=55+30*ln(1+k t)/ln(1+90k)`, with k=0.108783 and t = days since 2026-08-18 (55% at the start, 85% on 2026-11-16, 95% crossed at t=210, i.e. 2027-03-16). Noise: Gaussian sd 3 plus diurnal amplitude 4. No other corridor's 7-day mean exceeds 75%.

### 2.9 alarm (50,000)
| Column | Type | Semantics |
| --- | --- | --- |
| alarm_id | STRING PK | = `provable_resilience_intelligence.resource_alarm.alarm_id` (sample) |
| ts | TIMESTAMP | Within the demo window (from the source `raised_at`, shifted into the window if needed) |
| cleared_ts | TIMESTAMP nullable | >= ts |
| resource_id | STRING FK | -> physical_resource.resource_id (remapped from the source span_id) |
| severity | STRING | `critical`, `major`, `minor`, `warning` |
| alarm_type | STRING | From the source |
| lineage cols | | origin MIXED |

### 2.10 trouble_ticket (20,000)
| Column | Type | Semantics |
| --- | --- | --- |
| ticket_id | LONG PK | = `tmf_service.service_problem.service_problem_id` (sample) |
| service_id | LONG FK | -> service.service_id |
| alarm_id | STRING FK nullable | -> alarm.alarm_id |
| opened_ts, resolved_ts | TIMESTAMP | resolved_ts >= opened_ts, within the window |
| mttr_min | INT | = minutes(resolved_ts - opened_ts) |
| root_cause | STRING | From the source `root_cause_code` / `root_cause_description`, normalized to: `fiber_cut`, `optical_degradation`, `equipment`, `power`, `config`, `customer_premises`, `unknown` |
| lineage cols | | origin MIXED |

### 2.11 maintenance_window (200)
| Column | Type | Semantics |
| --- | --- | --- |
| window_id | STRING PK | `MW-####` |
| span_id | STRING FK | -> physical_resource.resource_id (type span) |
| start_ts, end_ts | TIMESTAMP | end_ts > start_ts; duration 2-8 h; range 2026-08-18 to 2027-02-28 |
| status | STRING | `completed` (start < anchor) / `scheduled` |
| work_type | STRING | `splice`, `reroute`, `upgrade`, `repair` |
| origin, simulation_run_id | | SYNTHETIC |

**Injected (binding):** exactly one window on S-4471, with status `scheduled`, and it is the earliest scheduled window after 2026-11-16 (it answers Genie question "SLA exposure of the next maintenance window"). Assumption (planner decision): start 2026-11-20 06:00 UTC.

### 2.12 copper_wire_center (60)
| Column | Type | Semantics |
| --- | --- | --- |
| wc_id | STRING PK | Reused: source `wire_center_id`. Generated Iowa: `IA-WC-##` |
| wc_name | STRING | Lakelink Fiber naming, e.g. `Lakelink Fiber Ames Central WC` |
| state | STRING | 2-letter. Source states: AZ, CO, ID, MN, OR, WA (verified: no IA in the source) |
| clli_code | STRING | Source for reused rows, synthetic for IA |
| copper_miles | DOUBLE | > 0 |
| active_circuits | INT | >= 0 |
| high_value_customers | INT | = count of customer rows with copper_wc_id = wc_id and high_value_flag (must reconcile) |
| decommission_target | DATE | |
| retirement_readiness_score | DOUBLE | From `gold_wire_center_scorecard` for reused rows; generated for IA |
| lineage cols | | Reused: MIXED (up to 52 of the 103 source WCs). IA: SYNTHETIC (8 rows) |

**Injected (binding):** exactly ONE row satisfies `state='IA' AND high_value_customers > 0 AND decommission_target < '2027-06-01'`; it has high_value_customers = 3 and decommission_target = 2027-05-01. The other IA rows have high_value_customers = 0 or decommission_target >= 2027-06-01.

### 2.13 sim_failure_result (500) — ratifies model_design.md section 3.5
Grain: 1 row per simulation (150 node + 300 span + 50 site). PK `sim_id`. Champion model output only.
Columns: `sim_id, scenario_type (node|span|site), resource_id STRING FK -> physical_resource.resource_id, srlg_expanded_resource_ids ARRAY<STRING>, affected_services INT, affected_service_ids ARRAY<LONG>, affected_customers INT, affected_customer_ids ARRAY<LONG>, dual_path_both_failed_customer_ids ARRAY<LONG>, degraded_services INT, sla_exposure_mrr DECIMAL(18,2), degraded_mrr DECIMAL(18,2), model_name, model_version, mlflow_run_id, simulated_at, origin, simulation_run_id`. Arrays hold LONG to match customer.customer_id and service.service_id (amends the STRING in model_design).
- `sla_exposure_mrr` = SUM over DOWN services of mrr x credit_pct / 100.
- Exactly one row with resource_id = `S-4471` (scenario_type span), and one for S-4472.

**Acceptance query 1 (D-005) shape, DECIDED:** `SELECT * FROM sim_failure_result WHERE resource_id='S-4471'` returns 1 row in which `size(dual_path_both_failed_customer_ids) = 12` (exactly the 12 dual_path_flag customers) and `sla_exposure_mrr > 0`. The companion view `v_sim_failure_customer_impact` (sim_id, resource_id, customer_id, both_paths_failed BOOLEAN, sla_exposure_mrr) explodes this to one row per customer; for S-4471 it returns 12 rows with both_paths_failed = TRUE and each sla_exposure_mrr > 0. @qa tests both.

### 2.14 sim_capacity_forecast (480) — ratifies model_design.md section 2.6
Grain: corridor x month, 40 x 12. Months 2026-12-01 to 2027-11-01 (first of month). PK (`corridor_id`,`month`). **Champion rows only** (challenger output stays in MLflow), so acceptance query 2 returns 12 rows for DEN-SLC.
Columns: `forecast_id, corridor_id FK -> corridor, month DATE, forecast_utilization_pct (P50), forecast_p10_pct, forecast_p90_pct, exhaustion_date DATE nullable, exhaustion_date_p10, exhaustion_date_p90, days_to_exhaustion INT (from 2026-11-16), exhaustion_threshold_pct (=95), model_name, model_version, model_alias, mlflow_run_id, forecast_generated_at, origin, simulation_run_id`. `exhaustion_date` is constant within a corridor.
**Acceptance query 2:** DEN-SLC exhaustion_date in [2027-03-01, 2027-03-31] (target 2027-03-16, 120 days). No other corridor has exhaustion_date < 2027-05-16.

## 3. Gold and serving (P2-SDP-GOLD, preview)
| Table | Grain | Notes |
| --- | --- | --- |
| twin_current_state | resource_id (physical + logical) at the latest snapshot | status, utilization, open alarms, srlg, corridor; synced to Lakebase (app DB, D-004) |
| corridor_utilization_daily | corridor_id x date | avg/p95 utilization_pct from telemetry; DEN-SLC curve visible |
| sla_exposure_by_span | span_id | services, Dual Path customers, sum of mrr x credit_pct exposed if the span fails (SRLG-expanded) |

## 4. ABAC tag design (RATIFIED v1.2, P1-ABAC-KEY-RATIFY, 2026-11-21)
| Tag key | Values | Applied to | Status |
| --- | --- | --- | --- |
| `telco_project` | `network_scenario_twin` | every table, view, metric view, function, model | **Value NOT in the governed policy** (2026-11-21: 43 allowed values, network_scenario_twin absent). 9 of 17 objects carry it (applied before the value was lost); 8 do not. CEO must add the value; P1-TAG-REAPPLY then tags the rest |
| `domain` | `operations` | every table and metric view | 14 of 17 tagged; dq_customer_candidate_pool, sim_failure_result, v_sim_failure_customer_impact missing |
| **`telco_sensitivity`** (existing governed policy; replaces the proposed `data_sensitivity`, whose only values are official / official_sensitive) | `internal`, `confidential`, `restricted` | Table level: see the classification below. `restricted` is reserved; not used in v1 | Ratified |
| column tag `class.name` (system) | | `customer.name`, `customer.source_name_code`, `dq_customer_candidate_pool.source_name_code` | Drives the name-mask policy |

**Classification rule:** an object is `confidential` if it holds customer-level rows (a customer_id with name, money, or a source-system link). Aggregates without a customer key are `internal`.

| telco_sensitivity | Objects |
| --- | --- |
| confidential (6) | customer, service, service_level_agreement, sim_failure_result, **v_sim_failure_customer_impact** (per-customer sla_exposure_mrr), **dq_customer_candidate_pool** (bridge from twin customer_id to `tmf_customer.customer` and its source name code) |
| internal (11) | resource_specification, physical_resource, logical_resource, corridor, telemetry_span_hourly, alarm, trouble_ticket, maintenance_window, copper_wire_center, mv_copper_readiness, **mv_sla_exposure** (span grain, no customer key) |

New objects (P2 gold tables, P3 outputs) get a class at creation by the same rule. twin_current_state, corridor_utilization_daily, and sla_exposure_by_span are `internal` unless they gain a customer key.

**Access and masking design (binding).** UC evaluates ABAC policies on base tables against the *querying* user, even through views and metric views. A money mask on `service.mrr` would therefore also null the metric views for non-planners. So money is controlled by **grants**, and names by a **mask**:
1. Principals (D-014): existing account group `telco-builders` (id 2124359062889615; planners, agents, CEO; full/unmasked read) and the app service principal of `lakelink-scenario-twin` read everything. Existing account group `telco-sellers` (id 2127847027209199) is everyone else on the demo, including Genie space users (masked names). Do NOT create `lakelink_nst_*` groups. Both groups are shared across telco projects, so every GRANT and ABAC policy in this section is scoped to `cdm_tmforum.network_scenario_twin` (schema or object level), never catalog-wide.
2. Grants (schema-scoped): `telco-builders` gets `USE SCHEMA` + `SELECT` on `cdm_tmforum.network_scenario_twin`. `telco-sellers` gets `USE SCHEMA` and `SELECT` only on `internal` objects (including both metric views), and no SELECT on `confidential` objects. Metric views run with owner access to base tables, so sellers see mrr / sla_exposure_mrr only as metric-view aggregates.
   * **Known gap (verified 2026-11-25, SHOW GRANTS):** both groups already hold catalog-level `USE SCHEMA` + `SELECT` (and more) on `cdm_tmforum`, granted outside this project. These inherit into the schema, and UC has no deny, so the seller restriction in item 2 is not effective today and the item 4 name mask is the only live seller control. Revoking catalog grants is out of scope (shared groups, other projects). Resolution is pending a @pm ruling (P1-SELLER-INHERIT-RULING).
3. Mask function: `cdm_tmforum.network_scenario_twin.nst_mask_name(v STRING) RETURNS STRING`, which returns `concat('Lakelink Customer ', substr(sha2(v, 256), 1, 8))` (deterministic and joinable; it never returns the source value).
4. ABAC policy `nst_mask_customer_name` ON SCHEMA `cdm_tmforum.network_scenario_twin`: COLUMN MASK `nst_mask_name` TO `account users` EXCEPT `telco-builders`, the app SP; FOR TABLES MATCH COLUMNS `has_tag('class.name')`. Defense in depth for any future grant of a confidential table.
5. No row-filter policy in v1. Do not add a column-mask policy on money columns (it would break the metric views; see above).
6. Prerequisite met (2026-11-25): both groups exist (SCIM lookup returned telco-builders 2124359062889615 and telco-sellers 2127847027209199). `nst_mask_name` exists; no ABAC policy exists on the schema yet. @data-engineer creates the schema-scoped grants and the policy (P1-ABAC-MASK-POLICY).

## 5. Contract checks (for P1-PROFILE / P1-QA-ANOMALIES)
1. Row counts equal section 1 (telemetry exactly 1,296,000).
2. PK uniqueness and non-null on every table.
3. Every FK in section 2 resolves (twin parents, plus the external parents: `dq_customer_candidate_pool`, `fiber_capital_intelligence.geographic_site`).
4. SRLG-88: members = {S-4471, S-4472}; dual_path_flag count = 12; section 2.6 routing holds.
5. DEN-SLC 7-day mean: about 55 at the start and about 85 at the end; no other corridor's 7-day mean exceeds 75.
6. Iowa: exactly 1 row for acceptance query 3, and it reconciles with customer.copper_wc_id.
7. One scheduled maintenance window on S-4471, and it is the next one after the anchor.
8. No real company or executive names in any STRING column (reuse the P1-CUSTOMER-NAME-AUDIT method).
9. Every table and column has a comment and the `telco_project` tag.

## Changelog
* v1.3 2026-11-25 @data-planner (P1-CONTRACTS-GROUPS-UPDATE): section 4 principals moved to the existing shared groups `telco-builders` (full) and `telco-sellers` (masked), per D-014; `lakelink_nst_planners` / `lakelink_nst_viewers` retired. All grants and the mask policy are scoped to the project schema. Recorded the inherited catalog-level SELECT gap for telco-sellers.
* v1.2 2026-11-21 @data-planner (P1-ABAC-KEY-RATIFY): section 4 ratified. The key is `telco_sensitivity` (the existing governed policy), not `data_sensitivity`. v_sim_failure_customer_impact and dq_customer_candidate_pool are now confidential, and mv_sla_exposure (untagged) is internal. `class.name` is extended to both source_name_code columns. Access design: grants control money, an ABAC mask controls names. Base-table money masks are ruled out because policies follow the querier through metric views. Recorded the telco_project policy gap (value absent) and the missing `domain` tags.
* v1.1 2026-11-18 @data-planner (P1-CONTRACT-SLA-AMEND): section 2.7 amended to match the verified source. credit_pct uses the mapping 5 + pmod(penalty_cap_percentage, 20) when the source is outside 0-100. latency_target_ms is generated (5-60, seed 4471) because the source is unparsable. 274 SLAs reuse other source SLA ids. Added the lineage-only column source_customer_id. Ratified the generator's output as built; no regeneration needed.
* v1.0 2026-11-17 @data-planner: initial contract. Ratified the corridor config (distance rule, keys, 40 rows), the ml-engineer sim schemas (arrays changed to LONG; champion-only forecast), and the acceptance query 1 shape. Single generator notebook at src/gen/.
