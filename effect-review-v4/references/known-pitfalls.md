# Known Pitfalls — Do-Not-Flag Idioms & Risky Fixes (v4)

Lessons from past Effect v4 reviews of real codebases. Two of those reviews
produced fixes that broke production and were reverted; several more flagged
deliberate workarounds as defects. **Every reviewer and verifier reads this
file.** When in doubt between this file and a generic checklist rule, this file
wins.

## Part 1 — Do NOT flag (verified-intentional idioms)

1. **`satisfies Shape` instead of `Self.of(...)` inside an inline `make`.**
   Calling `X.of()` inside a `Context.Service`'s inline `make` option triggers
   `TS2506: 'X' is referenced directly or indirectly in its own base
   expression`. `return { ... } satisfies XxxShape` is the correct idiom there.
   Do not "correct" it to `.of()`.

2. **Imperative `while (true)` loops for cursor pagination, CAS-retry,
   poll-until-hit, or accumulate-then-fail.** The v4 beta ships neither
   `Effect.iterate` nor `Effect.loop`, and `Effect.forEach` cannot express
   return-early-with-value. A `while` loop driving sequential `yield*`s (ideally
   with a comment) is the accepted form. Never recommend `Effect.iterate` /
   `Effect.loop` — they do not exist.

3. **Dynamic `import()` at serverless entrypoints** (e.g. Cloudflare Worker
   `worker.ts`, Workflow shells). Eagerly importing a large Schema-heavy module
   graph at module scope blows startup CPU budgets (CF error 10021). Lazy
   imports there are load-bearing, not style debt.

4. **Raw `fetch` at vendor-driver boundaries, injectable fetch ports, and
   non-Effect runtimes.** The "use HttpClient" rule applies to code running
   inside the Effect runtime. Vendor-SDK wrappers (the one file allowed to
   import drivers), CF Workflow `run` steps, and `(url, init) => Promise`
   ports injected for testability legitimately use raw `fetch`.

5. **`Data.TaggedError` for internal (non-wire) errors.** The split is by
   purpose: `Schema.TaggedErrorClass` for errors that cross a serialization
   boundary (HTTP contracts), `Data.TaggedError` for internal plumbing. Don't
   flag internal errors as "should be schema-backed".

6. **`Metric.*` instruments defined but not exported.** Check the repo's
   telemetry setup first — some SDKs deliberately export traces + logs only.
   Defined-but-unexported metrics may be intentional (span attributes carry the
   observability instead).

7. **Documented module-scoped mutable memo `Map`s** (in-isolate caches with a
   TTL and an explanatory comment). `Ref` is for effect-managed state; a
   per-isolate memo across requests is a legitimate use of module state.

8. **Plain `vitest` for pure/React/DOM tests.** `@effect/vitest` is required
   only for tests that run Effects, need layers, or use `TestClock`. Don't
   demand `it.effect` for a pure formatting-function test.

9. **Bare `Atom.make` for static values, local UI state, or effects that don't
   use the app's API client.** The shared-AtomRuntime rule (see
   `effect-atom.md`) applies to atoms whose spans must reach the app's tracer.
   A toggle atom or a server-function-backed atom is fine bare.

10. **`?.` and `??` in React components and plain non-Effect utilities.**
    `Option` is for Effect services, repositories, and domain types.

11. **`Date.now()` / `new Date()` outside the Effect runtime** — top-level
    non-Effect glue (raw worker handlers, plain scripts, diagnostics timing).
    The `Clock` rule applies inside Effect code.

12. **Barrel-vs-subpath import discipline.** Some packages' barrels statically
    import platform-only modules (e.g. `cloudflare:workers`) and are
    deliberately imported only by true entrypoints, with everything else using
    subpath exports. Don't flag subpath imports as "inconsistent" or suggest
    consolidating onto the barrel.

13. **Static accessors delegating via `this.use((s) => s.method(...))`.** This
    is an accepted convenience convention. What v4 removed is the *auto-generated
    accessor proxy* (`Service.method(...)` without `.use`).

14. **Anything carrying an explanatory comment** — a workaround note (TS2506,
    bundler, platform budget), "don't change this", "deliberately", a linked
    issue. Treat as intentional; at most report Info acknowledging the comment.

## Part 2 — Risky-fix taxonomy (behavior-risk; verify before recommending)

These fixes look mechanical but can change runtime behavior. A finding whose
fix falls in this list must be labeled `behavior-risk`, must name the
construction/call sites it touches, and must survive verification before it
appears above Info severity.

1. **`Schema.optional` ↔ `Schema.optionalKey` changes.** `optionalKey` rejects
   a *present-but-`undefined`* value; `optional` accepts it. TypeScript does
   NOT catch the difference when `exactOptionalPropertyTypes` is off — the
   break is runtime-only, at every JS construction/encode site that can pass
   `undefined`. A mass `optional → optionalKey` "convention cleanup" was
   applied by this skill's reviews **twice and reverted twice** after breaking
   production dashboards. Rule of thumb: decode-only schemas may flip; anything
   constructed from JS must not, unless every call site is audited.

2. **`decodeUnknownSync` → `decodeUnknownEffect` swaps (and vice versa).**
   Changes where and how failures surface (thrown defect vs typed error
   channel), which callers may rely on. Fine for new code; audit callers before
   converting existing code.

3. **Loop → `Effect.forEach` conversions.** Only safe when the loop body is a
   straight per-item effect. Loops that early-return a value, break on a
   condition, or accumulate state then fail cannot be expressed by `forEach` —
   converting silently changes semantics.

4. **Adding or removing timeout/retry.** `Effect.timeoutOrElse` + `Effect.retry`
   on a previously-unbounded call changes failure modes and latency; removing a
   hand-rolled AbortController without replacing the timeout drops cancellation
   entirely. Recommend the canonical HttpClient shape, but as behavior-risk.

5. **Span/instrumentation changes on hot paths.** Adding `Effect.fn` spans to
   per-request/per-row helpers multiplies span volume; removing spans breaks
   dashboards keyed on span names. Both directions are behavior-risk.

6. **Mass renames across construction sites** (e.g. renaming a schema field
   used at ~90 sites). Correct when the field shadows an Effect prototype
   member (`pipe`), but the finding must enumerate the blast radius and flag
   any dynamic/string-keyed access the rename would miss.

7. **`catch` / `catchTag` restructuring on existing flows.** Narrowing a broad
   `Effect.catch` to `catchTags` can surface previously-swallowed errors to
   callers; confirm the intended contract before recommending above Info.
