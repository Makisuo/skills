# Effect.fn & Generators Checklist (v4)

Effect v4 idiom: write effectful code with `Effect.gen` and `Effect.fn("name")`,
then attach extra behaviour with combinators.

## 1. APIs That Do NOT Exist in the v4 Beta ⚠️

Never recommend these — and recognize the confusing errors they produce when
someone writes them from v3 muscle memory. When unsure whether an API exists,
grep the repo's vendored Effect source (the ground-truth path from the repo
conventions pass); do not trust memory.

| v3 habit | v4 reality | Symptom if used anyway |
|---|---|---|
| `Effect.fork` | `Effect.forkChild` (scoped), `Effect.forkScoped`, `Effect.forkDetach` (daemon), `Effect.forkIn` | `Effect.fork` is `undefined` → "not iterable" at runtime |
| `Effect.iterate` / `Effect.loop` | absent — imperative `while (true)` loop (with a comment) is the accepted form | TS2339 |
| `Effect.catchAll` | `Effect.catch` | TS2339 on `catchAll` **plus** cascading `unknown`/`never` iterator errors on the surrounding `yield*` |
| `Effect.timeoutFail` | `Effect.timeoutOrElse({ duration, orElse })` | TS2339 |
| `Effect.try(() => ...)` bare thunk | `Effect.try({ try, catch })` object form only (`Effect.sync` is still bare-thunk) | TS2345 "not assignable to `{ try; catch }`" |

Platform note: `FileSystem` / `Path` are core modules (`effect/FileSystem`,
`effect/Path`) with **bare tags** — `yield* FileSystem`, not
`FileSystem.FileSystem` from `@effect/platform`.

## 2. Functions Returning an Effect Use `Effect.fn`

A function that returns an Effect should be wrapped with `Effect.fn` (named,
traced) or `Effect.fnUntraced` (no span). **Do not** write a plain function that
returns a bare `Effect.gen` — it loses the stack frame and tracing span.

```typescript
// GOOD — named + traced
export const fetchUser = Effect.fn("UserService.fetchUser")(function* (id: UserId) {
  const repo = yield* UserRepo
  return yield* repo.findById(id)
})

// GOOD — pure validator / row mapper / hot path: no span wanted
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

The name string becomes the span name — use `"Service.method"` for service
methods. A module-level `Effect.fn` const sometimes needs an explicit
return-type annotation (`: (...) => Effect.Effect<A, E, R> = Effect.fn(...)`)
when inference cycles through the module.

## 3. Attach Combinators as `Effect.fn` Arguments

Extra behaviour (`Effect.catch`, `Effect.annotateLogs`, `Effect.withSpan`, …)
goes as **additional arguments** to `Effect.fn`, not `.pipe` on the result.
The trailing pipeables receive **`(effect, ...originalArgs)`** — so a per-call
handler that needs the function's input takes it as its second parameter:

```typescript
// GOOD
export const effectFn = Effect.fn("effectFn")(
  function* (n: number) {
    return yield* doWork(n)
  },
  Effect.catch((error) => Effect.logError(`failed: ${error}`)),
  Effect.annotateLogs({ method: "effectFn" }),
)

// GOOD — pipeable that uses the original argument
export const process = Effect.fn("process")(
  function* (input: Input) { ... },
  (effect, input) => Effect.catchCause(effect, (cause) =>
    Effect.logError("process failed", { input: input.id, cause })),
)

// BAD — .pipe on the wrapped fn
export const effectFn = Effect.fn("effectFn")(function* (n: number) {
  return yield* doWork(n)
}).pipe(Effect.catch((e) => Effect.logError(String(e))))
```

A standalone `Effect.gen` block, by contrast, *is* extended with `.pipe`.

## 4. `return yield*` When Raising Errors

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

## 5. No `try` / `catch`

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

## 6. No `async` / `await`

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

## 7. `Clock` Over `Date.now` / `new Date` — Inside the Effect Runtime

Inside Effect code (services, handlers, generators), read time via the `Clock`
module so it is testable (`TestClock` in tests).

```typescript
// GOOD
const now = yield* Clock.currentTimeMillis

// BAD — inside an Effect generator/service
const now = Date.now()
const ts = new Date()
```

Scope: this rule applies to code running **inside the Effect runtime**.
`Date.now()` in outer non-Effect glue — a raw platform handler timing a
diagnostic, a plain script — is fine; don't flag it.

## 8. `Effect.gen` with `this` Uses the Options Object

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

## 9. Prefer `Effect.gen` / `Effect.fn` Over Bare Combinator Chains

Imperative generator style is the v4 default — it reads like async/await and is
easier to maintain than long `.pipe(Effect.flatMap(...), Effect.map(...))`
chains. Reserve combinators for cross-cutting concerns layered onto a generator.

Corollary (see `known-pitfalls.md`): genuine control-flow loops — cursor
pagination, CAS-retry, poll-until-hit, accumulate-then-fail — stay as imperative
`while` loops in v4 (no `iterate`/`loop`), ideally with a comment saying so.
