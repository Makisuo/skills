# Test Patterns Checklist (v4)

Effect-shaped code is tested with `@effect/vitest`. **Scope**: `@effect/vitest`
is for tests that run Effects, need layers, or use `TestClock`. Pure functions,
React components, and DOM tests correctly use plain `vitest` — do not flag
them.

## 1. `it.effect` vs `it.live` — the TestClock Split ⚠️

`it.effect` auto-provides a **TestClock**: time never advances on its own. That
makes it wrong for real-async tests — a real `Effect.timeout`, an exponential
retry schedule, or anything waiting on actual event-loop settling will hang or
mis-fire under `it.effect`.

- **Deterministic time-based logic** → `it.effect` + drive time with
  `TestClock.setTime` / `TestClock.adjust`.
- **Real timeouts / retry backoff / real async** → `it.live` (ideally with a
  comment saying why).

```typescript
// GOOD — deterministic
it.effect("escalates after 5s", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(slowEffect.pipe(Effect.timeout("5 seconds")))
    yield* TestClock.adjust("5 seconds")
    const exit = yield* Fiber.await(fiber)
    assert.isTrue(Exit.isFailure(exit))
  }),
)

// GOOD — real backoff needs the real clock
// Runs under it.live: the retry schedule uses real exponential backoff.
it.live("retries transient 503s twice", () => Effect.gen(function* () { ... }))
```

Flag: an `it.effect` test exercising a real `Effect.timeout` / `Effect.retry`
with an exponential schedule and no TestClock control. Also flag the reverse —
`it.live` used for logic that could be deterministic under TestClock.

`TestClock` lives in **`effect/testing`** (not a top-level export). Use
`it.scoped` for effects requiring a `Scope`.

## 2. Use `it.effect`, Not `runSync`/`runPromise` in Plain `it`

```typescript
// GOOD
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

describe("UserService", () => {
  it.effect("returns the user", () =>
    Effect.gen(function* () {
      const service = yield* UserService
      const user = yield* service.findById(id)
      assert.strictEqual(user.name, "Alice")
    }),
  )
})

// BAD — runSync inside a plain it
it("returns the user", () => {
  const user = Effect.runSync(UserService.findById(id))
  expect(user.name).toBe("Alice")
})
```

Use `assert.*` inside Effect tests (`assert.strictEqual`,
`assert.deepStrictEqual`, `assert.isTrue(Exit.isFailure(exit))`), imported from
`@effect/vitest` — not vitest's `expect`.

## 3. Provide Dependencies with Layers

- `it.layer(TestLayer)((it) => { ... })` when a block of tests shares one
  stateless layer.
- Otherwise a `makeLayer(...)` helper composing `Layer.provide` /
  `Layer.mergeAll` per test, with dependencies stubbed via
  `Layer.succeed(Service, stubShape)` (a hand-written object satisfying the
  service shape).
- Config is stubbed with `ConfigProvider.layer(ConfigProvider.fromUnknown({ ... }))`
  and the typed Env derived through the real Env layer
  (`Env.layer.pipe(Layer.provide(configLive))`) — so tests exercise the actual
  config decoding.

```typescript
// GOOD
const makeLayer = (testDb: TestDb) =>
  MyService.layer.pipe(
    Layer.provide(Layer.mergeAll(testDb.layer, Env.layer.pipe(Layer.provide(makeConfig())))),
    Layer.provide(Layer.succeed(WarehouseService, warehouseStub)),
  )
```

## 4. Test Databases — Embedded Layer + Cleanup

DB-backed tests use the repo's embedded test-DB helper (e.g. an in-memory
PGlite layer that applies the real migrations — maple:
`createTestDb()` in `apps/api/src/lib/test-pglite.ts`) rather than hand-rolled
Postgres/migration setups. Track created DBs and clean up in `afterEach`. Raw
SQL helpers take positional `$1` placeholders.

## 5. Stub HTTP by Providing `FetchHttpClient.Fetch`

Never mutate `globalThis.fetch` or `vi.stubGlobal("fetch", ...)` — the global
resolves non-deterministically across tests. Provide the fetch service
directly, returning **real `new Response(...)` objects** (HttpClient wraps the
response and needs real headers/body):

```typescript
// GOOD
const mockResponse = (body: string, status: number): Response => new Response(body, { status })
const makeFetch = (...responses: Response[]) => {
  let calls = 0
  const impl: typeof fetch = async () => responses[Math.min(calls++, responses.length - 1)]
  return { impl, callCount: () => calls }
}

effect.pipe(Effect.provideService(FetchHttpClient.Fetch, stub.impl))
// or in the layer graph:
Layer.mergeAll(makeLayer(testDb), Layer.succeed(FetchHttpClient.Fetch, stub.impl))
```

Retry-policy tests assert **both** the mapped error tag and the attempt count
(via the call-counting wrapper) — and run under `it.live` (see §1).

## 6. Branded-ID Fixtures Decode Through the Schema

Fixtures for branded ids are produced with
`Schema.decodeUnknownSync(BrandId)(literal)` where the literal is in the
brand's **real format** — a valid UUIDv4 shape (version nibble `4`, variant
nibble `8`) for UUID brands, the real prefix format for string brands. Never a
bare cast.

```typescript
// GOOD
const ruleId = Schema.decodeUnknownSync(AlertRuleId)("11111111-1111-4111-8111-111111111111")
const orgId = Schema.decodeUnknownSync(OrgId)("org_test_fixture")

// BAD — brand bypass, and "rule-1" would fail the isUUID check anyway
const ruleId = "rule-1" as AlertRuleId
```

## 7. Error Assertions

Extract errors from exits with `Exit.findErrorOption` (falling back to
`Cause.squash(exit.cause)`), and assert the **tagged `_tag`**, not the message
string:

```typescript
// GOOD
const exit = yield* Effect.exit(service.upsert(bad))
assert.isTrue(Exit.isFailure(exit))
const error = getError(exit)
assert.strictEqual(error._tag, "@myorg/http/errors/ValidationError")
```

## 8. Assess Coverage Gaps

When reviewing a diff, flag missing coverage:
- New public service methods with no test.
- Error paths (each tagged error a method can fail with) left untested —
  assert the tag AND the side-effect counts (fetch attempts, rows written),
  not just success/failure.
- New branded-type validators / schema decoders without a decode/encode test —
  especially round-trips for schemas that are both decoded and constructed
  (the `optionalKey` present-vs-absent distinction only surfaces in encode/
  construct tests).
- Retry/timeout policies without an attempt-count assertion.
