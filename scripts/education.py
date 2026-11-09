"""Learning hardware profiles: evidence, real review dates and a daily/weekly queue."""
import argparse, copy, datetime as dt, hashlib, re
from pathlib import Path
from editorial import DATA, WORK, load, write, now, timestamp, TZ, normalize
from collect import canonical
CATEGORIES={'tablet','watch','reader','pen','recorder'}
FIELDS={'brief','dimensions','boundary','gaps','sources','facts','categoryIds'}
DIMENSIONS={'product','content','channel','delivery','organization'}

def plan(data=DATA, clock=None):
    clock=clock or now(); state=load(data/'education.json'); config=load(data/'operations.json')['education']
    def recent(value, days):return bool(value) and dt.timedelta(0)<=clock-timestamp(value)<dt.timedelta(days=days)
    checks=[c for r in state['runs'] for c in r['checks']]
    today=[c for c in checks if timestamp(c['checkedAt']).astimezone(TZ).date()==clock.astimezone(TZ).date()]
    core={p['company'] for p in state['profiles'] if p['tier']=='核心竞品'}
    checked={c['company'] for c in today if c['state'] in ('body','excerpt')}
    due=[p['id'] for p in state['profiles'] if not recent(p.get('reviewedAt'),config['reviewIntervalDays'])]
    covered={cat for c in checks if c['state'] in ('body','excerpt') and recent(c['checkedAt'],7) for cat in c['categoryIds']}
    pending=[p['id'] for p in state['profiles'] if not p.get('facts')]
    recruiting={c['company'] for c in checks if c.get('purpose')=='recruitment' and c['state'] in ('body','excerpt') and recent(c['checkedAt'],7)} & core
    recruiting_due=not recent(state['startedAt'],7) and len(recruiting)<2
    from recruitment import research_plan
    workforce=research_plan(load(data/'recruitment.json',{}),clock,config['dailyRecruitmentCompanies']) if config.get('dailyRecruitmentCompanies') else None
    if workforce:
        recruiting_due=workforce['needsResearch']
        recruiting={j['company'] for j in load(data/'recruitment.json',{}).get('jobs',[]) if j.get('educationResearch') and recent(j['lastSeen'],7)}
    daily=len(core&checked)>=config['dailyCoreCompanies']
    return dict(workforce=workforce,today=daily,coreCompaniesChecked=sorted(core&checked),overdueProfiles=due,pendingProfiles=pending,recruitmentCompaniesChecked=sorted(recruiting),needsRecruitment=recruiting_due,firstRecruitmentDueAt=(timestamp(state['startedAt'])+dt.timedelta(days=7)).isoformat(),uncoveredCategories=sorted(CATEGORIES-covered),needsEducation=not daily or bool(due) or bool(pending) or bool(CATEGORIES-covered) or recruiting_due,checkedAt=max((c['checkedAt'] for c in checks),default=None))

def validate(value=None,data=DATA):
    state=value or load(data/'education.json'); ids=set()
    assert {c['id'] for c in state['categories']}==CATEGORIES,'five categories required'
    for p in state['profiles']:
        assert p['id'] not in ids;ids.add(p['id'])
        assert p['categoryIds'] and set(p['categoryIds'])<=CATEGORIES
        assert set(p['dimensions'])==DIMENSIONS
        assert len(p['brief']['lead'])>=20 and 2<=len(p['brief']['points'])<=4
        assert p['boundary'] and p['gaps'] is not None
        sourceids={s['id'] for s in p['sources']}
        for s in p['sources']:
            canonical(s['url']);assert s['role'] in ('official','developer','media')
            assert s['coverage'] in ('body','excerpt') and re.fullmatch('[a-f0-9]{64}',s['textHash'])
            timestamp(s['readAt'])
        for f in p['facts']:assert f['sourceId'] in sourceids and f['claim'] and f['locator']
        if p['facts']:assert p['sources'] and p.get('updatedAt') and p.get('reviewedAt')
    for r in state['runs']:
        assert r['summary'] and r['checks']
        for c in r['checks']:
            assert c['state'] in ('body','excerpt','index','error') and c['note']
            canonical(c['url']);timestamp(c['checkedAt']);assert set(c['categoryIds'])<=CATEGORIES
    return state

def publish(bundle,data=DATA,work=WORK,clock=None):
    clock=clock or now();state=copy.deepcopy(load(data/'education.json'));byid={p['id']:p for p in state['profiles']}
    newids=set()
    for identity in bundle.get('newProfiles',[]):
        pid=identity['id']
        if pid in byid or not re.fullmatch(r'[a-z0-9-]{1,80}',pid):raise ValueError('Invalid or duplicate new profile')
        if identity['tier'] not in ('核心竞品','相邻场景','海外参照','场景对照') or not identity['company'].strip():raise ValueError('Invalid profile identity')
        p={k:identity[k] for k in ('id','company','tier','categoryIds')}
        p.update(aliases=identity.get('aliases',[identity['company']]),brief={'lead':'等待本轮已核对正文建立公开资料档案，未核验的信息不填充。','points':['等待可核对的原始资料。','未知项保留，不猜测参数和结果。']},dimensions={k:'待核验' for k in DIMENSIONS},boundary='待核验',gaps=[],sources=[],facts=[],updatedAt=None,reviewedAt=None)
        state['profiles'].append(p);byid[pid]=p;newids.add(pid)
    reviews=bundle.get('reviews',[]);checks=bundle.get('checks',[])
    if not checks:raise ValueError('Actual source checks required')
    for c in checks:
        if c['company'] not in {p['company'] for p in state['profiles']}:raise ValueError('Unknown company')
        if not c['categoryIds'] or not set(c['categoryIds'])<=CATEGORIES:raise ValueError('Unknown category')
        if c['state'] in ('body','excerpt') and not re.fullmatch(r'[a-zA-Z0-9-]+',c.get('readId','')):raise ValueError('Invalid read identifier')
        if timestamp(c['checkedAt']).astimezone(TZ).date()!=clock.astimezone(TZ).date():raise ValueError('Check must be from today')
        if timestamp(c['checkedAt'])>clock:raise ValueError('Future check')
        if c['state'] in ('body','excerpt'):
            raw=load(work/(c['readId']+'.json'))
            if not raw or raw['bodyStatus']!=c['state'] or len(raw.get('text',''))<250 or canonical(raw['url'])!=canonical(c['url']):raise ValueError('Readable source required')
            if timestamp(raw['readAt']).astimezone(TZ).date()!=clock.astimezone(TZ).date():raise ValueError('Cached body cannot prove a current check')
    seen=set()
    for r in reviews:
        pid=r['profileId'];p=byid[pid]
        if pid in seen:raise ValueError('Duplicate profile review')
        seen.add(pid);patch=r.get('patch',{})
        if not set(patch)<=FIELDS:raise ValueError('Unknown patch fields')
        related=[c for c in checks if c['company']==p['company'] and set(c['categoryIds'])&set(p['categoryIds'])]
        usable=[c for c in related if c['state'] in ('body','excerpt')]
        if not related or not r.get('assessment'):raise ValueError('Review needs checks and assessment')
        if r['status']=='error':
            if patch:raise ValueError('Failed reviews cannot change content')
        elif r['status']=='reviewed':
            if not usable:raise ValueError('No current evidence for review')
            if patch:
                # New facts and sources are submitted together; anchors remain private.
                if not patch.get('facts') or not patch.get('sources'):raise ValueError('Facts and sources cannot be empty')
                if not {'facts','sources'}<=set(patch):raise ValueError('Changed profile requires facts and sources')
                sources=[];reads={}
                for s in patch['sources']:
                    raw=load(work/(s['readId']+'.json'))
                    if not any(c['readId']==s['readId'] and canonical(c['url'])==canonical(s['url']) for c in usable):raise ValueError('Source not checked')
                    reads[s['id']]=raw
                    sources.append({k:v for k,v in s.items() if k!='readId'}|dict(readAt=raw['readAt'],coverage=raw['bodyStatus'],textHash=hashlib.sha256(raw['text'].encode()).hexdigest()))
                for f in patch['facts']:
                    if len(f.get('anchor',''))<6 or normalize(f['anchor']) not in normalize(reads[f['sourceId']]['text']):raise ValueError('Unmatched fact anchor')
                patch=copy.deepcopy(patch);patch['sources']=sources;patch['facts']=[{k:v for k,v in f.items() if k!='anchor'} for f in patch['facts']]
            p['reviewedAt']=clock.isoformat()
        else:raise ValueError('Unknown review status')
        # Access dates/hashes alone never advance substantive content time.
        before={k:copy.deepcopy(p.get(k)) for k in patch}
        def substantive(k,v):return [{a:b for a,b in s.items() if a not in ('readAt','textHash','coverage')} for s in v] if k=='sources' else v
        changes={k:dict(before=before[k],after=v) for k,v in patch.items() if substantive(k,before[k])!=substantive(k,v)}
        p.update(patch)
        if changes:p['updatedAt']=clock.isoformat()
        p['lastReviewStatus']=r['status']
        state['history'].append(dict(profileId=pid,reviewedAt=clock.isoformat(),status=r['status'],assessment=r['assessment'],changes=changes))
    if any(not byid[pid]['facts'] for pid in newids):raise ValueError('New profiles require evidence-backed review in the same bundle')
    state['runs'].append(dict(completedAt=clock.isoformat(),summary=bundle['summary'],checks=[{k:v for k,v in c.items() if k!='readId'} for c in checks]))
    validate(state,data);write(data/'education.json',state)
    return state

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','publish','validate']);parser.add_argument('--bundle',default=str(WORK/'education-bundle.json'));args=parser.parse_args()
    if args.command=='prepare':
        queue=plan();queue['profiles']=load(DATA/'education.json')['profiles'];write(WORK/'education-queue.json',queue);print({k:v for k,v in queue.items() if k!='profiles'})
    elif args.command=='publish':publish(load(Path(args.bundle)));print('Education evidence and review history published')
    else:validate();print('Education data valid')
if __name__=='__main__':main()
