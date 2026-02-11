# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Overview

This is a **chezmoi**-managed cross-platform dotfiles repository for user **tlipoca9**, targeting macOS, Linux, and Windows. The primary shell is **Nushell**, terminal is **WezTerm**, and editor is **Neovim (AstroNvim v4)** + **VSCode/CodeBuddy**.

## Commands

### Initialize on a new machine (HTTPS)
```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply https://github.com/tlipoca9/dotfiles.git
```

### Initialize on a new machine (SSH)
```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply git@github.com:tlipoca9/dotfiles.git
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

- `dot_` prefix → deployed as `.` (e.g., `dot_config` → `~/.config`)
- `executable_` prefix → deployed with executable permissions
- `.tmpl` suffix → rendered through Go templates before deployment
- `run_onchange_` prefix → scripts re-executed when their content (after template rendering) changes

### Local Chezmoi Configuration (`.chezmoi.toml`)

The root `.chezmoi.toml` configures chezmoi behavior:
- `diff.pager` set to empty string (inline diff output)
- **Windows**: `.ps1` templates are interpreted by `pwsh` (PowerShell Core) with `-NoLogo`
- **Nushell**: `.nu` templates are interpreted by `nu`

This is critical — when adding new install scripts for Windows, use `.ps1.tmpl` extension; for Nushell scripts, use `.nu.tmpl`.

### Template System

Chezmoi's Go template engine is the core mechanism enabling cross-platform support.

**Shared templates** live in `.chezmoitemplates/` and are referenced via `{{ template "name" . }}`:
- `shell_logger` — OS-aware logging functions (HINT, INFO, WARN, ERROR, FATAL) used in install scripts. Outputs bash functions on macOS/Linux, PowerShell functions on Windows.
- `vscode/settings.json` — wraps `vscode/settings-common` in JSON braces, deployed to OS-specific VSCode config paths
- `vscode/settings-common` — shared VSCode/Vim settings (theme, fonts, keybindings, vim-mode config) included by both VSCode and CodeBuddy templates
- `vscode/keybindings.json` — shared keybinding config
- `codebuddy/settings.json` — extends `vscode/settings-common` with CodeBuddy-specific settings (inline chat, completions, etc.)

**Template composition pattern**: `codebuddy/settings.json` and `vscode/settings.json` both include `vscode/settings-common` as a shared base, then add editor-specific overrides. This avoids duplication of ~150 lines of common settings.

**OS-conditional logic** uses `{{ if eq .chezmoi.os "darwin" }}` / `"linux"` / `"windows"` throughout templates and in `.chezmoiignore`.

### Data-Driven Package Management

`.chezmoidata/<os>/packages.toml` defines per-platform package manifests keyed as `[<os>.packages.<name>]`. Each entry has:
- `enable` (bool) — whether to install
- `type` (string) — installer backend: `homebrew`, `scoop`, or `script`
- `checker` (object) — how to verify if already installed:
  - `type: "command"` + `command` — checks if a CLI command exists
  - `type: "cask"` + `cask` — checks if a Homebrew cask is installed (macOS)
  - `type: "font"` + `font` — checks if a system font exists (Windows)
  - `type: "script"` + `script` — runs arbitrary check script
  - `type: "scoop-apps"` + `bucket`/`app` — checks Scoop app listing (Windows)
- `installer` — install method (varies by type: `{ type = "formula" }`, `{ type = "cask" }`, or inline script string)
- `post_install` (optional) — script to run after installation

Platform-specific install scripts in `.chezmoiscripts/<os>/run_onchange_*` iterate these data files with `{{ range }}`. The `run_onchange_` prefix means chezmoi re-runs the script only when the rendered template content changes (i.e., when `packages.toml` is modified).

**Package managers per platform**: Homebrew (macOS, Linux), Scoop (Windows).

### Platform-Specific File Routing

`.chezmoiignore` conditionally excludes paths per OS using Go template conditionals:
- **macOS**: deploys `Library/` paths, ignores `AppData/`, `.scripts`
- **Windows**: deploys `AppData/` paths, ignores `Library/`, `.scripts`
- **Linux**: ignores both `Library/` and `AppData/`
- All platforms ignore `_tmp`, `docs`, `README.md`

**Editor config routing example**: VSCode and CodeBuddy share settings via templates:
- `AppData/Roaming/Code/User/settings.json.tmpl` → includes `vscode/settings.json` (Windows VSCode)
- `AppData/Roaming/CodeBuddy CN/User/settings.json.tmpl` → includes `codebuddy/settings.json` (Windows CodeBuddy)
- `Library/Application Support/Code/User/settings.json.tmpl` → includes `vscode/settings.json` (macOS VSCode)

### Shell Configuration (Nushell)

`dot_config/nushell/` contains Nushell configuration:
- `env.nu.tmpl` — chezmoi-templated environment setup:
  - Maps `USERPROFILE` → `HOME` on Windows
  - Sets XDG Base Directories (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, etc.)
  - Configures Homebrew paths (Intel Mac `/usr/local`, ARM Mac `/opt/homebrew`, Linux `/home/linuxbrew/.linuxbrew`)
  - Adds mise shims to PATH for tool version management
  - Auto-generates atuin init/completion files on first run if atuin is available
- `config.nu` — main config (vi edit mode, rounded table style, fuzzy completions, atuin shell history integration via sourced files)

### Tool Version Management (mise)

`dot_config/mise/config.toml` declares globally managed tool versions via [mise](https://mise.jdx.dev/): neovim, ripgrep, go, rust, python, uv. All set to `latest`. Mise is integrated via shims mode (PATH-based, no per-command hook), configured in `env.nu.tmpl`.

### WezTerm Configuration

`dot_config/wezterm/` uses a modular Lua architecture with a builder pattern:
- `wezterm.lua` — entry point, registers event handlers then chains config modules via `Config:init():append(...).options`
- `config/init.lua` — defines the `Config` class with `init()` and `append()` methods for composable configuration
- `config/` modules — `appearance`, `bindings`, `domains`, `fonts`, `general`, `launch` — each returns a table merged into the final config
- `events/` — WezTerm event handlers for left/right status bars, tab titles, new-tab button
- `utils/` — platform detection, GPU adapter selection, math helpers, cell rendering

### Neovim Configuration

`dot_config/nvim/init.lua` is minimal: bootstraps **lazy.nvim** plugin manager and loads **AstroNvim v4** as the base distribution. No custom plugin overrides in this repo.

### Shell History (Atuin)

`dot_config/atuin/config.toml` configures [Atuin](https://atuin.sh/) with the "autumn" theme. Atuin provides cross-shell, cross-machine shell history sync. Integration with Nushell is handled via auto-generated init/completion files in `env.nu.tmpl`.

## Key Conventions

- All `.tmpl` files use chezmoi Go template syntax with `.chezmoi.os` and `.chezmoi.arch` for platform branching
- Package definitions are data-driven TOML in `.chezmoidata/`, never hardcoded in install scripts
- Install scripts use the `shell_logger` template for consistent colored log output across platforms
- Cross-platform editor configs use a shared template composition pattern — modify `vscode/settings-common` for changes that apply to both VSCode and CodeBuddy
- When adding a new package: edit the appropriate `.chezmoidata/<os>/packages.toml`, the install script will pick it up automatically via `{{ range }}`
- The `_tmp` and `docs` directories are always ignored by chezmoi and not deployed to the home directory
