# Release Scope

## Current release class

**Stable Linux x64 release for experienced single-machine operators.** The supported direct-user target is `linux-x64` only. macOS and Windows are intentionally outside the current product scope.

## Supported operating model

Jules Foundry runs a Node 22 local service bound to loopback and opens a one-time browser bootstrap session. It is not a hosted, multi-user, LAN, or reverse-proxy application.

## Provider policy

Operators add their own Gemini, Google Jules, and GitHub credentials in Credential vault. Use least-privilege credentials, test against disposable resources first, and do not submit content to any provider without appropriate authorization.

## Release approval

A release requires a named maintainer review of the completed local release gate, artifact checksum, SBOM, manifest, release notes, archive inspection, and direct-user smoke result. General availability requires all P0 and P1 evidence in the release implementation guide.
