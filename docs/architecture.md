# dotfiles 仓库架构

## 目标

仓库当前只实现 macOS，但 macOS 特有的软件安装与运行时检查必须位于明确的 Darwin adapter 中。未来只有出现真实平台需求时才新增 adapter；当前不维护 Linux、Windows 占位代码，也不设计统一包管理器模型。

根目录保持稳定的人类入口，chezmoi source state 保持单一，平台差异不能迫使公共工作流或 HOME 配置复制。

## 模块边界

```text
.
├── bootstrap.sh                 # 打破首次安装依赖环
├── Taskfile.yml                 # 唯一公共工作流 API
├── platform/
│   └── darwin/
│       ├── Brewfile             # Darwin 软件白名单
│       ├── Taskfile.yml         # Darwin adapter
│       ├── check.py             # Darwin 仓库契约
│       └── doctor.py            # Darwin 实机健康检查
├── tasks/                       # chezmoi、shell、terminal 等公共内部任务
├── scripts/                     # 公共验证、调度和辅助逻辑
└── home/                        # 唯一 chezmoi source state（含 Pi 受管配置）
```

根 `Taskfile.yml` 只公开 `bootstrap`、`apply`、`diff`、`update`、`doctor` 和 `check`。它决定公共执行顺序，但把软件安装和平台 preflight 委托给 `platform/darwin/Taskfile.yml`。

`platform/darwin/Brewfile` 是当前软件集合的唯一事实源。公共任务和 CI 不解析或复制软件列表；CI 通过 Darwin Taskfile 准备验证环境。

`home/` 不按平台拆分。未来真实 HOME 差异优先由 chezmoi 的模板和 ignore 原语表达，不能创建多份 source state。

Pi 本体由 Darwin Brewfile 中的 `pi-coding-agent` formula 安装。Pi 扩展属于 HOME
配置而非平台软件：`home/dot_pi/private_agent/modify_settings.json` 合并受管的 OpenAI
模型策略和精确版本 package allowlist，同时保留 Pi 自己写入的更新提示等字段。
chezmoi 只管理 settings 与无密配置；`private_agent` 保持目标目录 `~/.pi/agent`
为 `0700`，而 `auth.json`、`trust.json`、sessions、cache 和 `~/.pi/agent/npm/`
始终是本机运行态。扩展选择与排除理由见
[`docs/pi.md`](pi.md)。

## 依赖方向

```text
用户命令
  -> 根 Taskfile
       -> tasks/*（配置能力）
       -> platform/darwin/Taskfile.yml（平台实现）
       -> chezmoi -> home/ -> $HOME
```

允许公共编排调用 platform adapter。禁止 `home/` 依赖任务实现，也禁止公共能力任务解析 Brewfile 或识别 macOS application bundle。

## 平台扩展规则

新增平台必须由真实、可测试的需求触发，并满足：

1. 新增 `platform/<id>/` adapter，而不是复制根 Taskfile、`tasks/` 或 `home/`。
2. adapter 拥有该平台的软件声明、bootstrap prerequisites、平台检查和健康诊断。
3. 六个公共命令及其非破坏语义保持不变。
4. 不要求不同平台的软件清单逐项相同，也不抽象 Homebrew、apt、winget 的最低公分母 schema。
5. 对应平台必须具有 CI 或真实机器验收；没有验证能力就不声明支持。

当前唯一 adapter id 为 `darwin`，与 `uname -s` 和常见工具的平台标识保持一致。非 Darwin 系统必须明确失败。

## 防腐规则

- macOS 软件只写入 `platform/darwin/Brewfile`。
- `/Applications`、`system_profiler`、`stat -f` 等 Darwin 细节只能出现在 `bootstrap.sh` 或 `platform/darwin/`。
- `tasks/` 按能力命名，不增加 `brew.yml` 等平台实现。
- 不创建空的 `platform/linux/`、`platform/windows/`、profile 或 hostname 模型。
- CI 不直接维护 Brewfile 路径或软件列表。
- `task apply` 不升级、清理或删除未受管状态。

## 验证

结构调整或 adapter 变更后至少运行：

```sh
task check
task doctor
task diff
```

涉及收敛行为时，再连续运行两次 `task apply`，确认幂等且无破坏性副作用。`task --list --json` 必须只暴露六个公共任务。

## 证据注释

- `[E1]` 当前仓库：根 `Taskfile.yml` 已形成稳定公共 API，`.chezmoiroot` 将 `home/` 设为唯一 source state；这些是应保留的边界。
- `[E2]` 迁移前的 `Brewfile`、`tasks/brew.yml`、`scripts/check.py` 和 `scripts/doctor.py` 同时解释 Homebrew/macOS，证明平台职责曾分散在公共层。
- `[E3]` chezmoi 官方 templating 与 `.chezmoiroot` 原语支持在单一 source state 中表达目标差异；它不要求为每个平台复制 HOME 树：<https://www.chezmoi.io/user-guide/templating/>
- `[E4]` Holman 的 topic organization 展示了按职责聚合 dotfiles 的实践；它证明主题边界可维护，但其隐式加载机制不是本仓库必须复制的方案：<https://github.com/holman/dotfiles>
- `[E5]` Dries Vints 等成熟 macOS dotfiles 在根目录使用 Brewfile，说明文件深度不是质量标准；本仓库移动 Brewfile 是为了建立 platform ownership，而非追求根目录整洁：<https://github.com/driesvints/dotfiles>

结论置信度高：目标平台、公共 API 和现有行为均明确，目录迁移不改变用户语义。未来 adapter 的具体选择仍需由对应平台的真实需求和验证结果决定。
