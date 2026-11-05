"""Evidence-gated Codex editorial pipeline. No hidden model API calls.
prepare: creates a local queue. publish: validates a Codex-written bundle and makes public artifacts.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from article_text import read_url
from collect import canonical
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'site/data';WORK=ROOT/'work/editorial'
TZ=dt.timezone(dt.timedelta(hours=8));UTC=dt.timezone.utc

def load(path,default=None):return json.loads(path.read_text()) if path.exists() else default

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(path)

def now():return dt.datetime.now(UTC)

def timestamp(s):
    v=dt.datetime.fromisoformat(s.replace('Z','+00:00'))
    return v.replace(tzinfo=TZ) if v.tzinfo is None else v

def industry():return load(DATA/'industry.json')

def normalize(text):return re.sub(r'\s+',' ',text).strip().lower()

def priority(item):
    title=item.get('title','').lower();domestic=any(any(a.lower() in title for a in c['aliases']) for c in industry()['companies'])
    chain=bool(re.search(r'供应|制造|质量|召回|售后|渠道|团队|组织|量产|supplier|quality|recall|manufactur|service notice',title))
    return (domestic,chain,item['date'])

def prepare():
    WORK.mkdir(parents=True,exist_ok=True)
    previous=load(DATA/'intelligence.json',{'items':[]});known={i['id'] for i in previous['items']}
    allitems=load(DATA/'radar.json')['items'];items=sorted([i for i in allitems if i['id'] not in known],key=priority,reverse=True)[:30]
    def read(item):
        out=WORK/(item['id']+'.json')
        cached=load(out)
        if cached and cached.get('text') and cached.get('url')==item['url']:return dict(id=item['id'],state='cached',path=str(out.relative_to(ROOT)))
        try:
            text=read_url(item['url']);payload={**item,'text':text,'bodyStatus':'body','readAt':now().isoformat(),'textHash':hashlib.sha256(text.encode()).hexdigest()};write(out,payload)
            return dict(id=item['id'],state='read',path=str(out.relative_to(ROOT)))
        except Exception as e:return dict(id=item['id'],state='needs_browser',error=str(e),url=item['url'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:reads=list(pool.map(read,items))
    queue={'createdAt':now().isoformat(),'items':items,'reads':reads,'companies':industry()['companies'],'stages':industry()['stages'],'instruction':'Read docs/editorial-runbook.md. Add domestic official sources and all-chain practice research. Do not write briefs from titles.'}
    write(WORK/'queue.json',queue);print(json.dumps({'queue':len(items),'read':sum(x['state'] in ('read','cached') for x in reads),'needsBrowser':sum(x['state']=='needs_browser' for x in reads)}))

def valid_text(v,label,minlen=8,maxlen=3000):
    if not isinstance(v,str) or not minlen<=len(v.strip())<=maxlen:raise ValueError('Invalid '+label)

def validate_entry(entry,reads):
    # Mechanical checks do not establish truth: the Codex evidence review is retained for audit.
    for key in ('id','eventId','developmentId'):
        if not re.fullmatch(r'[a-z0-9-]{1,100}',entry.get(key,'')):raise ValueError('Invalid '+key)
    valid_text(entry.get('titleZh'),'Chinese title',6,180)
    brief=entry.get('brief',{});valid_text(brief.get('lead'),'brief lead',20,700)
    if not re.search('[\u4e00-\u9fff]',brief['lead']):raise ValueError('Brief must be Chinese')
    if not 2<=len(brief.get('points',[]))<=4:raise ValueError('Need 2-4 brief points')
    for point in brief['points']:valid_text(point,'brief point',8,500)
    if not entry.get('stages') or not set(entry['stages'])<=set(industry()['stages']):raise ValueError('Unknown chain stage')
    if not isinstance(entry.get('domestic'),bool):raise ValueError('domestic must be bool')
    sources=entry.get('sources',[])
    if not sources:raise ValueError('No sources')
    validids=set();public_sources=[]
    for source in sources:
        sid=source['readId'];read=reads.get(sid)
        if not read or read.get('bodyStatus') not in ('body','excerpt') or len(read.get('text',''))<250:raise ValueError('No readable source body: '+sid)
        if canonical(source['url'])!=canonical(read['url']):raise ValueError('Source URL mismatch')
        if source['publishedAt'] and timestamp(source['publishedAt'])>now():raise ValueError('Future source publication')
        if not source.get('publisherGroup') or source.get('role') not in ('official','media','research'):raise ValueError('Source provenance missing')
        validids.add(sid);public_sources.append({k:v for k,v in source.items() if k!='readId'}|{'textHash':hashlib.sha256(read['text'].encode()).hexdigest(),'readAt':read['readAt'],'coverage':read['bodyStatus']})
    facts=entry.get('facts',[])
    if not facts:raise ValueError('No facts')
    for fact in facts:
        valid_text(fact.get('claim'),'fact')
        if fact.get('readId') not in validids:raise ValueError('Fact source not in entry')
        anchor=fact.get('anchor','');valid_text(anchor,'evidence anchor',6,300)
        if normalize(anchor) not in normalize(reads[fact['readId']]['text']):raise ValueError('Evidence anchor not found for '+entry['id'])
        valid_text(fact.get('locator'),'source locator',3,300)
    selection=entry.get('selection',{});scores=selection.get('scores',{})
    if set(scores)!=set(industry()['selection']['dimensions']) or any(type(v)!=int or not 0<=v<=20 for v in scores.values()):raise ValueError('Invalid scoring rubric')
    review=selection.get('review',{})
    if review.get('decision') not in ('pass','hold','reject'):raise ValueError('Missing second evidence review')
    valid_text(review.get('reason'),'review rationale')
    for field in ('boundary','meaning','question','eventReason'):
        valid_text(entry.get(field),field)
    if entry.get('publishedAt') and timestamp(entry['publishedAt'])>now():raise ValueError('Invalid publication date')
    if not entry.get('publishedAt') and entry.get('kind')!='常青资料':raise ValueError('Undated content must be evergreen')
    # Only independently sourced outcomes may justify an outcome label; default is disclosure/practice lead.
    for org in entry.get('organization',[]):
        if org.get('kind') not in ('已披露机制','能力需求线索','研究问题'):raise ValueError('Invalid organization evidence type')
        for f in ('title','observation','implication','boundary'):valid_text(org.get(f),'organization '+f)
        if not org.get('factIndexes') or any(type(i)!=int or i<0 or i>=len(facts) for i in org['factIndexes']):raise ValueError('Organization must refer to facts')
    for practice in entry.get('practices',[]):
        for f in ('title','method','conditions','outcome','boundary','nextCheck'):valid_text(practice.get(f),'practice '+f)
        if not set(practice.get('stages',[]))<=set(entry['stages']) or not practice.get('stages'):raise ValueError('Practice stage invalid')
        if not practice.get('factIndexes') or any(type(i)!=int or i<0 or i>=len(facts) for i in practice['factIndexes']):raise ValueError('Practice needs facts')
        if practice.get('evidenceLevel') not in ('官方披露做法','历史案例','实践线索','独立结果待核验'):raise ValueError('Do not claim best practice without evidence')
    allowed={'id','eventId','developmentId','titleZh','originalTitle','brief','stages','domestic','companies','selection','boundary','meaning','question','eventReason','publishedAt','kind','category','organization','practices','newDevelopment','developmentReason'}
    if entry.get('newDevelopment'):valid_text(entry.get('developmentReason'),'new development evidence',20)
    result={k:v for k,v in entry.items() if k in allowed}
    result['facts']=[{'claim':f['claim'],'sourceUrl':reads[f['readId']]['url'],'locator':f['locator']} for f in facts]
    result['sources']=public_sources;result['score']=sum(scores.values())
    threshold=industry()['selection']['officialThreshold'] if sources[0]['role']=='official' else industry()['selection']['mediaThreshold']
    result['selected']=result['score']>=threshold and review['decision']=='pass'
    result['status']='AI 整理 · 未经人工核验';result['generatedAt']=now().isoformat()
    result['sourceDate']=entry['publishedAt'];result['date']=entry['publishedAt'];result['title']=entry['titleZh'];result['summary']=brief['lead']
    return result

def events_for(items):
    groups={}
    for i in items:groups.setdefault(i['eventId'],[]).append(i)
    result=[]
    for eid,rows in groups.items():
        # Official representation, then quality; a publisher counts once, regardless of article count.
        rows.sort(key=lambda i:(i['sources'][0]['role']!='official',-i['score'],i['publishedAt'] or ''))
        selected=[i for i in rows if i['selected']]
        latest=max(selected,key=lambda i:i['publishedAt'] or '') if selected else None
        representative=next((i for i in rows if i['selected'] and i['developmentId']==latest['developmentId']),rows[0]) if latest else rows[0]
        result.append({'id':eid,'representativeId':representative['id'],'itemIds':[i['id'] for i in rows],'publisherGroups':sorted({s['publisherGroup'] for i in rows for s in i['sources']}),'developmentIds':sorted({i['developmentId'] for i in rows}),'selected':any(i['selected'] for i in rows)})
    return result

def make_digest(items,events,previous,run,clock=None):
    clock=clock or now();stamp=clock.astimezone(TZ).date().isoformat();bootstrap=not previous
    prior=sorted([d for d in previous if d['date']<stamp],key=lambda d:d['date'],reverse=True)[:7]
    seen={tuple(p) for d in prior for p in d['developmentKeys']}
    previous_today=next((d for d in previous if d['date']==stamp),None)
    if previous_today:return previous_today # published editions are immutable; corrections require explicit command/new record
    byid={i['id']:i for i in items};candidates=[]
    for ev in events:
        eligible=[byid[x] for x in ev['itemIds'] if byid[x].get('selected') and byid[x].get('publishedAt')]
        eligible.sort(key=lambda x:x['publishedAt'],reverse=True)
        i=next((x for x in eligible if (ev['id'],x['developmentId']) not in seen),None)
        if not i:continue
        if not i.get('publishedAt'):continue
        if clock-timestamp(i['publishedAt'])>dt.timedelta(days=14 if bootstrap else 3):continue
        if (ev['id'],i['developmentId']) in seen:continue
        # A repeated event enters again only when its documented first-party action changes.
        if any(eid==ev['id'] for eid,_ in seen) and not (i.get('newDevelopment') and i['sources'][0]['role']=='official' and i.get('developmentReason')):continue
        candidates.append(i)
    candidates.sort(key=lambda i:(not i['domestic'],-i['score'],i['publishedAt']),reverse=False)
    slots=[];publisher_counts={}
    for i in candidates:
        publisher=i['sources'][0]['publisherGroup']
        if publisher_counts.get(publisher,0)>=2:continue
        slots.append(i);publisher_counts[publisher]=publisher_counts.get(publisher,0)+1
        if len(slots)>=8:break
    state='partial' if run.get('failedSources') else 'complete'
    if not slots:state='partial' if run.get('failedSources') else ('no_new_qualifying_events' if run.get('successfulScan') else 'incomplete')
    return {'id':'daily-'+stamp,'date':stamp,'generatedAt':clock.isoformat(),'state':state,'bootstrap':bootstrap,'windowNote':'首次上线回补近 14 天；旧实践另列，不算当天新闻。' if bootstrap else '优先最近 72 小时的新事件；按北京时间出刊。7 期内同一进展不重复。','itemIds':[i['id'] for i in slots],'developmentKeys':[[i['eventId'],i['developmentId']] for i in slots],'reviewedCount':run['reviewedCount'],'failedSources':run.get('failedSources',[]),'coverage':run['coverage'],'knownGaps':run.get('knownGaps',[])}

def publish(bundle_path):
    bundle=load(Path(bundle_path));reads={p.stem:load(p) for p in WORK.glob('*.json') if p.name not in ('queue.json','bundle.json')}
    run=bundle['run'];valid_text(run.get('coverage'),'coverage note')
    entries=bundle['entries'];ids=[e['id'] for e in entries]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate batch')
    if not entries and not run.get('scannedSources'):raise ValueError('Empty scan needs source records')
    checked=[validate_entry(e,reads) for e in entries]
    old=load(DATA/'intelligence.json',{'items':[],'runs':[]});byid={i['id']:i for i in old['items']}
    for i in checked:
        previous=byid.get(i['id'])
        # Keep original timestamps for unchanged source content; do not refresh old stories cosmetically.
        if previous and [s['textHash'] for s in previous['sources']]==[s['textHash'] for s in i['sources']]:i['generatedAt']=previous['generatedAt']
        byid[i['id']]=i
    items=sorted(byid.values(),key=lambda i:i['publishedAt'] or '',reverse=True)
    events=events_for(items);run={**run,'completedAt':now().isoformat(),'reviewedCount':len(checked),'selectedCount':sum(i['selected'] for i in checked)}
    result={'schemaVersion':1,'lastCompletedAt':run['completedAt'],'method':'Codex 初筛评分 + 逐条证据复核；非两个独立模型评分','items':items,'events':events,'runs':(old.get('runs',[])+[run])[-30:]}
    history=load(DATA/'daily.json',{'editions':[]});edition=make_digest(items,events,history['editions'],run)
    if not any(d['date']==edition['date'] for d in history['editions']):history['editions'].insert(0,edition)
    history['editions']=history['editions'][:90]
    # All validation occurs before either public file is changed.
    write(DATA/'intelligence.json',result);write(DATA/'daily.json',history)
    print(json.dumps({'briefs':len(items),'events':len(events),'selected':sum(e['selected'] for e in events),'dailyStories':len(edition['itemIds']),'editionState':edition['state']},ensure_ascii=False))

def validate_artifacts():
    data=load(DATA/'intelligence.json');assert data and data['items']
    ids={i['id'] for i in data['items']};assert len(ids)==len(data['items'])
    for i in data['items']:
        assert i['facts'] and i['brief']['lead'] and i['boundary'] and i['sources']
        assert 'text' not in i and 'anchors' not in i
        for source in i['sources']:assert source['textHash'] and source['readAt'] and canonical(source['url'])
    for event in data['events']:assert event['representativeId'] in ids and set(event['itemIds'])<=ids
    for edition in load(DATA/'daily.json')['editions']:assert set(edition['itemIds'])<=ids
    jobs=load(DATA/'recruitment.json');assert len({j['id'] for j in jobs['jobs']})==len(jobs['jobs'])
    print('Editorial, daily and recruitment artifact checks passed')

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','publish','validate']);p.add_argument('--bundle',default=str(WORK/'bundle.json'));args=p.parse_args()
    if args.action=='prepare':prepare()
    elif args.action=='publish':publish(args.bundle)
    else:validate_artifacts()
if __name__=='__main__':main()
