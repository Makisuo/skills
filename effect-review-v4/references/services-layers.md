# Services & Layers Checklist (v4)

In Effect v4, all service definitions use `Context.Service`. `Context.Tag`,
`Context.GenericTag`, `Effect.Tag`, and `Effect.Service` no longer exist.

## 1. Define Services with `Context.Service` Class Syntax

Prefer the class syntax. Type parameters come first (`<Self, Shape>()`), then the
identifier string is passed to the returned constructor.

```typescript
// GOOD
import { Context, Effect } from "effect"

export class Database extends Context.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<Array<unknown>, DatabaseError>
}>()("myapp/db/Database") {}

// BAD — v3 tags
class Database extends Context.Tag("Database")<Database, { ... }>() {}
class Database extends Effect.Service<Database>()("Database", { ... }) {}
```

The identifier string should include the package name and the path to the
service file (e.g. `"myapp/db/Database"`).

## 2. Provide an Explicit `layer` Static — No Auto-Generated Layer

`Context.Service` does **not** auto-generate a layer. Build it yourself with
`Layer.effect`. There is no `dependencies` option — wire dependencies with
`Layer.provide`.

```typescript
// GOOD
export class Logger extends Context.Service<Logger, {
  readonly log: (msg: string) => Effect.Effect<void>
}>()("myapp/Logger", {
  make: Effect.gen(function* () {
    const config = yield* Config
    return Logger.of({
      log: (msg) => Effect.log(`[${config.prefix}] ${msg}`),
    })
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

## 3. Construct Instances with `Self.of(...)`

Inside the `make` effect, return an instance via `Service.of({ ... })` so the
shape is type-checked.

```typescript
// GOOD
return Database.of({ query })

// BAD — returning a bare object literal
return { query }
```

## 4. Name the Primary Layer `layer`

v4 convention: the primary layer is `layer`. Variants get descriptive suffixes
(`layerTest`, `layerConfig`). Do not use the v3 `Default` / `Live` names.

```typescript
// GOOD
static readonly layer = Layer.effect(this, this.make)
static readonly layerTest = Layer.succeed(this, this.of(stubImpl))

// BAD
static readonly Default = ...
static readonly Live = ...
```

## 5. Compose with `Layer.mergeAll` and `Layer.provideMerge`

Use `Layer.mergeAll` for flat sibling composition and `Layer.provideMerge` /
`Layer.provide` to satisfy dependencies. Avoid deep nested `Layer.provide`
chains — they produce hard-to-read nested types.

```typescript
// GOOD
const CoreServices = Layer.mergeAll(
  AuthService.layer,
  OrgService.layer,
  ApiKeysService.layer,
).pipe(Layer.provideMerge(InfraLive))

const QueryServices = QueryService.layer.pipe(
  Layer.provideMerge(CoreServices),
  Layer.provideMerge(CacheService.layer),
)

// BAD — deeply nested provide chain
ServiceA.layer.pipe(
  Layer.provide(ServiceB.layer.pipe(Layer.provide(ServiceC.layer.pipe(...)))),
)
```

`provideMerge` keeps the provided layer in the output context; `provide` hides
it. Layers are memoized across `Effect.provide` calls, so a shared layer is
built once.

## 6. Prefer `yield* Service` Over `Service.use`

Accessor proxies were removed in v4. Access a service by yielding it in a
generator — this keeps the dependency visible in the call site's type. `use` /
`useSync` are convenience one-liners that hide the dependency; use them
sparingly.

```typescript
// GOOD — dependency visible in the Effect's R channel
const program = Effect.gen(function* () {
  const notifications = yield* Notifications
  yield* notifications.notify("hello")
})

// ACCEPTABLE one-liner, but hides the dependency at the call site
const program = Notifications.use((n) => n.notify("hello"))

// BAD — v3 static accessor proxy (removed)
const program = Notifications.notify("hello")
```

## 7. Default-Bearing Values Use `Context.Reference`

For configuration or values with a sensible default, use `Context.Reference` —
it resolves to its `defaultValue` when no layer provides it.

```typescript
// GOOD
const LogLevel = Context.Reference<"info" | "warn" | "error">("myapp/LogLevel", {
  defaultValue: () => "info" as const,
})
```
