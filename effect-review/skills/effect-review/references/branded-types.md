# Branded Types Checklist

## Core Rule

All entity IDs in the Superwall codebase MUST use branded types from `@superwall/drizzle/branded`. Never use plain `string` or `number` for IDs.

## Known Branded Types

Import from `@superwall/drizzle/branded`:

**Integer IDs (most common):**
`ApplicationId`, `OrganizationId`, `ProjectId`, `PaywallId`, `ProductId`, `EntitlementId`, `ExperimentId`, `UserId`, `MembershipId`, `VariantId`, `TriggerExperimentGroupId`, `PaywallTemplateId`, `PaywallTriggerId`, `CampaignId`, `PaywallVersionId`, `PaywallSnapshotId`

**String IDs:**
`PublicApiKey`, `PrivateApiKey`

**FromString variants (for URL params):**
`ApplicationIdFromString`, `OrganizationIdFromString`, `PaywallIdFromString`, `ProjectIdFromString`, `ProductIdFromString`, `EntitlementIdFromString`, `CampaignIdFromString`

## Checklist

### 1. Function Parameters Use Branded Types Directly

```typescript
// GOOD
const findById = (productId: ProductId, organizationId: OrganizationId) => ...

// BAD
const findById = (productId: number, organizationId: number) => ...
```

### 2. No `as` Casting for IDs

```typescript
// GOOD
import { Schema } from "effect"
const id = Schema.decodeSync(ApplicationId)(rawValue)
// or use the branded constructor
const id = ApplicationId.make(rawValue)

// BAD
const id = rawValue as ApplicationId
const id = someNumber as unknown as ApplicationId
```

### 3. *FromString Variants for URL/Route Params

URL params arrive as strings. Use `*FromString` schemas to decode them.

```typescript
// GOOD
const params = Schema.Struct({
  applicationId: ApplicationIdFromString,
  paywallId: PaywallIdFromString,
})

// BAD
const applicationId = parseInt(req.params.applicationId) as ApplicationId
```

### 4. Drizzle Schema Alignment

When a Drizzle column uses a branded type, all code accessing that column must use the same branded type throughout. Check that:
- Repository method params match column types
- Service method params propagate branded types (not plain numbers)
- API handler params decode to branded types before passing to services

### 5. No Plain string/number in Domain Types

```typescript
// GOOD
interface PaywallConfig {
  paywallId: PaywallId
  applicationId: ApplicationId
}

// BAD
interface PaywallConfig {
  paywallId: number
  applicationId: number
}
```

## Where to Check

- Function signatures (params and return types)
- Interface/type definitions containing IDs
- Schema definitions for API input/output
- Drizzle query `.where()` clauses
- Variable declarations storing IDs
