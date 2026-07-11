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
version: 3.0.0
---

# Effect v4 Code Review

Orchestrate a multi-agent review against **Effect v4** ("effect-smol", the
`effect@4.0.0-beta.*` line) best practices.

Effect v4 is a structural rewrite. Services, errors, `Cause`, and `Schema` all
changed shape. This skill checks that v4 code follows **v4 conventions** — it
does not hunt for leftover v3 APIs. If the codebase is on Effect v3, use the
`effect-review` skill instead.

**This skill has burned its hand before.** Past runs produced "fixes" that were
reverted after breaking production (the `optional → optionalKey` mass-flip was
reverted *twice*), flagged idioms that were deliberate workarounds for real
compiler/runtime constraints, and recommended APIs that do not exist in the v4
beta. The process below exists to prevent a recurrence: gather repo conventions
first, label the risk of every fix, and adversarially verify findings before
reporting them. Follow it.

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

Do not guess. Once the mode is known, run Step 1, then the matching workflow.

## Step 1: Repo Conventions Pass (both modes, before any dispatch)

Spend a few minutes grounding the review in *this* repo before launching any
reviewer:

1. **Read the repo's `CLAUDE.md`** (and any `.claude/rules` / contributing
   docs). It typically documents load-bearing conventions — schema optionality
   policy, import discipline, test-runner requirements, tracing rules. Extract
   anything relevant and paste it into every reviewer's prompt as
   "repo-specific conventions".
2. **Pin the Effect version.** Find the exact `effect` version (root
   `package.json`, catalog, or lockfile). The v4 beta line moves fast and APIs
   appear/disappear between betas.
3. **Locate the API ground truth.** If the repo vendors the Effect source (e.g.
   maple's `.context/effect/` git subtree), declare it the **authoritative API
   reference**. Reviewers and verifiers must grep it before claiming an API
   exists, was renamed, or should be used. Never recommend an API from memory —
   several v3 staples (`Effect.fork`, `Effect.iterate`, `Effect.loop`,
   `Effect.catchAll`, `Effect.timeoutFail`) do not exist in the beta.
4. **Respect documented exceptions.** Any code carrying an explanatory comment
   (a TS2506 workaround note, a serverless startup-CPU-budget note, "don't
   change this", "deliberately", a linked issue) is **intentional**. Reviewers
   report such code at most as Info with the comment acknowledged — never as a
   Critical/Warning proposing to revert it.

Include the outputs of this step (conventions list, effect version, ground-truth
path) verbatim in every agent prompt.

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

### A4. Verify Findings

Run the **shared verification stage** (below) over every Critical and Warning
finding before compiling the report.

### A5. Unified Report

Compile results using the **shared report format** below.

---

## Mode B: Whole-Repo Review

Repo mode reviews the entire codebase. The goal is **maximum parallelism**:
shard the repo into many small file groups and launch a dedicated subagent for
every (shard × concern) pair, then verify findings as they come back.

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
backend agents, 12 test agents, 8 UI agents — 170 review subagents, plus
verification agents."

### B3. Fan Out

**Preferred: orchestrate with the `Workflow` tool** when it is available. A
workflow gives deterministic fan-out and lets each shard's findings flow into
verification without a global barrier:

```js
// Sketch — adapt shard lists and prompts. Use a schema so findings come back structured.
const results = await pipeline(
  shards,
  (shard) => agent(reviewPrompt(shard), { label: `review:${shard.id}`, phase: "Review", schema: FINDINGS_SCHEMA }),
  (review, shard) => parallel(chunk(review.findings.filter(isCriticalOrWarning), 6).map((batch) => () =>
    agent(verifyPrompt(batch), { label: `verify:${shard.id}`, phase: "Verify", schema: VERDICTS_SCHEMA })
  )),
)
```

**Fallback: Agent-tool waves.** For **every backend shard**, launch all **5
backend reviewers** (see roster below), each scoped to that shard's files. For
every test shard, launch the `test-reviewer`. For every UI shard, launch the
`atom-reviewer`.

- Put as many `Agent` tool calls as possible in a **single message** (a wave of
  ~10–15 agents), wave after wave until every shard × concern pair is
  dispatched.
- Do not review files yourself in the main thread — all reading and analysis
  happens inside subagents. The main thread only shards, dispatches, verifies,
  and aggregates.

Use the **shared agent prompt** below for each agent.

### B4. Verify and Aggregate

Run the **shared verification stage** over all Critical/Warning findings (in
the Workflow variant this already happened per shard). Then merge findings **by
concern category**, preserving each finding's `file:line`, and de-duplicate
identical findings from overlapping shards. Compile the **shared report
format** — the summary table counts every *confirmed* finding across the repo.

For repo mode, also add a short **"Top offenders"** subsection listing the 5–10
files with the most confirmed Critical findings.

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
  style, `return yield*`, no try/catch or async/await, no `Date.now` inside the
  Effect runtime, plus Effect primitives (effectful iteration, `Match`,
  `Option`, concurrency/state toolbox, `HttpClient`).
- `services-layers-reviewer` — `Context.Service` class syntax (`satisfies
  Shape` / hoisted `make`), explicit `layer` statics, layer memoization,
  `Layer.provideMerge` / `mergeAll` composition, Config/Env/Redacted,
  `Context.Reference`.
- `errors-reviewer` — `Schema.TaggedErrorClass` vs `Data.TaggedError` (by
  purpose), v4 `catch*` combinators, `catchTag` / `catchReason`, retryable vs
  terminal error splits, specific error channels, flattened `Cause` access.
- `schema-reviewer` — `Schema.Struct` / `Schema.Class`, branded types, `is*`
  filters via `.check`, array-form `Union` / `Tuple` / `Literals`,
  `optionalKey` vs `optional` (direction matters — see reference), field-name
  shadowing, `decodeTo`, external-numeric codecs.
- `observability-reviewer` — `Effect.fn` / `withSpan` tracing,
  `annotateCurrentSpan`, anticipated-error span status, structured
  `Effect.log*`, exporter wiring and flush paths.

**Test reviewer** (runs on `.test.ts` files):

- `test-reviewer` — `@effect/vitest` patterns (`it.effect` vs `it.live`,
  `assert`, `it.layer`, `TestClock`), HTTP/config/DB stubbing patterns, branded
  fixtures, and coverage gaps.

**UI reviewer** (runs on `.tsx` files):

- `atom-reviewer` — effect-atom usage (module-scope atoms, shared AtomRuntime
  selection, `Atom.family` keying, mutation/Exit handling, `Result` handling
  via the app's shim, keepAlive).

Agent → reference guide mapping:

- `effect-fn-reviewer` → `references/effect-fn-and-gen.md` + `references/primitives.md`
- `services-layers-reviewer` → `references/services-layers.md`
- `errors-reviewer` → `references/errors-and-cause.md`
- `schema-reviewer` → `references/schema.md`
- `observability-reviewer` → `references/observability.md`
- `test-reviewer` → `references/test-patterns.md`
- `atom-reviewer` → `references/effect-atom.md`

**Every agent, regardless of specialty, also reads
`references/known-pitfalls.md`** — the do-not-flag list and risky-fix taxonomy
distilled from past reviews that went wrong.

## Shared: Agent Prompt

For each agent, provide this prompt (fill the bracketed parts):

> Review the following files for [agent's specialty] against Effect v4
> conventions. Read each file and produce a structured report with
> Critical/Warning/Info findings, each citing `file:line`.
>
> Files to review:
> - [list of file paths in this shard]
>
> Repo-specific conventions (from CLAUDE.md — these OVERRIDE the generic
> checklist where they conflict):
> - [conventions extracted in Step 1]
>
> Effect version: [version]. API ground truth: [path to vendored effect source,
> if any]. Before claiming an API exists, was renamed, or should be adopted,
> grep the ground-truth source — do not rely on memory.
>
> Read the reference guide(s) at `references/[relevant-reference].md` AND
> `references/known-pitfalls.md` (relative to this skill) for the detailed v4
> checklist. Treat every "GOOD" example there as the v4-correct form. Do not
> report anything on the known-pitfalls do-not-flag list.
>
> For every finding include:
> - severity (Critical / Warning / Info)
> - `file:line`
> - a one-sentence defect statement and the concrete failure or cost
> - a **fix-risk label**: `safe` (compile-time-only or mechanical, cannot
>   change runtime behavior) or `behavior-risk` (could change runtime
>   semantics — e.g. schema optionality changes, decode variant swaps,
>   loop→forEach where the loop early-returns, adding/removing timeout/retry,
>   span changes on hot paths, renames touching many sites). For
>   behavior-risk findings, list the construction/call sites the fix would
>   touch.
>
> Code carrying an explanatory comment (workaround note, budget constraint,
> "don't change") is intentional — at most Info. Report only findings — do not
> edit code.

## Shared: Verification Stage

**No Critical or Warning reaches the report unverified.** After reviewers
return, batch all Critical/Warning findings into groups of ~5–8 and launch one
verifier agent per batch (in parallel, same wave rules as reviewers). Info
findings pass through unverified.

Verifier prompt:

> You are an adversarial verifier. For each finding below, try to REFUTE it.
> A finding survives only if you fail to refute it. Check, in order:
>
> 1. **API reality.** If the finding claims an API exists / was renamed /
>    should be adopted, grep the Effect source at [ground-truth path] and the
>    installed version. A recommendation naming a nonexistent API is refuted.
> 2. **Documented intent.** Read the flagged code and ~30 surrounding lines.
>    If a comment or the repo conventions in CLAUDE.md explain the idiom
>    (compiler workaround, platform budget, deliberate exception), the finding
>    is refuted.
> 3. **Behavior-risk fixes.** If the fix is labeled behavior-risk, audit the
>    construction/call sites it touches. Concretely: for optionality changes,
>    check whether any JS code can pass an explicit `undefined`; for decode
>    swaps, check what happens to the error channel; for loop conversions,
>    check for early-return/accumulate-then-fail semantics. If any site would
>    break, the finding is refuted (or must be re-scoped to the safe subset).
> 4. **Severity calibration.** A convention-only finding whose fix requires
>    editing many call sites is at most Info unless you can demonstrate a
>    concrete failure.
>
> For each finding return: CONFIRMED (with any severity adjustment) or REFUTED
> (with the one-line refuting evidence — file:line of the comment, the grep
> result, the breaking call site).

Apply the verdicts: refuted findings move to the "Refuted findings" appendix
with their evidence; findings the verifier could not decide are downgraded one
severity level and marked `(unverified)`. Only confirmed findings count toward
the verdict and score.

## Shared: Unified Report

After verification completes, compile results into a single report:

```
# Effect v4 Review Report — [PR <name> | Whole Repo]

Scope: [N changed files | N files across M shards, K subagents]
Findings: X confirmed (of Y reported; Z refuted in verification)

## Effect.fn & Generators
[merged confirmed findings — each with severity, file:line, fix-risk label]

## Services & Layers
[...]

## Errors & Cause
[...]

## Schema
[...]

## Observability
[...]

## Test Coverage
[...]

## Effect Atom (UI)
[...]

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
[5–10 files with the most confirmed Critical findings]

## Refuted Findings (appendix)
[each refuted finding, one line: original claim → refuting evidence]

**Verdict**: PASS / NEEDS WORK / FAIL

**Score: X/10**
```

- **PASS**: 0 confirmed critical findings
- **NEEDS WORK**: 1-3 confirmed critical findings
- **FAIL**: 4+ confirmed critical findings

### Scoring (0-10)

After compiling all confirmed findings, assign an overall score from 0 to 10:

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

- `references/known-pitfalls.md` — **read by every agent**: do-not-flag idioms and the risky-fix taxonomy (lessons from reviews that caused regressions)
- `references/effect-fn-and-gen.md` — `Effect.fn` / `Effect.fnUntraced`, generator style, `return yield*`, no try/catch, `Clock` scope, APIs absent from the v4 beta
- `references/services-layers.md` — `Context.Service` class syntax (`satisfies` / hoisted make), explicit `layer`, layer memoization, `Layer.provideMerge` / `mergeAll`, Config/Redacted, `Context.Reference`
- `references/errors-and-cause.md` — `Schema.TaggedErrorClass` vs `Data.TaggedError`, v4 `catch*` names, `catchReason`, retryable/terminal splits, flattened `Cause`
- `references/schema.md` — `Schema.Struct` / `Class` (+ `new` construction), branded types, `is*` filters, array-form constructors, `optionalKey` vs `optional` (direction!), field shadowing, `decodeTo`, external-numeric codecs
- `references/primitives.md` — effectful iteration, `Match`, `Option`, concurrency/state toolbox, `HttpClient`
- `references/observability.md` — `Effect.fn` / `withSpan`, `annotateCurrentSpan`, anticipated-error span status, structured logging, exporter/flush wiring
- `references/effect-atom.md` — module-scope atoms, shared AtomRuntime, `Atom.family`, mutations/Exit, `Result` handling, `keepAlive`
- `references/test-patterns.md` — `@effect/vitest`, `it.effect` vs `it.live`, `it.layer`, `TestClock`, stubbing patterns, branded fixtures
