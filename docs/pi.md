# Pi 接入策略

## 边界

本仓库把 Pi 作为 OpenAI Codex/GPT 的第二个终端入口纳管。Pi CLI 与其必要
的本地辅助命令由 Homebrew 首次补缺；Homebrew 的浮动版本是设计选择，不追求
版本级复现。chezmoi 管理能力配置和经过审查的精确扩展 pins，但认证、项目
授权、会话、缓存、下载目录与其他运行态继续由 Pi 自己维护。

扩展 pins 的唯一事实源是
`home/dot_pi/private_agent/modify_settings.json.tmpl`。该 modifier 合并受管字段，同时
保留输入 JSON 中的 Pi runtime 字段。npm 扩展以精确版本安装；需要本地文件的
扩展以上游提交和明确记录的本地策略修改纳管，依赖由其 lockfile 固定。本文不
复制 pin 数量或清单，避免文档与实际声明漂移。第三方扩展拥有与 Pi 进程相同
的系统权限，因此 pin 变更属于需审查的供应链变更，不是日常自动升级。

## 模型与外部服务

全局默认使用 OpenAI Codex/GPT 模型；可切换范围、thinking level、后台记忆
模型及各扩展配置均以受管 Pi settings 为准。Web 能力包括已配置的 OpenAI
搜索、本地 HTTP 抓取，以及默认开启的本地 browser；browser cookie 只保存在
本机 profile。第三方托管抓取及非当前 provider 的示例模型不纳入默认环境。

## Subagent 编排策略

Pi 的初始 `subagent(...)` 执行由本地 `subagent-wayfinder` extension 门禁。
单次 `reviewer`/`oracle` 只读调用可明确豁免；写入、并行、多阶段、worktree
或显式长时工作必须先建立或关联一个 Wayfinder map，并为每个字面量 child key
准备一个 ticket。Tracker 优先采用工作仓库 `docs/agents/issue-tracker.md` 的显式
`tapd_mini` 声明；未声明时再由 `origin` 推断：GitHub 使用 GitHub Issues，
`git.woa.com` 使用 Gongfeng，其他或无远端使用 local markdown。跨仓库工作拆成
独立 workflow/map。

门禁通过 pi-subagents 的 `extensionBindings` 把 map/ticket 边界传入子 Agent。
子 Agent 遇到影响范围、行为、架构、权限或验收的真实歧义时，先查 ticket、map
和仓库证据；仍无法确定才用 native supervisor channel 发出一次一个问题的
`interview_request`。主 Agent 能从已定决策回答就直接回复，否则使用 `grilling`
一次向用户澄清一个问题。仓库可在 `docs/agents/issue-tracker.md` 的 frontmatter
中声明 `tapd_mini` 和 `workspace_id`，覆盖远端推断；Map 使用根 mini-item，Ticket
通过 `parent_id` 归属 Map。详细协议和已知入口边界见
`home/dot_pi/private_agent/extensions/subagent-wayfinder/README.md`。

## 应用与验证

`chezmoi apply` 补齐缺失的 Pi CLI，合并 settings，再运行 Pi 自身的 extension
更新命令以落实精确 npm pins，并为本地 browser 扩展安装锁定依赖和 Chromium。
browser 默认开启，当前会话可用 `/browser off` 关闭。Pi 健康检查只相信命令
退出码，不解析可能变化的英文错误文本。`run_onchange` 只表示声明变化后重
跑，不负责持续收敛或越过 pins 自动升级。

修改 pin 前应核对 npm metadata、Pi engine/peer dependency 和扩展 README，
并把变更作为代码审查。应用到真实 HOME 前先运行 `chezmoi diff`，应用后运行
`chezmoi verify`。
`chezmoi doctor` 只用于上游 chezmoi 诊断，不另建自定义 doctor。

## 上游依据

- [Pi packages 文档](https://pi.dev/docs/latest/packages)说明精确 npm pin、user
  settings 与 package 安装目录，并提示扩展拥有完整系统权限。
- 扩展升级时以对应上游 README 和 npm registry metadata 为准；旧的兼容性核对
  不能当作永久保证。
