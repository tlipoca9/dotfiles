import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PI_PROVIDER = 'openai-codex'
const PI_BEARER_REF = 'OPENAI_CODEX_BEARER_TOKEN'
const PI_COMMAND = 'pi'
const PI_COMMAND_TIMEOUT_MS = 30_000

function commandDetail(error) {
  return `${error?.stdout || ''}\n${error?.stderr || ''}`.toLowerCase()
}

async function runPi(args) {
  try {
    return await execFileAsync(process.env.DSH_PI_COMMAND?.trim() || PI_COMMAND, args, {
      cwd: homedir(),
      encoding: 'utf8',
      env: { ...process.env, PI_SKIP_VERSION_CHECK: '1' },
      maxBuffer: 64 * 1024,
      timeout: PI_COMMAND_TIMEOUT_MS,
    })
  } catch (error) {
    const detail = commandDetail(error)
    if (detail.includes('no usable') || detail.includes('not configured')) return undefined
    throw new Error('Pi OAuth credential lookup failed; run `pi auth check --provider openai-codex`')
  }
}

async function resolvePiBearerToken() {
  const result = await runPi([
    'auth',
    'print-bearer-token',
    '--provider',
    PI_PROVIDER,
    '--min-expiry',
    '30m',
  ])
  const token = String(result?.stdout || '').trim()
  return token.length > 0 ? token : undefined
}

async function hasPiCredential() {
  const result = await runPi([
    'auth',
    'check',
    '--provider',
    PI_PROVIDER,
    '--no-refresh',
  ])
  return String(result?.stdout || '').trim() === 'ready'
}

export const name = 'dsh-pi-auth-credentials'
export const inject = ['credentials']

export function apply(ctx) {
  const credentials = ctx.get('credentials')
  if (!credentials) throw new Error('dsh-pi-auth-credentials requires the credentials service')

  ctx.effect(() => {
    // Keep the bridge at the credential seam: the existing local provider
    // still owns every normal reference and its writable document. Only this
    // one read-only reference is supplied by Pi.
    const resolve = credentials.resolve.bind(credentials)
    const describe = credentials.describe.bind(credentials)
    const set = credentials.set.bind(credentials)
    const unset = credentials.unset.bind(credentials)

    credentials.resolve = async ref => {
      const local = await resolve(ref)
      if (local !== undefined || ref !== PI_BEARER_REF) return local
      const value = await resolvePiBearerToken()
      return value === undefined ? undefined : { value, source: 'pi-auth' }
    }

    credentials.describe = async ref => {
      const local = await describe(ref)
      if (local.configured || ref !== PI_BEARER_REF) return local
      try {
        if (await hasPiCredential()) return { configured: true, source: 'pi-auth', writable: false }
      } catch {
        // A status badge must not make dsh startup or the settings page fail.
      }
      return { configured: false, writable: false }
    }

    credentials.set = async (ref, value) => {
      if (ref === PI_BEARER_REF) throw new Error(`${PI_BEARER_REF} is provided by Pi; authenticate with Pi instead`)
      return set(ref, value)
    }

    credentials.unset = async ref => {
      if (ref === PI_BEARER_REF) throw new Error(`${PI_BEARER_REF} is provided by Pi; authenticate with Pi instead`)
      return unset(ref)
    }

    return () => {
      credentials.resolve = resolve
      credentials.describe = describe
      credentials.set = set
      credentials.unset = unset
    }
  }, 'dsh-pi-auth-credentials')
}
