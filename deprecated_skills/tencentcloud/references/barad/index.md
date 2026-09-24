# Barad / 巴拉多 / 云监控

## Scope and terminology

Use this topic for Barad metrics, reporting, queries, alarms, Dashboard integration, onboarding, releases, and troubleshooting.

- **Barad / 巴拉多** refer to the same internal monitoring platform: [3.barad-巴拉多运维平台](https://iwiki.woa.com/p/4016412445) explicitly pairs the names.
- **云监控** is the related Tencent Cloud monitoring product context. [Barad 自助接入介绍](https://iwiki.woa.com/p/499358182) describes the onboarding system as managing and standardizing the data sources for 云监控. Distinguish internal Barad operations, product onboarding, and public monitoring APIs rather than treating their interfaces as interchangeable.
- The authoritative internal entry is the [Barad自助接入系统 space](https://iwiki.woa.com/space/BaradAdminSystem), space ID `110100507`, homepage ID `109615605`. The homepage contains a generic space template; navigate its children for actual documentation.

## Select the source

Identify the cloud product, environment (public cloud, TCS, or TCE), version, region, namespace/view, and whether the question concerns reporting, querying, visualization, or alarms. Ask only for missing details that change the answer.

The following is a targeted navigation index, checked on 2026-09-07, not a complete space mirror. Read the relevant source before using its procedures.

| Question | Source |
| --- | --- |
| Concepts: namespace, view, dimensions, base/API/alarm metrics | [基础概念](https://iwiki.woa.com/p/4023365034) |
| Metric reporting and aggregation | [1-接入流程之指标篇](https://iwiki.woa.com/p/4023381443); underlying procedure: [接入基础指标/API指标](https://iwiki.woa.com/p/112005565) |
| API mappings, query dimensions, GetMonitorData, DescribeBaseMetrics | [2-指标流程之查询篇](https://iwiki.woa.com/p/4023398400); protocol source: [拉取云监控数据api文档](https://iwiki.woa.com/p/4008503796) |
| Alarm policies, callbacks, preset/default alarms | [接入告警策略](https://iwiki.woa.com/p/112005604); browse [操作指引](https://iwiki.woa.com/p/290624699) for the applicable alarm branch |
| Existing onboarding workflow, prerequisites, system address | [Barad 自助接入流程](https://iwiki.woa.com/p/290624625), then its relevant child under [操作指引](https://iwiki.woa.com/p/290624699) |
| New public-cloud onboarding and release system | [新接入公有云](https://iwiki.woa.com/p/4014308378), then [发布系统](https://iwiki.woa.com/p/4016687149) |
| TCS onboarding and version-specific configuration | [新接入TCS235](https://iwiki.woa.com/p/4012697729); [Barad 2024 新接入指引](https://iwiki.woa.com/p/4009525654) is historical context |
| TCE monitoring integration | [TCE接入监控指标](https://iwiki.woa.com/p/4010838734), [TCE 接入告警策略](https://iwiki.woa.com/p/4009237696) |
| Dashboard and instance monitoring UI | [创建云产品预设dashboard面板](https://iwiki.woa.com/p/4006722236), [云产品接入实例监控页面](https://iwiki.woa.com/p/4009023681) |
| Missing data, reporting errors, general onboarding failures | [barad接入常见问题](https://iwiki.woa.com/p/4008857760), [barad常见上报错误](https://iwiki.woa.com/p/4015478100) |
| Release validation and metric retirement | [接入发布Checklist](https://iwiki.woa.com/p/576817100), [云产品监控系统发布管理规则（细节添加）](https://iwiki.woa.com/p/4016687960), [指标下线流程](https://iwiki.woa.com/p/4007032913) |

## Retrieval and interpretation

Use `iwiki-doc` and its `iwiki-cli` workflow:

```sh
iwiki-cli tree --space BaradAdminSystem
iwiki-cli tree --parent 290624699
iwiki-cli search "关键词" --space-keys BaradAdminSystem --limit 5
iwiki-cli metadata <docid>
iwiki-cli get <docid>
```

- The knowledge pages are summaries. Follow their underlying procedure when deciding an exact field, restriction, or operation; a title or search snippet alone does not establish a rule.
- Check current source content and update time for endpoints, permissions, contacts, approvals, supported environments, release behavior, quotas, and retention periods. The 2024 guide describes a then-TCS-only rollout; do not turn that historical statement into a current restriction on public cloud.
- Distinguish internal namespace/base metric names from externally mapped V3 namespace/metric names. The query summary mixes lowercase naming advice with V3 PascalCase advice; use the protocol source and the target product's public API contract to resolve the applicable field. Do not copy one naming rule across all layers.
- Internal query addresses in the protocol source are explicitly restricted to the self-developed network environment. For customer-facing API calls, follow the current public documentation linked from that source.
- For missing or inconsistent data, compare environment/region, namespace/view, dimensions and mappings, reporting timestamps, aggregation period/type, and release state at the reporting, API, Dashboard, and alarm layers. A base metric being present does not alone establish that API mapping or alarm configuration is complete.
- Source titles mark some alarm procedures as deprecated or closed to new integrations. Select their supported successors from the operation tree; do not infer support from an old document's continued existence.
- Cite the specific iWiki page used. If current sources are inaccessible or disagree, state what could not be verified; do not present this index as current operational truth. Apply the parent skill's authorization and sensitive-data boundaries.
