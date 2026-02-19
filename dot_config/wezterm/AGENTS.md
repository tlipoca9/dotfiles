# WezTerm Configuration

Modular Lua terminal config using a **builder pattern** for composable configuration.

## STRUCTURE

```
wezterm/
├── wezterm.lua          # Entry point: registers events, chains config modules
├── config/
│   ├── init.lua         # Config class: init() + append() builder methods
│   ├── appearance.lua   # WebGPU, Snazzy color scheme, cursor, tab bar, window frame
│   ├── bindings.lua     # Keybindings: F1-F12, platform-conditional modifiers (Super/Alt)
│   ├── domains.lua      # Domain/pane configuration
│   ├── fonts.lua        # Font settings (Maple Mono NF CN, ligatures)
│   ├── general.lua      # General WezTerm options
│   └── launch.lua       # Launch/startup configuration
├── events/
│   ├── left-status.lua  # Key table indicator, leader key status (NerdFont glyphs)
│   ├── right-status.lua # Time display
│   ├── tab-title.lua    # Tab title formatting with unseen indicator (369 lines)
│   └── new-tab-button.lua
├── utils/
│   ├── platform.lua     # OS detection (is_mac, is_win, is_linux)
│   ├── gpu-adapter.lua  # GPU selection for WebGPU rendering
│   ├── cells.lua        # Status bar cell rendering with colors (224 lines)
│   ├── math.lua         # Math helpers
│   └── opts-validator.lua
├── dot_luarc.json       # Lua LSP config (deployed as .luarc.json)
├── dot_luacheckrc       # Lua linter config
├── dot_stylua.toml      # Lua formatter config (deployed as .stylua.toml)
└── dot_gitignore        # Git ignore rules
```

## HOW IT WORKS

```lua
-- wezterm.lua chains modules via builder:
Config:init()
  :append(require('config.appearance'))
  :append(require('config.bindings'))
  :append(require('config.domains'))
  :append(require('config.fonts'))
  :append(require('config.general'))
  :append(require('config.launch'))
  .options  -- final merged config table
```

Each `config/*.lua` module returns a plain table. `append()` merges tables and **warns on duplicate keys**.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Change colors/theme | `config/appearance.lua` | Snazzy scheme, WebGPU renderer |
| Add/modify keybindings | `config/bindings.lua` | Platform-conditional Super vs Alt |
| Change fonts | `config/fonts.lua` | Font family + OpenType features |
| Modify status bar | `events/left-status.lua` or `events/right-status.lua` | NerdFont glyphs |
| Tab title format | `events/tab-title.lua` | Complex — 369 lines |
| Platform detection | `utils/platform.lua` | `is_mac`, `is_win`, `is_linux` |

## CONVENTIONS

- One module per concern — never mix appearance and bindings
- Config modules return plain tables, NOT call wezterm APIs directly
- Events registered in `wezterm.lua` entry point, NOT inside modules
- Lua linting (`dot_luacheckrc`) and formatting (`dot_stylua.toml`) configs present — respect them
- Platform conditionals use `utils/platform.lua`, not inline OS checks
