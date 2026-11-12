import { educationMatches, educationResearchJobs } from './education.js';
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
  route = "daily",
  category = "全部",
  radarDay = "全部",
  tier = "全部",
  limit = 30,
  query = "",
  focusBeforeDialog = null;
const navs = [
  ["daily", "每日时间线", "▤"],
  ["briefing", "中文精选", "◫"],
  ["education", "学习硬件", "▧"],
  ["valuechain", "全链路知识", "↔"],
  ["practices", "实践观察", "◈"],
  ["recruitment", "岗位与人才", "⌕"],
  ["radar", "动态雷达", "◎"],
  ["landscape", "行业地图", "▦"],
  ["organizations", "组织实验室", "◇"],
  ["learning", "七步入门", "↗"],
  ["saved", "我的收藏", "☆"],
  ["sources", "信源与方法", "≋"],
];
const categories = [
  "全部",
  "学习硬件",
  "可穿戴与眼镜",
  "机器人与无人机",
  "智能家居",
  "端侧 AI 与芯片",
  "制造与创作",
  "产品工程与量产",
];
let chainStage = '全部', domesticOnly = false, editionDate = '', jobFamily = '全部';
function chainFilter() {
  return `<div class="toolbar chain-filter"><label>链路环节 <select id="chain-stage">${['全部',...db.industry.stages].map(s=>`<option ${s===chainStage?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label class="check-label"><input id="domestic-only" type="checkbox" ${domesticOnly?'checked':''}> 仅国内公司</label></div>`;
}
function inScope(n) {return (chainStage==='全部'||n.stages?.includes(chainStage))&&(!domesticOnly||n.domestic);}
function selectedEvents() {return db.intelligence.events.filter(e=>e.selected).map(e=>itemById(e.representativeId)).filter(Boolean);}
function editorialFreshness() {
 const op=db.operations,t=db.intelligence.lastCompletedAt,run=db.intelligence.runs.at(-1)||{},today=day(Date.now());
 const hasDaily=db.daily.editions.some(d=>d.date===today&&d.state!=='incomplete'&&d.coverageCheck?.passed!==false),readToday=t&&day(t)===today,jobsToday=day(db.recruitment.checkedAt)===today&&new Set(db.recruitment.scans.filter(s=>day(s.checkedAt)===today&&s.state!=='error').map(s=>s.company)).size>=op.requirements.recruitmentCompanies;
 const covered=run.coverageCheck?.passed,old=(Date.now()-new Date(t||0))/36e5>36;
 const done=hasDaily&&readToday&&run.successfulScan&&jobsToday&&covered;
 const state=done?(run.failedSources?.length?'今日已扫描 · 部分来源不可读':'今日扫描已完成'):'今日更新尚未完成';
 return `<div class="notice ${!done||old||run.failedSources?.length?'warning':''}"><strong>${esc(state)}</strong><p>最近中文整理 ${esc(date(t,true))} · 日报 ${hasDaily?'已有今日记录':'尚无今日记录'} · 岗位 ${jobsToday?'今日已检查':'待检查'}</p><p>每日 ${esc(op.editorialTime)} 更新，${esc(op.recoveryTime)} 检查并补跑；${esc(op.runtimeNote)} ${old?'当前资料已超过 36 小时。':''}</p><a href="#sources">查看实际来源、覆盖与失败记录 ↗</a></div>`;
}
document.addEventListener('click', e=>{
 const categoryButton=e.target.closest('[data-education-category]');
 if(categoryButton){location.hash='education/'+categoryButton.dataset.educationCategory+'/'+encodeURIComponent(educationCompany);}
 const profileButton=e.target.closest('[data-education-profile]');if(profileButton){const p=db.education.profiles.find(p=>p.id===profileButton.dataset.educationProfile);if(p)location.hash='education/'+p.categoryIds[0]+'/'+encodeURIComponent(p.company);}
 const scroll=e.target.closest('[data-education-scroll]');if(scroll){e.preventDefault();document.getElementById(scroll.dataset.educationScroll)?.scrollIntoView({behavior:'smooth',block:'start'});}
});
let educationCategory='all',educationCompany='all';
const eduDimensions={product:'产品与场景',content:'内容与服务',channel:'渠道与权益',delivery:'供应链、质量与交付',organization:'组织与岗位'};
let educationRole='全部';
function educationWorkforce() {
 const all=educationResearchJobs(db.recruitment.jobs,educationCompany),families=db.operations.education.roleFamilies;
 const jobs=all.filter(j=>educationRole==='全部'||j.family===educationRole),companies=['作业帮','科大讯飞','猿辅导（小猿）'].filter(c=>educationCompany==='all'||educationCompany===c);
 if(!companies.length)return '';
 const direct=all.filter(j=>j.businessScope==='硬件直接相关'),insights=(db.recruitment.insights||[]).filter(i=>i.educationResearch&&i.jobIds.some(id=>all.some(j=>j.id===id)));
 const checks=db.recruitment.scans.flatMap(s=>(s.familyChecks||[]).map(c=>({...c,company:s.company,checkedAt:s.checkedAt}))),latest=all.map(j=>j.lastSeen).sort().at(-1);
 const fields=educationRole==='全部'?families:[educationRole];
 return `<section id="education-workforce" class="education-workforce"><div class="section-head"><h2>招聘与组织 · 沿职责看团队</h2><a href="#recruitment">全行业岗位观察 ↗</a></div><p>这部分按公司横向研究五类职责，独立于上方品类筛选。每份样本单独标注业务归属；共享能力与相邻业务可以启发比较，但不能拼成学习机团队组织图。</p>
 <div class="notice"><strong>${all.length} 份职责基线 · ${direct.length} 份直接涉及学习硬件 · ${all.length-direct.length} 份共享或相邻业务参照</strong><p>最近实际读取 ${latest?esc(date(latest,true)):'待补充'}。首次收录不等于新增职位；职责版本与可见性分别记录；单个岗位关闭或新收录，不能证明扩编、裁撤或人才短缺。</p><p class="small">优先补齐：学习机专属教研与算法、硬件供应链与零售渠道。共享岗位可见不代表专属团队已核实。表格空白表示证据缺口。</p></div>
 <div class="toolbar"><label>查看职责 <select id="education-role">${['全部',...families].map(f=>`<option ${f===educationRole?'selected':''}>${esc(f)}</option>`).join('')}</select></label><span class="small">每天复查原岗位 · 7天轮换检查三家公司与五岗位族</span></div>
 <div class="table-scroll"><table class="education-role-matrix"><thead><tr><th>公司</th>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${companies.map(c=>`<tr><th scope="row">${esc(c)}</th>${fields.map(f=>{const rows=all.filter(j=>j.company===c&&j.family===f),check=checks.filter(x=>x.company===c&&x.family===f).at(-1);return `<td>${rows.length?rows.map(j=>`<span class="tag">${esc(j.businessScope)}</span><p class="small">${esc(j.access)} · 观察 ${esc(date(j.lastSeen))}${j.access==='明确关闭'?' · 以下为历史职责':''}</p><p>${esc(j.responsibilities[0])}</p><p class="small">${esc(j.scopeNote)}</p><button class="text-link" data-detail="${esc(j.id)}">岗位原文与版本 ↗</button>`).join(''):`<strong>待补正文</strong><p class="small">${esc(check?.note||'尚无可核验职责样本；不能推断没有该职能。')}</p>${check?link(check.url,'本轮检索入口'):''}`}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>
 <details class="method" open><summary>五类岗位怎样交接 · 研究用职责框架</summary><p class="small">依据下方职责样本归纳的访谈框架，不是三家公司共同采用的制度，也不表示每家公司已有完整证据。</p><div class="grid-2">${[
 ['教研','输入学习目标与学科规律；输出内容标准、错例与测试集。学科正确性、可教性由谁验收，应与算法指标分开。','对接产品和算法，明确谁定义题目质量、谁批准内容发布。'],
 ['算法','输入数据、错例与工程约束；输出模型、评估结果及部署方案。模型正确率不能替代真实学习成效。','对接教研的数据标准和硬件/工程的延迟、功耗约束。'],
 ['硬件','输入产品规格与使用场景；输出器件、结构、设计和测试文档，解决试产及失效问题。','对接供应链的物料变更和质量验收；售后问题需要能回到研发改进。'],
 ['供应链','输入销售计划和技术规格；输出可交付物料、成本与风险信息。寻源、采购、物料计划和售后运营不应仅凭一个职位合并。','对接销售需求、工厂齐套和售后备件；核对放行权限与支持资源。'],
 ['渠道','输入产品与服务承诺；输出合作渠道、销售反馈和经营复盘。获客、成交、退款和履约分别找责任人。','对接产品、营销、供应与服务；前端承诺需与后端可交付能力一致。']
 ].filter(([f])=>educationRole==='全部'||educationRole===f).map(([f,output,handoff])=>`<article><h3>${f}</h3><p>${output}</p><p class="small">${handoff}</p>${all.filter(j=>j.family===f).map(j=>`<button class="text-link" data-detail="${esc(j.id)}">${esc(j.company)}职责依据 ↗</button>`).join('')}</article>`).join('')}</div></details>
 <div class="section-head"><h3>组织与人员决策观察</h3><span class="small">事实 → 研究解释 → 替代解释 → 待验证问题</span></div><div class="grid-2">${insights.map(i=>`<article class="org-card"><span class="tag">研究分析 · 非组织变更结论</span><h3>${esc(i.title)}</h3><p><strong>岗位事实：</strong>${esc(i.finding)}</p><p>${esc(i.interpretation)}</p><p><strong>另一种解释：</strong>${esc(i.alternative)}</p><p><strong>人员决策前核验：</strong>${esc(i.nextAction)}</p><p class="small">${esc(i.boundary)}</p><p class="small">内容整理 ${esc(date(i.reviewedAt))}</p>${i.jobIds.map(id=>`<button class="text-link" data-detail="${esc(id)}">${esc(itemById(id)?.company)} · ${esc(itemById(id)?.family)}证据 ↗</button>`).join('')}</article>`).join('')}</div>
 <details class="method"><summary>展开 ${jobs.length} 份职责样本与协作边界</summary><div class="grid-2">${jobs.map(j=>`<article class="org-card"><div class="meta"><span class="tag">${esc(j.family)}</span><span>${esc(j.businessScope)} · ${esc(j.access)}${j.access==='明确关闭'?' · 历史职责':''}</span></div><h3>${esc(j.company)} · ${esc(j.title)}</h3><p>${esc(j.responsibilities.join('；'))}</p><p><strong>交接边界：</strong>${esc(j.interfaces.join('；'))}</p><p><strong>待验证：</strong>${esc(j.decisionQuestion)}</p><p class="small">${esc(j.scopeNote)} · 原文 ${esc(j.postedAt||'未标日期')} · 观察 ${esc(date(j.lastSeen))}</p><button class="secondary" data-detail="${esc(j.id)}">原始来源、要求与版本 ↗</button></article>`).join('')}</div></details>
 <details class="method"><summary>本轮覆盖、失败与持续跟踪方式</summary><p>按公司和岗位ID复查原文，职责、要求、接口或业务范围发生实质变化时保存修改前后内容；原文未变只记录可见性。不同业务、不同ID或不同日期的岗位不能自动串成组织变动。</p><p>每天至少读取两家核心竞品的岗位正文，7天复核三家公司 × 五类职责。入口失败、索引无匹配和业务范围不符分别记录，不计为完整招聘目录。晚间补跑检查独立于产品档案。</p>${companies.map(c=>`<h4>${esc(c)}</h4>${families.map(f=>{const check=checks.filter(x=>x.company===c&&x.family===f).at(-1);return `<p class="small">${esc(f)} · ${check?esc(date(check.checkedAt,true))+' · '+esc(check.note)+' '+link(check.url,'来源'):'尚无检查记录'}</p>`}).join('')}`).join('')}${db.recruitment.scans.filter(s=>companies.includes(s.company)&&s.state==='error').slice(-3).map(s=>`<p class="small">读取失败：${esc(s.note)} ${s.url?link(s.url,'失败入口'):''}</p>`).join('')}</details></section>`;
}
function education() {
 const d=db.education,cat=d.categories.find(c=>c.id===educationCategory),profiles=d.profiles.filter(p=>(!cat||p.categoryIds.includes(cat.id))&&(educationCompany==='all'||p.company===educationCompany));
 const scoped=n=>educationMatches(n,educationCategory,educationCompany,d.profiles);
 const items=db.intelligence.items.filter(n=>n.selected&&scoped(n)).sort((a,b)=>(b.publishedAt||b.generatedAt).localeCompare(a.publishedAt||a.generatedAt));
 const jobs=db.recruitment.jobs.filter(scoped),health=db.health.parts.education||{},recent=d.runs.at(-1),updated=profiles.map(p=>p.updatedAt).filter(Boolean).sort().at(-1);
 return head('LEARNING HARDWARE','学习硬件 · 从竞品看完整业务。','围绕五个品类，连接产品、内容、渠道、交付与组织。国内核心看作业帮、科大讯飞、猿辅导；小天才、华为及海外案例提供相邻场景参照。')+
 `<p class="small">最近扫描 ${recent?esc(date(recent.completedAt,true)):'待执行'} · ${health.needsEducation?'存在待补跑或逾期复核任务':'本轮维护检查通过'} · 档案中的未知项仍需继续研究</p><div class="education-tabs" role="group" aria-label="学习硬件品类">${[{id:'all',name:'全部品类'},...d.categories].map(c=>`<button class="${educationCategory===c.id?'active':''}" data-education-category="${c.id}" aria-pressed="${educationCategory===c.id}">${esc(c.name)}</button>`).join('')}</div>
 <div class="toolbar"><label>观察公司 <select id="education-company"><option value="all">全部公司</option>${[...new Set(d.profiles.map(p=>p.company))].map(c=>`<option ${c===educationCompany?'selected':''}>${esc(c)}</option>`).join('')}</select></label><span class="small">${profiles.length} 份品类档案 · 内容更新 ${updated?esc(date(updated)):'暂无'}</span></div>
 ${cat?`<section class="education-focus"><span class="eyebrow">${esc(cat.name)} / 观察方法</span><h2>${esc(cat.flow)}</h2><p>${esc(cat.scope)}</p><div class="grid-2"><div><h3>带着这三个问题看竞品</h3><ul>${cat.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ul></div><div><h3>怎样判断实际价值</h3><p>${esc(cat.metrics)}</p><p class="small">本站研究问题与指标建议，尚不是行业标准。</p></div></div></section>`:`<div class="education-lanes">${d.categories.map(c=>`<button data-education-category="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.flow)}</span></button>`).join('')}</div>`}
 ${educationCategory==='recorder'||educationCategory==='all'?`<aside class="notice"><strong>对照参考：${esc(d.reference.name)}</strong><p>${esc(d.reference.status)}。${esc(d.reference.boundary)}</p><p class="small">比较顺序：采集与拾音 → 转写 → 有原文依据的整理 → 检索、导出与后续使用；同时核对费用、配额、权限和数据迁移。</p></aside>`:''}
 ${educationWorkforce()}
 <div class="section-head"><h2>竞品档案</h2><span class="small">公开披露与研究问题分开 · 按品类阅读</span></div>
 <div class="grid-2">${profiles.map(p=>`<article class="org-card education-profile" id="edu-${esc(p.id)}"><div class="meta"><span class="tag">${esc(p.tier)}</span><span>${p.categoryIds.map(id=>esc(d.categories.find(c=>c.id===id).name)).join(' / ')}</span></div><h2>${esc(p.company)}</h2><p class="education-brief">${esc(p.brief.lead)}</p><h3>本文核心内容</h3><ul>${p.brief.points.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><details><summary>沿产销研看业务与团队</summary><dl>${Object.entries(eduDimensions).map(([key,label])=>`<dt>${label}</dt><dd>${esc(p.dimensions[key])}</dd>`).join('')}</dl><p class="small">团队问题是待验证的研究方向，不代表这些公司已经采用相应组织设计。</p></details><details><summary>原始依据与证据边界</summary>${p.facts.map(f=>`<p class="small">公开披露：${esc(f.claim)} · ${esc(f.locator)}</p>`).join('')}${p.sources.map(s=>`<p>${link(s.url,s.title)}<br><span class="small">${s.role==='developer'?'开发者自述':'官方披露'} · 原文 ${esc(s.publishedAt||'未标日期')} · 查阅 ${esc(date(s.readAt,true))} · ${s.coverage==='excerpt'?'正文片段':'正文'}</span></p>`).join('')}<p>${esc(p.boundary)}</p>${p.gaps.map(g=>`<p class="small">待核验：${esc(g)}</p>`).join('')}</details><p class="small education-dates">内容更新 ${esc(date(p.updatedAt))} · 资料复核 ${esc(date(p.reviewedAt))}${p.lastReviewStatus==='error'?' · 最近复核受阻，保留历史':''}</p></article>`).join('')||empty('该组合尚无已核验档案','请选择其他公司或品类；没有档案不代表该公司没有相关业务。')}</div>
 <section class="education-comparison"><div class="section-head"><h2>横向比较：已知与待核验</h2><span class="small">不做无证据排名</span></div><div class="table-scroll"><table><thead><tr><th>公司 / 品类</th>${Object.values(eduDimensions).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${profiles.map(p=>`<tr><th scope="row"><a href="#edu-${esc(p.id)}" data-education-scroll="edu-${esc(p.id)}">${esc(p.company)}</a><br><span class="small">${p.categoryIds.map(id=>esc(d.categories.find(c=>c.id===id).name)).join(' / ')}</span></th>${Object.keys(eduDimensions).map(k=>`<td>${esc(p.dimensions[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
 <div class="section-head"><h2>后续动态与中文 brief</h2><a href="#daily">全站每日时间线 ↗</a></div><p class="small">这里自动汇入通过既有筛选的相关事件；按原文日期阅读。上方首次建档和旧资料复核不冒充今日新闻。</p><div class="news-list">${items.length?items.map(newsRow).join(''):empty('尚无符合当前条件的新事件','本期先提供有来源的竞品基线，后续每日扫描持续补充。')}</div>
 <details class="method"><summary>更新记录、来源失败与下一轮任务</summary><p>每日 ${esc(db.operations.editorialTime)} 轮换扫描至少两家核心竞品；${esc(db.operations.recoveryTime)} 检查并补跑。7 天复核五个品类与全部档案，海外资料每周复核。运行依赖本机 Codex 与网络可用。</p><p>今日核心覆盖：${esc((health.coreCompaniesChecked||[]).join('、')||'待检查')}。${health.needsEducation?'仍有学习硬件维护任务待处理。':'当前学习硬件维护检查已通过。'} 内容不变只记录复核，失败不推进有效复核时间。</p><p class="small">核心竞品岗位正文：本周 ${esc((health.recruitmentCompaniesChecked||[]).join('、')||'尚待补充')}；今日岗位读取 ${esc((health.workforce?.companiesToday||[]).join("、")||"待执行")}；逾期职责复核 ${health.workforce?.overdueRoleChecks?.length||0} 格。招聘缺口不影响阅读现有产品档案，但到期后会触发补跑。</p>${d.runs.slice(-7).reverse().map(r=>`<article class="knowledge-revision"><h3>${esc(date(r.completedAt,true))}</h3><p>${esc(r.summary)}</p><details><summary>逐来源查阅状态</summary>${r.checks.map(c=>`<p class="small">${esc(c.company)} · ${esc(c.state)} · ${esc(date(c.checkedAt,true))} ${link(c.url,c.name)}<br>${esc(c.note)}</p>`).join('')}</details></article>`).join('')}<details><summary>档案修订依据与前后内容</summary>${d.history.slice(-30).reverse().map(h=>`<div class="knowledge-revision"><strong>${esc(d.profiles.find(p=>p.id===h.profileId)?.company||h.profileId)} · ${esc(date(h.reviewedAt,true))}</strong><p>${esc(h.assessment)}</p><p class="small">${Object.keys(h.changes).length?'实质修改：'+Object.keys(h.changes).map(k=>esc(eduDimensions[k]||({brief:'核心摘要',dimensions:'业务维度',facts:'事实',sources:'来源',boundary:'边界',gaps:'未知项',categoryIds:'品类'}[k]||k))).join('、'):'复核未改变内容'}</p></div>`).join('')}<p>${link('https://jordanfu.github.io/hardware-intelligence/data/education.json','完整修改前后记录')}</p></details></details>`;
}

function briefing() {
  const items=selectedEvents().filter(inScope).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
  const lead=items[0];
  return head('THE HARDWARE BRIEF','读懂产销研，也读懂组织。','从需求到研发、制造、销售与服务，读中文核心摘要，沿证据追踪真实变化。')+editorialFreshness()+`<div class="overview-links"><a href="#education"><strong>学习硬件</strong><span>五个品类，沿完整业务看竞品 ↗</span></a><a href="#daily"><strong>每日时间线</strong><span>按天回看，最新更新在前 ↗</span></a><a href="#valuechain"><strong>全链路知识</strong><span>8 个环节，基础到实践 ↗</span></a><a href="#recruitment"><strong>岗位与人才</strong><span>职责、接口与变化线索 ↗</span></a></div>`+chainFilter()+(lead?`<article class="lead-card"><div class="lead-meta">本期阅读 · ${esc(lead.stages.join(' / '))}</div><h2>${esc(lead.title)}</h2><p>${esc(lead.brief.lead)}</p><div class="lead-bottom"><span>${esc(date(lead.publishedAt))} · ${esc(lead.sources[0].name)}</span><button class="primary" data-detail="${lead.id}">核心内容与证据 ↗</button></div></article>`:'')+`<div class="section-head"><h2>中文精选 · ${items.length} 个事件</h2><a href="#radar">全部动态 ↗</a></div><div class="news-list">${items.length?items.map(newsRow).join(''):empty('当前筛选无精选','调整环节，或查看知识地图。')}</div><details class="method"><summary>初始研究资料 · 按原始日期阅读</summary>${db.curated.items.map(newsRow).join('')}</details>`;
}
let timelineLimit = 7;
function daily() {
  const editions=[...db.daily.editions].sort((a,b)=>b.date.localeCompare(a.date));
  const visible=editionDate?editions.filter(d=>d.date===editionDate):editions.slice(0,timelineLimit);
  const states={complete:'扫描完成',partial:'部分覆盖或读取有缺口',incomplete:'未完成有效扫描',no_new_qualifying_events:'已扫描 · 无新增入选事件'};
  const today=day(Date.now());
  if(!editions.length)return head('DAILY TIMELINE','每日情报时间线','尚未生成首期日报。');
  return head('DAILY TIMELINE','沿时间，读懂行业变化。','按站点更新日期倒序阅读：先看每天精选，再看新整理的知识与岗位线索。条目保留原文日期，收录时间不等于事件发生时间。')+editorialFreshness()+
    `<div class="timeline-toolbar"><div><strong>每日更新档案</strong><p class="small">北京时间 · ${editions.length} 天有记录 · 仅展示实际生成的日报</p></div><label for="edition-date">查看日期 <select id="edition-date"><option value="">全部日期 · 最新在前</option>${editions.map(d=>`<option value="${d.date}" ${editionDate===d.date?'selected':''}>${d.date}</option>`).join('')}</select></label>${editionDate?'<a class="text-link" href="#daily">返回完整时间线 ↗</a>':''}</div>`+
    `<div class="daily-timeline">${visible.map(d=>{
      const briefs=db.intelligence.items.filter(n=>n.generatedAt&&day(n.generatedAt)===d.date&&!d.itemIds.includes(n.id)).sort((a,b)=>Number(b.selected)-Number(a.selected));
      const changes=db.recruitment.changes.filter(c=>day(c.observedAt)===d.date);
      const educationChanges=db.education.history.filter(h=>day(h.reviewedAt)===d.date&&Object.keys(h.changes).length);
      const knowledgeChanges=db.knowledge.history.filter(h=>day(h.reviewedAt)===d.date&&(Object.keys(h.changes).length||h.lessonChanges.length));
      const weekday=new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'Asia/Shanghai'}).format(new Date(d.date+'T12:00:00+08:00'));
      return `<section class="timeline-day" aria-labelledby="day-${d.date}"><div class="timeline-date"><span>${d.date.slice(0,4)} / ${weekday}</span><h2 id="day-${d.date}"><a href="#daily/${d.date}"><time datetime="${d.date}">${d.date.slice(5).replace('-','.')}</time></a></h2>${d.date===today?'<span class="tag">今天</span>':''}<span class="small">站点更新日期</span></div><div class="timeline-body"><div class="timeline-day-head"><span class="tag ${d.state==='partial'||d.state==='incomplete'?'timeline-caution':''}">${esc(states[d.state]||d.state)}</span><span class="small">${d.itemIds.length} 条日报精选 · ${briefs.length} 篇补充整理 · ${changes.length} 条岗位观察${knowledgeChanges.length?` · ${knowledgeChanges.length} 条知识修订`:""}</span></div><h3 class="timeline-label">当天阅读清单</h3><p class="small">${esc(d.windowNote)}</p><div class="news-list">${d.itemIds.length?d.itemIds.map(itemById).filter(Boolean).map(newsRow).join(''):empty('本期没有新增入选事件','保留当天的扫描结果，不用旧新闻补足条数。请查看本日覆盖说明。')}</div>
      ${briefs.length?`<details class="timeline-extra"><summary>本日补充整理 <span>${briefs.length} 篇 · 知识、实践与组织线索</span></summary><p class="small">按中文整理日期归档，可能包含旧文、常青知识及未入选精选的资料。原文时间另列。</p>${briefs.map((n,i)=>`<div class="timeline-reading"><span class="small">${n.selected?'通过精选门槛':'补充资料 · 未入选精选'}${n.practices?.length?' · 含实践观察':''}${n.organization?.length?' · 含组织线索':''}</span>${newsRow(n,i)}</div>`).join('')}</details>`:''}
      ${changes.length?`<details class="timeline-extra"><summary>岗位观察 <span>${changes.length} 条 · 收录与版本记录</span></summary><p class="small">首次收录不代表新设岗位；可见性变化不代表增编、裁撤或招满。详情保留职责版本与证据边界。</p>${changes.map(c=>{const j=itemById(c.jobId);if(!j)return '';const v=[...j.versions].reverse().find(v=>v.observedAt<=c.observedAt)||j;return `<article class="timeline-job"><div class="meta"><span class="tag">${esc(c.kind)}</span><span>${esc(j.company)}</span></div><button class="title-button" data-detail="${esc(j.id)}">${esc(v.title)}</button><p>${esc(v.responsibilities.join('；'))}</p><button class="text-link" data-detail="${esc(j.id)}">职责版本与来源 ↗</button></article>`}).join('')}</details>`:''}
      ${knowledgeChanges.length?`<details class="timeline-extra"><summary>知识与行业地图更新 <span>${knowledgeChanges.length} 条 · 查看沉淀与修订</span></summary>${knowledgeChanges.map(h=>{const n=[...db.valuechain.items,...db.landscape].find(n=>n.id===h.nodeId);return `<p><a class="text-link" href="#${h.nodeId.startsWith('chain')?'valuechain':'landscape'}">${esc(n?.name||h.nodeId)} ↗</a> · ${Object.keys(h.changes).length} 项字段修订 · ${h.lessonChanges.length} 条知识补充</p>`}).join('')}<p class="small">按实际修改时间记录；仅复核、内容未变的轮次不计为知识更新。</p></details>`:''}
      ${educationChanges.length?`<details class="timeline-extra"><summary>学习硬件研究更新 <span>${educationChanges.length} 份档案 · 实际整理时间</span></summary><p class="small">新增资料基线或档案修订，可能引用历史材料，不计作当天新品新闻。</p>${educationChanges.map(h=>{const p=db.education.profiles.find(p=>p.id===h.profileId);return p?`<p><a href="#education/${p.categoryIds[0]}/${encodeURIComponent(p.company)}">${esc(p.company)} · ${p.categoryIds.map(id=>esc(db.education.categories.find(c=>c.id===id).name)).join(' / ')} ↗</a></p>`:''}).join('')}</details>`:''}
      <details class="timeline-extra timeline-evidence"><summary>本日覆盖与证据边界 <span>${d.failedSources.length?'存在读取失败':'查看检查范围'}</span></summary><p>${esc(d.coverage)}</p><p class="small">正文整理 ${d.reviewedCount} 条 · 日报生成于 ${esc(date(d.generatedAt,true))}</p>${[...d.failedSources,...d.knownGaps].map(x=>`<p class="small">${esc(x)}</p>`).join('')}${d.revisions?.length?`<p class="small">覆盖不足后已补跑，保留 ${d.revisions.length} 份原版。${link('https://jordanfu.github.io/hardware-intelligence/data/daily.json','查看修订记录')}</p>`:''}</details></div></section>`;
    }).join('')}</div>${!visible.length?empty('该日期尚无日报记录','可以返回完整时间线查看已有内容。','<a class="secondary" href="#daily">返回完整时间线</a>'):''}${!editionDate&&editions.length>timelineLimit?'<button class="secondary load-more" data-timeline-more>继续查看更早 7 天 ↓</button>':''}`;
}
const knowledgeFields={title:'知识主题',flow:'交付链路',team:'团队接口',basics:'基础概念',metrics:'指标口径',pitfall:'常见误读',exercise:'学习任务',examples:'观察对象',chain:'价值链',constraint:'关键约束'};
function knowledgeOverview(ids) {
 const records=ids.map(id=>db.knowledge.nodes[id]).filter(Boolean),op=db.operations.knowledge;
 const reviewed=records.filter(n=>n.fullReviewedAt&&(Date.now()-new Date(n.fullReviewedAt))/864e5<op.reviewIntervalDays).length;
 const latest=records.map(n=>n.updatedAt).filter(Boolean).sort().at(-1);
 return `<div class="notice knowledge-overview"><strong>知识持续维护 · 每日补充，${op.reviewIntervalDays} 天一轮复核</strong><p>每天轮换检查至少 ${op.dailyReviewMinimum} 个节点，覆盖全链路知识与行业地图。当前本页 ${reviewed}/${ids.length} 个节点完成本周期全部字段复核，其余保留待核验范围。${latest?'最近实质更新 '+esc(date(latest,true))+'。':'尚无实质内容修订。'}</p><p>只有内容改变才更新“内容更新”时间；复核通过不等于企业做法已获独立验证。</p></div>`;
}
function knowledgePanel(id) {
 const n=db.knowledge.nodes[id];if(!n)return '<div class="knowledge-note"><strong>待首轮复核</strong><p class="small">初始框架保留，尚无逐项复核记录；不能将页面发布时间视为知识已更新。</p></div>';
 const invalid=[...new Set([...n.evidence.map(e=>e.itemId),...n.lessons.flatMap(l=>l.itemIds)])].some(i=>!itemById(i)?.selected||!itemById(i)?.practices?.length);
 const due=new Date(n.fullReviewedAt||db.knowledge.startedAt).getTime()+db.operations.knowledge.reviewIntervalDays*864e5;
 const state=invalid?'依据已变更 · 待重新核验':Date.now()>=due?'复核已到期':({reviewed:'本轮完整复核',partial:'部分复核 · 仍有待核验项',error:'复核受阻 · 保留历史'}[n.status]);
 const history=db.knowledge.history.filter(h=>h.nodeId===id&&(Object.keys(h.changes).length||h.lessonChanges.length)).slice(-3).reverse();
 return `<div class="knowledge-note"><div class="meta"><span class="tag">${esc(state)}</span></div><p class="small">内容更新：${n.updatedAt?esc(date(n.updatedAt,true)):'尚无修订'}<br>最近复核：${n.reviewedAt?esc(date(n.reviewedAt,true)):'尚无有效复核'} · 复核期限：${esc(date(due))}</p>${n.lessons.map(l=>`<article class="knowledge-lesson"><h3>${esc(l.title)}</h3><p>${esc(l.learning)}</p><p><strong>怎样使用：</strong>${esc(l.application)}</p><p class="small">${esc(l.boundary)}</p><div class="knowledge-links">${l.itemIds.map(i=>{const a=itemById(i);return a?`<button class="text-link" data-detail="${esc(i)}">依据：${esc(a.title)} ↗</button>${a.sources.map(x=>link(x.url,x.name)).join(' · ')}`:''}).join('')}</div></article>`).join('')}<details class="knowledge-review"><summary>复核依据与修改记录</summary><p>${esc(n.assessment)}</p><p class="small">已检查：${n.reviewedFields.map(f=>esc(knowledgeFields[f])).join('、')||'尚未完成'}。未覆盖字段仍按原始框架阅读。</p>${(n.sourceChecks||[]).map(c=>`<p class="small">依据查阅 ${esc(date(c.checkedAt,true))} · ${esc({body:'正文',index:'索引片段',cached:'本地缓存',error:'访问失败'}[c.state])} · ${esc(c.note)}</p>`).join('')}${n.gaps.map(g=>`<p class="small">待核验：${esc(g)}</p>`).join('')}${n.evidence.map(e=>`<p class="small">${esc(e.title)} · ${esc(e.boundary)} ${e.sources.map(x=>link(x.url,x.name)+'（原文 '+esc(x.publishedAt?date(x.publishedAt):'未标日期')+'）').join(' / ')}</p>`).join('')}${history.map(h=>`<div class="knowledge-revision"><p class="small">${esc(date(h.reviewedAt,true))}</p>${Object.entries(h.changes).map(([f,c])=>`<p><strong>${esc(knowledgeFields[f])}</strong><br>原：${esc(c.before)}<br>现：${esc(c.after)}</p>`).join('')}${h.lessonChanges.length?`<p class="small">沉淀 / 修订 ${h.lessonChanges.length} 条知识补充。</p>`:''}</div>`).join('')}</details></div>`;
}
function valuechain() {
  return '<div class="notice"><a href="#education">学习硬件专题 ↗</a> · 用学习机、手表、阅读器、词典笔和录音设备，观察这条链路中的具体问题。</div>'+head('THE COMPLETE VALUE CHAIN','把产、销、研放在同一张图上。','每个环节都回答：输入是什么，向谁交付，如何判断完成。问题和反馈也会沿链路返回。')+knowledgeOverview(db.valuechain.items.map(n=>n.id))+`<div class="notice">${esc(db.valuechain.note)}</div><div class="chain-map">${db.valuechain.items.map((s,i)=>`<a href="#stage-${i+1}" data-stage-scroll="stage-${i+1}"><span>0${i+1}</span>${esc(s.name)}</a>`).join('')}</div><div class="grid-2">${db.valuechain.items.map((s,i)=>{const n=db.intelligence.items.filter(x=>x.selected).flatMap(x=>x.practices||[]).filter(p=>p.stages.includes(s.name)).length;return `<article class="map-card" id="stage-${i+1}"><span class="index">0${i+1} / ${esc(s.name)}</span><h2>${esc(s.title)}</h2><p class="chain">${esc(s.flow)}</p><h3>先理解</h3><p>${esc(s.basics)}</p><h3>团队接口</h3><p>${esc(s.team)}</p><h3>指标与常见误读</h3><p>${esc(s.metrics)}</p><p class="small">避免：${esc(s.pitfall)}</p><details><summary>用一个小任务学会</summary><p>${esc(s.exercise)}</p></details><div class="toolbar"><button class="secondary" data-detail="${s.referenceId}">看一个有来源的案例 ↗</button><button class="text-link" data-practice-stage="${esc(s.name)}">${n} 条实践线索 ↗</button></div>${knowledgePanel(s.id)}</article>`}).join('')}</div>`;
}
function practiceCards(items) {return items.flatMap(n=>(n.practices||[]).filter(p=>chainStage==='全部'||p.stages.includes(chainStage)).map(p=>`<article class="org-card"><div class="meta"><span class="tag">${esc(p.evidenceLevel)}</span><time>${esc(n.publishedAt?date(n.publishedAt):'原文未标日期')}</time></div><h2>${esc(p.title)}</h2><p>${esc(p.method)}</p><h3>适用条件</h3><p>${esc(p.conditions)}</p><h3>结果证据</h3><p>${esc(p.outcome)}</p><p class="small">${esc(p.boundary)}</p><h3>下一步核验</h3><p>${esc(p.nextCheck)}</p><button class="secondary" data-detail="${n.id}">原文事实与来源 ↗</button></article>`)).join('');}
function practices() {
  const items=db.intelligence.items.filter(n=>n.selected&&inScope(n)&&n.practices?.length);
  return head('PRACTICE OBSERVATORY','先看怎么做，再看是否有效。','将已披露做法、历史案例和实践线索分开。没有可比结果和适用条件，不标为“行业最优”。')+chainFilter()+`<div class="grid-2">${practiceCards(items)||empty('暂无该环节的实践记录','知识地图仍可用于建立观察问题。')}</div>`;
}
function organizations() {
  const items=db.intelligence.items.filter(n=>inScope(n)&&n.organization?.length);
  return head('ORGANIZATION SIGNALS','从公开行动，研究团队接口。','研究披露的协作机制与能力需求；组织图、净增人数和效率后果没有证据就保留未知。')+editorialFreshness()+`<div class="notice"><a href="#education">学习硬件组织研究 ↗</a> · 作业帮、科大讯飞、猿辅导的五类岗位职责与证据边界。</div><div class="lower-banner"><div><h3>招聘，是另一扇观察窗口。</h3><p>按岗位族整理职责和协作对象，跟踪同一职位的变化。</p></div><a href="#recruitment" class="secondary">岗位与人才 ↗</a></div>`+chainFilter()+`<div class="grid-2">${items.flatMap(n=>n.organization.map(o=>`<article class="org-card"><span class="tag">${esc(o.kind)}</span><p class="small">${esc(n.sources[0].name)} · ${esc(n.publishedAt?date(n.publishedAt):'原文未标日期')}</p><h2>${esc(o.title)}</h2><p>${esc(o.observation)}</p><h3>可继续研究什么</h3><p>${esc(o.implication)}</p><p class="small">${esc(o.boundary)}</p><button class="secondary" data-detail="${n.id}">查看事实证据 ↗</button></article>`)).join('')||empty('暂无匹配的组织记录','尝试其他环节或岗位栏目。')}</div><details class="method"><summary>展开历史组织案例 · ${db.organizations.length} 份</summary>${historicalOrganizations()}</details>`;
}
function recruitment() {
  const all=db.recruitment.jobs;const jobs=all.filter(j=>(chainStage==='全部'||j.stages.includes(chainStage))&&(jobFamily==='全部'||j.family===jobFamily));
  const families=[...new Set(all.map(j=>j.family))];
  return head('JOBS AS ORGANIZATION SIGNALS','从岗位职责，看见能力需求。','比较工作内容、协作接口与持续变化，为岗位设计、人才储备和面试追问提供线索。')+`<div class="notice">已积累 ${all.length} 个岗位样本，${new Set(all.map(j=>j.company)).size} 家公司。最近整理 ${esc(date(db.recruitment.checkedAt,true))}。${(Date.now()-new Date(db.recruitment.checkedAt))/36e5>36?"岗位观察已超过 36 小时，按历史样本阅读。":""}样本并非完整在招清单，不计算行业缺口或净增人数；单次未见、搜索缓存和页面失败分别记录。</div>`+chainFilter()+`<div class="toolbar"><label>岗位族 <select id="job-family">${['全部',...families].map(f=>`<option ${f===jobFamily?'selected':''}>${esc(f)}</option>`).join('')}</select></label><span>当前 ${jobs.length} 个职责样本 · 岗位数 ≠ 招聘人数</span></div><div class="grid-2">${jobs.map(j=>`<article class="org-card"><div class="meta"><span class="tag">${esc(j.family)}</span><span>${esc(j.access)} · ${esc(j.change)}</span></div><p class="small">${esc(j.company)} · ${esc(j.location)}</p><h2>${esc(j.title)}</h2><p>${esc(j.responsibilities.join('；'))}</p><h3>职责与协作边界</h3><p>${esc(j.interfaces.join('；'))}</p><h3>人员决策待验证问题</h3><p>${esc(j.decisionQuestion)}</p><p class="small">${esc(j.boundary)}</p><div class="toolbar"><button class="secondary" data-detail="${j.id}">来源、要求与变化记录 ↗</button>${saveButton(j.id)}</div></article>`).join('')||empty('无匹配岗位样本','目前尚未形成完整行业覆盖。')}</div><section class="method"><h2>人员决策观察 · 证据与解释分开</h2><div class="grid-2">${(db.recruitment.insights||[]).map(i=>`<article><h3>${esc(i.title)}</h3><p><strong>依据：</strong>${esc(i.finding)}</p><p><strong>解读：</strong>${esc(i.interpretation)}</p><p><strong>另一种解释：</strong>${esc(i.alternative)}</p><p><strong>下一步：</strong>${esc(i.nextAction)}</p><p class="small">${esc(i.boundary)} · 整理 ${esc(date(i.reviewedAt))}</p>${i.jobIds.map(id=>`<button class="text-link" data-detail="${id}">查看岗位证据 ↗</button>`).join('')}</article>`).join('')}</div></section><section class="method"><h2>这些线索可以怎样用于人员决策</h2><div class="grid-2"><div><h3>补充能力，先核对业务任务</h3><p>比较岗位负责的输入、输出与验收，而不只比较职位名称。某种能力在多个独立样本中出现，可形成储备线索，不能直接等同人才短缺。</p></div><div><h3>发现接口，先问清支持条件</h3><p>跨设计、量产和售后职责可能意味着岗位需要协调能力，也可能意味着职责过载。人员配置前应核对权限、工作量、可用支持和员工负担。</p></div></div><h3>变化如何记录</h3><p>以公司和岗位 ID 去重；没有 ID 时按公司、职位和地点匹配。首次收录标为基线；相同岗位保留职责版本。只有完整列表成功检查才能标记“本次未见”，明确关闭需要原文证明。重新出现也不直接认定为扩编。</p><h3>最近扫描边界</h3>${db.recruitment.scans.slice(-8).map(s=>`<p class="small">${esc(s.company)} · ${esc(s.note)} · ${esc(date(s.checkedAt,true))}</p>`).join('')}</section>`;
}
function sources() {
 const f=freshness(), run=db.intelligence.runs.at(-1);
 return head('SOURCE & METHOD','每个判断，都有来处。','原始来源、中文理解、研究推断分别呈现。来源失败和没有新内容是两种状态。')+editorialFreshness()+`<section class="method"><h2>从发现到发布</h2><div class="flow">${['公开发现','读取正文','评分与证据复核','事件归组','中文 brief','日报与组织研究'].map(s=>`<span>${esc(s)}</span>`).join('')}</div><p>GitHub Actions 每日 ${esc(db.operations.rssTimes.join(" / "))} 抓取 RSS；Codex 每日 ${esc(db.operations.editorialTime)} 读取公开来源，补充国内公司与全链路资料，再生成中文 brief、组织线索和岗位观察，验证后发布。${esc(db.operations.recoveryTime)} 检查并补跑缺失步骤。计划执行可能延迟；Codex 需要本机与应用可用。</p><p>参考 AI HOT 的正文门槛、官方优先、事件去重和日报机制。本站采用 ${esc(db.intelligence.method)}。按相关性、增量信息、证据质量、机制清晰、可行动性各 0–20 分；官方门槛 70，媒体 80；复核不通过不入精选。</p><p>同事件保留各原始来源，精选和 RSS 以代表报道出现；同一发布方只计一次，不能称独立交叉核验。日报最多 8 条，同发布方最多 2 条；近 7 期重复进展不再收录，实质新进展须有新的官方行为证据。已出日报保留历史。</p><p>无正文不凭标题写摘要。原始全文仅作本地核对，不公开转载。公开记录保留来源、日期、正文或片段标识、内容哈希和事实定位。官方披露只证明其说法，效果需另证；招聘只作能力线索。</p><p>RSS 抓取最近成功：${esc(date(db.radar.lastSuccessfulAt,true))}；本轮 ${f.total-f.failed}/${f.total} 个成功。AI 整理和 RSS 状态独立，超过 36 小时会提醒。</p><h3>本轮覆盖要求</h3><p>至少 ${db.operations.requirements.domesticCompanies} 家国内公司、${db.operations.requirements.nonResearchStages} 个非研发环节、${db.operations.requirements.recruitmentCompanies} 家官方招聘来源。每个来源有实际检查时间与结果，未达标不显示完成。</p><h3>最近一次中文整理覆盖</h3><p>${esc(run?.coverage)}</p>${[...(run?.failedSources||[]),...(run?.knownGaps||[])].map(s=>`<p class="small">${esc(s)}</p>`).join('')}</section><section class="method"><h2>本轮实际查阅记录</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>来源</th><th>结果</th><th>检查时间</th></tr></thead><tbody>${(run?.sourceChecks||[]).map(c=>`<tr><td>${link(c.url,c.company||c.name||'公开来源')}<small>${esc(c.stages.join(' / '))}</small></td><td>${esc({read:'正文可读',index:'索引片段',no_new:'检查范围内未见新增',error:'读取失败'}[c.state])}<small>${esc(c.note)}</small></td><td>${esc(date(c.checkedAt,true))}</td></tr>`).join('')}</tbody></table></div></section><div class="table-wrap"><table class="data-table"><thead><tr><th>信源</th><th>关注范围</th><th>方式与状态</th></tr></thead><tbody>${db.sources.map(s=>{const h=db.radar.health.find(x=>x.id===s.id);return `<tr><td>${link(s.home,s.name)}<small>${esc(s.tier)}</small></td><td>${esc(s.scope)}</td><td>${s.auto?'RSS 每日发现':'Codex 研究目录 · 按轮次查阅'}<small>${h?esc(h.state==='ok'?`抓取成功 · ${h.matched} 条`:`抓取失败：${h.error}`):'列入目录不等于本轮已经读取，实际范围以上方扫描记录为准。'}</small></td></tr>`}).join('')}</tbody></table></div><section class="method"><h2>使用与隐私边界</h2><p>只使用公开企业资料和岗位描述，不采集候选人或员工个人信息，不推断个人绩效。收藏与笔记只保存在当前浏览器，可自行导出。没有后台登录、跨设备同步或实时问答。</p><div class="toolbar">${link('https://github.com/KKKKhazix/AIHOT/blob/main/docs/selection.md','AI HOT 方法参考')}${link('https://github.com/JordanFu/hardware-intelligence/actions','发布运行记录')}${link('https://github.com/JordanFu/hardware-intelligence/blob/main/docs/editorial-runbook.md','自动整理规则')}</div></section>`;
}

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
    ...db.intelligence.items,
    ...db.recruitment.jobs,
    ...db.valuechain.items,
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
  const rich=!!n.brief, rss=!!n.sourceId;
  return `<article class="news-row"><span class="news-number">${String(index+1).padStart(2,'0')}</span><div><div class="meta"><span class="tag">${esc(n.stages?.join(' / ')||n.category)}</span><span>${rich?'AI 中文整理':rss?'待摘要 · 未读正文':esc(n.kind||'研究资料')}</span><time>${esc(n.date?'原文 '+date(n.date):'原文未标日期')}</time></div><button class="title-button" data-detail="${esc(n.id)}">${esc(n.title)}</button><p>${esc(n.summary||(rss?'尚未取得可核对正文，暂不生成核心内容。可打开原始来源阅读。':''))}</p><div class="row-bottom"><span>${esc(n.sources?n.sources.map(s=>s.name).join(' / '):n.source)}</span><button class="text-link" data-detail="${esc(n.id)}">${rich?'核心内容 · 原始证据':'来源与阅读边界'} ↗</button></div></div>${saveButton(n.id)}</article>`;
}
function freshness() {
  const hours =
    (Date.now() - new Date(db.radar.lastSuccessfulAt || 0).getTime()) / 36e5;
  const failed = db.radar.health.filter((h) => h.state !== "ok").length;
  return { hours, failed, total: db.sources.filter((s) => s.auto).length };
}
function radar() {
  let items = db.radar.items.filter(
    (n) =>
      (category === "全部" || n.category === category) &&
      (tier === "全部" || n.tier === tier) &&
      (radarDay === "全部" || day(n.date) === radarDay) && inScope(n),
  );
  const dates = db.digests.dates;
  const f = freshness();
  return (
    head(
      "SIGNALS & SOURCES",
      "动态雷达",
      "公开信源的自动发现，按原文发布时间排列。先找到线索，再回到原文核验。",
    ) +
    `<div class="notice ${f.failed || f.hours > 36 ? "warning" : ""}">${f.failed ? `${f.failed} 个信源本次抓取失败，保留已有历史。` : "最近一轮所有自动信源抓取成功。"} 最近检查：${esc(date(db.radar.checkedAt, true))}。${f.hours > 36 ? "数据已超过 36 小时未成功更新。" : ""} 已读正文展示中文核心 brief；未读条目标为待摘要。分类由关键词与内容整理共同产生，AI 整理未经人工核验。</div>${chips()}${chainFilter()}<div class="toolbar"><label for="radar-date">每日索引</label><select id="radar-date"><option value="全部">全部日期</option>${dates.map((d) => `<option value="${d.date}" ${radarDay === d.date ? "selected" : ""}>${d.date} · ${d.ids.length} 条</option>`).join("")}</select><select id="radar-tier" aria-label="信源级别">${["全部", "官方一手", "媒体补充"].map((t) => `<option ${tier === t ? "selected" : ""}>${t}</option>`).join("")}</select><span class="count-label">共 ${items.length} 条 · 每日索引按北京时间</span></div><div class="news-list">${items.length ? items.slice(0, limit).map(newsRow).join("") : empty("当前筛选下没有条目", "这表示当前已收录数据没有匹配结果，不代表行业没有新动态。")}</div>${items.length > limit ? '<button class="secondary load-more" data-more>再显示 30 条</button>' : ""}<p class="small" style="margin-top:18px">保留最近 90 天，最多 400 条自动条目。发现层按链接去重；整理层按事件归组，同一发布方的多篇文章不是独立交叉核验。</p>`
  );
}
function landscape() {
  return (
    head(
      "INDUSTRY LANDSCAPE",
      "先看全局，再选一条线深入。",
      "按产品约束理解智能硬件：从上游器件到用户任务，从研发协作到交付运营。",
    ) +
    knowledgeOverview(db.landscape.map(n=>n.id)) + `<div class="notice">这是本站持续维护的学习框架，观察对象仅为示例。每个领域的竞争和组织设计都要回到具体产品、阶段与证据。</div><div class="grid-3">${db.landscape.map((t, i) => `<article class="map-card"><span class="index">FIELD ${String(i + 1).padStart(2, "0")}</span><h2>${esc(t.name)}</h2><p>${esc(t.title)}</p><h3>价值链</h3><div class="chain">${esc(t.chain)}</div><h3>先理解的约束</h3><p>${esc(t.constraint)}</p><h3>观察对象举例</h3><p>${esc(t.examples)}</p><button class="secondary" data-detail="${t.id}">查看团队与研究指标 ↗</button>${knowledgePanel(t.id)}</article>`).join("")}</div><section class="method"><h2>贯穿所有领域的产品链条</h2><div class="flow">${["真实任务", "系统方案", "验证与量产", "交付与持续服务"].map((t, i) => `${i ? "<i>→</i>" : ""}<span>${t}</span>`).join("")}</div><p>每一步都应回答：用户少做了什么，谁负责交付，用什么证据判断完成。新品发布只证明链条上的一个节点。</p></section>`
  );
}
function historicalOrganizations() {
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
    ["学习硬件", db.education.profiles.map(p=>({...p,title:p.company+' · '+p.categoryIds.map(id=>db.education.categories.find(c=>c.id===id).name).join(' / '),summary:p.brief.lead}))],
    ["中文整理", db.intelligence.items],
    ["岗位与人才", db.recruitment.jobs],
    ["全链路知识", db.valuechain.items],
    ["初始精选", db.curated.items],
    ["组织案例", db.organizations],
    ["行业地图", db.landscape],
    ["学习路径", db.learning],
    ["自动动态 · 待摘要", db.radar.items.filter(n=>!n.brief)],
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
      `找到 ${hits.length} 条结果，涵盖中文情报、组织案例、岗位、全链路知识与自动动态。`,
    ) +
    `<button class="secondary" data-clear-search>清空搜索</button>${
      hits.length
        ? hits
            .slice(0, 100)
            .map(
              ({ type, item }) =>
                `<button class="search-result" ${type==='学习硬件'?`data-education-profile="${item.id}"`:`data-detail="${item.id}"`}><div class="result-type">${esc(type)}</div><strong>${esc(item.title || item.name)}</strong><p>${esc(item.summary || item.subtitle || item.constraint || item.source || "")}</p></button>`,
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
    briefing, daily, education, valuechain, practices, recruitment,
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
  if(n.brief) html += `<div class="notice"><strong>本文核心内容</strong><p>${esc(n.brief.lead)}</p><ul>${n.brief.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div><details><summary>原标题与整理信息</summary><p>${esc(n.originalTitle)}</p><p>${esc(n.status)} · ${esc(date(n.generatedAt,true))}</p><p>筛选分数 ${n.score}/100 · ${esc(n.selection.review.reason)}</p></details>`;
  if(n.responsibilities) html+=(n.businessScope?section('业务归属',n.businessScope+'：'+n.scopeNote):'')+section('岗位职责 · 整理',n.responsibilities.join('；'))+section('协作对象',n.interfaces.join('；'))+section('能力要求',n.requirements.join('；'))+section('人员决策待验证问题',n.decisionQuestion)+section('证据边界',n.boundary)+section('时间口径',`原文发布日期：${n.postedAt||'未标注'}；首次收录：${date(n.firstSeen,true)}；最近观察：${date(n.lastSeen,true)}；${n.access}`)+`<h3>职责版本与变化</h3>${n.versions.map(v=>`<details class="knowledge-revision"><summary>${esc(date(v.observedAt,true))} · ${esc(v.access)}</summary><p>职责：${esc(v.responsibilities.join('；'))}</p><p>接口：${esc((v.interfaces||[]).join('；'))}</p><p>要求：${esc((v.requirements||[]).join('；'))}</p>${v.scopeNote?`<p>业务范围：${esc(v.businessScope)} · ${esc(v.scopeNote)}</p>`:''}</details>`).join('')}`;
  if(n.basics) html+=section('基础概念',n.basics)+section('输入与输出',n.flow)+section('团队接口',n.team)+section('指标口径',n.metrics)+section('常见误读',n.pitfall)+section('学习任务',n.exercise);
  if (n.facts) {
    html += `<h3>可核对的公开事实</h3><ul>${n.facts.map((f) => `<li>${esc(typeof f==="string"?f:f.claim)}${typeof f==="object"?`<small> ${link(f.sourceUrl,f.locator)}</small>`:""}</li>`).join("")}</ul>`;
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
  const ev=n.eventId?db.intelligence.events.find(e=>e.id===n.eventId):null;
  if(ev?.itemIds.length>1)html+=`<h3>同一事件的其他报道</h3><p class="small">${ev.itemIds.length} 篇报道，${ev.publisherGroups.length} 个发布方；同源报道不构成独立交叉核验。</p>${ev.itemIds.filter(id=>id!==n.id).map(id=>`<p><button class="text-link" data-detail="${id}">${esc(itemById(id)?.title)}</button></p>`).join('')}`;
  const sources =
    n.sources || (n.responsibilities?[{name:n.company+" 官方招聘",url:n.url,date:n.postedAt||"未标注；查阅时间见上方"}]:null) ||
    (n.sourceId
      ? [{ name: n.source, url: n.url, date: date(n.date) }]
      : n.source
        ? [n.source]
        : []);
  html += `<h3>原始来源</h3>${sources.map((s) => `<a class="source-link" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗<small>来源日期：${esc(s.date||s.publishedAt||"未标注")}${s.coverage?` · ${s.coverage==="body"?"已取得正文":"已取得正文片段"} · 查阅 ${esc(date(s.readAt,true))}`:""} · 点击阅读原文</small></a>`).join("")}<h3><label for="research-note">我的研究笔记 · 仅保存在本机</label></h3><textarea id="research-note" data-note="${n.id}" placeholder="记下你的判断、疑问或下一步验证动作…" maxlength="10000" rows="4">${esc(local.notes[n.id] || "")}</textarea><div class="dialog-bottom">${saveButton(n.id, true)}<button class="secondary" data-save-note="${n.id}">保存笔记</button><button class="secondary" data-copy="${n.id}">复制条目链接</button></div>`;
  $("#dialog-body").innerHTML =
    `<div class="dialog-header"><span class="small">${esc(n.period || n.category || n.family || "研究资料")}${n.date ? " · " + esc(date(n.date)) : ""}</span><button class="icon-button" data-close aria-label="关闭详情">×</button></div><div class="dialog-content"><span class="tag">${esc(n.responsibilities ? "公开岗位 · 能力需求线索" : n.brief ? "AI 中文整理 · 非人工核验" : n.sourceId ? "自动发现 · 待摘要" : n.label || n.kind || "学习框架")}</span><h2>${esc(n.title || n.name)}</h2>${html}</div>`;
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
  let raw = location.hash.slice(1) || "daily";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = "daily";
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
    route = navs.some((n) => n[0] === path[0]) ? path[0] : "daily";
    if(route==='education'){educationCategory=db.education.categories.some(c=>c.id===path[1])?path[1]:'all';educationCompany=db.education.profiles.some(p=>p.company===path[2])?path[2]:'all';}
    editionDate = route==='daily'&&/^\d{4}-\d{2}-\d{2}$/.test(path[1]||'')?path[1]:'';
    timelineLimit = 7;
    chainStage = "全部";
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
  if(b.dataset.stageScroll){e.preventDefault();document.getElementById(b.dataset.stageScroll)?.scrollIntoView({behavior:'smooth'});return;}
  if(b.dataset.practiceStage){chainStage=b.dataset.practiceStage;route='practices';history.pushState(null,'','#practices');render();window.scrollTo({top:0});return;}
  if (b.dataset.detail) openDetail(b.dataset.detail);
  if (b.dataset.save) toggleSave(b.dataset.save);
  if (b.hasAttribute("data-close")) closeDetail();
  if (b.dataset.category) {
    category = b.dataset.category;
    limit = 30;
    render();
  }
  if(b.hasAttribute("data-timeline-more")){timelineLimit+=7;render();}
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
  if(e.target.id==='education-company'){location.hash='education/'+educationCategory+'/'+encodeURIComponent(e.target.value);}
  if(e.target.id==='chain-stage'){chainStage=e.target.value;render();}
  if(e.target.id==='domestic-only'){domesticOnly=e.target.checked;render();}
  if(e.target.id==='edition-date'){location.hash=e.target.value?'daily/'+e.target.value:'daily';}
  if(e.target.id==='education-role'){educationRole=e.target.value;render();document.getElementById('education-workforce')?.scrollIntoView({block:'start'});}
  if(e.target.id==='job-family'){jobFamily=e.target.value;render();}
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
    "digests", "intelligence", "daily", "industry", "valuechain", "recruitment", "operations", "health", "knowledge", "education",
  ];
  const values = await Promise.all(
    names.map(async (n) => {
      const res = await fetch(`data/${n}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${n}: HTTP ${res.status}`);
      return res.json();
    }),
  );
  db = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  db.valuechain.items=db.valuechain.items.map(n=>({...n,...(db.knowledge.nodes[n.id]?.patch||{})}));
  db.landscape=db.landscape.map(n=>({...n,...(db.knowledge.nodes[n.id]?.patch||{})}));
  const enriched = new Map(db.intelligence.items.map(n=>[n.id,n]));
  db.radar.items=db.radar.items.map(n=>({...n,...(enriched.get(n.id)||{})}));
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
