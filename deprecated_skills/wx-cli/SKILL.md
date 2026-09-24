---
name: wx-cli
description: "统一查询本地个人微信与企业微信：个人微信使用 wx-cli，企业微信/WeCom 使用 wxwork。用户提到微信聊天记录、联系人、会话、群成员、收藏、朋友圈、公众号，或企业微信的日报周报、项目沟通、风险和待办时使用。"
---

# 微信本地查询

## 路由

- 个人微信、WeChat、联系人、群成员、收藏、朋友圈、公众号：使用 `wx`（wx-cli）。
- 企业微信、WeCom、WXWork、工作沟通汇总、客户或项目聊天：使用 `wxwork`。
- 用户只说“微信”且上下文无法判断时，先问是个人微信还是企业微信；不要同时查询两套私有数据库。
- 两套命令的输出都属于本地私密数据，不得发送到外部服务或 Web 工具。

下面先说明个人微信；企业微信流程见文末。

## Triggers

- 查微信聊天记录
- 微信消息历史
- 微信联系人
- 微信群成员
- 微信群昵称 / 群名片
- 微信收藏
- wechat history / messages / contacts
- wx-cli
- 帮我看看微信里
- 搜索微信消息
- 企业微信 / WeCom / wxwork
- 企业微信日报、周报、月报
- 项目沟通、风险、决策和待办

## Prerequisites

- macOS（Apple Silicon / Intel）或 Linux
- 微信桌面版 4.x 已安装并登录
- Node.js >= 14（npm 安装方式）或 curl（shell 安装方式）
- 首次 `wx init` 需要 `sudo`（内存扫描提取密钥）

---

## 安装

### 方式一：npm（推荐）

```bash
npm install -g @jackwener/wx-cli
```

### 方式二：curl

```bash
curl -fsSL https://raw.githubusercontent.com/jackwener/wx-cli/main/install.sh | bash
```

安装后验证：

```bash
wx --version
```

---

## 初始化（首次使用，只需一次）

### macOS（必须按顺序执行）

**第一步：对 WeChat 重新签名**（只需做一次，WeChat 更新后需重做）

```bash
codesign --force --deep --sign - /Applications/WeChat.app
```

如果报错 `signature in use` 或某个 dylib 签名损坏，先修复再签名：

```bash
codesign --remove-signature "/Applications/WeChat.app/Contents/Frameworks/vlc_plugins/librtp_mpeg4_plugin.dylib"
codesign --force --deep --sign - /Applications/WeChat.app
```

**第二步：清理 WeChat 在 macOS TCC 隐私数据库里的旧授权记录**（重签名后必做）

macOS TCC 按 `bundle id + csreq` 联合校验权限；csreq 编码自代码签名。重签名后旧 csreq 和新签名不再匹配，旧授权记录会 silent 失效（System Settings 仍把开关画成"已允许"，运行时实际拒绝）。把 WeChat 在 TCC 里的旧记录抹掉，让 macOS 在下次微信请求权限时按新签名重新生成 csreq：

```bash
tccutil reset ScreenCapture com.tencent.xinWeChat   # 截图 / 屏幕共享
tccutil reset Camera com.tencent.xinWeChat          # 视频通话 / 扫码
tccutil reset Microphone com.tencent.xinWeChat      # 语音消息 / 通话
tccutil reset AppleEvents com.tencent.xinWeChat     # 自动化 / 输入法
tccutil reset AddressBook com.tencent.xinWeChat     # 通讯录
tccutil reset SystemPolicyDocumentsFolder com.tencent.xinWeChat
tccutil reset SystemPolicyDownloadsFolder com.tencent.xinWeChat
tccutil reset SystemPolicyDesktopFolder com.tencent.xinWeChat
```

`tccutil` 对没有授权过的 service 会报 "No such bundle identifier"，是 no-op，不影响其他 service 的 reset。

**第三步：重启 WeChat**

```bash
killall WeChat && open /Applications/WeChat.app
# 等待微信完全登录后再继续
```

之后微信触发权限请求时按 GUI 提示重新允许即可。在 macOS 26 上，把 WeChat 加进 **隐私与安全 → 录屏与系统录音** 的上半区，**不要**只勾下半区的"仅系统录音"——后者不能授予截图权限。

**第四步：初始化**

```bash
sudo wx init
```

### Linux

```bash
sudo wx init
```

`wx init` 会自动：
1. 检测微信数据目录
2. 扫描进程内存，提取所有数据库密钥
3. 写入 `~/.wx-cli/config.json`

初始化完成后，后续所有命令无需 `sudo`，daemon 在首次调用时自动启动。

---

## 命令速查

所有命令默认输出 YAML，更省 token & 易读；`--json` 可切换为 JSON（方便 `jq` 处理等）。

### 会话与消息

```bash
# 最近 20 个会话
wx sessions

# 有未读消息的会话
wx unread

# 只看真人（私聊 + 群聊）的未读，过滤公众号与折叠入口
wx unread --filter private,group

# 上次检查后的新消息（增量）
wx new-messages
wx new-messages --json          # JSON 输出，适合 agent 解析

# 聊天记录（支持昵称/备注名）
wx history "张三"
wx history "张三" -n 2000
wx history "AI群" --since 2026-04-01 --until 2026-04-15 -n 100

# 全库搜索
wx search "关键词"
wx search "关键词" -n 500
wx search "会议" --in "工作群" --since 2026-01-01
```

`history` / `search` / `export` 都支持 `-n` / `--limit` 指定返回条数。默认值只是为了避免一次输出过多，不是硬上限。

`sessions` / `unread` / `history` / `new-messages` / `stats` 的输出都带 `chat_type` 字段，agent 可据此分流：

| 取值 | 含义 | username 特征 |
|------|------|--------------|
| `private` | 真人私聊 | `wxid_*` 或自定义短号 |
| `group` | 群聊 | `*@chatroom` |
| `official_account` | 公众号 / 订阅号 / 服务号 / 系统通知 | `gh_*`、`biz_*`、`mphelper`、`qqsafe`、`@opencustomerservicemsg` |
| `folded` | 折叠入口（订阅号折叠、折叠群聊的聚合条目） | `brandsessionholder`、`@placeholder_foldgroup` |

`wx unread --filter` 支持 `private` / `group` / `official` / `folded` / `all`，逗号分隔多选。默认 `all`。

群聊消息里的 `last_sender`、`sender` 和 `stats.top_senders` 会优先显示群昵称（群名片）。如果本地数据库没有群昵称，再回退到联系人备注、微信昵称或 username。

引用消息（appmsg `type=57`）在 `history` / `search` / `new-messages` 输出里会展开为两行：第一行是当前回复，第二行以 `↳` 开头显示被引用原文，例如：

```text
[引用] 当前回复
  ↳ 发送者: 被引用内容
```

`--type link` / `--type file` 会覆盖微信 appmsg 的链接、文件、合并聊天记录和引用消息等变体；`search --type link` 也会匹配解压并格式化后的引用原文。

### 联系人与群组

```bash
# 联系人列表 / 搜索
wx contacts
wx contacts --query "李"

# 群成员列表
wx members "AI交流群"
```

`wx members --json` 每个成员包含：

- `username`：微信内部 username
- `display`：推荐展示名，优先使用群昵称
- `contact_display`：联系人备注或微信昵称
- `group_nickname`：群昵称；没有记录时为空字符串
- `is_owner`：是否群主

Agent 展示群成员时优先用 `display`。需要区分群昵称和联系人名时，再读取 `group_nickname` 与 `contact_display`。

### 朋友圈（SNS）

三个命令，作用各不同：

```bash
# 1) 互动通知（点赞 / 评论，默认仅未读）
wx sns-notifications
wx sns-notifications --include-read --since 2026-04-01 -n 100

# 2) 时间线：浏览本地缓存的朋友圈帖子
wx sns-feed                                    # 近 20 条
wx sns-feed --user "张三"                      # 只看某人
wx sns-feed --since 2026-04-01 --until 2026-04-18 -n 100

# 3) 全文搜索：在正文里找关键词
wx sns-search "关键词"
wx sns-search "婚礼" --user "李四" --since 2023-01-01 -n 50
```

**字段区分**：

- `sns-notifications` 返回"通知"条目：`type`（`like`/`comment`）、`from_nickname`、`content`（评论正文，点赞为空）、`feed_preview` + `feed_author`（对应的原帖）
- `sns-feed` / `sns-search` 返回"帖子"条目：`author`、`content`（朋友圈正文）、`media`、`media_count`（图片/视频数）、`location`、`timestamp`；`media` 字段含每张图的 url/thumb/key/token/md5/enc_idx/size，供下游做图片代理或离线渲染。`media_count = media.len()`，按 DOM 解析的合法 `<media>` 子节点计数（malformed XML 返回 0）

> 只保存你本地刷到过的朋友圈（微信 app 按需下载）。没刷到过的帖子不在本地，任何命令都拿不到。

### 公众号文章

公众号的文章推送存在独立的 `biz_message_0.db`，与普通 `message_0.db` 分开：

```bash
# 最近 50 篇（默认）
wx biz-articles

# 更多
wx biz-articles -n 200

# 限定公众号（名称模糊匹配 display name / username）
wx biz-articles --account "返朴"

# 时间范围（YYYY-MM-DD，发布时间，非接收时间）
wx biz-articles --since 2026-05-01 --until 2026-05-10

# 仅有未读消息的公众号，每号取最新 1 篇（适合"今天有什么新推送"扫描）
wx biz-articles --unread
wx biz-articles --unread --account "Datawhale"   # 与 --account 取交集

# 下游消费：拿 URL 做内容抓取
wx biz-articles --since 2026-05-10 --json | jq '.[].url'
```

每条返回的字段：`account` / `account_username`（`gh_*`）/ `title` / `url`（`mp.weixin.qq.com` 链接）/ `digest` / `cover_url` / `time` + `timestamp`（文章发布时间）/ `recv_time_str` + `recv_time`（微信接收推送的时间）。多图文推送会展开为多行。

### 附件提取（图片）

聊天里的图片本体在 `xwechat_files/<wxid>/msg/attach/...` 下加密存储（`.dat`），需要按消息所在 `message_resource.db` 的 md5 + 平台相关 image key 才能解码。两步走：

```bash
# 1) 先列出图片附件，拿到不透明的 attachment_id
wx attachments "张三"
wx attachments "AI群" --kind image -n 100
wx attachments "AI群" --since 2026-04-01 --until 2026-04-15

# 2) 用 attachment_id 把单个资源解密写到指定路径
wx extract <attachment_id> -o ~/Desktop/photo.jpg
wx extract <attachment_id> -o /tmp/x.jpg --overwrite
```

`attachments` 输出每条带：`attachment_id` / `kind`（当前固定 `image`）/ `type` / `local_id` / `timestamp` / `time`，群聊里另带 `sender`。命令名保留成 `attachments` 是为了后续扩到其他附件类型时不 break CLI。

`extract` 报告里带：`md5` / `dat_path` / `dat_size` / `output` / `output_size` / `format`（实际识别出的图片格式：jpg / png / gif / webp / hevc 等）/ `decoder`（实际选用的解码器：`legacy_xor` / `v1_aes` / `v2`）。

支持的解码档位：
- **legacy XOR**：早期单字节 XOR，无 magic（按文件首字节探测格式自动反推）
- **V1 fixed-AES**（`07 08 V1 08 07`）：AES-128-ECB + 固定 key `cfcd208495d565ef`
- **V2 AES + XOR**（`07 08 V2 08 07`）：AES-128-ECB + raw + XOR；AES key 平台派生

V2 image key 提取（macOS / Windows 自动；Linux 暂不支持）：
- macOS：`kvcomm` cache（`key_<uin>_*.statistic` 文件名取 uin → `md5(str(uin) + wxid)[:16]`）+ brute-force fallback；`xor_key = uin & 0xff`
- Windows：扫 `Weixin.exe` 内存匹配 `[A-Za-z0-9]{32|16}` 候选，按 V2 template ciphertext-block 反验

### 收藏与统计

```bash
# 全部收藏
wx favorites

# 按类型筛选：text / image / article / card / video
wx favorites --type image

# 搜索收藏内容
wx favorites --query "关键词"

# 聊天统计（发言人、消息类型、活跃时段）
wx stats "AI群"
wx stats "AI群" --since 2026-01-01
```

### 导出

```bash
# 导出为 Markdown（默认）
wx export "张三" --format markdown -o chat.md
wx export "张三" -n 2000 --format markdown -o chat.md

# 导出为 JSON
wx export "AI群" --since 2026-01-01 --format json -o chat.json
```

### Daemon 管理

```bash
wx daemon status
wx daemon stop
wx daemon logs --follow
```

---

## Agent 使用建议

查询结果需要程序处理时，统一加 `--json`：

```bash
wx sessions --json
wx new-messages --json
wx search "关键词" --json
wx history "张三" --json -n 50
```

CHAT 参数支持昵称、备注名、微信 ID，模糊匹配。不确定准确名称时，先用 `wx contacts --query` 搜索。

---

## 数据文件位置

```
~/.wx-cli/
├── config.json       # 配置
├── all_keys.json     # 数据库密钥（敏感，勿分享）
├── daemon.sock       # Unix socket
├── daemon.pid / .log
└── cache/            # 解密后的数据库缓存
```

---

## 常见问题

**微信重启后密钥失效**：重新运行 `sudo wx init --force`（微信必须正在运行）。

**daemon 无响应**：`wx daemon stop` 后重新调用任意命令自动重启。

**找不到聊天**：用 `wx contacts --query` 确认昵称/备注名，或用微信 ID 直接查询。

**为什么只能获取 500 条消息？**：这是默认输出条数，不是硬限制。显式传 `-n` 即可，例如 `wx history "张三" -n 2000` 或 `wx export "张三" -n 2000 -o chat.md`。

---

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
