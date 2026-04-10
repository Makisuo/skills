# Effect-Atom Patterns Checklist

Effect-Atom (`@effect-atom/atom-react`) is the standard way to handle data fetching, mutations, and server state in React components in this codebase. If new UI code is NOT using Effect-Atom, recommend adopting it.

## Package & Imports

```typescript
import { Atom, AtomHttpApi, Result, Registry, RegistryContext } from "@effect-atom/atom-react"
import { AtomRpc } from "@effect-atom/atom-react"
import { useAtom, useAtomValue, useAtomSet, useAtomRefresh } from "@effect-atom/atom-react"
```

## 1. Use Typesafe Clients (AtomHttpApi or AtomRpc)

API calls to **our own Effect HttpApi or Effect RPC backends** should go through a **typesafe client** — `AtomHttpApi.Tag` for Effect HttpApi backends or `AtomRpc.Tag` for Effect RPC backends. This gives end-to-end type safety from the server schema to the client. Raw `fetch`/`axios` is acceptable for third-party/external APIs or non-Effect backends.

### HTTP API Client (AtomHttpApi)

For REST-style APIs defined with `HttpApi` from `@effect/platform`:

```typescript
// Define a typesafe client bound to your API schema
export class ApiClient extends AtomHttpApi.Tag<ApiClient>()(
  "@myorg/web/ApiClient",
  {
    api: MyApi,              // Your HttpApi definition (provides full type safety)
    httpClient: AuthClient,  // Pre-configured HTTP client with auth
    baseUrl: API_BASE,
  }
) {}

// Queries and mutations are fully typed from the API schema
export const usersAtom = ApiClient.query("users", "listUsers", { ... })
export const createUserMutation = ApiClient.mutation("users", "createUser")
```

### RPC Client (AtomRpc)

For Effect RPC services — provides end-to-end type safety from server to client:

```typescript
export class UsersClient extends AtomRpc.Tag<UsersClient>()(
  "@myorg/web/UsersClient",
  {
    group: UsersRpcGroup,
    protocol: makeProtocolLayer("/rpc/users"),
  }
) {}
```

### What to Flag

Only flag raw fetch/axios when targeting **our own Effect HttpApi or Effect RPC backends** where a typesafe client can derive types from the server schema. Calls to external APIs or non-Effect backends are fine.

```typescript
// BAD — raw fetch to our own API, no type safety
const res = await fetch("/api/users", { method: "POST", body: JSON.stringify(data) })
const users = await res.json() // `any` type, no validation

// FINE — external third-party API, we don't control it
const res = await fetch("https://api.stripe.com/v1/customers", { ... })

// GOOD — typesafe client for our own API
export const usersAtom = ApiClient.query("users", "listUsers", { timeToLive: "5 minutes" })
export const createUserMutation = ApiClient.mutation("users", "createUser")
```

## 2. Query Atoms for Data Fetching

Data fetching should use `AtomHttpApi.query()` or an RPC client, NOT `useState` + `useEffect` + `fetch`, and NOT React Query/SWR.

```typescript
// GOOD — query atom with TTL
export const usersAtom = ApiClient.query("users", "listUsers", {
  timeToLive: "5 minutes",
})

// Parameterized query — function returning atom
export const userAtom = (userId: UserId) =>
  ApiClient.query("users", "getUser", {
    urlParams: { user_id: userId },
    timeToLive: "3 minutes",
  })

// BAD — manual fetch with useState/useEffect
const [users, setUsers] = useState([])
const [loading, setLoading] = useState(true)
useEffect(() => {
  fetch("/api/users").then(res => res.json()).then(setUsers).finally(() => setLoading(false))
}, [])
```

## 3. Mutation Atoms for Write Operations

Mutations should use `AtomHttpApi.mutation()`.

```typescript
// GOOD
export const createUserMutation = ApiClient.mutation("users", "createUser")
export const deleteUserMutation = ApiClient.mutation("users", "deleteUser")

// BAD — manual fetch POST
const handleCreate = async () => {
  const res = await fetch("/api/users", { method: "POST", body: JSON.stringify(data) })
}
```

## 4. Consuming Queries — useAtomValue + Result.builder

Read query results with `useAtomValue`. Render states with `Result.builder()`.

```typescript
// GOOD
function UsersList() {
  const result = useAtomValue(usersAtom)

  return Result.builder(result)
    .onInitialOrWaiting(() => <Loading />)
    .onFailure((error) => <ErrorDisplay message={String(error)} />)
    .onSuccess((response) => (
      <ul>{response.data.map(u => <li key={u.id}>{u.name}</li>)}</ul>
    ))
    .render()
}

// BAD — manual state matching
function UsersList() {
  const result = useAtomValue(usersAtom)
  if (result.waiting) return <Loading />
  if (Result.isFailure(result)) return <Error />
  return <ul>...</ul>
}
```

## 5. Consuming Mutations — useAtom with Promise Mode

Use `useAtom(mutation, { mode: "promise" })` for mutations. Derive loading from `result.waiting`, NOT `useState`.

```typescript
// GOOD
const [result, mutate] = useAtom(createUserMutation, { mode: "promise" })
const isLoading = result.waiting

const handleSubmit = async () => {
  try {
    await mutate({ payload: formData })
    onSuccess?.()
  } catch (err) {
    showError(err)
  }
}

<Button disabled={isLoading}>
  {isLoading ? "Creating..." : "Create"}
</Button>

// BAD — useState for loading
const [isLoading, setIsLoading] = useState(false)
const handleSubmit = async () => {
  setIsLoading(true)
  try { await mutate({ payload }) } finally { setIsLoading(false) }
}
```

## 6. useAtomSet for Fire-and-Forget Mutations

When you only need the mutate function without tracking result state:

```typescript
// GOOD — multiple mutations, no state tracking needed
const setCreate = useAtomSet(createMutation, { mode: "promise" })
const setUpdate = useAtomSet(updateMutation, { mode: "promise" })
```

## 7. Cache Invalidation — useAtomRefresh

Invalidate query caches after mutations with `useAtomRefresh`. NOT manual refetch logic.

```typescript
// GOOD
const refreshUsers = useAtomRefresh(usersAtom)

const handleCreate = async () => {
  await mutate({ payload })
  refreshUsers() // Invalidate and refetch
}

// BAD — manual refetch state
const [refetchKey, setRefetchKey] = useState(0)
const handleCreate = async () => {
  await createUser(data)
  setRefetchKey(k => k + 1) // Force re-render
}
```

## 8. Derived/Computed Atoms — Atom.make

Combine multiple atoms into derived state with `Atom.make()`:

```typescript
// GOOD
export const dashboardAtom = (appId: ApplicationId) => {
  const usersAtom = chartDataAtom(appId, { metric: "users" })
  const revenueAtom = chartDataAtom(appId, { metric: "revenue" })

  return Atom.make((get) => {
    const combined = Result.all({
      users: get(usersAtom),
      revenue: get(revenueAtom),
    })
    return Result.map(combined, ({ users, revenue }) => ({
      totalUsers: users.total,
      totalRevenue: revenue.total,
    }))
  })
}
```

## 9. Dialog Pattern

Dialogs own their mutation hooks internally. Parent passes data props and `onOpenChange`/`onSuccess` callbacks.

```typescript
// GOOD — dialog owns mutation
function CreateUserDialog({ open, onOpenChange, organizationId }: Props) {
  const [result, mutate] = useAtom(createUserMutation, { mode: "promise" })
  const isLoading = result.waiting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={() => mutate({ payload: { organizationId, ...formData } })}>
        <Button disabled={isLoading}>{isLoading ? "Creating..." : "Create"}</Button>
      </form>
    </Dialog>
  )
}

// BAD — parent passes mutation handler
function CreateUserDialog({ open, onOpenChange, onSubmit, isLoading }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <Button disabled={isLoading}>Create</Button>
      </form>
    </Dialog>
  )
}
```

## What to Flag

- **Critical**: Raw `fetch`/`axios` calls to **our own Effect HttpApi/RPC backends** without a typesafe client (should use `AtomHttpApi` or `AtomRpc`). External APIs or non-Effect backends are fine.
- **Critical**: `useState` + `useEffect` + `fetch` for data fetching (should use Effect-Atom query atoms)
- **Critical**: `useState` for loading state when an atom mutation is available (`result.waiting`)
- **Warning**: Manual if/else for result states instead of `Result.builder()`
- **Warning**: Missing `useAtomRefresh` after mutations that affect visible queries
- **Info**: Recommend Effect-Atom if component uses React Query, SWR, or manual fetch patterns
