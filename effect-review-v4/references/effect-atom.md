# Atom state, requests, and lifecycle

Resolve the actual Effect reactivity and React binding versions. In rc.111 the
core modules live under `effect/unstable/reactivity`; React hooks come from
`@effect/atom-react`. Read local wrappers before recommending builder methods or
runtime access. The [executable examples](../examples/schema-layer-atom.test.ts)
cover structural keys and retained asynchronous states.

## ATOM-01 — Preserve identity for the intended state lifetime

**Correctness.** Recreating an atom during every render can reset state and
restart work. Module-level atoms and families are common solutions; a stable
component-local atom created through a suitable initializer/memoization is also
valid when its lifetime is deliberately local. Review key/dependency changes
that intentionally reset identity. Do not move component-owned state globally
merely to satisfy a module-scope rule.

**Proof:** Render repeatedly, update relevant props, and remount as needed. Show
which state or request survives or resets and why that matches the contract.

## ATOM-02 — Use complete immutable family keys

**Correctness.** rc.111 `Atom.family` uses structural hashing/equality, so newly
allocated equal plain-object keys can share one atom. Canonical strings remain
an option, not a requirement. Check the installed equality implementation:
function identity and custom equality can matter; hashing/comparison caches make
mutating a key unsafe. Avoid serializing away meaningful distinctions.

Keys or registry/runtime boundaries must distinguish all inputs that affect the
result, including tenant, user, permissions, time bounds, and filters where
applicable. Auth held elsewhere does not automatically invalidate an old cache.

**Proof:** Compare equal inputs, changed inputs, and different security contexts.
Verify equal object keys share under the installed release. Trace key mutation
and omitted inputs to stale or incorrectly shared data before reporting a bug.

## ATOM-03 — Supply the runtime required by the entire computation

**Correctness.** An effect-backed atom must run with the services and telemetry
its full computation requires. Use the application's runtime factory when it
owns those layers. A nested client that provides its own transport does not prove
the outer atom's span or dependencies are correctly supplied. Bare `Atom.make`
is valid for values, derived state, and effects whose runtime is appropriate.

Inspect global-layer composition and acquisition order when modifying runtime
registration. Do not treat every reorder as a regression by assertion. Verify
the actual injected client/auth/exporter and layer memoization path.

**Proof:** Observe the complete request and trace path, including parent spans,
authentication, and flush ownership. Local runtime/shim names are repository
conventions, not generic upstream API requirements.

## ATOM-04 — Separate retention, freshness, and invalidation

**Correctness.** `Atom.setIdleTTL` controls disposal after inactivity. It does
not establish a freshness interval for an actively observed result. `keepAlive`
retains state for the registry lifetime, not beyond registry disposal.
Choose retention from remount behavior and memory use; choose refresh/invalidation
from the product's freshness contract. Do not mandate a TTL on every atom.

Mutation reactivity keys must reach the queries they are intended to invalidate.
Include related lists, counts, and details when their data actually changes.

**Proof:** Check remount before/after idle disposal, active stale data, and the
queries refreshed by a successful mutation. Do not infer data freshness from a
property named `timeToLive` without following its implementation.

## ATOM-05 — Model waiting alongside the current result

**Correctness.** `AsyncResult` has Initial, Success, and Failure variants;
`waiting` is an independent flag. A Success may retain useful data during
refresh, and Failure can carry previous success. Rendering solely on waiting can
discard usable data; rendering only success can hide initial/error conditions.
Choose initial loading, background refresh, stale-error, empty-success, and
terminal-failure behavior deliberately.

Use the actual local builder or upstream matching APIs, including an appropriate
terminal branch. Guard success-value access. A local source that cannot fail may
legitimately produce only success, but that claim must match its real lifecycle.

**Proof:** Exercise initial load, refresh with previous success, refresh failure,
and recovery. Inspect failure causes rather than reducing all interruptions to
user-facing errors. Do not invent methods on a repository's Result shim.

## ATOM-06 — Handle mutation outcomes and overlapping work

**Correctness / optional simplification.** `useAtomSet(..., { mode: "promiseExit" })`
preserves the full outcome for explicit success/failure handling. The supported
`promise` mode is appropriate for an intentional throwing Promise boundary.
Whichever mode is used, success UI must follow successful completion; expected
errors, defects, and cancellation need deliberate presentation behavior.

Review overlapping submissions, shared mutation atoms, optimistic updates, and
stale request completion. Check installed `Atom.fn` concurrency/cancellation
semantics before prescribing a lock, a new family, or a reset. Class payloads
must meet [schema construction](schema.md) rules.

**Proof:** Complete two requests in the opposite order, reject one, and unmount
or change the input while work is pending. Verify the intended result wins,
side effects are not duplicated, and rollback does not erase newer state.

## ATOM-07 — Own registries, subscriptions, and account transitions

**Correctness.** Registries own atom values and cleanup. SSR/request state must
have an appropriate isolated owner; module-level atom identity alone does not
imply shared values when registries differ. Conversely, a shared default registry
can retain data across consumers. Inspect provider placement and runtime memo-map
sharing together, especially for server rendering and account/tenant changes.

`RegistryProvider` captures initial options once in the checked release; changing
`initialValues` later does not reinitialize it. Explicitly reset/replace the
appropriate state on security-context changes. Side effects registered in atom
reads need finalizers; effect-backed resources should use their scope correctly.

**Proof:** Test independent registries, disposal, remount, and account/tenant
switching with work in flight. Verify event listeners/timers/fibers are released
and obsolete data cannot repopulate the new session.

## ATOM-08 — Preserve contracts across external reactive bridges

**Correctness / repository policy.** A bridge to a database sync engine or another
reactive source must preserve its real loading/error/completion semantics and
dispose its subscription. Reusing the application's result representation can
reduce UI duplication, but do not fabricate success to hide an unavailable or
failed source. Use existing row/domain schemas and mapping ownership.

**Proof:** Trace initial snapshot, updates, source failure, reconnection, and
unmount. A particular sync engine or Result wrapper is conditional project
context; generic Effect applications need not introduce either.
