# Lakelink Fiber Network Scenario Twin - SDP bronze layer (P2-SDP-BRONZE, @data-engineer)
#
# Lands the 12 generated raw twin tables from cdm_tmforum.network_scenario_twin as
# bronze_<table> materialized views in the same schema. The sources are batch Delta tables
# rewritten in full by src/gen/generate_twin (seed 4471), so materialized views are used
# rather than streaming tables (a streaming read would break on each overwrite).
#
# Semantic modeling mandate: each bronze MV carries the source table comment plus the
# source column comments (taken from the source schema metadata), plus two lineage columns.
# Model outputs sim_failure_result / sim_capacity_forecast are Phase 3 and are not landed here.
# Tagging: pipeline carries telco_project=network_scenario_twin; table tags are applied after
# each update where the governed tag policy allows (see P1-TAG-REAPPLY).

from pyspark import pipelines as dp
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType

SOURCE_CATALOG = "cdm_tmforum"
SOURCE_SCHEMA = "network_scenario_twin"

TWIN_TABLES = [
    "resource_specification",
    "corridor",
    "customer",
    "physical_resource",
    "logical_resource",
    "service",
    "service_level_agreement",
    "telemetry_span_hourly",
    "copper_wire_center",
    "alarm",
    "trouble_ticket",
    "maintenance_window",
]

LINEAGE_FIELDS = [
    StructField("_source_table", StringType(), True,
                {"comment": "Bronze lineage: fully qualified source table this row was landed from."}),
    StructField("_ingested_at", TimestampType(), True,
                {"comment": "Bronze lineage: UTC timestamp of the pipeline refresh that landed this row."}),
]


def _source_comment(table: str) -> str:
    row = (
        spark.table(f"{SOURCE_CATALOG}.information_schema.tables")
        .where((F.col("table_schema") == SOURCE_SCHEMA) & (F.col("table_name") == table))
        .select("comment")
        .first()
    )
    return (row[0] if row and row[0] else "").strip()


def _define_bronze(table: str) -> None:
    source = f"{SOURCE_CATALOG}.{SOURCE_SCHEMA}.{table}"
    source_schema = spark.table(source).schema
    schema = StructType(list(source_schema.fields) + LINEAGE_FIELDS)
    comment = (
        f"Bronze (raw landing) copy of {source} for the Lakelink Fiber Network Scenario Twin. "
        f"Source: {_source_comment(table)}"
    )

    @dp.materialized_view(
        name=f"bronze_{table}",
        comment=comment,
        schema=schema,
        table_properties={
            "quality": "bronze",
            "telco_project": "network_scenario_twin",
            "source_table": source,
        },
    )
    def _bronze():
        return (
            spark.read.table(source)
            .withColumn("_source_table", F.lit(source))
            .withColumn("_ingested_at", F.current_timestamp())
        )


for _t in TWIN_TABLES:
    _define_bronze(_t)
