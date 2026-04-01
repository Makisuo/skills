# Test Patterns Checklist

## 1. Use @effect/vitest

Always import from `@effect/vitest`, never plain `vitest`. It re-exports all standard vitest functions.

```typescript
// GOOD
import { it, describe, expect } from "@effect/vitest"

// BAD
import { it, describe, expect } from "vitest"
```

## 2. it.layer() for Test Setup

Use `it.layer(TestLayer)((it) => { ... })` for providing test dependencies. Never use `beforeAll`/`afterAll` for Effect service setup.

```typescript
// GOOD
const TestLayer = Layer.mergeAll(DatabaseTest, ServiceTest)

it.layer(TestLayer)((it) => {
  describe("findById", () => {
    it.scoped("returns project when found", () =>
      Effect.gen(function* () {
        const service = yield* MyService
        // ...
      })
    )
  })
})

// BAD
let service: MyService
beforeAll(async () => {
  service = await setupService()
})
afterAll(async () => {
  await teardown()
})
```

## 3. it.scoped for Individual Tests

Inside an `it.layer()` block, use `it.scoped` for tests that need automatic resource cleanup.

```typescript
// GOOD
it.scoped("creates and cleans up", () =>
  Effect.gen(function* () {
    const org = yield* createTestOrganization()
    // org cleanup happens automatically via scope
  })
)
```

## 4. Effect.either for Error Testing

Use `Effect.either` + `Either.isLeft()` to test error cases. Never use try/catch or `.catch()`.

```typescript
// GOOD
it.scoped("fails for invalid id", () =>
  Effect.gen(function* () {
    const result = yield* service.findById(invalidId).pipe(Effect.either)
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ResourceNotFound")
    }
  })
)

// BAD
it("fails for invalid id", async () => {
  try {
    await service.findById(invalidId)
    fail("should have thrown")
  } catch (e) {
    expect(e).toBeInstanceOf(NotFoundError)
  }
})
```

## 5. Factory Functions for Test Data

Use factory functions from `test/testFactories.ts` or local helpers. Don't inline large object literals.

```typescript
// GOOD
const org = yield* createTestOrganization()
const app = yield* createTestApplication(org.id)
const paywall = yield* createTestPaywall(app.id)

// BAD
const org = { id: 1, name: "test", createdAt: new Date(), ... }
```

## 6. it.scoped.each for Parameterized Tests

Use `.each` for testing multiple cases with the same logic.

```typescript
// GOOD
it.scoped.each([
  { platform: "ios", expected: "IOS" },
  { platform: "android", expected: "ANDROID" },
])("maps $platform correctly", ({ platform, expected }) =>
  Effect.gen(function* () {
    const result = yield* mapPlatform(platform)
    expect(result).toBe(expected)
  })
)
```

## 7. Test Layer Composition

Use `DefaultWithoutDependencies` or `.Default.pipe(Layer.provide(...))` for test layers.

```typescript
// GOOD
const TestLayer = MyService.Default.pipe(
  Layer.provide(MockRepository.Test),
  Layer.provide(DatabaseTest)
)

// Also GOOD
const TestLayer = Layer.mergeAll(
  MyService.Default,
  MockRepository.Test
).pipe(Layer.provide(DatabaseTest))
```

## 8. Coverage Assessment

When reviewing, check:
- New service methods have corresponding test cases
- Error paths are tested (not just happy path)
- Edge cases are covered (empty arrays, null values, boundary conditions)
- New error types are tested with `Effect.either` pattern
- Both success and failure scenarios for each public method
