# Error contracts and Cause

Review the path from input or foreign operation to its caller and public boundary. Identify the outcome that changed, not merely a preferred error class. Complete examples live in [errors-and-http.ts](../examples/errors-and-http.ts); regressions in [runtime-semantics.test.ts](../examples/runtime-semantics.test.ts). Apply [version-grounding.md](version-grounding.md) before recommending APIs.

## ERR-01 — Classify failure before choosing a constructor

**Correctness.** Expected failures belong in `E`; defects represent unexpected bugs or violated invariants; interruption represents cancellation. `Effect.sync` and `Effect.promise` turn thrown/rejected values into defects. `Effect.try` / `tryPromise` can map expected foreign failures deliberately. Both thunk and options forms exist in rc.111; the options form constructs a specific error. Preserve laziness and pass the supplied signal to cancellable Promise APIs.

**Proof required:** identify the operation, constructor, and caller whose recovery or retry depends on the distinction. `E = never` does not exclude defects or interruption. A trusted invariant may intentionally use `orDie`; fallible request validation should not become a defect merely to simplify its type. See [schema.md](schema.md) for raw decoding versus typed construction.

## ERR-02 — Express the error contract and follow repository policy

**Correctness / repository policy.** rc.111 exports `Schema.TaggedError`, not `Schema.TaggedErrorClass`. `Data.TaggedError` remains a valid upstream API; schema-backed errors add validation and serialization. Read repository policy before choosing. Neither “all internal errors must use Data” nor “all Effect code must use Schema” is universal.

Give expected failures stable discriminants and useful context. Preserve valid branded identifiers; rejected undecodable input remains explicitly raw input. `Schema.Defect()` can carry an unknown cause; retaining internal context does not imply publishing it to clients. Avoid fields that shadow inherited members such as `pipe`.

**Current Maple policy, only when reviewing Maple:** new expected failures, including internal failures, use namespaced `Schema.TaggedError`, `message`, useful schema-backed context, and `Schema.Defect()` for unknown causes. Public failures belong in the domain contract and retain their tags to the existing boundary mapper. Existing Data errors are legacy, not a mandate for mass migration. Re-read current repository instructions; do not import Maple types into standalone libraries.

**Proof required:** show the serialization, dispatch, or repository-policy requirement. Generic adapters quantifying over `E` are valid. For concrete service contracts, investigate `Error`, `unknown`, stringification, or casts that erase recoverable distinctions.

## ERR-03 — Separate observation, translation, and recovery

| Intent | Consider | Contract to verify |
| --- | --- | --- |
| Observe expected failure | `tapError`, `tapErrorTag` | Original failure continues if the observer succeeds. |
| Observe defects or full cause | `tapDefect` for defects; `tapCause` for the full Cause | Preserve failure category/cause; account for observer failure. |
| Translate expected failure | `mapError` | Retain useful context and the declared boundary contract. |
| Selectively recover/remap | `catchTag`, `catchTags`, predicates/filters, `catchReason`, `catchReasons` | Handle intended variants; unmatched errors continue. Nested-reason handlers preserve the parent shape for unmatched reasons. |
| Recover every expected failure | `catch` | A real fallback covers every member of `E`. |
| Recover defects/full causes | `catchDefect`, `catchCause` | An explicit boundary or isolation policy justifies recovery; inspect interruption too. |

**Correctness.** A log-only `catch` / `catchCause` converts failure to success. Use observation when propagation is intended. An observer may itself fail: decide whether that failure propagates or is handled locally. Do not swallow the main operation to make logging best-effort.

**Proof required:** trace resulting `A`/`E` and its consumer. Deliberate fallbacks are valid. Narrowing existing catches can expose previously handled errors: audit callers before recommending it. Cancellation is not an ordinary successful fallback by default.

## ERR-04 — Preserve meaning across boundaries

**Correctness.** An unavailable database is not evidence of not-found. Confirmed absence may be an `Option` or a specific domain failure. Transport-specific errors are useful inside adapters; translate where the domain contract requires it. Do not erase distinct public failures into a generic response before the existing HTTP/RPC envelope handles them.

Retry disposition may use distinct tags, a typed nested reason, or a predicate. A class per disposition is optional. Inspect idempotency, status handling, decoding, and cancellation before treating every driver error as transient; see [primitives.md](primitives.md).

**Proof required:** identify the source outcome, mapping, public response, and consumer expectation. Require status annotations only when the framework/repository consumes them. HTTP status, domain failure, and telemetry classification are separate contracts; see [observability.md](observability.md).

## ERR-05 — Handle complete outcomes deliberately

| Operation | Typed failure | Defect / interruption |
| --- | --- | --- |
| `Effect.result` | Becomes `Result.Failure` | Still fails the Effect. |
| `Effect.exit` | Captured in `Exit.Failure` | Captured as cause reasons. |
| `Effect.ignore` | Discarded | Not generally suppressed. |
| `Effect.ignoreCause` | Discarded | Broader suppression needs an explicit policy. |

V4 Cause has a flat `reasons` array of `Fail`, `Die`, and `Interrupt`; it is not a Sequential/Parallel tree. Use available Cause/Exit predicates and extractors. Inspect all relevant reasons in mixed causes; the first error need not describe the whole failure. `Cause.squash` is lossy presentation, not proof of a typed failure.

**Proof required:** distinguish `Effect.fail(error)` from `Effect.die(error)` and cancellation in outcome tests. Assert category before tag/context; `Exit.findErrorOption` extracts expected failures. `return yield* error` helps generator control-flow narrowing; missing `return` warrants a finding when typing or subsequent behavior is affected.

**rc.111 source anchors:** `Schema.ts` (`TaggedError`, `Defect`); `Effect.ts` (`try`, `promise`, `tryPromise`, `mapError`, `tapError`, `tapCause`, `catch*`, `result`, `exit`, `ignore`, `ignoreCause`); `Cause.ts` (`Reason`); `Exit.ts` (`findErrorOption`). Recheck declarations and patched implementations on another release.
