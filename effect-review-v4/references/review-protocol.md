# Evidence and reporting protocol

## REVIEW-1 — Establish a failure before proposing a repair

Read the operation and relevant constructors, consumers, layer graph, and
tests. State the trigger and observed or logically established consequence.
In PR mode, connect findings to behavior introduced or exposed by the diff.
Unrelated legacy improvements belong outside blocking findings.

For primitive suggestions, explain what custom logic is removed and which
guarantees survive: failure category, ordering, concurrency, partial completion,
ownership, cancellation, deadlines, caching, and telemetry.

## REVIEW-2 — Finding record

Use stable reference rule IDs. Each confirmed finding carries:

| Field | Meaning |
| --- | --- |
| Kind | Correctness, repository policy, or optional simplification |
| Priority | P1 high impact, P2 material localized issue, P3 minor; urgency follows impact and reach, not count |
| Location | Exact file and relevant line; changed location for PR findings |
| Trigger and impact | When it occurs and what a caller/operator experiences |
| Evidence | Code path, installed API/source, local convention, any repro/check |
| Confidence | Confirmed, with assumptions explicitly identified |
| Rule | Applicable reference ID and policy source if relevant |
| Fix | Narrow direction; retain valid alternatives |
| Fix risk | Behavior-changing, intended behavior-preserving, or unresolved; typechecking alone does not prove safety |
| Validation | Focused checks needed, including affected consumers/contracts |

Fix risk and defect severity are separate. A schema bug can be severe even if
repair is risky. A mass style migration can be risky without being necessary.
Optional suggestions do not acquire severity from a preference.

## REVIEW-3 — Confirm and challenge

Perform verification locally by default. This is a reasoning pass, not a
requirement to spawn a verifier. Any explicitly requested independent reviewer
counts toward the total delegation budget in [SKILL.md](../SKILL.md).

Before reporting a consequential finding:

1. Verify API existence, signature, and semantics at the resolved version.
   Include optional suggestions; Info is not permission to guess.
2. Read comments/conventions as evidence of intent. Establish whether a
   workaround's preconditions hold. A comment alone neither confirms nor
   refutes a defect.
3. Trace the failure through callers/owners. Prefer a focused repro, behavioral
   test, or complete code path over speculation. Typecheck proposed API use
   when inference/overloads are part of the claim.
4. Try a plausible refutation: another layer handles the error, a parent owns
   the fiber, keys are structurally equal, or input is validated. Follow the
   evidence rather than assuming the local snippet is the whole system.
5. Audit the repair separately. If it breaks a valid caller, reject or narrow
   the repair; retain an independently demonstrated bug.

Use confirmed/refuted/unresolved dispositions. Unresolved issues go into open
questions with missing evidence. Do not downgrade them into assertions. Keep
refuted candidates out of the main report; retain a brief note only if useful
to explain a tradeoff or requested audit trail.

## REVIEW-4 — Useful output

Lead with highest-impact confirmed findings. A compact paragraph/bullet can
include the fields above; no mandatory verbose template is needed. Group by
severity or behavior, not agent. De-duplicate one root cause reported several
times. Distinguish optional improvements from defects.

State resolved version, reviewed scope, material omissions, and checks actually
run. Do not claim a full audit from sampled files. No compliance scores,
raw-count PASS/FAIL, or top-offender rankings. If no defect is confirmed, say so
and name material limitations. A review need not find something wrong.

If fixes are requested, implement the verified change and validate its behavior
before reporting completion.
