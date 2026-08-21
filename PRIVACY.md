# Privacy and Data Handling

Jules Foundry is a local-first application. It does not use hosted analytics, a cloud account, a managed database, or a hosted setup service in the supported local runtime.

| Data category | Destination | Control and retention |
|---|---|---|
| Provider credentials | Encrypted local credential vault | Stored in the local application-data directory. The vault key is normally held by the operating-system credential store; a passphrase fallback is available. |
| Initiatives, task ledger, evidence, and backups | Local SQLite database and local application-data directory | Controlled by the local operating-system user. Backups remain local unless the operator copies them elsewhere. |
| Initiative prompts and task context | Gemini or Google Jules only when the operator invokes the corresponding operation | The operator is responsible for ensuring they are authorized to submit the material. |
| Repository and branch metadata | GitHub and Google Jules only when the operator validates or dispatches a task | Use least-privilege credentials limited to intended repositories. |
| Telemetry | None in the supported runtime | The build policy rejects hosted analytics and executable browser-origin egress. |

Do not submit secrets, personal data, proprietary source material, or regulated information to a provider unless you are authorized to do so and have reviewed that provider’s current terms and data practices.

Deleting a credential profile removes the encrypted record from Foundry’s local database. If an operator loses both the OS credential-store entry and the configured recovery passphrase, encrypted provider credentials cannot be recovered and must be entered again.
