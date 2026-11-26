# Project Plan: Lakelink Fiber Network Scenario Twin

> Source research: "Use Case of the Week | 2026-11-16 | Network Scenario Twin" (Google Doc `1xSsUOuq9w3MMqH_wbJoViV4gpfwkLkDqIOvv1BGc2_g`).
> BRANDING RULE: every produced asset uses **Lakelink Fiber** as the company name. The research doc references a real carrier; never carry real company or executive names into schemas, data, comments, apps, dashboards, Genie spaces, or docs.

| Item | Value |
| --- | --- |
| Project name | `network-scenario-twin` |
| Workspace folder | `/Users/stephen.hage@databricks.com/network-scenario-twin` (Git folder) |
| UC target | `cdm_tmforum.network_scenario_twin` |
| Lakebase task board | `telco-network-scenario-twin-project` |
| Tagging mandate | `telco_project: network_scenario_twin` on every asset |
| Demo date anchor | 2026-11-16 (data window 2026-08-18 to 2026-11-16) |

---

## 1. Executive summary

The Network Scenario Twin is a governed, always-current digital twin of Lakelink Fiber's physical and logical network on Databricks. It is synced from the consolidated inventory system of record and live telemetry, and lets Network Ops, Planning, and Service Assurance **simulate failures, forecast corridor exhaustion, and sequence copper decommissioning** before committing capital or scheduling maintenance.

* Base-case value: **$74.5M/yr** (avoided misallocated capex + proactive ops savings + protected copper proceeds).
* Why Databricks: one platform for a governed unified data model (Unity Catalog), streaming telemetry, ML simulation and forecasting, and natural-language access (Genie, Agent Bricks).
* Why now: inventory consolidation is creating the first trustworthy source of network truth, while AI traffic growth (>1,000% on the backbone since April) is making static planning assumptions obsolete.
* Positioning: the twin is **not** an inventory system. The inventory platform remains the system of record; the twin is the intelligence layer above it (simulation, forecasting, NL reasoning). It is distinct from Fiber Build Capital Allocation Intelligence (which builds to fund) and Provable Resilience Intelligence (path-diversity scoring for selling).

## 2. Strategic alignment (Lakelink Fiber leadership themes)

* CEO: "instantaneously create a digital network" with digital twin technology, tied to AI ambitions.
* CEO: AI demand requires moving data "from anywhere to anywhere instantly, securely"; AI backbone traffic +1,000% Apr to Nov, total backbone traffic +20% YTD.
* CTO: "AI is making demand harder to predict, not easier" — on-demand connectivity presupposes a network state that can be reasoned over in real time.
* CFO: $700M annualized run-rate savings by end of 2026, $1B by exit 2027; 2026 capex $3.2B to $3.4B.
* Network resilience program: 380+ automated workflows (~5M runs/yr), 80% of issues auto-resolved, GenAI diagnostics deflects 35% of tickets. The twin extends this from reactive resolution to pre-event simulation.
* Copper: $1B to $1.5B pre-tax net copper proceeds over 5 years; accelerated retirement in FL, IA, NV, UT.

## 3. Business value

### 3.1 Value model

| Lever | Input | Formula | Low | Base | High |
| --- | --- | --- | --- | --- | --- |
| Capex avoidance from scenario-driven build sequencing | 2026 capex $3.3B (midpoint) | capex x 1.0% / 1.5% / 2.5% | $33.0M | $49.5M | $82.5M |
| Proactive operations savings | $10M/yr existing AI operations assistant estimate | $10M x 0.8 / 1.5 / 2.5 | $8.0M | $15.0M | $25.0M |
| Copper proceeds protection | $1.25B over 5 yrs = $250M/yr | $250M x 2% / 4% / 6% | $5.0M | $10.0M | $15.0M |
| **Total** | | | **$46.0M** | **$74.5M** | **$122.5M** |

Assumptions to validate: capex avoidance %, proactive savings multiplier, copper uplift %.

### 3.2 Operational KPIs

* Time to answer "what breaks if X fails": days -> under a minute via Genie.
* Corridor exhaustion lead time: months of warning instead of discovery at provisioning.
* Maintenance blast radius: every planned window pre-scored for services, customers, SLA exposure.
* Decommissioning sequencing: wire centers ordered by migration risk and proceeds value.
* Planning throughput: extend inventory-modernization gains (8x) from lookup to simulation.

### 3.3 Databricks consumption estimate (~$25K DBU/month)

| Component | $DBU/mo | Rationale |
| --- | --- | --- |
| Lakeflow Spark Declarative Pipelines | $6K | Continuous inventory + telemetry sync |
| Serverless SQL + interactive | $5K | Twin queries, Genie serving |
| ML (forecasting, graph simulation) | $6K | Corridor demand, blast radius |
| Agent Bricks twin assistant (Lakelink Fiber Splice) | $4K | NL assistant |
| Lakebase operational state | $2K | Low-latency twin state for apps |
| AI/BI dashboards | $2K | Executive + NOC views |

## 4. Why data and AI

The question is combinatorial: a single span failure cascades through shared SRLGs, protected wavelengths, and customer SLAs. The twin keeps a live resource -> service -> customer dependency graph and computes blast radius on demand.

AI techniques: time-series forecasting (corridor demand with AI growth regressor), graph traversal (failure propagation), anomaly detection (telemetry keeps the twin honest), GenAI agent (natural-language access).

## 5. Today vs. tomorrow

| Dimension | Today (hypothesis) | With the Scenario Twin |
| --- | --- | --- |
| Latency of insight | Days for what-if analysis | Under a minute, natural language |
| Coverage | Per-domain NMS views | One governed cross-domain twin |
| Counterfactuals | Not possible | First-class simulation |
| Capex decisions | Static plans, annual cycles | Scenario-ranked, continuously updated |
| Decommissioning | Sequenced by experience | Sequenced by migration risk and proceeds |
| Governance | Fragmented across 15-17 legacy systems | Unity Catalog lineage and permissions |

## 6. Personas served

* Network Operations — pre-scored maintenance windows, blast radius before events.
* Network Planning — corridor exhaustion forecasts, build sequencing.
* Service Assurance — SLA exposure per simulated event, feeding existing workflow automation.
* Product (NaaS / on-demand internet) — capacity confidence behind on-demand promises.
* Demo persona: a Lakelink Fiber network planner in the CTO organization.

## 7. Data sources

### 7.1 First-party

| Source system | Refresh | SID domain / ABE |
| --- | --- | --- |
| Inventory system of record (consolidated) | Daily | Resource / PhysicalResource, LogicalResource |
| GIS / OSP records | Weekly | Resource / PhysicalResource |
| Optical + PCF telemetry (signal degradation, reroutes, repeater health) | Streaming | Resource / LogicalResource |
| Trouble tickets and alarms (~4M requests/yr) | Streaming | Service / TroubleTicket, Resource / Alarm |
| SLA measurements (POP-to-POP) | Daily | Service / ServiceLevelAgreement |
| Customer and service inventory (4,000+ NaaS customers) | Daily | Customer / Customer, Service / Service |
| PCF contract milestones | Weekly | Market-Sales / ProductOffering |
| Copper plant records (4 priority states) | Weekly | Resource / PhysicalResource |

### 7.2 Third-party

| Provider | Adds | SID domain |
| --- | --- | --- |
| 811 dig tickets | Excavation risk near spans | Resource / GeographicSite |
| NOAA weather, wildfire, flood | Hazard weighting for scenarios | Common / GeographicSite |
| Hyperscaler DC build announcements | Leading corridor demand signal | Market-Sales / MarketSegment |
| Copper prices (LME) | Timing of copper proceeds | Enterprise / FinancialEntity |
| FCC / BEAD broadband data | Program-driven demand | Market-Sales / MarketSegment |

**Reuse first:** @data-planner must check `cdm_tmforum` (tmf_resource, tmf_service, tmf_customer, tmf_shared, etc.) for existing tables before any new synthetic data is generated. FK values must come from existing parent tables where they exist.

## 8. TM Forum SID data model

* Resource: ResourceSpecification, PhysicalResource (spans, nodes, sites, copper plant), LogicalResource (wavelengths, ports), ResourceRelationship (contains, connectsTo, protectedBy).
* Service: Service, ServiceLevelAgreement, TroubleTicket, ServiceProblem.
* Customer: Customer, CustomerBill.
* Market/Sales: ProductOffering (NaaS, on-demand internet, PCF), ProductOrder.
* Common: GeographicSite, Location, TimePeriod.
* Enterprise: BusinessUnit, FinancialEntity.

Relationships: PhysicalResource connectsTo PhysicalResource; LogicalResource realizesOn PhysicalResource; Service uses LogicalResource; ServiceLevelAgreement governs Service; Customer subscribesTo Service; GeographicSite hosts PhysicalResource.

Open APIs: TMF639, TMF638, TMF642, TMF656, TMF621, TMF673/674, TMF620.

## 9. Databricks architecture

```
[Inventory SoR]--[GIS]--[OSS/BSS]--[PCF milestones]--[copper plant]
        +------- Lakeflow Spark Declarative Pipelines -------+
                            |
                 BRONZE (raw, UC governed)
                            |
                 SILVER (SID-aligned twin model)
                            |
   [Streaming telemetry: Kafka/Event Hubs or OTEL] --> Real-Time Mode
                            |
                 GOLD (twin state + sim results)
        /            |              |             \
   Lakebase      ML models     Metric views   Agent Bricks
 (operational  (forecast,     (KPI layer)    (Splice agent)
  twin state)   graph sim)
                            |
             Genie space + AI/BI dashboards + 1 Databricks App
```

| Component | Role |
| --- | --- |
| Unity Catalog | Governed twin model, lineage, ABAC tags (network domain, sensitivity) |
| Lakeflow Spark Declarative Pipelines | Medallion sync from inventory and OSS/BSS |
| Structured Streaming / Real-Time Mode | Telemetry into the twin (pluggable Kafka/Event Hubs/OTEL; demo uses synthetic streaming) |
| Lakebase | Operational twin state for low-latency app/agent reads |
| MLflow + UC Model Registry | Corridor forecast, blast-radius models (champion/challenger) |
| Metric views | Governed KPIs (utilization, SLA exposure, copper readiness) |
| Genie space | NL twin queries |
| Agent Bricks | Twin assistant Lakelink Fiber Splice with UC tools, AI Gateway guardrails |
| AI/BI dashboards | NOC and executive views, each with embedded Genie |

No preview feature is load-bearing for the MVP. Re-verify feature status at build time.

## 10. Delivery roadmap (customer-facing)

* **Discover (2 weeks):** inventory source mapping, telemetry path confirmation, pick 2 corridors + 1 copper state for pilot.
* **MVP (6-8 weeks):** twin model for pilot scope, streaming telemetry, failure simulation, corridor forecast, Genie space. Exit: sim results validated against a known historical event.
* **Scale (1 quarter):** all corridors, copper sequencing module, Agent Bricks Splice assistant, AI/BI executive views.
* **Operate:** twin freshness SLOs, model retraining cadence, quarterly value readout vs. $74.5M base case.

Risks: inventory-platform overlap perception (position as intelligence layer, co-design); telemetry volume unverified (start with sampled streams); planning org adoption (anchor in existing automation estate).

---

## 11. Demo build spec

### 11.1 Workspace setup

Catalog `cdm_tmforum`, schema `network_scenario_twin`. All tables tagged `telco_project: network_scenario_twin`, with table and column comments.

### 11.2 Synthetic data specification (14 tables)

| Table | SID entity | Rows | Key columns | Injected pattern |
| --- | --- | --- | --- | --- |
| resource_specification | ResourceSpecification | 20 | spec_id, type, capacity_gbps | None |
| physical_resource | PhysicalResource | 800 (600 spans, 150 nodes, 50 sites) | resource_id, type, corridor_id, srlg | Spans S-4471 and S-4472 share SRLG "SRLG-88" while sold as diverse paths |
| logical_resource | LogicalResource | 2,500 | resource_id, parent_id, type, capacity_gbps, utilized_gbps | None |
| corridor | GeographicSite/Route | 40 | corridor_id, name, endpoints, capacity_gbps | "DEN-SLC RapidRoute" trending to exhaustion |
| customer | Customer | 120 | customer_id, name, segment, naas_flag | 12 Dual Path customers on the SRLG-88 spans |
| service | Service | 1,500 | service_id, customer_id, corridor_id, mrr | None |
| service_level_agreement | ServiceLevelAgreement | 1,500 | sla_id, service_id, latency_target_ms, credit_pct | None |
| telemetry_span_hourly | Usage | 1.3M (600 spans x 24h x 90d) | ts, span_id, utilization_pct, latency_ms, optical_margin_db | DEN-SLC utilization 55% -> 85% on an AI-growth curve |
| alarm | Alarm | 50K | alarm_id, ts, resource_id, severity | None |
| trouble_ticket | TroubleTicket | 20K | ticket_id, service_id, mttr_min, root_cause | None |
| maintenance_window | TimePeriod | 200 | window_id, span_id, start_ts, end_ts | One window on S-4471 |
| copper_wire_center | PhysicalResource | 60 | wc_id, state, copper_miles, active_circuits, high_value_customers, decommission_target | Iowa WC with 3 high-value customers, decommission before 2027-06-01 |
| sim_failure_result | ServiceProblem | 500 | sim_id, resource_id, affected_services, affected_customers, sla_exposure_mrr | S-4471 sim shows both paths of 12 Dual Path customers failing |
| sim_capacity_forecast | Usage | 480 (40 corridors x 12 months) | corridor_id, month, forecast_utilization_pct, exhaustion_date | DEN-SLC exhaustion in ~120 days |

Time range 2026-08-18 to 2026-11-16. Geography: Lakelink Fiber metro and long-haul corridors (Denver, Salt Lake City, Chicago, Dallas, Ashburn, Seattle, Atlanta, Phoenix). Customer names are fictional.

### 11.3 Build sequence

1. Data generation — 14 tables with the three injected anomalies (SRLG-88, DEN-SLC exhaustion, Iowa copper wire center).
2. Pipeline — SDP: bronze -> SID-aligned silver (resource, service, customer, sla) -> gold `twin_current_state`, `corridor_utilization_daily`, `sla_exposure_by_span`.
3. Models — corridor utilization forecast (AI growth regressor) and failure blast-radius graph over physical/logical resources; register in MLflow; write `sim_capacity_forecast` and `sim_failure_result`.
4. Metric views — corridor utilization, SLA exposure at risk, copper decommissioning readiness.
5. Genie space over gold tables + metric views with the 8 sample questions below.
6. AI/BI dashboard (embedded Genie) — corridor utilization with exhaustion countdown, top SLA-exposure spans, copper sequencing queue.
7. Agent Bricks twin assistant Lakelink Fiber Splice answering planner questions with Genie/UC tools, citing twin tables.
8. One Databricks App ("Lakelink Fiber Scenario Twin") surfacing the three wow moments, reading Lakebase twin state.

Genie sample questions:
* What breaks if span S-4471 goes down?
* Which corridors exhaust within 6 months?
* Which Dual Path customers share a common SRLG?
* What is the SLA exposure of the next maintenance window?
* Which copper wire centers should be sequenced first in Iowa?
* What is the utilization trend on DEN-SLC?
* Which customers would be affected by retiring the Iowa wire center?
* What is the blast radius of a node failure in Chicago?

### 11.4 Five-minute demo storyline

* Opening pain: "When someone asks what breaks if we take that span down, I need three days and two favors."
* **Wow 1:** ask Genie "what breaks if span S-4471 goes down" -> 12 Dual Path customers whose diverse paths share SRLG-88, with SLA exposure in dollars.
* **Wow 2:** DEN-SLC corridor forecast hits exhaustion in ~120 days under AI traffic growth, with the implied pre-build trigger.
* **Wow 3:** copper sequencing view flags the Iowa wire center where 3 high-value customers must migrate before retirement to protect proceeds.
* Close: "$74.5 million a year in better builds, fewer surprises, and protected copper proceeds."

### 11.5 Validation queries (acceptance criteria)

1. `SELECT * FROM sim_failure_result WHERE resource_id = 'S-4471'` returns the 12 Dual Path customers with non-zero `sla_exposure_mrr`.
2. `SELECT corridor_id, exhaustion_date FROM sim_capacity_forecast WHERE corridor_id = 'DEN-SLC'` returns an exhaustion date within ~120 days of 2026-11-16.
3. `SELECT * FROM copper_wire_center WHERE state = 'IA' AND high_value_customers > 0 AND decommission_target < '2027-06-01'` returns the flagged wire center.

---

## 12. Agent swarm task plan

Tasks are seeded into the Lakebase task board `telco-network-scenario-twin-project` (`agent_tasks`). Lakebase is authoritative; this table is the initial seed only.

### Phase 0 — Setup and discovery

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P0-SCHEMA-SETUP | @data-planner | Create `cdm_tmforum.network_scenario_twin` schema with comment and `telco_project` tag | critical | |
| P0-CATALOG-REUSE-SCAN | @data-planner | Scan `cdm_tmforum` for reusable Resource/Service/Customer/Geographic tables; classify each of the 14 spec tables as REUSE / EXTEND / GENERATE | critical | P0-SCHEMA-SETUP |
| P0-DATA-CONTRACTS | @data-planner | Write `resources/data_contracts.md`: keys, FKs, grain, injected anomalies, column semantics for all 14 tables | high | P0-CATALOG-REUSE-SCAN |
| P0-REPO-HYGIENE | @devops | Verify Git folder remote, default branch, .gitignore; set up branch conventions | high | |
| P0-BUNDLE-SCAFFOLD | @devops | Scaffold Declarative Automation Bundle in `bundle/` (dev target) | medium | P0-REPO-HYGIENE |
| P0-BRAND-GUIDE | @designer | Publish `resources/brand_guide.md` (Lakelink Fiber tokens, data-viz palette, WCAG 2.1 AA) | medium | |
| P0-SCHEDULE-REGISTRY | @schedule-adjuster | Verify `agent_schedule` has all 11 insight IDs and crons match live schedules | high | |
| P0-PM-KICKOFF | @pm | Kickoff rollup: confirm critical path, assign owners, write first status update | high | |

### Phase 1 — Synthetic data (demo twin)

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P1-GEN-REFERENCE | @data-engineer | Generate `resource_specification` (20), `corridor` (40, incl. DEN-SLC RapidRoute), `customer` (120, 12 Dual Path) | critical | P0-DATA-CONTRACTS |
| P1-GEN-TOPOLOGY | @data-engineer | Generate `physical_resource` (800; S-4471/S-4472 share SRLG-88) and `logical_resource` (2,500) | critical | P1-GEN-REFERENCE |
| P1-GEN-SERVICE | @data-engineer | Generate `service` (1,500) and `service_level_agreement` (1,500); route 12 Dual Path customers over SRLG-88 spans | critical | P1-GEN-TOPOLOGY |
| P1-GEN-TELEMETRY | @data-engineer | Generate `telemetry_span_hourly` (~1.3M rows, 90 days); DEN-SLC 55% -> 85% AI-growth curve | critical | P1-GEN-TOPOLOGY |
| P1-GEN-OPS | @data-engineer | Generate `alarm` (50K), `trouble_ticket` (20K), `maintenance_window` (200, one on S-4471) | high | P1-GEN-SERVICE |
| P1-GEN-COPPER | @data-engineer | Generate `copper_wire_center` (60; Iowa WC with 3 high-value customers, decommission < 2027-06-01) | high | P1-GEN-REFERENCE |
| P1-COLUMN-COMMENTS | @data-engineer | Table + column comments and `telco_project` tags on all Phase 1 tables | high | P1-GEN-OPS,P1-GEN-COPPER,P1-GEN-TELEMETRY |
| P1-PROFILE | @data-analyst | Profile all generated tables: row counts vs spec, null density, FK integrity, distributions | high | P1-COLUMN-COMMENTS |
| P1-QA-ANOMALIES | @qa | Verify the 3 injected anomalies exist exactly as specified | high | P1-PROFILE |

### Phase 2 — Pipeline and twin state

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P2-SDP-BRONZE | @data-engineer | SDP bronze layer landing the raw tables | critical | P1-QA-ANOMALIES |
| P2-SDP-SILVER | @data-engineer | SDP SID-aligned silver model (resource, service, customer, sla) with expectations | critical | P2-SDP-BRONZE |
| P2-SDP-GOLD | @data-engineer | SDP gold: `twin_current_state`, `corridor_utilization_daily`, `sla_exposure_by_span` | critical | P2-SDP-SILVER |
| P2-STREAMING-TELEMETRY | @data-engineer | Synthetic streaming telemetry feed into the twin via pluggable ingestion layer | medium | P2-SDP-BRONZE |
| P2-LAKEBASE-TWIN-STATE | @data-engineer | Sync `twin_current_state` to Lakebase for low-latency app/agent reads | high | P2-SDP-GOLD |
| P2-DQ-RULES | @data-analyst | Data quality rules and freshness checks on gold tables | medium | P2-SDP-GOLD |
| P2-QA-PIPELINE | @qa | Review pipeline code, expectations, lineage, and gold row counts | high | P2-SDP-GOLD |

### Phase 3 — Models and simulation

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P3-FEATURES | @ml-engineer | Corridor-level feature table from telemetry with AI growth regressor | high | P2-SDP-GOLD |
| P3-FORECAST-MODEL | @ml-engineer | Train corridor utilization forecast (MLflow); write `sim_capacity_forecast` (480 rows) | critical | P3-FEATURES |
| P3-BLAST-RADIUS | @ml-engineer | Graph blast-radius computation over physical/logical resources; write `sim_failure_result` (500 rows) | critical | P2-SDP-GOLD |
| P3-ANOMALY-DETECT | @ml-engineer | Telemetry anomaly detection to keep the twin honest | medium | P3-FEATURES |
| P3-MODEL-REGISTRY | @ml-engineer | Register models in UC with champion/challenger aliases | high | P3-FORECAST-MODEL,P3-BLAST-RADIUS |
| P3-SLICE-TESTING | @ml-engineer | Slice analysis per corridor, segment, resource type; file feature requests to @data-engineer | medium | P3-FORECAST-MODEL |
| P3-QA-VALIDATION | @qa | Run validation queries 1 and 2; review MLflow runs | high | P3-FORECAST-MODEL,P3-BLAST-RADIUS |

### Phase 4 — Semantic layer and consumption

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P4-MV-CORRIDOR-UTIL | @data-analyst | Metric view: corridor utilization + exhaustion countdown | high | P3-FORECAST-MODEL |
| P4-MV-SLA-EXPOSURE | @data-analyst | Metric view: SLA exposure at risk | high | P3-BLAST-RADIUS |
| P4-MV-COPPER-READINESS | @data-analyst | Metric view: copper decommissioning readiness | high | P1-GEN-COPPER |
| P4-SEMANTIC-AUDIT | @data-planner | Audit all tables/columns/metric views for complete descriptions and tags | high | P4-MV-CORRIDOR-UTIL,P4-MV-SLA-EXPOSURE,P4-MV-COPPER-READINESS |
| P4-UC-PAGES | @data-planner | UC Glossary pages: SRLG, corridor exhaustion, blast radius, copper readiness | medium | P4-SEMANTIC-AUDIT |
| P4-GENIE-SPACE | @data-analyst | Genie space over gold tables + metric views with the 8 sample questions | critical | P4-MV-CORRIDOR-UTIL,P4-MV-SLA-EXPOSURE,P4-MV-COPPER-READINESS |
| P4-DASHBOARD | @data-analyst | AI/BI dashboard with embedded Genie: utilization/exhaustion, top SLA-exposure spans, copper queue | high | P4-GENIE-SPACE |
| P4-GENIE-BENCHMARK | @qa | Benchmark Genie on all 8 sample questions; file fixes | high | P4-GENIE-SPACE |

### Phase 5 — Splice assistant and app

Note (D-013): the twin assistant is named Lakelink Fiber Splice. Legacy task codes in this table are frozen Lakebase board keys and keep their original spelling.

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P5-UC-TOOLS | @ml-engineer | UC functions for Splice: blast_radius(resource_id), corridor_forecast(corridor_id), copper_sequence(state) | high | P3-MODEL-REGISTRY |
| P5-TWIN-COPILOT | @ml-engineer | Agent Bricks twin assistant (Lakelink Fiber Splice) using Genie + UC tools, citing twin tables; MLflow evaluation | critical | P5-UC-TOOLS,P4-GENIE-SPACE |
| P5-AI-GATEWAY | @devops | AI Gateway guardrails and usage logging on Splice endpoint | medium | P5-TWIN-COPILOT |
| P5-APP-SCAFFOLD | @app-developer | Scaffold ONE Databricks App "Lakelink Fiber Scenario Twin" (reads Lakebase twin state) | high | P2-LAKEBASE-TWIN-STATE |
| P5-APP-WOW-VIEWS | @app-developer | Build the 3 wow views (S-4471 blast radius, DEN-SLC countdown, Iowa copper queue) + Splice chat | high | P5-APP-SCAFFOLD,P5-TWIN-COPILOT |
| P5-UX-REVIEW | @designer | Binding UX/brand/accessibility review of the app; file remediation tasks | high | P5-APP-WOW-VIEWS |
| P5-BUNDLE-RESOURCES | @devops | Add pipeline, jobs, dashboard, app to the bundle; validate deploy to dev | medium | P0-BUNDLE-SCAFFOLD,P5-APP-SCAFFOLD |

### Phase 6 — Demo readiness

| ID | Owner | Task | Priority | Depends on |
| --- | --- | --- | --- | --- |
| P6-VALUE-READOUT | @data-analyst | Value model view reproducing $46.0M / $74.5M / $122.5M with tunable assumptions | medium | P4-DASHBOARD |
| P6-E2E-VALIDATION | @qa | End-to-end run of all 3 validation queries + 5-minute storyline walkthrough | critical | P5-APP-WOW-VIEWS,P4-DASHBOARD |
| P6-DEMO-SCRIPT | @pm | Write `resources/demo_script.md` for the 5-minute storyline | high | P6-E2E-VALIDATION |
| P6-REPO-PRUNE | @repo-pruner | Prune folder/repo bloat (<200 files), consolidate duplicates | medium | |
| P6-CONSOLIDATION-AUDIT | @qa | Audit `asset_ledger`: 2-for-1 consolidation rule and single-app rule honored | medium | P5-APP-WOW-VIEWS |

### Critical path

P0-SCHEMA-SETUP -> P0-CATALOG-REUSE-SCAN -> P0-DATA-CONTRACTS -> P1-GEN-* -> P1-QA-ANOMALIES -> P2-SDP-BRONZE/SILVER/GOLD -> P3-FORECAST-MODEL + P3-BLAST-RADIUS -> P4-GENIE-SPACE -> P5-TWIN-COPILOT -> P5-APP-WOW-VIEWS -> P6-E2E-VALIDATION
