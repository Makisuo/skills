# Executable examples

Baseline: `effect` and `@effect/vitest` **4.0.0-rc.111**. These complete examples
are compiled and run with the reviewed project's installed packages, including
their patches. They are not application migrations or universal templates for
every v4 release.

| File | What it demonstrates |
| --- | --- |
| [errors-and-http.ts](errors-and-http.ts) | Injected HTTP client, schema-backed expected errors, idempotent GET retry policy, per-attempt and total deadlines, response lifetime |
| [runtime-semantics.test.ts](runtime-semantics.test.ts) | Observation versus recovery; typed failure/defect/interruption; finalizers, scoped fibers, HTTP status/body failures, attempt bounds, actual cancellation signals |
| [schema-layer-atom.test.ts](schema-layer-atom.test.ts) | Optionality, class identity, typed construction, decode distinction, layer sharing/freshness, atom equality/registry state, failure-category assertions and TestClock retries |
| [api-surface.test.ts](api-surface.test.ts) | Valid thunk try, namespace service imports, Reference defaults, whileLoop, complete OTLP layer dependencies (constructed, not exported) |

Run with an installed Node runtime and a project providing Effect,
@effect/vitest, TypeScript and @types/node. Vitest resolves from the installed
@effect/vitest peer graph. No package installation or network request occurs.

```sh
node <skill>/scripts/check-examples.mjs --project <repo> --output <artifacts-dir>
node --test <skill>/scripts/inspect-project.test.mjs
```

The checker copies examples into an isolated temporary directory and links the
project's dependency packages. It runs strict TypeScript (including
exactOptionalPropertyTypes) and Vitest, saves versions, logs, and results, then
removes the temporary source directory. It never writes to project source.
It fails if dependencies, compilation, or a nonempty passing test suite are
missing. Read `validation.json`, `typecheck.log`, `tests.log`, and `tests.json`.

Tests containing intentionally unsafe patterns are negative controls, not
recommendations to copy. They establish the difference in observable behavior.
Run relevant new fixtures when changing a rule; update the verified version
only after checking its signatures and semantics. These focused tests do not
claim to prove host deployment, browser shutdown delivery, or every cache and
stream behavior described in the references.
