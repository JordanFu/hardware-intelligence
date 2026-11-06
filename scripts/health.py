"""Public freshness report: collection, editorial and recruitment are independent."""
import datetime as dt,json,os
from pathlib import Path
from editorial import DATA,load,now,TZ,timestamp

def report(data=DATA,clock=None):
 clock=clock or now();local=clock.astimezone(TZ);today=local.date().isoformat()
 config=load(data/'operations.json');radar=load(data/'radar.json');intel=load(data/'intelligence.json');jobs=load(data/'recruitment.json');daily=load(data/'daily.json')
 def same_day(value):return bool(value) and timestamp(value).astimezone(TZ).date()==local.date()
 latest=intel.get('runs',[])[-1] if intel.get('runs') else {}
 edition=next((x for x in daily['editions'] if x['date']==today),None)
 covered=latest.get('coverageCheck',{}).get('passed',False)
 scanned=same_day(intel.get('lastCompletedAt')) and latest.get('successfulScan') is True
 job_companies={s['company'] for s in jobs.get('scans',[]) if same_day(s.get('checkedAt')) and s['state']!='error'}
 jobs_covered=len(job_companies)>=config['requirements']['recruitmentCompanies']
 parts={
  'rss':{'checkedAt':radar.get('checkedAt'),'lastSuccessAt':radar.get('lastSuccessfulAt'),'today':same_day(radar.get('checkedAt')),'successCount':sum(h['state']=='ok' for h in radar['health']),'sourceCount':len(radar['health'])},
  'editorial':{'checkedAt':intel.get('lastCompletedAt'),'today':scanned,'coveragePassed':covered,'sourceFailures':latest.get('failedSources',[]),'itemCount':len(intel['items'])},
  'recruitment':{'checkedAt':jobs.get('checkedAt'),'today':same_day(jobs.get('checkedAt')) and jobs_covered,'companiesChecked':sorted(job_companies),'jobCount':len(jobs['jobs'])},
  'daily':{'date':edition['date'] if edition else None,'today':bool(edition) and edition['state']!='incomplete' and (edition.get('coverageCheck') or {}).get('passed') is not False,'state':edition['state'] if edition else 'missing','newEvents':len(edition['itemIds']) if edition else 0}}
 knowledge=None
 if config.get('knowledge'):
  from knowledge import plan
  knowledge=plan(data,clock)
  parts['knowledge']={'today':knowledge['dailyChecked'],'pendingCandidates':len(knowledge['pendingCandidates']),'overdueNodes':knowledge['overdueCount'],'failedNodes':knowledge['failedNodes']}
 missing=[name for name,p in parts.items() if not p['today']]
 warnings=[]
 if missing:warnings.append('今日尚未完成：'+'、'.join(missing))
 if not covered:warnings.append('最近研究轮次覆盖检查未通过或尚无结构化记录。')
 if parts['rss']['successCount']<parts['rss']['sourceCount']:warnings.append('部分 RSS 失败，历史数据已保留。')
 if latest.get('failedSources'):warnings.append(f"正文查阅存在 {len(latest['failedSources'])} 条失败记录，未据此判断行业无新闻。")
 if knowledge and knowledge['needsKnowledge']:warnings.append('知识维护待处理：新实践 '+str(len(knowledge['pendingCandidates']))+' 条，逾期节点 '+str(knowledge['overdueCount'])+' 个。')
 state='pending' if missing and local.hour<config['dueHour'] else 'overdue' if missing else 'partial' if warnings else 'current'
 return dict(schemaVersion=1,checkedAt=clock.isoformat(),date=today,state=state,needsEditorial=not(scanned and covered and parts['recruitment']['today'] and parts['daily']['today']),needsKnowledge=knowledge['needsKnowledge'] if knowledge else False,parts=parts,warnings=warnings,build={'runUrl':('https://github.com/'+os.environ['GITHUB_REPOSITORY']+'/actions/runs/'+os.environ['GITHUB_RUN_ID']) if os.getenv('GITHUB_RUN_ID') else None,'trigger':os.getenv('GITHUB_EVENT_NAME','local')})

if __name__=='__main__':
 value=report();print(json.dumps(value,ensure_ascii=False,indent=2))
 if os.getenv('GITHUB_STEP_SUMMARY'):
  with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write('## 今日内容检查\n\n```json\n'+json.dumps(value,ensure_ascii=False,indent=2)+'\n```\n')
 for warning in value['warnings']:print('::warning::'+warning)
