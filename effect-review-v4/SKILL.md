---
name: effect-review-v4
description: >-
  This skill should be used when the user asks to "review effect v4 code",
  "effect v4 review", "review my effect 4 code", "check effect v4 patterns",
  "run effect v4 review", or wants a comprehensive code review of an Effect v4
  (effect-smol / the 4.0 beta line) codebase against v4 conventions for
  Context.Service, Layer composition, Schema.TaggedErrorClass, the flattened
  Cause, Effect.fn, branded Schema types, observability, effect-atom, and test
  coverage. For Effect v3 codebases, use the effect-review skill instead.
version: 1.0.0
---

# Effect v4 Code Review

Orchestrate a multi-agent review of code changes against **Effect v4**
("effect-smol", the `effect@4.0.0-beta.*` line) best practices.

Effect v4 is a structural rewrite. Services, errors, `Cause`, and `Schema` all
changed shape. This skill checks that v4 code follows **v4 conventions** — it
does not hunt for leftover v3 APIs. If the codebase is on Effect v3, use the
`effect-review` skill instead.

## Workflow

### Step 1: Discover Changed Files

Run `git diff --name-only main...HEAD` to find all changed files on the current
branch. If that fails (e.g., on main), fall back to `git diff --name-only HEAD~1`
or `git diff --name-only` for unstaged changes.

List the changed files for the user.

### Step 2: Categorize Files

Split files into categories:

- **Backend Effect files**: `.ts` files NOT ending in `.test.ts`, NOT config
  files (`.config.ts`, `tsconfig`, etc.), NOT generated files
  (`routeTree.gen.ts`, barrel `index.ts`).
- **Test files**: `.test.ts` files.
- **UI files**: `.tsx` files.
- **Skip**: `.md`, `.json`, `.yml`, `.css`, config files, generated files.

### Step 3: Launch Sub-Agents in Parallel

Based on which categories have files, launch the appropriate agents using the
Agent tool. Launch all applicable agents in a **single message** for maximum
parallelism.

**If backend Effect files exist**, launch these 5 agents in parallel:

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

**If test files exist**, launch:

- `test-reviewer` — `@effect/vitest` patterns (`it.effect`, `assert`,
  `it.layer`, `TestClock`) and coverage gaps.

**If UI files exist**, launch:

- `atom-reviewer` — effect-atom usage (`Atom.make` at module scope, `useAtom`
  family, `Result` handling, `keepAlive`).

For each agent, provide the prompt:

> Review the following files for [agent's specialty] against Effect v4
> conventions. Read each file and produce a structured report with
> Critical/Warning/Info findings, each citing `file:line`.
>
> Files to review:
> - [list of file paths]
>
> Also read the reference guide at `references/[relevant-reference].md`
> (relative to this skill) for the detailed v4 checklist. Treat every "GOOD"
> example there as the v4-correct form.

Agent → reference guide mapping:

- `effect-fn-reviewer` → `references/effect-fn-and-gen.md` + `references/primitives.md`
- `services-layers-reviewer` → `references/services-layers.md`
- `errors-reviewer` → `references/errors-and-cause.md`
- `schema-reviewer` → `references/schema.md`
- `observability-reviewer` → `references/observability.md`
- `test-reviewer` → `references/test-patterns.md`
- `atom-reviewer` → `references/effect-atom.md`

### Step 4: Unified Report

After all agents complete, compile results into a single report:

```
# Effect v4 Review Report

## Effect.fn & Generators
[agent output]

## Services & Layers
[agent output]

## Errors & Cause
[agent output]

## Schema
[agent output]

## Observability
[agent output]

## Test Coverage
[agent output]

## Effect Atom (UI)
[agent output]

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
