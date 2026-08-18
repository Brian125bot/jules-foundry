# Jules Foundry Developer Quickstart Guide

Welcome to **Jules Foundry**! This guide walks you through setting up your local development environment, configuring provider credentials, running database migrations, executing tests, and dispatching your first autonomous agent mission.

---

## 📋 Prerequisites

Before starting, ensure you have installed:
- **Node.js**: v20.0.0 or higher
- **pnpm**: v10.0.0 or higher
- **MySQL / PlanetScale / MariaDB**: MySQL-compatible database instance
- **Git**: For source version control

---

## 🚀 Environment Setup

### 1. Clone Repository & Install Dependencies

```bash
# Clone repository
git clone https://github.com/your-org/jules-foundry.git
cd jules-foundry

# Install pnpm dependencies
pnpm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Connection String
DATABASE_URL=mysql://root:password@127.0.0.1:3306/jules_foundry

# JWT Secret Key for Encryption Vault (Must be a strong, secret string)
JWT_SECRET=super-secret-vault-key-change-me-in-production-32bytes

# Environment & Server Config
NODE_ENV=development
PORT=3000
```

---

## 🗄️ Database Setup & Migrations

Jules Foundry uses Drizzle ORM to manage database migrations.

```bash
# Generate and apply migrations to your database instance
pnpm db:push
```

---

## 🧪 Verifying Environment & Running Tests

Run the TypeScript type checker and full Vitest suite to confirm setup integrity:

```bash
# Run TypeScript compilation check
pnpm check

# Run Vitest test suite
JWT_SECRET=test-secret-key-123 pnpm test
```

Expected output:
```
✓ server/quality.test.ts (9 tests)
✓ server/source-discovery.test.ts (3 tests)
✓ server/credential.persistence.test.ts (2 tests)
✓ server/initiative.delete.test.ts (2 tests)
✓ client/src/desktop-control-smoke.test.ts (5 tests)
✓ server/providers.test.ts (3 tests)
✓ server/session-control.test.ts (4 tests)
✓ server/foundry.test.ts (8 tests)
✓ server/auth.logout.test.ts (1 test)

Test Files  9 passed (9)
     Tests  37 passed (37)
```

---

## 💻 Running the Development Application

Start the development server with hot-module reloading:

```bash
pnpm dev
```

Open your browser to `http://localhost:3000`.

---

## ⚙️ First-Time Application Onboarding

### Step 1: Configure Credentials in the Vault
Navigate to **Credentials** (`/credentials`) in the top navigation bar:
1. **Jules API Key**: Add your Google Jules API key (`/v1alpha/sessions`).
2. **Gemini API Key**: Add your Gemini 2.5 API key (`/v1beta/models`).
3. **GitHub Token**: Add a fine-grained Personal Access Token with repository read/write permissions.

Click **Test Connection** on each provider card to verify live connections.

### Step 2: Create Your First Initiative
Navigate to **Initiatives** (`/initiatives`):
1. Click **New Initiative**.
2. Enter a title, natural language prompt, repository owner/name (`owner/repo`), and target branch (`main`).
3. Click **Compile Task DAG with Gemini**. Gemini will parse the prompt into an ordered, dependency-checked task graph.

### Step 3: Dispatch & Govern a Mission
Navigate to the task details page (`/tasks/:id`):
1. Review the generated acceptance criteria, allowed paths, and risk tier.
2. Click **Dispatch to Jules**.
3. Monitor real-time activities, review plans on the **Session Command Deck**, approve execution, or message Jules as work progresses.
4. Run Quality Mesh verification once the session completes.
