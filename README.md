# Jules Foundry

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/tRPC-11-blue?logo=trpc" alt="tRPC 11">
  <img src="https://img.shields.io/badge/Drizzle-ORM-brightgreen" alt="Drizzle ORM">
  <img src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS">
</p>

**Jules Foundry** is an enterprise-grade control plane and orchestration platform for autonomous coding agents (Google Jules, Gemini, and GitHub). It converts high-level natural language engineering intent into a governed, dependency-aware task graph (DAG), manages idempotent agent session dispatches, enforces strict path containment policies, and orchestrates an automated **Quality Mesh** for rigorous verification and evidence-backed closeout.

---

## 🌟 Key Features

### 1. 🛡️ Write-Only Credential Vault
- **Zero-Leak Design**: Secrets (Jules API keys, Gemini API keys, GitHub Fine-Grained Personal Access Tokens) are encrypted server-side using AES-256-GCM / SHA-256 derived keys.
- **Masked Previews**: Only masked suffixes (e.g. `...a1b2`), labels, status, and test outputs are returned to the frontend.
- **Provider Connection Testing**: Live connection verification endpoints for Jules (`/v1alpha/sources`), Gemini (`/v1beta/models`), and GitHub (`/user`).

### 2. ⚡ Gemini-Powered DAG Task Compiler
- **Structured Task Generation**: Transforms raw prompt intent into a directed acyclic graph (DAG) of focused tasks using Gemini 2.5 Flash structured output schemas.
- **Deterministic DAG Validation**: Built-in cycle detection, self-dependency prevention, and duplicate title validation before database persistence.
- **Scope Containment**: Every task strictly defines `allowedPaths`, `nonGoals`, `acceptanceCriteria`, and `dependencies`. Tasks omitting explicit allowed paths are automatically quarantined into a `red` risk tier requiring operator scope review.

### 3. 🚦 Bounded Jules Dispatch & Path Reservations
- **Conflict Prevention**: Active tasks lock their `allowedPaths`. Sibling tasks attempting to dispatches with overlapping allowed paths are automatically blocked with explicit reservation conflict messages.
- **Source & Branch Validation**: Pre-flight checks verify that the repository is connected to Jules and that the target branch exists on GitHub before creating a session.
- **Proof-Carrying Prompts**: Automatically constructs versioned, proof-carrying prompts embedding explicit criteria identifiers (`AC-1`, `AC-2`) and reporting protocols for Jules.

### 4. 🎛️ Session Command Deck & Granular Governance
- **State-Aware Control Matrix**: Interactive control plane displaying real-time Jules state, Foundry health (`healthy`, `stale`, `attention`, `terminal`), age, and action availability.
- **Operator Session Controls**: Supports `refresh`, `approve_plan`, `send_message`, `set_local_hold`, `release_local_hold`, `reconcile`, and `request_delete`.
- **Short-Lived Action Leases**: Prevents concurrent operators from executing race-conditioned commands on the same task.
- **Typed Destructive Confirmation**: Destructive provider deletion requires typing the exact session name to confirm execution.

### 5. 🕸️ Quality Mesh & Evidence Verification
- **Quality Contracts & Independent Critic**: Generates bounded delivery contracts with independent AI critique scoring ambiguity (0–100) and recommending operator actions.
- **Three-Lens Verification**: Evaluates terminal tasks across three lenses:
  1. *Deterministic Lens*: Validates test outputs, git diffs, allowed path constraints, and PR status.
  2. *Evidence Lens*: Maps activity artifacts to acceptance criteria (`proven`, `partial`, `unproven`, `contradicted`).
  3. *Adversarial Lens*: Bounded Gemini reviewer searches for omissions, scope creep, and false proof.
- **Failure Taxonomy & Recovery**: Classifies failures into six domains (`contract`, `prompt`, `scope`, `environment`, `implementation`, `provider_uncertainty`) and suggests actionable recovery briefs without blind re-dispatching.
- **Exportable Dossiers**: Generates markdown evidence dossiers for complete audit trails.

---

## 🏗️ System Architecture

```
                               ┌─────────────────────────────────────────┐
                               │            JULES FOUNDRY UI             │
                               │ (React 19 / Tailwind / Wouter / Lucide) │
                               └────────────────────┬────────────────────┘
                                                    │ tRPC (HTTP/Batch)
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           EXPRESS SERVER                                               │
│                                                                                                        │
│  ┌─────────────────────────┐    ┌─────────────────────────┐    ┌────────────────────────────────────┐  │
│  │    Credential Vault     │    │  Foundry Router & App   │    │            Quality Mesh            │  │
│  │ (AES-256 Secret Engine) │    │  (Task DAG & Dispatch)  │    │ (Contracts, Prompts, Verifier)     │  │
│  └────────────┬────────────┘    └────────────┬────────────┘    └────────────────┬───────────────────┘  │
└───────────────┼──────────────────────────────┼──────────────────────────────────┼──────────────────────┘
                │                              │                                  │
                ▼                              ▼                                  ▼
      ┌──────────────────┐           ┌──────────────────┐               ┌──────────────────┐
      │  GitHub REST API │           │  Jules REST API  │               │ Gemini 2.5 Flash │
      │ (Branch & Repos) │           │ (Sessions/Events)│               │ (Compiler/Critique│
      └──────────────────┘           └──────────────────┘               └──────────────────┘
```

---

## 🛠️ Quick Start

### Prerequisites
- **Node.js**: v20 or higher
- **pnpm**: v10 or higher
- **MySQL / PlanetScale / MariaDB**: Compatible database instance

### Environment Setup

Create a `.env` file in the root directory:

```env
DATABASE_URL=mysql://user:password@localhost:3306/jules_foundry
JWT_SECRET=your-32-byte-secure-random-secret-key
NODE_ENV=development
PORT=3000
```

### Installation & Database Migration

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:push

# Verify TypeScript types
pnpm check

# Run Vitest test suite
JWT_SECRET=test-secret-key-123 pnpm test
```

### Development Server

```bash
pnpm dev
```

The application will start at `http://localhost:3000`.

---

## 📂 Project Structure

```
.
├── client/                     # Frontend SPA (React 19, Wouter, Tailwind v4, TanStack Query)
│   ├── src/
│   │   ├── components/         # UI primitives and shared layout widgets
│   │   ├── contexts/           # Theme and state providers
│   │   ├── pages/              # Command Center, Fleet, Initiatives, TaskDetail, Credentials
│   │   └── App.tsx             # Application router and layout wrapper
├── server/                     # Backend API (Express, tRPC v11, Drizzle ORM)
│   ├── _core/                  # Authentication, cookies, environment configuration
│   ├── routers/                # Foundry tRPC procedures (credentials, initiatives, dispatch, quality)
│   ├── services/               # Core services (vault, providers, session-control, quality)
│   └── db.ts                   # Database helper functions and ORM connections
├── drizzle/                    # Database schemas and migrations
│   ├── schema.ts               # MySQL table definitions (tasks, events, quality contracts, etc.)
│   └── migrations/             # SQL migration files
├── docs/                       # Detailed documentation suite
│   ├── ARCHITECTURE.md         # Deep-dive system architecture guide
│   ├── API_AND_SCHEMA.md       # Database schema and tRPC API reference
│   ├── SECURITY_AND_GOVERNANCE.md # Security model, vault design, and path containment
│   └── QUICKSTART_GUIDE.md    # Developer onboarding and setup guide
└── summary.md                  # Comprehensive codebase summary
```

---

## 🧪 Testing

The repository maintains full unit and integration test coverage using Vitest.

```bash
# Run all tests
JWT_SECRET=test-secret-key-123 pnpm test

# Run tests in watch mode
JWT_SECRET=test-secret-key-123 pnpm vitest
```

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
