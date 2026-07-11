# Services & Layers Checklist (v4)

In Effect v4, all service definitions use `Context.Service`. `Context.Tag`,
`Context.GenericTag`, `Effect.Tag`, and `Effect.Service` no longer exist.

## 1. Define Services with `Context.Service` Class Syntax

Prefer the class syntax. Type parameters come first (`<Self, Shape>()`), then the
identifier string is passed to the returned constructor. The shape is a separate
exported `interface XxxServiceShape` with method fields typed as
`Effect.Effect<A, E, R>`.

```typescript
// GOOD
import { Context, Effect } from "effect"

export interface DatabaseShape {
  readonly query: (sql: string) => Effect.Effect<Array<unknown>, DatabaseError>
}

export class Database extends Context.Service<Database, DatabaseShape>()(
  "myapp/db/Database",
) {}

// BAD — v3 tags
class Database extends Context.Tag("Database")<Database, { ... }>() {}
class Database extends Effect.Service<Database>()("Database", { ... }) {}
```

The identifier string should include the package name and the path to the
service file (e.g. `"@myorg/api/services/Database"`).

## 2. Provide an Explicit `layer` Static — No Auto-Generated Layer

`Context.Service` does **not** auto-generate a layer. Build it yourself with
`Layer.effect`. There is no `dependencies` option — wire dependencies with
`Layer.provide`.

```typescript
// GOOD — inline make in the class options
export class Logger extends Context.Service<Logger, LoggerShape>()("myapp/Logger", {
  make: Effect.gen(function* () {
    const config = yield* Config
    return {
      log: (msg) => Effect.log(`[${config.prefix}] ${msg}`),
    } satisfies LoggerShape
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(Config.layer),
  )
}

// BAD — expecting an auto-generated Default layer
Effect.provide(Logger.Default)
// BAD — v3 dependencies option
Context.Service<Logger>()("Logger", { make, dependencies: [Config.layer] })
```

## 3. `make` Returns `satisfies Shape` Inline, or a Hoisted Annotated `make` + `Self.of` ⚠️

Two accepted forms — **do not flag either, and do not convert between them**:

**Default — inline `make` returning `satisfies Shape`.** Calling `X.of(...)`
inside an inline `make` triggers `TS2506: 'X' is referenced directly or
indirectly in its own base expression` (the class base infers E/R from `make`,
whose return type would need the class's own static type). `satisfies` gives
the same shape-check without the cycle:

```typescript
// GOOD — the default form
export class Database extends Context.Service<Database, DatabaseShape>()(
  "myapp/db/Database",
  {
    make: Effect.gen(function* () {
      const pool = yield* Pool
      return { query: (sql) => pool.run(sql) } satisfies DatabaseShape
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
```

**Variant — module-hoisted `make` with an explicit annotation, then `.of()`.**
When the body must reference the class identifier, hoist `make` to module scope
with an explicit `Effect.Effect<Shape, E, R>` annotation (breaking the inference
cycle), and `Self.of(...)` becomes legal:

```typescript
// GOOD — the hoisted variant
const make: Effect.Effect<NotifierShape, NotifyError, Database | Env> =
  Effect.gen(function* () {
    ...
    return Notifier.of({ dispatch })
  })

export class Notifier extends Context.Service<Notifier, NotifierShape>()(
  "myapp/Notifier",
) {
  static readonly layer = Layer.effect(this, make)  // bare `make` — correct here
}
```

What TO flag: an untyped bare object literal returned from `make` with
**neither** `satisfies Shape` **nor** `.of()` — that loses the shape check
(excess/missing members surface far from the definition).

## 4. Name the Primary Layer `layer`

v4 convention: the primary layer is `layer`. Variants get descriptive suffixes
(`layerTest`, `layerConfig`). Do not use the v3 `Default` / `Live` names for
statics. `Layer.succeed(this, stub)` for constant/test layers.

```typescript
// GOOD
static readonly layer = Layer.effect(this, this.make)
static readonly layerTest = Layer.succeed(this, stubImpl)

// BAD
static readonly Default = ...
static readonly Live = ...
```

(Composed layer *constants* in the app's wiring file conventionally use a
`…Live` suffix — `const CoreServicesLive = ...` — that is fine; the rule is
about the statics on the service class.)

## 5. Compose with `Layer.mergeAll` and `Layer.provideMerge`; Wire Shared Layers Once

Use `Layer.mergeAll` for flat sibling composition and `Layer.provideMerge` /
`Layer.provide` to satisfy dependencies. Avoid deep nested `Layer.provide`
chains.

```typescript
// GOOD
const InfraLive = Layer.mergeAll(Env.layer, Database.layer)

const CoreServicesLive = Layer.mergeAll(
  AuthService.layer,
  OrgService.layer,
  ApiKeysService.layer,
).pipe(Layer.provideMerge(InfraLive))

// GOOD — shared layer hoisted to ONE named const, reused everywhere
const EdgeCacheLive = EdgeCacheService.layer.pipe(Layer.provide(CacheBackendLive))
const A = ServiceA.layer.pipe(Layer.provide(EdgeCacheLive))
const B = ServiceB.layer.pipe(Layer.provide(EdgeCacheLive))

// BAD — re-invoking X.layer in multiple graph positions defeats memoization
const A = ServiceA.layer.pipe(Layer.provide(EdgeCacheService.layer.pipe(Layer.provide(...))))
const B = ServiceB.layer.pipe(Layer.provide(EdgeCacheService.layer.pipe(Layer.provide(...))))
```

Semantics: `provideMerge` keeps the provided layer in the output context (use
when downstream consumers also need it — this is deliberate exposure, **not**
"leaking"); `provide` hides it (use when the consumer only consumes). Layers
are memoized by reference within a composition, so building each shared layer
into a single named `const` is what guarantees one instance.

## 6. Prefer `yield* Service` Over `Service.use`

Accessor proxies were removed in v4. Access a service by yielding it in a
generator — this keeps the dependency visible in the call site's type.

```typescript
// GOOD — dependency visible in the Effect's R channel
const program = Effect.gen(function* () {
  const notifications = yield* Notifications
  yield* notifications.notify("hello")
})

// ACCEPTED convention — explicit static accessors delegating through this.use
export class Notifications extends Context.Service<...>()("...") {
  static notify = (msg: string) => this.use((s) => s.notify(msg))
}

// BAD — v3 auto-generated accessor proxy (removed)
const program = Notifications.notify("hello")  // with no such static defined
```

`Effect.serviceOption(Service)` is the idiom for **graceful degradation** when
a layer may legitimately be absent (returns `Option<Shape>`); don't flag it as
a missing dependency.

## 7. Config, Env, and Secrets

Environment access flows through the `Config` module into a single Env-style
service — not scattered `process.env` / platform-`env` reads inside services.

```typescript
// GOOD
const envConfig = Config.all({
  PORT: Config.number("PORT").pipe(Config.withDefault(3000)),
  API_TOKEN: Config.redacted("API_TOKEN"),          // secret → Redacted
  SENTRY_DSN: optionalString("SENTRY_DSN"),          // optional → Option
})

const makeEnv = Effect.gen(function* () {
  const env: EnvShape = yield* envConfig
  if (env.ORG_ID.trim().length === 0) {
    // fatal misconfiguration at startup = tagged DEFECT, not a typed failure
    return yield* Effect.die(new EnvValidationError({ message: "ORG_ID empty" }))
  }
  return Env.of(env)
})
```

Checklist:
- **Secrets are `Redacted.Redacted<string>`** (`Config.redacted`) — flag a
  secret typed as plain `string`.
- **Optional config is `Option`**, not `string | undefined`.
- **Startup misconfiguration dies** with a tagged error (`Effect.die`) — it is
  a defect, not a recoverable failure.

## 8. Default-Bearing Values Use `Context.Reference`

For configuration or values with a sensible default, use `Context.Reference` —
it resolves to its `defaultValue` when no layer provides it. It is also the
right seam for **injectable ambient capabilities in tests** (clock, uuid,
fetch bundles):

```typescript
// GOOD
const LogLevel = Context.Reference<"info" | "warn" | "error">("myapp/LogLevel", {
  defaultValue: () => "info" as const,
})

// GOOD — class form as a test seam: production uses the default,
// tests provide a Layer.succeed override
export class AlertRuntime extends Context.Reference<AlertRuntimeShape>("myapp/AlertRuntime", {
  defaultValue: (): AlertRuntimeShape => ({
    now: Clock.currentTimeMillis,
    makeUuid: () => crypto.randomUUID(),
  }),
}) {}
```
