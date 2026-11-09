"""Import evidence-backed public job observations; absence is not a closed vacancy."""
import argparse, copy, hashlib, json
from pathlib import Path
from editorial import DATA, WORK, load, write, now, normalize, valid_text, industry, timestamp
from collect import canonical
FIELDS=('title','family','location','responsibilities','interfaces','requirements','stages','businessScope','scopeNote','educationCategories')
EDUCATION_COMPANIES=('作业帮','科大讯飞','猿辅导（小猿）')
ROLE_FAMILIES=('教研','算法','硬件','供应链','渠道')
def source_allowed(company,url):
    from urllib.parse import urlsplit
    u=urlsplit(url);host=u.hostname or ''
    if u.scheme!='https' or u.username or u.password:return False
    if any(host==d or host.endswith('.'+d) for d in company['domains']):return True
    # Shared ATS hosts are trusted only for the verified employer tenant, never globally.
    return any(host==x['host'] and (u.path==x['path'] or u.path.startswith(x['path'].rstrip('/')+'/')) for x in company.get('recruitmentSources',[]))
def job_url_key(url):
    from urllib.parse import urlsplit
    u=urlsplit(url)
    return canonical(url)+('#'+u.fragment if u.fragment else '')

def research_plan(state,clock,minimum=2):
    import datetime as dt
    from editorial import TZ
    checks=[dict(c,company=s['company'],checkedAt=s['checkedAt']) for s in state.get('scans',[]) for c in s.get('familyChecks',[])]
    latest={(company,family):max((c for c in checks if c['company']==company and c['family']==family),key=lambda c:c['checkedAt'],default=None) for company in EDUCATION_COMPANIES for family in ROLE_FAMILIES}
    overdue=[dict(company=k[0],family=k[1]) for k,c in latest.items() if not c or c['state']=='error' or not dt.timedelta(0)<=clock-timestamp(c['checkedAt'])<dt.timedelta(days=7)]
    today=sorted({j['company'] for j in state.get('jobs',[]) if j.get('educationResearch') and j['access']=='正文可见' and timestamp(j['lastSeen']).astimezone(TZ).date()==clock.astimezone(TZ).date()})
    gaps=[c for c in latest.values() if c and c['state']!='body']
    return dict(companiesToday=today,overdueRoleChecks=overdue,evidenceGaps=gaps,needsResearch=len(today)<minimum or bool(overdue))


def merge(previous,batch,clock=None):
    clock=clock or now().isoformat();out=copy.deepcopy(previous)
    jobs={j['id']:j for j in out.get('jobs',[])};changes=out.get('changes',[])
    scans=batch.get('scans',[])
    if not scans:raise ValueError('Source scan records required')
    seen=set()
    for obs in batch.get('observations',[]):
        company=next((c for c in industry()['companies'] if c['name']==obs['company']),None)
        if not company or not source_allowed(company,obs['url']):raise ValueError('Job source must be official company domain or verified ATS tenant')
        if obs['access'] not in ('正文可见','搜索索引可见','明确关闭'):raise ValueError('Unknown access state')
        if obs.get('postedAt') and timestamp(obs['postedAt'])>timestamp(clock):raise ValueError('Future job date')
        for f in ('title','family','location','boundary','decisionQuestion'):valid_text(obs.get(f),f,2)
        for f in ('responsibilities','interfaces','requirements'):
            if not obs.get(f):raise ValueError('Job description missing '+f)
        if not set(obs['stages'])<=set(industry()['stages']):raise ValueError('Invalid job stage')
        read=load(WORK/(obs['readId']+'.json'))
        if not read or job_url_key(read['url'])!=job_url_key(obs['url']):raise ValueError('Missing job evidence')
        for anchor in obs.get('anchors',[]):
            if len(anchor)<6 or normalize(anchor) not in normalize(read['text']):raise ValueError('Job anchor absent')
        if not obs.get('anchors'):raise ValueError('Job anchors required')
        # Official posting id first; otherwise exact title+location within company, never title-only global merging.
        key=obs['company']+'|'+(obs.get('postingId') or obs['title']+'|'+obs['location'])
        jid='job-'+hashlib.sha256(key.encode()).hexdigest()[:16]
        if jid in seen:raise ValueError('Duplicate job observation')
        if obs.get('educationCategories') is not None:
            from education import CATEGORIES
            if not isinstance(obs['educationCategories'],list) or not obs['educationCategories'] or not set(obs['educationCategories'])<=CATEGORIES:raise ValueError('Unknown education category')
        seen.add(jid);old=jobs.get(jid);public={k:v for k,v in obs.items() if k in {'educationResearch','businessScope','scopeNote','educationCategories','company','title','family','location','stages','url','postedAt','access','responsibilities','interfaces','requirements','decisionQuestion','boundary','postingId','locator','coverage'}}
        if old:
            for field in ('educationResearch','businessScope','scopeNote','educationCategories'):
                if field not in public and field in old:public[field]=copy.deepcopy(old[field])
        if public.get('educationResearch'):
            from editorial import TZ
            if read.get('bodyStatus') not in ('body','excerpt') or not read.get('readAt') or timestamp(read['readAt'])>timestamp(clock) or timestamp(read['readAt']).astimezone(TZ).date()!=timestamp(clock).astimezone(TZ).date():raise ValueError('Education jobs require a current readable source')
            if obs['access']=='正文可见' and read['bodyStatus']!='body':raise ValueError('Excerpt cannot count as full job body')
            if obs['company'] not in EDUCATION_COMPANIES or obs['family'] not in ROLE_FAMILIES:raise ValueError('Unknown education research scope')
            if public.get('businessScope') not in ('硬件直接相关','教育业务参考','公司共享能力','相邻业务参考') or not public.get('scopeNote'):raise ValueError('Explicit business boundary required')
            if public.get('educationCategories') and public['businessScope']!='硬件直接相关':raise ValueError('Shared roles cannot imply a product category')
        bodyhash=hashlib.sha256(read['text'].encode()).hexdigest()
        public.update(id=jid,firstSeen=old['firstSeen'] if old else clock,lastSeen=clock,sourceHash=bodyhash)
        changed=[f for f in FIELDS if old and old.get(f)!=public.get(f)]
        kind='首次收录基线' if not old else ('职责或要求变化' if changed else '持续可见')
        if obs['access']=='明确关闭':
            if not obs.get('closureEvidence'):raise ValueError('Explicit closure needs evidence')
            if normalize(obs['closureEvidence']) not in normalize(read['text']):raise ValueError('Closure not in source')
            kind='来源明确关闭'
        public['change']=kind
        public['versions']=(old.get('versions',[]) if old else [])
        if not old or changed or (old and old['access']!=obs['access']):
            public['versions'].append({'observedAt':clock,'sourceHash':bodyhash,'access':obs['access'],**{f:public.get(f) for f in FIELDS}})
            changes.append({'jobId':jid,'observedAt':clock,'kind':kind,'fields':changed,'before':{f:old.get(f) for f in changed},'after':{f:public.get(f) for f in changed}})
        jobs[jid]=public
    # Unobserved jobs are retained. Even a complete list disappearance is only a visibility signal.
    for scan in scans:
        if scan.get('complete') and scan.get('state')=='ok':
            for j in jobs.values():
                if j['company']==scan['company'] and j['id'] not in seen:
                    if j.get('access')!='本次未见':changes.append({'jobId':j['id'],'observedAt':clock,'kind':'完整列表本次未见','fields':[],'before':{},'after':{}})
                    j['access']='本次未见';j['change']='完整列表本次未见'
    for scan in scans:
        for check in scan.get('familyChecks',[]):
            if scan['company'] not in EDUCATION_COMPANIES or check['family'] not in ROLE_FAMILIES or check['state'] not in ('body','scope_gap','index','error'):raise ValueError('Invalid role check')
            if not check.get('url') or not check.get('note'):raise ValueError('Role check needs source and boundary')
            if check['state']=='body' and (not check.get('jobIds') or any(j not in seen or jobs[j]['company']!=scan['company'] or jobs[j]['family']!=check['family'] or jobs[j]['access']!='正文可见' for j in check['jobIds'])):raise ValueError('Role check must cite this run jobs')
    if 'insights' in batch:
        for insight in batch['insights']:
            for field in ('title','finding','interpretation','alternative','nextAction','boundary'):
                valid_text(insight.get(field),'insight '+field)
            if not insight.get('jobIds') or not set(insight['jobIds'])<=set(jobs):raise ValueError('Insight must cite known jobs')
        merged={i.get('id',i['title']):copy.deepcopy(i) for i in out.get('insights',[])}
        for i in batch['insights']:
            key=i.get('id',i['title']);old=merged.get(key)
            public={k:v for k,v in i.items() if k in ('id','educationResearch','title','finding','interpretation','alternative','nextAction','boundary','jobIds')}
            if old and public=={k:v for k,v in old.items() if k not in ('reviewedAt','history')}:continue
            public['reviewedAt']=clock
            public['history']=copy.deepcopy(old.get('history',[])) if old else []
            if old:public['history'].append({k:v for k,v in old.items() if k!='history'})
            merged[key]=public
        out['insights']=list(merged.values())
    out.update(schemaVersion=1,checkedAt=clock,jobs=list(jobs.values()),changes=changes[-1000:],scans=(out.get('scans',[])+[{**s,'checkedAt':clock} for s in scans])[-100:])
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--bundle',required=True);args=p.parse_args()
    result=merge(load(DATA/'recruitment.json',{}),load(Path(args.bundle)))
    write(DATA/'recruitment.json',result);print('Jobs:',len(result['jobs']),'changes:',len(result['changes']))
