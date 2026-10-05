/** Repository whose GitHub Releases host installers and update feeds. */
export const DESKTOP_GITHUB_REPOSITORY: 'GDA-Africa/nexus-harness'

/** Environment variable that selects the Desktop update deployment. */
export const DESKTOP_AUTO_UPDATE_ENV: 'DSH_DESKTOP_AUTO_UPDATE_ENV'

/** Supported Desktop update deployment. */
export type DesktopAutoUpdateEnvironment = 'github' | 'test' | 'production'

/** Directory name of one supported Desktop release target. */
export type DesktopAutoUpdateTarget = 'mac-arm64' | 'mac-x64' | 'win-x64'

/** Public updater URL and object prefixes for one release target. */
export interface DesktopAutoUpdateConfig {
  readonly environment: DesktopAutoUpdateEnvironment
  readonly target: DesktopAutoUpdateTarget
  readonly origin: string
  readonly publicUrl: string
  readonly keyPrefix: string
  readonly binaryKeyPrefix: string
}

/** Public updater URL and private COS destination for one upload target. */
export interface DesktopUploadConfig extends Omit<DesktopAutoUpdateConfig, 'environment'> {
  /** GitHub Releases publish through the release workflow, never through COS uploads. */
  readonly environment: 'test' | 'production'
  readonly bucket: string
  readonly secretIdEnvName: string
  readonly secretKeyEnvName: string
}

/**
 * Resolve the update deployment, defaulting to GitHub Releases.
 * @param env - Packaging or upload environment.
 * @returns Validated deployment name.
 */
export function resolveDesktopAutoUpdateEnvironment(
  env: NodeJS.ProcessEnv,
): DesktopAutoUpdateEnvironment

/**
 * Resolve one supported platform and architecture to its update directory.
 * @param platform - Target Node.js platform.
 * @param arch - Target Node.js architecture.
 * @returns Update target directory.
 */
export function resolveDesktopAutoUpdateTarget(
  platform: NodeJS.Platform,
  arch: string,
): DesktopAutoUpdateTarget

/**
 * Return the local completion record filename for one packaged target.
 * @param target - Supported release target.
 * @returns Filename stored beside electron-builder artifacts.
 */
export function desktopBuildRecordFilename(target: DesktopAutoUpdateTarget): string

/**
 * Return the electron-builder channel metadata filename for an application version.
 * @param version - Desktop semantic version.
 * @param platform - Target platform.
 * @returns Channel metadata filename emitted for the target.
 */
export function desktopUpdateMetadataFilename(
  version: string,
  platform: NodeJS.Platform,
): string

/**
 * Resolve the public updater URL and object prefixes for one release target.
 * @param env - Packaging or upload environment.
 * @param platform - Target Node.js platform.
 * @param arch - Target Node.js architecture.
 * @returns Resolved updater configuration.
 * @throws When the test deployment lacks a valid HTTPS origin or a 32-character lowercase hexadecimal release ID.
 */
export function resolveDesktopAutoUpdateConfig(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  arch: string,
): DesktopAutoUpdateConfig

/**
 * Resolve the public updater URL and private COS destination for one upload target.
 * @param env - Upload environment.
 * @param platform - Target Node.js platform.
 * @param arch - Target Node.js architecture.
 * @returns Resolved upload configuration.
 * @throws When the selected deployment lacks a bucket or valid updater configuration, or publishes through GitHub Releases.
 */
export function resolveDesktopUploadConfig(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  arch: string,
): DesktopUploadConfig
