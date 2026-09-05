# Review evaluations

[evals.json](evals.json) defines three review prompts and expected outcomes.
These are maintenance evaluations, not part of an ordinary code review. Run an
agent-based comparison only when requested, using the total delegation budget
in [SKILL.md](../SKILL.md). Instruction-only edits need metadata/link/consistency
checks, not automatic old-versus-new runs. Runtime/API changes need the affected
executable examples first.

`setup.mjs` creates isolated git fixture repositories, using Effect resolved
from the supplied project. It does not mutate that project or install packages.
Keep generated fixtures, snapshots, and review outputs outside every installed
skill-discovery root, for example `~/.agents/skill-workspaces/effect-review-v4`.
Do not put backup copies containing `SKILL.md` anywhere under `~/.agents/skills`.

```sh
node <skill>/evals/setup.mjs --project <repo> --output <new-fixtures-directory>
```

Compare a saved old skill with the candidate on identical fixture contents.
Each evaluator reads only its assigned skill, prompt, and fixture, plus installed
dependency source when needed; do not provide the answer key or prior audit.
For an explicitly requested old-versus-new agent comparison, use at most two
reviewer agents total: one per configuration, reused across its cases. Count
agents already used for the task; do not open a fresh budget for evaluation or
grading. Reviewers cannot delegate. The coordinator grades locally. Keep the
configurations isolated and record within-configuration carryover rather than
spawning a fresh agent per case. A larger benchmark needs an explicit higher
agent budget from the user; do not propose it routinely. Fixtures must not be
edited by reviewers.

The prompts deliberately omit instructions forbidding subagents so they can
check the skill's default behavior. Inspect execution traces as well as reports:
an ordinary branch review or whole-repository audit must use zero subagents.
Any evaluator-host prohibition on delegation must be disclosed as a confound;
it cannot prove the skill itself caused zero delegation. A separate requested
parallel-review check must enforce the lifetime total of two, no recursion, no
extra verification team, and compact assignments/results. Do not claim a token
reduction from agent counts alone.

Save each report under `iteration-N/eval-<id>-<name>/<configuration>/outputs/`,
along with available timing and trace evidence. Never invent token counts or
durations the host does not expose. Grade `expectations` against the full report,
not keyword presence: accepting a broken alternative is not a pass merely
because a correct API was also mentioned. Check unlisted harmful suggestions.

Use the skill-creator grading/benchmark/viewer workflow where available. Include
both outputs and assertion evidence; compare false positives, missed seeded
defects, harmful fixes and evidence quality. Three one-run fixtures are a smoke
comparison, not a reliable population estimate or proof of production safety.

The initial fixtures exercise backend error mapping, atom state across tenants,
documented resource bugs, scope discovery, and valid alternatives. Executable
examples separately verify underlying API and runtime assumptions. Extend this
corpus with failed real-world cases, including optionality migrations, producer
interruption in caches, non-idempotent retries, mixed causes, and changed schema
boundaries. Include fixed versions as negative controls.
