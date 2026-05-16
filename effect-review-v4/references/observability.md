# Observability Checklist (v4)

Effect has built-in structured logging, tracing, and metrics. v4 ships
lightweight OTLP exporters under `effect/unstable/observability`.

## 1. Trace Named Functions with `Effect.fn`

Wrapping a function with `Effect.fn("Service.method")` automatically attaches a
tracing span and improves stack traces. Use a descriptive `"Service.method"`
name for service methods.

```typescript
// GOOD
const listIssues = Effect.fn("ErrorsService.listIssues")(function* (orgId) {
  return yield* repo.query(orgId)
})
```

## 2. Add Spans with `Effect.withSpan`

For a standalone `Effect.gen` block (not wrapped by `Effect.fn`), add a span
with `Effect.withSpan`. Give every span a stable, greppable name.

```typescript
// GOOD
Effect.gen(function* () {
  return yield* doWork()
}).pipe(Effect.withSpan("HttpErrors.listIssues"))
```

## 3. Annotate Spans with `Effect.annotateCurrentSpan`

Attach contextual attributes to the current span so traces are filterable.

```typescript
// GOOD
yield* Effect.annotateCurrentSpan({
  orgId: tenant.orgId,
  limit: query.limit ?? 100,
})
yield* Effect.annotateCurrentSpan("issueCount", response.issues.length)
```

## 4. Structured Logging — Never `console.log`

Use `Effect.log` / `Effect.logInfo` / `Effect.logWarning` / `Effect.logError`
with structured data objects. Add log annotations with `Effect.annotateLogs`.

```typescript
// GOOD
yield* Effect.logInfo("query completed", { rowCount, durationMs })
yield* Effect.logError("export failed", { cause })

// BAD
console.log("query completed", rowCount)
```

## 5. OTLP Export

For new projects, use the lightweight `Otlp` modules from
`effect/unstable/observability` to export traces and logs. Use
`@effect/opentelemetry`'s `NodeSdk` only when integrating with an existing
OpenTelemetry setup. Export should be wired as a `Layer`, not constructed
ad hoc inside request handlers.

```typescript
// GOOD — observability layer, composed once at the entrypoint
import { Otlp } from "effect/unstable/observability"

const ObservabilityLive = Otlp.layer({
  baseUrl: otlpEndpoint,
  resource: { serviceName: "my-service" },
})
```

## 6. Span Status Codes Are Title Case

When setting span status explicitly, use title-cased values: `"Ok"`, `"Error"`,
`"Unset"` — not uppercase.

```typescript
// GOOD
status: "Error"

// BAD
status: "ERROR"
```

## 7. Don't Over-Instrument Hot Paths

Avoid adding spans to very high-frequency internal paths (e.g. per-request auth
token validation). Each span has cost; instrument meaningful operations, not
every helper. `Effect.fnUntraced` exists precisely for hot paths that should not
emit a span.
