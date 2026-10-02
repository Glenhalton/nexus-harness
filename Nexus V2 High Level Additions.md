1. nexus agent — One-Shot Autonomous Headless Execution
Command: nexus agent "<task>"
Under the Hood: Executes dsh --profile headless --patch <patchPath> "<task>":
Ambient Brain Context: Automatically injects your project's .nexus/ context pack (active plans, skills, long-term knowledge, vital signs) into Step 1 of the agent loop via ambient <system-reminder> blocks through @deepseek-ai/dsh-experimental-nexus-brain-context.
In-Process Tools: Automatically mounts the 16 model-callable nexus_* tools (nexus_plan_tick, nexus_query_knowledge, etc.) via @deepseek-ai/dsh-experimental-tool-nexus-brain.
Execution Behavior: The agent runs to quiescence without developer babysitting, streaming provider reasoning deltas to stderr and outputting the final result to stdout before exiting.
Guidance: If run without arguments (nexus agent), it prints friendly instructions on usage and notes the v3 interactive roadmap.
2. nexus code — Interactive Terminal TUI (NEXUS v3 Roadmap)
Command: nexus code
Role: Reserved for the full interactive Claude Code-style terminal TUI REPL (packages/bundle/tui-app), enabling live interactive terminal coding, tool confirmations, and slash commands without leaving the shell.
3. nexus harness — Web GUI Interface
Command: nexus harness [--port 3080] [--desktop]
Role: Launches the browser/desktop interface pre-configured with the Nexus Glass theme, subagent inspectors, visual brain badges, and ambient context.