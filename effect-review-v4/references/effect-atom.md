# Effect Atom Checklist (v4)

In v4, the atom reactivity layer lives in core Effect at
`effect/unstable/reactivity` — `Atom`, `AtomHttpApi`, `AtomRegistry`,
`AsyncResult` — with React bindings via the atom hooks (`useAtom`,
`useAtomValue`, `useAtomSet`, `useAtomRefresh`).

**Before flagging Result-API usage, read the app's shim.** Apps typically
re-export atoms through a local module (e.g. `lib/effect-atom.ts`) that adds
their own `Result` helpers over `AsyncResult` — the available builder methods
are whatever the shim defines (e.g. `onSuccess / onInitial / onError / orElse /
render`), not a remembered upstream API. Do not flag "missing `onErrorTag`" or
similar methods that don't exist in the shim.

## 1. Create Atoms at Module Scope

`Atom.make`, `Atom.fn`, and `Atom.family` must be called **outside** React
render. Creating an atom inside a component makes a new atom every render and
loses its state.

```typescript
// GOOD — module scope
const countAtom = Atom.make(0)

// BAD — recreated every render
function Counter() {
  const countAtom = Atom.make(0)
  ...
}
```

## 2. Effect-Backed Atoms Run on the Shared AtomRuntime ⚠️

An Effect-backed atom that uses the app's API client — or whose spans should
reach the app's tracer — must be built from the shared runtime
(`AppApiClient.runtime.atom(...)`), **not** bare `Atom.make(effect)`.

Why (real production bug): bare `Atom.make(effect)` runs on the *default* atom
runtime, which lacks the app's telemetry layer. Child spans that internally
re-provide the client layer still export, but the atom's own wrapper span never
flushes — producing **rootless traces** where children point at a parent that
was never exported. Composite atoms wrapping several queries in `Effect.all`
are the classic victim.

```typescript
// GOOD — composite atom on the shared runtime
const family = Atom.family((key: string) =>
  AppApiClient.runtime.atom(runComposite(key)))

// BAD — wrapper span silently dropped
const family = Atom.family((key: string) => Atom.make(runComposite(key)))
```

Scoped exception (do not flag): bare `Atom.make` is fine for **static values,
local UI state** (`Atom.make(false)`), derived atoms (`Atom.make((get) => ...)`),
and effects that don't go through the app's client (e.g. framework server
functions with their own transport).

Related: the shared runtime's **global layer registration order is
load-bearing** — layers that wrap the HTTP transport (auth-injecting fetch)
must be added before layers that consume it, or the memoized layer graph caches
the unwrapped transport (symptom: every API call unauthenticated). Treat
reorderings of `addGlobalLayer` calls as regressions.

## 3. Query Atoms: `Atom.family` Keyed by a Canonical String, With a TTL

Parameterized query atoms are module-level `Atom.family`s keyed by a
**canonically serialized string** (stable stringify of the input), so every
consumer passing equal inputs shares one atom → one fetch. Set an explicit
idle TTL / stale time per atom, with a rationale.

```typescript
// GOOD
const detailFamily = Atom.family((sha: string) =>
  AppApiClient.query("integrations", "commitDetail", { params: { sha }, timeToLive: "5 minutes" }))

const queryFamily = Atom.family((key: string) => {
  const atom = AppApiClient.runtime.atom(decodeAndRun(key))
  return Atom.setIdleTTL(atom, staleTime)
})
export const getQueryAtom = (input: Input) => queryFamily(encodeKey(input))

// BAD — object key: every call site creates a distinct family member
const queryFamily = Atom.family((input: Input) => ...)
```

## 4. Mutations: `useAtomSet(..., { mode: "promiseExit" })` + `Exit` Branching

Mutations are consumed with `mode: "promiseExit"` and the result handled by
branching on the `Exit` — not try/catch, not assuming success:

```typescript
// GOOD
const createRule = useAtomSet(AppApiClient.mutation("alerts", "createRule"), {
  mode: "promiseExit",
})
const exit = await createRule({ payload: buildRuleRequest(form), reactivityKeys: ["alertRules"] })
if (Exit.isSuccess(exit)) toast.success("Created")
else toast.error(getExitErrorMessage(exit, "Failed to create rule"))
```

Two paired rules:

- **`Schema.Class` payloads need `new` at the top level** — `payload: new
  UpdateRequest({...})`. A wholly-plain object fails the client encoder (class
  identity check) and dies as a defect **before any network request**; the UI
  sees only a generic failure. Nested class fields inside a `new` outer
  constructor are auto-constructed from plain literals — don't flag those. See
  `schema.md` §2.
- **`reactivityKeys` must pair** — the keys passed with a mutation must match
  the keys registered on the query atoms it invalidates, or the UI goes stale
  after writes.

## 5. Handle All `Result` States

Async atoms resolve to a `Result`/`AsyncResult` (initial / waiting / success /
failure). Render every state through the app's builder — never assume success.

```typescript
// GOOD (method names per the app's shim)
const result = useAtomValue(userAtom)
return Result.builder(result)
  .onInitial(() => <Spinner />)
  .onError((error) => <ErrorState error={error} />)
  .onSuccess((user) => <UserCard user={user} />)
  .orElse(() => null)

// BAD — ignores loading / error
const result = useAtomValue(userAtom)
return <UserCard user={result.value} />
```

Flag: raw `result.value` access without a success guard, and a builder chain
missing its terminal (`orElse` / `render`). A hook that deliberately returns
`Result.success(...)` unconditionally because its data source cannot fail
(e.g. a local live-query bridge) is fine when commented.

## 6. `keepAlive` for Persistent State

Atoms holding global state that must survive component unmount should be marked
`Atom.keepAlive`. Otherwise the atom resets when the last subscriber unmounts.

```typescript
// GOOD
const sessionAtom = Atom.make(initialSession).pipe(Atom.keepAlive)
```

## 7. Clean Up Side Effects with Finalizers

Atoms that register side effects (event listeners, subscriptions, timers)
should release them with `get.addFinalizer(...)`.

```typescript
// GOOD
const resizeAtom = Atom.make((get) => {
  const handler = () => get.setSelf(window.innerWidth)
  window.addEventListener("resize", handler)
  get.addFinalizer(() => window.removeEventListener("resize", handler))
  return window.innerWidth
})
```

## 8. External Sync Layers Re-Wrap into `Result`

When part of the data moves to a sync engine (Electric/TanStack DB live
queries) alongside atom-based fetching, the bridge hooks should re-wrap sync
results into the same `Result` shape (`Result.initial(true)` while loading,
`Result.success(...)` when live) so downstream components keep the single
`Result.builder` rendering path. Row schemas mirror the DB columns exactly and
row→document mappers mirror the server's mappers, decoding branded ids through
their schemas.
