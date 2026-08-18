# Browser Workspace Layout Validation

**Viewport reviewed:** 1440 × 900 browser workspace

**Scope:** Command center, Fleet observatory, Initiatives, Credential vault, and an existing mission-detail record.

The browser-based local workspace retains the dark navigation rail, cyan control accents, rounded white work surfaces, and evidence-oriented visual language. At wide viewport widths, the command center presents four metrics in one scan line, Fleet uses a dense mission table, the initiative graph gives a selected task a meaningful work card, and Credential vault presents provider profiles evenly across the workspace.

| Surface | Browser workspace finding |
|---|---|
| Command center | **New initiative**, **Open Fleet**, and provider-configuration routes remain visible and reachable. |
| Fleet observatory | Search, all five health filters, reconciliation, and mission-row navigation remain visible in the wide table. |
| Initiatives | **New initiative**, **Compile**, task opening, and **Delete** actions remain in the header and graph surfaces. |
| Credential vault | **Add credential**, **Test**, **Rotate**, and delete controls remain visible on each provider card. |
| Mission detail | Dispatch/poll, evidence verification, plan approval/guidance/rejection, dossier export, and evidence-linking controls remain available. |

The corresponding browser-control smoke suite verifies that these controls and mutations remain wired after layout changes. Run `pnpm release:verify` before sharing a change.
