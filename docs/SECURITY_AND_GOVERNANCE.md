# Security and Governance

## Security model

Jules Foundry is a local-first orchestration console for one trusted operating-system user. It binds the service to loopback, opens a one-time browser bootstrap URL, and exchanges that capability for an `HttpOnly`, `SameSite=Strict` local session. It is not a shared-host, multi-tenant, LAN, or reverse-proxy service.

The server rejects non-loopback requests and unexpected host/origin combinations. Browser responses use local-only Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, no-store caching, and cross-origin isolation headers. Do not expose the local port with a tunnel or reverse proxy. [1]

## Credential vault

Provider credentials are write-only. A submitted plaintext secret is encrypted on the local server before persistence and is never returned in list or query responses. The user interface receives only a masked suffix, provider label, status, version, and timestamps. [2]

Current vault ciphertext uses `AES-256-GCM`, a `jf-v2:` prefix, a fresh **12-byte IV**, and a 16-byte authentication tag. The default 32-byte vault key is stored in the current operating-system account’s **OS keychain**. If secure storage is unavailable, the operator can provide a local passphrase; Foundry derives the key with `scrypt` and a locally stored mode-600 salt file. [2]

If an operator loses both the OS credential-store key and the recovery passphrase, encrypted credentials cannot be recovered. The correct response is to re-enter provider credentials; Foundry has no secret-export mechanism.

## Task scope and provider controls

Gemini-generated tasks must contain explicit repository-relative allowed paths. If scope is missing, Foundry assigns a red-risk sentinel and blocks dispatch until an operator reviews the task. Active overlapping paths are reserved to reduce concurrent file collisions. Provider calls originate only from the local server process.

Jules session controls use operator actions, idempotency keys, short-lived control leases, and an audit ledger. Foundry does not silently approve plans, accept evidence, merge code, or redispatch work.

## Destructive actions and evidence

Initiatives with active Jules sessions cannot be deleted. Destructive requests require typed confirmation, record a precondition snapshot, and emit a ledger event. Task evidence, provider activity, and operator actions are stored with correlation and payload-digest metadata to support review without returning credential plaintext.

## Governance boundaries

Read [SECURITY.md](../SECURITY.md) for private vulnerability reporting, [PRIVACY.md](../PRIVACY.md) for data handling, and [RELEASE_SCOPE.md](RELEASE_SCOPE.md) for the current supported audience and platform. Provider credentials, source code, and task content remain the operator’s responsibility; use least-privilege access and follow each provider’s terms.

## References

[1]: file:///home/ubuntu/jules-foundry/server/local-runtime.ts "Loopback bootstrap and session controls"
[2]: file:///home/ubuntu/jules-foundry/server/services/vault.ts "Current v2 vault encryption implementation"
