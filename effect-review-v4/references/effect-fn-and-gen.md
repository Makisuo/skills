# Effect functions and construction

Read [errors-and-cause.md](errors-and-cause.md) for outcomes and [resources-concurrency.md](resources-concurrency.md) for lifetime. Syntax alone is not a correctness finding.

## FN-01 — Choose a function boundary intentionally

**Optional simplification / observability policy.** In rc.111:

| Form | Stack boundary | New span |
| --- | --- | --- |
| `Effect.fn("operation")(body, ...transforms)` | Yes | Yes |
| `Effect.fn(body, ...transforms)` | Yes | No |
| `Effect.fnUntraced(body, ...transforms)` | No | No |

Use a readable operation name where the span is useful; `Service.method` is a convention, not an API requirement. Consider hot-path span volume. A simple Effect-returning function, reusable Effect value, short combinator chain, or function factory may be clearer than a generator wrapper. Do not require an extra boundary merely because a function returns Effect.

**Proof required:** a trace/stack requirement or concrete simplification. Adding spans changes volume; removing/renaming spans can affect consumers. Verify those risks rather than calling wrappers cosmetic.

## FN-02 — Compose the Effect, not the function value

**Correctness.** `Effect.fn` transforms receive `(effect, ...originalArguments)`. They attach behavior while retaining inputs. `.pipe` on the returned function is not `.pipe` on an Effect; `f(input).pipe(...)` is valid call-site composition. A standalone `Effect.gen` also supports `.pipe`.

Observation and recovery differ: adding a log-only `catch` changes failure to successful `void`. Use `tapError`/`tapCause` where failure must continue. Generator style helps branching and dependent steps; short combinators remain appropriate.

**Proof required:** the value/type at the composition site and changed outcome. Where annotation is necessary, use a verified signature such as `Effect.fn.Return<A, E, R>`, not an unchecked cast.

## FN-03 — Preserve laziness at external boundaries

**Correctness.** Side effects should occur when work runs. `sync` captures synchronous work, `suspend` defers construction, `try` maps expected throws, and `tryPromise` bridges rejectable APIs. `promise` is for operations whose rejection should be a defect. Pass supplied abort signals to cooperating APIs. Callback adapters must complete once and release listeners on interruption.

`async` or `try/catch` at a host/SDK bridge is not automatically wrong. Inspect cancellation, laziness, expected failure typing, and runtime context. Running an Effect back to Promise inside domain code can bypass the caller's scope/services; investigate the boundary instead of banning keywords. Generator-local `try/catch` does not replace Effect error handling for yielded failures.

**Proof required:** trace when work starts, how exceptions enter the program, and what cancellation stops. The injected HTTP example is in [errors-and-http.ts](../examples/errors-and-http.ts).

## FN-04 — Preserve control flow and testable capabilities

**Correctness / optional simplification.** Use `return yield*` for terminal failures when TypeScript needs to see the branch end. Early-return pagination and accumulator loops may remain imperative. rc.111 also provides `whileLoop`, `findFirst`, and `repeat`; `iterate` and `loop` are absent in this checked release. Do not infer that every loop requires replacement.

Use clock/time/random/config capabilities when those inputs need control. Reading current time differs from converting a supplied timestamp: `new Date(milliseconds)` is not a clock read. Respect repository database-conversion helpers. Native time in actual host glue can be appropriate.

**Proof required:** an observable determinism, control-flow, testability, or boundary issue. Generator-local mutation and exhaustive switches need no explanatory comment.

## FN-05 — Verify imports and the actual release

**Correctness.** rc.111 accepts both `Effect.try(thunk)` and options. `Effect.gen({ self: this }, body)` is the current bound-generator form. Core platform services live in `effect/FileSystem` and `effect/Path`; namespace imports use `FileSystem.FileSystem` / `Path.Path`, while named imports of those service exports use a bare identifier. A module namespace is not a service.

**Proof required:** complete imports, installed declarations, and a compiling replacement. Use [version-grounding.md](version-grounding.md), not a remembered v4 rename list.

**rc.111 source anchors:** `Effect.ts` (`fn`, `fnUntraced`, `gen`, `whileLoop`, `try`, `promise`, `callback`); `FileSystem.ts` (`FileSystem`); `Path.ts` (`Path`). Revalidate after version/patch changes.
