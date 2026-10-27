# lumen-cli

> npm package: **`@lumen-sh/cli`** — binaries: **`lumen`** and **`lm`**.

The day-to-day command-line interface for Lumen projects: scaffolding, file and component generators, architectural validation, database maintenance, barrel synchronization, and agent-aligned context tracking.

---

## Table of Contents

- [Installation](#installation)
- [Command Aliases (`lm`)](#command-aliases-lm)
- [Quickstart](#quickstart)
- [Manifest v2 Standard (Hard Requirement)](#manifest-v2-standard-hard-requirement)
- [Global Options & Flags](#global-options--flags)
- [Exit Codes](#exit-codes)
- [Command Reference](#command-reference)
  - [lumen create / lm create](#lumen-create-name)
  - [lumen init / lm init](#lumen-init)
  - [lumen config / lm config](#lumen-config)
  - [lumen doctor / lm doctor](#lumen-doctor)
  - [lumen db / lm db](#lumen-db-subcommand)
  - [lumen sync-barrels / lm sb](#lumen-sync-barrels-dir)
  - [Generators (`lumen g` / `lm g`)](#generators-lumen-generate--lumen-g)
    - [feature](#lumen-generate-feature-name-alias-lumen-g-feature)
    - [component](#lumen-generate-component-name-alias-lumen-g-component-lumen-g-c)
    - [page](#lumen-generate-page-name-alias-lumen-g-page-lumen-g-p)
    - [layout](#lumen-generate-layout-name-alias-lumen-g-layout-lumen-g-l)
    - [service](#lumen-generate-service-name-alias-lumen-g-service-lumen-g-s)
    - [form](#lumen-generate-form-name-alias-lumen-g-form)
    - [store](#lumen-generate-store-name-alias-lumen-g-store)
    - [route](#lumen-generate-route-endpoint-alias-lumen-g-route-lumen-g-api)
    - [ui & theme tokens](#lumen-generate-ui-name-alias-lumen-g-ui)
- [Agent Context (`AGENTS.md`)](#agent-context-agentsmd)
- [Troubleshooting](#troubleshooting)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Installation

Install globally via npm or execute directly with `npx`:

```bash
# Global installation
npm install -g @lumen-sh/cli

# Verify installation
lumen --version
lm --version
```

Or run via npx without global install:

```bash
npx @lumen-sh/cli --help
```

---

## Command Aliases (`lm`)

Every invocation of `lumen` can be shortened to `lm`:

```bash
# Equivalent commands
lumen create my-app       # or: lm create my-app
lumen g feature auth      # or: lm g feature auth
lumen doctor              # or: lm doctor
lumen sync-barrels        # or: lm sb
lumen db push             # or: lm db push
```

Subcommands also provide ergonomic short aliases:

| Command | Short Alias |
|---|---|
| `lumen generate` | `lumen g` / `lm g` |
| `lumen generate component` | `lumen g c` / `lm g c` |
| `lumen generate page` | `lumen g p` / `lm g p` |
| `lumen generate layout` | `lumen g l` / `lm g l` |
| `lumen generate service` | `lumen g s` / `lm g s` |
| `lumen generate route` | `lumen g api` / `lm g api` |
| `lumen doctor` | `lm doc` |
| `lumen sync-barrels` | `lumen sb` / `lm sb` |

---

## Quickstart

Follow this typical workflow to scaffold a fullstack project, generate features, maintain barrels, and audit project health:

```bash
# 1. Create a new fullstack project with recommended defaults
lm create my-store -y --template next-app-ts --arch feature-based

# 2. Enter project directory
cd my-store

# 3. Scaffold an authentication domain feature
lm g feature auth

# 4. Generate a client component with interactive state
lm g c LoginForm --feature auth --client --test

# 5. Scaffold a server-side Prisma Data Access Layer (DAL) service
lm g s user --server --feature auth

# 6. Scaffold a route page inside a Next.js App Router route group (auth)
lm g page login --group auth

# 7. Add UI blocks from Lumen Registry (or Shadcn fallback)
lm g ui button
lm g ui card

# 8. Synchronize all intermediate export barrels
lm sb

# 9. Audit project health, configuration, and environment variables
lm doctor
```

---

## Manifest v2 Standard (Hard Requirement)

`lumen-cli` requires projects to adhere strictly to the **Lumen Manifest v2 specification** (`manifestVersion: 2`), located at `lumen.config.json` in the project root:

- **Single Source of Truth**: All generator destination paths (`paths.components`, `paths.features`, `paths.pages`, `paths.services`, `paths.ui`), tooling settings, and architecture rules are read directly from `lumen.config.json`.
- **Pages Directory Alignment**: `paths.pages` canonically points to `src/app` for Next.js App Router, or `src/pages` for Next.js Pages Router / React Router.
- **Architectural Presets**: Supported presets are `feature-based`, `type-based`, and `none`. The legacy `hybrid` preset has been removed.
- **No Legacy `.lumen/` Directory**: Agent instructions and context are maintained directly in the root [`AGENTS.md`](./AGENTS.md) and `lumen.config.json`. Legacy `.lumen/` configurations are deprecated and ignored.
- **v1 Manifest Rejection**: Any manifest declaring `manifestVersion: 1` is rejected with an actionable migration error (exit code `2`).

---

## Global Options & Flags

The following flags apply to all `lumen` / `lm` commands:

| Short Flag | Long Flag | Description |
|---|---|---|
| `-c <dir>` | `--cwd <dir>` | Specify target project working directory (default: `process.cwd()`) |
| `-v` | `--verbose` | Output verbose logs and stack traces upon errors |
| `-j` | `--json` | Return structured JSON output for scriptable automation |
| | `--no-color` | Disable ANSI terminal colors |
| `-V` | `--version` | Display the installed CLI version |
| `-h` | `--help` | Display command help and usage examples |

---

## Exit Codes

`lumen-cli` emits deterministic, POSIX-aligned process exit codes:

| Code | Name | Meaning |
|---|---|---|
| `0` | `OK` | Command completed successfully |
| `1` | `USER` | User error (invalid arguments, invalid flags, missing files, or failed `--check`) |
| `2` | `CONFIG` | Configuration error (missing, unreadable, or invalid `lumen.config.json`) |
| `70` | `INTERNAL` | Internal runtime or unhandled exception |

---

## Command Reference

### `lumen create [name]`

Alias: `lm create [name]`

Create a new Lumen project by delegating scaffolding to `create-lumen`:

```bash
# Interactive setup
lm create my-app

# Fast unattended setup with recommended defaults
lm create my-app -y

# Specify template and architecture preset
lm create my-app -t next-app-ts -a feature-based

# Custom linting and formatting tooling (including Biome v2 or none)
lm create my-app -y --linter biome --formatter none
```

**Options:**

| Short | Long | Description |
|---|---|---|
| `-y` | `--yes` | Quick setup with recommended defaults (skips prompts) |
| `-m <file>` | `--manifest <file>` | Path to a custom manifest JSON or inline JSON string |
| `-t <preset>`| `--template <preset>`| Template preset (`next-app-ts`, `next-app-js`, `react-ts`, `react-js`, etc.) |
| `-f <name>` | `--framework <name>` | Target framework (`next`, `react`) |
| `-a <arch>` | `-a, --arch <arch>` / `--architecture` | Architecture preset (`feature-based`, `type-based`, `none`) |
| | `--linter <tool>` | Linting tool (`eslint`, `oxlint`, `biome`, `none`) |
| | `--formatter <tool>`| Formatting tool (`prettier`, `oxfmt`, `none`) |
| | `--language <lang>` | Project language (`ts`, `js`) |
| | `--styling <engine>` | Styling engine (`tailwind`, `none`) |
| | `--ui <kit>` | UI component library (`shadcn`, `none`) |

---

### `lumen init`

Alias: `lm init`

Initialize a Lumen project inside the current directory:

```bash
lm init
lm init -y
lm init -y --linter biome --formatter none
```

Supports identical options to `lumen create`.

---

### `lumen config`

Alias: `lm config`

Inspect, query, and validate your project's `lumen.config.json` manifest:

```bash
# Print human-readable summary of resolved configuration and paths
lm config

# Output full resolved manifest and path mapping as JSON
lm config -j

# Retrieve a specific dotted configuration path
lm config get architecture.preset
lm config get paths.services
lm config get tooling.linter

# Validate manifest against schema and compatibility rules (exits 0 if valid, 2 if invalid)
lm config validate
```

---

### `lumen doctor`

Alias: `lm doctor`, `lm doc`

Perform comprehensive diagnostics and health checks on your project:

- **Manifest Integrity**: Validates `lumen.config.json` schema and path existence.
- **Tooling Verification**: Checks status of Biome v2, ESLint, Oxlint, Prettier, TypeScript, and Tailwind CSS.
- **Database & ORM Audit**: When Prisma ORM is configured, verifies `prisma/schema.prisma` existence and validates Supabase PostgreSQL connection strings (warning if transaction pooler port `6543` is missing for serverless environments, or direct port `5432` is misused).
- **Agent Context Verification**: Checks that root `AGENTS.md` is present and synchronized.

```bash
# Run health check
lm doctor

# Output diagnostic report as JSON
lm doctor -j

# Automatically fix repairable directory or barrel warnings
lm doctor --fix
```

---

### `lumen db <subcommand>`

Alias: `lm db <subcommand>`

Safely execute Prisma ORM database workflows with automatic preflight validation (ensuring Prisma is configured, `schema.prisma` exists, and required `DATABASE_URL` / `DIRECT_URL` environment variables are loaded):

```bash
# Push schema changes directly to development database
lm db push

# Create and apply database migrations
lm db migrate
lm db migrate --name add_users

# Run project database seed script (e.g. prisma/seed.ts)
lm db seed

# Open Prisma Studio web UI
lm db studio

# Re-generate Prisma Client types
lm db generate
```

---

### `lumen sync-barrels [dir]`

Alias: `lumen sb [dir]`, `lm sb [dir]`

Automatically discover, generate, and maintain intermediate `index.ts` / `index.js` export barrels:

- **Bottom-Up Generation**: Automatically processes child subdirectories first so parent directories export updated child modules in a single pass.
- **Deterministic Sorting**: Exports are sorted alphabetically for 100% clean, reproducible git diffs.
- **Intelligent Filtering**: Automatically skips private files (`_private.ts`), hidden files (`.hidden`), tests (`*.test.*`, `*.spec.*`), mocks (`*.mock.*`), `.d.ts` declaration files, and non-barrel subdirectories.
- **Ignored Files Pragma**: Any file containing `// @barrel-ignore` in its header is automatically excluded.

```bash
# Synchronize all intermediate barrels across components, ui, services, hooks, and features
lm sb

# Synchronize a specific directory only
lm sb src/components

# CI Verification Mode: fails with exit code 1 if any barrel is missing or stale
lm sb --check

# Dry-run: preview planned barrel exports without writing to disk
lm sb --dry-run

# Output results as JSON
lm sb -j
```

---

## Generators (`lumen generate` / `lumen g`)

All code generators resolve destination directories dynamically from `manifest.paths` and preserve project conventions.

### `lumen generate feature <name>` (alias: `lumen g feature`)

Scaffolds a domain feature directory (`paths.features/<name>`) containing `components/`, `hooks/`, `services/`, `types/`, and an index barrel export:

```bash
lm g feature billing
lm g feature auth --with-tests
lm g feature cart --dry-run
```

**Options:**
- `--with-tests` — Scaffold starter unit tests using Vitest / Jest.
- `--dry-run` — Preview file creations without modifying disk.
- `-f, --force` — Overwrite existing feature files.

---

### `lumen generate component <name>` (alias: `lumen g component`, `lumen g c`)

Generates a modular React / Next.js component:

```bash
# Generate shared component under paths.components
lm g c Button

# Generate component scoped to a specific feature
lm g c UserAvatar --feature user

# Generate Next.js Client Component (prepends 'use client')
lm g c ThemeToggle --client

# Generate compound component with Root and Item subcomponents
lm g c Accordion --compound

# Generate companion unit test file
lm g c Dialog --test
```

**Options:**
- `--feature <name>` — Place component in `paths.features/<feature>/components`.
- `--client` — Add `'use client'` directive to top of component file.
- `--type <standard|compound|client>` — Component template type (defaults to `standard` or `client` if `--client` is set).
- `--compound` — Generate compound component pattern.
- `--test` — Generate companion `<Name>.test.tsx` test file.
- `--dry-run` — Preview actions without writing to disk.
- `-f, --force` — Overwrite existing component files.

---

### `lumen generate page <name>` (alias: `lumen g page`, `lumen g p`)

Scaffold a route page component:

- **Next.js App Router**: Generates `<paths.pages>/[group/]<name>/page.tsx`.
- **Next.js Pages Router**: Generates `<paths.pages>/[group/]<name>.tsx`.
- **React + Vite**: Generates `<Name>Page.tsx` under `paths.pages` with optional `--register` router integration.

```bash
# Next.js App Router root-level page (src/app/dashboard/page.tsx)
lm g page dashboard

# App Router route group page (src/app/(auth)/login/page.tsx)
lm g page login --group auth
# or pass group inline:
lm g page "(auth)/login"

# Client component page
lm g page checkout --client
```

**Options:**
- `--group <name>` — Place page inside Next.js route group `(<name>)`.
- `--client` — Add `'use client'` directive.
- `--register` — Auto-register page into React Router file if `// lumen:routes` comment is found.
- `--dry-run` — Preview without writing to disk.
- `-f, --force` — Overwrite existing page.

---

### `lumen generate layout <name>` (alias: `lumen g layout`, `lumen g l`)

Scaffold a layout component:

```bash
# Next.js App Router layout inside route group (src/app/(dashboard)/layout.tsx)
lm g layout dashboard --group dashboard

# Next.js App Router root layout (src/app/layout.tsx)
lm g layout root

# Client component layout
lm g layout settings --client
```

**Options:**
- `--group <name>` — Target route group `(<name>)`.
- `--client` — Mark layout with `'use client'`.
- `--dry-run` — Preview without writing to disk.
- `-f, --force` — Overwrite existing files.

---

### `lumen generate service <name>` (alias: `lumen g service`, `lumen g s`)

Generates a typed CRUD service:

```bash
# Client HTTP service (using Axios or Fetch)
lm g service product
lm g service order --feature checkout

# Server-side domain service / Data Access Layer (DAL) connecting to Prisma ORM (@/lib/db)
lm g service user --server
lm g service invoice --server --feature billing

# Include pagination helper types and mock fixtures
lm g service customer --paginated --with-mocks
```

**Options:**
- `--server` — Scaffolds server Data Access Layer (DAL) service connecting directly to Prisma via `@/lib/db`.
- `--client` — Explicitly scaffolds a client-side HTTP service.
- `--feature <name>` — Places service inside `paths.features/<feature>/services`.
- `--paginated` — Emits `PageResult<T>` and pagination parameters.
- `--with-mocks` — Generates fixture `<name>.mocks.ts`.
- `--dry-run` — Preview generation plan.
- `-f, --force` — Overwrite existing service files.

---

### `lumen generate form <name>` (alias: `lumen g form`)

Generates a React Hook Form component and matching Zod validation schema:

```bash
lm g form register --feature auth
lm g form contact-us --service message
```

**Options:**
- `--feature <name>` — Scopes form under `paths.features/<feature>/components`.
- `--service <name>` — Automatically wires form `onSubmit` handler to imported service.
- `--dry-run` — Preview file creations.
- `-f, --force` — Overwrite existing files.

---

### `lumen generate store <name>` (alias: `lumen g store`)

Generates state management stores matching detected packages (`zustand`, `@reduxjs/toolkit`, or React Context):

```bash
# Shared Zustand store with persistence middleware
lm g store settings --persist

# Feature-scoped store (paths.features/cart/store)
lm g store checkout --feature cart
```

**Options:**
- `--feature <name>` — Generate within a feature directory.
- `--persist` — Include `zustand/middleware` persist configuration.
- `--dry-run` — Preview actions.
- `-f, --force` — Overwrite existing files.

---

### `lumen generate route <endpoint>` (alias: `lumen g route`, `lumen g api`)

Generates a Next.js App Router API Route Handler (`src/app/api/<endpoint>/route.ts`):

```bash
lm g api users
lm g api orders/[id] --methods "GET,POST,DELETE"
lm g api webhooks/stripe --methods POST --auth
```

**Options:**
- `-m, --methods <verbs>` — Comma-separated HTTP methods (default: `GET,POST`).
- `--auth` — Injects authorization header / bearer token validation block.
- `--dry-run` — Preview file creation.
- `-f, --force` — Overwrite existing route handler.

---

### `lumen generate ui [name]` (alias: `lumen g ui`)

Downloads and configures UI components and blocks from the **Lumen Registry** (`@lumen`) or falls back to Shadcn UI (`@shadcn`), written into `paths.ui`:

```bash
# List available components and themes
lm g ui --list

# Add components
lm g ui button
lm g ui dialog
lm g ui data-table

# Apply Tailwind v4 preset theme tokens to themes.css
lm g ui theme-ocean-breeze
lm g ui theme-neon-noir
```

---

## Agent Context (`AGENTS.md`)

Lumen projects leverage a root [`AGENTS.md`](./AGENTS.md) file as the single source of truth for AI agents (OpenAI, Anthropic, Cursor, Copilot, Antigravity, Orca):

- Whenever generators create or remove features, UI blocks, or services, the manifest and agent context files remain fully synchronized.
- Run `lm doctor` anytime to verify that agent instructions, architecture presets, and project directories are 100% aligned.

---

## Troubleshooting

### 1. `ConfigError: Configuration file not found`
- **Cause**: No `lumen.config.json` was found in the current directory or parent tree.
- **Resolution**: Ensure you are in a Lumen project root, or initialize one using `lm init` or `lm create <name>`.

### 2. `ConfigError: Invalid manifestVersion (expected 2)`
- **Cause**: The project uses an outdated `v1` manifest or legacy `.lumen/` structure.
- **Resolution**: Update `lumen.config.json` to include `"manifestVersion": 2` and align path keys (`paths.components`, `paths.pages`, `paths.services`, etc.).

### 3. `LumenError: Database commands require database.orm to be configured as 'prisma'`
- **Cause**: `lm db <subcommand>` or `lm g service --server` was run in a project without Prisma ORM enabled in `lumen.config.json`.
- **Resolution**: Configure `"database": { "orm": "prisma", "provider": "postgresql" }` in your `lumen.config.json` and initialize Prisma (`npx prisma init`).

### 4. `Supabase Pooler Port Warning (6543 vs 5432)`
- **Cause**: `lm doctor` detected a Supabase connection string using port `5432` instead of port `6543` in serverless environments.
- **Resolution**: In serverless runtimes (such as Next.js or Vercel), set `DATABASE_URL` to point to Supabase's transaction pooler on port `6543` with `?pgbouncer=true`, and assign `DIRECT_URL` to direct port `5432` for migrations.

### 5. Missing Python / Documentation Engine Dependencies
- **Cause**: Invoking external doc-generation pipelines without local Python runtime.
- **Resolution**: Ensure Python 3.10+ is installed and configured in your `PATH` if executing extended AI documentation scripts.

---

## Acknowledgements

- **`documentador`**: Special thanks to **Moisés Cantillo** ([@moicanbas](https://github.com/moicanbas)) for creating `documentador`, which served as the conceptual and architectural foundation for Lumen's documentation and analysis engine.
- **Shadcn UI**: Credit to [shadcn/ui](https://ui.shadcn.com) for pioneering registry-based component distribution.

---

## License

[GNU General Public License v3.0 (GPL-3.0)](./LICENSE)
