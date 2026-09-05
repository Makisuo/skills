# Review evaluations

[evals.json](evals.json) defines three review prompts and expected outcomes.
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
Prefer a fresh reviewer for each case and configuration. If the host limits agent
threads, use one independent reviewer per configuration across cases, keep the
configurations isolated, and record the carryover limitation. For a small
controlled comparison, require reviewers in both configurations to work without
delegation; this does not measure whole-repository orchestration speed. Fixtures
must not be edited by reviewers.

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
