# 硬件观测 / Hardware Atlas

[打开情报中心](https://jordanfu.github.io/hardware-intelligence/) · [发布记录](https://github.com/JordanFu/hardware-intelligence/actions)

面向智能硬件产销研全链路的中文研究站：需求、研发、供应链、制造、质量、渠道、服务、经营与组织。独立实现，参考 [AI HOT 的筛选、去重与日报方法](https://github.com/KKKKhazix/AIHOT/blob/main/docs/selection.md)，没有复制其代码、数据库或品牌。

## 阅读入口

- 中文精选：先读文章核心 brief，再展开事实、原标题、来源和证据边界。
- 每日情报：按事件去重的历史日报，保留扫描失败和覆盖空白。
- 全链路知识：八个环节的基础、团队接口、指标口径、小任务与来源案例。
- 实践观察：已披露方法、适用条件、结果证据和下一步核验，不做无依据的“最优”排名。
- 组织实验室：持续更新的组织机制线索，以及带年份的历史案例。
- 岗位与人才：公司、岗位族、职责、协作对象、时间与版本变化；用于人员决策研究，不将职位数等同人员缺口。
- 动态雷达、产品领域地图、七步入门、收藏/笔记/导出继续可用。

## 自动更新

每天按北京时间执行两层更新，时间与覆盖要求统一保存在 `site/data/operations.json`：

| 时间 | 执行环境 | 内容 |
| --- | --- | --- |
| 08:17、18:17 | GitHub Actions 云端 | RSS 发现、来源健康记录、内容新鲜度报告与站点发布 |
| 08:40 | 本地 Codex | 正文阅读、中文 brief、国内公司、产销研实践、组织与岗位研究、日报、核验发布 |
| 18:40 | 本地 Codex | 检查当天覆盖和线上发布；未完成则补跑，已完成则不重复出日报 |

Codex 执行[整理规则](docs/editorial-runbook.md)，使用现有模型，无需额外 API Key；电脑和 Codex 必须可用。调度可能延迟，页面显示真实扫描日期、失败来源和未完成状态，不能用部署成功代替内容更新。每轮至少实际查阅 3 家国内公司、2 个非研发环节、2 家官方招聘来源，轮换覆盖目录。日报每天保留扫描结果，无合格新增内容不凑数。

普通正文不可读时保留待摘要，不根据标题编写内容。初筛五维评分后逐条复核；这不是独立双模型评分。官方门槛 70、媒体 80，hold/reject 不入精选。同事件官方代表优先，同发布方只计一次。日报最多 8 条、同发布方最多 2 条，近 7 期重复进展排除；再入选须有实质新官方行动。首期回补近 14 天并标明，随后优先 72 小时；同日重跑不改已出日报。

招聘：首轮建立基线，后续保留职责版本与字段前后差异。完整列表成功检查的未见只标可见性变化；明确关闭需原文证明。搜索索引、旧版无日期页面与实时正文分开；不推断扩编、裁撤、实际人数或行业缺口。

## 本地运行与数据

Python 3.11+ 与 Node 22；无前端构建依赖。

```sh
python3 scripts/collect.py
python3 scripts/editorial.py prepare
# Codex 按运行规则读取原文并生成本地 bundle
python3 scripts/editorial.py publish --bundle work/editorial/bundle.json
python3 scripts/recruitment.py --bundle work/editorial/jobs-bundle.json
python3 -m unittest discover -s tests -v
node --check site/app.js
python3 scripts/build.py
python3 -m http.server 8765 --directory dist
```

- `site/data/intelligence.json`：中文 brief、事件、评分、事实位置、组织/实践、运行覆盖。
- `daily.json`：持久化日报；`digests.json` 仅在构建时生成 RSS 按日索引，二者不同。
- `recruitment.json`：公开岗位样本、可见性、职责版本、字段差异与扫描状态。
- `industry.json`：13 家国内观察对象、八个环节、筛选口径；`valuechain.json`：学习框架。
- `radar.json`：发现历史；`curated.json` / `organizations.json`：初始研究与历史案例。
- `operations.json`：计划时间和覆盖下限；构建生成的 `data/health.json` 分别报告 RSS、正文、招聘和日报状态，附对应 Actions 链接。
- `work/`：忽略的本地原文和中间材料，不进入 Git 或站点。
- `dist/`：仅静态公开页面与摘要；精选 RSS 按代表事件生成。

事实锚点检查仅证明短语出现在所读材料中，不能自动证明整条摘要真实；需 Codex 的逐条内容复核。官方披露与独立验证不同，组织/经营效果不足时保留未知。初始样本偏向拓竹；国内公司、招聘和全链路覆盖会按轮次扩充，目录不等于已经完整扫描。

无私有数据、无候选人信息、无员工监控。收藏和笔记只存浏览器，导出可备份；无账号、跨设备同步或实时问答。本站代码采用 MIT 许可；外部文章仍归原作者，只提供独立摘要与来源。
