---
name: effect-review-v4
description: >-
  This skill should be used when the user asks to "review effect v4 code",
  "effect v4 review", "review my effect 4 code", "check effect v4 patterns",
  "run effect v4 review", "audit the effect codebase", or wants a comprehensive
  code review of an Effect v4 (effect-smol / the 4.0 beta line) codebase against
  v4 conventions for Context.Service, Layer composition, Schema.TaggedErrorClass,
  the flattened Cause, Effect.fn, branded Schema types, observability,
  effect-atom, and test coverage. Supports reviewing a PR/branch diff or the
  whole repository. For Effect v3 codebases, use the effect-review skill instead.
version: 2.0.0
---

# Effect v4 Code Review

Orchestrate a multi-agent review against **Effect v4** ("effect-smol", the
`effect@4.0.0-beta.*` line) best practices.

Effect v4 is a structural rewrite. Services, errors, `Cause`, and `Schema` all
changed shape. This skill checks that v4 code follows **v4 conventions** — it
does not hunt for leftover v3 APIs. If the codebase is on Effect v3, use the
`effect-review` skill instead.

## Step 0: Determine Review Mode

The skill has two modes:

- **PR mode** — review only the files changed on the current branch / PR.
- **Repo mode** — review the entire repository, fanning out across a large
  number of subagents.

Pick the mode from the user's request:

- PR mode signals: "review my PR", "review my changes", "review this branch",
  "review the diff", a PR number/URL.
- Repo mode signals: "review the whole repo", "review the codebase", "audit the
  repo", "review everything", "full codebase review".

**If the request does not clearly indicate which mode, ask the user with the
`AskUserQuestion` tool** before doing anything else. Offer the two options:

- *PR / branch diff* — "Review only the files changed on the current branch."
- *Whole repository* — "Review every Effect file in the repo (slower, uses many
  parallel subagents)."

Do not guess. Once the mode is known, follow the matching workflow below.

---

## Mode A: PR Review

### A1. Discover Changed Files

Run `git diff --name-only main...HEAD` to find all changed files on the current
branch. If that fails (e.g., on main), fall back to `git diff --name-only HEAD~1`
or `git diff --name-only` for unstaged changes. If the user gave a PR number,
use `gh pr diff <number> --name-only`.

List the changed files for the user.

### A2. Categorize Files

Apply the **shared categorization rules** (see "File Categorization" below).

### A3. Launch Sub-Agents in Parallel

Launch one agent per concern, each scoped to all changed files of the relevant
category. Launch every applicable agent in a **single message** for maximum
parallelism. Use the **shared reviewer roster** and **shared agent prompt**
below.

For a PR, this is typically 5 backend + 1 test + 1 UI = up to 7 agents.

### A4. Unified Report

Compile results using the **shared report format** below.

---

## Mode B: Whole-Repo Review

Repo mode reviews the entire codebase. The goal is **maximum parallelism**:
shard the repo into many small file groups and launch a dedicated subagent for
every (shard × concern) pair. Expect to launch **dozens of subagents** — this is
intended.

### B1. Discover All Effect Source Files

List every TypeScript source file tracked by git, excluding noise:

```
git ls-files '*.ts' '*.tsx' \
  ':!:**/node_modules/**' ':!:**/dist/**' ':!:**/build/**' \
  ':!:**/*.gen.ts' ':!:**/routeTree.gen.ts'
```

Report the total file count to the user before fanning out.

### B2. Categorize and Shard

First categorize every file with the **shared categorization rules** below.
Then **shard** each category into small groups:

- **Shard size: 6–10 files per shard.** Smaller shards = more subagents = more
  parallelism and smaller per-agent context. Prefer grouping files from the
  same directory into a shard so each subagent reviews a coherent area.
- Compute shards separately for backend, test, and UI files.
- Example: 240 backend files → ~30 backend shards; 90 test files → ~12 test
  shards; 60 UI files → ~8 UI shards.

State the shard plan to the user, e.g. "30 backend shards × 5 reviewers = 150
backend agents, 12 test agents, 8 UI agents — 170 subagents total."

### B3. Fan Out — Launch Many Sub-Agents

For **every backend shard**, launch all **5 backend reviewers** (see roster
below), each scoped to that shard's files. For every test shard, launch the
`test-reviewer`. For every UI shard, launch the `atom-reviewer`.

This produces `backendShards × 5 + testShards + uiShards` subagents. **Launch
them aggressively in parallel**, in waves:

- Put as many `Agent` tool calls as possible in a **single message** (a wave of
  ~10–15 agents).
- Send wave after wave until every shard × concern pair has been dispatched.
- Do not review files yourself in the main thread — all reading and analysis
  happens inside subagents. The main thread only shards, dispatches, and
  aggregates.

Use the **shared agent prompt** below for each agent.

### B4. Aggregate

Collect findings from every subagent. Merge them **by concern category** (all
`effect-fn` findings together, all `services-layers` findings together, etc.),
preserving each finding's `file:line`. De-duplicate identical findings reported
by overlapping shards. Then compile the **shared report format** below — the
summary table counts every finding across the whole repo.

For repo mode, also add a short **"Top offenders"** subsection listing the 5–10
files with the most Critical findings.

---

## Shared: File Categorization

- **Backend Effect files**: `.ts` files NOT ending in `.test.ts`, NOT config
  files (`.config.ts`, `tsconfig`, `vitest.*`, etc.), NOT generated files
  (`*.gen.ts`, `routeTree.gen.ts`, barrel `index.ts`).
- **Test files**: `.test.ts` files.
- **UI files**: `.tsx` files.
- **Skip**: `.md`, `.json`, `.yml`, `.css`, config files, generated files.

## Shared: Reviewer Roster

**Backend reviewers** (run on backend `.ts` files):

- `effect-fn-reviewer` — `Effect.fn` / `Effect.fnUntraced` usage, generator
  style, `return yield*`, no try/catch or async/await, no `Date.now`, plus
  Effect primitives (`Array`, `Match`, `Option`, `Effect.forEach`).
- `services-layers-reviewer` — `Context.Service` class syntax, explicit `layer`
  statics, `Layer.provideMerge` / `mergeAll` composition, `Context.Reference`.
- `errors-reviewer` — `Schema.TaggedErrorClass` / `Data.TaggedError`, v4
  `catch*` combinators, `catchTag` / `catchReason`, specific error channels,
  flattened `Cause` access.
- `schema-reviewer` — `Schema.Struct` / `Schema.Class`, branded types, `is*`
  filters via `.check`, array-form `Union` / `Tuple` / `Literals`,
  `optionalKey` vs `optional`, `decodeTo`.
- `observability-reviewer` — `Effect.fn` / `withSpan` tracing,
  `annotateCurrentSpan`, structured `Effect.log*`, OTLP setup.

**Test reviewer** (runs on `.test.ts` files):

- `test-reviewer` — `@effect/vitest` patterns (`it.effect`, `assert`,
  `it.layer`, `TestClock`) and coverage gaps.

**UI reviewer** (runs on `.tsx` files):

- `atom-reviewer` — effect-atom usage (`Atom.make` at module scope, `useAtom`
  family, `Result` handling, `keepAlive`).

Agent → reference guide mapping:

- `effect-fn-reviewer` → `references/effect-fn-and-gen.md` + `references/primitives.md`
- `services-layers-reviewer` → `references/services-layers.md`
- `errors-reviewer` → `references/errors-and-cause.md`
- `schema-reviewer` → `references/schema.md`
- `observability-reviewer` → `references/observability.md`
- `test-reviewer` → `references/test-patterns.md`
- `atom-reviewer` → `references/effect-atom.md`

## Shared: Agent Prompt

For each agent, provide this prompt:

> Review the following files for [agent's specialty] against Effect v4
> conventions. Read each file and produce a structured report with
> Critical/Warning/Info findings, each citing `file:line`.
>
> Files to review:
> - [list of file paths in this shard]
>
> Also read the reference guide(s) at `references/[relevant-reference].md`
> (relative to this skill) for the detailed v4 checklist. Treat every "GOOD"
> example there as the v4-correct form. Report only findings — do not edit code.

## Shared: Unified Report

After all agents complete, compile results into a single report:

```
# Effect v4 Review Report — [PR <name> | Whole Repo]

Scope: [N changed files | N files across M shards, K subagents]

## Effect.fn & Generators
[merged agent output]

## Services & Layers
[merged agent output]

## Errors & Cause
[merged agent output]

## Schema
[merged agent output]

## Observability
[merged agent output]

## Test Coverage
[merged agent output]

## Effect Atom (UI)
[merged agent output]

---

## Summary

| Category            | Critical | Warning | Info |
|---------------------|----------|---------|------|
| Effect.fn & Gen     | X        | Y       | Z    |
| Services & Layers   | X        | Y       | Z    |
| Errors & Cause      | X        | Y       | Z    |
| Schema              | X        | Y       | Z    |
| Observability       | X        | Y       | Z    |
| Tests               | X        | Y       | Z    |
| Effect Atom         | X        | Y       | Z    |
| **Total**           | **X**    | **Y**   | **Z**|

[Repo mode only] ## Top Offenders
[5–10 files with the most Critical findings]

**Verdict**: PASS / NEEDS WORK / FAIL

**Score: X/10**
```

- **PASS**: 0 critical findings
- **NEEDS WORK**: 1-3 critical findings
- **FAIL**: 4+ critical findings

### Scoring (0-10)

After compiling all findings, assign an overall score from 0 to 10:

- **10**: Perfect — no findings at all, exemplary Effect v4 code
- **9**: Excellent — only minor info-level suggestions
- **8**: Great — a few warnings, no criticals
- **7**: Good — several warnings but no criticals
- **6**: Acceptable — 1 critical or many warnings
- **5**: Needs work — 2-3 criticals
- **4**: Below standard — 4-5 criticals
- **3**: Poor — 6+ criticals or fundamental pattern violations
- **2**: Very poor — majority of code ignores Effect v4 patterns
- **1**: Minimal compliance — almost no Effect v4 patterns followed
- **0**: No compliance — entirely non-Effect code submitted as Effect code

For repo mode, judge the score on the **density** of findings (criticals per
file reviewed), not the raw count — a large repo will naturally accumulate more
findings than a single PR.

Display the score prominently at the end of the report.

## Reference Files

Detailed v4 checklists with GOOD/BAD code examples:

- `references/effect-fn-and-gen.md` — `Effect.fn` / `Effect.fnUntraced`, generator style, `return yield*`, no try/catch, `Clock` over `Date.now`
- `references/services-layers.md` — `Context.Service` class syntax, explicit `layer`, `Layer.provideMerge` / `mergeAll`, `Context.Reference`
- `references/errors-and-cause.md` — `Schema.TaggedErrorClass`, `Data.TaggedError`, v4 `catch*` names, `catchReason`, flattened `Cause`
- `references/schema.md` — `Schema.Struct` / `Class`, branded types, `is*` filters, array-form constructors, `optionalKey` vs `optional`, `decodeTo`
- `references/primitives.md` — `Array`, `Match`, `Option`, `Effect.forEach`
- `references/observability.md` — `Effect.fn` / `withSpan`, `annotateCurrentSpan`, structured logging, Otlp modules
- `references/effect-atom.md` — `Atom.make`, `useAtom` family, `Result` handling, `keepAlive`
- `references/test-patterns.md` — `@effect/vitest`, `it.effect`, `it.layer`, `TestClock`
