# Maintenance Notes: Dependency & Tooling Drift

Notes on the current state for a few open maintenance chores, so whoever picks up the
code change doesn't have to re-derive this context. These are notes only — none of the
three items below have been implemented here.

## zod minor bump (issue #1194)

- Currently pinned in [package.json](../package.json) at `"zod": "^3.24.1"`.
- The caret range already allows minor/patch updates on `pnpm install` — the
  `package-lock.json` / `pnpm-lock.yaml` entry is what's actually behind, not the
  `package.json` range itself. Bumping means running the install and committing the
  updated lockfile, then confirming the `package.json` range still covers the resolved
  version (or bumping it explicitly if going to a new minor floor).
- Before bumping: skim the zod changelog between the currently-locked version and the
  target for anything touching `.safeParse`/error formatting, since those are the most
  commonly relied-on APIs in this repo's validators.

## .nvmrc (issue #1196)

- No `.nvmrc` exists at the repo root today.
- [.github/workflows/cli-checks.yml](../.github/workflows/cli-checks.yml) pins CI to
  `node-version: 20` via `actions/setup-node`. That's the version an `.nvmrc` should
  match, so `nvm use` locally lines up with what CI actually runs.
- [CONTRIBUTING.md](../CONTRIBUTING.md) currently documents the prerequisite loosely as
  "Node.js 18+ or 20+" — once an `.nvmrc` pins a single version, that line should be
  tightened to match rather than left as a range.

## Pin Node in the deploy script (issue #1195)

- Searched the repo for a deploy script or deploy workflow (`find` for
  `Dockerfile*`/`*.sh`, and everything under `.github/workflows/`) and found none. The
  only workflows present are `cli-checks.yml` (lint/clippy, pinned to Node 20) and
  `load-tests.yml` (k6 runs, no Node setup step at all).
- So there's currently no script that "resolves node to whatever the runner image has"
  — that behavior doesn't exist yet in this repo. Before implementing #1195, confirm
  with whoever filed it whether they mean a deploy pipeline that lives outside this
  repo (e.g. in a separate infra repo or a platform like Vercel), or whether the intent
  is to add a first deploy workflow here and pin Node in it from the start. Either way,
  the version to pin should match the `.nvmrc` / CI value above (Node 20) once that
  lands.
