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
`instanceof` guards for parsing.

## 2. Branded Types via `Schema.brand`

Brand all entity IDs so they are not interchangeable with plain strings.
Validation is applied with `.check(...)`.

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

## 3. Filters Are `is`-Prefixed and Applied with `.check`

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

## 4. Constructors Take Arrays, Not Variadic Arguments

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

## 5. `optionalKey` vs `optional`

- `Schema.optionalKey` — the key may be **absent** from the object. Use for
  JSON-decoded domain models / HTTP payloads.
- `Schema.optional` — the value may be `undefined`. Use for JS-side schemas
  (route search params, in-process tool params) where `undefined` is valid.

```typescript
// GOOD — HTTP payload, key may be missing
Schema.Struct({
  note: Schema.optionalKey(Schema.String),
})

// GOOD — JS-side, value may be undefined
Schema.Struct({
  filter: Schema.optional(Schema.String),
})
```

## 6. Compose Schemas with `decodeTo`

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

## 7. Decoders

v4 decoder names: `decodeUnknownSync` (throws), `decodeUnknownEffect`,
`decodeUnknownExit`, `decodeUnknownOption` (and the `decode*` variants for
already-typed input). The bare `decodeUnknown` / `decode` from v3 are now
`decodeUnknownEffect` / `decodeEffect`. The `validate*` family was removed —
use `decode*` plus `Schema.toType`.

```typescript
// GOOD
const user = Schema.decodeUnknownSync(User)(raw)
const userEff = yield* Schema.decodeUnknownEffect(User)(raw)

// BAD — removed
Schema.validateSync(User)(raw)
```
