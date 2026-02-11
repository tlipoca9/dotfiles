# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Overview

This is a **chezmoi**-managed cross-platform dotfiles repository for user **tlipoca9**, targeting macOS, Linux, and Windows.

## Commands

### Initialize on a new machine
```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply https://github.com/tlipoca9/dotfiles.git
```

### Apply changes after editing
```bash
chezmoi apply
```

### Preview what chezmoi would change
```bash
chezmoi diff
```

### Edit a managed file (opens source, then applies)
```bash
chezmoi edit <target-file>
```

### Add a new file to chezmoi management
```bash
chezmoi add <file>
```

### Test template rendering without applying
```bash
chezmoi execute-template < file.tmpl
```

### Check managed file status
```bash
chezmoi status
```

## Architecture

### Chezmoi Directory Layout

The repository root maps to the home directory (`~`) via chezmoi's naming conventions:

- `dot_` prefix → deployed as `.` (e.g., `dot_zshrc` → `~/.zshrc`)
- `executable_` prefix → deployed with executable permissions
- `.tmpl` suffix → rendered through Go templates before deployment
- `run_onchange_` prefix → scripts re-executed when their template data changes

### Template System

Chezmoi's Go template engine is the core mechanism enabling cross-platform support:

**Shared templates** live in `.chezmoitemplates/` and are referenced via `{{ template "name" . }}`:
- `shell_logger` — logging utility functions (log_info, log_warn, log_error, log_fatal) for install scripts
- `xdgenv` — XDG Base Directory environment variable exports
- `brew/shellenv` — Homebrew shell environment setup (distinguishes Intel vs ARM Mac paths via `{{ if eq .chezmoi.arch "amd64" }}`)
- `vscode/settings.json` and `vscode/keybindings.json` — shared VSCode config referenced by both `AppData/` (Windows) and `Library/` (macOS)

**OS-conditional logic** uses `{{ if eq .chezmoi.os "darwin" }}` / `"linux"` / `"windows"` throughout templates and in `.chezmoiignore` to control which files are deployed per platform.

### Data-Driven Package Management

`.chezmoidata/<os>/packages.toml` defines per-platform package manifests. Each entry has:
- `enable` — whether to install
- `type` — installer type (`homebrew`, `scoop`, `go`, `script`, etc.)
- `checker` — command to verify if already installed
- `installer` — custom install command (for non-standard types)

`.chezmoiscripts/<os>/run_onchange_*` scripts iterate over these data files using `{{ range }}` to generate install commands. The `run_onchange_` prefix ensures packages are re-installed only when the data file changes.

### Platform-Specific File Routing

`.chezmoiignore` conditionally excludes paths per OS:
- **macOS**: ignores `.scripts`, `.services`
- **Windows**: ignores `.scripts`, `.services`
- **Linux**: ignores `Library`, `AppData`, `.config/wezterm`

VSCode config is a good example of cross-platform routing: the same templates in `.chezmoitemplates/vscode/` are referenced by OS-specific paths (`AppData/Roaming/Code/User/` for Windows, `Library/Application Support/Code/User/` for macOS).

### Shell Configuration (Nushell)

`dot_config/nushell/` contains the Nushell configuration:
- `env.nu.tmpl` — environment setup (XDG dirs, PATH, Homebrew) with OS/arch-conditional logic via chezmoi templates
- `config.nu` — main Nushell config (table style, history, completions, vi edit mode, shell integration)

### WezTerm Configuration

`dot_config/wezterm/` contains a modular Lua configuration:
- `wezterm.lua` — entry point, composes config from submodules
- `config/` — separated concerns: `appearance.lua`, `bindings.lua`, `domains.lua`, `fonts.lua`, `general.lua`, `launch.lua`
- `events/` — WezTerm event handlers for status bar and tab titles
- `utils/` — helpers for platform detection, GPU adapter selection, math, cell rendering

### Neovim Configuration

`dot_config/nvim/init.lua` bootstraps **lazy.nvim** and loads **AstroNvim v4** as the base distribution.

### Service Deployment Scripts

`dot_services/` contains install scripts for Docker, K3s, and v2rayA, each using chezmoi templates for OS/arch-specific logic.

## Key Conventions

- All template files (`.tmpl`) use chezmoi's Go template syntax with `.chezmoi.os` and `.chezmoi.arch` for platform branching
- Package definitions are data-driven TOML, not hardcoded in scripts
- PowerShell is the template interpreter on Windows (configured in `.chezmoi.toml` with `ps1` → `pwsh`)
- Cross-platform configs (like VSCode) use shared templates with OS-specific path wrappers
