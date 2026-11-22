# Lakelink Fiber Network Scenario Twin - SDP silver layer (P2-SDP-SILVER, @data-engineer)
#
# SID-aligned silver model over the bronze_* materialized views (pipeline/bronze/):
#   silver_resource                 SID Resource (PhysicalResource + LogicalResource), 1 row per resource
#   silver_customer                 SID Customer, 1 row per customer
#   silver_service                  SID Service with resolved primary/protect span + SRLG path
#   silver_service_level_agreement  SID ServiceLevelAgreement (1:1 with service) with exposure if down
#
# Contract: resources/data_contracts.md v1.2 sections 2.1-2.7. Expectations are WARN level
# (rows kept, violations counted in the event log) except primary keys, which FAIL the update.
# The class.name column customer.source_name_code is intentionally NOT carried into silver.
# Tagging: pipeline tag telco_project=network_scenario_twin; table tags follow P1-TAG-REAPPLY.

from pyspark import pipelines as dp
from pyspark.sql import functions as F

PROPS = {"quality": "silver", "telco_project": "network_scenario_twin", "contract": "data_contracts.md v1.2"}

LINEAGE_DDL = """,
  source_table STRING COMMENT 'Lineage: fully qualified cdm_tmforum parent table of the record (null for SYNTHETIC rows).',
  source_id STRING COMMENT 'Lineage: parent key value as a string (null for SYNTHETIC rows).',
  origin STRING COMMENT 'Lineage: REAL, MIXED or SYNTHETIC.',
  simulation_run_id STRING COMMENT 'Lineage: generator run id (nst-sim-001 for the v1 build, seed 4471).'"""


# ---------------------------------------------------------------- silver_resource
@dp.materialized_view(
    name="silver_resource",
    comment=(
        "Silver SID Resource for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per resource "
        "(800 physical spans/nodes/sites + 2,500 logical och/wavelength/port = 3,300). resource_id is a STRING "
        "key across both classes; logical resources inherit corridor_id and srlg from the span they ride. "
        "Injected anomaly: spans S-4471 (CHI-DEN) and S-4472 (CHI-DEN-D2) share SRLG-88. Origin MIXED/SYNTHETIC."
    ),
    table_properties=PROPS,
    schema="""
  resource_id STRING NOT NULL COMMENT 'Twin resource key. Physical: S-#### span, N-#### node, SITE-<id> site. Logical: the tmf_resource.logical_resource id cast to STRING.',
  resource_class STRING COMMENT 'SID subclass: physical or logical.',
  resource_type STRING COMMENT 'Physical: span, node, site. Logical: och, wavelength, port.',
  spec_id BIGINT COMMENT 'Physical only: FK to resource_specification.spec_id.',
  spec_name STRING COMMENT 'Physical only: Lakelink Fiber display name of the resource specification.',
  spec_capacity_gbps DOUBLE COMMENT 'Physical only: nominal capacity of the specification in Gbps.',
  corridor_id STRING COMMENT 'Corridor the resource belongs to (FK corridor.corridor_id). Logical resources take it from their span; null for sites.',
  srlg STRING COMMENT 'Shared-risk link group (SRLG-##) of the span conduit; logical resources inherit it from their span. Null for nodes and sites.',
  conduit_id STRING COMMENT 'Physical spans: conduit carrying the span. Spans in one SRLG share the conduit.',
  site_a_id STRING COMMENT 'Spans: A-end node resource_id.',
  site_z_id STRING COMMENT 'Spans: Z-end node resource_id.',
  parent_site_id STRING COMMENT 'Nodes: parent site resource_id.',
  geographic_site_id INT COMMENT 'Sites: FK to cdm_tmforum.fiber_capital_intelligence.geographic_site.geographic_site_id.',
  length_km DOUBLE COMMENT 'Spans: span length in km.',
  status STRING COMMENT 'Physical lifecycle status: in_service, planned, retired. Logical resources inherit the span status.',
  logical_resource_id BIGINT COMMENT 'Logical only: native LONG key (tmf_resource.logical_resource.logical_resource_id).',
  parent_logical_resource_id BIGINT COMMENT 'Logical only: parent logical resource (for example the OCh containing a wavelength).',
  span_id STRING COMMENT 'Logical only: physical span the logical resource is realized on (FK physical span resource_id).',
  capacity_gbps DOUBLE COMMENT 'Logical only: provisioned capacity in Gbps.',
  utilized_gbps DOUBLE COMMENT 'Logical only: utilized Gbps at the 2026-11-16 anchor snapshot.',
  utilization_pct DOUBLE COMMENT 'Logical only: 100 * utilized_gbps / capacity_gbps (0-100 scale).'""" + LINEAGE_DDL,
)
@dp.expect_or_fail("pk_resource_id_not_null", "resource_id IS NOT NULL")
@dp.expect_all({
    "valid_resource_type": "resource_type IN ('span','node','site','och','wavelength','port')",
    "span_has_corridor_and_srlg": "resource_type <> 'span' OR (corridor_id IS NOT NULL AND srlg RLIKE '^SRLG-[0-9]{2}$')",
    "physical_spec_resolves": "resource_class <> 'physical' OR spec_name IS NOT NULL",
    "logical_span_resolves": "resource_class <> 'logical' OR corridor_id IS NOT NULL",
    "logical_capacity_positive": "resource_class <> 'logical' OR capacity_gbps > 0",
    "logical_util_within_capacity": "resource_class <> 'logical' OR (utilized_gbps >= 0 AND utilized_gbps <= capacity_gbps)",
})
def silver_resource():
    pr = spark.read.table("bronze_physical_resource")
    spec = spark.read.table("bronze_resource_specification").select(
        "spec_id", F.col("name").alias("spec_name"), F.col("capacity_gbps").alias("spec_capacity_gbps"))
    phys = (
        pr.join(spec, "spec_id", "left")
        .select(
            "resource_id", F.lit("physical").alias("resource_class"), F.col("type").alias("resource_type"),
            "spec_id", "spec_name", "spec_capacity_gbps", "corridor_id", "srlg", "conduit_id",
            "site_a_id", "site_z_id", "parent_site_id", "geographic_site_id", "length_km", "status",
            F.lit(None).cast("bigint").alias("logical_resource_id"),
            F.lit(None).cast("bigint").alias("parent_logical_resource_id"),
            F.lit(None).cast("string").alias("span_id"),
            F.lit(None).cast("double").alias("capacity_gbps"),
            F.lit(None).cast("double").alias("utilized_gbps"),
            F.lit(None).cast("double").alias("utilization_pct"),
            "source_table", "source_id", "origin", "simulation_run_id")
    )
    spans = pr.where("type = 'span'").select(
        F.col("resource_id").alias("span_id"), F.col("corridor_id").alias("span_corridor_id"),
        F.col("srlg").alias("span_srlg"), F.col("status").alias("span_status"))
    lr = spark.read.table("bronze_logical_resource").join(spans, "span_id", "left")
    logi = lr.select(
        F.col("resource_id").cast("string").alias("resource_id"), F.lit("logical").alias("resource_class"),
        F.col("type").alias("resource_type"),
        F.lit(None).cast("bigint").alias("spec_id"), F.lit(None).cast("string").alias("spec_name"),
        F.lit(None).cast("double").alias("spec_capacity_gbps"),
        F.col("span_corridor_id").alias("corridor_id"), F.col("span_srlg").alias("srlg"),
        F.lit(None).cast("string").alias("conduit_id"), F.lit(None).cast("string").alias("site_a_id"),
        F.lit(None).cast("string").alias("site_z_id"), F.lit(None).cast("string").alias("parent_site_id"),
        F.lit(None).cast("int").alias("geographic_site_id"), F.lit(None).cast("double").alias("length_km"),
        F.col("span_status").alias("status"),
        F.col("resource_id").alias("logical_resource_id"), F.col("parent_id").alias("parent_logical_resource_id"),
        "span_id", "capacity_gbps", "utilized_gbps",
        F.round(F.col("utilized_gbps") * 100.0 / F.col("capacity_gbps"), 2).alias("utilization_pct"),
        "source_table", "source_id", "origin", "simulation_run_id")
    return phys.unionByName(logi)


# ---------------------------------------------------------------- silver_customer
@dp.materialized_view(
    name="silver_customer",
    comment=(
        "Silver SID Customer for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per customer (120). "
        "Fictional Lakelink Fiber display names only; the source name code is not carried. Adds active service "
        "count and total active MRR. Injected anomalies: 12 Dual Path customers on the SRLG-88 spans; 3 high-value "
        "customers on the flagged Iowa copper wire center. Origin MIXED."
    ),
    table_properties=PROPS,
    schema="""
  customer_id BIGINT NOT NULL COMMENT 'Customer key; drawn from network_scenario_twin.dq_customer_candidate_pool (all present in tmf_customer.customer).',
  name STRING COMMENT 'Fictional customer display name (never a real company).',
  segment STRING COMMENT 'Twin segment: enterprise, wholesale, hyperscaler, government, smb.',
  source_segment STRING COMMENT 'Lineage: source segment_classification the twin segment was derived from.',
  naas_flag BOOLEAN COMMENT 'TRUE for NaaS / on-demand customers.',
  dual_path_flag BOOLEAN COMMENT 'TRUE for the 12 SRLG-88 Dual Path customers.',
  copper_wc_id STRING COMMENT 'FK to copper_wire_center.wc_id when the customer is served from a copper wire center.',
  copper_wc_state STRING COMMENT 'State (2-letter) of the customer copper wire center, if any.',
  high_value_flag BOOLEAN COMMENT 'TRUE for top-decile total service MRR, and always for the 3 Iowa wire center customers.',
  active_service_count INT COMMENT 'Number of active services owned by the customer.',
  active_mrr DECIMAL(18,2) COMMENT 'Total monthly recurring revenue (USD) of active services.'""" + LINEAGE_DDL,
)
@dp.expect_or_fail("pk_customer_id_not_null", "customer_id IS NOT NULL")
@dp.expect_all({
    "valid_segment": "segment IN ('enterprise','wholesale','hyperscaler','government','smb')",
    "name_present": "name IS NOT NULL",
    "copper_wc_resolves": "copper_wc_id IS NULL OR copper_wc_state IS NOT NULL",
    "dual_path_has_service": "NOT dual_path_flag OR active_service_count > 0",
})
def silver_customer():
    c = spark.read.table("bronze_customer")
    wc = spark.read.table("bronze_copper_wire_center").select(
        F.col("wc_id").alias("copper_wc_id"), F.col("state").alias("copper_wc_state"))
    svc = (spark.read.table("bronze_service").where("status = 'active'")
           .groupBy("customer_id")
           .agg(F.count("*").cast("int").alias("active_service_count"),
                F.sum("mrr").cast("decimal(18,2)").alias("active_mrr")))
    return (
        c.join(wc, "copper_wc_id", "left").join(svc, "customer_id", "left")
        .select("customer_id", "name", "segment", "source_segment", "naas_flag", "dual_path_flag",
                "copper_wc_id", "copper_wc_state", "high_value_flag",
                F.coalesce("active_service_count", F.lit(0)).cast("int").alias("active_service_count"),
                F.coalesce("active_mrr", F.lit(0)).cast("decimal(18,2)").alias("active_mrr"),
                "source_table", "source_id", "origin", "simulation_run_id")
    )


# ---------------------------------------------------------------- silver_service
@dp.materialized_view(
    name="silver_service",
    comment=(
        "Silver SID Service for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per service (1,500). "
        "Resolves the primary and protect logical resources to the physical spans and SRLGs they ride, and flags "
        "diverse services whose two paths share an SRLG. Injected anomaly: the 12 Dual Path customers have "
        "dual_path services with primary on S-4471 and protect on S-4472 (both SRLG-88). Origin MIXED."
    ),
    table_properties=PROPS,
    schema="""
  service_id BIGINT NOT NULL COMMENT 'Service key = tmf_service.service.service_id.',
  customer_id BIGINT COMMENT 'FK to silver_customer.customer_id (twin assignment).',
  corridor_id STRING COMMENT 'FK to corridor.corridor_id the service is sold on.',
  service_type STRING COMMENT 'wavelength, ethernet, dia, naas_on_demand.',
  protection_scheme STRING COMMENT 'dual_path, protected, unprotected.',
  status STRING COMMENT 'active, pending, disconnected.',
  mrr DECIMAL(18,2) COMMENT 'Monthly recurring revenue in USD.',
  primary_logical_resource_id BIGINT COMMENT 'FK to the primary-path logical resource.',
  protect_logical_resource_id BIGINT COMMENT 'FK to the protect-path logical resource (required for dual_path).',
  primary_span_id STRING COMMENT 'Physical span the primary path rides (resolved via logical_resource.span_id).',
  protect_span_id STRING COMMENT 'Physical span the protect path rides, if any.',
  primary_srlg STRING COMMENT 'SRLG of the primary span.',
  protect_srlg STRING COMMENT 'SRLG of the protect span, if any.',
  shared_srlg_flag BOOLEAN COMMENT 'TRUE when a service has a protect path and both paths share the same SRLG (sold as diverse but not physically diverse).',
  source_party_id BIGINT COMMENT 'Lineage only: party_id of the source tmf_service.service row. Not an FK.'""" + LINEAGE_DDL + """,
  customer_resolved BOOLEAN COMMENT 'Data quality: TRUE when customer_id resolves to a twin customer (backs the customer_resolves expectation).'""",
)
@dp.expect_or_fail("pk_service_id_not_null", "service_id IS NOT NULL")
@dp.expect_all({
    "customer_resolves": "customer_resolved",
    "mrr_positive": "mrr > 0",
    "valid_protection_scheme": "protection_scheme IN ('dual_path','protected','unprotected')",
    "dual_path_has_protect": "protection_scheme <> 'dual_path' OR protect_logical_resource_id IS NOT NULL",
    "primary_path_resolves": "primary_span_id IS NOT NULL",
    "protect_path_resolves": "protect_logical_resource_id IS NULL OR protect_span_id IS NOT NULL",
})
def silver_service():
    s = spark.read.table("bronze_service")
    lr = spark.read.table("bronze_logical_resource").select(F.col("resource_id").alias("lr_id"), "span_id")
    spans = (spark.read.table("bronze_physical_resource").where("type = 'span'")
             .select(F.col("resource_id").alias("span_id"), "srlg"))
    path = lr.join(spans, "span_id", "left")
    pri = path.select(F.col("lr_id").alias("primary_logical_resource_id"),
                      F.col("span_id").alias("primary_span_id"), F.col("srlg").alias("primary_srlg"))
    pro = path.select(F.col("lr_id").alias("protect_logical_resource_id"),
                      F.col("span_id").alias("protect_span_id"), F.col("srlg").alias("protect_srlg"))
    cust = spark.read.table("bronze_customer").select("customer_id", F.lit(True).alias("customer_resolved"))
    return (
        s.join(pri, "primary_logical_resource_id", "left")
        .join(pro, "protect_logical_resource_id", "left")
        .join(cust, "customer_id", "left")
        .withColumn("customer_resolved", F.coalesce("customer_resolved", F.lit(False)))
        .withColumn("shared_srlg_flag", F.coalesce(
            (F.col("protect_srlg").isNotNull() & (F.col("primary_srlg") == F.col("protect_srlg"))), F.lit(False)))
        .select("service_id", "customer_id", "corridor_id", "service_type", "protection_scheme", "status", "mrr",
                "primary_logical_resource_id", "protect_logical_resource_id", "primary_span_id", "protect_span_id",
                "primary_srlg", "protect_srlg", "shared_srlg_flag", "source_party_id",
                "source_table", "source_id", "origin", "simulation_run_id", "customer_resolved")
    )


# ---------------------------------------------------------------- silver_service_level_agreement
@dp.materialized_view(
    name="silver_service_level_agreement",
    comment=(
        "Silver SID ServiceLevelAgreement for the Lakelink Fiber Network Scenario Twin. Grain: 1 row per SLA, "
        "1:1 with service (1,500). Adds the service MRR, protection scheme and the SLA credit exposure if the "
        "service goes down (mrr x credit_pct / 100), the building block of sla_exposure_mrr. Origin MIXED."
    ),
    table_properties=PROPS,
    schema="""
  sla_id BIGINT NOT NULL COMMENT 'SLA key = tmf_customer.service_level_agreement.service_level_agreement_id.',
  service_id BIGINT COMMENT 'FK to silver_service.service_id (unique, 1:1).',
  customer_id BIGINT COMMENT 'FK to silver_customer.customer_id; equals the service customer_id.',
  protection_scheme STRING COMMENT 'Protection scheme of the covered service.',
  latency_target_ms DOUBLE COMMENT 'Latency target in ms (generated 5-60 per contract v1.1).',
  availability_target_pct DOUBLE COMMENT 'Availability target, 0-100 scale: 99.9 / 99.99 / 99.999 by protection scheme.',
  credit_pct DOUBLE COMMENT 'SLA credit percent of MRR owed on breach, 0-100 scale.',
  service_mrr DECIMAL(18,2) COMMENT 'MRR (USD) of the covered service.',
  exposure_mrr_if_down DECIMAL(18,2) COMMENT 'SLA credit exposure in USD if the service goes down: service_mrr x credit_pct / 100.',
  source_customer_id BIGINT COMMENT 'Lineage only: customer_id of the source SLA row. Not an FK.'""" + LINEAGE_DDL + """,
  service_customer_id BIGINT COMMENT 'Data quality: customer_id of the covered service (backs the customer_matches_service expectation).'""",
)
@dp.expect_or_fail("pk_sla_id_not_null", "sla_id IS NOT NULL")
@dp.expect_all({
    "service_resolves": "service_mrr IS NOT NULL",
    "customer_matches_service": "customer_id = service_customer_id",
    "credit_pct_in_range": "credit_pct > 0 AND credit_pct <= 100",
    "valid_availability_target": "availability_target_pct IN (99.9, 99.99, 99.999)",
    "latency_target_positive": "latency_target_ms > 0",
})
def silver_service_level_agreement():
    sla = spark.read.table("bronze_service_level_agreement")
    svc = spark.read.table("bronze_service").select(
        "service_id", F.col("customer_id").alias("service_customer_id"), "protection_scheme",
        F.col("mrr").alias("service_mrr"))
    return (
        sla.join(svc, "service_id", "left")
        .withColumn("exposure_mrr_if_down",
                    (F.col("service_mrr") * F.col("credit_pct") / F.lit(100)).cast("decimal(18,2)"))
        .select("sla_id", "service_id", "customer_id", "protection_scheme", "latency_target_ms",
                "availability_target_pct", "credit_pct", "service_mrr", "exposure_mrr_if_down",
                "source_customer_id", "source_table", "source_id", "origin", "simulation_run_id",
                "service_customer_id")
    )
