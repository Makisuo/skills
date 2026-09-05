# Resources, fibers, and shared state

Review ownership before recommending a primitive. Trace acquisition, last consumer, and release; identify the owning scope, fiber, runtime, request, or host. [runtime-semantics.test.ts](../examples/runtime-semantics.test.ts) exercises cleanup/cancellation regressions.

## LIFE-01 — Pair acquisition with the correct lifetime

**Correctness.** Consider `acquireRelease` for scope-owned resources, `acquireUseRelease` for a bracketed operation, and `acquireDisposable` for supported disposal protocols. `ensuring`, `onExit`, and `onInterrupt` address different cleanup points. A resource returned from an already-closed scope is invalid even when acquisition uses the right primitive.

Verify release on success, typed failure, defect, and interruption; acquisition failure before registration; partial acquisition; cleanup order; and remaining consumers. rc.111 `acquireRelease` protects acquisition by default and permits an interruptible option. Choose from the partial-acquisition contract, not to silence timeout behavior. Its finalizer requires an infallible typed channel: decide deliberately how cleanup failures surface instead of hiding them.

**Proof required:** every consumer and the event closing its owner; reproduce premature release or missing cleanup. Existing request/connection helpers may encode platform constraints a generic bracket does not.

## LIFE-02 — Own background work and observe its outcome

| Need | Candidate | Ownership consequence |
| --- | --- | --- |
| Work ends with parent | `forkChild` | Parent termination interrupts child; join/await when completion matters. |
| Work ends with current scope | `forkScoped` | Scope closure interrupts it; identify the supplied scope. |
| Explicit lifetime owner | `forkIn` | Supplied scope owns interruption. |
| Wait for required child work | Traversal or `awaitAllChildren` where appropriate | Verify the enclosing operation waits for completion. |
| Intentionally independent work | Justified `forkDetach` | Parent no longer owns it; host survival is not guaranteed. |

**Correctness.** There is no default `ignore` + `forkDetach` recipe. Detaching preserves neither a request, database connection, isolate, nor exporter lifetime. Use the host lifecycle bridge or existing application helper where required. `Fiber.join` observes failure; `Fiber.await` captures Exit. Lack of ignore inside a body does not prove an unhandled failure.

**Proof required:** owner, last resource use, cancellation path, and failure observer. Distinguish disposable best-effort work from required durable work. `ignore` handles expected failures; `ignoreCause` is broader and needs justification. See [errors-and-cause.md](errors-and-cause.md).

## LIFE-03 — Synchronize shared transitions, not every variable

**Correctness / optional simplification.** Generator-local variables are appropriate for per-execution state. For shared state, use `Ref.modify`/atomic pure updates for pure transitions. `Ref.get`, yielded work, then `Ref.set` can lose updates. Consider `SynchronizedRef.modifyEffect` for serialized effectful transitions or Semaphore for a broader critical section. Release permits on every outcome, avoid reentrant deadlocks, and bound work performed under a permit.

**Proof required:** two actual concurrent writers/readers and a violating interleaving. Replacing a local `let` with Ref is not a correctness fix. rc.111 semaphore constructors live in the Semaphore module, not `Effect.makeSemaphore`.

## LIFE-04 — Prefer complete cache behavior to partial single-flight

**Correctness / optional simplification.** Deferred is one-shot coordination, not a complete cache. Producers must complete or release waiters on success, failure, defect, and interruption; interrupted callers must not strand entries. Evaluate Cache, ScopedCache, and `Effect.cached*` before assembling a Map of Deferreds. Check failure caching, in-flight ownership, capacity/TTL, invalidation, tenant/auth keys, and resource release.

**Proof required:** a stuck waiter, stale failure, capacity leak, resource escape, or cross-tenant key collision. A bounded per-process Map may be appropriate. Verify invariants; neither a comment nor conversion to Ref proves correctness.

## LIFE-05 — Bound queues and streaming work

**Correctness / optional simplification.** Queue distributes work to consumers; PubSub distributes to subscribers. Choose capacity and backpressure/drop/slide behavior deliberately. Verify shutdown, subscription cleanup, stalled producers/consumers, and interruption. Stream/Sink can preserve backpressure and cleanup for long-lived or unbounded sources. Do not buffer an unbounded source just to use array traversal.

**Proof required:** producer/consumer rates, memory/loss requirement, or missing shutdown. Small bounded arrays need no queues/streams. Capacity alone does not guarantee throughput or durability.

**rc.111 source anchors:** `Effect.ts` (`acquireRelease`, `acquireUseRelease`, `acquireDisposable`, `onExit`, `forkChild`, `forkScoped`, `forkIn`, `forkDetach`, `awaitAllChildren`); `Fiber.ts` (`join`, `await`, `interrupt`); Ref, SynchronizedRef, Semaphore, Deferred, Cache, ScopedCache, Queue, and PubSub modules. Verify signatures, finalizers, and host constraints against the reviewed installation.
