const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
};
const link = (url, label, cls = "") =>
  `<a class="${cls}" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const STORE = "hardware-atlas-v1";
let local = { saved: [], completed: [], notes: {} },
  storageOK = true;
try {
  const v = JSON.parse(localStorage.getItem(STORE) || "null");
  if (
    v &&
    Array.isArray(v.saved) &&
    Array.isArray(v.completed) &&
    v.notes &&
    typeof v.notes === "object"
  )
    local = v;
} catch {
  storageOK = false;
}
let db,
  route = "briefing",
  category = "全部",
  radarDay = "全部",
  tier = "全部",
  limit = 30,
  query = "",
  focusBeforeDialog = null;
const navs = [
  ["briefing", "编辑精选", "◫"],
  ["radar", "动态雷达", "◎"],
  ["landscape", "行业地图", "▦"],
  ["organizations", "组织实验室", "◇"],
  ["learning", "七步入门", "↗"],
  ["saved", "我的收藏", "☆"],
  ["sources", "信源与方法", "≋"],
];
const categories = [
  "全部",
  "可穿戴与眼镜",
  "机器人与无人机",
  "智能家居",
  "端侧 AI 与芯片",
  "制造与创作",
  "产品工程与量产",
];
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(local));
    return true;
  } catch {
    storageOK = false;
    toast("浏览器存储不可用，本次操作仅保留在当前页面。请导出备份。");
    return false;
  }
}
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function date(value, time = false) {
  if (!value) return "尚无成功记录";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
function day(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function itemById(id) {
  return [
    ...db.curated.items,
    ...db.organizations,
    ...db.radar.items,
    ...db.landscape,
    ...db.learning,
  ].find((x) => x.id === id);
}
function isSaved(id) {
  return local.saved.includes(id);
}
function saveButton(id, text = false) {
  return `<button class="save-button ${isSaved(id) ? "saved" : ""}" data-save="${esc(id)}" aria-label="${isSaved(id) ? "取消收藏" : "收藏"}" aria-pressed="${isSaved(id)}">${text ? (isSaved(id) ? "★ 已收藏" : "☆ 收藏") : isSaved(id) ? "★" : "☆"}</button>`;
}
function head(kicker, title, intro) {
  return `<div class="page-head"><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p class="intro">${esc(intro)}</p></div>`;
}
function empty(title, body, action = "") {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(body)}</p>${action}</div>`;
}
function chips() {
  return `<div class="chip-row" aria-label="按领域筛选">${categories.map((c) => `<button data-category="${esc(c)}" class="chip ${category === c ? "active" : ""}" aria-pressed="${category === c}">${esc(c)}</button>`).join("")}</div>`;
}
function nav() {
  $("#nav").innerHTML = navs
    .map(
      ([id, name, icon]) =>
        `<a class="nav-item ${route === id ? "active" : ""}" href="#${id}" ${route === id ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span>${name}${id === "saved" ? `<span class="nav-count">${local.saved.length}</span>` : ""}</a>`,
    )
    .join("");
  $("#breadcrumb").textContent = query
    ? "全站搜索"
    : navs.find((n) => n[0] === route)?.[1] || "编辑精选";
}
function newsRow(n, index = 0) {
  const rss = !!n.sourceId;
  return `<article class="news-row"><span class="news-number">${String(index + 1).padStart(2, "0")}</span><div><div class="meta"><span class="tag">${esc(n.category)}</span><span>${esc(rss ? n.tier : n.kind)}</span>${rss ? '<span class="tag amber">待核验</span>' : ""}<time>${esc(date(n.date))}</time></div><button class="title-button" data-detail="${esc(n.id)}">${esc(n.title)}</button>${n.summary ? `<p>${esc(n.summary)}</p>` : ""}<div class="row-bottom"><span>${esc(rss ? n.source : n.sources.map((s) => s.name).join(" / "))}</span><button class="text-link" data-detail="${esc(n.id)}">${rss ? "查看来源与核验提示" : "事实 · 解读 · 边界"} ↗</button></div></div>${saveButton(n.id)}</article>`;
}
function freshness() {
  const hours =
    (Date.now() - new Date(db.radar.lastSuccessfulAt || 0).getTime()) / 36e5;
  const failed = db.radar.health.filter((h) => h.state !== "ok").length;
  return { hours, failed, total: db.sources.filter((s) => s.auto).length };
}
function briefing() {
  const lead = db.curated.items[0],
    items = db.curated.items.filter(
      (n) => category === "全部" || n.category === category,
    ),
    f = freshness();
  const old =
    (Date.now() - new Date(db.curated.reviewedAt).getTime()) / 864e5 > 7;
  return `<div class="page-head"><div class="heading-line"><div class="eyebrow">THE HARDWARE BRIEF</div><span class="date-label">精选整理于 ${esc(date(db.curated.reviewedAt))}</span></div><h1 class="home-title"><span>读懂硬件，</span><span>也读懂背后的团队。</span></h1><p class="intro">从一条产品变化，建立一份行业理解。每天十分钟，逐步补齐你的知识地图。</p><div class="status-line"><span class="${f.hours > 36 || f.failed ? "warn" : "healthy"}">${f.total - f.failed} / ${f.total} 自动信源最近抓取成功</span><span>最近检查 ${esc(date(db.radar.checkedAt, true))}</span><a href="#sources">查看更新状态 ↗</a></div></div>${old ? '<div class="notice warning">精选资料已超过 7 天未整理；最新自动发现请查看「动态雷达」，不要将旧精选视为今日新闻。</div>' : ""}${f.hours > 36 ? '<div class="notice warning">自动信源已超过 36 小时没有成功记录，当前展示历史缓存。请查看信源状态与运行记录。</div>' : ""}<div class="layout"><section><article class="lead-card"><div class="lead-meta"><span>本期重点</span><span> / </span><span>${esc(lead.category)}</span></div><h2>${esc(lead.title)}</h2><p>${esc(lead.summary)}</p><div class="lead-bottom"><span class="small">${esc(lead.sources[0].name)} · ${esc(date(lead.date))}</span><button class="primary" data-detail="${lead.id}">阅读完整情报 <span>↗</span></button></div></article><div class="section-head"><h2>值得理解的变化</h2><a href="#radar">自动动态 ${db.radar.items.length} 条 ↗</a></div>${chips()}<div class="news-list">${items.length ? items.map(newsRow).join("") : empty("这个领域暂时没有编辑精选", "可到动态雷达查找新线索，或先从行业地图开始。", '<a class="secondary" href="#landscape">打开行业地图 ↗</a>')}</div><div class="lower-banner"><div><h3>先有地图，再追热点。</h3><p>沿着 6 个观察领域，理解产业链、团队分工与关键指标。</p></div><a href="#landscape" class="secondary">展开行业地图 ↗</a></div></section><aside class="right-rail"><section class="side-card"><div class="tiny-label">YOUR DAILY ROUTINE</div><h2 style="margin-top:12px">今天，给行业 10 分钟</h2><div class="reading-step"><span class="step-minute">3 分</span><div><strong>理解一个产品变化</strong><small>先读事实，再看为什么值得关注</small></div></div><div class="reading-step"><span class="step-minute">4 分</span><div><strong>拆解一种团队机制</strong><small>看谁决策、如何协作、如何验证</small></div></div><div class="reading-step"><span class="step-minute">3 分</span><div><strong>留下一条自己的判断</strong><small>收藏情报，记下待验证的问题</small></div></div><a href="#learning" class="primary">从七步入门开始 ↗</a></section><section class="side-card question-card"><div class="tiny-label">本期研究问题</div><blockquote>当硬件、算法与软件发生冲突，谁对最终体验负责？</blockquote><p>从 Apple 的职能组织与拓竹的早期架构协作寻找线索。</p><a class="onboarding-link" href="#organizations">进入组织实验室 ↗</a></section><section class="side-card"><h2>组织观察对象</h2>${db.organizations
    .slice(0, 3)
    .map(
      (o, i) =>
        `<a class="mini-company" href="#org/${o.id}"><span class="company-monogram">${["A", "B", "M"][i]}</span><div><strong>${esc(o.name)}</strong><small>${esc(o.label)} · ${esc(o.period.split(" · ")[1])}</small></div><span>↗</span></a>`,
    )
    .join(
      "",
    )}<hr class="thin-rule"><p>观察对象不是优秀程度排名。每个案例都保留证据不足的部分。</p></section></aside></div>`;
}
function radar() {
  let items = db.radar.items.filter(
    (n) =>
      (category === "全部" || n.category === category) &&
      (tier === "全部" || n.tier === tier) &&
      (radarDay === "全部" || day(n.date) === radarDay),
  );
  const dates = db.digests.dates;
  const f = freshness();
  return (
    head(
      "SIGNALS & SOURCES",
      "动态雷达",
      "公开信源的自动发现，按原文发布时间排列。先找到线索，再回到原文核验。",
    ) +
    `<div class="notice ${f.failed || f.hours > 36 ? "warning" : ""}">${f.failed ? `${f.failed} 个信源本次抓取失败，保留已有历史。` : "最近一轮所有自动信源抓取成功。"} 最近检查：${esc(date(db.radar.checkedAt, true))}。${f.hours > 36 ? "数据已超过 36 小时未成功更新。" : ""} 自动条目未经编辑核验，保留来源原标题；分类由关键词规则生成。</div>${chips()}<div class="toolbar"><label for="radar-date">每日索引</label><select id="radar-date"><option value="全部">全部日期</option>${dates.map((d) => `<option value="${d.date}" ${radarDay === d.date ? "selected" : ""}>${d.date} · ${d.ids.length} 条</option>`).join("")}</select><select id="radar-tier" aria-label="信源级别">${["全部", "官方一手", "媒体补充"].map((t) => `<option ${tier === t ? "selected" : ""}>${t}</option>`).join("")}</select><span class="count-label">共 ${items.length} 条 · 每日索引按北京时间</span></div><div class="news-list">${items.length ? items.slice(0, limit).map(newsRow).join("") : empty("当前筛选下没有条目", "这表示当前已收录数据没有匹配结果，不代表行业没有新动态。")}</div>${items.length > limit ? '<button class="secondary load-more" data-more>再显示 30 条</button>' : ""}<p class="small" style="margin-top:18px">保留最近 90 天，最多 400 条自动条目。同一链接去重；相似报道不会自动声称为同一事件或独立交叉核验。</p>`
  );
}
function landscape() {
  return (
    head(
      "INDUSTRY LANDSCAPE",
      "先看全局，再选一条线深入。",
      "按产品约束理解智能硬件：从上游器件到用户任务，从研发协作到交付运营。",
    ) +
    `<div class="notice">这是本站整理的学习框架，观察对象仅为示例。每个领域的竞争和组织设计都要回到具体产品、阶段与证据。</div><div class="grid-3">${db.landscape.map((t, i) => `<article class="map-card"><span class="index">FIELD ${String(i + 1).padStart(2, "0")}</span><h2>${esc(t.name)}</h2><p>${esc(t.title)}</p><h3>价值链</h3><div class="chain">${esc(t.chain)}</div><h3>先理解的约束</h3><p>${esc(t.constraint)}</p><h3>观察对象举例</h3><p>${esc(t.examples)}</p><button class="secondary" data-detail="${t.id}">查看团队与研究指标 ↗</button></article>`).join("")}</div><section class="method"><h2>贯穿所有领域的产品链条</h2><div class="flow">${["真实任务", "系统方案", "验证与量产", "交付与持续服务"].map((t, i) => `${i ? "<i>→</i>" : ""}<span>${t}</span>`).join("")}</div><p>每一步都应回答：用户少做了什么，谁负责交付，用什么证据判断完成。新品发布只证明链条上的一个节点。</p></section>`
  );
}
function organizations() {
  return (
    head(
      "ORGANIZATION LAB",
      "好产品背后，团队如何协作？",
      "研究决策权、专业组合与团队接口。公开事实和可借鉴机制分开阅读。",
    ) +
    `<div class="grid-2">${db.organizations.map((o, i) => `<article class="org-card"><div class="org-top"><span class="tag">${esc(o.label)}</span><span class="small">${esc(o.period)}</span></div><h2>${esc(o.name)}</h2><h3>${esc(o.title)}</h3><p>${esc(o.summary)}</p><div class="flow">${o.lanes.map((l, i) => `${i ? "<i>→</i>" : ""}<span>${esc(l)}</span>`).join("")}</div><p class="small">研究示意 · 非内部组织图</p><button class="secondary" data-detail="${o.id}">事实、机制与适用边界 <span>↗</span></button></article>`).join("")}</div><section class="method"><h2>一个组织案例，需要问清楚四件事</h2><div class="grid-2">${[
      ["决策", "谁有权做取舍，谁对整机体验负责？"],
      ["接口", "不同专业之间交付什么，怎样验收？"],
      ["条件", "这种机制适用于什么产品复杂度与发展阶段？"],
      ["结果", "有无同口径结果与员工后效？没有就保留未知。"],
    ]
      .map(([h, p]) => `<div><h3>${h}</h3><p>${p}</p></div>`)
      .join(
        "",
      )}</div><div class="notice">招聘岗位只能作为能力需求线索；公开报道不等于内部制度。人员规模、组织效果、效率收益未经充分证据不作推断。</div></section>`
  );
}
function learning() {
  return (
    head(
      "LEARNING PATH",
      "七步，建立自己的行业判断。",
      "按顺序完成，也可以从最关心的一步开始。每一步都留下一份可以检验的学习产出。",
    ) +
    `<div class="progress-box"><div class="progress-number">${db.learning.filter((l) => local.completed.includes(l.id)).length}<span class="small"> / 7</span></div><div><strong>已完成的学习步骤</strong><p>进度仅保存在当前浏览器，可在「我的收藏」导出备份。</p></div></div>${db.learning.map((l) => `<article class="lesson ${local.completed.includes(l.id) ? "done" : ""}"><div class="lesson-index">${local.completed.includes(l.id) ? "✓" : String(l.day).padStart(2, "0")}</div><div><h2>${esc(l.title)}</h2><p>${esc(l.subtitle)}</p><details id="${l.id}"><summary>展开学习任务</summary><p>${esc(l.body)}</p><ol>${l.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><div class="notice"><strong>本步产出：</strong>${esc(l.output)}</div><div class="toolbar"><a class="text-link" href="#${l.route}">打开相关栏目 ↗</a>${link(l.source.url, "阅读参考材料", "text-link")}</div></details></div><button class="completion" data-complete="${l.id}" aria-pressed="${local.completed.includes(l.id)}">${local.completed.includes(l.id) ? "✓ 已完成 · 撤销" : "标记完成"}</button></article>`).join("")}<section class="method"><h2>随手查：六个常用词</h2><dl class="glossary">${[
      ["BOM", "物料清单。通常不覆盖研发、渠道、库存、售后等全部业务成本。"],
      ["NPI", "新产品导入。将设计转为可制造、可测试、可稳定交付产品的过程。"],
      [
        "EVT / DVT / PVT",
        "工程、设计、生产验证的常见简称。各企业门槛不同，不能只按名称判断成熟度。",
      ],
      [
        "端侧推理",
        "在设备本地执行模型计算。需要同时考虑内存、延迟、能耗和更新维护。",
      ],
      [
        "Matter",
        "面向智能家居互操作的连接标准。标准支持与具体设备实际功能需要分别核对。",
      ],
      [
        "系统工程",
        "把不同专业的需求、接口和验证组织起来，围绕整体任务做取舍。",
      ],
    ]
      .map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`)
      .join(
        "",
      )}</dl><p class="small">以上为学习用简释，不替代具体项目的工程定义或标准原文。</p></section>`
  );
}
function saved() {
  const items = local.saved.map(itemById).filter(Boolean);
  const missing = local.saved.length - items.length;
  return (
    head(
      "YOUR RESEARCH",
      "留下线索，也留下自己的判断。",
      "收藏、学习进度与笔记只存于当前浏览器，不上传服务器。换设备前请导出备份。",
    ) +
    `<div class="backup"><button class="secondary" data-export>导出我的研究</button><label class="secondary" for="import-file" style="cursor:pointer">导入备份</label><input id="import-file" type="file" accept="application/json,.json" hidden><p>导入会合并收藏和进度；已有笔记保留。</p></div>${missing ? `<div class="notice warning">${missing} 条收藏已不在当前内容库中（自动条目保留 90 天）。备份仍保留标识和笔记。</div>` : ""}${items.length ? items.map((i) => `<article class="search-result"><div class="org-top"><div class="result-type">${esc(i.category || "研究资料")} · ${esc(i.date ? date(i.date) : i.period || "学习框架")}</div>${saveButton(i.id)}</div><button class="title-button" data-detail="${i.id}">${esc(i.title || i.name)}</button><p>${esc(local.notes[i.id] || i.summary || "点击打开详情并添加研究笔记。")}</p></article>`).join("") : empty("你的研究收藏，从第一条线索开始", "在任意情报右侧点 ☆，或在案例详情中收藏和记录笔记。", '<a class="primary" href="#briefing">去看看编辑精选 ↗</a>')}`
  );
}
function sources() {
  const f = freshness();
  return (
    head(
      "SOURCE & METHOD",
      "每个判断，都有来处。",
      "公开来源可追溯，采集状态可见。事实、解释与待核验线索分别呈现。",
    ) +
    `<div class="notice ${f.failed || f.hours > 36 ? "warning" : ""}">最近采集检查：${esc(date(db.radar.checkedAt, true))}；最近至少一个信源成功：${esc(date(db.radar.lastSuccessfulAt, true))}。${f.total - f.failed}/${f.total} 个自动信源本轮成功。</div><div class="table-wrap"><table class="data-table"><thead><tr><th>信源 / 级别</th><th>关注范围</th><th>更新方式</th><th>最近状态</th></tr></thead><tbody>${db.sources
      .map((s) => {
        const h = db.radar.health.find((x) => x.id === s.id);
        return `<tr><td>${link(s.home, s.name)}<small>${esc(s.tier)}</small></td><td>${esc(s.scope)}</td><td>${esc(s.type)}${s.auto ? "<small>每日自动检查</small>" : "<small>非自动采集</small>"}</td><td>${h ? `<span class="${h.state === "error" ? "warn" : ""}">${h.state === "ok" ? `成功 · ${h.matched} 条匹配` : "失败 · 保留缓存"}</span><small>${esc(date(h.checkedAt, true))}</small>${h.error ? `<small>${esc(h.error)}</small>` : ""}` : "按资料整理日期核对"}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><section class="method"><h2>从来源到理解的处理规则</h2><div class="flow">${["公开信源", "范围筛选", "链接去重", "待核验雷达", "编辑精选 / 学习"].map((s, i) => `${i ? "<i>→</i>" : ""}<span>${s}</span>`).join("")}</div><h3>来源分级，不把官方公告当作效果证明</h3><p>官方一手用于确认发布方披露的行为；媒体作为补充线索，需回溯原始材料；组织案例记录资料年份。转载同一公告不算独立交叉核验。</p><h3>编辑精选：先确认发生了什么，再写为什么值得读</h3><p>每条包含事实、本站解读、适用边界与下一步问题。优先关注用户负担、技术和量产约束、团队协作、商业交付与验证证据。缺少证据的销量、市场份额、组织绩效不补写。</p><h3>自动雷达：标题筛选与链接去重</h3><p>每日计划北京时间 08:17 运行 GitHub Actions（可能延迟）。关键词规则筛选公开 RSS，保留来源原标题、日期和链接，不抓取或转载全文，不自动生成中文研判。缺日期、未来时间和超出 90 天窗口的条目不纳入。最多保留 400 条。每日索引按原文发布时间编排，不是人工研判日报。</p><h3>采集失败与没有内容是两回事</h3><p>失败记录错误并保留历史；所有信源失败也不伪装成“当天无新闻”。若超过 36 小时没有成功抓取，页面显示过期提示。精选超过 7 天未整理也会提醒。</p><h3>参考 AI HOT，保持独立品牌与实现</h3><p>参考其信源分级、去重、精选和可追溯阅读方法。本项目独立实现静态页面与定时采集，未运行 AI HOT 的数据库、模型双评分、语义事件聚类或后台。没有付费模型调用，也没有账号登录和跨设备同步。</p><div class="toolbar">${link("https://github.com/KKKKhazix/AIHOT", "AI HOT 项目介绍", "text-link")}${link("https://github.com/JordanFu/hardware-intelligence/actions", "查看采集与发布记录", "text-link")}${link("https://github.com/JordanFu/hardware-intelligence", "源代码与维护说明", "text-link")}</div></section><section class="method"><h2>你的数据与内容使用</h2><p>本站仅发布公开资料的独立摘要与原文链接。收藏、笔记与学习进度仅使用浏览器本地存储；清除浏览器数据会删除它们，请自行导出。站点无跟踪分析脚本，不读取私人文档或工作通讯。GitHub Pages 与外部来源按各自服务规则处理访问日志。</p></section>`
  );
}
function search() {
  const q = query.trim().toLocaleLowerCase();
  const aliases = [
    ["拓竹", "bambu"],
    ["英伟达", "nvidia"],
    ["三星", "samsung"],
    ["大疆", "dji"],
    ["眼镜", "glasses"],
    ["机器人", "robot", "humanoid"],
    ["端侧", "edge ai", "jetson"],
  ];
  const terms = aliases.find((group) => group.includes(q)) || [q];
  const sets = [
    ["编辑精选", db.curated.items],
    ["组织案例", db.organizations],
    ["行业地图", db.landscape],
    ["学习路径", db.learning],
    ["自动动态 · 待核验", db.radar.items],
  ];
  let hits = [];
  for (const [type, items] of sets)
    for (const item of items) {
      if (
        terms.some((term) =>
          JSON.stringify(item).toLocaleLowerCase().includes(term),
        )
      )
        hits.push({ type, item });
    }
  return (
    head(
      "SEARCH YOUR ATLAS",
      `搜索：${query}`,
      `找到 ${hits.length} 条结果，涵盖精选、组织案例、行业地图、学习与自动动态。`,
    ) +
    `<button class="secondary" data-clear-search>清空搜索</button>${
      hits.length
        ? hits
            .slice(0, 100)
            .map(
              ({ type, item }) =>
                `<button class="search-result" data-detail="${item.id}"><div class="result-type">${esc(type)}</div><strong>${esc(item.title || item.name)}</strong><p>${esc(item.summary || item.subtitle || item.constraint || item.source || "")}</p></button>`,
            )
            .join("")
        : empty(
            "没有找到匹配内容",
            "试试「拓竹」「Matter」「团队」或「端侧」。",
          )
    }${hits.length > 100 ? '<p class="small">显示前 100 条，请用更具体的关键词缩小范围。</p>' : ""}`
  );
}
function render() {
  if (!db) return;
  nav();
  const views = {
    briefing,
    radar,
    landscape,
    organizations,
    learning,
    saved,
    sources,
  };
  $("#main").innerHTML =
    (query ? search() : (views[route] || briefing)()) +
    (!storageOK
      ? '<div class="notice warning">当前浏览器的本地存储不可用。收藏和进度仅在本页会话中保留，请及时导出。</div>'
      : "");
  document.title = `${query ? "搜索" : navs.find((n) => n[0] === route)?.[1] || "编辑精选"} · 硬件观测`;
}
function openDetail(id) {
  const n = itemById(id);
  if (!n) {
    toast("该条目未在当前资料库中找到。");
    return;
  }
  let html = "";
  const section = (title, body) => `<h3>${title}</h3><p>${esc(body)}</p>`;
  if (n.facts) {
    html += `<h3>可核对的公开事实</h3><ul>${n.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
    if (n.mechanism) {
      html +=
        section("可借鉴机制 · 本站研究解读", n.mechanism) +
        section("适用条件", n.apply) +
        section("尚未确认", n.unknown) +
        section("带走一个问题", n.prompt);
    } else {
      html +=
        section("为什么值得关注 · 本站解读", n.meaning) +
        section("证据边界", n.boundary) +
        section("下一步跟踪", n.question);
    }
  } else if (n.sourceId) {
    html +=
      `<div class="notice warning">自动发现 · 待核验。本中心尚未核实全文或相关结论。以下标题与发布时间来自来源 RSS，可能与网页显示时区或更新时间不同。</div>` +
      section("原标题", n.title) +
      section(
        "核验时先看什么",
        "打开原文核对主体、行为、日期和适用范围。若是媒体报道，继续追溯官方公告；把计划、演示、开始交付与规模使用分别记录。",
      );
  } else if (n.chain) {
    html +=
      section("价值链", n.chain) +
      section("核心约束", n.constraint) +
      section("需要协同的专业 · 学习框架", n.team) +
      section("值得核对的指标 · 不是企业已披露结果", n.metrics) +
      section("观察对象举例", n.examples) +
      section("使用边界", n.note);
  } else if (n.steps) {
    html +=
      section("学习要点", n.body) +
      `<ol>${n.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` +
      section("本步产出", n.output) +
      `<a class="secondary" href="#learning" data-close>进入完整学习路径 ↗</a>`;
  }
  const sources =
    n.sources ||
    (n.sourceId
      ? [{ name: n.source, url: n.url, date: date(n.date) }]
      : n.source
        ? [n.source]
        : []);
  html += `<h3>原始来源</h3>${sources.map((s) => `<a class="source-link" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗<small>来源日期：${esc(s.date)} · 点击阅读原文</small></a>`).join("")}<h3><label for="research-note">我的研究笔记 · 仅保存在本机</label></h3><textarea id="research-note" data-note="${n.id}" placeholder="记下你的判断、疑问或下一步验证动作…" maxlength="10000" rows="4">${esc(local.notes[n.id] || "")}</textarea><div class="dialog-bottom">${saveButton(n.id, true)}<button class="secondary" data-save-note="${n.id}">保存笔记</button><button class="secondary" data-copy="${n.id}">复制条目链接</button></div>`;
  $("#dialog-body").innerHTML =
    `<div class="dialog-header"><span class="small">${esc(n.period || n.category || "研究资料")}${n.date ? " · " + esc(date(n.date)) : ""}</span><button class="icon-button" data-close aria-label="关闭详情">×</button></div><div class="dialog-content"><span class="tag">${esc(n.sourceId ? "自动发现 · 待核验" : n.label || n.kind || "学习框架")}</span><h2>${esc(n.title || n.name)}</h2>${html}</div>`;
  focusBeforeDialog = document.activeElement;
  if (!$("#detail").open) $("#detail").showModal();
  $("#detail").scrollTop = 0;
}
function toggleSave(id) {
  if (isSaved(id)) local.saved = local.saved.filter((x) => x !== id);
  else local.saved.push(id);
  persist();
  document.querySelectorAll("[data-save]").forEach((b) => {
    if (b.dataset.save !== id) return;
    const on = isSaved(id);
    b.classList.toggle("saved", on);
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", on ? "取消收藏" : "收藏");
    b.textContent = b.closest("dialog")
      ? on
        ? "★ 已收藏"
        : "☆ 收藏"
      : on
        ? "★"
        : "☆";
  });
  nav();
  if (route === "saved") render();
  toast(isSaved(id) ? "已加入我的收藏" : "已取消收藏");
}
function exportLocal() {
  const blob = new Blob(
    [
      JSON.stringify(
        { schemaVersion: 1, exportedAt: new Date().toISOString(), ...local },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `hardware-atlas-${day(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出收藏、笔记与学习进度");
}
async function importLocal(file) {
  try {
    if (!file || file.size > 2000000)
      throw new Error("请选择小于 2 MB 的备份文件");
    const v = JSON.parse(await file.text());
    if (
      v.schemaVersion !== 1 ||
      !Array.isArray(v.saved) ||
      !Array.isArray(v.completed) ||
      !v.notes ||
      Array.isArray(v.notes) ||
      typeof v.notes !== "object"
    )
      throw new Error("不是有效的硬件观测备份");
    const idOK = (id) =>
      typeof id === "string" && /^[a-z0-9-]{1,100}$/.test(id);
    if (
      v.saved.length > 5000 ||
      v.completed.length > 100 ||
      !v.saved.every(idOK) ||
      !v.completed.every(idOK) ||
      Object.keys(v.notes).length > 5000 ||
      !Object.entries(v.notes).every(
        ([k, val]) => idOK(k) && typeof val === "string" && val.length <= 10000,
      )
    )
      throw new Error("备份内容或长度不符合要求");
    local.saved = [...new Set([...local.saved, ...v.saved])];
    local.completed = [...new Set([...local.completed, ...v.completed])].filter(
      (id) => db.learning.some((l) => l.id === id),
    );
    for (const [id, note] of Object.entries(v.notes))
      if (!local.notes[id]) local.notes[id] = note;
    persist();
    render();
    toast("已合并备份，原有笔记已保留");
  } catch (e) {
    toast(`导入失败：${e.message}`);
  }
}
function closeDetail() {
  if ($("#detail").open) $("#detail").close();
}
function navigate() {
  if (!db) return;
  let raw = location.hash.slice(1) || "briefing";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = "briefing";
  }
  let path = raw.split("/");
  query = "";
  $("#search").value = "";
  if (path[0] === "article" || path[0] === "org") {
    route = path[0] === "org" ? "organizations" : "briefing";
    render();
    openDetail(path[1]);
  } else {
    closeDetail();
    route = navs.some((n) => n[0] === path[0]) ? path[0] : "briefing";
    category = "全部";
    limit = 30;
    render();
  }
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0 });
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button,a");
  if (!b) return;
  if (b.classList.contains("skip")) {
    e.preventDefault();
    $("#main").focus();
    return;
  }
  if (
    b.classList.contains("nav-item") &&
    b.getAttribute("href") === location.hash
  ) {
    query = "";
    $("#search").value = "";
    render();
    $(".sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }
  if (b.dataset.detail) openDetail(b.dataset.detail);
  if (b.dataset.save) toggleSave(b.dataset.save);
  if (b.hasAttribute("data-close")) closeDetail();
  if (b.dataset.category) {
    category = b.dataset.category;
    limit = 30;
    render();
  }
  if (b.hasAttribute("data-more")) {
    limit += 30;
    render();
  }
  if (b.dataset.complete) {
    const open = [...document.querySelectorAll("details[open]")].map(
      (x) => x.id,
    );
    const id = b.dataset.complete;
    local.completed = local.completed.includes(id)
      ? local.completed.filter((x) => x !== id)
      : [...local.completed, id];
    persist();
    render();
    open.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.open = true;
    });
  }
  if (b.hasAttribute("data-export")) exportLocal();
  if (b.hasAttribute("data-clear-search")) {
    query = "";
    $("#search").value = "";
    render();
  }
  if (b.dataset.saveNote) {
    local.notes[b.dataset.saveNote] = $("#research-note").value;
    if (!isSaved(b.dataset.saveNote)) local.saved.push(b.dataset.saveNote);
    const ok = persist();
    nav();
    const sb = $("[data-save]", $("#detail"));
    sb.classList.add("saved");
    sb.textContent = "★ 已收藏";
    sb.setAttribute("aria-pressed", "true");
    sb.setAttribute("aria-label", "取消收藏");
    if (ok) toast("笔记已保存，条目已收藏");
    if (route === "saved") render();
  }
  if (b.dataset.copy) {
    const n = itemById(b.dataset.copy);
    const u = new URL(location.href);
    u.hash = (n?.mechanism ? "org/" : "article/") + b.dataset.copy;
    try {
      await navigator.clipboard.writeText(u.href);
      toast("条目链接已复制");
    } catch {
      toast("复制不可用，请从地址栏复制，或通过收藏保存。");
    }
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "radar-date") {
    radarDay = e.target.value;
    limit = 30;
    render();
  }
  if (e.target.id === "radar-tier") {
    tier = e.target.value;
    limit = 30;
    render();
  }
  if (e.target.id === "import-file") importLocal(e.target.files[0]);
});
$("#menu-toggle").addEventListener("click", () => {
  const open = $(".sidebar").classList.toggle("open");
  $("#menu-toggle").setAttribute("aria-expanded", open);
});
$("#search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !/input|textarea|select/i.test(e.target.tagName) &&
    !$("#detail").open
  ) {
    e.preventDefault();
    $("#search").focus();
  }
  if (e.key === "Escape") {
    $(".sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }
});
$("#detail").addEventListener("click", (e) => {
  if (e.target === $("#detail")) {
    const r = $("#detail").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDetail();
  }
});
$("#detail").addEventListener("close", () => {
  if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus();
  if (/^#(article|org)\//.test(location.hash))
    history.replaceState(null, "", "#" + route);
});
window.addEventListener("hashchange", navigate);
try {
  const names = [
    "curated",
    "organizations",
    "landscape",
    "learning",
    "sources",
    "radar",
    "digests",
  ];
  const values = await Promise.all(
    names.map(async (n) => {
      const res = await fetch(`data/${n}.json`);
      if (!res.ok) throw new Error(`${n}: HTTP ${res.status}`);
      return res.json();
    }),
  );
  db = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  navigate();
} catch (e) {
  $("#main").innerHTML = empty(
    "资料暂时没有加载成功",
    "请检查网络后刷新页面。已有收藏仍保存在当前浏览器。",
    '<button class="primary" id="retry">重新加载</button>',
  );
  $("#retry").addEventListener("click", () => location.reload());
  console.error("Data loading failed:", e);
}

$("#nav-close").addEventListener("click", () => {
  $(".sidebar").classList.remove("open");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  $("#menu-toggle").focus();
});
