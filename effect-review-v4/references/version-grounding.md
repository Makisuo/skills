# Version and repository grounding

## GROUND-1 — Resolve what executes

Record review root, package/workspace, exact Effect and companion versions,
relevant compiler options, platform, and runtime owner. Resolve from the
package being reviewed: a monorepo can contain multiple Effect copies. Read
lockfile/catalog entries and package-manager patches or overrides.

Use this evidence order:

1. Applicable user and repository requirements determine intended behavior.
2. Installed public exports/declarations and actual patched execution files
   determine which API and runtime behavior are available.
3. Matching vendored source/tests explain semantics; check their version and
   account for patches that changed only compiled output.
4. Exact-version upstream source/docs fill gaps. Current upstream main and
   remembered v3/beta APIs do not prove availability in the reviewed project.

If dependencies are absent, inspect the lockfile and version-specific upstream
source; state that local execution was unavailable. Do not install or upgrade
a dependency solely to make an example work. If versions disagree, narrow the
claim or leave it unresolved until the implementation is identified.

The example baseline is `effect` and `@effect/vitest` **4.0.0-rc.111**, not a claim
that every v4 release has the same API. Historical effect-smol is archived;
current v4 development moved to `Effect-TS/effect`.
[Upstream notice](https://github.com/Effect-TS/effect-smol#effect-v4-has-moved).

## GROUND-2 — Separate API, semantics, and policy

An exported API is not automatically the best design. A preferred house style
is not an upstream requirement. For example:

- rc.111 exports `Schema.TaggedError`; `Schema.TaggedErrorClass` is absent.
  Generic Effect still supports `Data.TaggedError`.
- Maple's current instructions require schema-backed **new expected failures**,
  including internal ones. Load that policy from its current `CLAUDE.md`; do
  not use legacy Data errors as permission to add more, and do not demand a
  repository-wide migration unless requested.
- `Effect.try` supports a thunk and an options object. Specific domain mapping
  is a reason to prefer the latter, not proof that the former is invalid.
- `Context.Reference` and `Effect.whileLoop` exist in the example baseline.
  `Effect.fork`, `Effect.iterate`, `Effect.loop`, `Schedule.both`, and
  `it.scoped` are absent there. Recheck before claiming absence elsewhere.
- `FileSystem.FileSystem` is correct after a namespace import. A named import
  of the service permits bare `FileSystem`. Inspect imports before renaming.

Find the actual export and relevant overload/implementation. Grepping one name
is insufficient to prove memoization, cancellation, or encoding semantics.
Use an executable counterexample when declarations alone cannot settle it.

## GROUND-3 — Load applicable conventions

Read root and nested `AGENTS.md`/`CLAUDE.md`, contributing/package guidance,
relevant invoked skills, and comments near the changed behavior. Summarize only
applicable requirements and retain provenance. In Maple this may include
error/domain contracts, query execution boundaries, telemetry, invocation-owned
DB connections, test runner requirements, and `lib/` independence.

Locate current paths instead of freezing a project snapshot into this skill.
Do not introduce Maple imports into an independent library. Changes to schema
optionality, envelopes, instrumentation, or runtime ownership need consumer-level
evidence even when a local style rule favors the change.

## GROUND-4 — Separate discovery from coverage

The inventory helper uses git and excludes common generated/vendor trees. It
keeps index/config/TSX/test files and non-ignored untracked source in repository
and working-change modes. Inspect
its exclusions; explicit user scope overrides defaults. Include non-code
contracts, patches, manifests, and platform configuration as evidence when they
matter. A listed file has not yet been reviewed.

For diffs, use the actual PR base or explicitly resolved branch merge-base.
Read deleted/renamed code from git as needed. Do not substitute the last commit
for an empty working tree. For an explicit review outside git, read supplied
files directly; git tooling is a convenience, not a blocker.
