# Error Patterns

## Schema.TaggedError for All Errors

**Always use `Schema.TaggedError`** for defining errors. This provides:

1. **Serialization** - Errors can be sent over RPC/network
2. **Type safety** - `_tag` discriminator enables `catchTag`
3. **Consistent structure** - All errors have predictable shape
4. **HTTP status mapping** - Via `HttpApiSchema.annotations`

### Basic Error Definition

```typescript
import { Schema } from "effect"
import { HttpApiSchema } from "@effect/platform"

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    {
        userId: UserId,
        message: Schema.String,
    },
    HttpApiSchema.annotations({ status: 404 }),
) {}

export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
    "UserCreateError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
    },
    HttpApiSchema.annotations({ status: 400 }),
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
    "UnauthorizedError",
    {
        message: Schema.String,
    },
    HttpApiSchema.annotations({ status: 401 }),
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
    "ForbiddenError",
    {
        message: Schema.String,
        requiredPermission: Schema.optional(Schema.String),
    },
    HttpApiSchema.annotations({ status: 403 }),
) {}
```

### Required Fields

Every error should have:
- `message: Schema.String` - Human-readable description
- Relevant context fields (IDs, etc.)
- Optional `cause: Schema.optional(Schema.String)` for error chains

## Error Handling with catchTag/catchTags

**Never use `catchAll` or `mapError`** when you can use `catchTag`/`catchTags`. These preserve type information and enable precise error handling.

### catchTag for Single Error Types

```typescript
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
    return yield* repo.findById(id).pipe(
        Effect.catchTag("DatabaseError", (err) =>
            Effect.fail(new UserNotFoundError({
                userId: id,
                message: `Database lookup failed: ${err.message}`,
            }))
        ),
    )
})
```

### catchTags for Multiple Error Types

```typescript
const processOrder = Effect.fn("OrderService.processOrder")(function* (input: OrderInput) {
    return yield* validateAndProcess(input).pipe(
        Effect.catchTags({
            ValidationError: (err) =>
                Effect.fail(new OrderValidationError({
                    message: err.message,
                    field: err.field,
                })),
            PaymentError: (err) =>
                Effect.fail(new OrderPaymentError({
                    message: `Payment failed: ${err.message}`,
                    code: err.code,
                })),
            InventoryError: (err) =>
                Effect.fail(new OrderInventoryError({
                    productId: err.productId,
                    message: "Insufficient inventory",
                })),
        }),
    )
})
```

### Why Not catchAll?

```typescript
// WRONG - Loses type information
yield* effect.pipe(
    Effect.catchAll((err) =>
        Effect.fail(new InternalServerError({ message: "Something failed" }))
    )
)

// Problems:
// 1. Can't distinguish error types downstream
// 2. Hides useful error context
// 3. Makes debugging harder
// 4. Frontend can't show specific messages
```

## Error Remapping Pattern

Create reusable error remapping functions for common transformations:

```typescript
import { Effect } from "effect"

export const withRemapDbErrors = <A, E, R>(
    effect: Effect.Effect<A, E | DatabaseError | ConnectionError, R>,
    context: { entityType: string; entityId: string }
): Effect.Effect<A, E | EntityNotFoundError | ServiceUnavailableError, R> =>
    effect.pipe(
        Effect.catchTag("DatabaseError", (err) =>
            Effect.fail(new EntityNotFoundError({
                entityType: context.entityType,
                entityId: context.entityId,
                message: `${context.entityType} not found`,
            }))
        ),
        Effect.catchTag("ConnectionError", (err) =>
            Effect.fail(new ServiceUnavailableError({
                message: "Database connection unavailable",
                cause: err.message,
            }))
        ),
    )

// Usage
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
    return yield* repo.findById(id).pipe(
        withRemapDbErrors({ entityType: "User", entityId: id })
    )
})
```

## Retryable Errors Pattern

For errors that may be transient, add a `retryable` property:

```typescript
export class ServiceUnavailableError extends Schema.TaggedError<ServiceUnavailableError>()(
    "ServiceUnavailableError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
        retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
    },
    HttpApiSchema.annotations({ status: 503 }),
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
    "RateLimitError",
    {
        message: Schema.String,
        retryAfter: Schema.optional(Schema.Number),
        retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
    },
    HttpApiSchema.annotations({ status: 429 }),
) {}

// Non-retryable error
export class ValidationError extends Schema.TaggedError<ValidationError>()(
    "ValidationError",
    {
        message: Schema.String,
        field: Schema.String,
        retryable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
    },
    HttpApiSchema.annotations({ status: 400 }),
) {}
```

### Retry Based on Error Property

```typescript
import { Effect, Schedule } from "effect"

const withRetry = <A, E extends { retryable?: boolean }, R>(
    effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
    effect.pipe(
        Effect.retry(
            Schedule.exponential("100 millis").pipe(
                Schedule.intersect(Schedule.recurs(3)),
                Schedule.whileInput((err: E) => err.retryable === true),
            )
        ),
    )

// Usage
yield* callExternalApi(request).pipe(withRetry)
```

## Error Unions for Activities

When defining workflow activities, use explicit error unions:

```typescript
// Activity error type - union of possible errors
export type GetChannelMembersError =
    | DatabaseError
    | ChannelNotFoundError

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
    "DatabaseError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
        retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
    },
) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
    "ChannelNotFoundError",
    {
        channelId: ChannelId,
        message: Schema.String,
        retryable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
    },
) {}

// In activity definition
yield* Activity.make({
    name: "GetChannelMembers",
    success: ChannelMembersResult,
    error: Schema.Union(DatabaseError, ChannelNotFoundError),
    execute: Effect.gen(function* () {
        // ...
    }),
})
```

## HTTP Error Patterns

### Standard HTTP Error Set

Define a standard set for your API:

```typescript
// errors/http.ts
export class BadRequestError extends Schema.TaggedError<BadRequestError>()(
    "BadRequestError",
    { message: Schema.String, field: Schema.optional(Schema.String) },
    HttpApiSchema.annotations({ status: 400 }),
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
    "UnauthorizedError",
    { message: Schema.String },
    HttpApiSchema.annotations({ status: 401 }),
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
    "ForbiddenError",
    { message: Schema.String },
    HttpApiSchema.annotations({ status: 403 }),
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
    "NotFoundError",
    { message: Schema.String, resource: Schema.optional(Schema.String) },
    HttpApiSchema.annotations({ status: 404 }),
) {}

export class ConflictError extends Schema.TaggedError<ConflictError>()(
    "ConflictError",
    { message: Schema.String },
    HttpApiSchema.annotations({ status: 409 }),
) {}

export class InternalServerError extends Schema.TaggedError<InternalServerError>()(
    "InternalServerError",
    { message: Schema.String, requestId: Schema.optional(Schema.String) },
    HttpApiSchema.annotations({ status: 500 }),
) {}
```

### Mapping Domain Errors to HTTP Errors

```typescript
const handleUserErrors = <A, R>(
    effect: Effect.Effect<A, UserNotFoundError | UserCreateError | DatabaseError, R>
): Effect.Effect<A, NotFoundError | BadRequestError | InternalServerError, R> =>
    effect.pipe(
        Effect.catchTags({
            UserNotFoundError: (err) =>
                Effect.fail(new NotFoundError({ message: err.message, resource: "User" })),
            UserCreateError: (err) =>
                Effect.fail(new BadRequestError({ message: err.message })),
            DatabaseError: (err) =>
                Effect.fail(new InternalServerError({ message: "Database error" })),
        }),
    )
```

## Error Logging

Log errors with structured context:

```typescript
const processWithLogging = Effect.fn("OrderService.process")(function* (orderId: OrderId) {
    return yield* processOrder(orderId).pipe(
        Effect.tapError((err) =>
            Effect.log("Order processing failed", {
                orderId,
                errorTag: err._tag,
                errorMessage: err.message,
            })
        ),
    )
})
```
