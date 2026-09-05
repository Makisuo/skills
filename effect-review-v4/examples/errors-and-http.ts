/**
 * Complete example checked against effect 4.0.0-rc.111.
 * Callers provide HttpClient.HttpClient (for example FetchHttpClient.layer).
 * This finite text endpoint uses idempotent GETs. Its policy retries transport
 * failures and 502/503/504 only; decode errors and all other statuses are terminal.
 * An integration with rate-limit headers or writes needs its own policy.
 * These errors retain internal diagnostics. A public boundary selects safe
 * fields instead of serializing the URL and transport cause indiscriminately.
 */
import { Effect, Schedule, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"

export class TransportFailure extends Schema.TaggedError<TransportFailure>()(
  "@example/http/TransportFailure",
  { message: Schema.String, endpoint: Schema.String, cause: Schema.Defect() },
) {}

export class ClientFailure extends Schema.TaggedError<ClientFailure>()(
  "@example/http/ClientFailure",
  {
    message: Schema.String,
    endpoint: Schema.String,
    phase: Schema.Literals(["request", "body"]),
    cause: Schema.Defect(),
  },
) {}

export class StatusFailure extends Schema.TaggedError<StatusFailure>()(
  "@example/http/StatusFailure",
  { message: Schema.String, endpoint: Schema.String, status: Schema.Number },
) {}

export class DeadlineExceeded extends Schema.TaggedError<DeadlineExceeded>()(
  "@example/http/DeadlineExceeded",
  {
    message: Schema.String,
    endpoint: Schema.String,
    phase: Schema.Literals(["attempt", "total"]),
  },
) {}

export type GetTextFailure = TransportFailure | ClientFailure | StatusFailure | DeadlineExceeded

export const isRetryable = (error: GetTextFailure): boolean => {
  switch (error._tag) {
    case "@example/http/TransportFailure":
      return true
    case "@example/http/StatusFailure":
      return error.status === 502 || error.status === 503 || error.status === 504
    case "@example/http/DeadlineExceeded":
      return error.phase === "attempt"
    case "@example/http/ClientFailure":
      return false
  }
}

export const getText = Effect.fn("ExampleClient.getText")(function* (endpoint: string) {
  const client = HttpClient.withScope(yield* HttpClient.HttpClient)
  const attempt = Effect.scoped(Effect.gen(function* () {
    const response = yield* client.get(endpoint).pipe(
      Effect.mapError((cause) => cause.reason._tag === "TransportError"
        ? new TransportFailure({ message: "Transport unavailable", endpoint, cause })
        : new ClientFailure({ message: "Request failed", endpoint, phase: "request", cause })),
    )
    if (response.status < 200 || response.status >= 300) {
      return yield* new StatusFailure({
        message: "Upstream rejected the request",
        endpoint,
        status: response.status,
      })
    }
    // Body use stays inside the request scope. Closing the scope also releases
    // rejected responses; a raw Response never escapes the attempt lifetime.
    return yield* response.text.pipe(
      Effect.mapError((cause) => new ClientFailure({
        message: "Response body failed", endpoint, phase: "body", cause,
      })),
    )
  })).pipe(
    Effect.timeoutOrElse({
      duration: "2 seconds",
      orElse: () => Effect.fail(new DeadlineExceeded({
        message: "Attempt timed out", endpoint, phase: "attempt",
      })),
    }),
  )

  return yield* attempt.pipe(
    Effect.retry({
      schedule: Schedule.exponential("100 millis", 2),
      times: 2,
      while: isRetryable,
    }),
    // Outside retry: includes all attempts and backoff. Actual completion still
    // depends on cancellation cooperation and any uninterruptible finalizers.
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new DeadlineExceeded({
        message: "Request budget exhausted", endpoint, phase: "total",
      })),
    }),
  )
})
