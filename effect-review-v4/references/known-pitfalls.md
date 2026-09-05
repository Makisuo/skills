# Regression constraints

These are investigation requirements, not permanent exemptions. Comments
document intent; verify their assumptions and preserve required behavior.
A demonstrated defect retains its impact even if a comment acknowledges it.

| Case | Check before changing it |
| --- | --- |
| `optional` ↔ `optionalKey` | Audit decode, typed construction, and encode separately. Absent keys differ from present undefined; compiler settings can hide this. Preserve wire contracts and fix individual callers by omitting a key where appropriate. Do not mass-widen or mass-tighten schemas. |
| Sync ↔ Effect decoder | Determine whether failure throws/dies or enters E, and which caller handles it. Prefer the right native decoder for new work; existing paths need mapping and tests. |
| Schema class payload | An encoder may require class identity while an outer constructor constructs nested classes from literals. Verify both paths; do not flag nested literals without checking construction. |
| Inline service make / TS2506 | `satisfies Shape` or a hoisted constructor can avoid self-reference inference cycles. Typecheck alternatives; `.of` is not mandatory syntax. |
| Early-return, cursor, CAS, or accumulate-then-fail loop | Preserve stopping conditions, output, pacing, and partial work. Sequential forEach cannot represent every loop. whileLoop, repeat/retry, or an imperative generator may fit different needs. |
| Local let, memo Map, native data transform | Establish ownership/concurrency. Per-execution mutation can be safe. Shared memoization needs keys, capacity/TTL, invalidation, and isolation checks; comments alone do not prove these. Ref is not a cache. |
| Native fetch/Promise/async glue | Identify SDK, framework, and runtime boundaries. Check signals, typed errors, cleanup. Do not force an Effect API onto a host callback or replace an injectable transport without understanding the adapter. |
| Dynamic import at serverless entrypoint | Startup CPU/module-graph constraints may require laziness. Verify platform/bundle evidence before suggesting eager imports. |
| Timeout/retry changes | Preserve eligibility, idempotency, abort propagation, attempts, body replayability, and per-attempt versus total latency. Dropping an AbortController without an equivalent signal loses cancellation. |
| Recovery restructuring | Narrowing catch can expose hidden failures; logging via catch can hide real failures. Verify intended outcomes and distinct public errors. A risky repair does not disprove a bug. |
| Instrumentation | Check parent spans, sampling, runtime/exporter ownership, metric readers, flush hooks, privacy, and volume. Methods may be traced elsewhere; unexported metrics may serve local inspection. |
| Atoms/registry | Static values need no client runtime. Equal immutable object keys may be supported. Stable component-local atoms can be correct. Establish lifetime, equality, invalidation, tenant scope before changing placement/key format. |
| Layer wrappers/subpath imports | Underlying identity and memo-map scope determine sharing. Barrels may pull platform-only code into browsers. Do not conflate wrappers with acquisitions or import consistency with correctness. |
| Internal errors | Separate supported APIs from repo policy. Maple requires schema-backed new expected errors; other repos may accept Data errors. Existing legacy code is not policy. |
| Error field rename | Check prototype collisions, constructors, serialization, dynamic access, consumers, and persisted data. Large renames are not proven safe by a clean typecheck. |

Use executable examples and positive/negative review fixtures to retain these
protections. When a workaround is obsolete, show evidence and a narrow change
instead of extending a permanent do-not-flag list.
