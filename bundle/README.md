# Lakelink Fiber Network Scenario Twin: Declarative Automation Bundle

This folder is the bundle root (`databricks.yml`) for the Lakelink Fiber Network Scenario Twin. Owner: @devops.

## Layout

* `databricks.yml`: bundle name `network_scenario_twin`, variables, tag presets, and targets.
* `resources/<name>.<resource_type>.yml`: one file per resource. Added under P5-BUNDLE-RESOURCES:
  * `twin.pipeline.yml`: Lakeflow Spark Declarative Pipeline (bronze, silver, gold), source in `../pipeline/`
  * `*.job.yml`: generator and refresh jobs, source in `../src/`
  * `twin.dashboard.yml`: AI/BI dashboard, source in `../dashboards/`
  * `scenario_twin.app.yml`: the one Databricks App, "Lakelink Fiber Scenario Twin", source in `../apps/`
* Code lives at the repo root. `sync.paths: [..]` syncs it, and docs, tests, and the bundle folder are excluded.

## Conventions

* UC target: `${var.catalog}.${var.schema}` = `cdm_tmforum.network_scenario_twin` (D-001).
* Tagging: `presets.tags` applies `telco_project: network_scenario_twin` to every taggable resource. UC objects are tagged separately with `ALTER ... SET TAGS`.
* Warehouse: reuses the existing shared `serverless-compute` warehouse through a lookup variable.
* Compute: serverless for jobs and pipelines. Do not define classic clusters unless the workload cannot run serverless.
* App name: exactly one app. Namespace it per developer in dev with `${workspace.current_user.domain_friendly_name}`, and pin a stable name in a later prod target.
* Branding: the company name is always Lakelink Fiber.

## Commands (run with this folder as the working directory)

* `databricks bundle validate --strict --target dev`
* `databricks bundle deploy --target dev` (only after P5-BUNDLE-RESOURCES is ready)

Local state in `.databricks/` is git-ignored.
