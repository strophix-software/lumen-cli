# Changelog

All notable changes to `lumen-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-alpha.3] — 2026-10-27

### Added

- **Full compatibility with `create-lumen@^2.0.0-beta.5`** (#87):
  - **State management flag (`-s, --state <lib>`)**: Support and forward `-s, --state <zustand|redux|none>` (with `rtk` / `reduxtoolkit` alias) in `lumen create` and `lumen init`.
  - **Fullstack scaffolding flags**: Added and validated `--db, --database <orm>`, `--db-provider <provider>`, `--docker`, `--route-groups`, `--agent-docs`, and `--testing <framework>`.
  - **Store barrels discovery in `sync-barrels`**: Discovers shared stores (`src/shared/stores` or `src/stores` derived from `paths.services`) and feature store modules (`src/features/<feat>/store`), automatically generating export barrels and nesting them in feature root barrels.
  - **Expanded E2E verification matrix**: 5 comprehensive scaffold and integration scenarios covering Next.js App Router fullstack + Prisma, React + Vite SPA, architecture boundaries (preset none), Redux Toolkit store generation & barrel discovery, and preflight guardrails.

### Changed

- **Bump `create-lumen` dependency to `^2.0.0-beta.5`** (#87).
- **Updated documentation and command references**: Added full table of scaffolding options and examples in `README.md`.

## [1.0.0-alpha.2] — 2026-10-27

### Changed

- **Bump `create-lumen` dependency to `^2.0.0-beta.4`** (#85) — incorporates out-of-the-box `prisma generate` postinstall, cleanup of default Next.js `page.module.css`, and canonical placement of `globals.css` in `src/app`.
- **Binaries execution permissions** — ensure `bin/lumen.js` has executable file mode (755).

## [1.0.0-alpha.1] — 2026-10-27

### Added

- **`lumen sync-barrels`** (#21) — auto-maintain intermediate `index.ts` / `index.js` barrels with bottom-up traversal, deterministic sorting, `@barrel-ignore` pragma, `--check` CI gate, and `--dry-run`.
- **`lumen g component`** (#64) — generate modular components with `--feature`, `--client`, `--type <standard|compound|client>`, `--compound`, and `--test`.
- **Route groups support** (#65) — `lumen g page` and `lumen g layout` support Next.js App Router route groups via `--group <name>` (or inline `(group)` paths).
- **Prisma ORM & Supabase DAL support** (#61) — server-side domain service scaffolding via `lumen g service --server`, database connection string audit (Supabase pooler port 6543 vs direct 5432) in `lumen doctor`, and `lumen db` commands (`push`, `migrate`, `seed`, `studio`, `generate`).
- **Modern Biome v2 & `--formatter none`** (#67) — unified linting and formatting support without separate Prettier dependency.
- **UI Registry & Theme tokens** (#10) — `@lumen` component registry with `@shadcn` fallback, peer dependency resolution, and Tailwind v4 theme presets (`lumen g ui theme-<name>`).
- **`lumen config`** (#4, #36) — `config`, `config get <path>`, `config validate`; `ConfigError` extends `LumenError`.
- **`lumen create` / `lumen init`** (#5, #37) — delegate to `create-lumen@^2.0.0-beta.3` with inherited stdio and signal forwarding.
- **Tooling flags** (#6, #40) — `--linter/--formatter/--language/--styling/--ui` validated against manifest schema enums.
- **Generator core** (#7, #38) — template engine, name variants, manifest-path targets, `--dry-run`/`--force`, containment checks.
- **Generators** — `g feature` (#8), `g page` (#11), `g service` (#12), `g store` (#13), `g form` (#14).
- **Command framework** (#2, #34) — global flags `-c/--cwd`, `-v/--verbose`, `-j/--json`, `--no-color`; `generate`/`g` command; unknown-command suggestions; `LumenError` and documented exit codes (0/1/2/70).
- **Config reader** (#3, #28, #29, #33) — finds `lumen.config.json` upward, rejects v1 manifests with a migration pointer, normalises manifest v2.1 (`preset`, `validation`, `harness`, `agentDocs`), resolves paths through `create-lumen`; drift gate runs shared fixtures.

### Changed

- **Bump `create-lumen` dependency to `^2.0.0-beta.3`** (#70, #71).
- **Support canonical `paths.pages` (`src/app` / `src/pages`)** (#69).
- **Purge legacy `hybrid` architecture** (#62).
- **Deprecate `.lumen/` in favor of root `AGENTS.md` and `lumen.config.json`** (#63).
- **Docs: comprehensive README and command reference** (#22) — complete command and generator reference, global flags, `lm` alias, and author credit to Moisés Cantillo (@moicanbas) for `documentador`.
- **Docs: branch workflow aligned with `create-lumen`** — `develop` canonical, `release/<version>` freeze + tag, back-merge PR to `develop`; prereleases are numbered (`1.0.0-alpha.1`); ROADMAP/PLAN/BRANCHING synced with `create-lumen@2.0.0-alpha.2` (manifest v2.1).

## [1.0.0-alpha.0] — 2026-09-19

### Added

- **Bootstrap** (#1) — ESM package, `lumen` / `lm` bins, commander with `-h/--help` and `-V/--version`, vitest + ESLint, CI (`ci.yml`, `eslint.yml`) and OIDC publish pipeline (`publish.yml`).
