# Effect Primitives Checklist (v4)

In Effect code, prefer Effect's data modules over native JS equivalents. These
modules are stable in v4 and imported from the top-level `effect` namespace.

## 1. `Array` / `HashMap` Over Native

Use `Array` from `effect` for functional array operations and `HashMap` for
keyed lookups instead of plain objects or `Map`.

```typescript
// GOOD
import { Array, HashMap } from "effect"
const ids = Array.map(items, (item) => item.id)
const lookup = HashMap.fromIterable(items.map((i) => [i.id, i]))

// BAD — native .map in Effect service code
const ids = items.map((item) => item.id)
```

## 2. `Effect.forEach` Over `for` Loops

Any loop whose body runs an Effect must use `Effect.forEach`. It supports a
`concurrency` option for parallelism.

```typescript
// GOOD
yield* Effect.forEach(users, (user) => sendNotification(user), { concurrency: 5 })

// BAD
for (const user of users) {
  yield* sendNotification(user)
}
```

## 3. `Match` Over `switch`

Match on discriminated unions or string literals with `Match.value` /
`Match.type` and `Match.exhaustive` so new cases are caught at compile time.

```typescript
// GOOD
import { Match } from "effect"
const label = Match.value(status).pipe(
  Match.when("draft", () => "Draft" as const),
  Match.when("published", () => "Live" as const),
  Match.exhaustive,
)

// BAD
switch (status) {
  case "draft": return "Draft"
  case "published": return "Live"
}
```

For tagged unions defined with `Data.taggedEnum`, the generated `$match` helper
is also acceptable.

## 4. `Option` Over `null` / `undefined`

In Effect services, repositories, and domain types, model absence with
`Option<T>` and consume it with `Option.match` / `map` / `getOrElse` — not `?.`
chains or `?? `.

```typescript
// GOOD
import { Option } from "effect"
const name = Option.match(user.displayName, {
  onNone: () => "Anonymous",
  onSome: (n) => n,
})

// BAD — in Effect service code
const name = user?.displayName ?? "Anonymous"
```

`?.` and `??` are fine in React components and plain non-Effect utilities; flag
them only in Effect services, repositories, and handlers.
