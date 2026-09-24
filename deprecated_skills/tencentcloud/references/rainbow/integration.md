# 客户端与接口接入

## SDK 基线

初始化必须开启内存和文件缓存，明确可写缓存路径；启动阶段预加载每个业务分组并处理失败；Get 后校验空值、格式与业务语义。只需启动加载时用 Get；实时热更新再加 Watch。缓存是后端异常时的容灾基础，不应在请求链路中每次穿透服务端。

官方 SDK/示例覆盖 Go、Java、C++、Python、Node.js；trpc-go 优先 `trpc-config-rainbow`；文件落盘优先 rainbow-agent。版本和能力矩阵见：[SDK 常见功能速查](https://iwiki.woa.com/p/1811662605)、[SDK 最佳实践](https://iwiki.woa.com/p/4008378767)。

## 禁止做法

- 直接调用 `/rainbowapi.configs/getdatas` 或 `/config.v2.ConfigService/PullConfigReq` 代替 SDK。
- SDK 初始化后不预拉取，首次业务请求才拉配置。
- 关闭缓存后轮询服务端。
- 文件分组先取 raw 再自行访问 COS。
- 使用与目标集群/网络不匹配的接入点。
- Watch 回调里执行长耗时、不可重入或无失败保护的业务操作。

## API 边界

- **SDK API**：数据面拉取/监听，生产业务读取配置。
- **Admin API/SDK**：控制面管理项目、分组、配置、发布、权限；调用需签名、鉴权、幂等和状态机意识。
- API 请求签名细节回源 [签名文档](https://iwiki.woa.com/p/74063081)，管理接口回源 [Admin API](https://iwiki.woa.com/p/98145038)，读取接口回源 [SDK API](https://iwiki.woa.com/p/111994414)。不要复制过期示例中的密钥或地址。

## 场景能力

- GitOps：仓库中按规范提供 `rainbow.yaml`，关注单仓分组数、模板内容、异步任务和发布状态。
- ConfigMap：关注 K8s 平台支持、namespace/cluster 凭证和 1MiB 等目标平台自身限制。
- 多 SET：客户端标签必须唯一匹配；相同 key 在不同作用域的变量类型必须一致。
- 公网/VPC/独立集群：需对应访问申请、网络路由和专属服务发现地址，不能沿用主集群默认值。

## 回答语言代码问题

先确认语言、SDK 包名、精确版本、初始化参数、appid/env/group、接入点、缓存配置、是否 fork/多进程。然后读取该语言仓库 tag 下示例，避免把另一语言或旧版 API 翻译过去。
