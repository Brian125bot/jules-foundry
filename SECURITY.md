# Security Policy

## Supported release posture

Jules Foundry is a single-operator, local browser application. A release is supported only when it is published with a matching checksum, SBOM, release manifest, and release notes. Technical-preview releases may support only the platforms named in their release notes.

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/Brian125bot/jules-foundry/security/advisories/new). Do not open a public issue for a suspected vulnerability.

Do not include provider credentials, API keys, a local SQLite database, backups, browser cookies, one-time bootstrap URLs, or unredacted request/response logs in a report. Provide a minimal reproduction, affected version or commit, operating system, Node version, and the observed versus expected behavior.

## Scope and boundaries

The project protects a loopback-only local service, a local SQLite ledger, local artifact/backups, and the encrypted credential vault. It is not designed to be exposed through a tunnel, reverse proxy, shared browser profile, network filesystem, or multi-user host. Gemini, Google Jules, and GitHub remain external services with their own security and data-handling obligations.

## Coordinated disclosure

Maintainers will assess reports privately, request only redacted follow-up information, and publish a remediation note when a fix is released. This policy does not promise a response-time SLA, a bug bounty, or a third-party security certification.
