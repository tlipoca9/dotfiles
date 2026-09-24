## 企业微信（wxwork）

将已安装的 `wxwork` 命令作为企业微信本地 JSON 数据源；CLI 负责检索和过滤，agent 负责总结、风险识别和行动项提取。

### 健康检查与新鲜度

先运行最轻量的检查：

```bash
command -v wxwork
wxwork doctor
```

若 `doctor` 报告配置、密钥、数据库或缓存问题，说明具体问题后停止。除非用户明确要求，不运行 `init`、导入密钥或修改密钥文件。

普通汇总优先 `wxwork summary-input --today`；允许缓存时用 `--freshness prefer-cache`；只有用户明确需要最新消息并接受等待时才用 `--freshness strict-latest`。

### 任务路由

```bash
# 日报 / 周报 / 月报
wxwork summary-input --today
wxwork summary-input --preset weekly
wxwork summary-input --preset monthly

# 指定聊天、主题或项目
wxwork summary-input --chat "<chat>" --since "<datetime>" --until "<datetime>"
wxwork summary-input --keyword "<keyword>" --since "<datetime>"

# 定位与检索
wxwork sessions -n 20
wxwork find-chat "<keyword>" -n 10
wxwork history --chat "<chat>" --days 7 -n 100 --order asc
wxwork search "<keyword>" --since "<datetime>" --until "<datetime>" -n 50
wxwork new-messages -n 200
```

相对时间先按本地时区（默认 Asia/Shanghai）换算成具体日期。使用能回答问题的最小查询；汇总优先 `summary-input`。聊天名模糊或首次无结果时，先用 `find-chat` 或 `sessions` 解析名称再重试。解析 stdout 的 JSON，stderr 警告仅在影响置信度时单独报告。

日报/周报默认整理为：重点对话、决策与状态变化、风险与阻塞、按负责人分组的待办、开放问题。定向检索或事故回顾默认整理为：时间线、相关人员/会话、关键事实、当前状态、后续行动。增量消息区分“需要关注”和“可以等待”。

### 企业微信安全边界

- 不在最终答案中倾倒大段原始 JSON，只引用证明结论所需的最短消息片段。
- 未经明确请求，不运行 `wxwork new-messages --reset-state`、`wxwork refresh-cache`、`wxwork init` 或标签修改命令。
- 未经明确请求，不编辑 `~/.wxwork-cli/`、密钥文件或复制的数据库。
- 无匹配消息时，说明实际查询的日期范围和过滤条件。
