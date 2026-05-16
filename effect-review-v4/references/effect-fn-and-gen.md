# Effect.fn & Generators Checklist (v4)

Effect v4 idiom: write effectful code with `Effect.gen` and `Effect.fn("name")`,
then attach extra behaviour with combinators.

## 1. Functions Returning an Effect Use `Effect.fn`

A function that returns an Effect should be wrapped with `Effect.fn` (named,
traced) or `Effect.fnUntraced` (no span). **Do not** write a plain function that
returns a bare `Effect.gen` — it loses the stack frame and tracing span.

```typescript
// GOOD — named + traced
export const fetchUser = Effect.fn("fetchUser")(function* (id: UserId) {
  const repo = yield* UserRepo
  return yield* repo.findById(id)
})

// GOOD — hot path / no span wanted
const parseRow = Effect.fnUntraced(function* (raw: string) {
  return yield* decodeRow(raw)
})

// BAD — function returning a bare Effect.gen
const fetchUser = (id: UserId) =>
  Effect.gen(function* () {
    const repo = yield* UserRepo
    return yield* repo.findById(id)
  })
```

The name string passed to `Effect.fn` should match the function name (or
`"Service.method"` for service methods).

## 2. Attach Combinators as `Effect.fn` Arguments

Extra behaviour (`Effect.catch`, `Effect.annotateLogs`, `Effect.withSpan`, …)
goes as **additional arguments** to `Effect.fn`, not `.pipe` on the result.

```typescript
// GOOD
export const effectFn = Effect.fn("effectFn")(
  function* (n: number) {
    return yield* doWork(n)
  },
  Effect.catch((error) => Effect.logError(`failed: ${error}`)),
  Effect.annotateLogs({ method: "effectFn" }),
)

// BAD — .pipe on the wrapped fn
export const effectFn = Effect.fn("effectFn")(function* (n: number) {
  return yield* doWork(n)
}).pipe(Effect.catch((e) => Effect.logError(String(e))))
```

A standalone `Effect.gen` block, by contrast, *is* extended with `.pipe`.

## 3. `return yield*` When Raising Errors

Always `return` when yielding a terminal effect (an error, `Effect.fail`,
`Effect.interrupt`) so TypeScript understands the generator stops there.

```typescript
// GOOD
Effect.gen(function* () {
  if (!valid) {
    return yield* new ValidationError({ message: "invalid input" })
  }
  return yield* process()
})

// BAD — missing return; TS thinks execution continues
Effect.gen(function* () {
  if (!valid) {
    yield* new ValidationError({ message: "invalid input" })
  }
  return yield* process()
})
```

## 4. No `try` / `catch`

Effect code never uses `try`/`catch`. Move errors into the Effect error channel.

```typescript
// GOOD
const data = yield* Effect.tryPromise({
  try: () => fetch(url).then((r) => r.json()),
  catch: (cause) => new FetchError({ cause }),
})

// GOOD — capture an effect's outcome without throwing
const outcome = yield* Effect.result(riskyEffect)

// BAD
try {
  const res = await fetch(url)
} catch (e) {
  throw new Error("fetch failed")
}
```

## 5. No `async` / `await`

Service methods and Effect functions return `Effect`, never `Promise`. No
`async`/`await` inside Effect implementations. Bridge Promise APIs with
`Effect.promise` / `Effect.tryPromise`.

```typescript
// BAD
const load = async (id: string) => {
  const row = await db.query(id)
  return row
}
```

## 6. `Clock` Over `Date.now` / `new Date`

Never read wall-clock time directly with `Date.now()` or `new Date()`. Use the
`Clock` module so time is testable (`TestClock` in tests).

```typescript
// GOOD
const now = yield* Clock.currentTimeMillis

// BAD
const now = Date.now()
const ts = new Date()
```

## 7. `Effect.gen` with `this` Uses the Options Object

When a generator needs `this`, v4 takes an options object — not a bare `self`
first argument.

```typescript
// GOOD (v4)
class Service {
  readonly base = 1
  compute = Effect.gen({ self: this }, function* () {
    return this.base + 1
  })
}

// BAD — v3 signature
compute = Effect.gen(this, function* () {
  return this.base + 1
})
```

## 8. Prefer `Effect.gen` / `Effect.fn` Over Bare Combinator Chains

Imperative generator style is the v4 default — it reads like async/await and is
easier to maintain than long `.pipe(Effect.flatMap(...), Effect.map(...))`
chains. Reserve combinators for cross-cutting concerns layered onto a generator.
