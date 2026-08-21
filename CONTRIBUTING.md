# Contributing

Use Node.js 22 and the pinned pnpm version. Before proposing a change, run:

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

Do not commit provider credentials, one-time bootstrap URLs, local data directories, backups, generated direct-user archives, or screenshots containing sensitive information. Use [private vulnerability reporting](SECURITY.md) rather than public issues for security concerns.

Changes that alter local data, credential encryption, provider permissions, release staging, or public documentation must include tests and updated operator guidance.
