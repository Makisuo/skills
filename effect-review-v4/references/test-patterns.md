# Tests that establish Effect behavior

Use the project's test runner and resolved `@effect/vitest` implementation.
Review consequential behavior, not one test per combinator. The complete
[schema/layer/atom examples](../examples/schema-layer-atom.test.ts) are executable
compatibility and regression checks, not a requirement to duplicate library tests
in every application.

## TEST-01 — Use the harness that owns the required services and scope

**Compatibility / correctness.** In rc.111, both `it.effect` and `it.live`
automatically provide Scope; `it.scoped` is obsolete. `it.effect` supplies test
services, including TestClock; `it.live` keeps the live clock. Prefer these for
tests naturally expressed as Effects with layers/resources. Plain Vitest is
appropriate for pure functions, React/DOM, and deliberate runtime/Promise adapter
tests. Running an Effect at the boundary under test is not inherently a defect.
`expect` and `assert` are both supported; follow local style without a finding.

**Proof:** Check the installed harness and patches, then verify resources close
at the intended per-test or suite boundary. Do not recommend removed test APIs.

## TEST-02 — Drive Effect time deterministically

**Correctness / optional simplification.** TestClock controls Effect sleep,
timeouts, schedules, and retry delays. Fork the operation, establish the relevant
work has started, advance the clock, and join/await the outcome. Use a barrier
or observable attempt state when the test needs specific ordering. Ordinary
Promise completion does not inherently require live time.

Use `it.live` for actual wall-clock integration requirements that the test is
meant to exercise. Avoid a broad rule sending exponential retry tests to the live
clock, or flagging every existing live test as broken.

**Proof:** Assert attempts, eligibility, eventual outcome and timing where timing
is the contract. Distinguish per-attempt timeout from total deadline. Check no
extra retry or pending work occurs after success, terminal failure, or interruption.

## TEST-03 — Assert typed failure, defect, and interruption separately

**Correctness.** For expected failures, prove `Exit.hasFails` and inspect the typed
error via `Exit.findErrorOption`, then assert its tag and useful context. Check
defects/interruptions separately when they must be absent. A failure can contain
more than one reason; first-error extraction alone is not proof of the full cause.

Do not fall back to `Cause.squash` in a helper meant to prove typed failure: a
tagged object inside `Effect.die` could then pass the same test as `Effect.fail`.
Squashing is suitable only where intentional presentation loss is under test.

**Proof:** A regression changing `fail(error)` to `die(error)` must fail the
expected-error test. Cover continued failure after observation, intentional
fallback values, and the public mapper/envelope where behavior crosses a boundary.

## TEST-04 — Inject dependencies at the point they are consumed

**Correctness.** Provide a mock into the layer acquiring or using that dependency.
Merging sibling layers is not general dependency injection; an internally supplied
live provider can also defeat a test stub. Use `Layer.succeed` for explicit stubs
and the real composition for the seam being verified.

Shared `it.layer` suites can share acquired state and scope. Use fresh per-test
state or deliberate reset when isolation requires it. Test actual configuration
decoding with `ConfigProvider` when validating configuration, rather than replacing
the entire decoded service and claiming coverage of parsing.

**Proof:** Assert the expected stub was used, verify no real network escapes,
and run relevant cases in isolation and together when shared state is in question.
Do not add one shared mutable test layer merely to make setup shorter.

## TEST-05 — Use realistic transport and database seams

**Correctness / repository policy.** Prefer the injected HTTP client or
`FetchHttpClient.Fetch` over global mutation when the code uses that service.
Return real Response objects when using the fetch adapter. Build a fresh response
per request; reusing a consumed body can create test-only errors. Model signals,
status, headers, and body decoding as required by the behavior under test.

Use the repository's established database fixture/migration/cleanup facilities
for DB integration tests; unit stubs are appropriate for narrower service tests.
For Maple, resolve the current helper from its instructions (currently
`apps/api/src/platform/test-pglite.ts`), not a remembered path. Preserve actual
driver and transaction semantics in tests intended to cover them.

**Proof:** Distinguish transport rejection, HTTP status failure, invalid body,
absence, and unavailable storage. Assert attempts/writes/rollback effects when
retries or error mapping could duplicate or misclassify work.

## TEST-06 — Exercise schema representations and producer contracts

**Correctness.** Test raw decoding, fallible typed construction, and encoding
when those are distinct paths. Preserve optionality and class-identity cases
from [schema rules](schema.md). Generate branded fixtures through the actual
schema with valid inputs; never cast malformed strings to make a fixture pass.

**Proof:** Check absent/undefined/null, constructor defaults versus decode
transforms, nested classes, invalid constructor checks, and boundary error
classification. Round-trip only when the contract promises both directions.
Audit real producers before changing optionality even when a local test passes.

## TEST-07 — Test ownership and observable side effects

**Correctness.** Add or request targeted coverage when a change affects resource
release, interruption, shared acquisition, concurrent state, retry safety, cache
isolation, or a public failure contract. A new method without a dedicated unit
test is not automatically a finding if meaningful existing coverage exercises it.

**Proof:** Establish a failure mode or material unverified invariant. Check
acquire/release counts and order; pending child cancellation; cross-tenant keys;
late completion; duplicate writes; and active versus idle cache behavior only as
relevant. Existing correct tests should not be expanded merely to mirror syntax.

## TEST-08 — Validate examples and property-test integrations against runtime

**Compatibility.** Typecheck complete examples against the resolved package,
compiler options, and relevant patches; run behavior-sensitive examples too.
Do not assume an unstable type signature proves runtime support. rc.111 Vitest
property-test types admit schemas but its implementation rejects direct Schema
inputs; use a verified FastCheck Arbitrary path for that version.

**Proof:** State the command, resolved version, outcome, and scope of validation.
A compatibility fixture proves an API or small invariant, not full application
integration or the absence of broader bugs. Keep baseline/candidate evaluation
artifacts outside the installed skill.
