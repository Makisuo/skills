# Error Patterns Checklist

## 1. Schema.TaggedError With HTTP Annotations

All errors reaching HTTP boundaries must use `Schema.TaggedError` with `HttpApiSchema.annotations`.

```typescript
// GOOD
export class ResourceNotFound extends Schema.TaggedError<ResourceNotFound>()(
  "@myorg/api/errors/ResourceNotFound",
  {
    type: Schema.optionalWith(ErrorType, { default: () => "invalid_request_error" as const }),
    code: Schema.optionalWith(ErrorCode, { default: () => "resource_missing" as const }),
    message: Schema.optionalWith(Schema.String, {
      default: () => "The requested resource was not found.",
    }),
    param: Schema.String.pipe(Schema.optional),
    resource_type: Schema.String.pipe(Schema.optional),
    resource_id: Schema.String.pipe(Schema.optional),
  },
  HttpApiSchema.annotations({ status: 404, title: "Resource Not Found" })
) {}

// BAD
class NotFoundError extends Error {
  constructor(message: string) { super(message) }
}
```

## 2. Reverse Domain Notation for Tags

Error tags should use reverse domain notation matching the package structure.

```typescript
// GOOD
"@myorg/api/errors/ResourceNotFound"
"@myorg/subscriptions/errors/CheckoutInitiation"

// BAD
"ResourceNotFound"
"NotFoundError"
```

## 3. Static Factory Methods

Errors should have convenience constructors for common cases.

```typescript
// GOOD
export class ResourceNotFound extends Schema.TaggedError<ResourceNotFound>()(...) {
  static fromId(resourceType: string, id: string) {
    return new ResourceNotFound({
      message: `No such ${resourceType}: '${id}'`,
      param: "id",
      resource_type: resourceType,
      resource_id: id,
    })
  }
}

export class BadRequestError extends Schema.TaggedError<BadRequestError>()(...) {
  static invalidParam(param: string, message: string) {
    return new BadRequestError({ code: "parameter_invalid", message, param })
  }
  static missingParam(param: string) {
    return new BadRequestError({
      code: "parameter_missing",
      message: `Missing required parameter: ${param}`,
      param,
    })
  }
}
```

## 4. Rich Context Fields

Errors must include enough context for debugging. Never lose valuable information.

```typescript
// GOOD - preserves context
new PaymentProcessingError({
  message: `Failed to process payment for subscription ${subscriptionId}`,
  subscriptionId,
  provider,
  cause: originalError,
})

// BAD - loses info
new PaymentProcessingError({ message: "Payment failed" })
new Error("something went wrong")
```

## 5. catchTag/catchTags Only

Never use `catchAll` or `mapError`. Always handle specific error tags.

```typescript
// GOOD
yield* effect.pipe(
  Effect.catchTag("DatabaseError", (e) =>
    Effect.fail(ResourceNotFound.fromId("paywall", String(id)))
  ),
  Effect.catchTag("ValidationError", (e) =>
    Effect.fail(BadRequestError.invalidParam("input", e.message))
  )
)

// BAD
yield* effect.pipe(
  Effect.catchAll((e) => Effect.fail(new InternalError({ message: String(e) })))
)
yield* effect.pipe(
  Effect.mapError((e) => new InternalError({ message: "failed" }))
)
```

## 6. Explicit Error Types

Error types should be specific to the domain, not generic. The error channel should tell you exactly what went wrong.

```typescript
// GOOD
Effect<Paywall, PaywallNotFoundError | PaywallArchived | Unauthorized>

// BAD
Effect<Paywall, Error>
Effect<Paywall, unknown>
```

## 7. Don't Catch HTTP-Annotated Errors

Let errors with `HttpApiSchema.annotations` propagate to the HTTP layer for automatic status code mapping. Don't re-wrap them.

```typescript
// GOOD - let ResourceNotFound propagate
yield* paywallRepo.findById(id)

// BAD - catching and re-wrapping
yield* paywallRepo.findById(id).pipe(
  Effect.catchTag("ResourceNotFound", () =>
    Effect.fail(new GenericError({ message: "not found" }))
  )
)
```

## 8. Fire-and-Forget for Non-Critical Operations

For operations that shouldn't fail the request, use `Effect.tapError` + `Effect.ignore`:

```typescript
// GOOD
yield* db.execute(...).pipe(
  Effect.tapError((e) => Effect.logWarning("Failed to update", { error: e })),
  Effect.ignore
)
```
