# Examples

Each pair is a passage the user rejected, the user's verdict, and the version that fixes it. Follow the habit an example teaches; the wording belongs to its own context.

## Measurement scope written as a list of non-conclusions

From a page-load latency report. The user flagged every sentence:

> 这是少量现场样本，不是 P95 或性能 SLO。
> 这些数字不能直接当作页面 JS 或渲染耗时。
> 现有证据没有证明存在数秒的"结果已到前端但页面迟迟不更新"；也没有进行主线程性能剖析，不能据此宣称前端渲染完全没有问题。
> 未修改这些配置，未删除 Harness 或已有 Session。本轮补充观测创建了 6 个空 Session，没有发送 prompt，因此不包含模型推理、首 token 或完整回答耗时。
> 因此不能把浏览器 TTFB 全部归给 Bosun handler。后端日志与浏览器来自不同时钟，以下只做关联和阶段定位，不将跨端时间差当精密测量。
> Customs 关联属于多条件交叉匹配，不能描述为贯通同一 RequestId 的完整分布式 trace。

Verdict: "没有人会拿这个来攻击你." Each sentence tells the reader what not to conclude or what the author did not touch. Define what the numbers are, once, and stop:

> 样本：6 次空 Session 初始化，未发送 prompt。
> 耗时从打开页面算到会话可输入，包含调度和状态读取。
> 后端阶段取自 Bosun 日志，按时间与浏览器请求关联。

## A setting that matters, written as a caveat

> 数据测于 `0–1` 配置，改成 `1–1` 后还没复测。

Verdict: defensive. When the configuration matters to the numbers, it is part of the sample definition:

> 配置：最小实例 0、最大实例 1。

## Rebutting an idea that only existed in the session

From an architecture doc:

> 数据面本身没有 /api 特殊规则，也不需要 /api -> /dsh-api -> /api 路径改写。

Verdict: "没有上下文的内容." The sentence argues with a design considered during the session. The doc describes the routing that exists; this sentence goes.

Copy for a demo page mentioned 生产环境 because the conversation had; the verdict was "你的文案不用涉及我们的对话上下文." Write about what the page shows.

## API field description

> 用于持久化会话的 Session Space ID。
> 入参限制：启用时需填写，长度为 1–128 字符。
> 空字符串表示移除 Session Space 配置。仅需提供 SessionSpaceId，后台自动获取和维护临时凭据。

Verdict: "太长了," at most ten characters or so:

> 用于持久化会话的 Session Space ID

## Ticket for another team

The request was a 技术需求 for a colleague with no background: "平铺直叙，不要写得对方已经了解上下文一样，也不要防御性措辞." A later version was plain text run together, and the verdict was "用 markdown 呀，现在感觉文字都挤在一起了." A ticket that works:

```markdown
## 背景
<当前行为与它带来的问题，用事实陈述，读者无需了解前情>

## 目标
<要支持的能力，一两句>

## 范围
- <要做的项>

## 验收
- <可检查的结果>
```

## Report the user must act on

A startup-latency report listed every step in one table and a long narrative. Verdicts: "格式专业一点啊，我看不懂哪里耗时有异常了，要按大类、小类分细致" and then "写得太详细了，你要分成 2 个文档，一个文档写明白给我看（纯表格描述清楚），一个文档保存详细分析数据."

The summary document is tables grouped by owner, then step, with the anomaly called out in its own column:

| 归属 | 步骤 | 中位数 | 异常 |
| --- | --- | ---: | --- |
| Harness 容器侧 | Node 启动到监听 | 544 ms | |
| Harness 容器侧 | 运行时加载 | 1232 ms | 导入 Pi SDK 阻塞事件循环 |
| Cube 侧 | 加载完成后探测命中 | 435 ms | |

The second document keeps per-run data and method, linked from the summary.

## Status summary written as a diary

A weekly progress summary went day by day with exact dates. Verdict: "有点流水账，不要太明确日期." Organize by capability: what progressed, where it stands, what remains, with the period stated once at the top.
