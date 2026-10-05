/** Native welcome operations using the shared Web authentication and RPC APIs. */

import { randomUUID } from 'node:crypto'
import { desktopAccountBackend, type DesktopAccountBackend } from './account-backend.ts'
import type { WelcomeFolderChoice, WelcomeFolderResult } from './welcome-api.ts'

/** Host routes of `@deepseek-ai/dsh-host-nexus-setup`; duplicated so the shell does not depend on that package. */
const NEXUS_SETUP_STATUS_PATH = '/nexus-setup/status'
const NEXUS_SETUP_INIT_PATH = '/nexus-setup/init'

/** Metadata needed before the native entry or workspace becomes visible. */
export interface WelcomeState {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
  readonly writable: boolean
  readonly localePreference: string | null
}

/** Narrow operations available to the native welcome flow. */
export interface DesktopWelcomeBackend {
  readonly account: DesktopAccountBackend
  /** @returns Configured-key presence and the shared language preference, without credential values. */
  read(): Promise<WelcomeState>
  /** @returns The saved UI language without account or provider requests. */
  readLocalePreference(): Promise<string | null>
  /**
   * @param apiKey - User-entered official provider key.
   * @returns A safe write outcome without provider diagnostics.
   */
  save(apiKey: string): Promise<{ ok: boolean }>
  /**
   * @param path - absolute folder chosen in the native dialog.
   * @returns its NEXUS state from the Host setup routes; `unknown` when the Host cannot answer.
   */
  folderState(path: string): Promise<WelcomeFolderChoice['state']>
  /** @param path - absolute folder. @returns whether the Host scaffolded (or already had) `.nexus/`. */
  setUpFolder(path: string): Promise<WelcomeFolderResult>
  /** @param path - absolute folder. @returns whether the Host registered it as a Workspace. */
  useFolder(path: string): Promise<WelcomeFolderResult>
}

/** Official endpoint answering an authenticated model list; used only to check a typed key. */
export const DEEPSEEK_KEY_CHECK_URL = 'https://api.deepseek.com/models'

/** Outcome of checking one key against the official endpoint before it is saved. */
export type ApiKeyCheck = 'ok' | 'rejected' | 'unreachable'

/**
 * Check a typed official key before saving it, so a mistyped key is caught
 * on the welcome form instead of on the first chat turn.
 * @param apiKey - trimmed key the user entered.
 * @param send - network fetch (Electron `net.fetch` in production).
 * @param timeoutMs - deadline for the whole check.
 * @returns `rejected` on 401/403, `unreachable` on network failure, timeout, or a 5xx answer, otherwise `ok`.
 */
export async function checkDeepSeekApiKey(
  apiKey: string,
  send: (input: string, init?: RequestInit) => Promise<Response>,
  timeoutMs = 10_000,
): Promise<ApiKeyCheck> {
  let response: Response
  try {
    response = await send(DEEPSEEK_KEY_CHECK_URL, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // DNS, TLS, proxy, and timeout failures all mean the key could not be checked.
    return 'unreachable'
  }
  await response.body?.cancel()
  if (response.status === 401 || response.status === 403) return 'rejected'
  if (response.status >= 500) return 'unreachable'
  return 'ok'
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns metadata reads and write-only credential operations over standard RPC.
 */
export async function connectDesktopWelcome(
  authenticatedUrl: string,
  send: (input: string, init?: RequestInit) => Promise<Response>,
  cookies: () => Promise<string> = () => Promise.resolve(''),
): Promise<DesktopWelcomeBackend> {
  const origin = new URL(authenticatedUrl).origin
  const authenticated = await send(authenticatedUrl, { credentials: 'include' })
  await authenticated.body?.cancel()
  if (!authenticated.ok) throw new Error('desktop welcome: Web authentication failed')
  const invoke = async (request: { namespace: string; method: string; args: Record<string, unknown> }): Promise<unknown> => {
    const rpcId = randomUUID()
    const method = `${request.namespace}/${request.method}`
    const response = await send(new URL(`/api/${method}`, origin).href, {
      method: 'POST', credentials: 'include', redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: request.args } }),
    })
    if (!response.ok) throw new Error('desktop welcome: Web request failed')
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
      || !record(envelope.result) || envelope.result.ok !== true) {
      throw new Error('desktop welcome: Web RPC failed')
    }
    return envelope.result.value
  }
  const account = desktopAccountBackend(origin, invoke, cookies)
  const settingsAndReference = async () => {
    const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
    if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop welcome: missing settings namespaces')
    const official: unknown = settings.namespaces.find((item: unknown) => record(item) && item.ns === 'llm-deepseek')
    if (official === undefined) return { settings: { namespaces: settings.namespaces }, ref: undefined }
    if (!record(official) || !record(official.value) || typeof official.value.apiKeyEnv !== 'string') {
      throw new Error('desktop welcome: missing official DeepSeek credential reference')
    }
    return { settings: { namespaces: settings.namespaces }, ref: official.value.apiKeyEnv }
  }
  const localePreference = (namespaces: unknown[]): string | null => {
    const locale: unknown = namespaces.find((item: unknown) => record(item) && item.ns === 'locale')
    if (!record(locale) || !record(locale.value)
      || (locale.value.preference !== undefined && typeof locale.value.preference !== 'string')) {
      throw new Error('desktop welcome: invalid locale preference')
    }
    return locale.value.preference ?? null
  }
  const read = async (): Promise<WelcomeState> => {
    const { settings, ref } = await settingsAndReference()
    const providers = await invoke({ namespace: 'llm', method: 'listConfigurableProviders', args: {} })
    if (!Array.isArray(providers)) throw new Error('desktop welcome: invalid provider directory')
    const namespaces = settings.namespaces
    const refs = providers.flatMap((provider: unknown) => {
      if (!record(provider) || typeof provider.settingsNs !== 'string' || !Array.isArray(provider.settingsPath)) {
        throw new Error('desktop welcome: invalid provider settings address')
      }
      const namespace: unknown = namespaces.find((item: unknown) => record(item) && item.ns === provider.settingsNs)
      let value: unknown = record(namespace) ? namespace.value : undefined
      for (const key of provider.settingsPath as unknown[]) {
        if (typeof key !== 'string') throw new Error('desktop welcome: invalid provider settings path')
        value = record(value) ? value[key] : undefined
      }
      return record(value) && typeof value.apiKeyEnv === 'string' ? [value.apiKeyEnv] : []
    })
    const unique = [...new Set([...(ref === undefined ? [] : [ref]), ...refs])]
    const states: Record<string, unknown> = {}
    // credentials.describe accepts at most 64 references per request.
    for (let offset = 0; offset < unique.length; offset += 64) {
      const batch = await invoke({ namespace: 'credentials', method: 'describe', args: { refs: unique.slice(offset, offset + 64) } })
      if (!record(batch)) throw new Error('desktop welcome: invalid credential metadata')
      Object.assign(states, batch)
    }
    if (ref !== undefined && !record(states[ref])) throw new Error('desktop welcome: missing credential metadata')
    return {
      loggedIn: (await account.state()).status === 'credential-stored',
      hasApiKey: Object.values(states).some(value => record(value) && value.configured === true),
      writable: ref !== undefined && record(states[ref]) && states[ref].writable === true,
      localePreference: localePreference(namespaces),
    }
  }
  return {
    account,
    read,
    async readLocalePreference() {
      const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
      if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop welcome: missing settings namespaces')
      return localePreference(settings.namespaces)
    },
    async save(apiKey) {
      if (!/^[\x21-\x7e]+$/.test(apiKey)) return { ok: false }
      try {
        const { ref } = await settingsAndReference()
        if (ref === undefined) return { ok: false }
        await invoke({ namespace: 'credentials', method: 'set', args: { ref, value: apiKey } })
        return { ok: true }
      } catch {
        // Provider diagnostics may contain credentials; the native form owns failure copy.
        return { ok: false }
      }
    },
    async folderState(path) {
      try {
        const url = new URL(NEXUS_SETUP_STATUS_PATH, origin)
        url.searchParams.set('path', path)
        const response = await send(url.href, { credentials: 'include', redirect: 'error', headers: { accept: 'application/json' } })
        if (!response.ok) {
          await response.body?.cancel()
          return 'unknown'
        }
        const payload: unknown = await response.json()
        const state = record(payload) ? payload.state : undefined
        return state === 'ready' || state === 'needs-setup' ? state : 'unknown'
      } catch {
        // A Host without the setup routes, or a malformed answer: use the folder without offering setup.
        return 'unknown'
      }
    },
    async setUpFolder(path) {
      try {
        const response = await send(new URL(NEXUS_SETUP_INIT_PATH, origin).href, {
          method: 'POST', credentials: 'include', redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path }),
        })
        await response.body?.cancel()
        return { ok: response.ok }
      } catch {
        return { ok: false }
      }
    },
    async useFolder(path) {
      try {
        await invoke({ namespace: 'workspace', method: 'create', args: { request: { path } } })
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }
}
