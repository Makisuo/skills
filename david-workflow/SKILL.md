---
name: david-workflow
description: David's end-to-end way of working with an agent on a feature, fix or change. Plan in phases (with a verification plan decided up front), implement, verify and fix, open a PR (or a stack of PRs) with verification evidence attached, then deploy a preview, test it there with a separate sub agent, pull the traces of the new code from Maple and check they are performant. Use whenever David asks to build, ship, implement or fix something non-trivial, says "david workflow", "do it the usual way", "full workflow", or "take this to a PR".
---

# David's workflow

This is how David wants work done, start to finish. Follow the stages in order. Each stage has an
exit condition; do not move on until it holds. Small tasks still go through every stage, they are
just shorter.

## 1. Plan

Before touching code, write a plan and show it to David.

**Size the work first.**

- **One step**: a single coherent change (one file, one bug, a few edits). Do it directly, no phases,
  no sub agents. Say so explicitly: "this is one step".
- **Phased**: anything that touches several areas, layers or packages. Break it deliberately into
  phases where each phase is independently buildable and reviewable, and decide for each one:
  - can it run as its own sub agent or session in its own worktree (independent files, no shared
    edits with another phase)? Then mark it parallel.
  - does it depend on an earlier phase (schema before API before UI)? Then mark it sequential and
    name the dependency.
  - Two writers never touch the same files. If phases overlap, merge them or serialize them.
- **Big feature**: phases that are each a reviewable PR on their own become a **stacked PR** plan
  (base PR first, each next PR branched off the previous one). Name the branches in the plan.

**Plan the verification. This is mandatory, every plan has it.** For each phase and for the
feature as a whole, write down how you will prove it works at the end:

- which existing tools prove it: unit/integration tests, typecheck, lint, the dev server in the
  Browser pane, the iOS simulator, CLI runs, existing scripts, benchmarks, MCP tools;
- what is missing to prove it, and the tool you will build for that (a test fixture, a seed
  script, a lab page, a playground script, a bench query, a small CLI harness). Building
  verification tooling is part of the work, not a nice-to-have;
- what evidence you will capture for the PR (test output, screenshots, a screen recording,
  query timings, trace links);
- for UI changes: screenshots or a video are always required, plan which states to capture
  (empty, loading, populated, error, mobile width, dark mode where relevant).

A plan without a verification section is not finished. Exit condition: David has seen the plan
(phases, parallel vs sequential, PR shape, verification plan) and nothing in it is still unknown.

## 2. Implement

- Execute phase by phase. Parallel phases go to sub agents or separate worktree sessions; give each
  one a full brief (files, constraints, what done looks like, how to verify, and the repo rules
  from CLAUDE.md and memory, since sub agents do not inherit them).
- Build the verification tooling from the plan as you go, not at the end.
- Check each sub agent's result yourself (read the diff, run its checks). A report is not proof.

Exit condition: every phase is implemented and builds/typechecks.

## 3. Verify and fix

- Run the verification plan for real: targeted tests for what changed (not the whole suite unless
  asked), typecheck, lint, and drive the actual app or tool for anything user-visible.
- Capture the evidence while you go (screenshots, recordings, test output, timings) and keep it in
  the scratchpad for the PR.
- Every failure gets fixed and re-verified. Loop until the whole plan passes. If something cannot be
  verified locally, say so plainly and carry it into the preview stage.

Exit condition: every item in the verification plan passed, with evidence captured.

## 4. Open the PR (automatically)

Do not ask whether to open a PR. Once stage 3 passes, open it.

- Branch off the default branch if you are on it. One PR for a single change; a stack of PRs for
  big features, in the order the plan named, each PR description linking the rest of the stack.
- Commit only the files you changed (no `git commit -a`, no stash). Follow the repo's commit rules.
- PR description: what changed and why, how it was verified, and the evidence:
  - test/typecheck output summaries and any benchmark numbers;
  - **for any UI change, always screenshots or a video embedded in the description.** Upload them
    the way the repo already does; if there is no convention, push them to an orphan `pr-assets`
    branch and embed the raw URLs. Never open a UI PR without visual evidence.
- Bind the PR to the session (ccd_pr tools) and watch CI.

Exit condition: PR (or stack) open with verification evidence in the description, CI green or
failures being fixed.

## 5. Preview deploy and prod-like test

Every PR gets tested in its prod-like environment, by a fresh pair of eyes.

1. **Deploy a preview.** Use whatever the repo provides and say which you used:
   - Maple: add the `preview` label (`gh pr edit <n> --add-label preview`); the stack comes up at
     `app-pr-<n>.maple.dev`, `api-pr-<n>.maple.dev` etc. Read `docs/pr-previews.md` for limits
     (max 8 live previews) and what is not in a preview.
   - Other repos: look for preview labels, Vercel/Netlify/Cloudflare preview URLs, or deploy
     workflows in `.github/workflows/`. If there is none, tell David and propose how to get one.
2. **Wait for the deploy** to finish (the deploy check or PR comment), not by guessing.
3. **Start a separate verification sub agent** with no implementation context beyond the PR: give
   it the preview URL, what the feature should do, and the user flows to try. It drives the
   preview in the browser, tries the happy path and the edge cases, captures screenshots/video,
   and reports what worked and what broke.
4. Anything broken goes back to stage 3 locally, then the PR is updated and the preview re-tested.

Exit condition: the verification sub agent confirms the feature works in the preview.

## 6. Traces and performance

1. **Query Maple MCP** for the traces of the code you built, generated by the preview test
   (`search_traces`, `inspect_trace`, `find_slow_traces`, `get_service_top_operations`,
   `find_errors`; filter by the preview's service/environment and the new operations).
2. **Post them on the PR as a comment** (`gh pr comment`): the trace links, the span tree of the key
   operations, durations (p50/p95 where there is enough data), query counts, errors if any.
3. **Judge performance.** Look for: slow spans, N+1 queries, waterfalls that should be parallel,
   oversized warehouse scans, missing caching, unexpected errors or retries, missing spans for the
   new code (missing instrumentation is a finding too).
4. If it is not performant: improve it, then go through verify (3), update the PR (4), re-test in
   the preview (5) and re-check traces (6) again. Post the before/after numbers as a new comment.

Exit condition: traces are on the PR and show the new code performs well.

## Finish

Report to David in a few lines: the PR link(s), what was verified where, the preview result,
the trace/performance summary, and anything not verified or left open (proposed as a follow-up
session, not buried in prose).

## Always

- Keep the task list current across all six stages.
- Never claim something works without evidence from this run.
- Follow the repo's CLAUDE.md and David's memory rules (writing style, commit rules, no em dashes).
