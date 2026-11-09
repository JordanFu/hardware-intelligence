// Scope by an explicit product category, never by a diversified company's name alone.
export const educationPatterns = {
 tablet: /学习机|学练机|学习平板|教育空间|LeapPad|Kids Tablet|Fire Kids/i,
 watch: /儿童手表|电话手表|小天才.*手表/i,
 reader: /电子阅读器|电纸书|Kindle(?!\s*Fire)|掌阅.*阅读器|文石.*阅读器/i,
 pen: /词典笔|翻译笔|扫描笔/i,
 recorder: /AI.?录音|智能录音|录音设备|DingTalk.?A1|钉钉.?A1|Xnote|QwenNote/i,
};
export function educationCategories(item) {
 const explicit=item.educationCategories;
 if(Array.isArray(explicit)&&explicit.length)return explicit.filter(c=>Object.hasOwn(educationPatterns,c));
 // Facts/body may mention other products in passing; use the actual subject only.
 const text=[item.title,item.titleZh,item.originalTitle].filter(Boolean).join(' ');
 return Object.entries(educationPatterns).filter(([,rx])=>rx.test(text)).map(([id])=>id);
}
export function educationMatches(item,category='all',company='all',profiles=[]) {
 const cats=educationCategories(item);
 if(!cats.length || category!=='all'&&!cats.includes(category))return false;
 if(company==='all')return true;
 const aliases=profiles.filter(p=>p.company===company).flatMap(p=>p.aliases||[p.company]);
 const names=item.companies||[item.company].filter(Boolean);
 return names.some(n=>n===company||aliases.includes(n)) || aliases.some(a=>[item.title,item.titleZh,item.originalTitle].filter(Boolean).join(' ').includes(a));
}

// Organizational comparisons deliberately retain a visible scope label; product feeds do not.
export function educationResearchJobs(jobs,company='all') {
 return jobs.filter(j=>j.educationResearch===true && (company==='all'||j.company===company));
}
