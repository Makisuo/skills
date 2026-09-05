---
name: effect-review-v4
description: >-
  Review Effect v4 code, including beta, RC, and release versions, for correct
  error propagation, resource ownership, cancellation, concurrency, primitive
  selection, services/layers, schemas, atoms, observability, and tests. Use for
  requests such as "effect v4 review", "review my Effect 4 changes", "check
  Effect patterns", or "audit the Effect codebase" when the project uses v4.
  Supports files, working changes, PR/branch diffs, and repository audits.
  Verify APIs against the installed version. For Effect v3 use effect-review.
metadata:
  version: "4.0.0"
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

## 3. Execute within available capabilities

Review locally for a focused change. For a large scope, optional subagents may
review independent, coherent subsystems, subject to host delegation rules and
available concurrency. Do not multiply every shard by every concern. Keep
cross-file integration and final verification with the coordinator.

Give each delegated reviewer the same scope, resolved versions/patches,
applicable conventions, relevant references, and finding format. Allow callers
outside assigned files to be read as evidence. Do not assume a particular tool
name, model, workflow engine, or unlimited slots. Without delegation, perform
the same passes sequentially and state any incomplete coverage.

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

When changing guidance or dependencies, verify affected source and patches,
run the examples, and compare review outputs on [evals/evals.json](evals/evals.json).
See [evals/README.md](evals/README.md). Keep snapshots/results outside every
skill-discovery root, for example `~/.agents/skill-workspaces/effect-review-v4`.
A backup containing `SKILL.md` under `~/.agents/skills` can be discovered as
another installed skill even when it is outside this skill's own directory.
