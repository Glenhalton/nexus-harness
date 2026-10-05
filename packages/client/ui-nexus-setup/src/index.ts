/**
 * NEXUS setup prompt, node half. Pure UI plugin: the empty apply gives the
 * Loader a host-side row while the browser half ships through ./client. The
 * routes it drives live in `@deepseek-ai/dsh-host-nexus-setup`.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
