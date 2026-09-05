# Selecting Effect primitives

Ask whether an existing primitive removes custom cancellation, coordination, scheduling, or error handling while preserving the contract. Name that benefit in the recommendation. More Effect symbols are not a quality metric. For ownership/shared state, read [resources-concurrency.md](resources-concurrency.md).

## PRIM-01 — Adapt HTTP through the existing client boundary

**Correctness / optional simplification.** Consider injected `HttpClient` from `effect/unstable/http` before building another fetch wrapper. `FetchHttpClient.layer` supplies the implementation; `FetchHttpClient.Fetch` allows test transport substitution. `client.execute` does not automatically reject non-2xx: inspect status or apply the appropriate status filter. Consume/decode the response within its lifetime; `HttpClient.withScope` can bind the request to an attempt scope.

Preserve transport, status, and decoding distinctions. Malformed bodies are not automatically transient. Prefer existing domain adapters over mapping errors at every caller. Evaluate available `HttpClient.retryTransient` and status helpers before inventing policy; verify how they handle responses, reasons, and attempt limits.

**Proof required:** trace status/body handling and cancellation through the actual client and patches. Raw fetch can be valid in host/SDK adapters and injectable ports. A signal-aware `tryPromise` can cancel a cooperating API; replacing it just for syntax is optional. Inspect custom controllers/timers for cleanup and signal propagation rather than flagging them automatically.

[errors-and-http.ts](../examples/errors-and-http.ts) is a complete injected-client example with schema errors, scoped response use, bounded idempotent GET retry, and attempt/total deadlines. The reusable function does not install its own client/runtime.

## PRIM-02 — Review retry and deadlines together

**Correctness.** `retry` reruns typed failures; `repeat` schedules successful executions. Check retry scope, eligible failures, idempotency, body replayability, duplicate retries across layers, backoff/jitter, rate-limit instructions, and total budget. Recovery before retry can erase the failure that should trigger it.

In rc.111 use a supported Schedule and bounded `times` or `Schedule.upTo`; `Schedule.both` is absent. Two retries allow three total executions. Attempt timeout inside retry does not impose a total deadline: the outer timeout must include attempts and backoff. Timeout interrupts Effect work; the external API must cooperate, and uninterruptible cleanup can delay completion. Do not promise a strict wall-clock bound without checking those constraints.

**Proof required:** demonstrate attempts, controlled elapsed time, terminal behavior, and cancellation/cleanup. Use `TestClock` where the Effect clock is observed. Adding/removing retries or timeout changes behavior. Do not retry non-idempotent writes just because failure appears transient. Honor upstream Retry-After when relevant, or explain the integration's bounded local policy.

## PRIM-03 — Preserve iteration semantics

**Correctness / optional simplification.** `forEach` expresses effectful traversal; `all` combines collections or structured groups. Both can be appropriate. `forEach` defaults to sequential execution: omitted concurrency is not unbounded fan-out. Bound deliberate parallel calls by downstream capacity. Check order, fail-fast behavior, sibling cancellation, retained results, and whether every item needs an outcome. Consider `discard: true` when results are unused.

Imperative loops are valid for sequential work, early return, pagination, and accumulation. Pure array transforms need no Effect wrapper. In rc.111 `Array.filterMap` consumes Result; wrap a schema result decoder in a one-argument adapter so the index is not passed as parse options.

**Proof required:** a dependency/order or load problem, plus preservation of termination/error behavior. “Mapped Effect.all” and “for-of inside a generator” alone are not blocking findings.

## PRIM-04 — Represent values at their appropriate boundary

**Optional simplification / correctness when a contract breaks.** Option can express domain absence, Result synchronous success/failure, and Match checked branching. Native `?.`, `??`, guards, and exhaustive switches are valid. Preserve absent/undefined/null distinctions through schema adapters; do not change JSON/driver contracts for style. `Option.fromNullishOr(value)` takes one argument in rc.111.

`Effect.serviceOption` suits genuinely optional capabilities. It is unsafe when absence silently disables mandatory auth, tenant isolation, or required config. `Context.Reference` defaults must be intentionally safe; availability of a default mechanism does not justify one.

**Proof required:** the missing case, invalid absence assumption, or unsafe default. Otherwise describe only the optional readability benefit.

## PRIM-05 — Reuse capabilities before adding abstractions

**Optional simplification.** Consider Clock, DateTime, Random, Config, ConfigProvider, and Redacted for their respective concerns; check existing repository adapters first. Cache/scoped caches or Request/RequestResolver can express TTL, in-flight sharing, and batching. Stream/Sink can preserve backpressure and avoid buffering large sources; small finite arrays rarely need streaming machinery.

**Proof required:** identify duplicated behavior and the lifetime, failure, tenant-key, or performance semantics the primitive must preserve. Load optional modules only for relevant code, verify their APIs, and avoid bringing platform-only dependencies into a portable public barrel.

**rc.111 source anchors:** `unstable/http/HttpClient.ts` (`withScope`, `retryTransient`, status filters); `FetchHttpClient.ts` (`Fetch`, `layer`); `Effect.ts` (`retry`, `repeat`, `timeoutOrElse`, `forEach`, `serviceOption`); `Schedule.ts` (`exponential`, `upTo`); `Array.ts` (`filterMap`); `Option.ts` (`fromNullishOr`).
