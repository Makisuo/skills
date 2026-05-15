---
name: zero-tech-debt
description: Rework a change as if the intended UX and architecture existed from day one, deleting compatibility cruft and accidental complexity. Use when the user asks to remove tech debt, clean up a patch, or rework a change to its intended end state.
version: 1.0.0
---

# Zero Tech Debt

Rework the change from the intended end state, not from the historical path that produced the current patch.

## Steps

1. State the intended end state in one or two sentences.
2. Search for real callers before preserving compatibility. If a mode, prop, wrapper, route alias, or fallback has no current caller, delete it.
3. Reshape around the final product surface. Prefer one clear component or flow over mode flags. Split only when it creates an obvious boundary such as state, layout, controls, or domain commands.
4. Move shared rules to one place. Feature flags, permissions, route gating, URL state, and command naming should not be duplicated across pages or hidden in view components.
5. Verify the intended flow. Test the new behavior and any deleted assumptions that affect navigation, permissions, or persisted state.

## Rules

- Optimize for the code that should exist, not the smallest diff from the old shape.
- Delete dead compatibility paths instead of making them better.
- Do not invent a generic framework for one feature.
- Keep the refactor scoped to what makes the final shape coherent.
- Prefer names that describe product intent over implementation history.
