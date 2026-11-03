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

## Product copy

A customer-facing CAPI description:

> AK；启用时由服务校验必填、非空白且不含 NUL。

Verdict: "你别在 capi 的 description 里面写什么服务端校验吧？……这个是给客户看的啊." State the rule the customer must follow:

> 腾讯云访问密钥 ID（AK）。启用 Session Space 时需与 SecretKey 同时填写，不能为空白或包含 NUL。

The ten-character limit above then applies on top.

Quick start help text that explained the mechanism:

> 仅挂载已勾选的能力，最多 32 个 Skill 和 16 个 MCP Server。Skill 在实例启动时从 Git 的固定 commit 获取；MCP Server 的凭据直接送入实例，不在查询结果中返回。

Verdict: "这种说明性文档，涉及具体实现的，都去掉." The same page had a step subtitle 都可以跳过，之后通过修改配置补充 and a 下一步 card, both judged unnecessary, and "quick start 要有专业性." Keep the limit the user must respect and drop the rest.

Harness cards introduced each project by its features. Verdict: "每个 harness 的简短介绍应当从他们本身的 github 仓库中来，而不是特性." The card now carries the project's own definition, translated:

> 可在任意环境运行、从多种入口访问的 Agent Harness：支持无限长的对话，能从内外部的严重故障中恢复，并允许多人共同引导同一组 Agent。

An article title, 如何设计一套 Agent 底座，让 DeepSeek Harness 跑得更经济、更省心？, drew two objections: it did not lead with DeepSeek Harness, and it "天然把 dsh 放到生产可用的服务角色了" while the project was a developer preview. Narration for a deployment demo was judged "语气太居高临下了" and reminded that "这就是一段演示视频，不是生产可用的." Name the subject first and describe what the demo shows.

## Research report

A study of an upstream project ended in a list of borrowable items; the user accepted most and struck one with "这个不需要." Numbered, independent recommendations let the reader decide item by item.

A study of credential injection drifted to the agent's own redesign. Verdict: "这个跟凭证注入没太大关系了." Another rested on a stale local checkout: "你更新下本地的." Answer the question asked, from current primary sources.

## Code review findings

Three reviews ended in the same requests: "格式按照 [标题] - 代码路径：相对仓库根目录的路径 - 现象： - 推荐修复方向：", "改成 markdown 格式，且代码路径改成相对路径", and, after a plain-text list, "？给我 markdown 就行." Follow-ups asked "都是本次变更引入的吗" and "其它没有存量风险了吗", which the 来源 line answers up front.

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
