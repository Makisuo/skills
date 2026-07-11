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

## 2. Add Spans with `Effect.withSpan` — Sparingly

For a standalone `Effect.gen` block (not wrapped by `Effect.fn`), add a span
with `Effect.withSpan`. Give every span a stable, greppable name. Prefer
`annotateCurrentSpan` on the existing span over spinning a new `withSpan`
unless it is a genuinely distinct sub-operation — extra nesting without new
information is noise.

```typescript
// GOOD
Effect.gen(function* () {
  return yield* doWork()
}).pipe(Effect.withSpan("HttpErrors.listIssues"))
```

## 3. Annotate Spans with `Effect.annotateCurrentSpan` — With DATA

Attach contextual attributes to the current span so traces are filterable.
Use dotted, namespaced keys consistent with the repo's conventions (`query.*`,
`db.*`, `cache.*`, a vendor namespace like `maple.*`), and annotate the tenant
(orgId) on tenant-scoped service methods.

```typescript
// GOOD
yield* Effect.annotateCurrentSpan({
  orgId: tenant.orgId,
  "query.context": "listIssues",
  "query.limit": query.limit ?? 100,
})
yield* Effect.annotateCurrentSpan("issueCount", response.issues.length)
```

⚠️ Annotate **data values**, not objects/methods. A real bug: annotating
`error.pipe` (the pipe *method*, because a schema field shadowed it) instead of
the error's data — the span recorded a function. Check that every annotated
value is a primitive or intentional serializable payload.

## 4. Anticipated Errors Record `Ok` Spans, Not `Error` ⚠️

Span status is a **semantic decision, not a mirror of the Effect exit**. If a
tracer marks every failed exit as `Error`, every expected business rejection —
404s, validation failures, auth denials, rate limits — floods error tracking
(dashboards that materialize errors from `StatusCode='Error'`). This caused a
real incident: expected 4xx outcomes surfaced as "Unknown Error" issues.

The correct pattern (mirrors the OTel HTTP semconv rule for SERVER spans: only
5xx is `Error`, 4xx is `Ok`):

- Expected/anticipated business failures (typically errors annotated with a
  4xx status) → span status `Ok`, no `exception` event; the span still records
  latency and the error tag.
- Genuine failures (5xx-class, defects) → span status `Error`.
- Ideally the anticipated set is **derived** from the error definitions (e.g.
  every wire error annotated with a 4xx `httpApiStatus`) so it cannot drift.

Flag: a tracer/exporter layer that sets `Error` purely from the exit; a new
4xx-class wire error missing the status annotation that would classify it.

## 5. Structured Logging — Never `console.log`

Use `Effect.log` / `Effect.logInfo` / `Effect.logWarning` / `Effect.logError`
with structured data objects. Add log annotations with `Effect.annotateLogs`.

```typescript
// GOOD
yield* Effect.logInfo("query completed", { rowCount, durationMs })
yield* Effect.logError("export failed", { cause })

// BAD
console.log("query completed", rowCount)
```

## 6. Exporter Wiring Is a Layer — And Repo-Specific

Telemetry export is wired as a `Layer` composed once at the entrypoint, never
constructed ad hoc inside request handlers. The v4 building blocks are the
`Otlp` modules from `effect/unstable/observability`; but repos may legitimately
run their own OTLP SDK (custom buffer/flush tracers) or `@effect/opentelemetry`
— **check the repo's telemetry setup before prescribing either**.

```typescript
// GOOD — observability layer, composed once at the entrypoint
import { Otlp } from "effect/unstable/observability"

const ObservabilityLive = Otlp.layer({
  baseUrl: otlpEndpoint,
  resource: { serviceName: "my-service" },
})
```

Two wiring rules that ARE universal:

- **The tracer layer must be provided into the same runtime that runs the
  traced code.** An effect executed on a different runtime (a default/global
  runtime, a separate ManagedRuntime) does not see the tracer — its spans
  silently vanish while child spans that re-provide the layer survive,
  producing **rootless traces**. (Real prod bug via UI atoms — see
  `effect-atom.md` §2.)
- **Short-lived isolates and browsers need an explicit flush path.** A
  timer-based batch exporter loses the tail: flush on `pagehide` /
  `visibilitychange` in browsers, `ctx.waitUntil(flush())` in serverless
  isolates. Flag an exporter with no flush hook in such environments.

## 7. Metrics Need an Exporter — But Check Intent

`Metric.*` instruments only leave the process if the telemetry setup includes a
metrics reader/exporter. Defining metrics under a traces-only SDK is dead code
— **but some repos do this deliberately** (span attributes carry the
observability instead, with metric export planned later). Check the repo's SDK
before flagging in either direction; at most Info when the setup is
documented.

## 8. Span Status Codes Are Title Case

When setting span status explicitly, use title-cased values: `"Ok"`, `"Error"`,
`"Unset"` — not uppercase.

```typescript
// GOOD
status: "Error"

// BAD
status: "ERROR"
```

## 9. Don't Over-Instrument Hot Paths

Avoid adding spans to very high-frequency internal paths (e.g. per-request auth
token validation, per-row mappers). Each span has cost; instrument meaningful
operations, not every helper. `Effect.fnUntraced` exists precisely for
pure/hot-path helpers that should not emit a span. Conversely, a public service
method wrapped in `fnUntraced` loses its trace — flag both directions. Span
additions/removals on hot paths are behavior-risk (dashboards key on span
names/volumes).
