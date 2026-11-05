"""Import evidence-backed public job observations; absence is not a closed vacancy."""
import argparse, copy, hashlib, json
from pathlib import Path
from editorial import DATA, WORK, load, write, now, normalize, valid_text, industry, timestamp
from collect import canonical
FIELDS=('title','family','location','responsibilities','interfaces','requirements','stages')

def merge(previous,batch,clock=None):
    clock=clock or now().isoformat();out=copy.deepcopy(previous)
    jobs={j['id']:j for j in out.get('jobs',[])};changes=out.get('changes',[])
    scans=batch.get('scans',[])
    if not scans:raise ValueError('Source scan records required')
    seen=set()
    for obs in batch.get('observations',[]):
        company=next((c for c in industry()['companies'] if c['name']==obs['company']),None)
        from urllib.parse import urlsplit
        host=urlsplit(canonical(obs['url'])).hostname
        if not company or not any(host==d or host.endswith('.'+d) for d in company['domains']):raise ValueError('Job source must be official company domain')
        if obs['access'] not in ('正文可见','搜索索引可见','明确关闭'):raise ValueError('Unknown access state')
        if obs.get('postedAt') and timestamp(obs['postedAt'])>timestamp(clock):raise ValueError('Future job date')
        for f in ('title','family','location','boundary','decisionQuestion'):valid_text(obs.get(f),f,2)
        for f in ('responsibilities','interfaces','requirements'):
            if not obs.get(f):raise ValueError('Job description missing '+f)
        if not set(obs['stages'])<=set(industry()['stages']):raise ValueError('Invalid job stage')
        read=load(WORK/(obs['readId']+'.json'))
        if not read or canonical(read['url'])!=canonical(obs['url']):raise ValueError('Missing job evidence')
        for anchor in obs.get('anchors',[]):
            if len(anchor)<6 or normalize(anchor) not in normalize(read['text']):raise ValueError('Job anchor absent')
        if not obs.get('anchors'):raise ValueError('Job anchors required')
        # Official posting id first; otherwise exact title+location within company, never title-only global merging.
        key=obs['company']+'|'+(obs.get('postingId') or obs['title']+'|'+obs['location'])
        jid='job-'+hashlib.sha256(key.encode()).hexdigest()[:16]
        if jid in seen:raise ValueError('Duplicate job observation')
        seen.add(jid);old=jobs.get(jid);public={k:v for k,v in obs.items() if k in {'company','title','family','location','stages','url','postedAt','access','responsibilities','interfaces','requirements','decisionQuestion','boundary','postingId','locator','coverage'}}
        bodyhash=hashlib.sha256(read['text'].encode()).hexdigest()
        public.update(id=jid,firstSeen=old['firstSeen'] if old else clock,lastSeen=clock,sourceHash=bodyhash)
        changed=[f for f in FIELDS if old and old[f]!=obs[f]]
        kind='首次收录基线' if not old else ('职责或要求变化' if changed else '持续可见')
        if obs['access']=='明确关闭':
            if not obs.get('closureEvidence'):raise ValueError('Explicit closure needs evidence')
            if normalize(obs['closureEvidence']) not in normalize(read['text']):raise ValueError('Closure not in source')
            kind='来源明确关闭'
        public['change']=kind
        public['versions']=(old.get('versions',[]) if old else [])
        if not old or changed or (old and old['access']!=obs['access']):
            public['versions'].append({'observedAt':clock,'sourceHash':bodyhash,'access':obs['access'],**{f:obs[f] for f in FIELDS}})
            changes.append({'jobId':jid,'observedAt':clock,'kind':kind,'fields':changed,'before':{f:old[f] for f in changed},'after':{f:obs[f] for f in changed}})
        jobs[jid]=public
    # Unobserved jobs are retained. Even a complete list disappearance is only a visibility signal.
    for scan in scans:
        if scan.get('complete') and scan.get('state')=='ok':
            for j in jobs.values():
                if j['company']==scan['company'] and j['id'] not in seen:
                    if j.get('access')!='本次未见':changes.append({'jobId':j['id'],'observedAt':clock,'kind':'完整列表本次未见','fields':[],'before':{},'after':{}})
                    j['access']='本次未见';j['change']='完整列表本次未见'
    if 'insights' in batch:
        for insight in batch['insights']:
            for field in ('title','finding','interpretation','alternative','nextAction','boundary'):
                valid_text(insight.get(field),'insight '+field)
            if not insight.get('jobIds') or not set(insight['jobIds'])<=set(jobs):raise ValueError('Insight must cite known jobs')
        out['insights']=[{k:v for k,v in i.items() if k in ('title','finding','interpretation','alternative','nextAction','boundary','jobIds')}|{'reviewedAt':clock} for i in batch['insights']]
    out.update(schemaVersion=1,checkedAt=clock,jobs=list(jobs.values()),changes=changes[-1000:],scans=(out.get('scans',[])+[{**s,'checkedAt':clock} for s in scans])[-100:])
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--bundle',required=True);args=p.parse_args()
    result=merge(load(DATA/'recruitment.json',{}),load(Path(args.bundle)))
    write(DATA/'recruitment.json',result);print('Jobs:',len(result['jobs']),'changes:',len(result['changes']))
