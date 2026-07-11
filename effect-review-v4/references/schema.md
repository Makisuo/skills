# Schema Checklist (v4)

Schema was substantially reworked in v4. Many v3 APIs were renamed or
restructured.

## 1. Object Shapes and Classes

Use `Schema.Struct` for object shapes and `Schema.Class` for schema-backed
classes.

```typescript
// GOOD
const User = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

class ErrorIssue extends Schema.Class<ErrorIssue>("ErrorIssue")({
  id: ErrorIssueId,
  serviceName: Schema.String,
  priority: Schema.Number,
}) {}
```

All runtime validation should use `Schema` — no Zod, no manual `typeof` /
`instanceof` guards for parsing. Use `Schema.NullOr(S)` for response fields
that are present-but-nullable (distinct from optional).

## 2. `Schema.Class` Values Are Constructed with `new` — at the Top Level

Anywhere a value *typed as a `Schema.Class`* reaches an **encoder** — HTTP
client mutation payloads, response encoding — the top-level value must be a
real instance (`new ClassName({...})`). Class encoders check class identity,
not just shape: a wholly-plain object fails with `Expected ClassName, got
{...}`, and in HTTP clients that failure is typically converted to a **defect**
(`Effect.die`), so the caller sees a generic error with **no network request
made**.

```typescript
// GOOD
mutate({ payload: new ErrorIssueTransitionRequest({ toState }) })

// BAD — dies client-side before any fetch
mutate({ payload: { toState } })
```

**Nested class fields are NOT a violation** (verified empirically on beta.93):
the class constructor's `make` recursively **constructs** nested class values
from plain literals — `new Response({ items: [{ name: "x" }] })` produces real
`Item` instances and encodes fine. Only flag a **plain top-level object**
handed to an encoder; do not flag plain literals for nested class fields under
a `new` outer constructor. (A past review reported this as a Critical and was
wrong.)

## 3. Never Name a Field After an Effect Prototype Member (`pipe`)

A schema field named `pipe` shadows the `.pipe` method on every instance of
that class — `error.pipe(...)` silently becomes a property read. This was a
real Critical that required renaming a field across ~90 sites. Use `pipeName`
or similar.

```typescript
// BAD — instance.pipe is now a string, not the combinator
class WarehouseQueryError extends Schema.TaggedErrorClass<...>()("...", {
  pipe: Schema.String,
}) {}
```

## 4. Branded Types via `Schema.brand`

Brand all entity IDs so they are not interchangeable with plain strings.
Validation is applied with `.check(...)`. Prefer shared brand *factory helpers*
(one place defining the check + brand + annotation) over ad-hoc inline brands.

```typescript
// GOOD
const TraceId = Schema.String.check(Schema.isMinLength(1), Schema.isTrimmed()).pipe(
  Schema.brand("@myorg/TraceId"),
  Schema.annotate({ identifier: "@myorg/TraceId", title: "Trace ID" }),
)
type TraceId = Schema.Schema.Type<typeof TraceId>

// BAD — plain string for an entity ID
const traceId: string = row.trace_id
```

Never bypass a brand with a cast (`row.id as AlertRuleId`) — decode through the
schema (`Schema.decodeUnknownSync(AlertRuleId)(row.id)`).

## 5. Filters Are `is`-Prefixed and Applied with `.check`

v4 renamed all filters with an `is` prefix; apply them via `.check(...)`.

```typescript
// GOOD
Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/@/))
Schema.String.check(Schema.isUUID())

// BAD — v3 bare filters
Schema.Number.pipe(Schema.greaterThanOrEqualTo(0))
Schema.String.pipe(Schema.pattern(/@/))
Schema.UUID
```

Common renames: `minLength` → `isMinLength`, `maxLength` → `isMaxLength`,
`pattern` → `isPattern`, `greaterThan` → `isGreaterThan`, `int` → `isInt`,
`length` → `isLengthBetween`. `UUID` → `String.check(isUUID())`, `ULID` →
`String.check(isULID())`. Note: `positive` / `negative` / `nonNegative` were
removed — use `isGreaterThan(0)` etc.

## 6. Constructors Take Arrays, Not Variadic Arguments

`Union`, `Tuple`, `Literals`, and `TemplateLiteral` take a single array.

```typescript
// GOOD
Schema.Union([UserSchema, AdminSchema])
Schema.Tuple([Schema.String, Schema.Number])
Schema.Literals(["draft", "published", "archived"])
Schema.Null                              // was Literal(null)

// BAD — v3 variadic form
Schema.Union(UserSchema, AdminSchema)
Schema.Literal("draft", "published")
```

## 7. `optionalKey` vs `optional` — Direction Matters ⚠️

The semantic difference:

- `Schema.optionalKey(S)` — the key may be **absent**, but if present the value
  must be a valid `S`. **It rejects an explicit `undefined`.**
- `Schema.optional(S)` — the value may be `undefined`.

**TypeScript does not catch the difference** (an optional property `k?: T`
still admits `undefined` unless `exactOptionalPropertyTypes` is on), so a wrong
choice fails **only at runtime**, at construction/encode time.

Decision rule:

- **Decode-only schemas** (JSON responses, DB rows, webhook payloads you never
  construct in JS) → `optionalKey` is correct and precise.
- **Schemas constructed or encoded from JS** (request payloads built in the
  client, widget configs, documents rebuilt via `new Class({...})`) →
  `optional`. JS code routinely passes `field: maybeUndefined`, and
  `optionalKey` throws on it (`Expected string, got undefined`).

**NEVER recommend a mass `optional → optionalKey` flip as a convention
cleanup.** Past reviews of this skill did exactly that — twice — and both were
reverted after breaking production at runtime (payload constructors threw on
`undefined` fields the UI legitimately passes).

What TO flag (the reverse direction):

- An `optionalKey` field on a JS-constructed schema whose call sites can pass
  `undefined` — that is a latent runtime crash.
- A construction site forwarding a possibly-`undefined` value into an
  `optionalKey` field. The safe form omits the key:

```typescript
// GOOD — omit the key when the value is undefined
new Doc({ ...(tags !== undefined && { tags }) })

// SAFE — spreading a *decoded* instance (absent optionalKey fields are
// genuinely absent from the object)
new Doc({ ...existing, name })

// BAD — throws at runtime if existing.tags is undefined
new Doc({ tags: existing.tags })
```

Any finding proposing an optionality change is **behavior-risk**: it must list
the construction sites and survive verification (see
`known-pitfalls.md` Part 2).

## 8. Compose Schemas with `decodeTo`

v3's `compose` is `decodeTo` in v4. Annotations use `Schema.annotate` (was
`annotations`).

```typescript
// GOOD
const Parsed = Schema.String.pipe(Schema.decodeTo(MySchema))
const Named = MySchema.pipe(Schema.annotate({ title: "My Schema" }))

// BAD — v3 names
Schema.compose(StringSchema, MySchema)
MySchema.pipe(Schema.annotations({ title: "My Schema" }))
```

## 9. Decoders

v4 decoder names: `decodeUnknownSync` (throws), `decodeUnknownEffect`,
`decodeUnknownExit`, `decodeUnknownOption`, `decodeUnknownResult` (and the
`decode*` variants for already-typed input). The bare `decodeUnknown` /
`decode` from v3 are now `decodeUnknownEffect` / `decodeEffect`. The
`validate*` family was removed — use `decode*` plus `Schema.toType`.

```typescript
// GOOD — in Effect code, prefer the Effect variant (typed error channel)
const userEff = yield* Schema.decodeUnknownEffect(User)(raw)

// GOOD — decodeUnknownResult pairs with Array.filterMap (Result-returning callback)
const valid = Array.filterMap(rows, (row) => Schema.decodeUnknownResult(Row)(row))

// GOOD — sync is fine at module init / fixtures
const id = Schema.decodeUnknownSync(AlertRuleId)("11111111-1111-4111-8111-111111111111")

// BAD — removed
Schema.validateSync(User)(raw)
// BAD — Sync + Effect.try in Effect code when decodeUnknownEffect exists
yield* Effect.try({ try: () => Schema.decodeUnknownSync(User)(raw), catch: ... })
```

Note: `Schema.Decoder` was removed in later betas — use `Schema.Codec<...>` for
a concrete schema-valued field/bound, `Schema.ConstraintDecoder<T>` for
decode-only generic bounds. Converting *existing* `decodeUnknownSync` call
sites to `decodeUnknownEffect` is **behavior-risk** (moves failures from thrown
defect to error channel) — fine for new code, audit callers for conversions.

## 10. Numeric Codecs for External Systems

Some backends serialize 64-bit integers as JSON **strings** (ClickHouse
`FORMAT JSON` quotes `UInt64`/`Int64` — the results of `count()`, `sum()`,
`uniq()` — while other paths return numbers). A bare `Schema.Number` on such a
column parses in dev and throws a `ParseError` (surfacing as a bodyless 500) in
the stringifying environment only.

```typescript
// GOOD — union codec accepts both encodings (maple: CH.CHNumber, attached via rowSchema)
const CHNumber = Schema.Union([Schema.Finite, Schema.FiniteFromString])

// BAD — breaks only against the backend that stringifies 64-bit ints
count: Schema.Number
```

Flag `Schema.Number` on fields decoded from a warehouse/driver known to
stringify 64-bit values; point at the repo's shared codec if one exists. Do not
suggest flipping driver-global settings like
`output_format_json_quote_64bit_integers: 0` — that corrupts genuinely large
64-bit values (hash fingerprints > 2^53).
