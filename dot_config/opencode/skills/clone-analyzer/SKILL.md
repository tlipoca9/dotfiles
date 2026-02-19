---
name: clone-analyzer
description: For any GitHub repository, prefer cloning locally with shallow clone for deep code analysis using local file tools instead of web APIs
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: analysis
---

## What I do

When a GitHub repository is referenced (URL, `org/repo` format, or by name), I clone it locally for thorough analysis using local file tools (Read, Grep, Glob, AST-grep, LSP) rather than relying on web-based browsing or API calls.

## When to use me

- A GitHub repository URL or project reference appears and code analysis is needed
- You need to understand how an external project works, find patterns, or review implementations
- Web-based tools give incomplete or truncated results

## Instructions

1. **Clone to a temp directory** using shallow clone to minimize download:
   ```bash
   git clone --depth 1 <repo-url> /tmp/<repo-name>
   ```
   For very large repos, use sparse checkout or blob filter:
   ```bash
   git clone --depth 1 --filter=blob:none <repo-url> /tmp/<repo-name>
   ```

2. **Analyze locally** using file tools:
   - `Read` to examine files
   - `Grep` / `AST-grep` to search patterns
   - `Glob` to discover file structure
   - LSP tools if the language server supports it

3. **Reuse existing clones** — if `/tmp/<repo-name>` already exists, don't re-clone

4. **Clean up** when analysis is complete and the clone is no longer needed:
   ```bash
   rm -rf /tmp/<repo-name>
   ```

## Key rules

- Always use `--depth 1` to keep clones fast and small
- Clone to `/tmp/` to avoid polluting the workspace
- Prefer local clone analysis over `gh api`, web fetch, or grep.app for comprehensive understanding
- If only a small piece of info is needed (e.g., a single file), web tools may suffice — use judgment
