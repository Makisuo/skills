---
name: effect-review-v4
description: >-
  Review Effect v4 code, including beta, RC, and release versions, for correct
  error propagation, resource ownership, cancellation, concurrency, primitive
  selection, services/layers, schemas, atoms, observability, and tests. Use for
  requests such as "effect v4 review", "review my Effect 4 changes", "check
  Effect patterns", or "audit the Effect codebase" when the project uses v4.
  Supports files, working changes, PR/branch diffs, and repository audits.
  Reviews with one agent by default; delegation has an explicit total limit.
  Verify APIs against the installed version. For Effect v3 use effect-review.
metadata:
  version: "4.0.1"
  examples-verified-with: "effect and @effect/vitest 4.0.0-rc.111"
---

# Effect v4 review

Review program behavior and the contracts it exposes. Prefer Effect primitives
when they remove custom cancellation, scheduling, resource, or coordination
logic. Explain the semantic benefit; counting Effect APIs is not a measure of
code quality.

Use this skill read-only unless the user also requests fixes. When asked to
review or improve this skill itself, inspect its instructions and examples;
do not launch a product-code audit.

Default to **one reviewer: the current agent, with zero subagents**, including
whole-repository audits. Follow the delegation and context limits in section 3.

## 1. Establish scope and ground truth

Read [version-grounding.md](references/version-grounding.md) and the applicable
repository instructions before making findings.

- Respect explicit files/directories, PRs, branches, and prior conversation.
  "My changes" normally means working changes when present; otherwise inspect
  the current branch's actual base. State inferred scope. Ask only if unresolved
  ambiguity would materially change the review.
- PR/branch: determine the actual base, inspect its merge-base diff and relevant
  callers. Working changes: include staged, unstaged, and relevant untracked
  files. An empty diff is not a command failure. Never silently review `HEAD~1`.
- Repo: discover first-party source, excluding generated/dependency/reference
  trees. `.context` is API evidence, not product code under review.
- Classify by contents and ownership, not extension alone. `index.ts`, config,
  `.tsx`, `.spec.*`, and type tests can contain important Effect behavior.
  Include indirect consumers and runtime adapters when following a contract.
- Pin actual package resolution and patches. Skill examples are evidence for
  their tested version, not authority over a different installed version.

Optional read-only inventory helper (supply actual paths):

```sh
node <skill>/scripts/inspect-project.mjs --project <repo> --mode working
node <skill>/scripts/inspect-project.mjs --project <repo> --mode diff --base <actual-base>
node <skill>/scripts/inspect-project.mjs --project <repo> --mode repo
```

The helper lists candidates and exclusions; it does not claim semantic review
coverage or discover a PR base for you. Narrow to user-requested paths and read
relevant non-source contracts too.

## 2. Review connected behavior

Read [known-pitfalls.md](references/known-pitfalls.md) for conditions that made
previous proposed fixes unsafe. Then follow the relevant path:

**input → schema → service → driver/resource → error mapping → consumer → test**.

Run the error and lifetime passes on effectful work before suggesting style
changes. Load other references when their concerns are present:

| Concern | Reference |
| --- | --- |
| Expected failures, defects, interruption, recovery, public contracts | [errors-and-cause.md](references/errors-and-cause.md) |
| Resource scopes, fibers, cancellation, state, backpressure | [resources-concurrency.md](references/resources-concurrency.md) |
| Primitive selection; HTTP, retry, caching, polling, data transforms | [primitives.md](references/primitives.md) |
| Lazy construction, generators, tracing, Promise interop | [effect-fn-and-gen.md](references/effect-fn-and-gen.md) |
| Dependencies, layer acquisition/memoization, configuration | [services-layers.md](references/services-layers.md) |
| Decode/construction/encode, optionality, brands | [schema.md](references/schema.md) |
| Trace/log/metric context, status, export lifetime | [observability.md](references/observability.md) |
| Atom identity, runtime ownership, async state, invalidation | [effect-atom.md](references/effect-atom.md) |
| Behavior assertions, clocks, layers, typed failures | [test-patterns.md](references/test-patterns.md) |

For each custom mechanism, consider an existing Effect primitive or repository
abstraction. Check API availability, lifetime, failure/cancellation semantics,
performance, and affected callers before recommending it. Short combinator
chains, local variables, exhaustive switches, and native boundary adapters can
be the clearest correct implementation.

## 3. Review with one agent by default

**Delegation budget: zero by default; at most two subagents in total when the
user explicitly requests parallel or independent agent review.** Repository
size, file count, available slots, or a request for a thorough audit do not
authorize delegation. Do not ask to add agents routinely; continue locally.
An explicitly requested higher count can override this limit, subject to host
rules. A smaller user/host limit always applies.

- The cap is for the entire review, not concurrent agents or each wave. Count
  every distinct delegated reviewer, including reused agents. Never reset the
  budget for another concern, phase, retry, or verification pass.
- No recursive delegation. Every delegated reviewer must work alone. Do not
  create one agent per file, concern, finding, or shard-and-concern pair.
- Delegate only bounded, independent work that avoids duplicating the main
  review. Assign distinct subsystems, or a specific unresolved claim when an
  independent check was requested. Keep integration and final verification
  with the main reviewer; no automatic second team of verifiers.
- Send a compact task with assigned paths, resolved versions/patches, applicable
  conventions, relevant reference paths, and the expected result. Avoid copying
  the full conversation, entire skill/reference set, diffs, or repository into
  each prompt. Select isolated/no-history context when supported: a short prompt
  alone does not prevent the host from inheriting the full conversation.
  Reviewers may read callers outside their assignment as evidence.
- Ask for confirmed findings, necessary evidence, and material coverage gaps,
  normally within 600 words per delegated report. Use file references for long
  reproductions; do not repeat source dumps or narrate every inspected file.
- When the budget is used up or a reviewer fails, finish the remaining work
  locally. Reuse an existing reviewer only for a specific missing check; do not
  restart completed reviews or add replacement agents to bypass the cap.

Review connected paths once and apply relevant concerns together. Cache the
resolved version/policy evidence in a short note; load only relevant reference
sections. Keep a compact coverage ledger for large audits and continue
sequentially without re-reading completed areas unless new evidence requires it.
Preserve requested coverage and consequential verification; report any actual
omissions. Do not assume particular tools, models, or token-meter availability,
and do not claim measured token savings without measurements.

## 4. Verify and report

Follow [review-protocol.md](references/review-protocol.md). Every proposed API,
including optional suggestions, needs version-matched evidence. Consequential
findings need a concrete trigger and positive supporting evidence plus an
attempt to refute them.

Keep three kinds of output separate:

- **Correctness:** an observable failure, lost guarantee, or demonstrated cost.
- **Repository policy:** an applicable local requirement, cited to its source.
- **Optional simplification:** clearer primitive use with preserved behavior;
  never a blocking defect merely because syntax differs.

Comments are evidence of intent, not immunity. An unsafe proposed fix does not
refute a real bug. Keep unresolved claims in open questions, not downgraded
findings. Preserve uncertainty when execution or source evidence is missing.

Report highest-impact confirmed findings first, with location, trigger, impact,
rule, evidence, fix direction/risk, and validation. Include scope, coverage and
checks performed. Keep optional improvements concise and separate. If no
confirmed defect was found, say so with material coverage limits. Omit empty
category sections, numeric compliance scores, and file rankings.

## Maintaining this skill

Complete TypeScript examples live in [examples/README.md](examples/README.md)
and adjacent source files; do not duplicate them into unchecked GOOD blocks.
They include negative-control tests proving why unsafe patterns fail. Run
`scripts/check-examples.mjs --project <repo>` with Node and the project's
installed dependencies; it does not install or upgrade packages.

When API/runtime guidance or dependencies change, verify affected source and
patches and run affected examples. For instruction-only changes, check metadata,
links, and consistency; do not automatically launch agents or a full benchmark.
Use [evals/evals.json](evals/evals.json) for a requested review-behavior comparison,
under the same total delegation budget. Ordinary code reviews do not run this
skill's maintenance evaluations.
See [evals/README.md](evals/README.md). Keep snapshots/results outside every
skill-discovery root, for example `~/.agents/skill-workspaces/effect-review-v4`.
A backup containing `SKILL.md` under `~/.agents/skills` can be discovered as
another installed skill even when it is outside this skill's own directory.
