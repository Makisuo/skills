---
description: Review code changes for Effect-TS best practices using specialized sub-agents
argument-hint: Optional branch or file paths to review
---

# Effect-TS Code Review

## Context

- Changed files: !`git diff --name-only main...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || git diff --name-only`
- Current branch: !`git branch --show-current`

## Your Task

Review all changed files against Effect-TS best practices using specialized sub-agents. $ARGUMENTS

### Step 1: Categorize the changed files above

- **Backend Effect files**: `.ts` files NOT ending in `.test.ts`, NOT under `packages/sui/`, NOT config files
- **Test files**: `.test.ts` files
- **UI files**: `.tsx` files
- **Skip**: `.md`, `.json`, `.yml`, `.css`, config files

### Step 2: Launch sub-agents in parallel

Launch all applicable agents in a **single message with multiple Agent tool calls** for maximum parallelism.

**If backend Effect files exist**, launch these 4 agents:

1. **effect-primitives-reviewer** (effect-review plugin agent): Provide file paths. Checks: Effect Array/HashMap, Effect.forEach, Match over switch, Option over ?., Schema over Zod, Layer not Effect.provide, no try/catch, no async/await.

2. **branded-types-reviewer** (effect-review plugin agent): Provide file paths. Checks: All IDs use branded types from @superwall/drizzle/branded, no plain string/number, no `as` casting, *FromString for URL params.

3. **otel-reviewer** (effect-review plugin agent): Provide file paths. Checks: Effect.fn("ServiceName.methodName") trace names, annotateCurrentSpan with entity IDs, structured logging, no console.log.

4. **error-reviewer** (effect-review plugin agent): Provide file paths. Checks: Schema.TaggedError with HttpApiSchema.annotations, static factory methods, rich context, catchTag only (never catchAll/mapError), explicit error types.

**If test files exist**, launch:

5. **test-coverage-reviewer** (effect-review plugin agent): Provide test file paths AND corresponding source file paths. Checks: @effect/vitest, it.layer(), it.scoped, Effect.either for errors, factory functions, coverage gaps.

**If UI files (.tsx) exist**, launch:

6. **ui-reviewer** (effect-review plugin agent): Provide file paths. Checks: SUI component usage (packages/sui), accessibility, TailwindCSS, brand consistency, Effect-Atom patterns.

For each agent, tell it:
- The exact file paths to review
- To read the reference guide at the plugin root for its detailed checklist
- To produce a structured report with Critical/Warning/Info findings and file:line references

### Step 3: Compile unified report

After all agents return, present a unified report with all findings organized by category. End with a summary table and verdict (PASS: 0 critical, NEEDS WORK: 1-3 critical, FAIL: 4+ critical).
