What We Have Enhanced (The 5 Key Pillars)

1. Ambient Brain-Context Injection (nexus-brain-context):
   Upstream DSH: Has no notion of project memory, architecture specs, or plans. Every session starts with a blank slate.
   Nexus Harness: Injects the active plan slice, matching skills, knowledge entries, and vital signs automatically into Step 1 of each turn (<system-reminder>). The agent is grounded in your project before it writes a single character, without even wasting a tool call.

2. Native NEXUS Brain Tools (tool-nexus-brain):
   Upstream DSH relies on external stdio MCP processes to reach custom tools.
   Nexus Harness mounts all 16 NEXUS tools (nexus_wake, nexus_plan_tick, nexus_doctor, nexus_query_knowledge) directly in-process on ctx.tools, so they execute with zero transport latency and log directly to the session timeline.

3. Nexus Branded Theme & Glassmorphic UI:
   In packages/client/ui-theme and ui-brand-nexus:
   Added a dedicated 4th Theme ("Nexus") alongside Light, Dark, and System.
   Added Nexus Glass styling: backdrop blur panels, gradient text, and an animated ambient background (AmbientBackground.tsx).
   Added the hexagonal Nexus brand mark and wordmark into the sidebar and conversation hero.

4. Side-by-Side Subagent Inspector View:
   Upstream DSH: Subagents run somewhat opaquely; viewing their live transcripts and tool calls is clunky.
   Nexus Harness: Added a dedicated side-by-side read view in the details panel specifically to inspect child agents and delegated tasks in flight.

5. First-Class Local Models (Ollama Quick-Add):
   Added an Ollama quick-add card in Settings -> Models, and patched the authentication headers so Ollama models run locally without dummy API key errors.

6. Alignment Interviews (dsh-grill-mode):
   Recently scaffolded to conduct interactive alignment interviews before the agent starts touching code.
