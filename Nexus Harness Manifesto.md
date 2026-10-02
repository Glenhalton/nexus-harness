# Nexus Harness: What We Have Built

## The idea in one paragraph

AI coding assistants forget everything between sessions. Every time, you have to explain your project again: the plan, the rules, the past mistakes. Nexus Harness fixes this. It is an AI assistant that already knows your project before it writes a single line, and lets you see exactly what it knows and what it is doing.

It is built on top of DeepSeek Harness, an open-source AI assistant engine. We kept its engine and added the project memory, the visibility and the polish.

---

## What is finished

### 1. The assistant starts every task already informed
At the start of each turn, the assistant is quietly handed the current plan, the next unfinished step, the project's rules, lessons learned and a health snapshot. It does not spend time or money on questions like "what are we working on?"

**Why it matters:** Less repetition, fewer wrong guesses, faster results.

### 2. The assistant can manage the project itself
It can read and update the project plan, tick off finished steps, look up past decisions and run health checks. These tools run inside the harness, with no separate helper programs. Every action is recorded in the session history.

**Why it matters:** Plans stay current without a person updating them, and there is a full record of what the assistant did.

### 3. You can see what the assistant knows
- **Status badge** in the page header shows whether the assistant is grounded in the project and which plan is active.
- **Grounding view** for each turn lists exactly which plan steps, rules and notes were given to the assistant.
- **Plan checklist** in the side panel. Steps turn green as work completes, or you can tick them yourself.

**Why it matters:** Nothing is hidden. You can check the assistant's reasoning instead of trusting it blindly.

### 4. You can watch helper agents work
When the assistant hands a task to a helper agent, you can open a side-by-side view and follow the helper's work live next to the main conversation.

**Why it matters:** Delegated work is no longer a black box.

### 5. Local AI models work with one click
An "Ollama" card in Settings adds locally run models. We also fixed the sign-in problem that blocked local models, so they now run with no account or key.

**Why it matters:** Teams with strict privacy needs can keep their code on their own machines.

### 6. Clearer errors and more control
- Confusing technical error messages from AI providers are now translated into plain, useful messages.
- Each configured model can be switched on or off.
- The assistant's thinking depth is set to a sensible middle level by default.

**Why it matters:** Fewer dead ends for users, and predictable cost and speed.

### 7. A distinct look and feel
A new "Nexus" theme with frosted-glass panels, an animated background and the Nexus logo throughout. It is now the default theme, so the product looks like ours from the first launch.

**Why it matters:** Brand identity and a polished first impression.

### 8. Ready to install and distribute
The whole product is packaged as one installable package, `@nexus-framework/harness` (version 1.0.0), with automated build and release checks. The code is compressed and made harder to read for distribution.

**Why it matters:** A customer installs it with a single command.

### 9. Stays current with the original project
We merged the latest upstream release (v0.1.7) while keeping every Nexus addition.

**Why it matters:** We get the original project's improvements without losing our own work.

---

## Early stage

**Alignment interviews ("grill mode").** The assistant questions the developer about decisions, trade-offs and edge cases before any code is written. The foundation and tests exist, but it is not yet a finished feature.

**Why it matters:** It aims to stop expensive rework caused by vague instructions.

---

## Planned

**Terminal assistant (`nexus code`).** An interactive assistant inside the terminal, with live streaming, approval prompts and slash commands. It is on the roadmap for NEXUS v3 and has not been built.

---

## How people start it

| Command | What it does |
|---|---|
| `nexus harness` | Opens the full web interface with the Nexus theme, badges and project memory. Finds the project automatically. Options: `--port`, `--no-open`, `--desktop` |
| `nexus agent "<task>"` | Runs one task start to finish with no supervision and prints the result |
| `nexus code` | Planned: interactive terminal assistant |

These commands are part of the separate NEXUS command-line tool, not this repository.

---
