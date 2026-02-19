---
description: Create a new hookify HOOK.md to enforce code patterns
---

Create a new hookify hook based on the user's request: $ARGUMENTS

Load the `hookify` skill first to understand the HOOK.md format and conventions.

Steps:
1. Ask the user what pattern they want to enforce if $ARGUMENTS is unclear
2. Determine the appropriate regex pattern, file extensions, and action (block/warn)
3. Create the hook directory and HOOK.md file at `~/.config/opencode/hooks/<name>/HOOK.md` (global) or `.opencode/hooks/<name>/HOOK.md` (project)
4. Write a clear Message section that tells the agent what's wrong and how to fix it
5. Show the created HOOK.md to the user for confirmation
