# 全链路知识与行业地图持续维护

这是每日自动化的必要步骤。配置取自 `site/data/operations.json`，知识修订以 `site/data/knowledge.json` 为唯一依据；页面将已复核字段覆盖在初始框架上，旧字段和修改历史保留。不要直接改初始文件来绕过修订记录。

## 每日与周期工作

1. 每日中文整理、岗位研究之后运行 `python3 scripts/knowledge.py prepare`。读取被忽略的 `work/editorial/knowledge-queue.json`；新实践或来源/内容变化会重新进入候选，重复构建不会制造新知识。
2. 检查所有 pendingCandidates。优先国内企业的采购、制造、质量、销售、售后与组织实践。决定 integrated 或 hold，写明可迁移价值、限制或缺失证据。暂缓记录不丢失，每 7 天随节点复核重审 heldCandidates。
3. 每日轮换至少 3 个不同节点，至少包含一个 chain 和一个 track，优先最久未完整复核的节点。正常周期内 7 天覆盖 8 个链路环节和 6 个领域。初始接入日起有一个 7 天的首轮窗口；尚未复核和部分复核状态始终展示，不能把这个窗口称为全部内容已验证。
4. 逐字段复核：全链路检查知识主题、交付链路、基础概念、团队接口、指标口径、误读与学习任务；行业地图检查主题、观察对象、价值链、关键约束、团队与指标。查看原始正文及适用版本。法规、标准和参数须核对当前官方资料。索引或缓存只支撑其实际覆盖内容；失败保留历史。
5. 从实际案例提炼 learning、application、boundary；不要只堆链接。来源只证明企业披露或职位要求，不能自动证明实施、成效、行业普遍性或“最优”。无结果数据可形成检查问题，不能推广成行业规范。字段更新附来源和修改前后值，指标没有可靠定义就保留待核验。
6. status=reviewed 需要当前可读正文、全部字段已检查且无未解决的复核缺口；partial 只能标记实际检查字段并列出 gaps；error 不得改知识内容。全部字段复核日期决定 7 天期限；部分复核不能延期。日期不是正确性的证明，仍需逐条内容判断。
7. 无实质变化时保留内容 updatedAt，只推进实际 reviewedAt；来源访问失败保留上次有效复核时间并显示最新受阻记录。新实践、字段改变和修订记录均由程序保留。不要每次换一种说法制造更新。
8. 运行发布、校验、测试和构建；推送并等待 Pages 成功，回读线上 knowledge.json，打开两页检查内容、日期与依据。晚间同时检查 health.needsKnowledge；正文日报已完成也不能跳过缺失的知识任务。

## Bundle

本地文件 `work/editorial/knowledge-bundle.json`，不提交。输入包含 `reviews` 与 `decisions`。

每项 review：
- `nodeId`：chain-1…chain-8 或 track-0…track-5。
- `status`：reviewed / partial / error。
- `reviewedFields`：本轮实际复核字段名，见 scripts/knowledge.py 的 FIELDS。
- `assessment`、`gaps`：本次判断及尚未解决的问题。
- `itemIds`：intelligence.json 中通过精选且含实践记录的条目；新原始证据先走正文、事实锚点和筛选流程，不用未读链接作知识依据。
- `sourceChecks`：每项含 itemId、url、checkedAt、state（body/index/cached/error）、note。URL 必须匹配该证据来源，检查时间为当天实际检查时间。cached 是重新核对缓存，不能冒充重新访问原文。
- `patch`：只包含实际改变的字段，字段必须在 reviewedFields 中。保留未受影响的逻辑。程序记录 before/after。
- `lessons`：每项有稳定 id、title、learning、application、boundary、itemIds；同一知识补充复用 id，避免重复。适用条件写在 application，证据边界写在 boundary。

每项 decision：`itemId`、`decision`（integrated/hold）、`reason`。新候选必须全部处置；integrated 必须绑定本轮某条 lesson。候选内容哈希变化会触发再检查，hold 不意味着信息无效。

```sh
python3 scripts/knowledge.py prepare
python3 scripts/knowledge.py publish --bundle work/editorial/knowledge-bundle.json
python3 scripts/knowledge.py validate
python3 -m unittest discover -s tests -q
node --check site/app.js
python3 scripts/build.py
python3 scripts/health.py
```

知识修订按真实日期记录，不将常青资料和旧案例重新包装为当天新闻。页面保留初始参考资料，新增知识在卡片中标注更新时间、复核范围、原始来源及修订历史。不要声称当前框架已全面核验，除非节点的全部字段确已完成本轮复核。
