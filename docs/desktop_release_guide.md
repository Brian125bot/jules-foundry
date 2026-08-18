# Desktop Release Guide

Jules Foundry’s local-user distribution uses a Tauri desktop shell and a packaged local Node service sidecar. The renderer never holds provider credentials: its only connection is the loopback Foundry service, which continues to own the SQLite ledger, credential vault, provider adapters, Quality Mesh, and monitoring policy.

## Build procedure

Install Rust, Cargo, Node 22, and pnpm on the release machine. Run `pnpm install --frozen-lockfile`, then `FOUNDRY_VAULT_MODE=passphrase FOUNDRY_VAULT_PASSPHRASE=<test-value> pnpm release:verify`. The verification gate includes type checking, regression tests, production build, bundle budget, SBOM generation, sidecar preparation, and a clean-data-directory sidecar smoke test. The preparation step packages a target-specific service sidecar; `pnpm desktop:build` creates the desktop installer after the target toolchain is available.

For a release-host verification of the bundled OS-keychain path, run `FOUNDRY_REQUIRE_KEYCHAIN=true pnpm desktop:smoke` after `pnpm desktop:prepare`. This launches only the packaged sidecar and its copied resources in a temporary data directory, exchanges the one-time loopback bootstrap capability, confirms seeded local-operator API data and diagnostics, verifies dashboard-shell delivery, and removes the temporary directory. The standard smoke gate accepts the secure passphrase recovery path where operating-system secure storage is unavailable; the enforced form must report `os_keychain`.

The final acceptance pass must also open the one-time bootstrap URL in a browser context and confirm that the rendered **Command center** identifies **Local operator** and exposes the desktop workspace controls. On the Linux packaging host, this browser-render check completed successfully after the bootstrap exchange, with the command center and local-operator identity visible from the bundled sidecar.

The release workflow requires `TAURI_UPDATE_PUBLIC_KEY`, `TAURI_UPDATE_ENDPOINT`, `TAURI_SIGNING_PRIVATE_KEY`, and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets. The public key and HTTPS update endpoint are injected into `tauri.conf.json` only inside CI; the generated configuration is ignored by Git. Keep release-signing secrets outside the repository, restrict their use to protected release branches, and retain signed artifact checksums plus the generated SBOM with each release.

## Release controls

Release maintainers must verify a clean-machine install, first launch, OS vault initialization or passphrase fallback, credential test, initiative compilation, controlled Jules dispatch, restart recovery, staged restore, update, and uninstall-data-preservation flow on every claimed platform. Do not publish unsigned packages. Keep stable updates opt-in until update and rollback testing is complete.

## Sidecar lifecycle

The desktop shell creates the local service with browser opening disabled and passes packaged migration, static-browser, and native runtime-module resources explicitly. It creates an in-memory one-time bootstrap token, opens the desktop webview at the secured loopback service, and kills the sidecar on application exit. The service itself enforces a data-directory lock and loopback-only session protection, so a second launch cannot operate concurrently on the same SQLite ledger.
