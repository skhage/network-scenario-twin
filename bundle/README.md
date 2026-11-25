# Lakelink Fiber Network Scenario Twin: Declarative Automation Bundle

This folder is the bundle root (`databricks.yml`) for the Lakelink Fiber Network Scenario Twin. Owner: @devops.

## Layout

* `databricks.yml`: bundle name `network_scenario_twin`, variables, tag presets, and targets.
* `resources/<name>.<resource_type>.yml`: one file per resource. Added under P5-BUNDLE-RESOURCES (2026-11-23):
  * `twin.pipeline.yml`: Lakeflow Spark Declarative Pipeline (bronze, silver, gold), source in `../pipeline/`. Mirrors live pipeline `0c11cb07-999f-4b4d-a7fe-2137a94c90c2`.
  * `twin_refresh.job.yml`: daily refresh job (pipeline_task on the twin pipeline), serverless, schedule ships PAUSED.
  * `scenario_twin.app.yml`: the one Databricks App, "Lakelink Fiber Scenario Twin" (`lakelink-scenario-twin`), source in `../apps/lakelink-scenario-twin`, Lakebase resource `twin-state`.
  * `twin.dashboard.yml`: NOT YET ADDED. The AI/BI dashboard does not exist yet (P4-DASHBOARD). Added under P5-BUNDLE-DASHBOARD once `../dashboards/*.lvdash.json` is on main.
* Code lives at the repo root. `sync.paths: [..]` syncs it, and docs, tests, and the bundle folder are excluded.

## Conventions

* UC target: `${var.catalog}.${var.schema}` = `cdm_tmforum.network_scenario_twin` (D-001).
* Tagging: `presets.tags` applies `telco_project: network_scenario_twin` to every taggable resource. UC objects are tagged separately with `ALTER ... SET TAGS`.
* Warehouse: reuses the existing shared `serverless-compute` warehouse through a lookup variable.
* Compute: serverless for jobs and pipelines. Do not define classic clusters unless the workload cannot run serverless.
* App name: exactly one app (D-004). The name is pinned to the existing `lakelink-scenario-twin` and is NOT namespaced per developer, because a namespaced name would create a second app on deploy.
* Bound and deployed to dev on 2026-11-25 (P5-BUNDLE-BIND-DEPLOY, D-015): `twin_pipeline` -> `0c11cb07-999f-4b4d-a7fe-2137a94c90c2`, `scenario_twin_app` -> `lakelink-scenario-twin`, new job `twin_refresh` = 414227639240335 (PAUSED). Deploy result: 1 created, 2 changed, 0 deleted; source-linked (in-place). Re-run the bind commands below only for a fresh target or lost state.
* Bind before the first deploy. `bundle plan --target dev` shows `3 to add` while unbound: a second pipeline that writes to the same tables, and a second app. Bind the existing resources first (needs the @pm ruling P5-BUNDLE-BIND-RULING):
  * `databricks bundle deployment bind twin_pipeline 0c11cb07-999f-4b4d-a7fe-2137a94c90c2 --target dev`
  * `databricks bundle deployment bind scenario_twin_app lakelink-scenario-twin --target dev`
  * Once bound, a dev deploy renames the pipeline with the `[dev stephen_hage] ` prefix, adds a `dev` tag, and redeploys the app from the same source path. Sync mode is in-place, so library paths stay unchanged.
* Branding: the company name is always Lakelink Fiber.

## Twin assistant endpoint governance (P5-AI-GATEWAY, 2026-11-25)

* Endpoint `mas-4a251ff6-endpoint` (Agent Bricks Supervisor Agent, tile `4a251ff6-d504-42ec-a605-b822d96207e2`) is managed by Agent Bricks and is NOT a bundle resource.
* AI Gateway (legacy endpoint `ai-gateway` block) is not available for this endpoint type: `PUT /api/2.0/serving-endpoints/mas-4a251ff6-endpoint/ai-gateway` returns 404 "AI Gateway is currently only supported for External Models, Provisioned Throughput and Custom or Agent Model endpoints." Unity Gateway service policies also reject agent services, so platform-level PII, safety, and rate-limit guardrails cannot be attached today.
* Controls in place instead:
  * Usage logging: MLflow traces in experiment `2158510149163116` (157 traces 2026-11-23 to 2026-11-25 at verification time).
  * Input guardrail: the deterministic `policy_check` UC function (`cdm_tmforum.network_scenario_twin`) runs first on every turn (read-only change-request refusal, external-company refusal).
  * Access: app service principal `61b6158f-4833-4da6-9116-20461eb91f17` has CAN_QUERY only; humans via `admins` and the owner.
  * Tags: `telco_project: network_scenario_twin` on the endpoint and on the trace experiment.
* Revisit if Agent Bricks adds AI Gateway support for supervisor endpoints.

## Commands (run with this folder as the working directory)

* `databricks bundle validate --strict --target dev`
* `databricks bundle plan --target dev` (read-only; run it after binding and expect `0 to add` for the pipeline and app)
* `databricks bundle deploy --target dev` (only after binding, per P5-BUNDLE-BIND-DEPLOY)

Local state in `.databricks/` is git-ignored.
