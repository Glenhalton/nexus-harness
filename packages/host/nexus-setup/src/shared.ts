/**
 * Route paths and wire payloads shared verbatim by the host routes, the
 * browser setup prompt (`@deepseek-ai/dsh-client-ui-nexus-setup`), and the
 * Desktop welcome window, published as the `./shared` subpath. Browser-safe:
 * constants and types only. Each route carries the absolute pathname the Host
 * registers beside the document-relative form the browser addresses.
 */

/** GET route reporting whether one folder is a NEXUS project (`?path=<absolute folder>`). */
export const NEXUS_SETUP_STATUS_PATH = '/nexus-setup/status'

/** Browser-relative form of {@link NEXUS_SETUP_STATUS_PATH}. */
export const NEXUS_SETUP_STATUS_ROUTE = NEXUS_SETUP_STATUS_PATH.slice(1)

/** POST route turning one folder into a NEXUS project through the bundled NEXUS CLI. */
export const NEXUS_SETUP_INIT_PATH = '/nexus-setup/init'

/** Browser-relative form of {@link NEXUS_SETUP_INIT_PATH}. */
export const NEXUS_SETUP_INIT_ROUTE = NEXUS_SETUP_INIT_PATH.slice(1)

/**
 * One folder's NEXUS state:
 * - `ready`: the folder already holds a `.nexus/` directory; setup never runs again.
 * - `needs-setup`: an existing folder without `.nexus/`.
 * - `missing`: the path does not name an existing directory.
 */
export type NexusSetupState = 'ready' | 'needs-setup' | 'missing'

/** Status-route response. */
export interface NexusSetupStatusPayload {
  readonly path: string
  readonly state: NexusSetupState
}

/** Init-route request body. */
export interface NexusSetupInitRequest {
  readonly path: string
}

/** Init-route success response; `created` is false when `.nexus/` already existed. */
export interface NexusSetupInitPayload {
  readonly path: string
  readonly state: 'ready'
  readonly created: boolean
}

/** Error body shared by both routes. */
export interface NexusSetupErrorPayload {
  readonly code: 'bad-request' | 'not-found' | 'unsupported-media-type' | 'payload-too-large' | 'init-failed'
  readonly message: string
}
