/**
 * Select how one packaging run signs its artifacts.
 *
 * - `signed`: the inherited release path (macOS Developer ID + notarization, or the Windows SafeNet token).
 * - `azure`: Windows Azure Trusted Signing through electron-builder's `azureSignOptions`.
 * - `unsigned`: no credentials. macOS output is ad-hoc signed so Apple Silicon will launch it; Windows
 *   output carries no Authenticode signature.
 *
 * A platform whose signing settings are all absent or empty packages unsigned, so builds without
 * certificates succeed. Any configured setting selects the signed path, whose existing validation then
 * rejects incomplete configurations instead of silently dropping signatures.
 */

/** macOS settings that identify a Developer ID signing or notarization configuration. */
export const MACOS_SIGNING_SETTINGS = [
  'DSH_DESKTOP_MACOS_SIGNING_IDENTITY',
  'DSH_DESKTOP_MACOS_TEAM_ID',
  'CSC_LINK',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_KEYCHAIN_PROFILE',
]

/** Windows SafeNet token settings. */
export const WINDOWS_TOKEN_SETTINGS = [
  'DSH_DESKTOP_WINDOWS_CER_FILE',
  'DSH_DESKTOP_WINDOWS_SIGNTOOL',
  'DSH_DESKTOP_WINDOWS_KEY_CONTAINER',
  'DSH_DESKTOP_WINDOWS_TOKEN_PIN',
]

/** Azure Trusted Signing settings; every one is required once any is present. */
export const AZURE_SIGNING_SETTINGS = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TRUSTED_SIGNING_ENDPOINT',
  'AZURE_TRUSTED_SIGNING_ACCOUNT',
  'AZURE_TRUSTED_SIGNING_PROFILE',
]

/** Optional Azure setting naming the certificate subject shown as the verified publisher. */
export const AZURE_PUBLISHER_NAME_SETTING = 'AZURE_TRUSTED_SIGNING_PUBLISHER_NAME'

/** Publisher used when the Azure certificate profile subject is not configured explicitly. */
export const DEFAULT_AZURE_PUBLISHER_NAME = 'GDA Africa'

function present(environment, name) {
  return (environment[name]?.trim() ?? '') !== ''
}

/**
 * Resolve the signing mode for one target.
 * @param {NodeJS.ProcessEnv} environment File-owned release settings.
 * @param {NodeJS.Platform} platform Target platform.
 * @param {boolean} [forceUnsigned] Explicit `--unsigned` request.
 * @returns {'signed' | 'azure' | 'unsigned'} Selected mode.
 */
export function resolveDesktopSigningMode(environment, platform, forceUnsigned = false) {
  if (forceUnsigned) return 'unsigned'
  if (platform === 'darwin') {
    return MACOS_SIGNING_SETTINGS.some(name => present(environment, name)) ? 'signed' : 'unsigned'
  }
  if (platform === 'win32') {
    if (AZURE_SIGNING_SETTINGS.some(name => present(environment, name))) {
      if (WINDOWS_TOKEN_SETTINGS.some(name => present(environment, name))) {
        throw new Error('desktop package: configure either Azure Trusted Signing or the Windows token signer, not both')
      }
      return 'azure'
    }
    return WINDOWS_TOKEN_SETTINGS.some(name => present(environment, name)) ? 'signed' : 'unsigned'
  }
  return 'unsigned'
}

/**
 * Resolve electron-builder Azure Trusted Signing options.
 * @param {NodeJS.ProcessEnv} environment File-owned release settings.
 * @returns {{ publisherName: string, endpoint: string, codeSigningAccountName: string, certificateProfileName: string }} Builder options.
 */
export function resolveAzureSignOptions(environment) {
  const missing = AZURE_SIGNING_SETTINGS.filter(name => !present(environment, name))
  if (missing.length > 0) {
    throw new Error(`desktop package: Azure Trusted Signing requires ${missing.join(', ')}`)
  }
  let endpoint
  try { endpoint = new URL(environment.AZURE_TRUSTED_SIGNING_ENDPOINT.trim()) }
  catch { throw new Error('desktop package: AZURE_TRUSTED_SIGNING_ENDPOINT must be an HTTPS URL') }
  if (endpoint.protocol !== 'https:') throw new Error('desktop package: AZURE_TRUSTED_SIGNING_ENDPOINT must be an HTTPS URL')
  return {
    publisherName: present(environment, AZURE_PUBLISHER_NAME_SETTING)
      ? environment[AZURE_PUBLISHER_NAME_SETTING].trim()
      : DEFAULT_AZURE_PUBLISHER_NAME,
    endpoint: endpoint.href.replace(/\/$/u, ''),
    codeSigningAccountName: environment.AZURE_TRUSTED_SIGNING_ACCOUNT.trim(),
    certificateProfileName: environment.AZURE_TRUSTED_SIGNING_PROFILE.trim(),
  }
}
