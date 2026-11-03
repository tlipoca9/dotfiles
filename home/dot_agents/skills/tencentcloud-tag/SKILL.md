---
name: tencentcloud-tag
description: 腾讯云资源标签（Tag）平台。用户询问云产品接入标签、Tag API/SDK/订阅、基于标签的鉴权与资源六段式、按标签分账、系统/创建者标签治理、下线迁移，或标签不显示、脏数据等问题时使用；不要因 Git tag、HTML 标签、其他云厂商或泛化云计算问题触发。
---

# 腾讯云 Tag All in One

把本 Skill 当作只读知识导航器。资料入口是 iWiki“标签”树根文档 `4008495677`；`references/source-map.md` 收录根文档、54 个后代节点和 7 篇关键一跳依赖。

## 检索流程

1. 从问题中识别云产品、资源类型、账号类型、地域/环境、所处阶段和现象。只在缺少的信息会改变检索方向时追问。
2. 按场景路由只加载相关 reference；跨场景问题可以加载多份。
3. 判断问题是否包含易变事实。联系人、系统入口、白名单、配额、支持产品/地域、审批流程、接口字段、环境配置、发布状态和“当前是否支持”必须用 iWiki MCP 的 `getDocument`（`docid`）回源。必要时先用 `metadata`（`docid`）确认文档类型和更新时间。
4. 直接回答知识问题，说明适用条件；引用 `https://iwiki.woa.com/p/<docid>`。来源不足或冲突时明确指出，不补写不存在的规则。

若 `metadata` 显示 `TXDOC` 或 `TXEXCEL`，正文不在 iWiki：用 iWiki MCP 的 `searchWeDoc`（`iwiki_doc_ids`、`word_list`）检索相关片段；需要全文时改用已配置的企业微信文档 MCP 读取。若实时来源因权限、认证或服务故障不可读，只能使用本地摘要并明确“未完成实时核验”和摘要盘点日期；不得把快照表述为当前事实。

## 场景路由

| 问题 | 加载 |
| --- | --- |
| 首次接入、控制台/API 改造、发布前测试 | `references/onboarding.md` |
| 下线、地域变化、产品或资源更名、存量迁移 | `references/lifecycle.md` |
| Tag API、控制台 SDK、订阅、本地同步 | `references/api-sdk-subscription.md` |
| CAM、服务账号、标签隔离、资源六段式、项目兼容 | `references/auth-resource-model.md` |
| 分账接入、标签何时进入账单、成本归属异常 | `references/billing.md` |
| 系统/创建者标签、策略、配额、限制、继承、自研账号 | `references/governance.md` |
| 标签不显示、查不到、被改、重复、无法删除、脏数据 | `references/troubleshooting.md` |
| 找原文、核对覆盖范围或更新时间 | `references/source-map.md` |

## 证据与时效

- 公开产品或 API 契约：当前腾讯云官网、云 API 文档优先。
- 内部接入和运营流程：当前 iWiki 文档优先。
- TAPD、KM、历史公告和旧接口只作补充背景，除非当前 iWiki 明确指向它们作为现行步骤。
- 高优先级来源冲突时，列出冲突、来源和更新时间；不要静默合并。
- 本地 reference 是检索索引和稳定知识摘要，不替代易变原文。

## 只读边界

- 可以读取、搜索、比较和解释 iWiki、官网、云 API、TAPD、企微文档及内部系统资料。
- 不提交需求单，不修改野鹤、CAM、白名单、策略、配置或生产数据，也不代替用户执行控制台操作。
- 不输出 SecretKey、Token、Cookie、服务账号凭证或完整签名请求。

## 回答约定

- 先回答用户问的知识点，不强制扩展为接入计划或排障闭环。
- 区分稳定规则、当前事实、历史行为和推测。
- 对“目前、最新、谁负责、在哪里配置、哪些产品支持”等问题附原文更新时间。
- 文档只是空目录或只含外链时，说明这一点并转向其子文档或直接依赖；不得把目录标题当作规则。

## 相关 skill

- 为 YunAPI 资源实现 CAM 与 Tag 集成（请求/资源标签、List 过滤、创建者标签）：用 `tencentcloud-cam`，本 skill 只补充 Tag 平台现行内部流程。
