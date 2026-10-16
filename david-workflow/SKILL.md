---
name: david-workflow
description: End-to-end workflow for a feature, fix or change. Plan in phases with a verification plan up front, implement, verify for real and review with sub agents, open a PR (or a gh stack) with evidence attached, drive CI and review comments to green, test on a preview deploy with a separate sub agent, check the new code's traces in Maple for performance, and confirm it is live after merge. Use when asked to build, ship, implement or fix something non-trivial, or on "david workflow", "full workflow", "push it through", "take this to a PR" or "make a stack".
---

# Workflow

Follow the stages in order; do not move on until a stage's exit condition holds. Small tasks go
through every stage too, just shorter. The user should never have to ask "did you test it?" or
"did you push it?".

## 1. Plan

**Size the work.**

- **One step** (one file, one bug, a few edits): say so and start implementing without waiting.
- **Phased** (several areas, layers or packages): split into independently buildable phases. Mark
  each parallel (own sub agent or session, no shared files) or sequential (name the dependency).
  Two writers never touch the same files.
- **Big feature**: phases that are each a reviewable PR become a `gh stack`. Name the branches.

**Reuse before building.** Use what the repo already has (components, services, query builders,
error patterns, infra resources), read the official docs of the tools involved, and say in the
plan what you reuse.

**Plan the verification (mandatory).** For each phase and the whole feature:

- the existing tools that prove it (tests, typecheck, lint, dev server in the browser, simulator,
  CLI runs, scripts, MCP tools);
- the missing tooling you will build to prove it (fixture, seed script, lab page, bench query,
  small harness). This is part of the work;
- the evidence for the PR (test output, screenshots, video, timings, bundle size);
- UI changes always need screenshots or video: list the states (empty, loading, populated, error,
  mobile, dark mode);
- perf claims need a before/after benchmark.

Real decisions go to the user as concrete examples to pick from, not open questions.

Exit: for phased or big work, the user has approved the plan. Then run every phase to the end
without stopping to ask whether to continue.

## 2. Implement

- Parallel phases go to sub agents with a full brief: files, constraints, done criteria, how to
  verify, and the repo rules (sub agents do not inherit CLAUDE.md or memory).
- Build the verification tooling as you go.
- Follow the repo's conventions the first time. Fix root causes so the bug class cannot recur
  (prefer a type error). No toggles nobody asked for, delete code you replace, keep comments short.
- Add spans to new code paths so stage 6 can see them.
- Check every sub agent's diff and checks yourself. A report is not proof.

Exit: every phase is implemented and typechecks.

## 3. Verify, review, fix

- Run the verification plan for real: targeted tests, typecheck, lint, and drive the actual app for
  anything user-visible. Start servers, sign in and seed data yourself.
- Share screenshots while UI work takes shape.
- Send review sub agents over the full diff: correctness, repo conventions (`effect-review-v4` for
  Effect code), simplification. Fix every finding and repeat until a pass is clean.
- Capture evidence as you go. Anything not verifiable locally is stated and carried to stage 5.

Exit: the whole verification plan passes, the last review is clean, evidence is captured.

## 4. Open the PR

Open it without asking, ready for review (not draft). If the user said "push to main", push to
`main` and skip to stage 7.

- One PR per change; a `gh stack` for big features, each PR linking the rest. Follow-ups to stacked
  work go on the stack. Update a stack by merging each branch into the next, not force-pushing.
- Commit only files you changed; follow the repo's commit rules; add a changeset when a released
  package changed.
- Description: short and plain. What changed and why, how it was verified, the evidence. UI changes
  always embed screenshots or video (repo convention, else an orphan `pr-assets` branch).
- Enable CI auto-fix if available. Fix every failing check (even ones you did not cause), every
  review comment and every merge conflict.

Exit: PR open with evidence, CI green, no open comments.

## 5. Preview test

1. Deploy a preview the way the repo does it (Maple: `gh pr edit <n> --add-label preview`, see
   `docs/pr-previews.md`). Elsewhere look for preview labels or deploy workflows; if none exist,
   say so and propose one.
2. Wait for the deploy check, then share the preview URL.
3. Start a separate verification sub agent with only the PR context: preview URL, expected
   behavior, flows to try, how to sign in (Maple: `infisical run --env dev -- bun run
   preview:signin <n>`, never typing the key). It tests happy path and edge cases, records a video
   and screenshots, and reports what broke.
4. Post its evidence on the PR. Breakage goes back to stage 3.

Exit: the sub agent confirms the feature works on the preview.

## 6. Traces and performance

1. Pull the preview test's traces for the new code from Maple MCP (`search_traces`,
   `inspect_trace`, `find_slow_traces`, `find_errors`), filtered to the preview environment
   (Maple previews report `deployment.environment` = `pr-<n>`).
2. Comment them on the PR: trace links, key span tree, durations (p50/p95), query counts, errors.
3. Look for slow spans, N+1 queries, serial waterfalls, oversized scans, missing caching, retries
   and missing spans.
4. If it is slow, fix it and repeat stages 3 to 6, posting before/after numbers.

Exit: traces are on the PR and look good. Say it is ready to merge.

## 7. After merge

Watch the production deploy and fix it if it fails. Check prod errors and the new traces in Maple;
if something broke and the fix is not quick, revert first. Remove the preview label if the PR stays
open.

## Finish

A few lines: what changed, PR link(s), what was verified where, preview and trace results, a clear
safe-to-merge verdict, and open items proposed as follow-up sessions.

## Always

- Keep the task list current and never claim something works without evidence from this run.
- Do it yourself with the available CLIs and tools; ask the user only for what truly needs them.
- Diagnose from real data (Maple MCP, read-only prod queries), not guesses.
- During long waits, say what you are waiting on.
- Follow the repo's CLAUDE.md and the user's memory rules.
