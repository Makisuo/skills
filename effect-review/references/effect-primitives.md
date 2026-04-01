# Effect Primitives Checklist

## 1. Effect Array/HashMap Over Native

Use `Array` from `effect` for functional array operations in Effect code. Use `HashMap` for key-value lookups instead of plain objects or `Map`.

```typescript
// GOOD
import { Array, HashMap } from "effect"
const ids = Array.map(items, (item) => item.id)
const lookup = HashMap.fromIterable(items.map((i) => [i.id, i]))

// BAD
const ids = items.map((item) => item.id) // native .map in Effect service code
```

## 2. Effect.forEach Over For Loops

Any loop body that performs an Effect must use `Effect.forEach`. Supports `concurrency` option for parallel execution.

```typescript
// GOOD
yield* Effect.forEach(users, (user) => sendNotification(user), { concurrency: 5 })

// BAD
for (const user of users) {
  yield* sendNotification(user)
}
```

## 3. Match Over Switch Statements

All `switch` statements on discriminated unions or string literals should use `Match.value()` or `Match.type<T>()` with `Match.exhaustive`.

```typescript
// GOOD
import { Match } from "effect"
const result = Match.value(platform).pipe(
  Match.when("IOS", () => "ios" as const),
  Match.when("ANDROID", () => "android" as const),
  Match.exhaustive
)

// BAD
switch (platform) {
  case "IOS": return "ios"
  case "ANDROID": return "android"
}
```

## 4. Option Over Optional Chaining

In Effect services and domain types, prefer `Option<T>` over `T | null | undefined`. Use `Option.match`, `Option.map`, `Option.getOrElse` instead of `?.` chains.

```typescript
// GOOD
import { Option } from "effect"
const name = Option.match(user.displayName, {
  onNone: () => "Anonymous",
  onSome: (name) => name
})

// BAD
const name = user?.displayName ?? "Anonymous" // in Effect service code
```

Note: `?.` is acceptable in React components and non-Effect utility code. Flag it only in Effect services/repositories/handlers.

## 5. Effect Schema Over Zod/Manual Validation

All runtime validation should use `Schema` from `effect`. No Zod imports. No manual `typeof`/`instanceof` guards for data parsing.

```typescript
// GOOD
import { Schema } from "effect"
const UserInput = Schema.Struct({
  name: Schema.String,
  email: Schema.String.pipe(Schema.pattern(/@/)),
})

// BAD
import { z } from "zod"
const UserInput = z.object({ name: z.string() })
```

## 6. Layer.provide Not Effect.provide

Dependencies should be composed via `Layer` in service definitions, not via `Effect.provide` at call sites. Exception: infrastructure bindings in entry points (e.g., `main.ts`).

```typescript
// GOOD
export class MyService extends Effect.Service<MyService>()("MyService", {
  dependencies: [DepA.Default, DepB.Default],
  effect: Effect.gen(function* () { ... })
}) {}

// Also GOOD (Layer.provide chain)
const MainLayer = ServiceA.Default.pipe(
  Layer.provideMerge(ServiceB.Default),
  Layer.provide(Database)
)

// BAD (providing at call site)
const result = yield* myEffect.pipe(Effect.provide(someLayer))
```

## 7. No try/catch

Everything uses Effect error channel. No `try { } catch { }` blocks in Effect code.

```typescript
// GOOD
yield* Effect.tryPromise({
  try: () => fetch(url),
  catch: (e) => new FetchError({ cause: e })
})

// BAD
try {
  const res = await fetch(url)
} catch (e) {
  throw new Error("fetch failed")
}
```

## 8. No Promise-Based Code

Service methods return `Effect`, not `Promise`. No `async/await` in Effect service implementations.

```typescript
// GOOD
const fetchUser = Effect.fn("fetchUser")(function* (id: UserId) {
  const user = yield* userRepo.findById(id)
  return user
})

// BAD
const fetchUser = async (id: string) => {
  const user = await userRepo.findById(id)
  return user
}
```
