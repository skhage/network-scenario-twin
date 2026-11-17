# Lakelink Fiber Brand and UX Guide: Network Scenario Twin

| Item | Value |
| --- | --- |
| Owner | @designer (UX and Brand Authority; findings are binding) |
| Task | P0-BRAND-GUIDE |
| Version | v1.0, 2026-11-17 |
| Applies to | The one Databricks App "Lakelink Fiber Scenario Twin", the AI/BI dashboard(s), the Genie space "Lakelink Fiber Network Scenario Twin", the "Lakelink Fiber Twin Copilot", notebooks, and docs |
| Supersedes | `apps/ARCHITECTURE.md` section 5 provisional tokens |
| Tag | `telco_project: network_scenario_twin` |

---

## 1. Name and voice

* The company is always **Lakelink Fiber**. Never use a real carrier, vendor-customer, or executive name anywhere: UI copy, page titles, HTML `<title>`, metadata, chart titles, Genie instructions and sample questions, copilot system prompts, synthetic customer names, test fixtures, and screenshots.
* Exec quotes from the research plan are attributed by role only ("Lakelink Fiber CTO"), never by person.
* Product names (exact strings): "Lakelink Fiber Scenario Twin" (app), "Lakelink Fiber Network Scenario Twin" (Genie space), "Lakelink Fiber Twin Copilot" (agent).
* Positioning line (D-003): "Intelligence layer above the inventory system of record." Never call the twin an inventory system.
* Voice: plain, confident, operational. Lead with the number, then the consequence ("12 Dual Path customers lose both paths if S-4471 fails"). Sentence case for headings and buttons. No exclamation marks or emoji in product UI.
* Every number is labelled by provenance with a badge: **Observed** (telemetry/gold), **Simulated** (sim_failure_result), **Forecast** (sim_capacity_forecast). Money shows unit and period: "USD/month".
* Customer names in the UI are fictional. Do not show any PII beyond the fictional customer name.

## 2. Color tokens

### 2.1 Core palette (brand-fixed)

| Token | Hex | Role |
| --- | --- | --- |
| `--lf-primary` | #FF3621 | Brand accent: wordmark, active nav indicator, large headline numbers, icons, focus ring, chart series 1 |
| `--lf-navy` | #1B3139 | Primary text, top bar, headings, chart series 2 |
| `--lf-green` | #00A972 | Positive/healthy accent fills and icons, chart series 3 |
| `--lf-surface` | #F9F7F4 | Page background |
| `--lf-white` | #FFFFFF | Cards, tables, drawers |

### 2.2 Accessible derived tokens (required for text)

Measured contrast (WCAG 2.1 relative luminance, computed 2026-11-17) shows that #FF3621 and #00A972 **fail 4.5:1 for normal-size text** on the light surfaces. These derived tokens are mandatory wherever those hues carry text.

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `--lf-primary-strong` | #C8250F | Primary button fill (with white text), red link/text, DOWN status text | 5.27:1 on surface; white on it 5.63:1 |
| `--lf-green-strong` | #00704C | Green text, "OK/healthy" status text, success button | 5.74:1 on surface; white on it 6.14:1 |
| `--lf-ink-secondary` | #4A5A61 | Secondary/caption text, axis labels | 6.71:1 on surface |
| `--lf-border` | #D9D4CC | Decorative dividers only (1.38:1; never the only boundary of an input) |
| `--lf-input-border` | #6E8898 | Input and control borders | 3.48:1 on surface (meets 3:1 non-text) |

### 2.3 Measured contrast reference

| Foreground on background | Ratio | Normal text (4.5) | Large text / UI (3.0) |
| --- | --- | --- | --- |
| Navy #1B3139 on surface #F9F7F4 | 12.71 | Pass | Pass |
| Navy on white | 13.59 | Pass | Pass |
| White on navy (top bar) | 13.59 | Pass | Pass |
| Primary #FF3621 on surface | 3.39 | **Fail** | Pass |
| Primary on white | 3.62 | **Fail** | Pass |
| White on primary | 3.62 | **Fail** | Pass (large/bold only) |
| Primary on navy | 3.76 | **Fail** | Pass |
| Green #00A972 on surface | 2.84 | **Fail** | **Fail** |
| Green on white | 3.04 | **Fail** | Pass (barely) |
| Green on navy | 4.48 | **Fail** | Pass |
| Slate #6E8898 on surface | 3.48 | **Fail** | Pass |
| Salmon #FF8C69 on surface | 2.13 | **Fail** | **Fail** |
| Salmon on navy | 5.96 | Pass | Pass |
| Primary-strong #C8250F on surface | 5.27 | Pass | Pass |
| Green-strong #00704C on surface | 5.74 | Pass | Pass |

### 2.4 Binding color rules

1. Body and table text: navy or `--lf-ink-secondary` only.
2. #FF3621 as text only at large size (at least 24px regular or 18.66px bold), e.g. the countdown hero number. Otherwise use `--lf-primary-strong`.
3. Primary buttons: `--lf-primary-strong` fill with white text. #FF3621 fill is allowed only for buttons with bold label at 18.66px or larger.
4. #00A972 is never used for text or as the sole boundary on #F9F7F4 (fails 3:1). Use it on white cards (3.04) or with a navy outline; use `--lf-green-strong` for text.
5. Never place #FF3621 adjacent to #00A972 as the only distinction (1.19:1, red/green color-blind collision).

## 3. Status semantics (never color alone, WCAG 1.4.1)

| State | Text label | Lucide icon | Text color | Badge fill |
| --- | --- | --- | --- | --- |
| DOWN | "Down" | `circle-x` | `--lf-primary-strong` | #FDE7E3 |
| DEGRADED | "Degraded" | `triangle-alert` | navy | #FFE8DF |
| OK | "Healthy" | `circle-check` | `--lf-green-strong` | #E0F4EC |
| STALE | "Stale: twin as of <ts>" | `clock-alert` | navy | #ECEFF1 |
| EMPTY | "No simulated result yet" | `circle-dashed` | `--lf-ink-secondary` | none |
| Flagged (copper) | "Migrate N high-value customers before retirement" | `flag` | navy | #FDE7E3 |
| Provenance | "Observed" / "Simulated" / "Forecast" | `activity` / `flask-conical` / `trending-up` | navy | #ECEFF1 |

Empty is never rendered as 0. A zero is shown only when the source returns a real zero with `status = ok`.

## 4. Data visualization

### 4.1 Categorical order

`#FF3621 -> #1B3139 -> #00A972 -> #6E8898 -> #FF8C69`. Series 1 (#FF3621) is reserved for the headline series (the corridor or resource at risk). Use at most 5 categorical series; group the rest as "Other" in slate.

### 4.2 Chart rules (binding)

* Charts sit on white cards, not directly on the surface (raises green to 3.04:1).
* #FF8C69 (salmon) fails 3:1 on light backgrounds: use it only as an area/band fill (e.g. P10-P90 forecast band at 30% opacity) or with a navy 1px outline, never as a thin line or small marker.
* Distinguish series by more than hue: direct labels at line ends, dashed for forecast, solid for observed, and shape markers.
* Corridor exhaustion chart: observed = navy solid 2px; forecast P50 = #FF3621 dashed 2px; P10-P90 = #FF8C69 band 30%; 95% exhaustion threshold = `--lf-primary-strong` dotted reference line with text label "95% exhaustion threshold"; pre-build trigger = vertical navy dashed line labelled with the date.
* Every chart has a title in sentence case, axis titles with units (%, USD/month, days), and a "View as table" toggle that renders the same data as an accessible table (WCAG 1.1.1).
* Number formats: utilization "85.2%"; money "$1.24M/month" (compact) with exact value in tooltip and table; dates "Mar 17, 2027"; durations "120 days".
* AI/BI dashboards: apply the same series order via widget color overrides; dashboard title prefix "Lakelink Fiber".

## 5. Typography

* Family: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Numbers use `font-variant-numeric: tabular-nums` in tables and KPIs.
* Scale (px / line-height / weight): Display 40/48/700 (countdown hero), H1 32/40/600, H2 24/32/600, H3 20/28/600, Body 16/24/400, Small 14/20/400, Caption 12/16/500 (captions never carry essential information).
* Minimum body size 14px. Text must reflow at 200% zoom without loss (WCAG 1.4.4) and with user text-spacing overrides (1.4.12).

## 6. Spacing, layout, and responsive

* 8px grid: spacing tokens 4 (hairline exceptions only), 8, 16, 24, 32, 48, 64.
* Radius: 8px cards and inputs, 4px badges, 999px chips.
* Elevation: card shadow `0 1px 2px rgba(27,49,57,0.08)`; drawer `0 8px 24px rgba(27,49,57,0.16)`.
* Shell: navy top bar 56px (Lakelink Fiber wordmark, "Twin as of <ts>" chip, copilot toggle), left nav 240px, content max-width 1440px, 24px gutters.
* Breakpoints (demo-laptop priority): **1280** (full layout, 4-up KPI row), **1024** (nav collapses to 64px icon rail with tooltips and labels via `aria-label`; KPI row 3-up), **768** (nav becomes a top menu button; KPI row 2-up; tables scroll horizontally inside their card with a sticky first column; copilot drawer becomes full-width overlay). Content must reflow at 320 CSS px without two-dimensional scrolling except data tables (WCAG 1.4.10).
* Touch/click targets at least 24x24px (target 40px for primary controls).

## 7. Iconography

* Lucide only, 1.5px stroke, 16px inline / 20px nav / 24px empty states, `currentColor`.
* Decorative icons get `aria-hidden="true"`; icon-only buttons need an `aria-label`.

## 8. Accessibility checklist (WCAG 2.1 AA, binding gate for P5-UX-REVIEW)

1. Contrast: text 4.5:1 (large 3:1); UI components and meaningful graphics 3:1 (sections 2.3 and 4.2).
2. Color is never the only signal (section 3).
3. Full keyboard path: skip-to-content link, logical tab order, nav, pickers, toggles, sortable table headers, drawer. Escape closes the copilot drawer and returns focus to the toggle.
4. Visible focus: 2px #FF3621 outline + 2px offset on light surfaces; 2px white outline on navy.
5. Semantics: one `h1` per view; landmarks (`header`, `nav`, `main`, `aside` for copilot); tables use `th scope` and `aria-sort`.
6. Live regions: copilot streamed output in `aria-live="polite"`; loading/stale/error banners announced; the counterfactual toggle announces the new DOWN/DEGRADED counts.
7. Forms and pickers: visible labels, typeahead follows the ARIA combobox pattern, errors in text.
8. Motion: respect `prefers-reduced-motion` (no animated countdown ticking; skeleton shimmer disabled).
9. Every chart has a table alternative and a text summary (e.g. "DEN-SLC reaches 95% on Mar 17, 2027, in 120 days (P10-P90: 104 to 138 days).")
10. Page `<title>` follows "<View> | Lakelink Fiber Scenario Twin"; `lang="en"` set.

## 9. Required states (every view and every dashboard widget where possible)

| State | Treatment |
| --- | --- |
| Loading | Skeletons matching final layout; no spinner-only pages |
| Empty | Icon + "No simulated result for <id> yet" + next action; never "0" |
| Error | Text error with route name and a Retry button; no raw stack traces |
| Stale | Banner "Twin data is older than 24 hours (as of <ts>)" |
| Copilot unavailable | Drawer shows "Copilot not yet available"; Genie fallback labelled "Genie mode" |

## 10. Genie space and copilot copy

* Space title: "Lakelink Fiber Network Scenario Twin". Description opens with the positioning line (D-003).
* Sample questions: use the 8 from `project_plan.md` section 11.3 verbatim; no real company names.
* General instructions must tell the space to label simulated vs forecast vs observed numbers, state units (USD/month, %, days), and say "no simulated result yet" rather than 0 when a resource has no sim row.
* Copilot answers show citation chips (table or function name) and a provenance badge; refusals to edit inventory are shown as-is.

## 11. Review protocol

* @designer reviews against sections 1-10. Each finding becomes an `agent_tasks` row for @app-developer (app) or @data-analyst (dashboards, Genie space) with `assigned_by = '@designer'`, a severity (critical = WCAG failure or real-name leak; high = brand/state violation; medium = polish), and the section number violated.
* Brand lint: the app build must fail if any non-Lakelink company name appears in `client/` or `server/` strings (see ARCHITECTURE section 6).
* Changes to this guide are versioned in the header table and recorded in `asset_ledger`.
