---
description: "Package map for the plan group: the plan-mode feature that guides the agent to explore and design before executing, for users and maintainers navigating the group."
kind: "package-group"
---

# plan/ — plan collaboration state

English | [中文](README.zh.md)

## Summary

The `plan/` group provides collaboration modes for planning and alignment:
- `plan-mode`: guides the agent to explore and design before executing, presenting the finished plan for user approval.
- `grill-mode`: guides the agent through the structured grilling interview discipline to resolve design decisions and open branches before implementation.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The plan group contains packages for design exploration and alignment interviewing:

| Package | Role | ctx key |
|---|---|---|
| [`plan-mode/`](plan-mode/README.md) | Provides plan mode: `/plan` enters and leaves it, deployment guidance steers the agent while planning, and `exit_plan_mode` presents the finished plan for your review | `ctx.planMode` |
| [`grill-mode/`](grill-mode/README.md) | Provides grilling mode: `/grill` enters and leaves it, alignment interview guidance steers the agent, and `finish_grilling` presents the resolved alignment record for review | `ctx.grillMode` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the shared vocabulary, then read the design note for the decisions.

- [Plan mode subsystem reference](../../docs/subsystems/plan.md) — how plan mode works, its configuration, and the exit tool's behavior.
- [Plan-specific collaboration state](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md) — the design decision behind plan mode.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
