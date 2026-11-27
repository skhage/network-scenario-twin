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


# ------------------------------------------------------------ bronze_telemetry_stream
# P2-STREAMING-TELEMETRY: pluggable streaming telemetry ingestion layer.
#   nst.telemetry.source = volume (default) -> Auto Loader over the OTEL-style JSON landing volume
#                          (synthetic producer: src/gen/generate_twin, section P2-STREAMING-TELEMETRY)
#   nst.telemetry.source = kafka            -> Kafka / Event Hubs (Kafka surface) topic with the same JSON envelope;
#                          set nst.telemetry.kafka.bootstrap and nst.telemetry.kafka.topic. Auth (P2-STREAM-REPLAY-IDEMPOTENCY):
#                          set nst.telemetry.kafka.secret_scope + nst.telemetry.kafka.secret_key to a secret holding the full
#                          SASL JAAS config line -> SASL_SSL / PLAIN (Event Hubs Kafka surface or Confluent API key). If unset,
#                          the reader connects without auth (local/dev brokers only). Not exercised in the demo (volume source).
# Both paths produce the same bronze schema, so silver/gold are unaffected by the source choice.
TELEMETRY_LANDING = "/Volumes/cdm_tmforum/network_scenario_twin/telemetry_landing/otel_json"
TELEMETRY_ENVELOPE = (
    "event_id STRING, event_time STRING, producer STRING, batch_id BIGINT, "
    "resource STRUCT<span_id: STRING, corridor_id: STRING>, "
    "metrics STRUCT<utilization_pct: DOUBLE, latency_ms: DOUBLE, optical_margin_db: DOUBLE>, "
    "origin STRING, simulation_run_id STRING"
)


@dp.table(
    name="bronze_telemetry_stream",
    comment=(
        "Bronze streaming table: raw span telemetry events for the Lakelink Fiber Network Scenario Twin "
        "(P2-STREAMING-TELEMETRY). One row per received OTEL-style JSON envelope, append-only. Pluggable source: "
        "UC volume telemetry_landing (default, synthetic 5-minute samples continuing telemetry_span_hourly after "
        "2026-11-15 23:00 UTC) or a Kafka/Event Hubs topic. Origin SYNTHETIC in the demo."
    ),
    table_properties={"quality": "bronze", "telco_project": "network_scenario_twin",
                      "source_table": TELEMETRY_LANDING},
    schema="""
  event_id STRING COMMENT 'Producer event id (32-hex sha2 of run id, span, batch, sample); dedup key downstream.',
  event_time STRING COMMENT 'Sample timestamp as ISO-8601 UTC string from the envelope (parsed to TIMESTAMP in silver).',
  producer STRING COMMENT 'Producer identifier (nst-synthetic-otel for the demo generator; collector name in production).',
  batch_id BIGINT COMMENT 'Producer micro-batch number (one batch = 1 hour of 5-minute samples for 600 spans).',
  resource STRUCT<span_id: STRING, corridor_id: STRING> COMMENT 'OTEL resource attributes: span_id (FK -> physical_resource.resource_id, type span) and corridor_id (FK -> corridor.corridor_id).',
  metrics STRUCT<utilization_pct: DOUBLE, latency_ms: DOUBLE, optical_margin_db: DOUBLE> COMMENT 'Sampled metrics: utilization percent (0-100), one-way latency ms (> 0), optical margin dB (floor 0.5).',
  origin STRING COMMENT 'Data origin: SYNTHETIC (demo producer) or REAL (production collector).',
  simulation_run_id STRING COMMENT 'Producer run id (nst-stream-001 for the demo stream).',
  _source_file STRING COMMENT 'Bronze lineage: landing file path (volume source) or kafka topic/partition/offset (kafka source).',
  _ingested_at TIMESTAMP COMMENT 'Bronze lineage: UTC timestamp when the pipeline ingested the event.'
""",
)
def bronze_telemetry_stream():
    source = spark.conf.get("nst.telemetry.source", "volume")
    if source == "kafka":
        reader = (
            spark.readStream.format("kafka")
            .option("kafka.bootstrap.servers", spark.conf.get("nst.telemetry.kafka.bootstrap"))
            .option("subscribe", spark.conf.get("nst.telemetry.kafka.topic"))
            .option("startingOffsets", "earliest")
        )
        scope = spark.conf.get("nst.telemetry.kafka.secret_scope", "")
        key = spark.conf.get("nst.telemetry.kafka.secret_key", "")
        if scope and key:
            from pyspark.dbutils import DBUtils
            jaas = DBUtils(spark).secrets.get(scope=scope, key=key)  # never logged or stored in pipeline config
            reader = (reader.option("kafka.security.protocol", "SASL_SSL")
                      .option("kafka.sasl.mechanism", spark.conf.get("nst.telemetry.kafka.sasl_mechanism", "PLAIN"))
                      .option("kafka.sasl.jaas.config", jaas))
        raw = reader.load()
        parsed = raw.select(
            F.from_json(F.col("value").cast("string"), TELEMETRY_ENVELOPE).alias("e"),
            F.concat_ws("/", F.col("topic"), F.col("partition").cast("string"), F.col("offset").cast("string")).alias("_source_file"),
        ).select("e.*", "_source_file")
    else:
        parsed = (
            spark.readStream.format("cloudFiles")
            .option("cloudFiles.format", "json")
            .schema(TELEMETRY_ENVELOPE)
            .load(TELEMETRY_LANDING)
            .withColumn("_source_file", F.col("_metadata.file_path"))
        )
    return parsed.withColumn("_ingested_at", F.current_timestamp())
