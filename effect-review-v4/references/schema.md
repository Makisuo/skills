# Schemas, construction, and boundary contracts

Use [version grounding](version-grounding.md) before recommending an API. The
complete examples in [schema-layer-atom.test.ts](../examples/schema-layer-atom.test.ts)
exercise the rc.111 behavior described here. A schema change changes a contract;
inspect its producers, consumers, and error mapper before proposing a fix.

## SCH-01 — Choose the operation for the input representation

**Correctness.** Separate three operations:

| Input and purpose | Operation to consider | Failure behavior in rc.111 |
| --- | --- | --- |
| Unknown encoded input from HTTP, storage, or a driver | `Schema.decodeUnknownEffect(S)` | Typed `SchemaError`; may require decoding services |
| Typed constructor input that can violate checks | `S.makeEffect(input)` | Typed `SchemaIssue.Issue`, not `SchemaError` |
| Trusted typed construction | `new Class(input)` / `S.make(input)` | Validation throws on invalid input |
| Value leaving an application boundary | An appropriate encode operation | Validate the type-side representation and apply encoding transformations |

Construction and decoding can have different defaults and transformations. Do not
substitute one for the other because their successful values look alike. `new`
inside `Effect.sync` or a generator can turn a validation failure into a defect;
use fallible construction when rejection belongs in the expected error contract.
Map schema failures through the existing boundary mapper, preserving useful
issues and avoiding exposure of sensitive raw values. Synchronous decoding is
reasonable in trusted fixtures/module initialization or at a deliberate throwing
interop boundary; a conversion to an Effect decoder must audit callers.

**Proof:** Identify the input representation, a failing value, and the resulting
error category. Validate constructor defaults, decode transforms, and the public
error response separately. Do not report a throwing constructor without evidence
that its input can fail and its boundary expects typed failure.

## SCH-02 — Class encoders require constructed class values

**Correctness.** In the checked release, a wholly plain value passed to a
`Schema.Class` encoder fails the class identity check. Construct the top-level
class via `new`, `.make`, `.makeEffect`, or decoding as appropriate. Check the
actual endpoint schema: a Struct contract does not acquire a class requirement
merely because a similar domain class exists.

Nested plain fields under a class constructor are not automatically a defect:
construction recursively builds nested classes, including supported arrays and
unions. Keep the existing nested-construction protection. Do not demand `new`
at every level, or report identity based on TypeScript shape alone. Client
wrappers may convert encode failures into defects before making a request;
trace the actual wrapper before claiming that outcome.

**Proof:** Exercise the actual encoder with the top-level plain value and with
the constructed value. Check nested constructors and whether any request occurs.
The linked example covers these differences without a transport assumption.

## SCH-03 — Preserve absence, explicit undefined, and null separately

**Correctness.** `optionalKey(S)` admits an absent key, while a present value must
match `S`; `optional(S)` also admits explicit `undefined`. `NullOr(S)` admits
`null`; optionality alone does not. JSON cannot carry `undefined`, but JavaScript
producers can create it before encoding. TypeScript's `exactOptionalPropertyTypes`
affects static detection, not these runtime semantics.

Choose the schema from the contract, not merely from whether JavaScript constructs
it. For an exact optional field, fix forwarding sites to omit an undefined key
when omission is intended. Do not automatically widen the contract to `optional`.
Conversely, do not mechanically replace `optional` with `optionalKey`: callers
may deliberately pass undefined. Follow applicable repository schema conventions.

**Proof:** List relevant construction, decode, and encode sites. Check `{}`,
`{ field: undefined }`, `{ field: null }`, a valid value, and an invalid value.
Check spreading decoded instances versus explicitly forwarding possibly absent
properties. Any optionality migration requires producer/consumer validation;
a successful typecheck alone is insufficient.

## SCH-04 — Decode brands at trust boundaries without fabricating valid IDs

**Correctness / repository policy.** Brands distinguish identifiers and other
domain values where confusion has an observable consequence or policy requires
them. Reuse the domain schema and its actual format; do not invent validators
from examples. `as EntityId` cannot establish that untrusted input is valid.
Keep rejected input unbranded in explicitly raw error context; valid identifiers
can retain their brands. Do not require every local string to become a new brand.

**Proof:** Trace the origin and existing validation. A boundary conversion should
reject malformed inputs in the intended error channel; check the actual UUID
version/variant, prefix, or other constraint rather than a hardcoded fixture rule.

## SCH-05 — Validate external representations and numeric precision

**Correctness.** A driver can supply strings where the application expects numbers.
Use the existing boundary codec and actual driver contract. Accepting both numeric
representations does not make integers above the JavaScript safe range precise:
identity-sized integers may need string or bigint representation end to end.
Do not prescribe a global driver setting from this generic skill.

**Proof:** Inspect settings, selected representation, row codec, and consumers.
Test representative wire values, rejected non-finite input, and precision-sensitive
identities. For Maple, read its current warehouse instructions and shared codecs;
the protocol setting and identity-column policy are owned by that repository.

## SCH-06 — Keep schema APIs and transformations version-correct

**Compatibility.** Verify public declarations and actual execution code. In the
checked rc.111 release, examples use `Schema.TaggedError`, `.check(...)`,
`is`-prefixed checks, array arguments to `Union`/`Tuple`/`Literals`, and
`decodeTo`. Decoder/encoder names include their Effect/Result/Option/Sync form.
Do not preserve obsolete beta names such as `TaggedErrorClass` by rote, or
recommend a textual rename without checking its types and semantics.

**Proof:** Typecheck complete recommended examples against the resolved release.
Test round-trips only where both directions are part of the contract; intentional
normalization need not reproduce the original encoded bytes.

## SCH-07 — Avoid collisions with required instance behavior

**Correctness.** Schema-backed error/class fields can shadow inherited members.
Inspect members such as `pipe`, error fields, and serialization hooks against
the actual base class. Do not generalize one collision to every plain Struct.

**Proof:** Show the member used by a consumer becoming the wrong value or type.
Renaming a public field requires auditing serialized contracts and callers.

## SCH-08 — Prefer existing schema contracts over parallel validation

**Optional simplification / repository policy.** When validation is duplicated
across a real boundary, reuse a suitable schema to keep constraints and failures
consistent. A narrowing predicate, exhaustive switch, or ordinary `typeof` guard
inside already validated code is not inherently wrong. Do not force classes for
plain records or add schemas to computations with no validation requirement.

**Proof:** Name the duplicate contract or lost validation detail the change removes.
Follow repository choices about schema libraries without claiming they are a
universal Effect runtime restriction.
