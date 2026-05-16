# Test Patterns Checklist (v4)

Effect code is tested with `@effect/vitest`.

## 1. Use `it.effect` for Effect-Based Tests

Run Effect tests with `it.effect`, not `Effect.runSync` / `runPromise` inside a
plain `it`. The body is an `Effect.gen` thunk.

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

## 2. Import `assert` / `describe` / `it` from `@effect/vitest`

Use `assert.*` inside Effect tests, not vitest's `expect`. Import all three from
`@effect/vitest`.

```typescript
// GOOD
import { assert, describe, it } from "@effect/vitest"
assert.strictEqual(actual, expected)
assert.deepStrictEqual(rows, expectedRows)

// BAD — expect in an Effect test
expect(actual).toBe(expected)
```

## 3. Provide Dependencies with `it.layer`

When tests share service dependencies, provide them once with `it.layer(...)`
instead of piping `Effect.provide` into every test.

```typescript
// GOOD
describe("OrgService", () => {
  it.layer(TestLayer)((it) => {
    it.effect("lists orgs", () =>
      Effect.gen(function* () {
        const service = yield* OrgService
        const orgs = yield* service.list()
        assert.strictEqual(orgs.length, 2)
      }),
    )
  })
})
```

## 4. `TestClock` for Time-Dependent Tests

Tests that depend on time use `TestClock` to advance the clock deterministically.
This pairs with the rule that production code reads time via `Clock`, never
`Date.now()`.

```typescript
// GOOD
it.effect("times out after 5s", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(slowEffect.pipe(Effect.timeout("5 seconds")))
    yield* TestClock.adjust("5 seconds")
    const exit = yield* Fiber.await(fiber)
    assert.isTrue(Exit.isFailure(exit))
  }),
)
```

## 5. Assess Coverage Gaps

When reviewing a diff, flag missing coverage:
- New public service methods with no test.
- Error paths (each tagged error a method can fail with) left untested.
- New branded-type validators / schema decoders without a decode/encode test.
