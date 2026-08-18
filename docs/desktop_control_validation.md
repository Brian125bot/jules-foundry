# Desktop Control-Plane Validation

**Viewport reviewed:** 1440 × 900 desktop workspace  
**Scope:** Command center, Fleet observatory, Initiatives, Credential vault, and an existing mission-detail record.

The workstation redesign retains the dark navigation rail, cyan control accents, rounded white work surfaces, and evidence-oriented visual language. The desktop layout now uses the full content canvas more intentionally: the command center presents four metrics in one scan line, Fleet restores the dense mission table at wide desktop widths, the initiative graph expands a single task into a meaningful work card, and the vault presents three provider profiles evenly across the workspace.

| Surface | Desktop control finding |
|---|---|
| Command center | The **New initiative**, **Open Fleet**, and provider-configuration routes remain visible and reachable. |
| Fleet observatory | Search, all five health filters, reconciliation, and mission-row navigation remain visible in the desktop table. |
| Initiatives | **New initiative**, **Compile**, task opening, and **Delete** actions remain in the header and graph surfaces. |
| Credential vault | **Add credential**, **Test**, **Rotate**, and delete controls remain visible on each provider card. |
| Mission detail | Dispatch/poll, evidence verification, plan approval/guidance/rejection, dossier export, and evidence-linking controls remain available. |

The corresponding source-level desktop smoke suite verifies that these retained controls and mutations continue to exist after the layout redesign. Full type checking and the existing backend regression suite are also required before release.
