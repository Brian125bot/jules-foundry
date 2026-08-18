# Run Jules Foundry Locally

Jules Foundry is a **local browser application**. It does not require a native desktop wrapper, a Rust toolchain, a local sidecar binary, a code-signing certificate, or cloud deployment.

## Quick start

Install Node.js 22 and enable the pinned pnpm release if your system does not already provide pnpm 10.

```bash
git clone https://github.com/Brian125bot/jules-foundry.git
cd jules-foundry
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

`pnpm start` builds the browser and server, starts the local process on `127.0.0.1`, and opens a one-time authenticated browser session. All application data is written to the operating-system application-data directory rather than the repository checkout.

## Optional vault fallback

The default vault uses the operating-system credential store. If local secure storage is unavailable, set a strong passphrase only in the shell that launches Foundry.

```bash
export FOUNDRY_VAULT_MODE=passphrase
export FOUNDRY_VAULT_PASSPHRASE="use-a-long-unique-local-passphrase"
pnpm start
```

Do not commit this passphrase, add it to browser storage, or place it in a shared shell profile.

## Development and troubleshooting

Use `pnpm dev` for automatic rebuilds while changing source code. To run the complete reproducible repository gate, use `pnpm release:verify`.

Foundry opens the local browser session itself. On a trusted headless machine, set `FOUNDRY_OPEN_BROWSER=false` and use the one-time launch address only through a trusted local mechanism. Do not expose the loopback service through a tunnel, reverse proxy, or network filesystem.
