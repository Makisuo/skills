# Branded Types Checklist

## Core Rule

All entity IDs MUST use branded types via `Schema.brand()`. Never use plain `string` or `number` for IDs. This prevents mixing up IDs of different entity types at compile time.

## How to Define Branded Types

```typescript
import { Schema } from "effect"

// Integer IDs
export const UserId = Schema.Int.pipe(Schema.brand("@myorg/schema/UserId"))
export type UserId = Schema.Schema.Type<typeof UserId>

// String IDs
export const ApiKey = Schema.String.pipe(Schema.brand("@myorg/schema/ApiKey"))
export type ApiKey = Schema.Schema.Type<typeof ApiKey>

// FromString variants (for URL params that arrive as strings)
export const UserIdFromString = Schema.NumberFromString.pipe(
  Schema.brand("@myorg/schema/UserId")
)
```

Define branded types for every entity ID in your domain (e.g., `UserId`, `OrganizationId`, `ProjectId`, `OrderId`, `ProductId`, etc.) and colocate them in a shared branded types module.

## Checklist

### 1. Function Parameters Use Branded Types Directly

```typescript
// GOOD
const findById = (userId: UserId, organizationId: OrganizationId) => ...

// BAD
const findById = (userId: number, organizationId: number) => ...
```

### 2. No `as` Casting for IDs

```typescript
// GOOD
import { Schema } from "effect"
const id = Schema.decodeSync(UserId)(rawValue)
// or use the branded constructor
const id = UserId.make(rawValue)

// BAD
const id = rawValue as UserId
const id = someNumber as unknown as UserId
```

### 3. *FromString Variants for URL/Route Params

URL params arrive as strings. Use `*FromString` schemas to decode them.

```typescript
// GOOD
const params = Schema.Struct({
  userId: UserIdFromString,
  projectId: ProjectIdFromString,
})

// BAD
const userId = parseInt(req.params.userId) as UserId
```

### 4. Database Schema Alignment

When a database column uses a branded type, all code accessing that column must use the same branded type throughout. Check that:
- Repository method params match column types
- Service method params propagate branded types (not plain numbers)
- API handler params decode to branded types before passing to services

### 5. No Plain string/number in Domain Types

```typescript
// GOOD
interface OrderConfig {
  orderId: OrderId
  userId: UserId
}

// BAD
interface OrderConfig {
  orderId: number
  userId: number
}
```

## Where to Check

- Function signatures (params and return types)
- Interface/type definitions containing IDs
- Schema definitions for API input/output
- Database query `.where()` clauses
- Variable declarations storing IDs
