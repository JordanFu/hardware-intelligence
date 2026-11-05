# 硬件观测 · Hardware Atlas

一个帮助你理解智能硬件产业、产品变化和组织协作的中文情报中心。

**在线访问：https://jordanfu.github.io/hardware-intelligence/**

## 可以做什么

- **编辑精选**：先读产品变化，再看事实、解读、证据边界和下一步问题。
- **动态雷达**：6 个 RSS 信源每日采集，按领域、来源等级和原文发布日期筛选；自动条目一律标为待核验。
- **行业地图**：6 个领域的价值链、约束、团队专业组合和观察指标。
- **组织实验室**：Apple、拓竹、Meta × EssilorLuxottica、NVIDIA 生态案例，公开事实与研究推论分离。
- **七步入门**：每一步给出阅读、行动与学习产出；完成状态可撤销。
- **我的收藏**：收藏、研究笔记、学习进度在浏览器本地保存；支持 JSON 导出与合并导入。
- **信源与方法**：显示采集成功/失败、最近成功时间、分类与筛选规则。

无账号、无数据库、无付费模型调用、无第三方跟踪脚本。初始内容为真实公开材料的独立整理，不是演示新闻。

## 更新方式与边界

GitHub Actions 每天计划 **北京时间 08:17** 运行（平台调度可能延迟），也可在 Actions 手动 `Run workflow`。采集后校验、提交历史数据并部署 Pages。GitHub 可能暂停长期无活动的公共仓库计划任务；页面显示最近成功时间，超过 36 小时会警示。

- 动态只自动采集标题、发布时间与链接；不转载正文，不自动写中文研判。
- 编辑精选、组织案例、学习材料属于版本化编辑内容；**不会因 RSS 更新自动刷新**。超过 7 天未整理时首页提示。
- 6 个自动源：NVIDIA、Samsung、Meta、Bambu Lab、CNX Software、IT之家。DJI、CSA、Apple/HBR 是编辑参考源，不声称自动抓取。
- 标题关键词分类可能漏收或误收；RSS 通常只提供最近若干条，因此不是全网覆盖。中文原始源目前主要为 IT之家，国内组织研究覆盖仍有限。
- 自动流保留最近 90 天、最多 400 条，按 URL 去重。相似标题不自动合并，不将多篇转载声称为独立交叉核验。
- 采集失败保留已有历史并写明错误；所有源失败也不清空数据。每日索引按源发布时间（北京时间）生成，不是模型研判日报。
- 收藏是当前数据的 ID 引用。自动条目超出保留窗口后会提示不再可读，备份仍保留标识与笔记。

## 本地运行

需要 Python 3.10+、curl，Node 22 用于 JavaScript 语法检查。无 npm 运行依赖。

```sh
python3 scripts/collect.py
python3 -m unittest discover -s tests -v
node --check site/app.js
python3 scripts/build.py
python3 -m http.server 4173 --directory dist
```

打开 http://localhost:4173 。构建输出 `dist/` 不进 Git，源文件在 `site/`。

## 内容维护

| 文件 | 用途 |
| --- | --- |
| `site/data/curated.json` | 编辑精选；填写事实、解读、边界、来源和整理日期 |
| `site/data/organizations.json` | 组织案例；需保留资料年份、未知项和适用条件 |
| `site/data/landscape.json` | 行业学习框架 |
| `site/data/learning.json` | 七步学习任务 |
| `site/data/sources.json` | 信源目录及自动采集开关 |
| `site/data/radar.json` | 自动采集的持久历史与健康状态 |
| `scripts/collect.py` | 关键词范围、时间门槛和链接去重 |
| `scripts/build.py` | 发布产物、每日索引、RSS 和 llms.txt |

新增一条精选时先打开来源核对：事件日期、发布日期、主体、行为、适用范围。内容字段使用纯文本，页面统一转义。详情中不复制全文。修改后运行检查并 push 到 `main`，Pages 工作流会发布。不要只改 `reviewedAt` 来伪造内容新鲜度。

## 部署

仓库 Settings → Pages → Source 为 **GitHub Actions**。工作流在 `.github/workflows/publish.yml`，使用仓库自带的 `GITHUB_TOKEN`；不需要额外 API Key。只发布 `dist/`，不发布脚本、私有配置或原始抓取正文。收藏与笔记绝不进入构建或仓库。

回滚页面：将有问题的源码提交 revert 后 push，或在 GitHub 上恢复所需版本再手动执行工作流。不要 force push 采集历史。

## 与 AI HOT 的关系

参考 [AI HOT](https://github.com/KKKKhazix/AIHOT) 的介绍、[架构](https://github.com/KKKKhazix/AIHOT/blob/main/docs/architecture.md)及[行业定制方法](https://github.com/KKKKhazix/AIHOT/blob/main/docs/customize.md)，采用公开信源分级、去重、精选和来源可追溯的思路。

这是**独立实现**，没有 fork 或复制 AI HOT 的引擎代码、商标、Logo、字体或运营数据。上游完整方案包含 Node 24、PostgreSQL、常驻 API/worker/web 进程与模型调用，GitHub Pages 不能直接运行，因此本项目按用户的“参考介绍、全新 GitHub 页面”要求采用静态架构。未实现上游的双评分、语义聚簇、全文翻译、后台管理或 MCP 服务；公开 JSON 与 `llms.txt` 可以供 Agent 读取。

未来如需要模型双评、跨语言聚簇或自动中文日报，需要独立的预算、模型凭据与效果校准；不能把现有关键词筛选称为智能研判。

## 许可与来源

项目原创代码使用 MIT 许可证。外部资料、品牌及第三方文章版权归其原权利人；仅做短摘要与链接引用，不包含外部文章全文。Apple/HBR PDF 只链接，不存储或转载。AI HOT 品牌不属于本项目。
