# OpenCode / Oh-My-OpenCode Configuration

AI coding assistant tooling: skills, hooks, plugins, and provider config.

## STRUCTURE

```
opencode/
├── opencode.json              # Provider config (local CodeBuddy endpoint, multi-model)
├── oh-my-opencode.json        # Agent → model mappings, category → model mappings
├── plugins/
│   └── opencode-hookify.ts    # Hook engine: scans HOOK.md files, intercepts tool execution
├── skills/                    # Loadable skill definitions (SKILL.md per skill)
│   ├── clone-analyzer/        # Prefer local git clone for code analysis
│   ├── hookify/               # Create declarative HOOK.md hooks
│   ├── opencode-docs/         # Reference opencode docs via cloned repo
│   └── uber-go-guide/         # Uber Go Style Guide enforcement for Go projects
├── hooks/                     # Declarative code pattern guards (HOOK.md per hook)
│   ├── go-errors-guard/       # Block: fmt.Errorf (use project error package)
│   ├── go-no-panic/           # Warn: panic() in non-main code
│   ├── go-type-assert-safety/ # Block: single-return type assertions (missing comma-ok)
│   ├── go-no-embedded-mutex/  # Block: embedded sync.Mutex in structs
│   ├── go-no-init/            # Warn: init() function declarations
│   └── go-error-equality/     # Block: direct == / != error comparison
└── commands/
    └── hookify.md             # Slash command for hook creation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change default model | `opencode.json` line 28 | `"model": "codebuddy/..."` |
| Add new model | `opencode.json` → `provider.codebuddy.models` | Add model entry |
| Change agent model mapping | `oh-my-opencode.json` → `agents` | Per-agent override |
| Change category model | `oh-my-opencode.json` → `categories` | Per-category override |
| Add new skill | `skills/<name>/SKILL.md` | Frontmatter + instructions |
| Add new hook | `hooks/<name>/HOOK.md` | Frontmatter: pattern, action, extensions |
| Modify hook engine | `plugins/opencode-hookify.ts` | Core hook scanning + enforcement |

## HOW HOOKS WORK

1. `opencode-hookify.ts` scans `hooks/*/HOOK.md` at startup
2. Each HOOK.md defines: `pattern` (regex), `action` (block/warn), `extensions` (.go, etc.)
3. On `tool.execute.before` for write/edit tools:
   - Matches new content line-by-line against patterns
   - Skips commented lines
   - Applies `exclude` patterns to reduce false positives
   - `block` → prevents the write with error message
   - `warn` → allows write but appends warning

## HOW SKILLS WORK

Skills are loaded via `load_skills=["skill-name"]` in task delegations.
Each SKILL.md provides domain-specific instructions the agent receives as context.

## CONVENTIONS

- Hook names prefixed with target language: `go-*`, `ts-*`, etc.
- `block` action for hard rules (type safety, API misuse)
- `warn` action for soft rules (style preferences, suggestions)
- Skills describe WHAT to do, hooks enforce WHAT NOT to do
- Provider endpoint is local (`127.0.0.1:8080/v1`) — CodeBuddy proxy
