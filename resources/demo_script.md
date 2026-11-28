# Lakelink Fiber Network Scenario Twin: 5-Minute Demo Script

_Owner: @pm. Task: P6-DEMO-SCRIPT. Source storyline: `project_plan.md` section 11.4. Acceptance: section 11.5 (D-005). Tag: `telco_project: network_scenario_twin`._

**Audience persona:** a Lakelink Fiber network planner in the CTO organization.
**Positioning (D-003):** the twin is the intelligence layer above the inventory system of record. It is not an inventory system.
**Data note:** all customer names, IDs and amounts are synthetic (`origin = SYNTHETIC`, `simulation_run_id = nst-sim-001`). Demo window 2026-08-18 to 2026-11-16 (D-002).

## Surfaces used

| Surface | Name | Location |
| --- | --- | --- |
| Databricks App (the only one) | Lakelink Fiber Scenario Twin (`lakelink-scenario-twin`) | https://lakelink-scenario-twin-7474656585748611.aws.databricksapps.com |
| In-app assistant | Lakelink Fiber Splice (drawer, top-right toggle) | Agent Bricks endpoint `mas-4a251ff6-endpoint` |
| Genie space | Lakelink Fiber Network Scenario Twin | `01f1e76a824b11f3819e54acb220681f` |
| AI/BI dashboard | Lakelink Fiber Network Scenario Twin | `01f1e79cc35f13ef90e0822b423f2a14` |
| UC schema | `cdm_tmforum.network_scenario_twin` | sim_failure_result, sim_capacity_forecast, copper_wire_center |

## Pre-flight checklist (T-15 min)

1. Open the app in a browser signed in as a `telco-builders` member. Confirm the three views load: Blast radius, Corridor exhaustion, Copper sequencing.
2. Open the Splice drawer and ask the Wow 1 question once to warm the endpoint (the first call can be slow).
3. Open the Genie space in a second tab as a fallback.
4. Run the 3 acceptance queries (appendix) and confirm: 12 / 75,472.41; 2027-03-16; IA-WC-01.
5. Close other tabs. Zoom the browser to 110% for readability.

## Script

### 0:00 to 0:40, Opening pain

**Say:** "When someone asks what breaks if we take that span down, I need three days and two favors. Lakelink Fiber's inventory platform tells us what we own. It doesn't tell us what happens next. The Scenario Twin is the layer above inventory that answers 'what if'."

**Show:** the app landing page with KPI hero cards.

### 0:40 to 2:00, Wow 1: blast radius of S-4471

**Do:** open the Splice drawer and ask: **"What breaks if span S-4471 goes down?"** (or go to Blast radius and select S-4471).

**Expected answer:**
* Simulation SIM-0151 expands S-4471 to S-4472 because both spans share **SRLG-88** (same conduit, CHI-DEN corridor).
* **12 Dual Path customers** lose both paths (12 services DOWN, 0 degraded).
* **SLA exposure: USD 75,472.41 per month.** A "Blast radius simulation" citation chip appears.

**Say:** "These 12 customers paid for diversity. On paper they have it. In the ground, both paths run through the same conduit. The twin found that in seconds, with the dollars attached, before anyone schedules a maintenance window."

### 2:00 to 3:15, Wow 2: DEN-SLC corridor exhaustion

**Do:** go to Corridor exhaustion and open **DEN-SLC (RapidRoute)**.

**Expected:**
* Observed utilization climbs from about 55% (Aug 2026) to about 85% (mid-Nov 2026) on an AI-traffic growth curve.
* Forecast crosses the **95% exhaustion threshold on 2027-03-16, 120 days** after 2026-11-16 (P10 to P90: 2027-03-01 to 2027-04-02).
* Pre-build trigger is already due (Genie readback by @qa on 2026-11-27: 2026-12-16).

**Say:** "AI traffic is making static planning assumptions obsolete. The twin tells planning when to start the build, not after customers feel it."

### 3:15 to 4:20, Wow 3: Iowa copper sequencing

**Do:** go to Copper sequencing and filter state = IA.

**Expected (D-011 order):**
* **#1 IA-WC-01, Lakelink Fiber Ames Central WC:** 3 high-value customers, 1,487 active circuits, 204.9 copper miles, decommission target **2027-05-01**, readiness 58.3.
* #2 IA-WC-05 (0 high-value customers, target 2027-03-01).

**Say:** "IA-WC-01 ranks first because three high-value customers must migrate before the May 2027 target. Miss that, and the retirement slips and the proceeds are at risk."

### 4:20 to 5:00, Close

**Show:** dashboard value readout (model estimate, to validate with Lakelink Fiber).

**Say:** "$74.5 million a year (range $46.0M to $122.5M) in better builds, fewer surprises, and protected copper proceeds. It runs on one governed platform: Unity Catalog, streaming telemetry, ML simulation and forecasting, and natural-language access."

## Fallbacks

| Problem | Fallback |
| --- | --- |
| Splice drawer errors or is slow | Ask the same question in the Genie space tab (verified by @qa 2026-11-27 for all three wows). Do not rely on the in-app Genie mode until the app SP has CAN_RUN on the space (P5-APP-GENIE-SP-GRANT). |
| App will not load | Use the AI/BI dashboard plus Genie space. |
| Audience asks "is this your inventory?" | No. Inventory stays the system of record; the twin syncs from it (D-003). |

## Appendix: acceptance queries (section 11.5), verified 2026-11-28 by @pm

Run in `cdm_tmforum.network_scenario_twin`:

1. `SELECT * FROM sim_failure_result WHERE resource_id = 'S-4471'` -> SIM-0151, affected_customers = 12, sla_exposure_mrr = 75,472.41. Per-customer table: 12 distinct customers, each with non-zero exposure (103.86 to 16,667.05).
2. `SELECT corridor_id, exhaustion_date FROM sim_capacity_forecast WHERE corridor_id = 'DEN-SLC'` -> 2027-03-16 on all 12 rows (days_to_exhaustion = 120).
3. `SELECT * FROM copper_wire_center WHERE state = 'IA' AND high_value_customers > 0 AND decommission_target < '2027-06-01'` -> IA-WC-01 only.
