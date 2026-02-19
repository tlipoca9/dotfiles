---
name: bun-docs
description: Reference Bun official documentation by cloning the repo locally when agents need to understand Bun runtime, APIs, CLI commands, or configuration
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: reference
---

## What I do

When you need to understand how Bun works — its runtime, APIs, CLI commands, configuration, or any other aspect — I point you to the authoritative source: the Bun repository's documentation.

## When to use me

- You need to understand a Bun feature, CLI option, or API
- You are unsure how Bun handles something (install, run, test, build, etc.)
- You want to verify Bun behavior rather than guessing
- Working with Bun packages, Bunfile, or Bun-specific tooling

## Instructions

1. **Clone the Bun repo** (if not already cloned):
   ```bash
   git clone --depth 1 https://github.com/oven-sh/bun.git /tmp/bun
   ```

2. **Documentation lives at**:
   ```
   /tmp/bun/docs/
   ```
   Files are in markdown (`.md`) format organized by topic.

3. **Read the relevant docs** using local file tools (Read, Grep, Glob) to find accurate answers.

4. **For CLI reference**, check:
   - `/tmp/bun/docs/cli/` — command-line interface docs
   - `/tmp/bun/docs/runtime/` — runtime documentation
   - `/tmp/bun/docs/api/` — API reference

5. **For implementation details**, also check the source code in:
   - `/tmp/bun/src/` — core implementation
   - `/tmp/bun/packages/` — npm packages and additional tooling

6. **Reuse existing clone** — if `/tmp/bun` already exists, don't re-clone.

## Key rules

- Always prefer reading the actual docs/source over guessing about Bun behavior
- The repo is at `github.com/oven-sh/bun`
- Docs are markdown files — read them as markdown
- For the most up-to-date info, check the `main` branch
