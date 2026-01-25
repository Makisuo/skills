---
name: effect-best-practices
description: This skill should be used when writing Effect-TS code, creating services, defining errors, composing layers, working with @effect/rpc, @effect/cluster, or reviewing Effect code. Triggers on "Effect.Service", "Schema.TaggedError", "Layer.mergeAll", "Effect.gen", "branded types", "RPC contracts", "workflows", "activities", "Effect.fn", "catchTag", "HttpApi".
version: 1.0.0
---

# Effect-TS Best Practices

This skill enforces opinionated, consistent patterns for Effect-TS codebases. These patterns optimize for type safety, testability, observability, and maintainability.

## Quick Reference: Critical Rules

| Category | DO | DON'T |
|----------|-----|-------|
| Services | `Effect.Service` with `accessors: true` | `Context.Tag` for business logic |
| Dependencies | `dependencies: [Dep.Default]` in service | Manual `Layer.provide` at usage sites |
| Errors | `Schema.TaggedError` with `message` field | Plain classes or generic Error |
| Error Handling | `catchTag`/`catchTags` | `catchAll` or `mapError` |
| IDs | `Schema.UUID.pipe(Schema.brand("@App/EntityId"))` | Plain `string` for entity IDs |
| Functions | `Effect.fn("Service.method")` | Anonymous generators |
| Logging | `Effect.log` with structured data | `console.log` |
| Config | `Config.*` with validation | `process.env` directly |
| Options | `Option.match` with both cases | `Option.getOrThrow` |
| Nullability | `Option<T>` in domain types | `null`/`undefined` |

## Service Definition Pattern

**Always use `Effect.Service`** for business logic services. This provides automatic accessors, built-in `Default` layer, and proper dependency declaration.

```typescript
import { Effect } from "effect"

export class UserService extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    dependencies: [UserRepo.Default, CacheService.Default],
    effect: Effect.gen(function* () {
        const repo = yield* UserRepo
        const cache = yield* CacheService

        const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
            const cached = yield* cache.get(id)
            if (Option.isSome(cached)) return cached.value

            const user = yield* repo.findById(id)
            yield* cache.set(id, user)
            return user
        })

        const create = Effect.fn("UserService.create")(function* (data: CreateUserInput) {
            const user = yield* repo.create(data)
            yield* Effect.log("User created", { userId: user.id })
            return user
        })

        return { findById, create }
    }),
}) {}

// Usage - dependencies are already wired
const program = Effect.gen(function* () {
    const user = yield* UserService.findById(userId)
    return user
})

// At app root
const MainLive = Layer.mergeAll(UserService.Default, OtherService.Default)
```

**When `Context.Tag` is acceptable:**
- Infrastructure with runtime injection (Cloudflare KV, worker bindings)
- Factory patterns where resources are provided externally

See `references/service-patterns.md` for detailed patterns.

## Error Definition Pattern

**Always use `Schema.TaggedError`** for errors. This makes them serializable (required for RPC) and provides consistent structure.

```typescript
import { Schema } from "effect"
import { HttpApiSchema } from "@effect/platform"

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    {
        userId: UserId,
        message: Schema.String,
    },
    HttpApiSchema.annotations({ status: 404 }),
) {}

export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
    "UserCreateError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
    },
    HttpApiSchema.annotations({ status: 400 }),
) {}
```

**Error handling - use `catchTag`/`catchTags`:**

```typescript
// CORRECT - preserves type information
yield* repo.findById(id).pipe(
    Effect.catchTag("DatabaseError", (err) =>
        Effect.fail(new UserNotFoundError({ userId: id, message: "Lookup failed" }))
    ),
    Effect.catchTag("ConnectionError", (err) =>
        Effect.fail(new ServiceUnavailableError({ message: "Database unreachable" }))
    ),
)

// CORRECT - multiple tags at once
yield* effect.pipe(
    Effect.catchTags({
        DatabaseError: (err) => Effect.fail(new UserNotFoundError({ userId: id, message: err.message })),
        ValidationError: (err) => Effect.fail(new BadRequestError({ message: err.message })),
    }),
)
```

See `references/error-patterns.md` for error remapping and retry patterns.

## Schema & Branded Types Pattern

**Brand all entity IDs** for type safety across service boundaries:

```typescript
import { Schema } from "effect"

// Entity IDs - always branded
export const UserId = Schema.UUID.pipe(Schema.brand("@App/UserId"))
export type UserId = Schema.Schema.Type<typeof UserId>

export const OrganizationId = Schema.UUID.pipe(Schema.brand("@App/OrganizationId"))
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>

// Domain types - use Schema.Struct
export const User = Schema.Struct({
    id: UserId,
    email: Schema.String,
    name: Schema.String,
    organizationId: OrganizationId,
    createdAt: Schema.DateTimeUtc,
})
export type User = Schema.Schema.Type<typeof User>

// Input types for mutations
export const CreateUserInput = Schema.Struct({
    email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    name: Schema.String.pipe(Schema.minLength(1)),
    organizationId: OrganizationId,
})
export type CreateUserInput = Schema.Schema.Type<typeof CreateUserInput>
```

**When NOT to brand:**
- Simple strings that don't cross service boundaries (URLs, file paths)
- Primitive config values

See `references/schema-patterns.md` for transforms and advanced patterns.

## Function Pattern with Effect.fn

**Always use `Effect.fn`** for service methods. This provides automatic tracing with proper span names:

```typescript
// CORRECT - Effect.fn with descriptive name
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
    yield* Effect.annotateCurrentSpan("userId", id)
    const user = yield* repo.findById(id)
    return user
})

// CORRECT - Effect.fn with multiple parameters
const transfer = Effect.fn("AccountService.transfer")(
    function* (fromId: AccountId, toId: AccountId, amount: number) {
        yield* Effect.annotateCurrentSpan("fromId", fromId)
        yield* Effect.annotateCurrentSpan("toId", toId)
        yield* Effect.annotateCurrentSpan("amount", amount)
        // ...
    }
)
```

## Layer Composition

**Declare dependencies in the service**, not at usage sites:

```typescript
// CORRECT - dependencies in service definition
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
    accessors: true,
    dependencies: [
        UserService.Default,
        ProductService.Default,
        PaymentService.Default,
    ],
    effect: Effect.gen(function* () {
        const users = yield* UserService
        const products = yield* ProductService
        const payments = yield* PaymentService
        // ...
    }),
}) {}

// At app root - simple merge
const AppLive = Layer.mergeAll(
    OrderService.Default,
    // Infrastructure layers (intentionally not in dependencies)
    DatabaseLive,
    RedisLive,
)
```

See `references/layer-patterns.md` for testing layers and config-dependent layers.

## Option Handling

**Never use `Option.getOrThrow`**. Always handle both cases explicitly:

```typescript
// CORRECT - explicit handling
yield* Option.match(maybeUser, {
    onNone: () => Effect.fail(new UserNotFoundError({ userId, message: "Not found" })),
    onSome: (user) => Effect.succeed(user),
})

// CORRECT - with getOrElse for defaults
const name = Option.getOrElse(maybeName, () => "Anonymous")

// CORRECT - Option.map for transformations
const upperName = Option.map(maybeName, (n) => n.toUpperCase())
```

## RPC & Cluster Patterns

For RPC contracts and cluster workflows, see:
- `references/rpc-cluster-patterns.md` - RpcGroup, Workflow.make, Activity patterns

## Anti-Patterns (Forbidden)

These patterns are **never acceptable**:

```typescript
// FORBIDDEN - runSync/runPromise inside services
const result = Effect.runSync(someEffect) // Never do this

// FORBIDDEN - throw inside Effect.gen
yield* Effect.gen(function* () {
    if (bad) throw new Error("No!") // Use Effect.fail instead
})

// FORBIDDEN - catchAll losing type info
yield* effect.pipe(Effect.catchAll(() => Effect.fail(new GenericError())))

// FORBIDDEN - console.log
console.log("debug") // Use Effect.log

// FORBIDDEN - process.env directly
const key = process.env.API_KEY // Use Config.string("API_KEY")

// FORBIDDEN - null/undefined in domain types
type User = { name: string | null } // Use Option<string>
```

See `references/anti-patterns.md` for the complete list with rationale.

## Observability

```typescript
// Structured logging
yield* Effect.log("Processing order", { orderId, userId, amount })

// Metrics
const orderCounter = Metric.counter("orders_processed")
yield* Metric.increment(orderCounter)

// Config with validation
const config = Config.all({
    port: Config.integer("PORT").pipe(Config.withDefault(3000)),
    apiKey: Config.secret("API_KEY"),
    maxRetries: Config.integer("MAX_RETRIES").pipe(
        Config.validate({ message: "Must be positive", validation: (n) => n > 0 })
    ),
})
```

See `references/observability-patterns.md` for metrics and tracing patterns.

## Reference Files

For detailed patterns, consult these reference files in the `references/` directory:

- `service-patterns.md` - Service definition, Effect.fn, Context.Tag exceptions
- `error-patterns.md` - Schema.TaggedError, error remapping, retry patterns
- `schema-patterns.md` - Branded types, transforms, Schema.Class
- `layer-patterns.md` - Dependency composition, testing layers
- `rpc-cluster-patterns.md` - RpcGroup, Workflow, Activity patterns
- `anti-patterns.md` - Complete list of forbidden patterns
- `observability-patterns.md` - Logging, metrics, config patterns
