import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { createWorktreeGit } from '../home/dot_dsh/worktree-git.mjs'

const execFileAsync = promisify(execFile)

async function git(cwd, ...args) {
  const result = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dotfiles-worktree-test-'))
  const repo = join(root, 'repo')
  await execFileAsync('git', ['init', '-q', repo])
  await git(repo, 'config', 'user.email', 'fixture@example.invalid')
  await git(repo, 'config', 'user.name', 'Worktree Fixture')
  await writeFile(join(repo, 'tracked.txt'), 'base\n')
  await git(repo, 'add', 'tracked.txt')
  await git(repo, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'base')
  t.after(() => rm(root, { recursive: true, force: true }))
  const worktreeRoot = join(root, 'worktrees')
  return {
    repo,
    worktreeRoot,
    owner: { cwd: repo, sessionId: 'parent-session-a' },
    otherOwner: { cwd: repo, sessionId: 'parent-session-b' },
    module: createWorktreeGit({ worktreeRoot }),
  }
}

async function commitChild(path, name = 'child.txt') {
  await writeFile(join(path, name), 'delegated\n')
  await git(path, 'add', name)
  await git(path, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'delegated change')
}

test('creates a clean worktree in the irreversible session namespace', async t => {
  const { module, owner } = await fixture(t)
  const allocation = await module.create(owner, 'Clean create')
  const namespace = createHash('sha256').update(owner.sessionId).digest('hex').slice(0, 12)

  assert.match(allocation.branch, new RegExp(`^dsh/${namespace}/clean-create-[0-9a-f]{8}$`))
  assert.ok(allocation.path.includes(`/${namespace}/`))
  assert.equal(allocation.path.includes(owner.sessionId), false)
  assert.equal((await module.status(owner, allocation.path)).clean, true)

  await module.cleanup(owner, allocation.path, { force: true })
})

test('rejects delegation from a dirty parent', async t => {
  const { module, owner, repo } = await fixture(t)
  await writeFile(join(repo, 'dirty.txt'), 'dirty\n')
  await assert.rejects(module.create(owner, 'Must reject'), /parent worktree is not clean/)
})

test('same session resumes status, merge, and cleanup with a new module instance', async t => {
  const { module, owner, repo, worktreeRoot } = await fixture(t)
  const allocation = await module.create(owner, 'Lifecycle')
  await commitChild(allocation.path)

  const restarted = createWorktreeGit({ worktreeRoot })
  const status = await restarted.status(owner, allocation.path)
  assert.equal(status.clean, true)
  assert.equal(status.branch, allocation.branch)

  const merged = await restarted.merge(owner, allocation.path)
  assert.equal(merged.status, 'merged')
  assert.ok(merged.merge_commit)

  await writeFile(join(repo, 'parent-runtime-state.txt'), 'dirty parent\n')
  const cleaned = await restarted.cleanup(owner, allocation.path)
  assert.equal(cleaned.status, 'cleaned')
})

test('dirty parent blocks merge without changing delegated status', async t => {
  const { module, owner, repo } = await fixture(t)
  const allocation = await module.create(owner, 'Blocked merge')
  await commitChild(allocation.path)
  const parentHead = await git(repo, 'rev-parse', 'HEAD')
  const before = await module.status(owner, allocation.path)

  await writeFile(join(repo, 'parent-runtime-state.txt'), 'dirty parent\n')
  await assert.rejects(module.merge(owner, allocation.path), /parent worktree is not clean/)

  const after = await module.status(owner, allocation.path)
  assert.deepEqual(after, before)
  assert.equal(await git(repo, 'rev-parse', 'HEAD'), parentHead)
  await module.cleanup(owner, allocation.path, { force: true })
})

test('new module instance rejects a different parent session', async t => {
  const { module, owner, otherOwner, worktreeRoot } = await fixture(t)
  const allocation = await module.create(owner, 'Owned work')
  await commitChild(allocation.path)
  const restarted = createWorktreeGit({ worktreeRoot })

  await assert.rejects(restarted.status(otherOwner, allocation.path), /does not belong to calling session namespace/)
  await assert.rejects(restarted.merge(otherOwner, allocation.path), /does not belong to calling session namespace/)
  await assert.rejects(restarted.cleanup(otherOwner, allocation.path, { force: true }), /does not belong to calling session namespace/)

  await restarted.cleanup(owner, allocation.path, { force: true })
})

test('all operations reject relative and namespace-escape paths', async t => {
  const { module, owner, otherOwner } = await fixture(t)
  const allocation = await module.create(owner, 'Path owner')
  const sibling = await module.create(otherOwner, 'Namespace sibling')
  const escaped = `${allocation.path}/../../${basename(dirname(sibling.path))}/${basename(sibling.path)}`
  const cases = [
    { name: 'relative', path: 'relative/worktree', pattern: /absolute path/ },
    { name: 'namespace sibling', path: sibling.path, pattern: /session namespace/ },
    { name: 'path escape', path: escaped, pattern: /session namespace/ },
  ]
  const operations = [
    ['status', path => module.status(owner, path)],
    ['merge', path => module.merge(owner, path)],
    ['cleanup', path => module.cleanup(owner, path, { force: true })],
  ]

  for (const pathCase of cases) {
    for (const [operation, invoke] of operations) {
      await assert.rejects(invoke(pathCase.path), pathCase.pattern, `${operation}: ${pathCase.name}`)
    }
  }

  await module.cleanup(owner, allocation.path, { force: true })
  await module.cleanup(otherOwner, sibling.path, { force: true })
})

test('default cleanup refuses dirty child state and force discards it', async t => {
  const { module, owner } = await fixture(t)
  const allocation = await module.create(owner, 'Dirty child')
  await writeFile(join(allocation.path, 'dirty.txt'), 'uncommitted\n')

  await assert.rejects(module.cleanup(owner, allocation.path), /refusing to remove dirty worktree/)
  const discarded = await module.cleanup(owner, allocation.path, { force: true })
  assert.equal(discarded.status, 'discarded')
})

test('default cleanup refuses an unmerged branch and force discards it', async t => {
  const { module, owner } = await fixture(t)
  const allocation = await module.create(owner, 'Unmerged child')
  await commitChild(allocation.path)

  await assert.rejects(module.cleanup(owner, allocation.path), /refusing to remove unmerged branch/)
  const discarded = await module.cleanup(owner, allocation.path, { force: true })
  assert.equal(discarded.status, 'discarded')
})
