# Roadmap

`lumen-cli` is the day-to-day CLI for Lumen projects. Target:
**`v1.0.0`**. It speaks the `create-lumen` **v2** manifest only — there is
no compatibility with `create-lumen` 1.x.

v1 ships as **5 functional milestones**. Each one closes with an
*observable result*; you never wait for a 90%-assembled CLI to see
something working. They are GitHub milestones on this repo and are
grouped in the *lumen-cli Planning Tool* Project (view **Milestones**).

Visual versions (milestone flow, dependency graph, parallel waves, docs
pipeline) live in [`docs/PLAN.md`](./docs/PLAN.md).

---

## 🧱 M1 · `v1.0.0-alpha.1` — Core: CLI + config + create/init

> **DoD:** `lumen` installs (ESM/bin), has a command framework with
> help/version, reads `lumen.config.json` v2/v2.1 (Zod via `create-lumen`, rejects v1),
> `lumen config` works, and `lumen create` / `lumen init` delegates to
> `create-lumen@^2`. Result: `npx @lumen-sh/cli create my-app` scaffolds a
> project.

- [x] #1 Bootstrap lumen-cli package (ESM, bin, CI, publish)
- [x] #2 Command framework + per-command help/version
- [x] #3 Config reader: Zod schema v2 + strict v1 rejection
- [x] #4 `lumen config` command
- [x] #5 `lumen create` / `lumen init` delegate to `create-lumen@^2`
- [x] #6 Forward tooling flags to the scaffolder

## 🏗️ M2 · `v1.0.0-alpha.2` — Generators

> **DoD:** `lumen g feature|page|service|store|form <name>` writes valid
> files into a project that has a v2 manifest.

- [x] #7 Generator core: template engine + manifest path mapping
- [x] #8 `lumen g feature <name>`: domain module + barrel
- [x] #11 `lumen g page <name>`: route scaffold (Vite + Next.js)
- [x] #12 `lumen g service <name>`: typed CRUD service client
- [x] #13 `lumen g store <name>`: Zustand/Context scaffold
- [x] #14 `lumen g form <name>`: React Hook Form + Zod scaffold

## 🎨 M3 · `v1.0.0-beta.1` — UI registry

> **DoD:** `lumen g ui <name>` resolves from the Lumen Registry with a
> shadcn fallback, and `lumen g ui theme-<name>` applies preset tokens.

- [ ] #9 `lumen g ui <name>`: Lumen Registry + Shadcn fallback resolver
- [ ] #10 `lumen g ui theme-<name>`: preset theme tokens

## 📚 M4 · `v1.0.0-beta.2` — Docs engine

> **DoD:** docs generation works end-to-end (ported `documentador` +
> Python bridge + Gemini): API-key management, TSDoc/JSDoc injection,
> single-language wiki, and `--readme` update.

- [ ] #24 Port the `documentador` analysis base (credit: Moisés Cantillo)
- [ ] #16 Python bridge (`doc_engine.py`) + Gemini SDK
- [ ] #15 API key management (`--set-key` / `--rm-key`)
- [ ] #17 TSDoc/JSDoc injection
- [ ] #18 wiki generation (single language, chosen at setup)
- [ ] #19 `--readme` update of the main README.md
- [ ] #25 Co-located documentation (docs beside the source)

## 🩺 M5 · `v1.0.0` — Doctor, barrels & docs

> **DoD:** `lumen doctor` (AST) and `lumen sync-barrels`, plus README and
> the command reference. `v1.0.0` is usable and documented.

- [ ] #20 `lumen doctor`: import/architecture validation (AST)
- [ ] #21 `lumen sync-barrels`: auto-maintain intermediate `index.ts`
- [ ] #22 Docs: README + command reference

> `[~]` = partially landed (bootstrap in `develop`, rest pending). Tracker: **#23** 🧭 Backlog v1.0.0 (umbrella — no milestone).

---

## 📡 create-lumen status (2026-10-16)

| create-lumen | Date | What it gives lumen-cli |
|--------------|------|-------------------------|
| `v2.0.0-alpha.0` | 2026-09-20 | Manifest v2, shared contract (cl#9), Zod validator + strict v1 rejection (cl#14), path mapping (cl#15), shared fixtures (cl#28), `--yes/--manifest/--template` (cl#29) → **unblocks lc#3, lc#5** |
| `v2.0.0-alpha.1` | 2026-10-02 | Manifest **v2.1**: `architecture.preset` + `validation`, `harness.commands` (cl#52), `.lumen/` agent context (cl#54), drift gate (cl#55) |
| `v2.0.0-alpha.2` | 2026-10-06 | Capabilities engine, fragment composition, `none`/`hybrid` architectures (cl#34), shadcn/ui (cl#33 → **unblocks lc#9**), Bootstrap dropped (cl#51) |
| `v2.0.0-beta.1` | 2026-10-26 | Full Next.js support (App Router, Pages Router, presets `next-ts`/`next-js`/`next-pages-ts`/`next-pages-js`), `strophix-software` org transfer → **unblocks lc#32** |

Landed upstream: Next.js (cl#8, #18–#22, beta.1) — unblocks the Next.js variants of lc#11/lc#14 (tracked in lc#32).

---

## 🔗 Dependency matrix

References use `repo#issue` — e.g. `lumen-cli#3`, `create-lumen#13`.
A bare `#N` means the same repo as the row. "Enables" lists the issues
that cannot start until the row lands.

| Issue | Depends on | Enables |
|-------|------------|---------|
| lumen-cli#1  | — | lumen-cli#2, lumen-cli#3 |
| lumen-cli#2  | lumen-cli#1 | lumen-cli#4, lumen-cli#5 |
| lumen-cli#3  | lumen-cli#1, create-lumen#9, create-lumen#13 | lumen-cli#4, lumen-cli#5, lumen-cli#7, lumen-cli#20 |
| lumen-cli#4  | lumen-cli#2, lumen-cli#3 | — |
| lumen-cli#5  | lumen-cli#2, lumen-cli#3, cl M1 | lumen-cli#6 |
| lumen-cli#6  | lumen-cli#5 | — |
| lumen-cli#7  | lumen-cli#3 | lumen-cli#8, #11–#14, #17, #20, #21 |
| lumen-cli#8  | lumen-cli#7 | — |
| lumen-cli#9  | lumen-cli#7, create-lumen#33 | lumen-cli#10 |
| lumen-cli#10 | lumen-cli#9 | — |
| lumen-cli#11 | lumen-cli#7 | — |
| lumen-cli#12 | lumen-cli#7 | — |
| lumen-cli#13 | lumen-cli#7 | — |
| lumen-cli#14 | lumen-cli#7 | — |
| lumen-cli#24 | — (external `documentador`) | lumen-cli#16 |
| lumen-cli#16 | lumen-cli#24 | lumen-cli#15, #17, #18, #19, #25 |
| lumen-cli#15 | lumen-cli#16 | — |
| lumen-cli#17 | lumen-cli#16, lumen-cli#7 | — |
| lumen-cli#18 | lumen-cli#16 | — |
| lumen-cli#19 | lumen-cli#16 | — |
| lumen-cli#25 | lumen-cli#16 | — |
| lumen-cli#20 | lumen-cli#3, lumen-cli#7 | — |
| lumen-cli#21 | lumen-cli#7 | — |
| lumen-cli#22 | lumen-cli#1–#21 | `v1.0.0` ⏳ Blocked |
| lumen-cli#23 | (backlog) | (backlog) | ⏳ Icebox — no milestone |

Cross-repo: **lumen-cli#3** needs `create-lumen#9` + `create-lumen#13`; **lumen-cli#5** needs
`create-lumen` M1; **lumen-cli#9** needs `create-lumen#33`.

---

## 🧵 Parallel-work matrix

| Lane | Workstream | Issues | Starts after | Parallel with |
|------|------------|--------|--------------|---------------|
| C | lumen-cli skeleton | lumen-cli#1, lumen-cli#2 | now | A, B, D, G |
| D | docs-engine base (port `documentador`) | lumen-cli#24, lumen-cli#16 | now | A, B, C, G |
| H | generators | lumen-cli#7, lumen-cli#8, #11–#14 | after C + `create-lumen#9` | F, I, J, K |
| I | UI registry | lumen-cli#9, lumen-cli#10 | after H + `create-lumen#33` | F, J, K |
| J | docs engine features | lumen-cli#15, #17, #18, #19, #25 | after D | F, H, K |
| K | doctor / barrels | lumen-cli#20, lumen-cli#21 | after H | F, J |
| L | release & docs | lumen-cli#22 | at close | — |

Full cross-project view (lanes A–L, 4 devs) is in
[`docs/PLAN.md`](./docs/PLAN.md).
