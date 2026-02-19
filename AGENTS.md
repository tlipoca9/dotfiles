# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-19 | **Commit:** 1038469 | **Branch:** main

## OVERVIEW

Chezmoi-managed cross-platform dotfiles for user **tlipoca9**. Targets macOS, Linux, Windows. Primary shell: Nushell. Terminal: WezTerm. Editors: Neovim (AstroNvim v4) + VSCode/CodeBuddy.

## STRUCTURE

```
./
├── .chezmoi.toml              # Interpreter config (pwsh for .ps1, nu for .nu)
├── .chezmoidata/<os>/         # Data-driven package manifests (TOML)
├── .chezmoiignore             # Platform-conditional file routing
├── .chezmoiscripts/<os>/      # run_onchange_ install scripts
├── .chezmoitemplates/         # Shared template components
│   ├── shell_logger           # Cross-platform logging (bash/pwsh)
│   ├── vscode/settings-common # Shared editor settings base (~150 lines)
│   ├── vscode/settings.json   # VSCode wrapper
│   ├── vscode/keybindings.json# Shared keybindings (platform $mod variable)
│   └── codebuddy/settings.json# CodeBuddy wrapper (extends settings-common)
├── AppData/Roaming/           # Windows editor configs → template refs
├── Library/Application Support/ # macOS editor configs → template refs
├── dot_config/
│   ├── atuin/                 # Shell history (theme: autumn)
│   ├── mise/                  # Tool versions (go, rust, python, neovim, ripgrep, uv)
│   ├── nushell/               # Shell config (env.nu.tmpl + config.nu)
│   ├── nvim/                  # Neovim (AstroNvim v4 bootstrap only)
│   ├── opencode/              # AI tooling (skills, hooks, plugins) → see subdir AGENTS.md
│   └── wezterm/               # Terminal config (modular Lua) → see subdir AGENTS.md
├── dot_opencode/tools/        # Custom OpenCode tool overrides (nushell.ts)
└── docs/                      # Package type documentation per platform
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a new package | `.chezmoidata/<os>/packages.toml` | Script auto-picks up via `{{ range }}` |
| Edit shared editor settings | `.chezmoitemplates/vscode/settings-common` | Propagates to VSCode AND CodeBuddy |
| Edit CodeBuddy-only settings | `.chezmoitemplates/codebuddy/settings.json` | Lines after `settings-common` include |
| Edit keybindings | `.chezmoitemplates/vscode/keybindings.json` | `$mod` = cmd (macOS) / alt (Win/Linux) |
| Modify shell env/PATH | `dot_config/nushell/env.nu.tmpl` | Go template with OS/arch conditionals |
| Modify shell behavior | `dot_config/nushell/config.nu` | Vi mode, completions, atuin sourcing |
| Add platform file routing | `.chezmoiignore` | Go template conditionals |
| Modify install script logging | `.chezmoitemplates/shell_logger` | Shared HINT/INFO/WARN/ERROR/FATAL |
| WezTerm appearance/behavior | `dot_config/wezterm/config/` | One module per concern |
| Package type reference | `docs/<os>/README.md` | Schema for packages.toml entries |
| Nushell reference docs | `.codebuddy/rules/nushell-docs.mdc` | Clone nushell docs to `_tmp/` first |

## CONVENTIONS

### Chezmoi Naming
- `dot_` → `.` | `executable_` → +x | `.tmpl` → Go template | `run_onchange_` → re-run on content change

### Template Composition
- **NEVER** duplicate settings across VSCode/CodeBuddy — edit `settings-common` for shared changes
- Deployment wrappers (`vscode/settings.json`, `codebuddy/settings.json`) only add editor-specific overrides
- All 4 platform editor configs (macOS/Windows × VSCode/CodeBuddy) reference these templates

### Package Management (Data-Driven)
- Package definitions are DATA in `.chezmoidata/<os>/packages.toml`, NEVER hardcoded in scripts
- Each package: `enable`, `type` (homebrew/scoop/script/custom), `checker`, `installer`, optional `post_install`
- Checker types: `command`, `cask` (macOS), `font` (Windows), `script`, `scoop-apps` (Windows)
- Install scripts iterate with `{{ range $id, $options := .<os>.packages }}`

### Install Scripts
- **ALWAYS** include `{{ template "shell_logger" . }}` — use HINT/INFO/WARN/ERROR/FATAL, never raw echo/print
- Scripts use `run_onchange_` prefix — re-execute only when rendered template content changes

### Platform Branching
- OS: `{{ if eq .chezmoi.os "darwin" }}` / `"linux"` / `"windows" }}`
- Arch: `{{ if eq .chezmoi.arch "amd64" }}` (Intel vs ARM Homebrew paths)
- File routing via `.chezmoiignore` conditionals, NOT per-file template guards

### Nushell
- Clone official docs first: `git clone --depth 1 https://github.com/nushell/nushell.github.io.git _tmp/nushell.github.io`
- XDG Base Directories enforced across all platforms
- Mise uses shims mode (PATH-based), not per-command hooks

## ANTI-PATTERNS

- **NEVER** modify editor settings in both VSCode and CodeBuddy templates separately
- **NEVER** hardcode package names in install scripts — always data-driven via packages.toml
- **NEVER** use raw echo/print in install scripts — always shell_logger functions
- **NEVER** add platform-specific file routing without updating `.chezmoiignore`
- **NEVER** commit `_tmp/` contents (gitignored, used for reference docs)
- **DO NOT** add Neovim plugin overrides here — AstroNvim v4 is used as-is

## COMMANDS

```bash
# Initialize (HTTPS)
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply https://github.com/tlipoca9/dotfiles.git

# Initialize (SSH)
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply git@github.com:tlipoca9/dotfiles.git

# Apply changes
chezmoi apply

# Preview changes
chezmoi diff

# Edit a managed file
chezmoi edit <target-file>

# Test template rendering
chezmoi execute-template < file.tmpl

# Check managed file status
chezmoi status

# Add new file to management
chezmoi add <file>
```

## NOTES

- `.vscode/settings.json` marks `.chezmoitemplates/**/*.json` as plaintext (prevents JSON validation errors on Go templates)
- Windows install script auto-detects proxy at 127.0.0.1:10809 for Scoop
- Atuin init/completion files are auto-generated by `env.nu.tmpl` on first run, not checked into repo
- Font: Maple Mono NF CN with specific OpenType features (`calt`, `cv35`, `ss01`, `ss03`, `ss04`)
- Linux install script skips entirely when running as root
