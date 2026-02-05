# Layer Patterns

## Dependencies in Effect.Service

**Critical rule:** Always declare dependencies in the `dependencies` array of `Effect.Service`. This ensures proper composition and avoids "leaked dependencies" that require manual wiring at usage sites.

### Correct Pattern

```typescript
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
    accessors: true,
    dependencies: [
        UserService.Default,
        ProductService.Default,
        InventoryService.Default,
        PaymentService.Default,
    ],
    effect: Effect.gen(function* () {
        const users = yield* UserService
        const products = yield* ProductService
        const inventory = yield* InventoryService
        const payments = yield* PaymentService

        // Service implementation...
        return { /* methods */ }
    }),
}) {}

// At app root - simple, flat composition
const AppLive = Layer.mergeAll(
    OrderService.Default,
    // Other top-level services
    NotificationService.Default,
    AnalyticsService.Default,
)
```

### Wrong Pattern (Leaked Dependencies)

```typescript
// WRONG - Dependencies not declared
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
    accessors: true,
    effect: Effect.gen(function* () {
        const users = yield* UserService // Not in dependencies!
        // ...
    }),
}) {}

// Now every usage requires manual wiring
const program = OrderService.create(input).pipe(
    Effect.provide(
        OrderService.Default.pipe(
            Layer.provide(UserService.Default),
            Layer.provide(ProductService.Default),
            // Easy to forget one, causes runtime errors
        )
    ),
)
```

## Infrastructure Layers

Infrastructure layers (Database, Redis, HTTP clients) are **acceptable** to leave as "leaked" dependencies because:

1. They're provided once at the application root
2. They don't change between test/production (different implementations, same interface)
3. They're true infrastructure, not business logic

```typescript
// Infrastructure can be provided at app root
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
    host: Config.string("DB_HOST"),
    port: Config.integer("DB_PORT"),
    database: Config.string("DB_NAME"),
    username: Config.string("DB_USER"),
    password: Config.redacted("DB_PASSWORD"),
})

// Services use database but don't declare it in dependencies
export class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
    accessors: true,
    // No dependencies array - PgClient provided at app root
    effect: Effect.gen(function* () {
        const sql = yield* PgClient.PgClient

        const findById = Effect.fn("UserRepo.findById")(function* (id: UserId) {
            const rows = yield* sql`SELECT * FROM users WHERE id = ${id}`.pipe(Effect.orDie)
            return rows[0] as User | undefined
        })

        return { findById }
    }),
}) {}

// App root provides infrastructure once
const AppLive = Layer.mergeAll(
    OrderService.Default,
    UserService.Default,
).pipe(
    Layer.provide(DatabaseLive), // Infrastructure provided here
    Layer.provide(RedisLive),
)
```

## Layer.mergeAll Over Nested Provides

**Use `Layer.mergeAll`** for composing layers at the same level:

```typescript
// CORRECT - Flat composition
const ServicesLive = Layer.mergeAll(
    UserService.Default,
    OrderService.Default,
    ProductService.Default,
    NotificationService.Default,
)

const InfrastructureLive = Layer.mergeAll(
    DatabaseLive,
    RedisLive,
    HttpClientLive,
)

const AppLive = ServicesLive.pipe(
    Layer.provide(InfrastructureLive),
)
```

```typescript
// WRONG - Deeply nested, hard to read
const AppLive = UserService.Default.pipe(
    Layer.provide(
        OrderService.Default.pipe(
            Layer.provide(
                ProductService.Default.pipe(
                    Layer.provide(DatabaseLive),
                ),
            ),
        ),
    ),
)
```

## Layer.provideMerge for Sequential Composition

**Use `Layer.provideMerge`** when chaining layers that need incremental composition. Unlike `Layer.provide`, `provideMerge` merges the output into the current layer, producing flatter types.

```typescript
// CORRECT - Layer.provideMerge chains for incremental composition
const MainLive = DatabaseLive.pipe(
    Layer.provideMerge(ProxyConfigService.Default),
    Layer.provideMerge(LoggerLive),
    Layer.provideMerge(CacheLive),
    Layer.provideMerge(TracerLive),
)

// WRONG - Multiple Layer.provide calls create nested types
const MainLive = DatabaseLive.pipe(
    Layer.provide(ProxyConfigService.Default),
    Layer.provide(LoggerLive),  // Each provide creates deeper nesting
    Layer.provide(CacheLive),
)
```

**Key difference:** `Layer.provide(A, B)` provides B to A but outputs only A's services. `Layer.provideMerge(A, B)` provides B to A and outputs both A's and B's services merged together.

## Layer Deduplication Benefits

Layers automatically memoize construction - the same service is instantiated only once regardless of how many times it appears in the dependency graph.

```typescript
// Both UserRepo and OrderRepo depend on DatabaseLive
const RepoLive = Layer.mergeAll(
    UserRepo.Default,   // requires DatabaseLive
    OrderRepo.Default,  // requires DatabaseLive
)

// With Layer.mergeAll, DatabaseLive is constructed ONCE
const AppLive = RepoLive.pipe(
    Layer.provide(DatabaseLive), // Single instance shared
)
```

**`Effect.provide` does NOT deduplicate:**

```typescript
// WRONG - Each provide creates a new instance
const program = myEffect.pipe(
    Effect.provide(UserRepo.Default),
    Effect.provide(OrderRepo.Default),
    // If both repos need DatabaseLive, and you provide it separately,
    // you may get TWO database connections!
)

// CORRECT - Use layers for deduplication
const program = myEffect.pipe(
    Effect.provide(AppLive), // Single composed layer
)
```

## TypeScript LSP Performance

Deeply nested `Layer.provide` chains create complex recursive types that slow down the TypeScript Language Server.

```typescript
// PROBLEMATIC - Deep nesting causes slow LSP
const AppLive = Layer1.pipe(
    Layer.provide(Layer2.pipe(
        Layer.provide(Layer3.pipe(
            Layer.provide(Layer4.pipe(
                Layer.provide(Layer5),
            )),
        )),
    )),
)
// Type becomes: Layer<..., Layer<..., Layer<..., Layer<..., ...>>>>
```

```typescript
// BETTER - Flat composition with mergeAll produces simpler types
const InfraLive = Layer.mergeAll(Layer3, Layer4, Layer5)
const AppLive = Layer.mergeAll(Layer1, Layer2).pipe(
    Layer.provide(InfraLive),
)
// Type is flatter and LSP responds faster
```

**Recommendations:**
- Prefer `Layer.mergeAll` for layers at the same level
- Use `Layer.provideMerge` instead of chained `Layer.provide` calls
- Group related layers into intermediate compositions
- Keep nesting depth shallow (ideally 2-3 levels max)

## layerConfig Pattern

For services that need configuration at construction time, use the `layerConfig` static method pattern:

```typescript
import { Config, ConfigError, Effect, Layer } from "effect"

interface EventQueueConfig {
    readonly maxRetries: number
    readonly batchSize: number
    readonly pollInterval: number
}

export class ElectricEventQueue extends Effect.Service<ElectricEventQueue>()(
    "ElectricEventQueue",
    {
        accessors: true,
        effect: Effect.gen(function* () {
            // Default implementation
            return { /* methods */ }
        }),
    }
) {
    // Static method for config-driven layer
    static readonly layerConfig = (
        config: Config.Config.Wrap<EventQueueConfig>,
    ): Layer.Layer<ElectricEventQueue, ConfigError.ConfigError> =>
        Layer.unwrapEffect(
            Config.unwrap(config).pipe(
                Effect.map((cfg) =>
                    Layer.succeed(
                        ElectricEventQueue,
                        new ElectricEventQueueImpl(cfg)
                    )
                )
            )
        )
}

// Usage
const EventQueueLive = ElectricEventQueue.layerConfig({
    maxRetries: Config.integer("EVENT_QUEUE_MAX_RETRIES").pipe(
        Config.withDefault(3)
    ),
    batchSize: Config.integer("EVENT_QUEUE_BATCH_SIZE").pipe(
        Config.withDefault(100)
    ),
    pollInterval: Config.integer("EVENT_QUEUE_POLL_INTERVAL").pipe(
        Config.withDefault(1000)
    ),
})
```

This pattern:
- Separates configuration from implementation
- Returns `ConfigError` for missing/invalid config
- Allows different configs per environment
- Integrates cleanly with `Layer.mergeAll` and `Layer.provideMerge`

## Layer Naming Conventions

Use suffixes to indicate layer type:

- `ServiceLive` - Production implementation
- `ServiceTest` - Test/mock implementation
- `ServiceLayer` - Generic layer (rare)

```typescript
// Production
export const UserServiceLive = UserService.Default

// Test with mocks
export const UserServiceTest = Layer.succeed(
    UserService,
    UserService.of({
        findById: (id) => Effect.succeed(mockUser),
        create: (input) => Effect.succeed({ id: UserId.make("test-id"), ...input }),
    })
)

// Test with in-memory state
export class UserServiceInMemory extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    effect: Effect.gen(function* () {
        const store = new Map<string, User>()

        return {
            findById: Effect.fn("UserService.findById")(function* (id) {
                const user = store.get(id)
                if (!user) return yield* Effect.fail(new UserNotFoundError({ userId: id }))
                return user
            }),
            create: Effect.fn("UserService.create")(function* (input) {
                const user = { id: UserId.make(crypto.randomUUID()), ...input }
                store.set(user.id, user)
                return user
            }),
        }
    }),
}) {}
```

## Layer.unwrapEffect for Config-Dependent Layers

When a layer needs async configuration:

```typescript
import { Config, Effect, Layer } from "effect"

// Layer that depends on config
const ApiClientLive = Layer.unwrapEffect(
    Effect.gen(function* () {
        const apiKey = yield* Config.string("API_KEY")
        const baseUrl = yield* Config.string("API_BASE_URL")
        const timeout = yield* Config.integer("API_TIMEOUT").pipe(
            Config.withDefault(5000)
        )

        return Layer.succeed(
            ApiClient,
            new ApiClientImpl({ apiKey, baseUrl, timeout })
        )
    })
)

// Layer that validates config
const ValidatedConfigLive = Layer.unwrapEffect(
    Effect.gen(function* () {
        const config = yield* Config.all({
            dbUrl: Config.string("DATABASE_URL"),
            redisUrl: Config.string("REDIS_URL"),
            port: Config.integer("PORT"),
        })

        // Validate config
        if (!config.dbUrl.startsWith("postgresql://")) {
            return yield* Effect.fail(new ConfigError({ message: "Invalid DATABASE_URL" }))
        }

        return Layer.succeed(AppConfig, config)
    })
)
```

## Scoped Layers

For resources that need cleanup:

```typescript
import { Effect, Layer, Scope } from "effect"

// Resource that needs cleanup
const DatabaseConnectionLive = Layer.scoped(
    DatabaseConnection,
    Effect.acquireRelease(
        Effect.gen(function* () {
            const pool = yield* createPool(config)
            yield* Effect.log("Database pool created")
            return pool
        }),
        (pool) =>
            Effect.gen(function* () {
                yield* pool.end()
                yield* Effect.log("Database pool closed")
            }).pipe(Effect.orDie)
    )
)

// Service using scoped resource
export class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
    accessors: true,
    effect: Effect.gen(function* () {
        const db = yield* DatabaseConnection

        return {
            findById: Effect.fn("UserRepo.findById")(function* (id) {
                return yield* db.query("SELECT * FROM users WHERE id = $1", [id])
            }),
        }
    }),
}) {}
```

## Testing Layer Composition

```typescript
// test/setup.ts
import { Layer } from "effect"

export const TestLive = Layer.mergeAll(
    UserServiceTest,
    OrderServiceTest,
    ProductServiceTest,
).pipe(
    Layer.provide(InMemoryDatabaseLive),
)

// test/user.test.ts
import { Effect } from "effect"
import { TestLive } from "./setup"

describe("UserService", () => {
    it("creates users", async () => {
        const program = Effect.gen(function* () {
            const user = yield* UserService.create({
                email: "test@example.com",
                name: "Test User",
            })
            expect(user.email).toBe("test@example.com")
        })

        await Effect.runPromise(program.pipe(Effect.provide(TestLive)))
    })
})
```

## Layer.effect vs Layer.succeed

```typescript
// Layer.succeed - for static values (no effects)
const ConfigLive = Layer.succeed(AppConfig, {
    port: 3000,
    env: "development",
})

// Layer.effect - when construction needs effects
const LoggerLive = Layer.effect(
    Logger,
    Effect.gen(function* () {
        const config = yield* AppConfig
        const transport = config.env === "production"
            ? createCloudTransport()
            : createConsoleTransport()
        return new LoggerImpl(transport)
    })
)
```

## Lazy Layers

For expensive initialization that should be deferred:

```typescript
const ExpensiveServiceLive = Layer.lazy(() => {
    // This code runs only when the layer is first used
    return Layer.effect(
        ExpensiveService,
        Effect.gen(function* () {
            yield* Effect.log("Initializing expensive service...")
            const client = yield* createExpensiveClient()
            return new ExpensiveServiceImpl(client)
        })
    )
})
```
