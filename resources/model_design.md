# Lakelink Fiber Network Scenario Twin: Model Design

| Item | Value |
| --- | --- |
| Owner | @ml-engineer |
| Task | P0-MODEL-DESIGN |
| Status | v1.0, 2026-11-17 |
| UC target | `cdm_tmforum.network_scenario_twin` |
| Tag | `telco_project: network_scenario_twin` on every table, model, function, experiment, and endpoint |
| Acceptance | project_plan.md section 11.5, queries 1 and 2 (D-005) |
| MLflow experiment | `/Users/stephen.hage@databricks.com/network-scenario-twin/experiments/nst_models` |

This document covers the four ML deliverables (corridor forecast, blast radius, telemetry anomaly detection, twin copilot), the features they need, how they are evaluated, and the champion/challenger plan. Company name is always Lakelink Fiber. The twin is the intelligence layer above the inventory system of record (D-003); every output here is a simulation or forecast, never an inventory record.

---

## 0. Reuse inventory (REUSE FIRST directive)

Checked in `cdm_tmforum` on 2026-11-17 before designing anything new.

| Existing asset | What we reuse | What we do not reuse |
| --- | --- | --- |
| `fiber_capital_intelligence.corridor_demand_forecast_model` (LightGBM, champion v1 long-haul, champion-metro v2) | Training/registry pattern, stratified long-haul vs metro split, alias conventions | The model itself. It predicts a 90-day demand_score on 1,077 corridors and is not a utilization-percent forecast. |
| `fiber_capital_intelligence.corridor_demand_forecast` (`ep_dc_mw_next12`, `ep_dc_mw_online_now`, `canonical_corridor_key`) | Exogenous **AI growth signal** (data center MW coming online) joined via `corridor_reference.source_id` to `canonical_corridor_key` | Demand score as a target |
| `provable_resilience_intelligence.service_path` and its BFS/edge-disjoint path notebook (ID 2698138752964459) | Working/protect path traversal pattern for the blast-radius graph | PRI span IDs and topology. Different network. |
| `provable_resilience_intelligence.derived_srlg_*` | SRLG derivation logic, used only as a cross-check | Derived SRLGs. Twin SRLGs come from `physical_resource.srlg`. |
| `provable_resilience_intelligence.optical_anomaly_detector` (StandardScaler + IsolationForest, champion v2) | Pipeline shape for the anomaly challenger | Trained weights. It was trained on OSNR/BER; twin telemetry has utilization/latency/optical_margin_db. |
| `provable_resilience_intelligence.reroute_recommender`, `fiber_capital_intelligence.scenario_build_queue` (UC functions) | Signature and comment conventions for copilot tools | Logic |

Net new: three UC models, three UC functions, one feature table, one anomaly output table, and one copilot. No new app (D-004).

---

## 1. Feature table (P3-FEATURES)

**Table:** `cdm_tmforum.network_scenario_twin.corridor_feature_daily`
**Grain:** one row per `(corridor_id, feature_date)`. 40 corridors x 91 days = 3,640 rows.
**Source:** gold `corridor_utilization_daily` (P2-SDP-GOLD), `corridor`, `service`, plus the exogenous signal.

| Feature | Definition |
| --- | --- |
| `util_mean_pct`, `util_p95_pct`, `util_max_pct` | Daily corridor utilization, capacity-weighted across member spans |
| `util_7d_mean_pct`, `util_28d_mean_pct` | Trailing means. 7d mean is the forecast target (matches the generator ground truth). |
| `slope_7d`, `slope_28d` | OLS slope of daily mean, pct-points/day |
| `t_days` | Days since 2026-08-18 |
| `ln1p_t` | `ln(1 + k_ref * t_days)` with `k_ref = 0.108783`. This is the **AI growth regressor** term. |
| `ai_growth_index` | Exogenous: `ep_dc_mw_next12 / NULLIF(ep_dc_mw_online_now, 0)` from fiber_capital, normalized to [0,1] across corridors. Null becomes 0 with flag `ai_signal_missing`. |
| `capacity_gbps`, `route_type` (long_haul / metro), `is_diverse_route` | From `corridor` |
| `n_spans`, `n_services`, `mrr_on_corridor` | Counts and sums from topology and service |
| `origin`, `simulation_run_id` | Provenance (SYNTHETIC / MIXED, `nst-sim-001`) |

Required upstream columns, requested from @data-engineer in task P3-DE-FEATURE-INPUTS: gold `corridor_utilization_daily` must expose `corridor_id`, `util_date`, daily mean/p95/max utilization, and `capacity_gbps`. `corridor` must carry `source_id` so the join to `canonical_corridor_key` works.

---

## 2. Corridor utilization forecast (P3-FORECAST-MODEL)

### 2.1 Problem
Forecast the monthly corridor utilization for 12 months (2026-12 to 2027-11) and the date utilization first crosses the exhaustion threshold. Output: `sim_capacity_forecast`, 40 x 12 = **480 rows**.

### 2.2 Champion: parametric AI-growth curve (`log_growth_v1`)
For each corridor, fit `u(t) = a + b * ln(1 + k * t)` to the daily 7-day means, using bounded nonlinear least squares (`a in [0,100]`, `b in [0,200]`, `k in [1e-4, 5]`).
* The concave log form matches how AI backbone demand behaves: steep early growth that then decelerates. It is also the shape the generator uses (`data/corridor_generator_config.json`).
* Corridors with no material trend (fitted `b*ln(1+k*90) < 2` pct-points) fall back to a **damped linear** trend (slope x 0.5) so flat corridors do not spuriously exhaust.
* The `ai_growth_index` multiplies `b` by `(1 + 0.25 * ai_growth_index)` for months 7-12 only. This is a scenario lever with a default weight of 0.25. It is logged as a model parameter and can be set to 0.
* **Exhaustion threshold:** 95% (`exhaustion_threshold_pct`, per generator config). `exhaustion_date` is the first day where `u(t) >= 95`. It is NULL if not crossed within 365 days of 2026-11-16.
* **Uncertainty bands:** 200-sample bootstrap over daily residual blocks (7-day blocks). Output P10/P50/P90 for utilization and exhaustion date.

### 2.3 Challenger: LightGBM global model (`lgbm_global_v1`)
One global model across corridors on `corridor_feature_daily`. Target is `util_7d_mean_pct` at horizon h. Features are lags, slopes, `ln1p_t`, `ai_growth_index`, and `route_type`. A recursive multi-step forecast produces the 12-month path. This reuses the fiber_capital LightGBM pattern.

### 2.4 Naive baseline (logged, never promoted): linear trend over 90 days.

### 2.5 Prototype evidence (2026-11-17, synthetic replica of the DEN-SLC curve, seed 4471, Gaussian noise sd 3 plus diurnal amplitude 4)

| Method | Predicted DEN-SLC exhaustion (days after 2026-11-16) | Ground truth |
| --- | --- | --- |
| Log-growth (champion design) | 111.7 (bootstrap P10/P50/P90: 105.9 / 111.6 / 116.5) | 120 (2027-03-16) |
| Linear trend (baseline) | 23.7 | 120 |

A linear model fit over the window overstates exhaustion urgency by roughly 5x, because the curve is concave. This contrast is the reason the AI-growth regressor exists. It also makes a good demo talking point.

### 2.6 Output schema `sim_capacity_forecast`
`forecast_id, corridor_id, month (DATE, first of month), forecast_utilization_pct (P50), forecast_p10_pct, forecast_p90_pct, exhaustion_date, exhaustion_date_p10, exhaustion_date_p90, days_to_exhaustion, exhaustion_threshold_pct, model_name, model_version, model_alias, mlflow_run_id, forecast_generated_at, origin, simulation_run_id`

### 2.7 Evaluation and promotion gates
| Gate | Threshold |
| --- | --- |
| Acceptance query 2 | DEN-SLC `exhaustion_date` within **2027-03-01 to 2027-03-31** (about 120 days, +/-15 days of 2027-03-16) |
| False exhaustion | 0 of the other 39 corridors exhaust before 2027-05-16 (6 months). Generator max non-DEN-SLC end utilization is 72.6%. |
| Holdout accuracy | Train days 0-62, test days 63-90. MAPE on 7-day mean <= 3% overall and <= 5% on every route_type slice. |
| Band calibration | Holdout coverage of P10-P90 between 70% and 90% |
| Row count | Exactly 480 rows, 40 distinct corridor_id, 12 months each |

The challenger is promoted only if it passes all gates and beats the champion's holdout MAPE by at least 10% relative.

---

## 3. Blast-radius simulation (P3-BLAST-RADIUS)

### 3.1 Graph
The graph is a directed dependency graph built from the twin tables (Spark plus NetworkX in a pandas UDF, or a GraphFrames-free pure-SQL fallback):
* `site --hosts--> node`, `node --connectsTo--> span` (physical_resource)
* `logical_resource --realizesOn--> physical_resource` (parent_id chain, wavelength to span)
* `service --uses--> logical_resource`. Each service has a working path and, for Dual Path / protected services, a protect path.
* `service_level_agreement --governs--> service`, `customer --subscribesTo--> service`

### 3.2 Failure semantics (SRLG-aware, champion `srlg_graph_v1`)
1. **Failure set.** A failure of resource r takes down `{r}`, all descendants of r (node failure kills attached spans), and **every span that shares an SRLG with r**. A physical conduit cut fails the whole risk group.
2. **Logical propagation.** A logical resource fails if any physical resource in its realization chain is in the failure set.
3. **Service state.** An unprotected service is DOWN if its working path is hit. A protected or Dual Path service is DOWN only if **both** working and protect paths are hit. It is DEGRADED if exactly one is hit.
4. **Exposure.** `sla_exposure_mrr = SUM(service.mrr * sla.credit_pct)` over DOWN services. Degraded services are reported separately in `degraded_mrr` and are not included in exposure.

### 3.3 Challenger: `path_only_v1` (SRLG-blind)
Same graph, but step 1 ignores SRLG membership. This is how inventory-only tools evaluate diversity. For S-4471 it should report the 12 Dual Path customers as DEGRADED (protect path survives), not DOWN. The challenger is never promoted. It is kept as the counterfactual that quantifies the hidden risk SRLG awareness exposes. The dollar delta between the two models is a headline demo metric.

### 3.4 Scenario set (500 sims)
* 150 node failures
* 300 span failures. S-4471 and S-4472 are always included. The rest are the highest-MRR spans, then random with seed 4471.
* 50 sites

The result is 500 rows. Planned maintenance windows (`maintenance_window`) are also scored by reusing the span failure result for the window's span.

### 3.5 Output schema `sim_failure_result`
`sim_id, scenario_type (node|span|site), resource_id, srlg_expanded_resource_ids ARRAY<STRING>, affected_services INT, affected_service_ids ARRAY<STRING>, affected_customers INT, affected_customer_ids ARRAY<STRING>, dual_path_both_failed_customer_ids ARRAY<STRING>, degraded_services INT, sla_exposure_mrr DECIMAL(18,2), degraded_mrr DECIMAL(18,2), model_name, model_version, mlflow_run_id, simulated_at, origin, simulation_run_id`

**Acceptance query 1 shape (open item for P0-DATA-CONTRACTS):** the query `SELECT * FROM sim_failure_result WHERE resource_id = 'S-4471'` must surface the 12 Dual Path customers. Proposed: keep the spec's 500-row grain (one row per sim) with `affected_customer_ids` / `dual_path_both_failed_customer_ids` arrays, plus a companion view `v_sim_failure_customer_impact` (sim_id, resource_id, customer_id, sla_exposure_mrr) that explodes to one row per customer. @data-planner confirms this in the data contracts.

### 3.6 Evaluation gates
| Gate | Threshold |
| --- | --- |
| Acceptance query 1 | S-4471 row: `srlg_expanded_resource_ids` contains S-4472 (shared SRLG-88), `cardinality(dual_path_both_failed_customer_ids) = 12`, those 12 match `customer` Dual Path flags, `sla_exposure_mrr > 0` |
| Symmetry | S-4472 sim yields the same 12 Dual Path customers DOWN |
| Counterfactual | `path_only_v1` on S-4471 gives 0 Dual Path customers DOWN and 12 DEGRADED |
| Invariants | `affected_customers <= affected_services`; exposure >= 0; no DOWN service with a surviving path (property test on 1,000 random checks) |
| Row count | 500 rows, unique sim_id, unique resource_id |
| Determinism | Two runs with the same seed produce identical output (hash compare) |

### 3.7 Ground truth for S-4471 (P3-BLAST-RADIUS-GROUND-TRUTH, 2026-11-19)

Computed by ad-hoc SQL over the generated tables (run `nst-sim-001`), with the section 3.2 semantics: the failure set is S-4471 plus every span in its SRLG; a logical resource fails if its `span_id` is in that set (verified that `span_id` is identical down the port -> wavelength -> OCh chain, 0 mismatches); only `status = 'active'` services count; `sla_exposure_mrr = SUM(mrr * credit_pct / 100)` over DOWN services (data_contracts.md s2.13). P3-BLAST-RADIUS and P3-QA-VALIDATION must match these values exactly.

* **Failure set:** `[S-4471, S-4472]` (SRLG-88, conduit CDT-BB-0017). No other span has SRLG-88.
* **DOWN services:** 12, all `dual_path`, active. **DEGRADED:** 0. No unprotected or protected service rides S-4471 or S-4472, and no pending or disconnected service touches them.
* **`dual_path_both_failed_customer_ids` (12, sorted):** `[10384, 10897, 12930, 12992, 13642, 14513, 14870, 17014, 17041, 17747, 18793, 19982]`. This is exactly the set with `customer.dual_path_flag = TRUE` (set difference 0 both ways).
* **`affected_service_ids` (12, sorted):** `[19313, 31061, 32479, 37127, 70755, 87059, 94167, 95982, 100034, 100830, 103477, 107506]`.
* **Total MRR on DOWN services:** 538,687.72. **Total `sla_exposure_mrr`:** **75,472.41** (the sum of the per-customer values rounded to 2 dp is 75,472.40; compare the unrounded total).
* **Symmetry:** failing S-4472 gives the same 12 customers and 75,472.41.
* **Counterfactual `path_only_v1` (SRLG-blind) on S-4471:** 0 DOWN, 12 DEGRADED, `degraded_mrr` 538,687.72, exposure 0. The SRLG-aware model therefore surfaces 75,472.41/month of SLA exposure that an inventory-only diversity check misses.

| customer_id | service_id | segment | mrr | sla_exposure_mrr |
| --- | --- | --- | --- | --- |
| 10384 | 103477 | enterprise | 46,439.72 | 3,543.35 |
| 10897 | 70755 | enterprise | 90,098.79 | 7,370.08 |
| 12930 | 32479 | enterprise | 84,551.01 | 10,027.75 |
| 12992 | 94167 | enterprise | 43,045.37 | 7,399.50 |
| 13642 | 107506 | enterprise | 7,773.42 | 779.67 |
| 14513 | 87059 | smb | 46,769.26 | 9,466.10 |
| 14870 | 100034 | enterprise | 691.05 | 103.86 |
| 17014 | 19313 | enterprise | 56,160.89 | 7,458.17 |
| 17041 | 95982 | wholesale | 81,183.89 | 16,667.05 |
| 17747 | 37127 | enterprise | 2,887.34 | 322.80 |
| 18793 | 31061 | enterprise | 12,306.17 | 974.65 |
| 19982 | 100830 | wholesale | 66,780.81 | 11,359.42 |

---

## 4. Telemetry anomaly detection (P3-ANOMALY-DETECT)

**Purpose:** keep the twin honest by flagging span telemetry that disagrees with expected behavior (sensor faults, silent degradation) before it pollutes forecasts.
* **Champion `robust_resid_v1`:** per span and metric (utilization_pct, latency_ms, optical_margin_db), compute the residual from a seasonal baseline: a 7-day trailing median by hour-of-day, plus the corridor trend from section 2. Flag when the robust z-score (|resid| / 1.4826*MAD) exceeds 4 for 2 or more consecutive hours. Optical margin also has a hard floor of < 3 dB.
* **Challenger `iforest_v1`:** StandardScaler + IsolationForest on hourly vectors. This reuses the PRI `optical_anomaly_detector` pipeline shape, retrained on twin telemetry.
* **Output:** `cdm_tmforum.network_scenario_twin.telemetry_anomaly` with columns (span_id, ts, metric, observed, expected, robust_z, anomaly_score, severity, model_name, model_version, mlflow_run_id).
* **Evaluation:** the generator has no labeled anomalies, so evaluation injects 200 labeled episodes (spikes, flatlines, step drops) into a holdout copy. Targets: precision >= 0.8, recall >= 0.8. Must-not-flag check: the DEN-SLC AI-growth trend is real demand, so it must produce fewer than 1% flagged hours on DEN-SLC spans.

---

## 5. Slice and fairness testing (P3-SLICE-TESTING)

| Model | Slices |
| --- | --- |
| Forecast | route_type (long_haul / metro), diverse vs primary, capacity tier (4,800 / 9,600 / 19,200), endpoint city, ai_signal_missing |
| Blast radius | scenario_type (node / span / site), customer segment, naas_flag, protected vs unprotected |
| Anomaly | metric, corridor, route_type |

Rule: any slice with error more than 1.5x the overall error, or with fewer than 3 members, gets a feature request to @data-engineer through agent_tasks (assigned_by `@ml-engineer`).

---

## 6. MLflow tracking and UC registry (P3-MODEL-REGISTRY)

| UC model | Champion alias | Challenger alias | Flavor |
| --- | --- | --- | --- |
| `cdm_tmforum.network_scenario_twin.corridor_util_forecast` | `log_growth_v1` | `lgbm_global_v1` | pyfunc (curve params per corridor as artifact) |
| `cdm_tmforum.network_scenario_twin.blast_radius_sim` | `srlg_graph_v1` | `path_only_v1` (counterfactual, never promoted) | pyfunc wrapping the graph engine |
| `cdm_tmforum.network_scenario_twin.telemetry_anomaly_detector` | `robust_resid_v1` | `iforest_v1` | pyfunc / sklearn |

* Aliases are `champion` and `challenger` on every model. `previous_champion` is kept on a promotion so rollback takes one alias move.
* Every run logs params, metrics for every gate above, the input table version (Delta version of each source), the git commit, `simulation_run_id`, and signature plus input example. Every run is tagged `telco_project=network_scenario_twin`.
* Output tables record `model_version` and `mlflow_run_id` for lineage.
* Promotion happens only when all gates pass, and is recorded in the Lakebase `decisions` table.

---

## 7. UC tool functions (P5-UC-TOOLS)

All three are SQL table functions in `cdm_tmforum.network_scenario_twin`. Each is commented, tagged, and reads gold or sim tables only (read-only).

| Function | Returns | Source |
| --- | --- | --- |
| `blast_radius(resource_id STRING)` | Failure set, affected services/customers, Dual Path both-failed customers, sla_exposure_mrr, degraded_mrr | `sim_failure_result` + `v_sim_failure_customer_impact` |
| `corridor_forecast(corridor_id STRING)` | 12 monthly P10/P50/P90 values, exhaustion date and band, days to exhaustion, implied pre-build trigger date (exhaustion minus 180-day build lead time) | `sim_capacity_forecast` |
| `copper_sequence(state STRING)` | Wire centers ranked for sequencing (D-011, 2026-11-24): flagged first (`high_value_customers > 0 AND decommission_target < 2027-06-01`, exposed as `migration_required_before_target`), then decommission_target asc, high_value_customers desc, active_circuits asc, copper_miles desc (proceeds). Verified IA order: IA-WC-01 (flagged, 3 HVC, 2027-05-01), IA-WC-05, IA-WC-07, IA-WC-02, IA-WC-03, IA-WC-04, IA-WC-06, IA-WC-08 | `copper_wire_center` |

---

## 8. Twin copilot (P5-TWIN-COPILOT)

* **Build:** an Agent Bricks Supervisor Agent named "Lakelink Fiber Twin Copilot". Its tools are the Genie space "Lakelink Fiber Network Scenario Twin" (P4-GENIE-SPACE) and the 3 UC functions. Instructions require it to cite the twin table or function behind every number, to say "simulated" or "forecast" when describing sim outputs, and to always use the name Lakelink Fiber.
* **Guardrails:** handled by @devops in P5-AI-GATEWAY (usage logging, PII, safety).
* **Evaluation (`mlflow.genai.evaluate`):** a dataset of 8 Genie sample questions + 3 acceptance questions + 3 change-request rows (delete span, update span capacity, schedule a maintenance window) + 3 adversarial rows (a real-carrier name prompt, an out-of-scope poem request, an ambiguous resource ID S-44), 17 rows in total. Answers are generated once and judged 3x; the per-row majority is the score.
* **Judge scope (D-012, P5-COPILOT-JUDGE-SCOPE-APPLY):** `read_only_positioning` is scored only on change-request rows (n=3). `RelevanceToQuery` is scored only on in-scope analytics rows (Genie + acceptance, n=11). The new `appropriate_decline_or_clarify` judge is scored on change-request + adversarial rows (n=6). Correctness, cites, brand, and safety are scored on all 17 rows. Each run logs scoped means (`<scorer>/scoped_majority_mean`, the gate) and unscoped means (`<scorer>/unscoped_majority_mean`, diagnostic only).

| Scorer | Pass bar |
| --- | --- |
| `Correctness` with expected facts (12 Dual Path customers on S-4471; DEN-SLC exhaustion about 2027-03; flagged Iowa WC id) | >= 90% |
| `Guidelines`: cites a twin table or function | >= 95% |
| `Guidelines`: brand (Lakelink Fiber only; no real company or executive names) | 100% |
| `Guidelines`: read-only, intelligence-layer positioning (D-003) | 100% |
| `RelevanceToQuery` (analytics rows only), `Safety` | >= 95% |
| `Guidelines`: appropriate_decline_or_clarify (change-request + adversarial rows) | >= 95% |

---

## 9. Build order and dependencies

P2-SDP-GOLD -> P3-FEATURES -> P3-FORECAST-MODEL. In parallel, P2-SDP-GOLD -> P3-BLAST-RADIUS. Both feed P3-MODEL-REGISTRY -> P5-UC-TOOLS. P5-UC-TOOLS and P4-GENIE-SPACE feed P5-TWIN-COPILOT. P3-ANOMALY-DETECT and P3-SLICE-TESTING run off the critical path.

Notebook budget (2-for-1 consolidation rule): no more than 3 notebooks under `src/ml/`: `nst_forecast` (features, forecast, and registration), `nst_blast_radius` (graph, sims, and registration), and `nst_copilot` (UC tools, agent, and eval). Anomaly detection lives inside `nst_forecast` as a section.

## 10. Open items
1. Acceptance query 1 row shape (section 3.5). Owner: @data-planner in P0-DATA-CONTRACTS.
2. Gold `corridor_utilization_daily` columns and `corridor.source_id`. Owner: @data-engineer in P3-DE-FEATURE-INPUTS.
3. `customer` must carry a Dual Path flag, and `service` must carry working/protect path references (span lists), for section 3. Owner: @data-engineer in P1-GEN-SERVICE. RESOLVED 2026-11-19: `customer.dual_path_flag` and `service.primary_/protect_logical_resource_id` -> `logical_resource.span_id` are present and verified in section 3.7.
