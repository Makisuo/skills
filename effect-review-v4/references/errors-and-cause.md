# Errors & Cause Checklist (v4)

## 1. `Schema.TaggedErrorClass` for Wire Errors, `Data.TaggedError` for Internal

Both are correct v4 forms — **the split is by purpose, not preference**:

- **`Schema.TaggedErrorClass`** for errors that cross a serialization boundary
  (HTTP API contracts, RPC). These carry an HTTP-status annotation (e.g.
  `httpApiStatus`) so the API layer and telemetry can classify them. (Note the
  v3 name `Schema.TaggedError` was renamed.)
- **`Data.TaggedError`** for internal plumbing errors that never leave the
  process. Do NOT flag these as "should be schema-backed".

```typescript
// GOOD — wire error with status annotation
export class ResourceNotFound extends Schema.TaggedErrorClass<ResourceNotFound>()(
  "@myorg/http/errors/ResourceNotFound",
  {
    message: Schema.String,
    resourceType: Schema.String,
    resourceId: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

// GOOD — internal error, lightweight
import { Data } from "effect"
export class R2Error extends Data.TaggedError("@myorg/storage/R2Error")<{
  message: string
  cause: unknown
}> {}

// BAD
class NotFoundError extends Error {
  constructor(message: string) { super(message) }
}
```

If the repo derives behavior from the status annotation (e.g. anticipated-4xx
span classification — see `observability.md`), **flag a wire error missing
it**.

## 2. Tag Names, `message`, Rich Context, Factory Methods

- Use reverse-domain tag names matching the package structure
  (`@myorg/pkg/SomethingError`).
- Include a `message` field and enough context fields to debug without
  reproducing.
- **Never name a field `pipe`** (or any Effect prototype member) — it shadows
  the `.pipe` combinator on every instance (see `schema.md`).
- Add static factory methods for common construction sites.

```typescript
// GOOD
static of(resourceType: string, id: string) {
  return new ResourceNotFound({
    message: `No such ${resourceType}: '${id}'`,
    resourceType,
    resourceId: id,
  })
}

// BAD — loses context
new ResourceNotFound({ message: "not found" })
```

## 3. Split Retryable vs Terminal Upstream Errors

When wrapping an upstream system, define **distinct error classes** for
transient/retryable failures (transport errors, 5xx, 429) vs terminal
rejections (4xx, validation) so retry policies can discriminate by type:

```typescript
// GOOD
class UpstreamUnavailableError extends ... {}   // retryable → maps to 503
class UpstreamRejectedError extends ... {}      // terminal → maps to 400

effect.pipe(Effect.retry({ schedule, while: (e) => e._tag === "@myorg/UpstreamUnavailableError" }))
```

Map raw driver/transport errors into domain errors at the boundary with small
`to*Error` / `map*Error` helpers — don't let `HttpClientError` or driver error
types propagate through service signatures.

## 4. Yieldable Errors — `return yield*`

Tagged errors are yieldable; fail by yielding the error instance directly. Always
`return` so TypeScript sees the generator stops.

```typescript
// GOOD
return yield* new ParseError({ input, message: "unexpected token" })

// Also fine
return yield* Effect.fail(new ParseError({ input, message: "..." }))
```

## 5. v4 `catch*` Combinator Names

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

// BAD — v3 names (renamed/removed)
effect.pipe(Effect.catchAll(...))
effect.pipe(Effect.catchAllCause(...))
effect.pipe(Effect.catchSome(...))   // now catchFilter
```

Mistyping `catchAll` produces TS2339 **plus** a cascade of `unknown`/`never`
iterator errors on the surrounding `yield*` — recognize that signature.

## 6. Prefer `catchTag` / `catchTags` Over Broad `catch` + `_tag` Sniffing

Handle specific error tags so the error channel stays precise. Reserve
`Effect.catch` for a genuine final fallback, and `Effect.catchCause` for
best-effort side channels (logging/telemetry paths that must never fail the
main flow).

```typescript
// GOOD
effect.pipe(
  Effect.catchTag("DatabaseError", (e) => Effect.fail(ResourceNotFound.of("row", e.id))),
  Effect.catchTags({
    ValidationError: (e) => Effect.fail(new BadRequest({ message: e.message })),
    TimeoutError: () => Effect.succeed(emptyResult),
  }),
)

// BAD — broad catch with manual _tag sniffing (reinvents catchTags, loses typing)
effect.pipe(Effect.catch((e) => {
  if ((e as any)._tag === "ValidationError") { ... }
  return Effect.fail(new InternalError({ message: String(e) }))
}))

// BAD — collapses every error into one
effect.pipe(Effect.catch((e) => Effect.fail(new InternalError({ message: String(e) }))))
```

Note: narrowing an *existing* broad `catch` into `catchTags` can surface
previously-swallowed errors to callers — behavior-risk, verify the intended
contract (see `known-pitfalls.md`).

## 7. `catchReason` / `catchReasons` for Nested Reasons

When a tagged error carries a tagged `reason` field, handle the inner reason
with `Effect.catchReason` (one) or `Effect.catchReasons` (many) without removing
the parent error from the channel.

```typescript
// GOOD
effect.pipe(
  Effect.catchReason("AiError", "RateLimitError", () => Effect.succeed(cached)),
)
```

## 8. Specific Error Types in the Channel

The error channel should name exactly what can go wrong. Never `Error` or
`unknown`. Flag brand-bypass casts used to dodge this (`as unknown as E`).

```typescript
// GOOD
Effect<User, UserNotFoundError | SessionExpiredError>

// BAD
Effect<User, Error>
Effect<User, unknown>
```

## 9. `Cause` Is Flattened in v4

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
- Extractors: `Cause.findErrorOption` (`Option`), `Cause.findError` (`Result`),
  `Cause.squash` for a best-effort single value (common in tests/toasts).
- `Cause.combine(a, b)` replaces `sequential` / `parallel`.
- Built-in error classes are `*Error`, not `*Exception` (`NoSuchElementError`,
  `TimeoutError`, `IllegalArgumentError`, `UnknownError`).
