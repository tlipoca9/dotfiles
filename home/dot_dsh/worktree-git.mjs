import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

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
    return { stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), code: 0 }
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: typeof error?.stdout === 'string' ? error.stdout : '',
        stderr: typeof error?.stderr === 'string' ? error.stderr : errorText(error),
        code: typeof error?.code === 'number' ? error.code : 1,
      }
    }
    throw new Error(`git -C ${cwd} ${args.join(' ')} failed: ${errorText(error)}`)
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

function isPathUnder(candidate, parent) {
  const childRelative = relative(parent, candidate)
  return childRelative !== '' && childRelative !== '..'
    && !childRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(childRelative)
}

function sessionNamespace(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('worktree operation requires the calling parent session id')
  }
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
}

function taskSlug(description) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'task'
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

export function createWorktreeGit({ worktreeRoot }) {
  const configuredRoot = resolve(worktreeRoot)

  async function ownerState(owner) {
    if (typeof owner?.cwd !== 'string' || owner.cwd.length === 0) {
      throw new Error('worktree operation requires a parent working directory')
    }
    const namespace = sessionNamespace(owner.sessionId)
    const discovered = (await git(owner.cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
    if (!discovered) throw new Error(`cannot determine the Git repository for ${owner.cwd}`)
    const repoRoot = await canonicalDirectory(discovered)
    const root = await canonicalPath(configuredRoot)
    if (root === repoRoot || isPathUnder(root, repoRoot)) {
      throw new Error(`worktree root ${root} must be outside the parent repository ${repoRoot}`)
    }
    return {
      repoRoot,
      namespace,
      namespacePath: await canonicalPath(join(root, basename(repoRoot), namespace)),
    }
  }

  async function repositoryStatus(root) {
    return (await git(root, ['status', '--porcelain=v1', '--untracked-files=all'])).stdout.trim()
  }

  async function requireCleanRepository(root, label) {
    const status = await repositoryStatus(root)
    if (!status) return
    const sample = status.split('\n').slice(0, 12).join('\n')
    throw new Error(`${label} worktree is not clean; resolve these changes before this Git operation:\n${sample}`)
  }

  async function registeredWorktree(owner, requestedPath) {
    if (!isAbsolute(requestedPath)) throw new Error('worktree_path must be an absolute path')
    const state = await ownerState(owner)
    const path = await canonicalDirectory(requestedPath)
    if (!isPathUnder(path, state.namespacePath)) {
      throw new Error(`worktree does not belong to calling session namespace ${state.namespace}`)
    }
    const entries = parseWorktreeList((await git(state.repoRoot, ['worktree', 'list', '--porcelain'])).stdout)
    let entry
    for (const candidate of entries) {
      try {
        if (await canonicalDirectory(candidate.path) === path) {
          entry = candidate
          break
        }
      } catch {
        // A stale registration cannot establish ownership.
      }
    }
    if (!entry) throw new Error(`path is not a registered Git worktree of ${state.repoRoot}: ${path}`)
    if (path === state.repoRoot) throw new Error('the parent worktree is not a delegated worktree')
    if (!entry.branch) throw new Error(`worktree is detached and has no merge branch: ${path}`)
    const branchPrefix = `dsh/${state.namespace}/`
    if (!entry.branch.startsWith(branchPrefix)) {
      throw new Error(`worktree branch does not belong to calling session namespace ${state.namespace}`)
    }
    return { ...state, ...entry, path, branch: entry.branch }
  }

  async function inspectEntry(entry) {
    const statusOutput = (await git(entry.path, ['status', '--porcelain=v1', '--branch', '--untracked-files=all'])).stdout.trimEnd()
    const lines = statusOutput ? statusOutput.split('\n') : []
    const changes = lines.filter(line => !line.startsWith('##'))
    const head = (await git(entry.path, ['rev-parse', 'HEAD'])).stdout.trim()
    return {
      worktree_path: entry.path,
      branch: entry.branch,
      head_commit: head,
      clean: changes.length === 0,
      status: changes.join('\n'),
    }
  }

  async function create(owner, description) {
    const state = await ownerState(owner)
    await requireCleanRepository(state.repoRoot, 'parent')
    const baseCommit = (await git(state.repoRoot, ['rev-parse', 'HEAD'])).stdout.trim()
    if (!baseCommit) throw new Error(`repository ${state.repoRoot} has no commit to use as a worktree base`)

    await mkdir(state.namespacePath, { recursive: true })
    const token = randomUUID().slice(0, 8)
    const slug = taskSlug(description)
    const branch = `dsh/${state.namespace}/${slug}-${token}`
    const path = join(state.namespacePath, `${slug}-${token}`)
    await git(state.repoRoot, ['worktree', 'add', '-b', branch, path, baseCommit])
    return {
      repoRoot: state.repoRoot,
      path: await canonicalDirectory(path),
      branch,
      baseCommit,
      worktreeId: token,
      parentClean: true,
    }
  }

  async function status(owner, requestedPath) {
    return inspectEntry(await registeredWorktree(owner, requestedPath))
  }

  async function merge(owner, requestedPath) {
    const entry = await registeredWorktree(owner, requestedPath)
    await requireCleanRepository(entry.repoRoot, 'parent')
    const worktreeStatus = await inspectEntry(entry)
    if (!worktreeStatus.clean) {
      throw new Error(`delegated worktree is dirty; ask the worker to commit before merging:\n${worktreeStatus.status}`)
    }
    const ahead = Number.parseInt((await git(entry.repoRoot, ['rev-list', '--count', `HEAD..${entry.branch}`])).stdout.trim(), 10)
    if (!Number.isSafeInteger(ahead) || ahead < 1) {
      throw new Error(`delegated branch ${entry.branch} has no unmerged commit`)
    }
    const result = await git(entry.repoRoot, ['merge', '--no-ff', '--no-edit', entry.branch], { allowFailure: true })
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim()
      return {
        status: `conflict: ${detail || 'merge failed; resolve or run git merge --abort'}`,
        branch: entry.branch,
        worktree_path: entry.path,
        merge_commit: '',
      }
    }
    return {
      status: 'merged',
      branch: entry.branch,
      worktree_path: entry.path,
      merge_commit: (await git(entry.repoRoot, ['rev-parse', 'HEAD'])).stdout.trim(),
    }
  }

  async function cleanup(owner, requestedPath, { force = false } = {}) {
    const entry = await registeredWorktree(owner, requestedPath)
    if (!force) {
      const worktreeStatus = await inspectEntry(entry)
      if (!worktreeStatus.clean) {
        throw new Error(`refusing to remove dirty worktree; inspect or merge it first:\n${worktreeStatus.status}`)
      }
      const merged = await git(entry.repoRoot, ['merge-base', '--is-ancestor', entry.branch, 'HEAD'], { allowFailure: true })
      if (merged.code !== 0) {
        throw new Error(`refusing to remove unmerged branch ${entry.branch}; merge it first or set force: true`)
      }
    }
    await git(entry.repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), entry.path])
    await git(entry.repoRoot, ['branch', force ? '-D' : '-d', entry.branch])
    return {
      status: force ? 'discarded' : 'cleaned',
      branch: entry.branch,
      worktree_path: entry.path,
    }
  }

  return { create, status, merge, cleanup }
}
