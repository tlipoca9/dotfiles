---
name: opencode-docs
description: Reference opencode official documentation by cloning the repo locally when agents need to understand opencode features, configuration, or APIs
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: reference
---

## What I do

When you need to understand how opencode works — its configuration, features, skills, rules, MCP servers, providers, or any other aspect — I point you to the authoritative source: the opencode repo's documentation.

## When to use me

- You need to understand an opencode feature, config option, or API
- You are unsure how opencode handles something (skills, rules, providers, tools, etc.)
- You want to verify opencode behavior rather than guessing

## Instructions

1. **Clone the opencode repo** (if not already cloned):
   ```bash
   git clone --depth 1 https://github.com/anomalyco/opencode.git /tmp/opencode
   ```

2. **Documentation lives at**:
   ```
   /tmp/opencode/packages/web/src/content/docs/
   ```
   Files are in `.mdx` format organized by topic.

3. **Read the relevant docs** using local file tools (Read, Grep, Glob) to find accurate answers.

4. **For implementation details**, also check the source code in:
   - `/tmp/opencode/packages/opencode/` — core agent logic
   - `/tmp/opencode/packages/tui/` — terminal UI

5. **Reuse existing clone** — if `/tmp/opencode` already exists, don't re-clone.

## Key rules

- Always prefer reading the actual docs/source over guessing about opencode behavior
- The repo is at `github.com/anomalyco/opencode` (moved from `sst/opencode`)
- Docs are MDX files — read them as markdown
