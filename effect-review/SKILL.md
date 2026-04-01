---
name: effect-review
description: >-
  This skill should be used when the user asks to "review code", "review my changes",
  "check effect patterns", "run effect review", "effect review", "review for effect best practices",
  or wants a comprehensive code review against Effect-TS conventions, branded types,
  observability, error handling, test coverage, and UI quality.
version: 1.0.0
---

# Effect-TS Code Review

Orchestrate a multi-agent review of code changes against Effect-TS best practices.

## Workflow

### Step 1: Discover Changed Files

Run `git diff --name-only main...HEAD` to find all changed files on the current branch. If that fails (e.g., on main), fall back to `git diff --name-only HEAD~1` or `git diff --name-only` for unstaged changes.

List the changed files for the user.

### Step 2: Categorize Files

Split files into categories:

- **Backend Effect files**: `.ts` files NOT ending in `.test.ts`, NOT config files (`.config.ts`, `tsconfig`, etc.), NOT UI component library directories
- **Test files**: `.test.ts` files
- **UI files**: `.tsx` files
- **Skip**: `.md`, `.json`, `.yml`, `.css`, config files, generated files

### Step 3: Launch Sub-Agents in Parallel

Based on which categories have files, launch the appropriate agents using the Agent tool. Launch all applicable agents in a **single message** for maximum parallelism.

**If backend Effect files exist**, launch these 4 agents in parallel:
- `effect-primitives-reviewer` — checks Effect primitives (Array, Match, Option, forEach, no try/catch, no async/await, Layer not Effect.provide)
- `branded-types-reviewer` — checks branded type usage for all entity IDs
- `otel-reviewer` — checks tracing setup (Effect.fn trace names, annotateCurrentSpan, structured logging)
- `error-reviewer` — checks error definitions and handling (Schema.TaggedError, catchTag, rich context)

**If test files exist**, launch:
- `test-coverage-reviewer` — checks @effect/vitest patterns and assesses coverage gaps

**If UI files exist**, launch:
- `ui-reviewer` — checks component library usage, accessibility, layout, brand consistency

For each agent, provide the prompt:
> Review the following files for [agent's specialty]. Read each file and produce a structured report with Critical/Warning/Info findings.
>
> Files to review:
> - [list of file paths]
>
> Also review the reference guide at `references/[relevant-reference].md` (relative to this skill) for the detailed checklist.

### Step 4: Unified Report

After all agents complete, compile results into a single report:

```
# Effect Review Report

## Effect Primitives
[agent output]

## Branded Types
[agent output]

## OTEL / Observability
[agent output]

## Error Handling
[agent output]

## Test Coverage
[agent output]

## UI Quality
[agent output]

---

## Summary

| Category | Critical | Warning | Info |
|----------|----------|---------|------|
| Primitives | X | Y | Z |
| Branded Types | X | Y | Z |
| OTEL | X | Y | Z |
| Errors | X | Y | Z |
| Tests | X | Y | Z |
| UI | X | Y | Z |
| **Total** | **X** | **Y** | **Z** |

**Verdict**: PASS / NEEDS WORK / FAIL

**Score: X/10**
```

- **PASS**: 0 critical findings
- **NEEDS WORK**: 1-3 critical findings
- **FAIL**: 4+ critical findings

### Scoring (0-10)

After compiling all findings, assign an overall score from 0 to 10:

- **10**: Perfect — no findings at all, exemplary Effect-TS code
- **9**: Excellent — only minor info-level suggestions
- **8**: Great — a few warnings, no criticals
- **7**: Good — several warnings but no criticals
- **6**: Acceptable — 1 critical or many warnings
- **5**: Needs work — 2-3 criticals
- **4**: Below standard — 4-5 criticals
- **3**: Poor — 6+ criticals or fundamental pattern violations
- **2**: Very poor — majority of code ignores Effect patterns
- **1**: Minimal compliance — almost no Effect patterns followed
- **0**: No compliance — entirely non-Effect code submitted as Effect code

Display the score prominently at the end of the report.

## Reference Files

Detailed checklists with codebase-specific examples:
- `references/effect-primitives.md` — Effect Array, Match, Option, forEach, Schema, Layer
- `references/branded-types.md` — Branded type usage and known types list
- `references/otel-patterns.md` — Tracing, span annotations, structured logging
- `references/error-patterns.md` — Schema.TaggedError, catchTag, error context
- `references/test-patterns.md` — @effect/vitest, it.layer, coverage assessment
- `references/effect-atom-patterns.md` — Effect-Atom React patterns, queries, mutations, Result.builder
