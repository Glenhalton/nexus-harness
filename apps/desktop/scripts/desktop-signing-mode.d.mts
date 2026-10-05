/** Signing mode of one packaging run. */
export type DesktopSigningMode = 'signed' | 'azure' | 'unsigned'

/** macOS settings that identify a Developer ID signing or notarization configuration. */
export const MACOS_SIGNING_SETTINGS: readonly string[]

/** Windows SafeNet token settings. */
export const WINDOWS_TOKEN_SETTINGS: readonly string[]

/** Azure Trusted Signing settings; every one is required once any is present. */
export const AZURE_SIGNING_SETTINGS: readonly string[]

/** Optional Azure setting naming the verified publisher. */
export const AZURE_PUBLISHER_NAME_SETTING: 'AZURE_TRUSTED_SIGNING_PUBLISHER_NAME'

/** Publisher used when the Azure certificate profile subject is not configured explicitly. */
export const DEFAULT_AZURE_PUBLISHER_NAME: 'GDA Africa'

/**
 * Resolve the signing mode for one target.
 * @param environment - File-owned release settings.
 * @param platform - Target platform.
 * @param forceUnsigned - Explicit `--unsigned` request.
 * @returns Selected mode.
 */
export function resolveDesktopSigningMode(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform, forceUnsigned?: boolean): DesktopSigningMode

/**
 * Resolve electron-builder Azure Trusted Signing options.
 * @param environment - File-owned release settings.
 * @returns Builder options.
 */
export function resolveAzureSignOptions(environment: NodeJS.ProcessEnv): {
  readonly publisherName: string
  readonly endpoint: string
  readonly codeSigningAccountName: string
  readonly certificateProfileName: string
}
