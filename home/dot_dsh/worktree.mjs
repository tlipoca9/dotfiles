import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { createWorktreeGit } from './worktree-git.mjs'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const WORKTREE_ROOT = resolve(process.env.DSH_WORKTREE_ROOT || join(DSH_HOME, 'worktrees'))
const PROVIDER_NAME = 'worktree'
const worktrees = createWorktreeGit({ worktreeRoot: WORKTREE_ROOT })

// Process records describe live child runs only. Git ownership is always
// re-derived from the calling parent session by the deep Git module.
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

function errorText(error) {
  if (error && typeof error === 'object' && error instanceof Error) return error.message
  return String(error)
}

function ownerFromAgent(agent) {
  const cwd = agent?.session?.header?.cwd
  const sessionId = agent?.session?.header?.id
  if (typeof cwd !== 'string' || cwd.length === 0 || typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('worktree delegation requires a parent session with an id and working directory')
  }
  return { cwd, sessionId }
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
  return [
    'You are a write-capable delegated worker running in an isolated Git worktree.',
    `Your worktree is ${allocation.path}. Your branch is ${allocation.branch}. The base commit is ${allocation.baseCommit}.`,
    'All code and file writes must stay in this worktree. Never use an absolute path into the parent worktree.',
    'Implement the task, run focused verification, and commit every intended change to your assigned branch before replying.',
    'Do not merge, rebase, push, or create another subagent. Report the commit and the checks you ran.',
    '',
    'TASK:',
    task,
  ].join('\n')
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
    const owner = ownerFromAgent(parent)
    const childId = randomUUID()
    const allocation = await worktrees.create(owner, outputText(request.prompt))
    const record = {
      childSessionId: childId,
      ...allocation,
      status: 'running',
      committed: false,
    }
    records.set(childId, record)

    let handle
    try {
      const parentPreset = parent.ctx.get('agentPresets')?.composedPreset(parent.ctx)
      const depth = (parent.session.header.delegationDepth || 0) + 1
      handle = await parent.ctx.agents.create({
        sessionId: childId,
        meta: {
          cwd: allocation.path,
          parentSession: parent.session.header.id,
          origin: 'subagent',
          delegationDepth: depth,
          ...parentPreset === undefined ? {} : { agentPreset: parentPreset },
        },
        agentOptions: { ...parent.options, subagentDepth: depth },
        signal: request.signal,
        setup: childCtx => childSetup(childCtx, parent, request, allocation, parentPreset),
      })
    } catch (error) {
      records.delete(childId)
      try {
        await worktrees.cleanup(owner, allocation.path, { force: true })
      } catch {
        // Preserve the child-creation failure; the namespaced worktree remains inspectable.
      }
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
        const status = await worktrees.status(owner, allocation.path)
        record.stopReason = reason
        record.headCommit = status.head_commit
        record.clean = status.clean
        record.committed = status.head_commit !== allocation.baseCommit
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

const objectOutput = properties => ({
  schema: objectSchema(properties),
  render: renderJson,
})

function registerTools(ctx) {
  ctx.tools.register({
    name: 'delegate_worktree',
    description: 'Delegate an independent write task to a fresh Git worktree. The parent must be clean; the child commits only its session-owned branch.',
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
      const status = await worktrees.status(ownerFromAgent(exec.agent), record.path)
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
    description: 'Inspect a delegated Git worktree owned by the calling parent session. This is read-only and survives dsh restarts.',
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
      return worktrees.status(ownerFromAgent(exec.agent), args.worktree_path)
    },
  })

  ctx.tools.register({
    name: 'merge_worktree',
    description: 'Merge a clean, session-owned delegated branch into a clean parent. Conflicts remain visible in the parent worktree.',
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
      return worktrees.merge(ownerFromAgent(exec.agent), args.worktree_path)
    },
  })

  ctx.tools.register({
    name: 'cleanup_worktree',
    description: 'Remove a session-owned delegated worktree. Dirty parent state does not block cleanup; dirty or unmerged child state requires force.',
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
      const result = await worktrees.cleanup(ownerFromAgent(exec.agent), args.worktree_path, { force: args.force === true })
      const record = [...records.values()].find(candidate => candidate.path === result.worktree_path)
      if (record) record.status = 'cleaned'
      return result
    },
  })
}

export function apply(ctx, config = {}) {
  const mode = config.mode || 'all'
  if (!['all', 'host', 'agent'].includes(mode)) {
    throw new Error(`dsh-worktree: unknown mode ${JSON.stringify(mode)}`)
  }

  if (mode !== 'agent') ctx.subagents.registerProvider(new WorktreeProvider())

  if (mode !== 'host') {
    registerTools(ctx)
    ctx.systemPrompt.section({
      name: 'dsh:git-worktree-delegation',
      order: 116,
      text: 'You are the coordinating agent. Keep the parent worktree clean before `delegate_worktree`. Each delegated branch and path is owned by an irreversible namespace derived from this parent session; another session cannot inspect, merge, or clean it. Review with `worktree_status`, merge with `merge_worktree`, and use `cleanup_worktree` after merge or with force only for deliberate discard. Cleanup may proceed while the parent is dirty.',
    })
  }
}
