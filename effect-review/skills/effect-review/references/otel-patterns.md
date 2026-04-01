# OTEL / Observability Patterns Checklist

## 1. Effect.fn With Trace Names

Every service method must use `Effect.fn("ServiceName.methodName")` for automatic span creation. Never use anonymous `() => Effect.gen(function* () { ... })` for service methods.

```typescript
// GOOD
const findById = Effect.fn("ProductRepository.findById")(function* (
  productId: ProductId,
  organizationId: OrganizationId
) {
  yield* Effect.annotateCurrentSpan("productId", productId)
  // ...
})

// BAD
const findById = (productId: ProductId) => Effect.gen(function* () {
  // no trace name, anonymous span
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
