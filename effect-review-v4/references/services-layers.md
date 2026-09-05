# Services, layers, and runtime ownership

Verify APIs through [version grounding](version-grounding.md). Review the graph
from construction to its consumers and final disposal. The examples in
[schema-layer-atom.test.ts](../examples/schema-layer-atom.test.ts) demonstrate
shared versus fresh acquisition and release.

## LAYER-01 — Expose actual dependencies and service contracts

**Correctness.** `Context.Service` supports functional keys, explicit class
shapes, and class forms inferring a shape from `make` in rc.111. A separate
exported shape interface and class syntax are design choices, not mandatory
Effect patterns. `Service.use` retains its dependency in `R`, as does yielding
the service; explicit static accessors are valid delegating functions.

Check service-key collisions: unrelated services with the same string key share
a runtime slot. Namespace keys when package/application composition requires it.
Do not suppress a legitimate optional capability obtained through
`Effect.serviceOption`, or make a mandatory capability optional to erase `R`.

**Proof:** Trace dependencies to a real provider, identify missing/wrong identity
or imprecise contracts, and verify a suitable test replacement can be injected.
Do not report `.use`, inline shapes, or layer names as correctness defects.

## LAYER-02 — Construct layers explicitly and inject at the consuming graph

**Correctness.** Service keys do not automatically create layers. Choose
`Layer.succeed` for an existing value and `Layer.effect` for construction that
needs effects, dependencies, or scoped resources. Compose siblings with
`mergeAll`; satisfy dependencies with `provide`/`provideMerge`. Merging a mock
provider beside its consumer is not evidence the consumer's acquisition sees it.
`provideMerge` deliberately exposes supplied services downstream; `provide`
keeps them private in the resulting layer output.

**Proof:** Check `Layer<Out, Error, In>` and the acquisition path, including any
internally supplied providers. Test that the intended stub is actually called.
Prefer the existing composition root; avoid introducing a second competing
runtime or hiding dependencies with casts.

## LAYER-03 — Reason about acquisition identity and memoization boundaries

**Correctness.** Within a shared memo map, a memoized underlying layer value can
be reused even when callers create different `provide` wrappers around it.
Repeated access to a static layer value is not repeated layer construction.
Factories/getters that create new layers, explicit `Layer.fresh`, separate build
boundaries, and separate memo maps can change sharing. Inspect the actual graph.

Also check the opposite failure: reusing a dependency-sensitive layer under
different configurations can reuse its first acquisition within the same memo
map. Hoisting a constant alone does not prove that tenant/configuration isolation
is correct. Choose shared or fresh acquisition from the intended lifetime.

**Proof:** Count acquisitions, show the dependency values each consumer observes,
and count finalizations after the owner closes. Preserve valid shared-static
layers in negative controls; test factory-created/fresh variants separately.

## LAYER-04 — Match resource lifetime to every consumer

**Correctness.** `Layer.effect` can acquire scoped resources with
`Effect.acquireRelease`; the layer owner determines when they close. Review
connections, subscriptions, fibers, registry instances, and runtime handles
through success, failure, interruption, and shutdown. A runtime must be disposed
by its owner; a resource must not escape the scope that releases it.

Check request/invocation versus process lifetime on the actual host. A globally
memoized request-bound socket is invalid even if its service type is correct.
Background work must retain both host lifetime and resource ownership; see
[resources and concurrency](resources-concurrency.md).

**Proof:** Identify acquire, all consumers, release, and the enclosing owner.
Test cleanup order and exactly-once release for the relevant exit paths. Use a
repository's existing request-scope helper when it encodes host requirements.

## LAYER-05 — Preserve typed construction and configuration failures

**Correctness.** Layer construction can fail through `E`. `Config` likewise
has a typed failure channel; an invalid startup configuration is not automatically
a defect. Preserve errors through reusable layers and choose termination or
intentional defect escalation at the owning application boundary.

Prefer existing `Config`, `Config.schema`, `ConfigProvider`, and secret-redaction
facilities to duplicate parsing or scattered ambient reads. Optional config must
model actual absence; a default must not hide a supplied but invalid value.
Redaction must survive logging and error context, not merely type annotations.

**Proof:** Test absent, valid, and invalid supplied configuration using the real
config decoder. Confirm the layer's failure category and the root's response.
Do not change expected failures to `die` just to remove a layer error type.

## LAYER-06 — Use defaults only for genuinely optional capabilities

**Correctness / optional simplification.** `Context.Reference` provides a default
without a required dependency. Use it when the default is safe for every consumer;
required tenant/auth/configuration must not silently fall back. Effect already
provides injectable clock/random/config capabilities: check those before wrapping
them in a new service merely for tests.

**Proof:** Verify behavior without an override, with a test override, and across
request/session isolation. Identify what owns mutable state inside a default;
do not assume a default factory implies per-request allocation.

## LAYER-07 — Fix inference problems only when they are demonstrated

**Compatibility / optional simplification.** Self-referential inline `make`
definitions can trigger TS2506 when their inferred return depends on the class's
static `.of`. Returning an object checked with `satisfies Shape`, or hoisting
`make` with an explicit Effect annotation, can break that inference cycle.
Both forms are valid. An explicitly shaped `Context.Service` already constrains
`make`; lack of `.of`/`satisfies` alone does not prove a missing shape check.

**Proof:** Reproduce the diagnostic with the project's compiler settings and
verify the minimal correction. Do not convert accepted forms or impose `layer`
versus `Live` naming unless current repository instructions require it.
