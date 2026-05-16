# Effect Atom Checklist (v4)

effect-atom is the reactive state layer for Effect-powered UIs. The React
bindings are `@effect/atom-react`; the core reactivity module lives at
`effect/unstable/reactivity`.

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

## 2. Async / Effect Atoms

Atoms backed by an Effect are created from an `AtomRuntime` (e.g.
`runtime.atom(...)` or `runtime.fn(...)`). Parameterized atoms use `Atom.family`
keyed by a serializable key.

```typescript
// GOOD
const userAtom = runtime.fn<UserId>()((id, _get) => fetchUser(id))
```

## 3. Read / Write with Hooks — Don't Mutate Imperatively

In components, use `useAtom` (read + write), `useAtomValue` (read), and
`useAtomSet` (write). Do not call atom update functions imperatively from
React outside these hooks.

```typescript
// GOOD
const [count, setCount] = useAtom(countAtom)
const value = useAtomValue(userAtom)
const setCount = useAtomSet(countAtom)

// BAD — imperative mutation from a component
Atom.update(countAtom, (n) => n + 1)
```

## 4. Handle All `Result` States

Async atoms resolve to a `Result` (initial / loading / success / failure).
Render every state — never assume success. `Result.builder` with `onErrorTag`
handles specific error tags.

```typescript
// GOOD
const result = useAtomValue(userAtom)
return Result.builder(result)
  .onInitial(() => <Spinner />)
  .onErrorTag("UserNotFoundError", () => <NotFound />)
  .onSuccess((user) => <UserCard user={user} />)
  .orNull()

// BAD — ignores loading / error
const result = useAtomValue(userAtom)
return <UserCard user={result.value} />
```

## 5. `keepAlive` for Persistent State

Atoms holding global state that must survive component unmount should be marked
`Atom.keepAlive`. Otherwise the atom resets when the last subscriber unmounts.

```typescript
// GOOD
const sessionAtom = Atom.make(initialSession).pipe(Atom.keepAlive)
```

## 6. Clean Up Side Effects with Finalizers

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

## 7. v4 Rename: `Context` → `AtomContext`

The atom context type was renamed from `Context` to `AtomContext` in v4. Code
that references the old `Atom.Context` type should use `Atom.AtomContext`.
