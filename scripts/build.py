import datetime as dt
import html
import json
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'site';DIST=ROOT/'dist'
base='https://jordanfu.github.io/hardware-intelligence/'
def build():
 if DIST.exists():shutil.rmtree(DIST)
 shutil.copytree(SITE,DIST)
 curated=json.loads((SITE/'data/curated.json').read_text())
 radar=json.loads((SITE/'data/radar.json').read_text())
 # A persistent archive lives in source; daily groups use publication dates in Asia/Shanghai.
 zone=dt.timezone(dt.timedelta(hours=8));groups={}
 for i in radar['items']:
  date=dt.datetime.fromisoformat(i['date']).astimezone(zone).date().isoformat()
  groups.setdefault(date,[]).append(i['id'])
 reports={'kind':'自动索引，不是人工研判日报','dates':[{'date':d,'ids':ids} for d,ids in sorted(groups.items(),reverse=True)]}
 (DIST/'data/digests.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
 from editorial import validate_artifacts
 validate_artifacts()
 for name in ['curated','organizations','landscape','learning','sources','intelligence','daily','recruitment','valuechain']:
  value=json.loads((SITE/f'data/{name}.json').read_text())
  assert value, name
 items=[]
 intel=json.loads((SITE/'data/intelligence.json').read_text());byid={i['id']:i for i in intel['items']}
 for n in [byid[e['representativeId']] for e in intel['events'] if e['selected']]:
  url=base+'#article/'+n['id']
  items.append(f'<item><title>{html.escape(n["title"])}</title><link>{html.escape(url)}</link><guid>{url}</guid><description>{html.escape(n["summary"])}</description></item>')
 (DIST/'feed.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>硬件观测 · 编辑精选</title><link>'+base+'</link><description>可追溯的智能硬件情报</description>'+''.join(items)+'</channel></rss>')
 (DIST/'llms.txt').write_text('# 硬件观测 / Hardware Atlas\n\n公开的智能硬件学习与研究站。事实、解释和未知项分离。\n\n- '+base+'data/intelligence.json 中文摘要、事件、组织与实践证据\n- '+base+'data/daily.json 历史日报与扫描边界\n- '+base+'data/valuechain.json 产销研全链路学习框架\n- '+base+'data/recruitment.json 岗位职责、时间口径与版本记录\n- '+base+'data/curated.json 初始研究资料，含来源和边界\n- '+base+'data/radar.json 自动 RSS 发现；按 ID 与 intelligence.json 合并可读中文 brief\n- '+base+'data/organizations.json 组织案例，带历史时间边界\n- '+base+'data/learning.json 学习路径\n- '+base+'data/sources.json 信源配置\n\n无私有数据、无模型实时回答、无内部组织信息。\n')
 from health import report
 (DIST/'data/health.json').write_text(json.dumps(report(),ensure_ascii=False,indent=2)+'\n')
 (DIST/'.nojekyll').touch()
 print('Built static site:',len(curated['items']),'curated;',len(radar['items']),'radar;',len(groups),'daily indexes')
if __name__=='__main__':build()
