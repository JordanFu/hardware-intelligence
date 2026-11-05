"""Public RSS discovery. No LLM, no full-text publication, no promotion to curated."""
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'site/data'
UTC = dt.timezone.utc
RULES = [
 ('可穿戴与眼镜', r'\b(glasses|wearable|galaxy ring|galaxy watch|smartwatch|headset|earbuds)\b|眼镜|可穿戴|智能手表|智能戒指|耳机'),
 ('机器人与无人机', r'robot|humanoid|drone|isaac|gr00t|机器人|无人机|具身|机器狗'),
 ('智能家居', r'smart home|smartthings|\bmatter\b|homekit|home assistant|智能家居|扫地|智能门锁'),
 ('制造与创作', r'3d print|bambu|swaptek|makerworld|cnc|3d.?打印|拓竹|激光雕刻'),
 ('端侧 AI 与芯片', r'jetson|\bedge ai\b|embedded|microcontroller|\bfpga\b|\bsbc\b|\brisc-v\b|\bnpu\b|端侧|芯片|模组|开发板|传感器'),
]
EXCLUDE = re.compile(r'black friday|coupon|discount|giveaway|抽奖|优惠券|限时直降', re.I)
def canonical(url):
 p=urlsplit(url.strip())
 if p.scheme not in ('https','http') or not p.hostname or p.username: raise ValueError('invalid public URL')
 query=urlencode(sorted((k,v) for k,v in parse_qsl(p.query) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid','gclid','ref')))
 return urlunsplit((p.scheme.lower(),p.netloc.lower(),p.path.rstrip('/') or '/',query,''))
def clean(value): return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',value or ''))).strip()
def category(title, source_id):
 if EXCLUDE.search(title):return None
 for label,pattern in RULES:
  if re.search(pattern,title,re.I):return label
 if source_id=='bambu':return '制造与创作'
 if re.search(r'大疆|安克|石头科技|追觅|科沃斯|宇树|影石|绿米|雷鸟|xreal|xtool|小米|anker|roborock|dreame|ecovacs|unitree|insta360|aqara|rayneo',title,re.I) and re.search(r'供应|制造|质量|召回|售后|招聘|渠道|库存|量产|研发|团队|组织|销售|supplier|quality|recall|manufactur|hiring|retail|inventory',title,re.I):return '产品工程与量产'
 return None

def parse_feed(raw, source, now):
 root=ET.fromstring(raw)
 if root.tag not in ('rss', '{http://www.w3.org/2005/Atom}feed'):
  raise ValueError('Response is not an RSS or Atom feed')
 items=root.findall('./channel/item')
 atom={'a':'http://www.w3.org/2005/Atom'}
 if not items:items=root.findall('a:entry',atom)
 found=[]; rejected=0
 for item in items:
  title=clean(item.findtext('title') or item.findtext('a:title',namespaces=atom))
  link=item.findtext('link')
  if not link:
   link_node=item.find('a:link',atom);link=link_node.get('href') if link_node is not None else None
  date=item.findtext('pubDate') or item.findtext('a:published',namespaces=atom) or item.findtext('a:updated',namespaces=atom)
  label=category(title,source['id'])
  if not label or not link or not date:rejected+=1;continue
  try:
   try: published=email.utils.parsedate_to_datetime(date)
   except (ValueError,TypeError):published=dt.datetime.fromisoformat(date.replace('Z','+00:00'))
   if published.tzinfo is None: raise ValueError('timezone absent')
   published=published.astimezone(UTC)
   # Future timestamps are never silently presented as news.
   if published>now or now-published>dt.timedelta(days=90):rejected+=1;continue
   url=canonical(link)
  except (ValueError,TypeError,OverflowError):rejected+=1;continue
  found.append(dict(id='rss-'+hashlib.sha256(url.encode()).hexdigest()[:16],title=title[:240],url=url,date=published.isoformat(),sourceId=source['id'],source=source['name'],tier=source['tier'],category=label,status='待核验',discoveredAt=now.isoformat()))
 return found,len(items),rejected

def fetch(source, now):
 try:
  p=subprocess.run(['curl','--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-time','30','--max-filesize','8000000','--retry','1','--user-agent','HardwareAtlas/1.0 (+https://github.com/JordanFu/hardware-intelligence)',source['url']],capture_output=True,timeout=70)
  if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace').strip()[:240])
  rows,total,rejected=parse_feed(p.stdout,source,now)
  return rows,dict(id=source['id'],state='ok',checkedAt=now.isoformat(),lastSuccessAt=now.isoformat(),received=total,matched=len(rows),excluded=rejected,error=None)
 except Exception as e:
  return [],dict(id=source['id'],state='error',checkedAt=now.isoformat(),error=str(e)[:260])

def main():
 now=dt.datetime.now(UTC)
 sources=json.loads((DATA/'sources.json').read_text())
 previous=json.loads((DATA/'radar.json').read_text()) if (DATA/'radar.json').exists() else {'items':[],'health':[]}
 oldhealth={h['id']:h for h in previous['health']}
 rows=[];health=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for items,h in pool.map(lambda s:fetch(s,now),[s for s in sources if s['auto']]):
   rows+=items
   if h['state']=='error':h['lastSuccessAt']=oldhealth.get(h['id'],{}).get('lastSuccessAt')
   health.append(h)
 # Keep a bounded history across transient failures. URL dedup only; no guessed event merges.
 byurl={}
 for item in previous['items']+rows:
  if now-dt.datetime.fromisoformat(item['date'])>dt.timedelta(days=90):continue
  key=canonical(item['url'])
  if key in byurl:item['discoveredAt']=byurl[key]['discoveredAt']
  byurl[key]=item
 merged=sorted(byurl.values(),key=lambda x:x['date'],reverse=True)[:400]
 result=dict(checkedAt=now.isoformat(),lastSuccessfulAt=now.isoformat() if any(h['state']=='ok' for h in health) else previous.get('lastSuccessfulAt'),health=health,items=merged)
 target=DATA/'radar.json'; temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
 print(json.dumps({'sourcesOk':sum(h['state']=='ok' for h in health),'sourcesTotal':len(health),'items':len(merged),'checkedAt':result['checkedAt']}))
 for h in health:
  if h['state']=='error':print(f"::warning::Source {h['id']} failed; cached history retained. {h['error']}")
 if not any(h['state']=='ok' for h in health):print('::warning::All sources failed. Freshness must not be inferred from this run.')
if __name__=='__main__':main()
