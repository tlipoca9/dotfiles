---
name: hookify
description: Create and manage declarative OpenCode hooks (HOOK.md files) that intercept tool execution with pattern matching
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: automation
---

## What I do

I help you create declarative hooks that intercept OpenCode tool execution (file writes, edits, patches) and enforce code patterns. Hooks are defined as simple HOOK.md files — no TypeScript needed.

## When to use me

- You want to block or warn about specific code patterns in certain file types
- You need to enforce project conventions (e.g., no `console.log`, use specific error packages)
- You want to create a new hook without writing TypeScript

## How hooks work

The `opencode-hookify.ts` plugin scans these directories at startup:

- `~/.config/opencode/hooks/*/HOOK.md` — global hooks
- `.opencode/hooks/*/HOOK.md` — project-level hooks

Each `HOOK.md` defines a single hook with a frontmatter config and a message template.

## HOOK.md format

```markdown
---
name: my-hook-name
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go, .ts]
action: block
pattern: \bsome\.pattern\s*\(
exclude: ^\s*//.*some\.pattern
---

## Message

Your error/warning message here.

Use {{file}} for the file path and {{lines}} for line numbers.
```

## Frontmatter fields

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | yes | string | Hook identifier for logging |
| `hook` | yes | string | `tool.execute.before` or `tool.execute.after` |
| `tools` | no | string[] | Which tools to intercept: `write`, `edit`, `multiedit`, `apply_patch`. Empty = all |
| `extensions` | no | string[] | File extensions to match (e.g., `.go`, `.ts`). Empty = all files |
| `action` | yes | string | `block` (throw error, prevents write) or `warn` (append warning to output) |
| `pattern` | yes | string or string[] | Regex pattern(s) to detect. Multiple = OR logic |
| `exclude` | no | string or string[] | Regex pattern(s) to skip false positives |

## Message variables

- `{{file}}` — relative file path being modified
- `{{lines}}` — comma-separated violating line numbers

## Pattern matching behavior

- Patterns are applied line-by-line
- Lines inside `//` single-line comments are skipped
- Lines inside `/* */` block comments are skipped
- Lines starting with `#` are skipped
- The `exclude` patterns filter out false positives after `pattern` matches

## Instructions for creating a new hook

1. Decide on:
   - What pattern to detect (regex)
   - Which file types to target (extensions)
   - Whether to block or warn (action)
   - What message to show the agent

2. Create the directory and file:
   ```
   ~/.config/opencode/hooks/<hook-name>/HOOK.md   (global)
   .opencode/hooks/<hook-name>/HOOK.md             (project)
   ```

3. Write the HOOK.md with frontmatter and Message section

4. Restart OpenCode — hooks load at startup

## Example: Block console.log in TypeScript

```markdown
---
name: no-console-log
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.ts, .tsx]
action: block
pattern: \bconsole\.(log|debug|info)\s*\(
exclude: ^\s*//.*console\.
---

## Message

🚫 `console.log` detected in {{file}} ({{lines}})

Use a structured logger instead of console methods.
```

## Example: Warn about TODO comments

```markdown
---
name: todo-warning
hook: tool.execute.before
tools: [write, edit, multiedit]
extensions: [.ts, .go, .py]
action: warn
pattern: \bTODO\b
---

## Message

⚠️ TODO comment found in {{file}} ({{lines}})

Consider resolving the TODO or creating a tracked issue instead.
```
