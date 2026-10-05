/**
 * Host half of in-app NEXUS setup: two routes on the composition's
 * `webServer` that report whether a folder is a NEXUS project and scaffold
 * one through the bundled `@nexus-framework/cli`. The browser setup prompt
 * (`@deepseek-ai/dsh-client-ui-nexus-setup`) and the Desktop welcome window
 * both call these routes, so no user ever types `nexus init`.
 *
 * Every route asks the composition's `connection` service for a rejection
 * first (`requestRejection`): its Host/Origin fence and browser
 * authentication gate every caller before any filesystem read or write. The
 * init route additionally validates its body at the wire (an
 * `application/json` media type, a 64 KiB ceiling, a string absolute path
 * naming an existing directory) and serializes concurrent requests per path.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { initNexusProject, loadAdoptProject, readNexusState, type AdoptProject } from './scaffold.ts'
import {
  NEXUS_SETUP_INIT_PATH, NEXUS_SETUP_STATUS_PATH,
  type NexusSetupErrorPayload, type NexusSetupInitPayload, type NexusSetupStatusPayload,
} from './shared.ts'

export type * from './shared.ts'

/** Cordis function-plugin name. */
export const name = 'nexus-setup'
/** The route carrier and the trust fence guarding every route. */
export const inject = ['webServer', 'connection']

/** Test seam: replaces the lazily loaded CLI generator. */
export const internals: { adopt: (() => Promise<AdoptProject>) | undefined } = { adopt: undefined }

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface NexusSetupConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

function connectionOf(ctx: Context): NexusSetupConnection {
  return Reflect.get(ctx, 'connection') as NexusSetupConnection
}

/** Init-route bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendError(res: ServerResponse, status: number, code: NexusSetupErrorPayload['code'], message: string): void {
  sendJson(res, status, { code, message } satisfies NexusSetupErrorPayload)
}

function sendMethodNotAllowed(res: ServerResponse, allow: 'GET' | 'POST'): void {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling (stream drained). */
async function readBoundedBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/** A usable folder path: non-empty, absolute; normalized so `a/` and `a` share one lock. */
function folderPath(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && isAbsolute(value) ? resolve(value) : null
}

/** Register the status and init routes behind the connection trust fence. */
export function apply(ctx: Context): void {
  /** In-flight setups keyed by normalized path; a second click joins the first. */
  const running = new Map<string, Promise<boolean>>()
  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    const rejection = connectionOf(ctx).requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: NEXUS_SETUP_STATUS_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const path = folderPath(new URL(String(req.url), 'http://localhost').searchParams.get('path'))
      if (path === null) {
        sendError(res, 400, 'bad-request', 'path must be an absolute directory path')
        return
      }
      sendJson(res, 200, { path, state: await readNexusState(path) } satisfies NexusSetupStatusPayload)
    },
  }), `nexus-setup: GET ${NEXUS_SETUP_STATUS_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: NEXUS_SETUP_INIT_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
      if (essence !== 'application/json') {
        sendError(res, 415, 'unsupported-media-type', 'content-type must be application/json')
        return
      }
      let text: string | null
      try {
        text = await readBoundedBody(req)
      } catch {
        // Connection errors mid-body leave nothing to answer precisely.
        sendError(res, 400, 'bad-request', 'request body unreadable')
        return
      }
      if (text === null) {
        sendError(res, 413, 'payload-too-large', 'request body is too large')
        return
      }
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        body = undefined
      }
      const path = folderPath(typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : undefined)
      if (path === null) {
        sendError(res, 400, 'bad-request', 'request body must be JSON with an absolute "path"')
        return
      }
      if (await readNexusState(path) === 'missing') {
        sendError(res, 404, 'not-found', `directory does not exist: ${path}`)
        return
      }
      let job = running.get(path)
      if (job === undefined) {
        job = initNexusProject(path, internals.adopt ?? loadAdoptProject).finally(() => { running.delete(path) })
        running.set(path, job)
      }
      try {
        const created = await job
        sendJson(res, 200, { path, state: 'ready', created } satisfies NexusSetupInitPayload)
      } catch (error) {
        sendError(res, 500, 'init-failed', error instanceof Error ? error.message : String(error))
      }
    },
  }), `nexus-setup: POST ${NEXUS_SETUP_INIT_PATH}`)
}
