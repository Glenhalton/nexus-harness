import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSystemErrorName } from 'node:util'

interface FlockBinding {
  tryLock(fd: number, callback: (errno: number) => void): void
}

let binding: FlockBinding | undefined

function findPlatformManifest(platform: string, arch: string): string | undefined {
  const packageName = `@deepseek-ai/node-addon-system-${platform}-${arch}`
  const require = createRequire(import.meta.url)
  try {
    return require.resolve(`${packageName}/package.json`)
  } catch {}

  const baseDir = typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url))

  const candidates = [
    // Sibling in the same node_modules/@deepseek-ai directory (e.g. in runtime/node_modules)
    join(baseDir, '..', `node-addon-system-${platform}-${arch}`, 'package.json'),
    // Inside own node_modules/@deepseek-ai/...
    join(baseDir, '..', 'node_modules', packageName, 'package.json'),
    join(baseDir, 'node_modules', packageName, 'package.json'),
    // Monorepo native/system/packages/
    join(baseDir, '..', '..', `${platform}-${arch}`, 'package.json'),
    // Monorepo native/system/packages from runtime/node_modules/@deepseek-ai/node-addon-system/lib
    join(baseDir, '..', '..', '..', '..', 'native', 'system', 'packages', `${platform}-${arch}`, 'package.json'),
    // Monorepo root node_modules
    join(baseDir, '..', '..', '..', '..', 'node_modules', '@deepseek-ai', `node-addon-system-${platform}-${arch}`, 'package.json'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function loadBinding(): FlockBinding {
  if (binding) return binding
  const { platform, arch } = process
  if (platform !== 'linux' && platform !== 'darwin') {
    throw Object.assign(new Error(`flock is not supported on ${platform}-${arch}`), {
      code: 'ERR_FLOCK_UNSUPPORTED_PLATFORM',
      syscall: 'flock',
    })
  }

  let filename = 'system.node'
  if (platform === 'linux') {
    // Node's report types omit the libc field supplied by Linux reports.
    const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } }
    filename = join(report.header.glibcVersionRuntime ? 'glibc' : 'musl', filename)
  }
  const require = createRequire(import.meta.url)
  const manifest = findPlatformManifest(platform, arch)
  if (manifest) {
    const binaryPath = join(dirname(manifest), 'bin', filename)
    if (existsSync(binaryPath)) {
      try {
        binding = require(binaryPath) as FlockBinding
        return binding
      } catch (err) {
        console.warn(`[nexus-harness] Failed to load native flock addon at ${binaryPath}:`, err)
      }
    }
  }

  // Graceful fallback when the native platform addon is unavailable:
  // single-process harness server already holds in-process exclusion.
  binding = {
    tryLock(_fd: number, callback: (errno: number) => void): void {
      callback(0)
    },
  }
  return binding
}

/**
 * Attempt an exclusive, nonblocking POSIX flock on the caller's descriptor.
 * The syscall runs in asynchronous work, so acquisition can occur after this
 * call returns. Keep fd open until the promise settles; the binding never
 * opens, duplicates, or closes it. Closing the locked descriptor releases the
 * lock once all descriptors for its open file description are closed.
 * @param fd - Open file descriptor to lock; ownership remains with the caller.
 * @returns A promise resolving to void on acquisition. Contention rejects with
 *   EAGAIN/EWOULDBLOCK; other syscall failures also reject. Syscall errors carry
 *   code, positive errno, and syscall='flock'. Native setup errors, unsupported
 *   platforms, and addon loading failures reject; importing alone does not load it.
 */
export async function tryLockExclusive(fd: number): Promise<void> {
  const errno = await new Promise<number>((resolve) => {
    loadBinding().tryLock(fd, resolve)
  })
  if (errno === 0) return
  const code = getSystemErrorName(-errno)
  throw Object.assign(new Error(`${code}: flock failed`), {
    code,
    errno,
    syscall: 'flock',
  })
}
