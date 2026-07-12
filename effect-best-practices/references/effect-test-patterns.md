# Effect Testing Patterns

## Table of Contents

- [Framework Selection](#framework-selection)
- [Test Variants](#test-variants)
- [Effect-Specific Utilities](#effect-specific-utilities)
- [Testing with Effect.gen](#testing-with-effectgen)
- [Testing Success and Failure](#testing-success-and-failure)
- [Mock Layers for Testing](#mock-layers-for-testing)
- [Testing Error Scenarios](#testing-error-scenarios)
- [Time-Dependent Testing with TestClock](#time-dependent-testing-with-testclock)
- [Testing Resource Management](#testing-resource-management)
- [Property-Based Testing](#property-based-testing)
- [Testing Best Practices](#testing-best-practices)
- [Common Pitfalls](#common-pitfalls)

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

## Test Variants

### it.effect - Default Test Environment

Provides TestContext including TestClock, TestRandom, etc.

```typescript
import { it, expect } from "@effect/vitest"
import { Effect } from "effect"

declare const someEffect: Effect.Effect<number>
declare const expected: number

it.effect("test name", () =>
  Effect.gen(function* () {
    // Test implementation with TestContext available
    const result = yield* someEffect
    expect(result).toBe(expected)
  })
)
```

### it.live - Live Environment

Uses real services (real clock, real random, etc.).

```typescript
import { it } from "@effect/vitest"
import { Effect, Clock } from "effect"

it.live("test with real time", () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    // Uses actual system time
  })
)
```

### it.scoped - Resource Management

For tests requiring Scope to manage resource lifecycle.

```typescript
import { it } from "@effect/vitest"
import { Effect } from "effect"

declare const acquire: Effect.Effect<unknown>
declare const release: Effect.Effect<void>

it.scoped("test with resources", () =>
  Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      acquire,
      () => release
    )
    // Resource automatically cleaned up after test
  })
)
```

### it.scopedLive - Combined Scoped + Live

Uses live environment with scope for resource management.

```typescript
import { it } from "@effect/vitest"
import { Effect } from "effect"

declare const acquireRealResource: Effect.Effect<unknown>
declare const releaseRealResource: Effect.Effect<void>

it.scopedLive("live test with resources", () =>
  Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      acquireRealResource,
      () => releaseRealResource
    )
  })
)
```

## Effect-Specific Utilities

`@effect/vitest` provides additional assertion utilities in `utils`:

```typescript
import { it } from "@effect/vitest"
import {
  assertEquals,       // Uses Effect's Equal.equals
  assertTrue,
  assertFalse,
  assertSome,        // For Option.Some
  assertNone,        // For Option.None
  assertRight,       // For Either.Right
  assertLeft,        // For Either.Left
  assertSuccess,     // For Exit.Success
  assertFailure      // For Exit.Failure
} from "@effect/vitest/utils"
import { Effect, Option, Either } from "effect"

declare const someOptionalEffect: Effect.Effect<Option.Option<number>>
declare const someEitherEffect: Effect.Effect<Either.Either<number, Error>>
declare const expectedValue: number

it.effect("with effect assertions", () =>
  Effect.gen(function* () {
    const option = yield* someOptionalEffect
    assertSome(option, expectedValue)

    const either = yield* someEitherEffect
    assertRight(either, expectedValue)
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

### Testing Error Types

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Exit, Cause, Context, Data } from "effect"

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  id: string
}> {}

class UserService extends Context.Tag("UserService")<UserService, {
  getUser: (id: string) => Effect.Effect<unknown, NotFoundError>
}>() {}

declare const userService: {
  getUser: (id: string) => Effect.Effect<unknown, NotFoundError>
}

it.effect("should fail with specific error", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      userService.getUser("nonexistent")
    )

    if (Exit.isFailure(exit)) {
      const cause = exit.cause
      expect(Cause.isFailType(cause)).toBe(true)
      const error = Cause.failureOrCause(cause)
      expect(error).toBeInstanceOf(NotFoundError)
    } else {
      throw new Error("Expected failure")
    }
  })
)
```

### Testing Expected Failures with Effect.flip

Use `Effect.flip` to convert failures to successes for simpler assertions:

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Data } from "effect"

class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  userId: string
}> {}

declare const failingOperation: () => Effect.Effect<never, UserNotFoundError>

it.effect("should fail with error", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(failingOperation())
    expect(error).toBeInstanceOf(UserNotFoundError)
    expect(error.userId).toBe("123")
  })
)
```

### Testing Error Recovery

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
})
```

## Time-Dependent Testing with TestClock

### Basic TestClock Usage

TestClock allows controlling time without waiting:

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, TestClock, Fiber } from "effect"

it.effect("should handle delays", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(
      Effect.sleep("5 seconds").pipe(Effect.as("done"))
    )

    // Advance time by 5 seconds instantly
    yield* TestClock.adjust("5 seconds")

    const result = yield* Fiber.join(fiber)
    expect(result).toBe("done")
  })
)
```

### Testing Recurring Effects

Test periodic operations efficiently:

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Queue, TestClock, Option } from "effect"

it.effect("should execute every minute", () =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<number>()

    // Fork effect that repeats every minute
    yield* Effect.fork(
      Queue.offer(queue, 1).pipe(
        Effect.delay("60 seconds"),
        Effect.forever
      )
    )

    // No effect before time passes
    const empty = yield* Queue.poll(queue)
    expect(Option.isNone(empty)).toBe(true)

    // Advance time
    yield* TestClock.adjust("60 seconds")

    // Effect executed once
    const value = yield* Queue.take(queue)
    expect(value).toBe(1)

    // Verify only one execution
    const stillEmpty = yield* Queue.poll(queue)
    expect(Option.isNone(stillEmpty)).toBe(true)
  })
)
```

### Testing Clock Methods

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Clock, TestClock } from "effect"

it.effect("should track time correctly", () =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis

    yield* TestClock.adjust("1 minute")

    const end = yield* Clock.currentTimeMillis

    expect(end - start).toBeGreaterThanOrEqual(60_000)
  })
)
```

### TestClock with Deferred

```typescript
import { it, expect } from "@effect/vitest"
import { Effect, Deferred, TestClock } from "effect"

it.effect("should handle deferred with delays", () =>
  Effect.gen(function* () {
    const deferred = yield* Deferred.make<number, void>()

    yield* Effect.fork(
      Effect.sleep("10 seconds").pipe(
        Effect.zipRight(Deferred.succeed(deferred, 42))
      )
    )

    yield* TestClock.adjust("10 seconds")

    const result = yield* Deferred.await(deferred)
    expect(result).toBe(42)
  })
)
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
