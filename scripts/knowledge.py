"""Evidence-backed knowledge maintenance; scripts validate, Codex performs the review."""
import argparse,copy,datetime as dt,hashlib,json
from pathlib import Path
from editorial import DATA,WORK,load,write,now,timestamp,TZ,valid_text,canonical

FIELDS={'chain':{'title','flow','team','basics','metrics','pitfall','exercise'},'track':{'title','examples','chain','constraint','team','metrics'}}
def catalog(data=DATA):
 return {n['id']:n for n in load(data/'valuechain.json')['items']+load(data/'landscape.json')}
def candidates(data=DATA):
 return {i['id']:i for i in load(data/'intelligence.json')['items'] if i.get('selected') and i.get('practices')}
def digest(item):
 return hashlib.sha256(json.dumps(item,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def plan(data=DATA,clock=None):
 clock=clock or now();config=load(data/'operations.json')['knowledge'];state=load(data/'knowledge.json');base=catalog(data)
 decisions={d['itemId']:d for run in state['runs'] for d in run['decisions']}
 pending=[{'itemId':key,'title':i['title'],'hash':digest(i)} for key,i in candidates(data).items() if decisions.get(key,{}).get('hash')!=digest(i)]
 nodes=[]
 for key,item in base.items():
  record=state['nodes'].get(key,{})
  due=timestamp(record.get('fullReviewedAt') or state['startedAt'])+dt.timedelta(days=config['reviewIntervalDays'])
  nodes.append({'nodeId':key,'name':item['name'],'dueAt':due.isoformat(),'overdue':clock>=due,'reviewedAt':record.get('reviewedAt'),'status':record.get('status','unreviewed')})
 nodes.sort(key=lambda n:(n['dueAt'],n['reviewedAt'] or '',n['nodeId']))
 latest=state['runs'][-1] if state['runs'] else {}
 daily=bool(latest.get('completedAt')) and timestamp(latest['completedAt']).astimezone(TZ).date()==clock.astimezone(TZ).date()
 failed=[key for key,n in state['nodes'].items() if n['status']=='error' and timestamp(n['attemptedAt']).astimezone(TZ).date()==clock.astimezone(TZ).date()]
 return {'checkedAt':clock.isoformat(),'failedNodes':failed,'dailyChecked':daily,'pendingCandidates':pending,'heldCandidates':[{'itemId':k,'reason':v['reason']} for k,v in decisions.items() if v['decision']=='hold' and k in candidates(data)],'nodes':nodes,'overdueCount':sum(n['overdue'] for n in nodes),'needsKnowledge':not daily or bool(pending) or bool(failed) or any(n['overdue'] for n in nodes)}

def merge(state,bundle,data=DATA,clock=None):
 clock=clock or now();stamp=clock.isoformat();base=catalog(data);items=candidates(data);out=copy.deepcopy(state)
 reviews=bundle.get('reviews',[]);config=load(data/'operations.json')['knowledge']
 if len({r['nodeId'] for r in reviews})!=len(reviews):raise ValueError('Duplicate node review')
 today=clock.astimezone(TZ).date()
 reviewed_today={key for run in state['runs'] if timestamp(run['completedAt']).astimezone(TZ).date()==today for key in run['reviewedNodes']}|{r['nodeId'] for r in reviews}
 if len(reviewed_today)<config['dailyReviewMinimum'] or {key.split('-')[0] for key in reviewed_today}!={'chain','track'}:raise ValueError('Daily review minimum must cover both pages')
 reviewed=[];integrated=set()
 for r in reviews:
  key=r['nodeId']
  if key not in base:raise ValueError('Unknown knowledge node')
  fields=FIELDS[key.split('-')[0]];scope=set(r.get('reviewedFields',[]))
  if not scope<=fields:raise ValueError('Invalid review fields')
  if r['status'] not in ('reviewed','partial','error'):raise ValueError('Invalid review status')
  valid_text(r.get('assessment'),'review assessment');gaps=r.get('gaps',[])
  refs=r.get('itemIds',[])
  if r['status']!='error' and not refs:raise ValueError('Review requires evidence')
  if not set(refs)<=set(items):raise ValueError('Evidence must be selected and have practices')
  checks=r.get('sourceChecks',[]);usable=set();bodies=set()
  for c in checks:
   iid=c['itemId']
   if iid not in refs or canonical(c['url']) not in {canonical(x['url']) for x in items[iid]['sources']}:raise ValueError('Review source does not match evidence')
   checked=timestamp(c['checkedAt'])
   if checked>clock+dt.timedelta(minutes=5) or checked.astimezone(TZ).date()!=clock.astimezone(TZ).date():raise ValueError('Source must be checked today')
   if c['state'] not in ('body','index','cached','error'):raise ValueError('Invalid source access state')
   valid_text(c.get('note'),'source access note')
   if c['state']!='error':usable.add(iid)
   if c['state']=='body':bodies.add(iid)
  if r['status']!='error' and not set(refs)<=usable:raise ValueError('Every reference needs a usable check')
  if r['status']=='reviewed' and not set(refs)<=bodies:raise ValueError('Full review requires current source bodies')
  patch=r.get('patch',{});lessons=r.get('lessons',[])
  if not set(patch)<=scope:raise ValueError('Changed fields must be reviewed')
  if r['status']=='error' and (patch or lessons):raise ValueError('Failed source cannot change knowledge')
  if r['status']=='reviewed' and (scope!=fields or gaps):raise ValueError('Full review must cover all fields without unresolved gaps')
  evidence=[]
  for iid in refs:
   i=items[iid]
   evidence.append({'itemId':iid,'title':i['title'],'facts':i['facts'],'boundary':i['boundary'],'sources':i['sources']})
  old=out['nodes'].get(key,{})
  node=copy.deepcopy(old);node.update(attemptedAt=stamp,status=r['status'],assessment=r['assessment'],gaps=gaps,reviewedFields=sorted(scope),evidence=evidence,sourceChecks=checks)
  if r['status']!='error':node['reviewedAt']=stamp
  if r['status']=='reviewed':node['fullReviewedAt']=stamp
  changes={}
  node.setdefault('patch',{})
  for field,value in patch.items():
   valid_text(value,'knowledge field')
   before=node['patch'].get(field,base[key][field])
   if before!=value:changes[field]={'before':before,'after':value};node['patch'][field]=value
  current={x['id']:x for x in node.get('lessons',[])};lesson_changes=[]
  for lesson in lessons:
   for field in ('id','title','learning','application','boundary'):valid_text(lesson.get(field),'lesson '+field,2)
   if not lesson.get('itemIds') or not set(lesson['itemIds'])<=set(refs):raise ValueError('Lesson evidence outside review')
   clean={k:lesson[k] for k in ('id','title','learning','application','boundary','itemIds')}
   previous=current.get(clean['id']);before={k:v for k,v in (previous or {}).items() if k!='updatedAt'}
   if clean!=before:
    lesson_changes.append({'before':previous,'after':clean});current[clean['id']]={**clean,'updatedAt':stamp}
   integrated.update(clean['itemIds'])
  node['lessons']=list(current.values())
  if changes or lesson_changes:node['updatedAt']=stamp
  out['nodes'][key]=node
  out['history'].append({'nodeId':key,'reviewedAt':stamp,'status':r['status'],'assessment':r['assessment'],'gaps':gaps,'reviewedFields':sorted(scope),'changes':changes,'lessonChanges':lesson_changes,'evidence':evidence,'sourceChecks':checks})
  reviewed.append(key)
 decisions=bundle.get('decisions',[])
 if len({d['itemId'] for d in decisions})!=len(decisions):raise ValueError('Duplicate candidate decision')
 prior={d['itemId']:d for run in state['runs'] for d in run['decisions']}
 pending={key for key,i in items.items() if prior.get(key,{}).get('hash')!=digest(i)}
 if not pending<={d['itemId'] for d in decisions}:raise ValueError('Every new or changed practice needs a disposition')
 public=[]
 for d in decisions:
  iid=d['itemId'];valid_text(d.get('reason'),'candidate reason')
  if iid not in items or d['decision'] not in ('integrated','hold'):raise ValueError('Invalid candidate decision')
  if d['decision']=='integrated' and iid not in integrated:raise ValueError('Integrated candidate must be cited in a lesson')
  public.append({'itemId':iid,'hash':digest(items[iid]),'decision':d['decision'],'reason':d['reason']})
 out['runs'].append({'completedAt':stamp,'reviewedNodes':reviewed,'decisions':public})
 return out

def validate(data=DATA):
 state=load(data/'knowledge.json');base=catalog(data);allids={i['id'] for i in load(data/'intelligence.json')['items']}
 for key,n in state['nodes'].items():
  assert key in base and set(n.get('patch',{}))<=FIELDS[key.split('-')[0]]
  assert n['evidence'] or n['status']=='error'
  assert all(e['itemId'] in allids for e in n['evidence'])
  assert all(set(l['itemIds'])<=allids for l in n['lessons'])
  assert n.get('updatedAt') or not n['patch'] and not n['lessons']
 return state

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','publish','validate']);parser.add_argument('--bundle',default=str(WORK/'knowledge-bundle.json'));args=parser.parse_args()
 if args.action=='prepare':
  result=plan();write(WORK/'knowledge-queue.json',result);print(json.dumps(result,ensure_ascii=False,indent=2))
 elif args.action=='publish':
  result=merge(load(DATA/'knowledge.json'),load(Path(args.bundle)));write(DATA/'knowledge.json',result);print('Knowledge reviewed nodes:',len(result['nodes']))
 else:validate();print('Knowledge references and fields valid')
