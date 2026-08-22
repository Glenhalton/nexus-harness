// @vitest-environment jsdom
/** The Ollama quick-add card: local auto-detection, cloud key gating, and the create write. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '@deepseek-ai/dsh-api-remotes/client'
import { OllamaQuickAddCard } from '../src/client/OllamaQuickAddCard.tsx'
import type { ModelsSectionInjected } from '../src/client/ModelsSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ModelsSectionInjected['t'] = key => en[key]

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}

/** A wire face carrying only what the card reaches for. */
function scriptedFace(options: {
  discover?: ReturnType<typeof vi.fn>
  mutate?: ReturnType<typeof vi.fn>
  set?: ReturnType<typeof vi.fn>
} = {}) {
  const discover = options.discover ?? vi.fn(() => Promise.resolve(ok({ models: [] })))
  const mutate = options.mutate ?? vi.fn(() => Promise.resolve(ok({})))
  const set = options.set ?? vi.fn(() => Promise.resolve(ok({})))
  const face = {
    llm: { discoverModels: discover },
    settings: { mutate },
    credentials: { set },
  }
  return { face, discover, mutate, set }
}

/** The first interrogation payload; fails the case when nothing was asked. */
function firstProbe(discover: ReturnType<typeof vi.fn>): unknown {
  const call = (discover.mock.calls as unknown as [unknown][])[0]?.[0]
  if (call === undefined) throw new Error('no interrogation was recorded')
  return call
}

/** The settings write one card produced, as the scripted face recorded it. */
interface MutateCall {
  ns: string
  expectedRevision?: number
  ops: { op: string; path: string[]; value?: unknown }[]
}

/** The first recorded settings write; fails the case when nothing was written. */
function firstMutate(mutate: ReturnType<typeof vi.fn>): MutateCall {
  const call = mutate.mock.calls[0]?.[0] as MutateCall | undefined
  if (call === undefined) throw new Error('no settings write was recorded')
  return call
}

function mountCard(
  overrides: Partial<Parameters<typeof OllamaQuickAddCard>[0]> = {},
  wire: Parameters<typeof scriptedFace>[0] = {},
) {
  const scripted = scriptedFace(wire)
  const onClose = vi.fn()
  render(
    <OllamaQuickAddCard
      taken={[]}
      revision={7}
      api={scripted.face as never}
      t={t}
      readOnly={false}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { ...scripted, onClose }
}

/** The button carrying `label`, typed so its disabled state is readable. */
function buttonNamed(label: string): HTMLButtonElement {
  const found = screen.getByText(label)
  if (!(found instanceof HTMLButtonElement)) throw new Error(`"${label}" is not a button`)
  return found
}

describe('local mode', () => {
  it('auto-detects installed models on mount, with no key field at all', async () => {
    const discover = vi.fn(() => Promise.resolve(ok({ models: [{ id: 'llama3' }, { id: 'qwen3', contextWindow: 32_768 }] })))
    mountCard({}, { discover })

    await waitFor(() => { expect(discover).toHaveBeenCalled() })
    expect(firstProbe(discover)).toEqual({
      settingsNs: 'llm-pi-ai',
      baseURL: 'http://localhost:11434/v1',
      api: 'openai-completions',
    })
    await screen.findByDisplayValue('llama3')
    expect(screen.getByDisplayValue('qwen3')).toBeTruthy()
    expect(screen.queryByLabelText(en.keyInput)).toBeNull()
  })

  it('shows an inline hint when no local server answers, and the manual retry still works', async () => {
    const discover = vi.fn(() => Promise.reject(new Error('fetch failed')))
    const { discover: sameDiscover } = mountCard({}, { discover })

    await waitFor(() => { expect(screen.getByText(new RegExp(en.ollamaDetectFailed))).toBeTruthy() })

    fireEvent.click(screen.getByText(en.fetchModels))
    await waitFor(() => { expect(sameDiscover).toHaveBeenCalledTimes(2) })
  })

  it('creates a keyless profile with a placeholder auth header, and never writes a credential', async () => {
    const discover = vi.fn(() => Promise.resolve(ok({ models: [{ id: 'llama3' }] })))
    const { mutate, set, onClose } = mountCard({}, { discover })

    await screen.findByDisplayValue('llama3')
    fireEvent.click(screen.getByText(en.create))

    await waitFor(() => { expect(onClose).toHaveBeenCalledWith(true) })
    expect(firstMutate(mutate)).toEqual({
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'ollama'],
        value: {
          displayName: 'Ollama (local)',
          headers: { Authorization: 'Bearer ollama' },
          api: 'openai-completions',
          baseURL: 'http://localhost:11434/v1',
          models: [{ id: 'llama3' }],
        },
      }],
      expectedRevision: 7,
    })
    expect(set).not.toHaveBeenCalled()
  })
})

describe('cloud mode', () => {
  it('requires a key before Create enables', async () => {
    mountCard({}, { discover: vi.fn(() => new Promise(() => {})) })

    fireEvent.click(screen.getByRole('button', { name: en.ollamaModeCloud }))
    await screen.findByLabelText(en.keyInput)
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.change(screen.getByLabelText(`${en.modelId} 1`), { target: { value: 'gpt-oss' } })

    expect(screen.getByText(en.ollamaCloudKeyRequired)).toBeTruthy()
    expect(buttonNamed(en.create).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-cloud' } })
    expect(buttonNamed(en.create).disabled).toBe(false)
  })

  it('writes the key under the derived reference alongside the profile', async () => {
    const { mutate, set, onClose } = mountCard({}, { discover: vi.fn(() => new Promise(() => {})) })

    fireEvent.click(screen.getByRole('button', { name: en.ollamaModeCloud }))
    await screen.findByLabelText(en.keyInput)
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-cloud' } })
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.change(screen.getByLabelText(`${en.modelId} 1`), { target: { value: 'gpt-oss' } })
    fireEvent.click(screen.getByText(en.create))

    await waitFor(() => { expect(onClose).toHaveBeenCalledWith(true) })
    expect(firstMutate(mutate).ops[0]?.value).toEqual({
      displayName: 'Ollama Cloud',
      apiKeyEnv: 'OLLAMA_CLOUD_API_KEY',
      api: 'openai-completions',
      baseURL: 'https://ollama.com/v1',
      models: [{ id: 'gpt-oss' }],
    })
    expect(set).toHaveBeenCalledWith({ ref: 'OLLAMA_CLOUD_API_KEY', value: 'sk-cloud' })
  })
})

describe('mode toggle', () => {
  it('swaps only fields still holding the other mode’s default', async () => {
    mountCard({}, { discover: vi.fn(() => new Promise(() => {})) })

    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).value).toBe('ollama')
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe('http://localhost:11434/v1')

    fireEvent.click(screen.getByRole('button', { name: en.ollamaModeCloud }))
    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).value).toBe('ollama-cloud')
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe('https://ollama.com/v1')

    // An edited field is the user's own from here on.
    fireEvent.change(screen.getByLabelText(en.customRoute), { target: { value: 'my-ollama' } })
    fireEvent.click(screen.getByRole('button', { name: en.ollamaModeLocal }))

    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).value).toBe('my-ollama')
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe('http://localhost:11434/v1')
  })
})

describe('route validation', () => {
  it('blocks creation when the route id is already taken', async () => {
    const discover = vi.fn(() => Promise.resolve(ok({ models: [{ id: 'llama3' }] })))
    const { mutate } = mountCard({ taken: ['ollama'] }, { discover })

    await screen.findByDisplayValue('llama3')
    expect(screen.getByText(en.customRouteTaken)).toBeTruthy()
    expect(buttonNamed(en.create).disabled).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })
})

it('honors a read-only deployment', () => {
  mountCard({ readOnly: true }, { discover: vi.fn(() => new Promise(() => {})) })
  expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).disabled).toBe(true)
  expect(buttonNamed(en.create).disabled).toBe(true)
})

it('does not write anything on cancel', () => {
  const { onClose, mutate } = mountCard({}, { discover: vi.fn(() => new Promise(() => {})) })
  fireEvent.click(screen.getByText(en.cancel))
  expect(onClose).toHaveBeenCalledWith(false)
  expect(mutate).not.toHaveBeenCalled()
})
