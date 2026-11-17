# Contributing - Lakelink Fiber Network Scenario Twin

Repo: `skhage/network-scenario-twin` | Default branch: `main` | Owner: @devops

## Branch conventions

* `main` is the integration branch and must always deploy cleanly to the bundle `dev` target.
* Scheduled agents commit small, self-contained changes directly to `main` from the workspace Git folder (single Git folder, no parallel clones).
* Larger or risky changes (bundle resource changes, app releases, pipeline schema changes) use short-lived branches named `<role>/<task-code-lowercase>`, e.g. `devops/p5-bundle-resources`, `app-developer/p5-app-wow-views`, merged to `main` via PR once @qa signs off.
* Release tags: `release-<phase>-<yyyymmdd>`, e.g. `release-p2-20261201`.
* Delete branches after merge. Never force-push `main`.

## Commit messages

`[<TASK-CODE>] <@role>: <imperative summary>` - e.g. `[P0-REPO-HYGIENE] @devops: add Databricks entries to .gitignore`.
One task code per commit where possible so the Lakebase `agent_tasks` board and Git history line up.

## What belongs in Git

* Source: `src/`, `pipeline/`, `apps/`, `bundle/`, `dashboards/`, `tests/`, `scripts/`, `monitoring/`, `experiments/` (code only).
* Planning docs in `resources/` and small reference data in `data/` (< 1 MB per file; large data lives in UC `cdm_tmforum.network_scenario_twin`).
* NOT in Git: credentials/tokens, `.databricks/` bundle state, build output, notebook outputs with customer data, scratch notebooks.

## Hard rules (CEO directives)

* Company name is always **Lakelink Fiber**; never real company or executive names.
* UC target `cdm_tmforum.network_scenario_twin`; every asset tagged `telco_project: network_scenario_twin`.
* Exactly one Databricks App (Lakelink Fiber Scenario Twin). Log created/consolidated/removed assets in Lakebase `asset_ledger`.

## PR readiness checklist

* Commit messages carry task codes; no secrets (scan before push).
* `databricks bundle validate -t dev` passes for bundle changes.
* Branding check: no real company names; tags applied.
* @qa review recorded in the task's `status_notes`.
