# Pi 接入策略

## 边界

本仓库把 Pi 作为 OpenAI Codex/GPT 的第二个终端入口纳管。Pi CLI 与其必要
的本地辅助命令由 Homebrew 首次补缺；Homebrew 的浮动版本是设计选择，不追求
版本级复现。chezmoi 管理能力配置和经过审查的精确扩展 pins，但认证、项目
授权、会话、缓存、下载目录与其他运行态继续由 Pi 自己维护。

扩展 pins 的唯一事实源是
`home/dot_pi/private_agent/modify_settings.json`。该 modifier 合并受管字段，同时
保留输入 JSON 中的 Pi runtime 字段。本文不复制 pin 数量或清单，避免文档与
实际声明漂移。第三方扩展拥有与 Pi 进程相同的系统权限，因此 pin 变更属于需
审查的供应链变更，不是日常自动升级。

## 模型与外部服务

全局默认使用 OpenAI Codex/GPT 模型；可切换范围、thinking level、后台记忆
模型及各扩展配置均以受管 Pi settings 为准。Web 能力限制在已配置的 OpenAI
搜索和本地 HTTP 抓取；浏览器 cookie、第三方托管抓取及非当前 provider 的
示例模型不纳入默认环境。

## 应用与验证

`chezmoi apply` 补齐缺失的 Pi CLI，合并 settings，再运行 Pi 自身的 extension
更新命令以落实精确 pins。Pi 健康检查只相信命令退出码，不解析可能变化的英文
错误文本。`run_onchange` 只表示声明变化后重跑，不负责持续收敛或越过 pins
自动升级。

修改 pin 前应核对 npm metadata、Pi engine/peer dependency 和扩展 README，
并把变更作为代码审查。提交前运行：

```sh
python3 tests/check.py
```

应用到真实 HOME 前先运行 `chezmoi diff`，应用后运行 `chezmoi verify`。
`chezmoi doctor` 只用于上游 chezmoi 诊断，不另建自定义 doctor。

## 上游依据

- [Pi packages 文档](https://pi.dev/docs/latest/packages)说明精确 npm pin、user
  settings 与 package 安装目录，并提示扩展拥有完整系统权限。
- 扩展升级时以对应上游 README 和 npm registry metadata 为准；旧的兼容性核对
  不能当作永久保证。
