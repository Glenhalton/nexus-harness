import { expect, it } from 'vitest'
import { resolveAzureSignOptions, resolveDesktopSigningMode } from '../scripts/desktop-signing-mode.mjs'

it.each([
  ['darwin', {}, false, 'unsigned'],
  ['darwin', { CSC_LINK: '', DSH_DESKTOP_MACOS_SIGNING_IDENTITY: ' ' }, false, 'unsigned'],
  ['darwin', { APPLE_API_KEY: 'AuthKey.p8' }, false, 'signed'],
  ['darwin', { DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'GDA Africa (ABCDE12345)' }, true, 'unsigned'],
  ['win32', {}, false, 'unsigned'],
  ['win32', { DSH_DESKTOP_WINDOWS_CER_FILE: 'leaf.cer' }, false, 'signed'],
  ['win32', { AZURE_CLIENT_ID: 'client' }, false, 'azure'],
  ['win32', { AZURE_CLIENT_ID: 'client' }, true, 'unsigned'],
] as const)('selects the %s mode for %j (forced unsigned: %s)', (platform, environment, forced, mode) => {
  expect(resolveDesktopSigningMode(environment, platform, forced)).toBe(mode)
})

it('defaults the Azure publisher to GDA Africa and accepts an override', () => {
  const environment = {
    AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's',
    AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net', AZURE_TRUSTED_SIGNING_ACCOUNT: 'a',
    AZURE_TRUSTED_SIGNING_PROFILE: 'p',
  }
  expect(resolveAzureSignOptions(environment)).toEqual({
    publisherName: 'GDA Africa', endpoint: 'https://eus.codesigning.azure.net', codeSigningAccountName: 'a', certificateProfileName: 'p',
  })
  expect(resolveAzureSignOptions({ ...environment, AZURE_TRUSTED_SIGNING_PUBLISHER_NAME: 'GDA Africa Ltd' }).publisherName).toBe('GDA Africa Ltd')
})
