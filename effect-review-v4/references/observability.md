# Observability

## OBS-1 — Trace meaningful operations in the executing runtime

**Correctness / repository policy / optional simplification.**

Named Effect.fn and withSpan establish operation spans. Unnamed Effect.fn can
retain a stack boundary without a span. Verify existing parents/wrappers before
flagging an untraced service method. Avoid multiplying spans on per-row or hot
helpers; a rename can break queries keyed by name.

Trace/log/metric layers must reach the runtime executing the work. Follow
ManagedRuntime, atom runtime, host adapters, and child fibers across boundaries.
A default runtime can drop a wrapper span while separately instrumented
children export. Require evidence of the actual runtime graph, not merely the
absence of a local provide.

## OBS-2 — Preserve outcomes while observing them

**Correctness.**

Use tapError/tapCause when failure must continue. A catch returning a logging
effect recovers to success; spans and callers may then report success. Decide
whether a failing observer may change the result and handle that deliberately.
Preserve defects/interruption according to the owning boundary; do not suppress
a mixed cause based on its first tag.

Use structured logs/annotations inside Effect to carry context. Console output
at native bootstrap or diagnostics boundaries can be legitimate. Check
multiple layers logging and rethrowing the same failure.

## OBS-3 — Separate three status models

**Correctness / repository policy.**

1. Native Effect Tracer.SpanStatus tracks Started/Ended and an Exit.
2. OTLP has a status representation produced by the exporter.
3. Products such as Maple may persist title-cased strings and apply their own
   anticipated-error policy. These are not interchangeable API types.

For HTTP spans, standard server 4xx status is normally unset; client 4xx
normally indicates Error. 5xx and transport failures generally indicate Error.
Application context can refine classification. Intentional caller cancellation
should not be classified as an HTTP error.
[HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status).

Do not globally flag an exporter simply because it maps failed exits to errors:
inspect span kind, operation, and repo policy. Maple's custom tracer maps
configured anticipated failures to Ok without an exception event; a cause
containing a defect must remain an error. Load current
maple-telemetry-conventions and actual tracer/tests for Maple. Keep title case,
identifiers, dual resource attributes, and loop prevention at that boundary.

## OBS-4 — Exporter ownership and shutdown

**Correctness.**

Follow telemetry layers through acquisition and finalization. Standard v4 OTLP
modules live under effect/unstable/observability; a custom exporter or another
SDK may be intentional. Otlp.layer requires HTTP and serialization dependencies;
layerJson/layerProtobuf provide serialization but still need a client in the
example baseline. Verify installed signatures.

Long-running runtimes need disposal; short-lived hosts need a flush path that
the host actually awaits or extends. Browser visibility/pagehide hooks alone
do not guarantee asynchronous fetch completion. Inspect transport and lifecycle
integration, not just hook existence. Detaching flush work does not keep an
isolate alive. Metrics need a reader/exporter to leave a process, but may be
consumed locally; report export gaps against an operational requirement.

## OBS-5 — Useful, bounded context

**Correctness / repository policy.**

Attribute/log values must be data, not accidentally selected methods such as
error.pipe. Check standard/repo names, tenant identity, span kind, and outbound
propagation. Avoid tokens, authorization headers, secrets, and arbitrary bodies.
Check metric-label cardinality and large payload costs even if serializable.

Validate changed failure classification (including mixed causes), context
propagation, flush/disposal, and hot-path sampling/volume. Generic setup
preferences alone are optional suggestions.
