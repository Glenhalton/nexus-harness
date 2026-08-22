/**
 * A shaped shortcut over the same hand-declared `llm-pi-ai` route mechanism
 * {@link CustomProviderCard} exposes generically, pre-filled for Ollama: both
 * Ollama's local server and Ollama Cloud speak the OpenAI-compatible listing
 * and chat shapes `openai-completions` already covers, so this card commits
 * the identical profile shape — it only removes the manual steps (base URL,
 * protocol, model entry) a user would otherwise have to know to type.
 *
 * Local mode carries no API key field at all and auto-probes the endpoint on
 * mount, since a local Ollama server needs no credential of its own: the
 * profile it commits never sets `apiKeyEnv`. It does commit a placeholder
 * `Authorization` header, though — pi-ai's `openai-completions` client
 * refuses to build a request with neither an `apiKey` nor an `Authorization`
 * header present, regardless of whether the endpoint checks it, so a fully
 * keyless profile can discover models (a plain GET) but can never complete a
 * chat request. Ollama ignores the header's value, so any placeholder clears
 * pi-ai's client-side gate without implying real authentication. Cloud mode
 * requires a key before Create enables,
 * unlike the generic card's optional one, because Ollama Cloud has no
 * unauthenticated path. Switching modes only replaces a field still holding
 * its previous mode's default, so a user's own edits are never clobbered.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DiscoveredModelView, IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { apiKeyFailure } from './apiKey.ts'
import { EditorFooter } from './EditorFooter.tsx'
import { validateDeepSeekModels } from './DeepSeekModelsEditor.tsx'
import { ModelListEditor } from './ModelListEditor.tsx'
import type { ModelDraft } from './ModelListEditor.tsx'
import { deriveKeyRef, messageOf } from './store.ts'
import { ROUTE_PATTERN } from './providerRoute.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** The settings namespace a hand-declared provider is written into. */
const NS = 'llm-pi-ai'

/** The one wire protocol this card ever declares: Ollama speaks it both locally and in the cloud. */
const API = 'openai-completions'

type Mode = 'local' | 'cloud'

/** Route/display-name/base-URL defaults for one mode. */
interface ModeDefaults {
  route: string
  displayName: string
  baseURL: string
}

const LOCAL_DEFAULTS: ModeDefaults = {
  route: 'ollama',
  displayName: 'Ollama (local)',
  baseURL: 'http://localhost:11434/v1',
}

/**
 * Ollama Cloud's OpenAI-compatible endpoint, mirroring the local `/v1`
 * compatibility surface. Editable like every other base URL on this page, so
 * a stale value is a one-field fix rather than a dead end.
 */
const CLOUD_DEFAULTS: ModeDefaults = {
  route: 'ollama-cloud',
  displayName: 'Ollama Cloud',
  baseURL: 'https://ollama.com/v1',
}

const DEFAULTS: Readonly<Record<Mode, ModeDefaults>> = { local: LOCAL_DEFAULTS, cloud: CLOUD_DEFAULTS }

/**
 * Local mode's placeholder `Authorization` header. Ollama's local server
 * never checks it, but pi-ai's `openai-completions` client throws before any
 * request goes out when a route names neither an `apiKey` nor this header —
 * see the module doc comment above.
 */
const LOCAL_AUTH_HEADER = { Authorization: 'Bearer ollama' }

/** Props of {@link OllamaQuickAddCard}. */
export interface OllamaQuickAddCardProps {
  /** Route ids already declared, so the card refuses to shadow one. */
  taken: readonly string[]
  /**
   * Revision of the `llm-pi-ai` user section this card opened at, sent with
   * the create so a route another tab declared meanwhile is a refusal rather
   * than a silent overwrite of its whole profile.
   */
  revision: number
  /** Wire faces for the write and for interrogating the endpoint. */
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable writes (read-only settings provider). */
  readOnly: boolean
  /** Close the card; `changed` reports whether a provider was created. */
  onClose: (changed: boolean) => void
}

/** Adopt a discovered candidate, keeping whatever capacities the provider disclosed. */
function adopt(candidate: DiscoveredModelView): ModelDraft {
  return {
    id: candidate.id,
    ...candidate.name === undefined ? {} : { name: candidate.name },
    ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
    ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
  }
}

/**
 * Render the Ollama quick-add card.
 * @param props - existing routes, wire faces, and copy.
 * @returns the creation card.
 */
export function OllamaQuickAddCard(props: OllamaQuickAddCardProps): ReactNode {
  const { taken, api, t } = props
  // Captured at mount, like the generic custom card's: the write must be
  // judged against the section this card was drafted over.
  const [openedAt] = useState(() => props.revision)
  const [mode, setMode] = useState<Mode>('local')
  const [route, setRoute] = useState(LOCAL_DEFAULTS.route)
  const [displayName, setDisplayName] = useState(LOCAL_DEFAULTS.displayName)
  const [baseURL, setBaseURL] = useState(LOCAL_DEFAULTS.baseURL)
  const [keyDraft, setKeyDraft] = useState('')
  const [models, setModels] = useState<readonly ModelDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [committed, setCommitted] = useState(false)
  const [autoProbing, setAutoProbing] = useState(false)
  const [autoFailure, setAutoFailure] = useState<string | undefined>(undefined)
  const disabled = props.readOnly || busy
  /** Everything but the key stops being editable once the provider exists. */
  const profileDisabled = disabled || committed

  const switchMode = (next: Mode): void => {
    if (next === mode || profileDisabled) return
    const previous = DEFAULTS[mode]
    const target = DEFAULTS[next]
    if (route === previous.route) setRoute(target.route)
    if (displayName === previous.displayName) setDisplayName(target.displayName)
    if (baseURL === previous.baseURL) setBaseURL(target.baseURL)
    setMode(next)
  }

  // Local needs no key at all, so it is worth detecting without asking the
  // user to click anything: on mount, and whenever a mode switch lands back
  // on Local with nothing adopted yet, ask the endpoint what it serves. A
  // user who already picked models, or who edited the base URL away from
  // detection, keeps that draft — this only ever fills an empty list.
  useEffect(() => {
    if (mode !== 'local' || committed || models.length > 0) return
    // A getter, not a local `let`: oxlint's type-aware narrowing would flag a
    // plain boolean flag mutated only from the cleanup closure as always
    // false at every read site inside the async body below.
    const superseded = new AbortController()
    setAutoProbing(true)
    setAutoFailure(undefined)
    void (async () => {
      try {
        const response = await api.llm.discoverModels({ settingsNs: NS, baseURL, api: API })
        if (superseded.signal.aborted) return
        if (!response.result.ok) {
          setAutoFailure(response.result.error.message)
          return
        }
        const found = response.result.value.models
        if (found.length === 0) {
          setAutoFailure(t('fetchEmpty'))
          return
        }
        setModels(found.map(adopt))
      } catch (error) {
        if (superseded.signal.aborted) return
        setAutoFailure(messageOf(error))
      } finally {
        if (!superseded.signal.aborted) setAutoProbing(false)
      }
    })()
    return () => { superseded.abort() }
    // Deliberately keyed on `mode` alone: a base-URL keystroke must not spend
    // a round trip per character, and `models.length` is read, not tracked,
    // so adopting a picked model never re-triggers this effect.
  }, [mode])

  const routeInvalid = route.length > 0 && !ROUTE_PATTERN.test(route)
  const routeTaken = taken.includes(route)
  const modelFailure = validateDeepSeekModels(models)
  const keyFailure = mode === 'cloud' ? apiKeyFailure(keyDraft) : undefined
  // The typed key with paste whitespace removed. Local mode never renders the
  // field, so this is always empty there.
  const keyValue = keyDraft.trim()
  const cloudKeyMissing = mode === 'cloud' && keyValue.length === 0
  const ready = route.length > 0 && !routeInvalid && !routeTaken
    && baseURL.length > 0 && models.length > 0 && modelFailure === undefined
    && keyFailure === undefined && !cloudKeyMissing
  // The one blocked gate worth a line under the form; a satisfied card says
  // nothing, and a gate with its own field-level message stays silent here.
  const hint = failure !== undefined || ready
    || keyFailure !== undefined
    || route.length === 0 || routeInvalid || routeTaken
    ? undefined
    : baseURL.length === 0
      ? t('customNeedsBaseUrl')
      : cloudKeyMissing
        ? t('ollamaCloudKeyRequired')
        : modelFailure !== undefined
          ? `${t('model')} ${String(modelFailure.index + 1)}: ${t(modelFailure.key)}`
          : t('customNeedsModels')

  /** Perform the create, returning a failure message or undefined. */
  const createOnce = async (): Promise<string | undefined> => {
    const keyRef = deriveKeyRef(route)
    const storesKey = mode === 'cloud' && keyValue.length > 0
    if (!committed) {
      const profile = {
        ...displayName.length === 0 ? {} : { displayName },
        ...storesKey ? { apiKeyEnv: keyRef } : {},
        ...mode === 'local' ? { headers: LOCAL_AUTH_HEADER } : {},
        api: API,
        baseURL,
        models: models.map(model => ({ ...model })),
      }
      const response = await api.settings.mutate({
        ns: NS,
        ops: [{ op: 'set', path: ['providers', route], value: profile }],
        expectedRevision: openedAt,
      })
      if (!response.result.ok) return response.result.error.message
      // The provider now exists; a retry after the key write below must not
      // re-run this mutate against a revision it has already superseded.
      setCommitted(true)
    }
    if (storesKey) {
      const stored = await api.credentials.set({ ref: keyRef, value: keyValue })
      if (!stored.result.ok) return stored.result.error.message
    }
    return undefined
  }

  const create = async (): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const outcome = await createOnce()
      if (outcome !== undefined) {
        setFailure(outcome)
        return
      }
      props.onClose(true)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles['editor']}>
      <div className={styles['editorHeader']}>
        <span className={styles['editorTitle']}>{t('ollamaTitle')}</span>
      </div>
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{t('ollamaMode')}</span>
        <div className={styles['modelListHead']}>
          <button
            type="button"
            className={mode === 'local' ? styles['primaryButton'] : styles['secondaryButton']}
            aria-pressed={mode === 'local'}
            disabled={profileDisabled}
            onClick={() => { switchMode('local') }}
          >
            {t('ollamaModeLocal')}
          </button>
          <button
            type="button"
            className={mode === 'cloud' ? styles['primaryButton'] : styles['secondaryButton']}
            aria-pressed={mode === 'cloud'}
            disabled={profileDisabled}
            onClick={() => { switchMode('cloud') }}
          >
            {t('ollamaModeCloud')}
          </button>
        </div>
        <p className={styles['advancedHint']}>{t(mode === 'local' ? 'ollamaLocalHint' : 'ollamaCloudHint')}</p>
      </div>
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{t('customRoute')}</span>
        <input
          className={styles['input']}
          type="text"
          value={route}
          aria-label={t('customRoute')}
          disabled={profileDisabled}
          onChange={(event) => { setRoute(event.target.value) }}
        />
      </div>
      {routeInvalid || routeTaken
        ? <p className={styles['error']}>{t(routeInvalid ? 'customRouteInvalid' : 'customRouteTaken')}</p>
        : <p className={styles['advancedHint']}>{t('customRouteHint')}</p>}
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{t('customDisplayName')}</span>
        <input
          className={styles['input']}
          type="text"
          value={displayName}
          aria-label={t('customDisplayName')}
          disabled={profileDisabled}
          onChange={(event) => { setDisplayName(event.target.value) }}
        />
      </div>
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{t('baseUrl')}</span>
        <input
          className={styles['input']}
          type="text"
          value={baseURL}
          aria-label={t('baseUrl')}
          disabled={profileDisabled}
          onChange={(event) => { setBaseURL(event.target.value); setAutoFailure(undefined) }}
        />
        <p className={styles['advancedHint']}>{t('ollamaProtocolNote')}</p>
      </div>
      {mode === 'cloud'
        ? (
          <div className={styles['field']}>
            <span className={styles['fieldLabel']}>{t('keyInput')}</span>
            <input
              className={styles['input']}
              type="password"
              autoComplete="off"
              value={keyDraft}
              placeholder={t('keyPlaceholder')}
              aria-label={t('keyInput')}
              disabled={disabled}
              onChange={(event) => { setKeyDraft(event.target.value) }}
            />
            {keyFailure === undefined
              ? null
              : <p className={styles['error']}>{t(keyFailure === 'keyBlank' ? 'keyBlankNew' : keyFailure)}</p>}
          </div>
        )
        : null}
      {mode === 'local' && (autoProbing || autoFailure !== undefined)
        ? (
          <p className={styles['advancedHint']}>
            {autoProbing ? t('ollamaDetecting') : `${t('ollamaDetectFailed')} (${autoFailure ?? ''})`}
          </p>
        )
        : null}
      <ModelListEditor
        models={models}
        onChange={setModels}
        probe={{
          settingsNs: NS,
          baseURL,
          api: API,
          ...mode === 'cloud' && keyValue.length > 0 ? { apiKey: keyValue } : {},
        }}
        probeBlocked={mode === 'cloud' ? (keyFailure === 'keyBlank' ? 'keyBlankNew' : keyFailure) : undefined}
        api={api}
        t={t}
        disabled={profileDisabled}
      />
      {failure !== undefined ? <p className={styles['error']}>{failure}</p> : null}
      {hint === undefined ? null : <p className={styles['advancedHint']}>{hint}</p>}
      <EditorFooter
        t={t}
        busy={busy}
        submitDisabled={disabled || !ready}
        submitLabel="create"
        submitBusyLabel="creating"
        onCancel={() => { props.onClose(committed) }}
        onSubmit={() => { void create() }}
      />
    </div>
  )
}
