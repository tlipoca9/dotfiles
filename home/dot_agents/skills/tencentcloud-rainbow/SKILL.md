---
name: tencentcloud-rainbow
description: 腾讯内部七彩石（Rainbow）配置中心。用户询问七彩石选型、项目/环境/分组配置建模、SDK/Agent/trpc/OpenAPI/GitOps 接入、发布与灰度、运维容灾、报错或配置未生效时使用。
---

# 七彩石 All in One

七彩石（Rainbow）问题先分类，再执行对应流程。**地址、额度、SDK 推荐版本、API 字段、错误码可能变化；回答前回源 iWiki，不凭本 Skill 中的快照作最终结论。**

## 统一工作流

1. 明确 `集群/网络 → 项目 appid → 环境 env → 分组 group → 配置类型 → 客户端语言及版本 → 操作/错误码`。信息不足时只追问影响结论的字段。
2. 按场景加载一份或多份参考：
   - 选型、建项目、配置建模、发布：读 [usage.md](references/usage.md)
   - SDK、Agent、trpc、OpenAPI、GitOps：读 [integration.md](references/integration.md)
   - 七彩石自身开发、测试与架构：读 [development.md](references/development.md)
   - 运维、多集群、容灾与变更：读 [operations.md](references/operations.md)
   - 报错、异常、未生效、性能问题：读 [troubleshooting.md](references/troubleshooting.md)
3. 需要具体参数或最新结论时，用 iWiki MCP 的 `getDocument`（`docid`）回源；不知道文档时用 `searchDocument`（`query` 为关键词，`space_id` 为七彩石空间 `["24969300"]`），或用 `aiSearchDocument`（`space_ids: "24969300"`）做语义检索。资料入口见 [source-map.md](references/source-map.md)。
4. 输出可执行结论：推荐方案、步骤/代码、验证方法、回滚或兜底、来源链接。故障场景还要区分客户端、网络、权限、配置状态和服务端。

## 不可违反的护栏

- 业务读配置优先官方 SDK、rainbow-agent 或 trpc 插件；不要直接调用后端私有拉取接口。
- 开启内存缓存和文件缓存；初始化时预加载所有要用的分组并处理错误。
- 文件分组由 SDK/Agent 拉取；不要自行拼 COS URL。
- 热更新使用 Watch，但业务读取仍从本地缓存/Get 获取，并校验空值、格式和业务语义。
- 发布前看 DIFF、确认修改人和审批方式；先灰度验证，再全量；始终准备回滚。
- 不把地址、密钥、签名、额度或推荐版本写死；按目标集群和网络查官方页。
- Admin API 是管理面，SDK API 是读取面，不混用；生产程序不得用管理接口代替 SDK 拉取。
- 看到 702/708 等协议状态先判断是否预期，不一概当故障；看到 707 先查项目/环境/分组/已发布版本和 SDK 版本。

## 共同边界

- 联系人、入口、白名单、配额、版本、接口字段、审批流程、支持范围和当前状态属于易变事实；按本 skill 给出的来源回源核验。
- 区分公开产品契约、内部现行流程、本地稳定摘要和历史资料；来源冲突时列出冲突与更新时间，不静默合并。
- 默认可以搜索、读取、比较、设计和解释。修改平台配置、提交工单、发布、回滚或操作生产数据需要用户明确授权。
- 不输出 SecretKey、Token、Cookie、服务账号凭证、完整签名请求或其他敏感信息。
