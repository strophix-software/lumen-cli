# Contributing to lumen-cli

## Branch workflow (summary)

Full human guide: [`docs/BRANCHING.md`](./docs/BRANCHING.md) · Formal decision: [`docs/adr/0002-branching-strategy.md`](./docs/adr/0002-branching-strategy.md)

```
feat/*  --PR-->  develop  --cut-->  release/1.0.0-alpha.N (bump + tag v*)  --back-merge PR-->  develop
```

- `develop` — **canonical** development branch. All `feat/*`, `fix/*`, `docs/*`, `ci/*` land here. Same model as `create-lumen`.
- `release/<version>` — frozen snapshot of one version (e.g. `release/1.0.0-alpha.1`): bump `package.json` + `CHANGELOG.md`, tag `v<version>`, then back-merge PR to `develop`.
- `main` — stable only (`latest` on npm from `v1.0.0`), plus `hotfix/*` after that.
- `feat/*` / `fix/*` — ephemeral, cut from `develop`, PR to `develop`.

See `docs/BRANCHING.md` for step-by-step commands, cross-repo M1-M5 coordination with `create-lumen`, SemVer rules, and checklists.

## Commit convention

Conventional Commits: `feat:`, `fix:`, `chore(release):`, `docs:`, `ci:`, `test:`, `refactor:`.

## Before opening a PR

```bash
git checkout develop && git pull --rebase origin develop
npm run lint
npm test
```

CI gates: `ci.yml` (lint + test + `npm publish --dry-run`) and `eslint.yml` (SARIF) on pushes to `develop`/`release/**`/`hotfix/**`/`main` and PRs to `develop`/`main`; `publish.yml` publishes on tags `v*` (OIDC trusted publishing + dist-tag from the version suffix).

## Release process (release manager only)

1. Cut `release/1.0.0-alpha.N` from `develop`; `npm version 1.0.0-alpha.N --no-git-tag-version`; move `CHANGELOG.md` `[Unreleased]` to the new version; commit `chore(release): 1.0.0-alpha.N`.
2. Freeze — only critical `fix/* -> release/*`.
3. Tag `v1.0.0-alpha.N` on the release branch → `publish.yml` publishes with `--tag alpha` and creates the GitHub prerelease.
4. PR `release/1.0.0-alpha.N -> develop` titled `chore: back-merge release/1.0.0-alpha.N into develop`.
5. Stable `v1.0.0` (M5): `release/1.0.0` → PR to `main` + tag `v1.0.0` (`latest`), then back-merge to `develop`. Paired with `create-lumen` `v2.0.0`.

## References

- Roadmap & versioning: `ROADMAP.md`, `docs/PLAN.md`, `CHANGELOG.md`
- create-lumen counterpart: `strophix-software/create-lumen` ADR 0002 / BRANCHING.md
