# OTEL / Observability Patterns Checklist

## 1. Effect.fn With Trace Names

`Effect.fn` replaces the pattern where an arrow function wraps `Effect.gen`. It does NOT apply to bare `Effect.gen` calls without a wrapping function. It also does NOT apply in `.test.ts` files.

```typescript
// BAD — arrow function wrapping Effect.gen, should use Effect.fn
const findById = (productId: ProductId) => Effect.gen(function* () {
  // no trace name, anonymous span
})

// GOOD — Effect.fn replaces the arrow function wrapper
const findById = Effect.fn("ProductRepository.findById")(function* (
  productId: ProductId,
  organizationId: OrganizationId
) {
  yield* Effect.annotateCurrentSpan("productId", productId)
  // ...
})

// FINE — bare Effect.gen without wrapping function, no Effect.fn needed
yield* Effect.gen(function* () {
  const user = yield* UserService
  // inline composition, not a named function
})
```

### Naming Convention

Follow `ServiceName.methodName` format consistently:
- `UserService.findById`
- `PaywallRepository.create`
- `CampaignService.createTrigger`
- `OrgResolver.resolveProjectAccess`

## 2. annotateCurrentSpan With Essential Data

Annotate spans with entity IDs and key business values. Don't over-annotate with internal state or step-by-step progress.

```typescript
// GOOD - essential IDs and context
yield* Effect.annotateCurrentSpan("applicationId", applicationId)
yield* Effect.annotateCurrentSpan("paywallId", paywallId)
yield* Effect.annotateCurrentSpan("action", "create")

// BAD - over-annotating
yield* Effect.annotateCurrentSpan("step", "1")
yield* Effect.annotateCurrentSpan("loopIndex", i)
yield* Effect.annotateCurrentSpan("intermediateResult", JSON.stringify(result))

// BAD - sensitive data
yield* Effect.annotateCurrentSpan("apiKey", apiKey)
yield* Effect.annotateCurrentSpan("userEmail", email)
```

### What to Annotate

- Entity IDs (applicationId, paywallId, userId, etc.)
- Action being performed (create, update, delete)
- Key discriminators (platform, provider, scope)
- Counts (itemCount, resultCount) when relevant

### What NOT to Annotate

- PII (emails, names, addresses)
- Secrets (API keys, tokens)
- Large payloads (full request/response bodies)
- Step-by-step progress counters

## 3. Structured Logging

Use `Effect.log` / `Effect.logInfo` / `Effect.logWarning` / `Effect.logError` with structured data. Never use `console.log`.

```typescript
// GOOD
yield* Effect.logInfo("Processing payment").pipe(
  Effect.annotateLogs({ orderId, amount, provider })
)

// BAD
console.log(`Processing payment for order ${orderId}`)
console.log("Payment result:", result)
```

## 4. Error Spans

Errors should carry enough context for debugging without needing to look at other spans. Include entity IDs and operation context in error construction.

```typescript
// GOOD
new ResourceNotFound({
  message: `No such paywall: '${paywallId}'`,
  resource_type: "paywall",
  resource_id: String(paywallId),
})

// BAD
new ResourceNotFound({ message: "Not found" })
```

## 5. Effect.withSpan for Non-fn Contexts

When `Effect.fn` isn't appropriate (inline pipelines, one-off compositions), use `Effect.withSpan`:

```typescript
// GOOD
const result = yield* someEffect.pipe(
  Effect.withSpan("OrgResolver.fromProject", {
    attributes: { projectId, scope }
  })
)
```
