# Oh My Pi 接入策略

## 边界

本仓库把 Oh My Pi（OMP）作为独立于 Pi 的终端编码入口纳管。OMP CLI 由 Homebrew
首次补缺，版本随 Homebrew 浮动；chezmoi 只管理本地 Wayfinder 门禁和专用只读
Agent。认证、模型配置、项目授权、会话、缓存、插件数据库及其他运行态由 OMP
自己维护。

OMP 与 Pi 并行存在。`home/dot_pi/` 下的配置、扩展和运行策略不迁移、不复用，
也不由 OMP 文件覆盖。

## Task Wayfinder 门禁

OMP 的原生多 Agent 入口是 `task`。全局 `task-wayfinder` extension 使用同名工具
包装 OMP 的 native task：调用必须携带结构化 `wayfinder` binding，每个 child 必须
显式声明唯一 `name`，tracked ticket 的数量、顺序和 key 必须与 child name 精确
一致。门禁通过后，extension 为每项 assignment 注入 map 和该 child 自己的 ticket，
删除 OMP 不认识的 `wayfinder` 字段，再通过 `ctx.invokeTool()` 委托原生 task；它不
复制或重写 OMP 的调度实现。

单次只读审查只能使用受管的 `wayfinder-reviewer` 和显式
`one-shot-read-only` exemption。该 Agent 不包含 shell、write/edit 或 LSP 工具。
OMP 内置 reviewer 包含 `bash`，因此不具备豁免资格。所有其他单 child、多 child、
写入或 isolated 工作都必须使用 tracked map/tickets。

Tracker 优先采用工作仓库 `docs/agents/issue-tracker.md` 的显式 `tapd_mini` 与
`workspace_id` 声明；未声明时由 `origin` 推断：GitHub 使用 GitHub Issues，
`git.woa.com` 使用 Gongfeng，其他或无远端使用 local markdown。远程引用只做
静态 URL 与归属校验，不联网证明 issue 存在。Local tracker 不允许与 isolated
task 组合。

子 Agent 使用 OMP `hub` 向父 Agent 发送 `[wayfinder:interview_request]` 或
`[wayfinder:pitfall_report]`。父 Agent 是共享 pitfall log 的唯一写入者，按
Scope + Symptom + Cause 去重并在接受 child 完成前确认报告。

详细协议见
`home/dot_omp/private_agent/extensions/task-wayfinder/README.md`。

## 应用与验证

OMP formula 声明位于 `home/.chezmoidata/darwin/packages.toml`。安装脚本只补齐缺失
的 `can1357/tap/omp`，不自动升级或回滚。Extension 位于 OMP 的原生自动发现目录
`~/.omp/agent/extensions/`，专用 Agent 位于 `~/.omp/agent/agents/`，无需管理全局
`config.yml`。

应用到真实 HOME 前运行 `chezmoi diff`；应用后运行 `chezmoi verify`，再通过 OMP
启动 smoke test 确认 `task` 显示为 Wayfinder-gated wrapper。认证和 session 文件
不得纳入 chezmoi。

## 上游依据

- [OMP extensions](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md)
  说明同名 built-in wrapper 可通过 `ctx.invokeTool()` 委托原生实现。
- [OMP task](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md)
  说明 batch/flat 输入、`name`、`agent` 与 `isolated` 语义。
- [OMP extension loading](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md)
  说明 `~/.omp/agent/extensions` 的自动发现行为。
