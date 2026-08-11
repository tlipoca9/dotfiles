# Pi 接入策略

## 结论

本仓库把 Pi 作为 OpenAI Codex/GPT 的第二个终端入口纳管。Pi CLI 由
Homebrew 安装；`pi-lean-ctx` 所需的 `lean-ctx` CLI 也由其官方 Homebrew tap
提供。扩展以精确 npm 版本写入 chezmoi 管理的 settings 合并脚本。
认证、项目授权、会话、缓存和已下载包仍由 Pi 在本机维护，不进入公开仓库。

这套边界同时满足两个目标：新 Mac 可通过 `chezmoi apply` 重建相同能力；Pi
升级时产生的运行态字段不会反复污染 dotfiles diff。第三方扩展拥有与 Pi
进程相同的系统权限，因此版本升级不是日常自动更新，而是一次需要审查的
源码供应链变更。

## 模型与外部服务边界

全局默认模型是 `openai-codex/gpt-5.6-sol`，主会话默认 thinking level
为 `high`；`pi-subagents` 中未显式指定 thinking level 的 agent 默认使用
`low`。可切换模型只允许 `openai-codex/*` 与 `openai/gpt-*`。后台记忆和
搜索摘要使用较轻量的 `openai-codex/gpt-5.6-terra`。

`pi-web-access` 被显式限制为 OpenAI search 与本地 HTTP 抓取。Gemini 专用
的视频理解被关闭，PDF 使用本地 `unpdf`，浏览器 cookie 与第三方托管抓取
均不启用。Plannotator 的内置 Anthropic 示例模型被清空，各阶段继承当前
OpenAI 模型。交互式 shell 只暴露 `pi` 和 `codex` 两个 agent 命令。

## 扩展清单

受管清单包含 19 个扩展：

- 界面与会话：`pi-open-tui`、`pi-rewind`、`@narumitw/pi-btw`、
  `@narumitw/pi-stamp`、`@tmustier/pi-usage-extension`
- 上下文与记忆：`pi-memctx`、`pi-lean-ctx`、
  `pi-observational-memory`
- 开发工具：`pi-lens`、`@ff-labs/pi-fff`、`pi-simplify`、
  `@plannotator/pi-extension`、`@narumitw/pi-chrome-devtools`
- 编排与集成：`pi-interactive-shell`、`pi-subagents`、
  `@narumitw/pi-goal`、`pi-mcp-adapter`、`pi-extmgr`、`pi-web-access`

以下候选不接入：

- `pi-deepseek-search` 只支持 DeepSeek 模型。
- `pi-go-bars` 只展示 OpenCode Go 计划用量。
- `@vigolium/piolium` 直接依赖 Anthropic Vertex SDK 和 Bun。
- `@oh-my-pi/pi-natives` 属于 Oh My Pi/Bun 运行时，不是当前 Pi CLI 的通用扩展。
- `pi-zentui` 与 `pi-open-tui` 同时接管 header/footer/editor；后者已吸收前者的
  主要设计，因此只保留一个 TUI。
- `pi-acp` 是供 Zed 等 ACP client 启动的独立 adapter，不是 Pi package；当前
  环境没有受管 ACP client，安装它不会增加可用能力。

## 更新与验证

`chezmoi apply` 先通过声明解释器安装或保持 Pi CLI，再由 chezmoi 合并
settings，最后运行 `pi update --extensions` 安装 settings 中声明的精确版本包。
扩展 pins 变化会改变 run_onchange 脚本的渲染校验和并自动重触发；chezmoi 不提供
越过 package pin 的第三方扩展自动升级流程。

变更扩展版本时，应先核对 npm metadata、Pi peer dependency 和 README 中的
默认 provider，再修改 pin。提交前验证仓库中的 TOML、JSON、模板和 shell
语法；应用到本机前运行 `chezmoi diff`，应用后运行 `chezmoi verify`。上游
`chezmoi doctor` 用于诊断 chezmoi 本身，而不是另一套自定义环境检查器。

## 上游依据

本决策在 2026-08-10 按以下一手资料核对：

- [Pi packages 文档](https://pi.dev/docs/latest/packages)定义了精确 npm pin、
  user settings 路径和 package 安装目录，并明确提示扩展拥有完整系统权限。
- [`pi-web-access` README](https://github.com/nicobailon/pi-web-access)说明 Codex
  auth 可用于 OpenAI search，而视频理解依赖 Gemini/Perplexity 路径。
- [`pi-lean-ctx` README](https://github.com/yvgude/lean-ctx)要求单独安装
  `lean-ctx` CLI，并提供官方 Homebrew tap。
- [`Plannotator` README](https://github.com/backnotprop/plannotator)记录了分阶段
  model override；使用 `null` 可保留当前会话模型。
- 每个 pin 的版本、engine 与 peer dependency 均通过 npm registry metadata
  核对；后续升级必须重新验证，不能把本文日期的兼容性当作永久事实。
