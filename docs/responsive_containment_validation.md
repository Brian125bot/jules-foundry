# Responsive Containment Validation

**Date:** 2026-08-17  
**Scope:** Jules Foundry control-plane responsiveness after the horizontal-overflow repair.

## Findings

The shared dashboard shell now constrains the sidebar inset, primary content area, and document root to the active viewport. Page-level content wrappers use shrink-safe sizing, while dense information surfaces either reflow into cards or keep overflow confined to their own panel.

| View | Desktop review | Mobile review | Result |
|---|---|---|---|
| Command center | Metric grid and two-column operational panels remain inside the post-sidebar workspace. | Metrics stack cleanly with no right-side spill. | Passed |
| Fleet observatory | At standard desktop width, missions use contained cards rather than a clipped wide table. The full table is reserved for very wide workspaces. | Mission cards replace the dense table, keeping status, risk, age, and polling information visible without horizontal scrolling. | Passed |
| Initiatives | Task graph uses bounded cards and a `minmax(0, 1fr)` policy column rather than a `min-w-max` horizontal strip. | Task cards stack within the initiative card; controls wrap without extending the card. | Passed |
| Credential vault | Provider cards remain within the three-column desktop grid. | Provider cards stack with actions remaining in view. | Passed |
| Mission detail `/tasks/150007` | Mission controls, plan gate, timeline, operations ledger, and evidence stack fit within the workspace. | The real mission detail reflows to a single column; controls, ledger copy, and acceptance-criterion rows remain contained. | Passed |

## Intentional scroll behavior

Dense desktop-only tables retain panel-local horizontal scrolling only on sufficiently wide breakpoints. This does not expand the page or create body-level horizontal overflow. At smaller breakpoints, the Fleet replaces the table with readable mission cards.
