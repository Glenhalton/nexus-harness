/** Setup state machine: status mapping, once-per-folder reads, setup transitions, and dismissal. */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NexusSetupController } from '../src/client/controller.ts'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

describe('NexusSetupController', () => {
  it('maps the host status and reads each folder once', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const path = new URL(String(input), 'http://h/').searchParams.get('path')
      return json({ path, state: path === '/ready' ? 'ready' : path === '/gone' ? 'missing' : 'needs-setup' })
    })
    const controller = new NexusSetupController(fetcher)
    const pending = controller.check('/w x')
    expect(controller.phases.getSnapshot()['/w x']).toBe('checking')
    await pending
    await controller.check('/w x')
    await controller.check('/ready')
    await controller.check('/gone')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[0]?.[0]).toBe('nexus-setup/status?path=%2Fw%20x')
    expect(controller.phases.getSnapshot()).toEqual({ '/w x': 'needs-setup', '/ready': 'ready', '/gone': 'missing' })
  })

  it.each([
    ['an absent route', async () => new Response('', { status: 404 })],
    ['a network failure', async () => { throw new Error('down') }],
    ['an unknown state', async () => json({ state: 'weird' })],
  ])('reads %s as unavailable', async (_name, answer) => {
    const controller = new NexusSetupController(vi.fn(answer))
    await controller.check('/w')
    expect(controller.phases.getSnapshot()['/w']).toBe('unavailable')
  })

  it('sets up a folder, retries after failure, and refuses folders not offered', async () => {
    const answers = [json({ state: 'needs-setup' }), json({ code: 'init-failed' }, 500), json({ state: 'ready', created: true })]
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => answers.shift() ?? json({}))
    const controller = new NexusSetupController(fetcher)
    expect(await controller.setUp('/w')).toBe(false)
    await controller.check('/w')
    const first = controller.setUp('/w')
    expect(controller.phases.getSnapshot()['/w']).toBe('setting-up')
    expect(await first).toBe(false)
    expect(controller.phases.getSnapshot()['/w']).toBe('failed')
    expect(await controller.setUp('/w')).toBe(true)
    expect(controller.phases.getSnapshot()['/w']).toBe('ready')
    expect(fetcher.mock.calls[2]).toEqual(['nexus-setup/init', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/w' }),
    }])
    expect(await controller.setUp('/w')).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('treats a dropped connection during setup as failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ state: 'needs-setup' }))
      .mockRejectedValueOnce(new Error('reset'))
    const controller = new NexusSetupController(fetcher)
    await controller.check('/w')
    expect(await controller.setUp('/w')).toBe(false)
    expect(controller.phases.getSnapshot()['/w']).toBe('failed')
  })

  it('dismisses only an offered folder', async () => {
    const controller = new NexusSetupController(vi.fn(async (input: string | URL) =>
      json({ state: String(input).includes('ready') ? 'ready' : 'needs-setup' })))
    await controller.check('/w')
    await controller.check('/ready')
    controller.dismiss('/w')
    controller.dismiss('/ready')
    controller.dismiss('/unknown')
    expect(controller.phases.getSnapshot()).toEqual({ '/w': 'dismissed', '/ready': 'ready' })
  })

  it('defaults to the global fetch', async () => {
    const global = vi.fn(async () => json({ state: 'ready' }))
    vi.stubGlobal('fetch', global)
    try {
      await new NexusSetupController().check('/w')
      expect(global).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('opens one dialog at a time for an offered folder, re-offering a dismissed one', async () => {
    const controller = new NexusSetupController(vi.fn(async (input: string | URL) =>
      json({ state: String(input).includes('ready') ? 'ready' : 'needs-setup' })))
    const a = 'a' as SessionId
    const b = 'b' as SessionId
    await controller.check('/w')
    await controller.check('/ready')
    expect(controller.openDialog(a, '/ready')).toBe(false)
    expect(controller.openDialog(a, '/unknown')).toBe(false)
    expect(controller.dialog.getSnapshot()).toBeNull()
    controller.dismiss('/w')
    expect(controller.openDialog(a, '/w')).toBe(true)
    expect(controller.phases.getSnapshot()['/w']).toBe('needs-setup')
    expect(controller.openDialog(b, '/w')).toBe(true)
    expect(controller.dialog.getSnapshot()).toBe(b)
    controller.closeDialog(a)
    expect(controller.dialog.getSnapshot()).toBe(b)
    controller.closeDialog(b)
    expect(controller.dialog.getSnapshot()).toBeNull()
  })
})
