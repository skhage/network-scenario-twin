# Lakelink Fiber Network Scenario Twin: Metric Definitions v1.0

> Owner: @data-analyst (P0-KPI-DEFINITIONS, 2026-11-17). Tag: `telco_project: network_scenario_twin`.
> Binding for P4-MV-CORRIDOR-UTIL, P4-MV-SLA-EXPOSURE, P4-MV-COPPER-READINESS, P4-GENIE-SPACE, P4-DASHBOARD and P6-VALUE-READOUT.
> Column names follow `resources/data_contracts.md` v1.0. Company name is always **Lakelink Fiber**. Positioning (D-003): the twin is the intelligence layer above the inventory system of record, not an inventory system.

## 0. Global conventions

| Rule | Definition |
| --- | --- |
| Location | Metric views live in `cdm_tmforum.network_scenario_twin` as `mv_<name>` and carry `telco_project=network_scenario_twin` plus table and column comments |
| Anchor date | `2026-11-16` (D-002). All "days to" and "next" metrics count from the anchor, not `current_date()`, so the demo is reproducible |
| Percent | `DOUBLE` on a 0-100 scale |
| Money | USD `DECIMAL(18,2)`. MRR = monthly recurring revenue. Annualized = 12 x MRR (not recognized revenue) |
| Model outputs | Use champion rows only (`sim_capacity_forecast` is champion-only by contract; `sim_failure_result` is champion-only) |
| Missing simulation | A resource with no `sim_failure_result` row shows **"no simulated result yet"** (null), never 0 (brand_guide s10) |
| Provenance | Every view exposes `origin` / `simulation_run_id` (or the model version) so the UI can label simulated values |
| Active service | `service.status = 'active'`; pending and disconnected services are excluded from every exposure metric |

## 1. Corridor utilization + exhaustion countdown (`mv_corridor_utilization`)

**Source:** `corridor_utilization_daily` (gold, corridor x date, from `telemetry_span_hourly`) joined to `corridor` and `sim_capacity_forecast`.
**Grain:** corridor_id x date (observed, 2026-08-18 to 2026-11-15); forecast measures are constant per corridor.

| Metric | Formula | Notes |
| --- | --- | --- |
| `avg_utilization_pct` | AVG(utilization_pct) over the spans of the corridor and the hours of the day | Telemetry is per span; the corridor value is the mean across its spans |
| `p95_utilization_pct` | PERCENTILE(utilization_pct, 0.95) | Peak-hour view |
| `utilization_7d_avg_pct` | Mean of daily `avg_utilization_pct` over the trailing 7 days ending on the date | The contract defines the DEN-SLC curve on this measure: about 55 at the start, about 85 at the anchor; no other corridor exceeds 75 |
| `current_utilization_pct` | `utilization_7d_avg_pct` on the last observed date (2026-11-15) | Headline value for the dashboard and Genie |
| `utilized_gbps` | `current_utilization_pct` / 100 x `corridor.capacity_gbps` | DEN-SLC capacity = 9,600 Gbps |
| `headroom_gbps` | `capacity_gbps` x (95 - `current_utilization_pct`) / 100 | Headroom to the exhaustion threshold, not to 100% |
| `exhaustion_threshold_pct` | 95 (from `sim_capacity_forecast.exhaustion_threshold_pct`) | |
| `exhaustion_date` | `sim_capacity_forecast.exhaustion_date` (P50; constant per corridor) | Null = does not exhaust within the 12-month horizon |
| `days_to_exhaustion` | DATEDIFF(exhaustion_date, DATE'2026-11-16') | Exhaustion countdown. DEN-SLC target = 120 days (2027-03-16) |
| `exhaustion_band` | `<= 180 days` = "Exhausts within 6 months"; `181-365` = "Within 12 months"; null = "Beyond horizon" | Answers Genie Q2 ("Which corridors exhaust within 6 months?") |
| `pre_build_trigger_date` | exhaustion_date - 90 days (assumed build lead time) | Assumption to validate with Planning; parameterize in the view comment |

**Filters:** long-haul and metro both included; dimension `route_type` lets users split them. Diverse routes (`-D2`) are corridors in their own right.
**Expected demo values:** DEN-SLC `days_to_exhaustion` in [105, 135] (exhaustion in March 2027); every other corridor has exhaustion_date null or >= 2027-05-16.

## 2. SLA exposure at risk (`mv_sla_exposure`)

**Source:** `sim_failure_result` (and its explode view `v_sim_failure_customer_impact`) joined to `sla_exposure_by_span`, `physical_resource`, `customer`, `service`, `service_level_agreement`, `maintenance_window`.
**Grain:** sim_id (one simulated failure of one resource: span, node or site), with resource, corridor, SRLG, scenario_type dimensions.

| Metric | Formula | Notes |
| --- | --- | --- |
| `sla_exposure_mrr` | SUM over DOWN active services of `service.mrr x service_level_agreement.credit_pct / 100` | Matches the contract definition of `sim_failure_result.sla_exposure_mrr`. SRLG-expanded: failing a span fails every span in its SRLG |
| `sla_exposure_annualized` | 12 x `sla_exposure_mrr` | For executive readouts |
| `mrr_at_risk` | SUM(mrr) of DOWN active services (no credit factor) | Revenue whose service is fully down |
| `degraded_mrr` | `sim_failure_result.degraded_mrr` | Services that lose protection but stay up; reported separately, never added to exposure |
| `affected_services` | COUNT DISTINCT service_id DOWN | |
| `affected_customers` | COUNT DISTINCT customer_id with at least one DOWN service | Never sum per-service counts |
| `dual_path_both_failed_customers` | `size(dual_path_both_failed_customer_ids)` | Customers sold diverse paths that lose both. S-4471 = 12 (acceptance query 1) |
| `max_single_event_exposure_mrr` | MAX(sla_exposure_mrr) across sims | "Top SLA-exposure spans" ranking on the dashboard |
| `next_window_exposure_mrr` | `sla_exposure_mrr` of the sim for the span of the earliest `maintenance_window` with status `scheduled` and start_ts >= 2026-11-16 | Answers Genie Q4. Contract: that window is on S-4471 (2026-11-20 06:00 UTC) |

**Rules:** do not add exposure across sims (each sim is an independent what-if; totals across sims double count). Rank and compare instead. Node blast radius (Genie Q8, "node failure in Chicago") filters `scenario_type='node'` and the node's corridor city code `CHI`.
**Expected demo values:** S-4471 row has `dual_path_both_failed_customers = 12` and `sla_exposure_mrr > 0`; `v_sim_failure_customer_impact` returns 12 rows with `both_paths_failed = TRUE`.

## 3. Copper decommissioning readiness (`mv_copper_readiness`)

**Source:** `copper_wire_center` joined to `customer` (`copper_wc_id`) and `service` for customer MRR.
**Grain:** wc_id (wire center), dimension `state`.

| Metric | Formula | Notes |
| --- | --- | --- |
| `copper_miles` | SUM(copper_miles) | |
| `active_circuits` | SUM(active_circuits) | Circuits still to migrate |
| `high_value_customers` | `copper_wire_center.high_value_customers` | Must reconcile with COUNT(customer WHERE copper_wc_id = wc_id AND high_value_flag); a mismatch is a DQ failure, not a metric |
| `high_value_mrr_to_migrate` | SUM(service.mrr) of active services of high-value customers in the wire center | Revenue protected by migrating before retirement |
| `retirement_readiness_score` | `copper_wire_center.retirement_readiness_score` (0-100, higher = readier) | Reused from `gold_wire_center_scorecard` where available |
| `days_to_decommission` | DATEDIFF(decommission_target, DATE'2026-11-16') | |
| `migration_risk_flag` | TRUE when `high_value_customers > 0 AND decommission_target < DATE'2027-06-01'` | Mirrors acceptance query 3. Exactly one IA wire center is flagged (target 2027-05-01, 3 customers) |
| `sequence_rank` | Within a state: order by `migration_risk_flag DESC, days_to_decommission ASC, retirement_readiness_score DESC` | "Copper sequencing queue"; answers Genie Q5. Flagged centers come first because their migrations gate the proceeds |

**Genie Q7** ("customers affected by retiring the Iowa wire center") lists `customer` rows with `copper_wc_id` = the flagged IA wc_id: expected 3 high-value customers.

## 4. Value model levers (`v_value_readout`, P6-VALUE-READOUT)

Three scenarios with tunable assumptions (parameters in a small `value_model_assumptions` table or view columns; no hard-coded totals).

| Lever | Input | Formula | Low | Base | High |
| --- | --- | --- | --- | --- | --- |
| Capex avoidance | 2026 capex midpoint $3.3B | capex x avoidance_pct (1.0% / 1.5% / 2.5%) | $33.0M | $49.5M | $82.5M |
| Proactive operations savings | $10M/yr copilot estimate | $10M x multiplier (0.8 / 1.5 / 2.5) | $8.0M | $15.0M | $25.0M |
| Copper proceeds protection | $1.25B over 5 yrs = $250M/yr | $250M x uplift_pct (2% / 4% / 6%) | $5.0M | $10.0M | $15.0M |
| **Total** | | sum of levers | **$46.0M** | **$74.5M** | **$122.5M** |

Verified arithmetic on 2026-11-17 (3,300 x 1.0/1.5/2.5% = 33.0/49.5/82.5; 10 x 0.8/1.5/2.5 = 8/15/25; 250 x 2/4/6% = 5/10/15; totals 46.0/74.5/122.5). Assumptions to validate with the customer: avoidance %, savings multiplier, copper uplift %. Label the readout as a model estimate, not a forecast of recognized savings.

## 5. Genie sample question -> metric mapping (P4-GENIE-SPACE)

| # | Question (verbatim) | Primary source |
| --- | --- | --- |
| 1 | What breaks if span S-4471 goes down? | `mv_sla_exposure` + `v_sim_failure_customer_impact` |
| 2 | Which corridors exhaust within 6 months? | `mv_corridor_utilization.exhaustion_band` |
| 3 | Which Dual Path customers share a common SRLG? | `customer.dual_path_flag` + `service` + `physical_resource.srlg` |
| 4 | What is the SLA exposure of the next maintenance window? | `mv_sla_exposure.next_window_exposure_mrr` |
| 5 | Which copper wire centers should be sequenced first in Iowa? | `mv_copper_readiness.sequence_rank` (state = IA) |
| 6 | What is the utilization trend on DEN-SLC? | `mv_corridor_utilization` by date |
| 7 | Which customers would be affected by retiring the Iowa wire center? | `customer.copper_wc_id` for the flagged IA wire center |
| 8 | What is the blast radius of a node failure in Chicago? | `mv_sla_exposure` (scenario_type = node, CHI) |

## 6. Status of inputs (2026-11-17)

Present in `cdm_tmforum.network_scenario_twin`: `corridor` (DEN-SLC capacity 9,600, baseline 55 -> end 85), `customer` (120 rows, 12 dual_path_flag), `resource_specification`, `dq_customer_candidate_pool`. Not yet built: the other 11 spec tables, gold tables (P2-SDP-GOLD) and model outputs (P3-*). Metric views are built once their dependencies complete.

## Changelog
* v1.0 2026-11-17 @data-analyst: initial definitions for the three metric views, value model, and Genie mapping.
