---
description: "Grilling mode for users and maintainers choosing, configuring, or debugging the per-agent alignment interview feature with grilling guidance, a /grill command, and a user-reviewed exit."
kind: "package-reference"
---

# @deepseek-ai/dsh-grill-mode

English | [中文](README.zh.md)

## Summary

Grill mode guides an agent through the NEXUS grilling interview discipline before execution. Enter it with `/grill`, optionally with a topic; leave with `/grill off`, approve the review in `finish_grilling` to continue, or return feedback for more clarification. Deployment-defined or default grilling guidance steers the agent to resolve decision branches one question at a time. The active state survives session resume and forks. Choose it when you want rigorous upfront alignment before the agent acts or writes code.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)

-----

<a id="use-this-package"></a>
## Use this package

When grill mode is active, the agent works under structured interview instructions:
1. Maps open decision branches.
2. Asks one question at a time using `ask_user_question`.
3. Confirms out-of-scope boundaries.
4. Concludes by calling `finish_grilling` with the complete `## Grilling` record.

### Minimal configuration

The package works with default NEXUS grilling guidance out-of-the-box, or accepts custom guidance:

```yaml
- name: '@deepseek-ai/dsh-grill-mode'
  config:
    section: |
      You are in grilling mode. Resolve all design decisions before implementation.
```

### Entering and leaving grill mode

Type `/grill` to enter grill mode, or `/grill <topic>` to enter with an initial topic. Type `/grill off` to leave grill mode directly.

When the interview is complete, the agent calls `finish_grilling` with the markdown alignment record. Review the record and choose `Approve` to conclude grilling and continue work.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

### Durable state and session projection

The package persists one log-only event, `grill/mode`, and the last logged value is the state. The `grill` projection unit folds logged `/grill` command runs into candidate targets and tracks `{ active, pending }`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, `ctx.grillMode` service, `grill:policy` section, `/grill` command, `finish_grilling` tool |
| [`src/types.ts`](src/types.ts) | The `grill` projection-key declaration and `GrillProjection` wire value |
| [`src/client.ts`](src/client.ts) | Client-namespace re-export of types |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion: validates `grill/mode` payload shape |
