---
name: tencentcloud
description: 腾讯云内部平台与云 API 工作入口。用户询问七彩石/Rainbow、腾讯云资源标签 Tag、YunAPI/云 API/CAPI、YunAPI 3.0 规范、CAM 与 Tag 集成，或 TencentCloud SDK/网关 RequestId 故障时使用；不要因 Git tag、HTML 标签、其他云厂商或泛化云计算问题触发。
---

# Tencent Cloud

先识别问题所属场景，再只读取对应入口及其明确要求的参考文件。跨场景问题可以读取多个入口，但不要默认加载全部腾讯云资料。

## 场景路由

| 场景 | 入口 |
| --- | --- |
| 七彩石/Rainbow 选型、配置、接入、发布、运维或故障 | [rainbow/index.md](references/rainbow/index.md) |
| 腾讯云资源标签接入、API、鉴权、分账、治理或脏数据 | [tag/index.md](references/tag/index.md) |
| YunAPI/CAPI 产品接入、配置、测试发布、文档、运维 | [yunapi/index.md](references/yunapi/index.md) |
| YunAPI 3.0 产品名、版本、Action、参数、响应、错误码或示例规范 | [yunapi/spec-workflow.md](references/yunapi/spec-workflow.md)，并按其要求读取 [yunapi/spec.md](references/yunapi/spec.md) |
| YunAPI 资源的 CAM、QCS、请求/资源标签、List 过滤或创建者标签集成 | [yunapi/cam-tag/index.md](references/yunapi/cam-tag/index.md) |
| TencentCloud SDK、YunAPI 或外部网关返回不透明错误且带 RequestId | [yunapi/gateway-request-id-escalation.md](references/yunapi/gateway-request-id-escalation.md) |

## 路由规则

- CAM 与 Tag 集成优先进入 `references/yunapi/cam-tag/`；只有需要核对 Tag 平台现行内部流程时，再补读 `references/tag/index.md` 的相关分支。
- 纯 YunAPI 规范评审直接进入 `references/yunapi/spec-workflow.md`；只有问题涉及接入、发布或运维生命周期时才补读 `references/yunapi/index.md`。
- 不透明网关错误先保留 RequestId 和边界证据，再决定是否需要 YunAPI 运维资料；不要先根据响应形状猜测并修改本地代码。
- Rainbow 与 YunAPI/Tag 是独立产品域，除非用户的问题明确跨域，不要互相套用术语、接口或操作流程。

## 共同边界

- 联系人、入口、白名单、配额、版本、接口字段、审批流程、支持范围和当前状态属于易变事实；按分支入口给出的来源回源核验。
- 区分公开产品契约、内部现行流程、本地稳定摘要和历史资料；来源冲突时列出冲突与更新时间，不静默合并。
- 默认可以搜索、读取、比较、设计和解释。修改平台配置、提交工单、发布、回滚或操作生产数据需要用户明确授权。
- 不输出 SecretKey、Token、Cookie、服务账号凭证、完整签名请求或其他敏感信息。
