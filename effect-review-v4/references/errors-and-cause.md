# Errors & Cause Checklist (v4)

## 1. Define Errors with `Schema.TaggedErrorClass` or `Data.TaggedError`

v4 errors are tagged and yieldable — they can be `yield*`-ed directly inside
`Effect.gen`. Use `Schema.TaggedErrorClass` for schema-backed errors (validated,
serializable — note the v3 name `Schema.TaggedError` was renamed). Use
`Data.TaggedError` for lighter errors that do not need a schema.

```typescript
// GOOD — schema-backed
import { Schema } from "effect"

export class ParseError extends Schema.TaggedErrorClass<ParseError>()(
  "@myorg/codec/ParseError",
  {
    input: Schema.String,
    message: Schema.String,
  },
) {}

// GOOD — lightweight
import { Data } from "effect"

export class R2Error extends Data.TaggedError("R2Error")<{
  message: string
  cause: unknown
}> {}

// BAD
class NotFoundError extends Error {
  constructor(message: string) { super(message) }
}
```

## 2. Tag Names, `message`, Rich Context, Factory Methods

- Use reverse-domain tag names matching the package structure
  (`@myorg/pkg/SomethingError`).
- Include a `message` field and enough context fields to debug without
  reproducing.
- Add static factory methods for common construction sites.

```typescript
// GOOD
export class ResourceNotFound extends Schema.TaggedErrorClass<ResourceNotFound>()(
  "@myorg/api/ResourceNotFound",
  {
    message: Schema.String,
    resourceType: Schema.String,
    resourceId: Schema.String,
  },
) {
  static of(resourceType: string, id: string) {
    return new ResourceNotFound({
      message: `No such ${resourceType}: '${id}'`,
      resourceType,
      resourceId: id,
    })
  }
}

// BAD — loses context
new ResourceNotFound({ message: "not found" })
```

## 3. Yieldable Errors — `return yield*`

Tagged errors are yieldable; fail by yielding the error instance directly. Always
`return` so TypeScript sees the generator stops.

```typescript
// GOOD
return yield* new ParseError({ input, message: "unexpected token" })

// Also fine
return yield* Effect.fail(new ParseError({ input, message: "..." }))
```

## 4. v4 `catch*` Combinator Names

The catch-all family was renamed in v4. Use the new names:

| Purpose                    | v4 name                              |
|----------------------------|--------------------------------------|
| Catch all errors           | `Effect.catch`                       |
| Catch the full `Cause`     | `Effect.catchCause`                  |
| Catch defects              | `Effect.catchDefect`                 |
| Catch one/many error tags  | `Effect.catchTag` / `Effect.catchTags` |
| Conditional catch          | `Effect.catchIf`                     |
| Filtered catch             | `Effect.catchFilter` / `Effect.catchCauseFilter` |

```typescript
// GOOD — v4 names
effect.pipe(Effect.catch((e) => Effect.succeed(fallback)))
effect.pipe(Effect.catchCause((cause) => Effect.logError(cause)))

// BAD — v3 names (renamed)
effect.pipe(Effect.catchAll(...))
effect.pipe(Effect.catchAllCause(...))
effect.pipe(Effect.catchSome(...))   // now catchFilter
```

## 5. Prefer `catchTag` / `catchTags` Over Broad `catch`

Handle specific error tags so the error channel stays precise. Reserve
`Effect.catch` for a genuine final fallback.

```typescript
// GOOD
effect.pipe(
  Effect.catchTag("DatabaseError", (e) => Effect.fail(ResourceNotFound.of("row", e.id))),
  Effect.catchTags({
    ValidationError: (e) => Effect.fail(new BadRequest({ message: e.message })),
    TimeoutError: () => Effect.succeed(emptyResult),
  }),
)

// BAD — collapses every error into one
effect.pipe(Effect.catch((e) => Effect.fail(new InternalError({ message: String(e) }))))
```

## 6. `catchReason` / `catchReasons` for Nested Reasons

When a tagged error carries a tagged `reason` field, handle the inner reason
with `Effect.catchReason` (one) or `Effect.catchReasons` (many) without removing
the parent error from the channel.

```typescript
// GOOD
effect.pipe(
  Effect.catchReason("AiError", "RateLimitError", () => Effect.succeed(cached)),
)
```

## 7. Specific Error Types in the Channel

The error channel should name exactly what can go wrong. Never `Error` or
`unknown`.

```typescript
// GOOD
Effect<User, UserNotFoundError | SessionExpiredError>

// BAD
Effect<User, Error>
Effect<User, unknown>
```

## 8. `Cause` Is Flattened in v4

`Cause<E>` is now `{ reasons: ReadonlyArray<Reason<E>> }` where a `Reason` is
`Fail | Die | Interrupt`. The `Empty`, `Sequential`, and `Parallel` variants
were removed.

```typescript
// GOOD — iterate the flat reasons array
const firstError = (cause: Cause.Cause<string>) => {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) return reason.error
  }
  return undefined
}
const isEmpty = cause.reasons.length === 0

// BAD — v3 recursive tree / removed APIs
switch (cause._tag) {
  case "Sequential": ...
  case "Parallel": ...
  case "Empty": ...
}
Cause.isFailType(cause)   // removed — use Cause.isFailReason(reason)
```

Other v4 `Cause` notes:
- Predicates: `Cause.hasFails`, `Cause.hasDies`, `Cause.hasInterrupts`.
- Extractors: `Cause.findErrorOption` (`Option`), `Cause.findError` (`Result`).
- `Cause.combine(a, b)` replaces `sequential` / `parallel`.
- Built-in error classes are `*Error`, not `*Exception` (`NoSuchElementError`,
  `TimeoutError`, `IllegalArgumentError`, `UnknownError`).
