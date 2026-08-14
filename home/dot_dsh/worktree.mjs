import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const WORKTREE_ROOT = resolve(process.env.DSH_WORKTREE_ROOT || join(DSH_HOME, 'worktrees'))
const PROVIDER_NAME = 'worktree'
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

// The registry is process-local; the Git worktree and branch are the durable
// handoff. Keeping this map only adds labels while the current dsh process is
// alive and must never be required for merge or cleanup after a restart.
const records = new Map()

export const name = 'dsh-worktree'
export const inject = ['tools', 'subagents', 'agents', 'systemPrompt']

function textBlock(text) {
  return [{ type: 'text', text }]
}

function outputText(blocks) {
  return blocks
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

function renderJson(_args, value) {
  return textBlock(JSON.stringify(value, null, 2))
}

function isPathUnder(candidate, parent) {
  const childRelative = relative(parent, candidate)
  return childRelative !== '' && childRelative !== '..'
    && !childRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(childRelative)
}

function errorText(error) {
  if (error && typeof error === 'object') {
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : ''
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : ''
    if (stderr) return stderr
    if (stdout) return stdout
    if (error instanceof Error) return error.message
  }
  return String(error)
}

async function git(cwd, args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: MAX_OUTPUT_BYTES,
    })
    return {
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      code: 0,
    }
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: typeof error?.stdout === 'string' ? error.stdout : '',
        stderr: typeof error?.stderr === 'string' ? error.stderr : errorText(error),
        code: typeof error?.code === 'number' ? error.code : 1,
      }
    }
    const detail = errorText(error)
    throw new Error(`git -C ${cwd} ${args.join(' ')} failed: ${detail}`)
  }
}

async function canonicalDirectory(path) {
  return realpath(resolve(path))
}

async function canonicalPath(path) {
  let current = resolve(path)
  const suffix = []
  while (true) {
    try {
      const existing = await realpath(current)
      return join(existing, ...suffix.reverse())
    } catch (error) {
      const parent = dirname(current)
      if (parent === current) throw error
      suffix.push(basename(current))
      current = parent
    }
  }
}

async function parentRepository(agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error('worktree delegation requires a parent session with a working directory')
  }
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
  if (!root) throw new Error(`cannot determine the Git repository for ${cwd}`)
  return canonicalDirectory(root)
}

async function requireCleanRepository(root, label) {
  const status = await repositoryStatus(root)
  if (status) {
    const sample = status.split('\n').slice(0, 12).join('\n')
    throw new Error(`${label} worktree is not clean; resolve these changes before this Git operation:\n${sample}`)
  }
}

async function repositoryStatus(root) {
  return (await git(root, ['status', '--porcelain=v1', '--untracked-files=all'])).stdout.trim()
}

function taskSlug(description) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'task'
}

async function allocateWorktree(parent, description) {
  const repoRoot = await parentRepository(parent)
  const parentStatus = await repositoryStatus(repoRoot)
  const worktreeRoot = await canonicalPath(WORKTREE_ROOT)
  if (worktreeRoot === repoRoot || isPathUnder(worktreeRoot, repoRoot)) {
    throw new Error(`worktree root ${worktreeRoot} must be outside the parent repository ${repoRoot}`)
  }

  const baseCommit = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim()
  if (!baseCommit) throw new Error(`repository ${repoRoot} has no commit to use as a worktree base`)

  const token = randomUUID().slice(0, 8)
  const slug = taskSlug(description)
  const branch = `dsh/${slug}-${token}`
  const path = join(worktreeRoot, basename(repoRoot), `${slug}-${token}`)
  await mkdir(dirname(path), { recursive: true })
  await git(repoRoot, ['worktree', 'add', '-b', branch, path, baseCommit])
  const canonicalWorktreePath = await canonicalDirectory(path)
  return {
    repoRoot,
    path: canonicalWorktreePath,
    branch,
    baseCommit,
    parentClean: parentStatus.length === 0,
    worktreeId: token,
  }
}

async function discardAllocation(allocation) {
  await git(allocation.repoRoot, ['worktree', 'remove', '--force', allocation.path], { allowFailure: true })
  await git(allocation.repoRoot, ['branch', '-D', allocation.branch], { allowFailure: true })
}

function parseWorktreeList(text) {
  const entries = []
  let current
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current)
      current = { path: line.slice('worktree '.length) }
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    } else if (current && line === 'detached') {
      current.branch = undefined
    }
  }
  if (current) entries.push(current)
  return entries
}

async function registeredWorktree(repoRoot, requestedPath) {
  if (!isAbsolute(requestedPath)) throw new Error('worktree_path must be an absolute path')
  const path = await canonicalDirectory(requestedPath)
  const worktreeRoot = await canonicalPath(WORKTREE_ROOT)
  if (!isPathUnder(path, worktreeRoot)) {
    throw new Error(`worktree path must be under the dsh worktree root ${worktreeRoot}`)
  }
  const entries = parseWorktreeList((await git(repoRoot, ['worktree', 'list', '--porcelain'])).stdout)
  let entry
  for (const candidate of entries) {
    try {
      if (await canonicalDirectory(candidate.path) === path) {
        entry = candidate
        break
      }
    } catch {
      // A stale worktree entry is not a valid merge target.
    }
  }
  if (!entry) throw new Error(`path is not a registered Git worktree of ${repoRoot}: ${path}`)
  if (path === repoRoot) throw new Error('the parent worktree is not a delegated worktree')
  if (!entry.branch) throw new Error(`worktree is detached and has no merge branch: ${path}`)
  if (!entry.branch.startsWith('dsh/')) throw new Error(`worktree branch is not managed by dsh: ${entry.branch}`)
  return { ...entry, path, branch: entry.branch }
}

async function inspectWorktree(repoRoot, requestedPath) {
  const entry = await registeredWorktree(repoRoot, requestedPath)
  const statusOutput = (await git(entry.path, ['status', '--porcelain=v1', '--branch', '--untracked-files=all'])).stdout.trimEnd()
  const lines = statusOutput ? statusOutput.split('\n') : []
  const changes = lines.filter(line => !line.startsWith('##'))
  const head = (await git(entry.path, ['rev-parse', 'HEAD'])).stdout.trim()
  const record = [...records.values()].find(candidate => candidate.path === entry.path)
  if (record) {
    record.headCommit = head
    record.clean = changes.length === 0
  }
  return {
    worktree_path: entry.path,
    branch: entry.branch,
    head_commit: head,
    clean: changes.length === 0,
    status: changes.join('\n'),
  }
}

function finalBlocks(events) {
  let message
  let partial = ''
  for (const event of events) {
    if (event.type === 'assistant/message' && Array.isArray(event.data?.message?.content)) {
      if (event.data.message.content.length > 0) message = event.data.message.content
    } else if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'text-delta') {
      partial += event.data.chunk.text || ''
    }
  }
  return message || (partial ? textBlock(partial) : [])
}

function stopReason(events) {
  const end = [...events].reverse().find(event => event.type === 'turn/end')
  const kind = end?.data?.reason?.kind
  switch (kind) {
    case 'completed': return 'completed'
    case 'aborted': return 'aborted'
    case 'max-tokens': return 'max-tokens'
    case 'blocked': return 'refusal'
    default: return 'error'
  }
}

function userMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: textBlock(text),
    source: { kind: 'user' },
  }
}

function childPrompt(task, allocation) {
  const lines = [
    'You are a write-capable delegated worker running in an isolated Git worktree.',
    `Your worktree is ${allocation.path}. Your branch is ${allocation.branch}. The base commit is ${allocation.baseCommit}.`,
    ...(allocation.parentClean ? [] : ['The parent worktree had uncommitted changes when this branch was created. They are not included here; do not depend on or overwrite them.']),
    'All code and file writes must stay in this worktree. Never use an absolute path into the parent worktree.',
    'Implement the task, run focused verification, and commit every intended change to your assigned branch before replying.',
    'Do not merge, rebase, push, or create another subagent. Report the commit and the checks you ran.',
    '',
    'TASK:',
    task,
  ]
  return lines.join('\n')
}

function childSetup(childCtx, parent, request, allocation, parentPreset) {
  const child = childCtx.agent
  if (!child) throw new Error('worktree child agent was not available during setup')

  if (parentPreset !== undefined) childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)

  const delegatedMode = parent.ctx.get('sandboxPolicy')?.overrideOf(parent.session)
  if (delegatedMode !== undefined) {
    child.session.append('sandbox/mode', { mode: delegatedMode, source: 'delegation' })
  }
  if (parent.ctx.get('approval') !== undefined) {
    child.session.append('approval/policy', { policy: 'never', source: 'delegation' })
  }

  childCtx.systemPrompt.context({
    name: 'dsh:worktree-worker',
    order: 120,
    text: 'You are a delegated worker. The coordinating agent owns the parent worktree and the merge. Work only in your assigned worktree, commit your changes, and report without merging.',
  })

  // A worker must not recursively delegate writes into the same worktree. Build
  // the deny list from the live catalog so disabled optional providers do not
  // turn child setup into an unknown-tool failure.
  const blockedNames = new Set([
    'subagent',
    'subagent_fork',
    'delegate_worktree',
    'merge_worktree',
    'worktree_status',
    'cleanup_worktree',
    'workflow',
    'ralph',
  ])
  const deny = childCtx.tools.schemas().map(schema => schema.name).filter(toolName => blockedNames.has(toolName))
  if (deny.length > 0) childCtx.tools.restrict({ deny })

  let descriptorAppended = false
  childCtx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (!descriptorAppended && decision.kind === 'enter') {
      descriptorAppended = true
      agent.session.append('subagent/descriptor', request.descriptor)
    }
    return decision
  })
}

class WorktreeProvider {
  name = PROVIDER_NAME
  capabilities = { outputSchema: false, depthLimit: false, toolFilter: false, persona: false }
  inheritsParentContext = false

  async start(request) {
    if (request.signal.aborted) throw new Error('worktree delegation was cancelled before allocation')
    const parent = request.parent
    const childId = randomUUID()
    const allocation = await allocateWorktree(parent, outputText(request.prompt))
    const record = {
      worktreeId: allocation.worktreeId,
      childSessionId: childId,
      repoRoot: allocation.repoRoot,
      path: allocation.path,
      branch: allocation.branch,
      baseCommit: allocation.baseCommit,
      parentClean: allocation.parentClean,
      status: 'running',
      committed: false,
      createdAt: Date.now(),
    }
    records.set(childId, record)

    let handle
    try {
      const parentPreset = parent.ctx.get('agentPresets')?.composedPreset(parent.ctx)
      const depth = (parent.session.header.delegationDepth || 0) + 1
      const agentOptions = {
        ...parent.options,
        subagentDepth: depth,
      }
      handle = await parent.ctx.agents.create({
        sessionId: childId,
        meta: {
          cwd: allocation.path,
          parentSession: parent.session.header.id,
          origin: 'subagent',
          delegationDepth: depth,
          ...parentPreset === undefined ? {} : { agentPreset: parentPreset },
        },
        agentOptions,
        signal: request.signal,
        setup: childCtx => childSetup(childCtx, parent, request, allocation, parentPreset),
      })
    } catch (error) {
      records.delete(childId)
      await discardAllocation(allocation)
      throw error
    }

    const child = handle.agent
    const activationStart = child.session.events.length
    let cancelled = false
    const onAbort = () => {
      cancelled = true
      child.cancel({ kind: 'parent' })
    }
    request.signal.addEventListener('abort', onAbort, { once: true })
    if (request.signal.aborted) onAbort()

    const result = (async () => {
      try {
        if (!cancelled) child.followup(userMessage(childPrompt(outputText(request.prompt), allocation)))
        await child.whenIdle()
        const suffix = child.session.events.slice(activationStart)
        const blocks = finalBlocks(suffix)
        const reason = cancelled ? 'aborted' : stopReason(suffix)
        record.stopReason = reason
        record.headCommit = (await git(allocation.path, ['rev-parse', 'HEAD'], { allowFailure: true })).stdout.trim()
        const status = await inspectWorktree(allocation.repoRoot, allocation.path)
        record.clean = status.clean
        record.committed = record.headCommit.length > 0 && record.headCommit !== record.baseCommit
        record.status = reason === 'completed' && record.committed ? 'ready_to_merge' : 'failed'
        if (reason === 'completed' && !record.committed) {
          record.error = 'worker completed without creating a commit on its delegated branch'
        }
        return { output: blocks, stopReason: reason }
      } catch (error) {
        record.status = 'failed'
        record.stopReason = 'error'
        record.error = errorText(error)
        return { output: textBlock(`Worker failed: ${record.error}`), stopReason: 'error' }
      } finally {
        request.signal.removeEventListener('abort', onAbort)
      }
    })()

    let disposed = false
    return {
      id: childId,
      localAgent: child,
      result,
      async dispose() {
        if (disposed) return
        disposed = true
        if (child.status !== 'idle') child.cancel({ kind: 'parent' })
        const [disposal] = await Promise.allSettled([handle.dispose(), result])
        if (disposal.status === 'rejected') throw disposal.reason
      },
    }
  }
}

const objectSchema = (properties, required = Object.keys(properties)) => {
  const normalized = Object.fromEntries(
    Object.entries(properties).map(([key, property]) => {
      const { required: _required, ...schema } = property
      return [key, schema]
    }),
  )
  return {
    type: 'object',
    additionalProperties: false,
    properties: normalized,
    ...(required.length > 0 ? { required } : {}),
  }
}

const objectOutput = properties => {
  return {
    schema: objectSchema(properties),
    render: renderJson,
  }
}

function registerTools(ctx) {
  ctx.tools.register({
    name: 'delegate_worktree',
    description: 'Delegate an independent write task to a fresh Git worktree. The child edits and commits only its branch; the coordinating agent receives the branch and must review and merge it explicitly.',
    parameters: objectSchema({
      description: { type: 'string', required: true, description: 'Short task label.' },
      prompt: { type: 'string', required: true, description: 'A complete implementation task for the isolated worker.' },
    }),
    output: objectOutput({
      status: { type: 'string', required: true },
      description: { type: 'string', required: true },
      child_session_id: { type: 'string', required: true },
      worktree_id: { type: 'string', required: true },
      worktree_path: { type: 'string', required: true },
      branch: { type: 'string', required: true },
      base_commit: { type: 'string', required: true },
      parent_clean: { type: 'boolean', required: true },
      committed: { type: 'boolean', required: true },
      head_commit: { type: 'string', required: true },
      clean: { type: 'boolean', required: true },
      stop_reason: { type: 'string', required: true },
      output: { type: 'string', required: true },
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('delegate_worktree requires a calling agent')
      if (!args.description.trim() || !args.prompt.trim()) throw new Error('description and prompt must not be empty')
      const run = await ctx.subagents.start(PROVIDER_NAME, {
        label: args.description,
        prompt: textBlock(args.prompt),
        parent: exec.agent,
        signal: exec.signal,
      })
      let result
      try {
        result = await run.result
      } finally {
        await run.dispose()
      }
      const record = records.get(run.id)
      if (!record) throw new Error(`worktree record disappeared for child ${run.id}`)
      const status = await inspectWorktree(record.repoRoot, record.path)
      return {
        status: record.status,
        description: args.description,
        child_session_id: record.childSessionId,
        worktree_id: record.worktreeId,
        worktree_path: record.path,
        branch: record.branch,
        base_commit: record.baseCommit,
        parent_clean: record.parentClean,
        committed: record.committed,
        head_commit: record.headCommit || status.head_commit,
        clean: status.clean,
        stop_reason: result.stopReason,
        output: outputText(result.output) || '(worker returned no final text)',
      }
    },
  })

  ctx.tools.register({
    name: 'worktree_status',
    description: 'Inspect a delegated Git worktree before deciding whether its branch is ready to merge. This is read-only.',
    parameters: objectSchema({
      worktree_path: { type: 'string', required: true, description: 'Absolute path returned by delegate_worktree.' },
    }),
    output: objectOutput({
      worktree_path: { type: 'string', required: true },
      branch: { type: 'string', required: true },
      head_commit: { type: 'string', required: true },
      clean: { type: 'boolean', required: true },
      status: { type: 'string', required: true },
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('worktree_status requires a calling agent')
      return inspectWorktree(await parentRepository(exec.agent), args.worktree_path)
    },
  })

  ctx.tools.register({
    name: 'merge_worktree',
    description: 'Merge a clean delegated worktree branch into the coordinating agent’s current parent worktree. The parent must be clean; conflicts are left visible for the parent to resolve.',
    parameters: objectSchema({
      worktree_path: { type: 'string', required: true, description: 'Absolute path returned by delegate_worktree.' },
    }),
    output: objectOutput({
      status: { type: 'string', required: true },
      branch: { type: 'string', required: true },
      worktree_path: { type: 'string', required: true },
      merge_commit: { type: 'string', required: true },
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('merge_worktree requires a calling agent')
      const repoRoot = await parentRepository(exec.agent)
      await requireCleanRepository(repoRoot, 'parent')
      const entry = await registeredWorktree(repoRoot, args.worktree_path)
      const status = await inspectWorktree(repoRoot, entry.path)
      if (!status.clean) throw new Error(`delegated worktree is dirty; ask the worker to commit before merging:\n${status.status}`)
      const record = [...records.values()].find(candidate => candidate.path === entry.path)
      if (record && !record.committed) {
        throw new Error('delegated worker did not create a commit; inspect the branch or discard it explicitly')
      }
      const result = await git(repoRoot, ['merge', '--no-ff', '--no-edit', entry.branch], { allowFailure: true })
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout).trim()
        return {
          status: `conflict: ${detail || 'merge failed; resolve or run git merge --abort'}`,
          branch: entry.branch,
          worktree_path: entry.path,
          merge_commit: '',
        }
      }
      const mergeCommit = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim()
      if (record) record.status = 'merged'
      return { status: 'merged', branch: entry.branch, worktree_path: entry.path, merge_commit: mergeCommit }
    },
  })

  ctx.tools.register({
    name: 'cleanup_worktree',
    description: 'Remove a delegated worktree after its branch is merged. By default it refuses dirty or unmerged work; set force only when deliberately discarding recoverable work.',
    parameters: objectSchema({
      worktree_path: { type: 'string', required: true, description: 'Absolute path returned by delegate_worktree.' },
      force: { type: 'boolean', description: 'Discard unmerged or dirty worktree state. Defaults to false.' },
    }, ['worktree_path']),
    output: objectOutput({
      status: { type: 'string', required: true },
      branch: { type: 'string', required: true },
      worktree_path: { type: 'string', required: true },
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('cleanup_worktree requires a calling agent')
      const repoRoot = await parentRepository(exec.agent)
      const entry = await registeredWorktree(repoRoot, args.worktree_path)
      const force = args.force === true
      if (!force) {
        const status = await inspectWorktree(repoRoot, entry.path)
        if (!status.clean) throw new Error(`refusing to remove dirty worktree; inspect or merge it first:\n${status.status}`)
        const merged = await git(repoRoot, ['merge-base', '--is-ancestor', entry.branch, 'HEAD'], { allowFailure: true })
        if (merged.code !== 0) throw new Error(`refusing to remove unmerged branch ${entry.branch}; merge it first or set force: true`)
      }
      await git(repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), entry.path])
      await git(repoRoot, ['branch', force ? '-D' : '-d', entry.branch])
      const record = [...records.values()].find(candidate => candidate.path === entry.path)
      if (record) record.status = 'cleaned'
      return { status: force ? 'discarded' : 'cleaned', branch: entry.branch, worktree_path: entry.path }
    },
  })
}

export function apply(ctx, config = {}) {
  const mode = config.mode || 'all'
  if (!['all', 'host', 'agent'].includes(mode)) {
    throw new Error(`dsh-worktree: unknown mode ${JSON.stringify(mode)}`)
  }

  // The provider is a host-plane singleton: the subagent registry rejects a
  // second provider with the same name when another preset is mounted.
  if (mode !== 'agent') ctx.subagents.registerProvider(new WorktreeProvider())

  // The model-facing tools and policy belong to the selected agent preset.
  // `all` remains the default so a non-preset/headless profile keeps working.
  if (mode !== 'host') {
    registerTools(ctx)
    ctx.systemPrompt.section({
      name: 'dsh:git-worktree-delegation',
      order: 116,
      text: 'You are the coordinating agent. For independent tasks that will write code, use `delegate_worktree`; do not use the ordinary `subagent` tool for write work. Each worker gets a separate Git worktree and branch. Review with `worktree_status`, then use `merge_worktree` explicitly. The parent worktree is the only place where merges happen. Use `cleanup_worktree` only after the branch is merged or when deliberately discarding it.',
    })
  }
}
