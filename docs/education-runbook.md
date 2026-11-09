# 学习硬件持续研究

这是现有 automation-4 每日 08:40 完整整理、18:40 补跑的一部分，不新增模型或 API Key。页面入口 `#education`，档案与复核记录以 `site/data/education.json` 为准。五个品类固定为学习机 tablet、儿童手表 watch、阅读器 reader、词典笔 pen、AI录音设备 recorder。Xnote 只是对照参考，未取得指定型号的公开资料前不填参数、归属或优劣结论。

## 每日步骤

1. 在现有日报和招聘流程中增加学习硬件扫描；每天至少实际查阅作业帮、科大讯飞、猿辅导（小猿）中的两家。先执行 `python3 scripts/education.py prepare`，按 `work/editorial/education-queue.json` 的逾期档案和未覆盖品类安排工作；读取 `education.json` 保留上一轮未知项。不能仅扫描产品发布，轮换内容教研、采购制造、质量、渠道、服务和经营岗位。原有全行业三家国内公司、两环节、两家官方招聘的底线保持。
2. 每 7 天至少复核全部十份初始品类档案和五个品类；新增档案纳入同一规则。新增岗位每周检查有独立到期检查；初始接入7天内完成首轮，此后按最近7天的实际招聘正文记录计算，失败不计覆盖。国内阅读器优先补掌阅、文石的公开资料；AI录音设备持续查钉钉、讯飞等的设备和配套软件。海外 Amazon、LeapFrog 每周复核一次。每周至少查阅两家核心公司的官方招聘，读取职责正文后才形成该业务岗位观察。无法识别教育业务归属的岗位不强行归类。
3. 新事件仍走 `editorial.py` 的原文、事实锚点、两遍筛选、事件与进展去重、日报机制。条目可增加 `educationCategories` 数组，取上述五个 ID；招聘 observation 也支持同字段，必须有正文支持业务归属。只凭“华为”“Amazon”名字不得把全公司信息混入。页面自动汇入符合范围的入选中文 brief 和岗位；历史产品页、服务页不冒充今日新闻。
4. 逐品类比较具体任务，而非功能数量：学习机看诊断到反馈；手表看儿童与家庭协同；阅读器看内容获取到阅读整理；词典笔看查词到巩固；录音看采集、转写、证据可追溯整理、检索导出与行动。区分硬件与配套 App、型号、地区、系统版本及收费权益。实际提分、效率、组织成效需要可比结果，不能拿宣传口径或岗位数量替代。
5. 阅读公开正文后写 `work/editorial/education-bundle.json`，运行 `python3 scripts/education.py publish`。没有新增事件仍写本日实际扫描结论；档案没变化不改写。失败写 error/index，保留历史及待核验项，不推进有效复核或内容时间。对照维度和未知项需要真正复核，不能只刷新链接。
6. 新的可迁移实践仍进入全站 knowledge prepare/publish 流程，在现有全链路或行业节点沉淀；本页档案不能替代全站知识维护。每天跑 `education.py validate`、原有测试、构建和 health。晚间还须 `needsEducation=false` 才能结束为健康检查；任何品类未覆盖、档案逾期、核心公司当日正文不足都要补跑。知识与日报已经完成不能跳过本项。
7. 发布沿用现有 GitHub Pages 流程，线上比对 `data/education.json`、`data/health.json` 和页面五品类、公司筛选、来源与复核日期。记录失败时保留当前可用页面，不能承诺绝对准确或准时。

## Bundle 契约

`summary` 是本轮扫描结论；`checks` 每项有 company、url、name、state（body/excerpt/index/error）、checkedAt、categoryIds、note；招聘来源额外标记 purpose: recruitment。body/excerpt 额外给 readId，对应被忽略的 `work/editorial/<readId>.json`：url、text、bodyStatus、readAt。必须为当天实际查阅；缓存不能冒充新检查。正文片段保留原位置与覆盖边界。

`newProfiles` 可选：新增档案的 id、company、tier、categoryIds、aliases；同一 bundle 必须提供带事实与来源的 review，缺证据不发布空档案。已有档案不得用新 ID 重复建档。

`reviews` 每项有 profileId、status（reviewed/error）、assessment、patch。reviewed 表示**对这份资料档案做了复核**，不表示企业成效或所有未知项已验证。error 不允许改内容。patch 只改实际变化的 brief、dimensions、boundary、gaps、categoryIds、sources、facts；字段变更必须同时附完整 sources 和 facts。sources：id、readId、title、url、publishedAt（无日期为 null）、role（official/developer/media）。facts：sourceId、claim、anchor（实际正文连续短语，至少6字符）、locator。程序校验锚点后不公开原文，只保留哈希和来源。

brief 为 lead 与 2–4 条 points。dimensions 固定 product/content/channel/delivery/organization。facts 为公开事实，dimensions 内研究问题明确以“研究问题”开头。缺失资料写待核验，不填猜测。新机型不要覆盖不兼容旧机型；另建稳定 profileId，并保留旧档案。

`updatedAt` 仅实质改内容时推进；`reviewedAt` 仅有当前可用正文时推进。纯日期/哈希变化不算内容变化。history 保留每次实际复核、判断、字段 before/after；runs 保留各次来源失败。首次建档也留记录。公开数据禁止完整原文、个人评论、私人路径和凭据。

```sh
python3 scripts/education.py prepare
python3 scripts/education.py publish --bundle work/editorial/education-bundle.json
python3 scripts/education.py validate
python3 -m unittest discover -s tests -q
node --test tests/education.test.mjs
node --check site/app.js
python3 scripts/build.py
python3 scripts/health.py
```
