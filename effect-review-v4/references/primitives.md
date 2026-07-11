# Effect Primitives Checklist (v4)

Data modules, effectful iteration, concurrency/state tools, and HTTP. All
imported from the top-level `effect` namespace unless noted.

## 1. Effectful Iteration Uses `Effect.forEach` — With Explicit Concurrency

Any loop whose body runs an Effect per item uses `Effect.forEach` (or
`Effect.all`), and fan-out over external calls (DB, HTTP, upstream APIs) must
set an **explicit `concurrency`** bound.

```typescript
// GOOD
yield* Effect.forEach(users, (user) => sendNotification(user), { concurrency: 5 })
yield* Effect.forEach(batches, insertBatch, { concurrency: 3, discard: true })

// BAD — sequential yield* in a for-of (unless order-dependence is the point)
for (const user of users) {
  yield* sendNotification(user)
}

// BAD — Effect.all over a mapped array is just forEach with extra steps
yield* Effect.all(users.map((u) => sendNotification(u)))

// FLAG — unbounded fan-out over an external system
yield* Effect.forEach(orgs, pollOrg, { concurrency: "unbounded" })
```

**Pure data transforms are NOT in scope**: native `array.map` / `filter` /
`reduce` on plain data is fine — do not flag it or demand `Array` from
`effect` for pure code. Exception rule from `known-pitfalls.md` applies:
loops that early-return a value or accumulate-then-fail cannot become
`forEach`; converting them is behavior-risk.

`Array.filterMap` quirk: the callback returns a **`Result`**, not an `Option` —
pair it with `Schema.decodeUnknownResult(S)`, and wrap decoders in a lambda
(`(v) => decode(v)`) because `filterMap` passes the index as the second
argument, which collides with the decoder's `ParseOptions` parameter.

## 2. Concurrency & State Toolbox

- **Fire-and-forget** side effects are `.pipe(Effect.ignore, Effect.forkDetach)`
  — errors handled (ignored deliberately) *before* detaching. Flag a forked
  effect whose failures are neither handled nor ignored: they surface as
  unhandled fiber failures.

  ```typescript
  // GOOD
  yield* touchLastUsed(keyId).pipe(Effect.ignore, Effect.forkDetach)
  ```

- **Fork family**: `forkChild` (tied to the parent), `forkScoped` (tied to a
  Scope), `forkDetach` (daemon), `forkIn` (explicit scope). There is no
  `Effect.fork` in v4.
- **`Ref`** for effect-managed mutable state (accumulators, last-sync
  timestamps) instead of ad-hoc `let` captured across effects. A documented
  module-scoped memo `Map` (per-isolate cache with TTL + comment) is an
  accepted exception — see `known-pitfalls.md`.
- **`Deferred`** for single-flight / collapse-concurrent-computations.
- **`Semaphore.make(1)` / `Semaphore.makeUnsafe(1)` + `withPermits(1)`** (the
  standalone `Semaphore` module — there is no `Effect.makeSemaphore` in v4) for
  mutual-exclusion sections (e.g. token-refresh locks).
- **`Effect.acquireRelease` + `Effect.scoped`** for resources with cleanup;
  never manual open/close pairs.

## 3. HTTP — `HttpClient`, Never Raw `fetch` in Effect Code

Outbound HTTP from inside the Effect runtime uses `HttpClient` from
`effect/unstable/http` — not raw `fetch` wrapped in `Effect.tryPromise`, and
**never** a hand-rolled `AbortController` + `setTimeout`. HttpClient gives real
interruption (a timeout interrupts the fiber, which aborts the in-flight
fetch), composable retry/timeout, and typed `HttpClientError`.

```typescript
// GOOD — the canonical shape
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"

const exec = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const req = HttpClientRequest.post(url, { headers }).pipe(HttpClientRequest.bodyText(body))
  const res = yield* client.execute(req)      // does NOT fail on non-2xx — check res.status
  return { status: res.status, text: yield* res.text }
}).pipe(
  Effect.mapError(toUpstreamError),           // transport error → domain error (retryable)
  Effect.flatMap(mapStatusToError),           // status → success | domain error (retryable vs terminal)
  Effect.timeoutOrElse({ duration: Duration.seconds(10), orElse: () => Effect.fail(timeoutError) }),
  Effect.retry({
    schedule: Schedule.exponential("100 millis", 2).pipe(Schedule.both(Schedule.recurs(2))),
    while: isRetryableUpstream,
  }),
  Effect.provide(FetchHttpClient.layer),      // uses globalThis.fetch + passes the interruption signal
)

// BAD
const res = yield* Effect.tryPromise({ try: () => fetch(url), catch: ... })
// BAD — hand-rolled cancellation
const controller = new AbortController()
setTimeout(() => controller.abort(), 10_000)
```

Notes:
- v4 has **no `Effect.timeoutFail`** — the shape is `Effect.timeoutOrElse({ duration, orElse })`.
- Exceptions (do not flag — see `known-pitfalls.md`): vendor-SDK driver
  wrappers, non-Effect runtimes (e.g. serverless Workflow steps), and
  injectable `fetch` ports that exist for test-swapping.
- Testing: provide the fetch via `Effect.provideService(FetchHttpClient.Fetch, impl)`
  — see `test-patterns.md`.

## 4. `Match` Over `switch` in Effect Code

Match on discriminated unions or string literals with `Match.value` /
`Match.type` and `Match.exhaustive` so new cases are caught at compile time.

```typescript
// GOOD
import { Match } from "effect"
const label = Match.value(status).pipe(
  Match.when("draft", () => "Draft" as const),
  Match.when("published", () => "Live" as const),
  Match.exhaustive,
)

// BAD — in Effect service/dispatch code
switch (status) {
  case "draft": return "Draft"
  case "published": return "Live"
}
```

Scope: flag `switch` in Effect services/dispatchers. `switch` in plain UI
components or non-Effect utilities is fine.

## 5. `Option` Over `null` / `undefined`

In Effect services, repositories, and domain types, model absence with
`Option<T>` and consume it with `Option.match` / `map` / `getOrElse` — not `?.`
chains or `??`.

```typescript
// GOOD
import { Option } from "effect"
const name = Option.match(user.displayName, {
  onNone: () => "Anonymous",
  onSome: (n) => n,
})
const maybe = Option.fromNullishOr(row.deleted_at, null)
```

`?.` and `??` are fine in React components and plain non-Effect utilities; flag
them only in Effect services, repositories, and handlers.

`Effect.serviceOption(Service)` is the graceful-degradation idiom when a layer
may legitimately be absent — not a smell.
