# Lakelink Fiber Network Scenario Twin - SDP gold layer (P2-SDP-GOLD, @data-engineer)
#
# Serving tables over the silver SID model (pipeline/silver/) and bronze telemetry/alarms:
#   twin_current_state          1 row per resource (physical + logical) at the latest snapshot
#   corridor_utilization_daily  1 row per corridor x day, capacity-weighted utilization from telemetry
#   sla_exposure_by_span        1 row per physical span: SLA credit exposure if the span fails (SRLG-expanded)
#
# Contract: resources/data_contracts.md s3, resources/model_design.md s1 (ML feature inputs,
# P3-DE-FEATURE-INPUTS), apps/ARCHITECTURE.md s2.3 (Lakebase sync keys). All three are classified
# telco_sensitivity=internal (no customer key). The twin is the intelligence layer above the
# inventory system of record (D-003): these are derived serving views, not inventory records.
# Tagging: pipeline tag telco_project=network_scenario_twin; table tags follow P1-TAG-REAPPLY.

from pyspark import pipelines as dp

PROPS = {"quality": "gold", "telco_project": "network_scenario_twin", "contract": "data_contracts.md v1.2 s3"}
ANCHOR_DATE = "2026-11-16"  # D-002 demo anchor
K_REF = 0.108783            # model_design.md s1 AI growth regressor constant
AI_SIGNAL_TABLE = "cdm_tmforum.fiber_capital_intelligence.corridor_demand_forecast"  # REUSE (model_design s0)

PROVENANCE_DDL = """,
  origin STRING COMMENT 'Provenance: MIXED (derived from REUSED cdm_tmforum keys and SYNTHETIC generator values) or SYNTHETIC.',
  simulation_run_id STRING COMMENT 'Provenance: generator run id (nst-sim-001 for the v1 build, seed 4471).'"""


# ---------------------------------------------------------------- corridor_utilization_daily
@dp.materialized_view(
    name="corridor_utilization_daily",
    comment=(
        "Gold corridor utilization for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per corridor x "
        "UTC day (40 corridors x 90 days, 2026-08-18 to 2026-11-15). Hourly corridor utilization is the "
        "capacity-weighted mean of member span telemetry (weight = span specification capacity); daily mean, "
        "p95, max and trailing 7/28-day means are computed from it. Carries corridor attributes and the reused "
        "AI growth signal (data center MW) for the forecast feature table. Injected anomaly: DEN-SLC rises "
        "from ~55% to ~85% on an AI-growth curve. Synced to Lakebase twin.corridor_utilization_daily."
    ),
    table_properties=PROPS,
    schema="""
  corridor_id STRING NOT NULL COMMENT 'Corridor key (FK corridor.corridor_id), e.g. DEN-SLC.',
  util_date DATE NOT NULL COMMENT 'UTC calendar day of the telemetry.',
  util_mean_pct DOUBLE COMMENT 'Daily mean of hourly capacity-weighted corridor utilization, 0-100 scale.',
  util_p95_pct DOUBLE COMMENT 'Daily 95th percentile of hourly capacity-weighted corridor utilization, 0-100 scale.',
  util_max_pct DOUBLE COMMENT 'Daily maximum of hourly capacity-weighted corridor utilization, 0-100 scale.',
  util_min_pct DOUBLE COMMENT 'Daily minimum of hourly capacity-weighted corridor utilization, 0-100 scale.',
  util_7d_mean_pct DOUBLE COMMENT 'Trailing 7-day mean of util_mean_pct (current day plus 6 prior). Forecast target per model_design.md s1.',
  util_28d_mean_pct DOUBLE COMMENT 'Trailing 28-day mean of util_mean_pct (current day plus 27 prior).',
  latency_mean_ms DOUBLE COMMENT 'Daily mean span latency in ms across member spans.',
  optical_margin_min_db DOUBLE COMMENT 'Daily minimum optical margin in dB across member spans (lower is worse).',
  n_spans INT COMMENT 'Distinct member spans reporting telemetry that day.',
  n_hours INT COMMENT 'Distinct hours with telemetry that day (24 when complete).',
  t_days INT COMMENT 'Days since 2026-08-18 (window start); the t of the AI-growth curve.',
  ln1p_t DOUBLE COMMENT 'AI growth regressor ln(1 + 0.108783 * t_days) per model_design.md s1.',
  capacity_gbps DOUBLE COMMENT 'Corridor design capacity in Gbps (corridor.capacity_gbps).',
  corridor_name STRING COMMENT 'Lakelink Fiber corridor display name.',
  route_type STRING COMMENT 'long_haul or metro (corridor.route_type).',
  is_diverse_route BOOLEAN COMMENT 'TRUE when the corridor is the diverse route of another corridor (corridor.diverse_of is set).',
  source_id STRING COMMENT 'Lineage: corridor.source_id, the canonical_corridor_key of the reused fiber_capital_intelligence corridor (null for synthetic corridors).',
  ep_dc_mw_online_now DOUBLE COMMENT 'Reused AI growth signal: data center MW online now on the matched fiber_capital_intelligence corridor (latest forecast_date). Null when unmatched.',
  ep_dc_mw_next12 DOUBLE COMMENT 'Reused AI growth signal: data center MW coming online in the next 12 months on the matched corridor (latest forecast_date). Null when unmatched.',
  ai_signal_forecast_date DATE COMMENT 'forecast_date of the reused AI growth signal row used.',
  ai_signal_missing BOOLEAN COMMENT 'TRUE when no AI growth signal matched (corridor has no source_id or no fiber_capital match); ML treats the index as 0.'""" + PROVENANCE_DDL,
)
@dp.expect_or_fail("pk_not_null", "corridor_id IS NOT NULL AND util_date IS NOT NULL")
@dp.expect_all({
    "util_mean_in_range": "util_mean_pct BETWEEN 0 AND 100",
    "util_order": "util_min_pct <= util_mean_pct AND util_mean_pct <= util_max_pct AND util_p95_pct <= util_max_pct",
    "full_day": "n_hours = 24",
    "corridor_resolves": "corridor_name IS NOT NULL",
})
def corridor_utilization_daily():
    return spark.sql(f"""
    WITH sp AS (
      SELECT resource_id AS span_id, spec_capacity_gbps AS cap FROM silver_resource WHERE resource_type = 'span'
    ), hourly AS (
      SELECT t.corridor_id, t.ts,
             SUM(t.utilization_pct * sp.cap) / SUM(sp.cap) AS u,
             AVG(t.latency_ms) AS lat, MIN(t.optical_margin_db) AS om, COUNT(DISTINCT t.span_id) AS n_spans
      FROM bronze_telemetry_span_hourly t JOIN sp ON sp.span_id = t.span_id
      GROUP BY t.corridor_id, t.ts
    ), daily AS (
      SELECT corridor_id, to_date(ts) AS util_date,
             AVG(u) AS m, percentile_approx(u, 0.95) AS p95, MAX(u) AS mx, MIN(u) AS mn,
             AVG(lat) AS lat, MIN(om) AS om, MAX(n_spans) AS n_spans, COUNT(DISTINCT ts) AS n_hours
      FROM hourly GROUP BY corridor_id, to_date(ts)
    ), ai AS (
      SELECT canonical_corridor_key, ep_dc_mw_online_now, ep_dc_mw_next12, forecast_date
      FROM {AI_SIGNAL_TABLE}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY canonical_corridor_key ORDER BY forecast_date DESC, ep_dc_mw_next12 DESC) = 1
    )
    SELECT d.corridor_id, d.util_date,
           ROUND(d.m, 3) AS util_mean_pct, ROUND(d.p95, 3) AS util_p95_pct, ROUND(d.mx, 3) AS util_max_pct,
           ROUND(d.mn, 3) AS util_min_pct,
           ROUND(AVG(d.m) OVER (PARTITION BY d.corridor_id ORDER BY d.util_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 3) AS util_7d_mean_pct,
           ROUND(AVG(d.m) OVER (PARTITION BY d.corridor_id ORDER BY d.util_date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW), 3) AS util_28d_mean_pct,
           ROUND(d.lat, 3) AS latency_mean_ms, ROUND(d.om, 3) AS optical_margin_min_db,
           CAST(d.n_spans AS INT) AS n_spans, CAST(d.n_hours AS INT) AS n_hours,
           CAST(datediff(d.util_date, DATE'2026-08-18') AS INT) AS t_days,
           ln(1 + {K_REF} * datediff(d.util_date, DATE'2026-08-18')) AS ln1p_t,
           c.capacity_gbps, c.corridor_name, c.route_type, (c.diverse_of IS NOT NULL) AS is_diverse_route,
           c.source_id, ai.ep_dc_mw_online_now, ai.ep_dc_mw_next12, ai.forecast_date AS ai_signal_forecast_date,
           (ai.canonical_corridor_key IS NULL) AS ai_signal_missing,
           'SYNTHETIC' AS origin, c.simulation_run_id
    FROM daily d
    LEFT JOIN bronze_corridor c ON c.corridor_id = d.corridor_id
    LEFT JOIN ai ON ai.canonical_corridor_key = c.source_id
    """)


# ---------------------------------------------------------------- twin_current_state
@dp.materialized_view(
    name="twin_current_state",
    comment=(
        "Gold current state of every Lakelink Fiber Network Scenario Twin resource. Grain: 1 row per resource "
        "(3,300 = 800 physical spans/nodes/sites + 2,500 logical och/wavelength/port). Spans take utilization, "
        "latency and optical margin from the latest telemetry hour; logical resources from the anchor "
        "snapshot. Adds open alarms (logical resources inherit their span), active services and the next "
        "scheduled maintenance window, plus a derived health_state. state_as_of_ts is the refresh time shown "
        "as 'Twin as of' in the app. Synced to Lakebase twin.twin_current_state (PK resource_id)."
    ),
    table_properties=PROPS,
    schema="""
  resource_id STRING NOT NULL COMMENT 'Twin resource key (PK). Physical: S-#### span, N-#### node, SITE-<id> site. Logical: logical_resource id as STRING.',
  resource_class STRING COMMENT 'physical or logical.',
  resource_type STRING COMMENT 'span, node, site, och, wavelength or port.',
  corridor_id STRING COMMENT 'Corridor (FK corridor.corridor_id); null for sites.',
  srlg STRING COMMENT 'Shared-risk link group of the span conduit (inherited by logical resources); null for nodes and sites.',
  span_id STRING COMMENT 'Physical span the resource rides: itself for spans, the realizing span for logical resources, null otherwise.',
  parent_id STRING COMMENT 'Parent resource: parent site for nodes, parent logical resource (as STRING) for logical resources.',
  status STRING COMMENT 'Lifecycle status: in_service, planned or retired (logical resources inherit the span status).',
  capacity_gbps DOUBLE COMMENT 'Capacity in Gbps: specification capacity for physical, provisioned capacity for logical.',
  utilization_pct DOUBLE COMMENT 'Current utilization, 0-100 scale. Spans: latest telemetry hour. Logical: anchor snapshot. Null for nodes and sites.',
  utilization_source STRING COMMENT 'telemetry_latest_hour, logical_snapshot, or null when not measured.',
  util_24h_mean_pct DOUBLE COMMENT 'Spans only: mean utilization over the last 24 telemetry hours.',
  latency_ms DOUBLE COMMENT 'Spans only: latency in ms at the latest telemetry hour.',
  optical_margin_db DOUBLE COMMENT 'Spans only: optical margin in dB at the latest telemetry hour (lower is worse).',
  open_alarm_count INT COMMENT 'Open (uncleared) alarms on the resource; logical resources count alarms on their span.',
  open_critical_alarm_count INT COMMENT 'Open alarms with severity critical (same scope as open_alarm_count).',
  open_major_alarm_count INT COMMENT 'Open alarms with severity major (same scope as open_alarm_count).',
  last_alarm_ts TIMESTAMP COMMENT 'Most recent alarm raise time in scope (open or cleared).',
  active_service_count INT COMMENT 'Active services whose primary or protect path uses the resource (span or logical id). Null for nodes and sites (not path members).',
  next_maintenance_window_id STRING COMMENT 'Earliest scheduled maintenance window (FK maintenance_window.window_id) on the span on or after 2026-11-16.',
  next_maintenance_start_ts TIMESTAMP COMMENT 'Start (UTC) of next_maintenance_window_id.',
  health_state STRING COMMENT 'Derived: retired, planned, critical (open critical alarm), warning (open major alarm or utilization >= 85), ok.',
  telemetry_as_of_ts TIMESTAMP COMMENT 'Latest telemetry hour in the twin (network-wide), the measurement snapshot.',
  state_as_of_ts TIMESTAMP COMMENT 'UTC time this gold table was refreshed; displayed as Twin as of.'""" + PROVENANCE_DDL,
)
@dp.expect_or_fail("pk_resource_id_not_null", "resource_id IS NOT NULL")
@dp.expect_all({
    "valid_health_state": "health_state IN ('retired','planned','critical','warning','ok')",
    "span_has_telemetry": "resource_type <> 'span' OR utilization_pct IS NOT NULL",
    "util_in_range": "utilization_pct IS NULL OR utilization_pct BETWEEN 0 AND 100",
    "alarm_counts_consistent": "open_critical_alarm_count + open_major_alarm_count <= open_alarm_count",
})
def twin_current_state():
    return spark.sql(f"""
    WITH tmax AS (SELECT MAX(ts) AS max_ts FROM bronze_telemetry_span_hourly),
    tel AS (
      SELECT t.span_id,
             MAX_BY(t.utilization_pct, t.ts) AS u_last, MAX_BY(t.latency_ms, t.ts) AS lat_last,
             MAX_BY(t.optical_margin_db, t.ts) AS om_last,
             AVG(CASE WHEN t.ts > tmax.max_ts - INTERVAL 24 HOURS THEN t.utilization_pct END) AS u_24h
      FROM bronze_telemetry_span_hourly t CROSS JOIN tmax
      WHERE t.ts > tmax.max_ts - INTERVAL 48 HOURS
      GROUP BY t.span_id
    ), base AS (
      SELECT r.*, CASE WHEN r.resource_type = 'span' THEN r.resource_id ELSE r.span_id END AS scope_span_id
      FROM silver_resource r
    ), alarm_scope AS (
      SELECT resource_id AS alarm_resource_id,
             COUNT_IF(cleared_ts IS NULL) AS open_n,
             COUNT_IF(cleared_ts IS NULL AND severity = 'critical') AS open_crit,
             COUNT_IF(cleared_ts IS NULL AND severity = 'major') AS open_major,
             MAX(ts) AS last_ts
      FROM bronze_alarm GROUP BY resource_id
    ), svc_paths AS (
      SELECT service_id, primary_span_id AS span_id, primary_logical_resource_id AS lr_id FROM silver_service WHERE status = 'active'
      UNION ALL
      SELECT service_id, protect_span_id, protect_logical_resource_id FROM silver_service
      WHERE status = 'active' AND protect_logical_resource_id IS NOT NULL
    ), svc_span AS (SELECT span_id, COUNT(DISTINCT service_id) AS n FROM svc_paths GROUP BY span_id),
    svc_lr AS (SELECT CAST(lr_id AS STRING) AS lr_id, COUNT(DISTINCT service_id) AS n FROM svc_paths GROUP BY lr_id),
    mw AS (
      SELECT span_id, MIN_BY(window_id, start_ts) AS window_id, MIN(start_ts) AS start_ts
      FROM bronze_maintenance_window
      WHERE status = 'scheduled' AND start_ts >= TIMESTAMP'{ANCHOR_DATE} 00:00:00'
      GROUP BY span_id
    ), j AS (
      SELECT b.*,
             tel.u_last, tel.lat_last, tel.om_last, tel.u_24h,
             COALESCE(CASE WHEN b.resource_class = 'logical' THEN a_span.open_n ELSE a_self.open_n END, 0) AS open_n,
             COALESCE(CASE WHEN b.resource_class = 'logical' THEN a_span.open_crit ELSE a_self.open_crit END, 0) AS open_crit,
             COALESCE(CASE WHEN b.resource_class = 'logical' THEN a_span.open_major ELSE a_self.open_major END, 0) AS open_major,
             CASE WHEN b.resource_class = 'logical' THEN a_span.last_ts ELSE a_self.last_ts END AS last_alarm_ts,
             CASE WHEN b.resource_type = 'span' THEN COALESCE(ss.n, 0)
                  WHEN b.resource_class = 'logical' THEN COALESCE(sl.n, 0) END AS active_service_count,
             mw.window_id, mw.start_ts AS mw_start
      FROM base b
      LEFT JOIN tel ON tel.span_id = b.resource_id AND b.resource_type = 'span'
      LEFT JOIN alarm_scope a_self ON a_self.alarm_resource_id = b.resource_id
      LEFT JOIN alarm_scope a_span ON a_span.alarm_resource_id = b.span_id
      LEFT JOIN svc_span ss ON ss.span_id = b.resource_id
      LEFT JOIN svc_lr sl ON sl.lr_id = b.resource_id
      LEFT JOIN mw ON mw.span_id = b.scope_span_id
    )
    SELECT resource_id, resource_class, resource_type, corridor_id, srlg, scope_span_id AS span_id,
           CASE WHEN resource_type = 'node' THEN parent_site_id
                WHEN resource_class = 'logical' THEN CAST(parent_logical_resource_id AS STRING) END AS parent_id,
           status,
           CASE WHEN resource_class = 'logical' THEN capacity_gbps ELSE spec_capacity_gbps END AS capacity_gbps,
           ROUND(CASE WHEN resource_type = 'span' THEN u_last WHEN resource_class = 'logical' THEN utilization_pct END, 3) AS utilization_pct,
           CASE WHEN resource_type = 'span' AND u_last IS NOT NULL THEN 'telemetry_latest_hour'
                WHEN resource_class = 'logical' AND utilization_pct IS NOT NULL THEN 'logical_snapshot' END AS utilization_source,
           ROUND(u_24h, 3) AS util_24h_mean_pct, ROUND(lat_last, 3) AS latency_ms, ROUND(om_last, 3) AS optical_margin_db,
           CAST(open_n AS INT) AS open_alarm_count, CAST(open_crit AS INT) AS open_critical_alarm_count,
           CAST(open_major AS INT) AS open_major_alarm_count, last_alarm_ts,
           CAST(active_service_count AS INT) AS active_service_count,
           window_id AS next_maintenance_window_id, mw_start AS next_maintenance_start_ts,
           CASE WHEN status = 'retired' THEN 'retired'
                WHEN status = 'planned' THEN 'planned'
                WHEN open_crit > 0 THEN 'critical'
                WHEN open_major > 0
                  OR COALESCE(CASE WHEN resource_type = 'span' THEN u_last WHEN resource_class = 'logical' THEN utilization_pct END, 0) >= 85
                  THEN 'warning'
                ELSE 'ok' END AS health_state,
           (SELECT max_ts FROM tmax) AS telemetry_as_of_ts,
           current_timestamp() AS state_as_of_ts,
           origin, simulation_run_id
    FROM j
    """)


# ---------------------------------------------------------------- sla_exposure_by_span
@dp.materialized_view(
    name="sla_exposure_by_span",
    comment=(
        "Gold SLA exposure by span for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per physical span "
        "(600). Deterministic SQL what-if: a span failure fails every span in its SRLG (shared conduit); an "
        "active unprotected service is DOWN if its primary span fails; a protected or Dual Path service is DOWN "
        "only if both primary and protect spans fail, DEGRADED if exactly one fails. sla_exposure_mrr = SUM over "
        "DOWN services of mrr x credit_pct / 100. Each row is an independent what-if: do not add exposure across "
        "spans. Injected anomaly: S-4471 and S-4472 share SRLG-88, so either failure takes down all 12 Dual Path "
        "customers. Cross-checks the ML champion sim_failure_result (srlg_graph_v1). No customer key (internal)."
    ),
    table_properties=PROPS,
    schema="""
  span_id STRING NOT NULL COMMENT 'Failed span (PK; FK physical_resource.resource_id, type span).',
  corridor_id STRING COMMENT 'Corridor of the span (FK corridor.corridor_id).',
  srlg STRING COMMENT 'Shared-risk link group of the span; every member fails together.',
  span_status STRING COMMENT 'Lifecycle status of the span.',
  srlg_member_span_ids ARRAY<STRING> COMMENT 'All spans failed by this what-if (the SRLG members, including the span itself), sorted.',
  srlg_member_count INT COMMENT 'Number of spans in srlg_member_span_ids.',
  services_on_span INT COMMENT 'Active services whose primary or protect path rides this span directly.',
  services_down INT COMMENT 'Active services DOWN in the what-if (unprotected primary hit, or both paths hit).',
  services_degraded INT COMMENT 'Active protected or Dual Path services with exactly one path hit (still up, protection lost).',
  customers_down INT COMMENT 'Distinct customers with at least one DOWN service.',
  dual_path_customers_down INT COMMENT 'Distinct Dual Path customers (dual_path_flag) losing both paths of a dual_path service. 12 for S-4471 and S-4472.',
  shared_srlg_services_down INT COMMENT 'DOWN services sold as diverse whose two paths share one SRLG (silver_service.shared_srlg_flag).',
  mrr_down DECIMAL(18,2) COMMENT 'Total MRR (USD) of DOWN services, no credit factor.',
  sla_exposure_mrr DECIMAL(18,2) COMMENT 'Monthly SLA credit exposure (USD) if the span fails: SUM over DOWN services of mrr x credit_pct / 100.',
  degraded_mrr DECIMAL(18,2) COMMENT 'MRR (USD) of DEGRADED services; informational, never added to exposure.',
  next_maintenance_window_id STRING COMMENT 'Earliest scheduled maintenance window on this span on or after 2026-11-16 (FK maintenance_window.window_id).',
  next_maintenance_start_ts TIMESTAMP COMMENT 'Start (UTC) of next_maintenance_window_id.',
  method STRING COMMENT 'Computation method: deterministic_srlg_sql_v1 (gold rule set; the ML champion is sim_failure_result).',
  as_of_date DATE COMMENT 'Topology and service snapshot anchor date (2026-11-16, D-002).'""" + PROVENANCE_DDL,
)
@dp.expect_or_fail("pk_span_id_not_null", "span_id IS NOT NULL")
@dp.expect_all({
    "self_in_failure_set": "array_contains(srlg_member_span_ids, span_id)",
    "exposure_non_negative": "sla_exposure_mrr >= 0 AND mrr_down >= sla_exposure_mrr",
    "dual_path_le_customers": "dual_path_customers_down <= customers_down",
    "exposure_iff_down": "(services_down = 0) = (sla_exposure_mrr = 0)",
})
def sla_exposure_by_span():
    return spark.sql(f"""
    WITH spans AS (
      SELECT resource_id AS span_id, corridor_id, srlg, status FROM silver_resource WHERE resource_type = 'span'
    ), fset AS (   -- failed span -> every span failing with it (SRLG expansion; self when srlg is null)
      SELECT f.span_id AS failed_span_id, m.span_id AS member_span_id
      FROM spans f JOIN spans m ON (m.srlg = f.srlg) OR (m.span_id = f.span_id)
    ), svc AS (
      SELECT s.service_id, s.customer_id, s.protection_scheme, s.primary_span_id, s.protect_span_id,
             s.shared_srlg_flag, s.mrr, sla.exposure_mrr_if_down, c.dual_path_flag
      FROM silver_service s
      LEFT JOIN silver_service_level_agreement sla ON sla.service_id = s.service_id
      LEFT JOIN silver_customer c ON c.customer_id = s.customer_id
      WHERE s.status = 'active'
    ), hits AS (
      SELECT f.failed_span_id, v.service_id,
             MAX(CASE WHEN f.member_span_id = v.primary_span_id THEN 1 ELSE 0 END) AS p_hit,
             MAX(CASE WHEN f.member_span_id = v.protect_span_id THEN 1 ELSE 0 END) AS q_hit
      FROM fset f JOIN svc v ON f.member_span_id IN (v.primary_span_id, v.protect_span_id)
      GROUP BY f.failed_span_id, v.service_id
    ), st AS (
      SELECT h.failed_span_id, v.*,
             CASE WHEN v.protect_span_id IS NULL THEN (h.p_hit = 1)
                  ELSE (h.p_hit = 1 AND h.q_hit = 1) END AS is_down,
             (v.protect_span_id IS NOT NULL AND h.p_hit + h.q_hit = 1) AS is_degraded
      FROM hits h JOIN svc v ON v.service_id = h.service_id
    ), agg AS (
      SELECT failed_span_id,
             COUNT_IF(is_down) AS services_down, COUNT_IF(is_degraded) AS services_degraded,
             COUNT(DISTINCT CASE WHEN is_down THEN customer_id END) AS customers_down,
             COUNT(DISTINCT CASE WHEN is_down AND protection_scheme = 'dual_path' AND dual_path_flag THEN customer_id END) AS dp_down,
             COUNT_IF(is_down AND shared_srlg_flag) AS shared_down,
             SUM(CASE WHEN is_down THEN mrr ELSE 0 END) AS mrr_down,
             SUM(CASE WHEN is_down THEN exposure_mrr_if_down ELSE 0 END) AS exposure,
             SUM(CASE WHEN is_degraded THEN mrr ELSE 0 END) AS degraded_mrr
      FROM st GROUP BY failed_span_id
    ), direct AS (
      SELECT span_id, COUNT(DISTINCT service_id) AS n FROM (
        SELECT service_id, primary_span_id AS span_id FROM svc
        UNION ALL SELECT service_id, protect_span_id FROM svc WHERE protect_span_id IS NOT NULL) GROUP BY span_id
    ), members AS (
      SELECT failed_span_id, array_sort(collect_set(member_span_id)) AS ids FROM fset GROUP BY failed_span_id
    ), mw AS (
      SELECT span_id, MIN_BY(window_id, start_ts) AS window_id, MIN(start_ts) AS start_ts
      FROM bronze_maintenance_window
      WHERE status = 'scheduled' AND start_ts >= TIMESTAMP'{ANCHOR_DATE} 00:00:00'
      GROUP BY span_id
    )
    SELECT sp.span_id, sp.corridor_id, sp.srlg, sp.status AS span_status,
           m.ids AS srlg_member_span_ids, CAST(size(m.ids) AS INT) AS srlg_member_count,
           CAST(COALESCE(d.n, 0) AS INT) AS services_on_span,
           CAST(COALESCE(a.services_down, 0) AS INT) AS services_down,
           CAST(COALESCE(a.services_degraded, 0) AS INT) AS services_degraded,
           CAST(COALESCE(a.customers_down, 0) AS INT) AS customers_down,
           CAST(COALESCE(a.dp_down, 0) AS INT) AS dual_path_customers_down,
           CAST(COALESCE(a.shared_down, 0) AS INT) AS shared_srlg_services_down,
           CAST(COALESCE(a.mrr_down, 0) AS DECIMAL(18,2)) AS mrr_down,
           CAST(COALESCE(a.exposure, 0) AS DECIMAL(18,2)) AS sla_exposure_mrr,
           CAST(COALESCE(a.degraded_mrr, 0) AS DECIMAL(18,2)) AS degraded_mrr,
           mw.window_id AS next_maintenance_window_id, mw.start_ts AS next_maintenance_start_ts,
           'deterministic_srlg_sql_v1' AS method, DATE'{ANCHOR_DATE}' AS as_of_date,
           'MIXED' AS origin, 'nst-sim-001' AS simulation_run_id
    FROM spans sp
    JOIN members m ON m.failed_span_id = sp.span_id
    LEFT JOIN agg a ON a.failed_span_id = sp.span_id
    LEFT JOIN direct d ON d.span_id = sp.span_id
    LEFT JOIN mw ON mw.span_id = sp.span_id
    """)
