# Effect Testing Patterns

## Framework Selection

**CRITICAL**: Choose the correct testing framework based on the code being tested.

### Use @effect/vitest for Effect Code

Use `@effect/vitest` when testing:

- Functions that return `Effect<A, E, R>`
- Code that uses services and layers
- Time-dependent operations with TestClock
- Asynchronous operations coordinated with Effect
- STM (Software Transactional Memory) operations

```typescript
import { it, expect } from "@effect/vitest"
import { Effect } from "effect"

declare const fetchUser: (id: string) => Effect.Effect<{ id: string }, Error>

it.effect("should fetch user", () =>
  Effect.gen(function* () {
    const user = yield* fetchUser("123")
    expect(user.id).toBe("123")
  })
)
```

## Testing with Effect.gen

```typescript
import { it, expect, describe } from "@effect/vitest"
import { Effect } from "effect"

describe("User Service", () => {
  it.effect("should fetch user by ID", () =>
    Effect.gen(function* () {
      const user = yield* fetchUser("123").pipe(Effect.provide(TestLayer))
      expect(user.id).toBe("123")
      expect(user.name).toBe("Alice")
    })
  )
})
```

## Testing Success and Failure

```typescript
import { it, expect, describe } from "@effect/vitest"
import { Effect, Exit, Cause } from "effect"

describe("Validation", () => {
  it.effect("should succeed with valid email", () =>
    Effect.gen(function* () {
      const result = yield* validateEmail("alice@example.com")
      expect(result).toBe("alice@example.com")
    })
  )

  it.effect("should fail with invalid email", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(validateEmail("invalid"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause)
        expect(error._tag).toBe("ValidationError")
      }
    })
  )
})
```

## Mock Layers for Testing

### Creating Test Layers

```typescript
import { Context, Effect, Layer } from "effect"

interface UserRepository {
  findById: (id: string) => Effect.Effect<Option<User>, DbError, never>
  save: (user: User) => Effect.Effect<User, DbError, never>
}

const UserRepository = Context.GenericTag<UserRepository>("UserRepository")

// In-memory test implementation
const UserRepositoryTest = Layer.succeed(
  UserRepository,
  {
    findById: (id: string) =>
      Effect.succeed(
        id === "1"
          ? Option.some({ id: "1", name: "Alice", email: "alice@example.com" })
          : Option.none()
      ),

    save: (user: User) =>
      Effect.succeed(user)
  }
)

// Use in tests
const testProgram = Effect.gen(function* () {
  const repo = yield* UserRepository
  const user = yield* repo.findById("1")
  return user
}).pipe(
  Effect.provide(UserRepositoryTest)
)
```

### Stateful Mock Layers

```typescript
import { Context, Effect, Layer, Ref } from "effect"

// Mock with state
const UserRepositoryStateful = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const storage = yield* Ref.make<Map<string, User>>(new Map([
      ["1", { id: "1", name: "Alice", email: "alice@example.com" }]
    ]))

    return {
      findById: (id: string) =>
        storage.get.pipe(
          Effect.map((map) => {
            const user = map.get(id)
            return user ? Option.some(user) : Option.none()
          })
        ),

      save: (user: User) =>
        storage.update((map) => map.set(user.id, user)).pipe(
          Effect.map(() => user)
        )
    }
  })
)

// Test with state
import { it, expect, describe } from "@effect/vitest"
import { Option } from "effect"

describe("User Repository", () => {
  it.effect("should save and retrieve user", () =>
    Effect.gen(function* () {
      const repo = yield* UserRepository

      const newUser = { id: "2", name: "Bob", email: "bob@example.com" }
      yield* repo.save(newUser)

      const result = yield* repo.findById("2")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("Bob")
      }
    }).pipe(Effect.provide(UserRepositoryStateful))
  )
})
```

## Testing Error Scenarios

### Testing Expected Errors

```typescript
import { it, expect, describe } from "@effect/vitest"
import { Effect } from "effect"

describe("Error Handling", () => {
  it.effect("should handle NotFoundError", () =>
    Effect.gen(function* () {
      const result = yield* fetchUser("999").pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed({ id: "default", name: "Guest" })
        )
      )
      expect(result.name).toBe("Guest")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("should propagate unhandled errors", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        fetchUser("999").pipe(Effect.provide(TestLayer))
      )
      expect(Exit.isFailure(exit)).toBe(true)
    })
  )
})
```

## Testing Resource Management

### Testing Cleanup

```typescript
import { it, expect, describe } from "@effect/vitest"
import { Effect, Ref } from "effect"

describe("Resource Management", () => {
  it.effect("should clean up resources on success", () =>
    Effect.gen(function* () {
      const cleaned = yield* Ref.make(false)

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => Ref.set(cleaned, true))
          yield* Effect.succeed("done")
        })
      )

      const result = yield* Ref.get(cleaned)
      expect(result).toBe(true)
    })
  )

  it.effect("should clean up resources on failure", () =>
    Effect.gen(function* () {
      const cleaned = yield* Ref.make(false)

      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => Ref.set(cleaned, true))
          yield* Effect.fail({ _tag: "TestError" as const })
        })
      ).pipe(Effect.catchAll(() => Effect.succeed("handled")))

      const wasCleanedUp = yield* Ref.get(cleaned)
      expect(result).toBe("handled")
      expect(wasCleanedUp).toBe(true)
    })
  )
})
```

## Property-Based Testing

### Using it.prop for Pure Properties

```typescript
import { FastCheck } from "effect"
import { it } from "@effect/vitest"

it.prop(
  "addition is commutative",
  [FastCheck.integer(), FastCheck.integer()],
  ([a, b]) => a + b === b + a
)

// With object syntax
it.prop(
  "multiplication distributes",
  { a: FastCheck.integer(), b: FastCheck.integer(), c: FastCheck.integer() },
  ({ a, b, c }) => a * (b + c) === a * b + a * c
)
```

### Using it.effect.prop for Effect Properties

```typescript
import { it } from "@effect/vitest"
import { Effect, Context, FastCheck } from "effect"

class Database extends Context.Tag("Database")<Database, {
  set: (key: string, value: number) => Effect.Effect<void>
  get: (key: string) => Effect.Effect<number>
}>() {}

it.effect.prop(
  "database operations are idempotent",
  [FastCheck.string(), FastCheck.integer()],
  ([key, value]) =>
    Effect.gen(function* () {
      const db = yield* Database

      yield* db.set(key, value)
      const result1 = yield* db.get(key)

      yield* db.set(key, value)
      const result2 = yield* db.get(key)

      return result1 === result2
    })
)
```

### With Schema Arbitraries

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Schema } from "effect"

const User = Schema.Struct({
  id: Schema.String,
  age: Schema.Number.pipe(Schema.between(0, 120))
})

it.effect.prop(
  "user validation works",
  { user: User },
  ({ user }) =>
    Effect.gen(function* () {
      expect(user.age).toBeGreaterThanOrEqual(0)
      expect(user.age).toBeLessThanOrEqual(120)
      return true
    })
)
```

### Configuring FastCheck

```typescript
import { it } from "@effect/vitest"
import { Effect, FastCheck } from "effect"

it.effect.prop(
  "property test",
  [FastCheck.integer()],
  ([n]) => Effect.succeed(n >= 0 || n < 0),
  {
    timeout: 10000,
    fastCheck: {
      numRuns: 1000,
      seed: 42,
      verbose: true
    }
  }
)
```

## Testing Best Practices

### Test Organization

```typescript
import { it, expect, describe } from "@effect/vitest"
import { Effect, Layer, Exit } from "effect"

describe("User Service", () => {
  const TestLayer = Layer.merge(UserRepositoryTest, LoggerTest, ConfigTest)

  describe("createUser", () => {
    it.effect("should create user with valid data", () =>
      Effect.gen(function* () {
        const service = yield* UserService
        const user = yield* service.createUser({
          name: "Alice",
          email: "alice@example.com"
        })
        expect(user.name).toBe("Alice")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should fail with invalid email", () =>
      Effect.gen(function* () {
        const service = yield* UserService
        const exit = yield* Effect.exit(
          service.createUser({ name: "Bob", email: "invalid" })
        )
        expect(Exit.isFailure(exit)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
```

## Best Practices

1. **Use Test Layers**: Create dedicated test implementations for services.

2. **Test Error Paths**: Test both success and failure scenarios.

3. **Mock Dependencies, Not the System Under Test**: Only mock the services your code depends on, never the service you are testing. The service under test should use its real implementation.

4. **Test Cleanup**: Ensure resources are cleaned up properly.

5. **Use Property Tests**: Test invariants with property-based testing.

6. **Isolate Tests**: Each test should be independent.

7. **Test Interruption**: Verify correct behavior on interruption.

8. **Use Spies**: Track calls to verify behavior.

9. **Test Edge Cases**: Cover boundary conditions and error cases.

## Common Pitfalls

1. **Not Providing Layers**: Forgetting to provide required services.

2. **Shared State**: Tests interfering with each other via shared state.

3. **Not Testing Errors**: Only testing happy paths.

4. **Missing Cleanup Tests**: Not verifying finalizers execute.

5. **Ignoring Concurrency**: Not testing concurrent behavior.

6. **Flaky Tests**: Race conditions in concurrent tests.

7. **Over-Mocking**: Mocking too much, losing integration value.

8. **Not Testing Interruption**: Missing interruption scenarios.

9. **Hardcoded Timing**: Tests that depend on specific timing.

10. **Missing Exit Checks**: Not verifying Exit values properly.

## Resources

### Testing Libraries

- [Vitest](https://vitest.dev/)
- [fast-check](https://github.com/dubzzz/fast-check)
