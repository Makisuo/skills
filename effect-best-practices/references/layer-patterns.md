# Layer Patterns

## Table of Contents

- [Layer Structure](#layer-structure)
- [Dependencies in Effect.Service](#dependencies-in-effectservice)
- [Infrastructure Layers](#infrastructure-layers)
- [Layer.mergeAll Over Nested Provides](#layermergeall-over-nested-provides)
- [Layer Naming Conventions](#layer-naming-conventions)
- [Layer.unwrapEffect for Config-Dependent Layers](#layerunwrapeffect-for-config-dependent-layers)
- [Scoped Layers](#scoped-layers)
- [Testing Layer Composition](#testing-layer-composition)
- [Layer.effect vs Layer.succeed](#layereffect-vs-layersucceed)
- [Lazy Layers](#lazy-layers)
- [Merge vs Provide](#merge-vs-provide)

## Layer Structure

Understanding the Layer type signature:

```typescript
Layer<RequirementsOut, Error, RequirementsIn>
         ▲                ▲           ▲
         │                │           └─ What this layer needs
         │                └─ Errors during construction
         └─ What this layer produces
```

Example:

```typescript
// Layer<Logger, never, Config>
//         ▲      ▲      ▲
//         │      │      └─ Needs Config
//         │      └─ Cannot fail
//         └─ Produces Logger
export const LoggerLive = Layer.effect(
  Logger,
  Effect.gen(function* () {
    const config = yield* Config
    return Logger.of({
      log: (message) =>
        Effect.gen(function* () {
          const { logLevel } = yield* config.getConfig
          console.log(`[${logLevel}] ${message}`)
        })
    })
  })
)
```

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
// ✅ CORRECT - Flat composition
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
// ❌ WRONG - Deeply nested, hard to read
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

## Merge vs Provide

Understanding when to use `Layer.merge` vs `Layer.provide`:

### Merge (Parallel Composition)

Combine independent layers that don't depend on each other:

```typescript
// Layer<Config | Logger, never, Config>
//         ▲               ▲      ▲
//         │               │      └─ LoggerLive needs Config
//         │               └─ No errors
//         └─ Produces both Config and Logger
const AppConfigLive = Layer.merge(ConfigLive, LoggerLive)
```

Result combines:

- **Requirements**: Union (`never | Config = Config`)
- **Outputs**: Union (`Config | Logger`)

### Provide (Sequential Composition)

Chain dependent layers where one satisfies another's requirements:

```typescript
// Layer<Logger, never, never>
//         ▲      ▲      ▲
//         │      │      └─ ConfigLive satisfies LoggerLive's requirement
//         │      └─ No errors
//         └─ Only Logger in output
const FullLoggerLive = Layer.provide(LoggerLive, ConfigLive)
```

Result:

- **Requirements**: Outer layer's requirements (`never`)
- **Output**: Inner layer's output (`Logger`)

### ProvideMerge

Chain dependent layers where one satisfies another's requirements, but combine their outputs:

```typescript
// Layer<Config | Logger, never, never>
//         ▲               ▲      ▲
//         │               │      └─ LoggerLive needs Config
//         │               └─ No errors
//         └─ Produces both Config and Logger
const FullLoggerLive = Layer.provideMerge(LoggerLive, ConfigLive)
```

Result:

- **Requirements**:  `never`
- **Output**: Union (`Config | Logger`)

### Layered Architecture Example

Build applications in layers:

```typescript
// Infrastructure: No dependencies
const InfrastructureLive = Layer.mergeAll(
  ConfigLive,          // Layer<Config, never, never>
  DatabaseLive,        // Layer<Database, never, Config>
  CacheLive            // Layer<Cache, never, Config>
).pipe(
  Layer.provide(ConfigLive)  // Satisfy Config requirement
)

// Domain: Depends on infrastructure
const DomainLive = Layer.mergeAll(
  PaymentDomainLive,   // Layer<PaymentDomain, never, Database>
  OrderDomainLive,     // Layer<OrderDomain, never, Database>
).pipe(
  Layer.provide(InfrastructureLive)
)

// Application: Depends on domain
const ApplicationLive = Layer.mergeAll(
  PaymentGatewayLive,
  NotificationServiceLive
).pipe(
  Layer.provide(DomainLive)
)
