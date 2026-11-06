import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import editorial as e
import recruitment as r
class EditorialTests(unittest.TestCase):
 def setUp(self):
  self.clock=dt.datetime(2026,11,5,12,tzinfo=e.UTC)
  self.run=dict(reviewedCount=1,coverage='测试有正文的公开来源扫描',successfulScan=True)
 def row(self,id='a',event='one',dev='one',publisher='A',date='2026-11-04T10:00:00Z'):
  return dict(id=id,eventId=event,developmentId=dev,score=85,selected=True,publishedAt=date,domestic=True,sources=[dict(role='official',publisherGroup=publisher)])
 def digest(self,rows,prior=[]):return e.make_digest(rows,e.events_for(rows),prior,self.run,self.clock)
 def test_event_publisher_dedup(self):
  rows=[self.row(),self.row('b')];events=e.events_for(rows)
  self.assertEqual(len(events),1);self.assertEqual(events[0]['publisherGroups'],['A']);self.assertEqual(len(self.digest(rows)['itemIds']),1)
 def test_latest_development_represents_event(self):
  old=self.row('old',date='2026-11-01');old['score']=99
  new=self.row('new',dev='two',date='2026-11-04')
  self.assertEqual(e.events_for([old,new])[0]['representativeId'],'new')
 def test_repeat_excluded_and_substantial_change(self):
  prior=[dict(date='2026-11-04',developmentKeys=[['one','one']])]
  self.assertEqual(self.digest([self.row()],prior)['itemIds'],[])
  row=self.row(dev='two');self.assertEqual(self.digest([row],prior)['itemIds'],[])
  row.update(newDevelopment=True,developmentReason='新官方行动及事实证据已核对');self.assertEqual(self.digest([row],prior)['itemIds'],['a'])
 def test_undated_old_held_excluded(self):
  old=self.row('b',date='2023-01-01');undated=self.row('c',date=None);held=self.row('d');held['selected']=False
  self.assertEqual(self.digest([old,undated,held])['itemIds'],[])
 def test_failure_is_not_no_news(self):
  self.run['failedSources']=['timeout'];self.assertEqual(self.digest([])['state'],'partial')
 def test_daily_cap_and_immutable(self):
  rows=[self.row(str(i),event=str(i)) for i in range(5)];d=self.digest(rows)
  self.assertEqual(len(d['itemIds']),2);self.assertEqual(self.digest([], [d]),d)
 def test_incomplete_daily_recovers_with_preserved_revision(self):
  self.run['coverageCheck']={'passed':False}
  first=self.digest([]);self.assertEqual(first['state'],'partial')
  self.run['coverageCheck']={'passed':True}
  repaired=self.digest([self.row()],[first])
  self.assertEqual(repaired['itemIds'],['a']);self.assertEqual(repaired['revisions'][0]['edition'],first)
  self.assertEqual(self.digest([],[repaired]),repaired)
 def test_invalid_evidence_and_hold(self):
  text='A public company announced a service replacement program. '*6
  read=dict(url='https://example.com/a',text=text,bodyStatus='body',readAt=self.clock.isoformat())
  entry=dict(id='test',eventId='test',developmentId='one',titleZh='测试公开的服务计划',brief=dict(lead='这是一项公开发布的服务替换计划，目前仅用于验证证据字段。',points=['公开说明提供替换计划。','缺少实际完成情况的证据。']),stages=['服务与生命周期'],domestic=True,publishedAt='2026-11-04',sources=[dict(readId='test',url=read['url'],publishedAt='2026-11-04',name='测试',publisherGroup='test',role='official')],facts=[dict(claim='公开说明了相关的替换服务计划。',readId='test',anchor='service replacement program',locator='正文第一段')],selection=dict(scores={k:20 for k in e.industry()['selection']['dimensions']},review=dict(decision='hold',reason='虽然得分充足，但证据范围有待人工复核。')),boundary='测试资料不能用作任何真实公司结论。',meaning='测试服务计划与质量协作之间的关系。',question='后续是否有完成情况的证据和结果？',eventReason='相同公司与服务替换计划属于同一事件。')
  self.assertFalse(e.validate_entry(entry,{'test':read})['selected'])
  entry['publishedAt']='2026-11-03'
  with self.assertRaises(ValueError):e.validate_entry(entry,{'test':read})
  entry['publishedAt']='2026-11-04'
  entry['facts'][0]['anchor']='fabricated evidence anchor'
  with self.assertRaises(ValueError):e.validate_entry(entry,{'test':read})
class RecruitmentTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.work=Path(self.tmp.name)
  self.patch=patch.object(r,'WORK',self.work);self.patch.start()
  text='负责设备质量测试与量产问题分析，并与研发和制造团队协作。'
  (self.work/'a.json').write_text(json.dumps(dict(url='https://www.dji.com/job/1',text=text)))
  self.obs=dict(company='DJI 大疆',postingId='1',title='测试工程师',family='质量测试',location='深圳',boundary='仅反映岗位描述，不推断招聘人数。',decisionQuestion='如何明确测试与研发的责任边界？',responsibilities=['质量测试'],interfaces=['研发团队'],requirements=['测试能力'],stages=['质量与合规'],readId='a',anchors=['负责设备质量测试'],url='https://www.dji.com/job/1',access='正文可见',postedAt=None)
  self.scan=dict(company='DJI 大疆',complete=False,state='partial',note='部分扫描')
 def tearDown(self):self.patch.stop();self.tmp.cleanup()
 def test_baseline_changes_and_failure_retention(self):
  first=r.merge({},dict(observations=[self.obs],scans=[self.scan]));self.assertEqual(first['jobs'][0]['change'],'首次收录基线')
  second=r.merge(first,dict(observations=[self.obs],scans=[self.scan]));self.assertEqual(len(second['jobs'][0]['versions']),1)
  obs={**self.obs,'responsibilities':['质量测试与量产问题复现']}
  third=r.merge(second,dict(observations=[obs],scans=[self.scan]));self.assertEqual(len(third['jobs'][0]['versions']),2);self.assertEqual(third['changes'][-1]['before']['responsibilities'],['质量测试'])
  failed=r.merge(third,dict(observations=[],scans=[{**self.scan,'state':'error'}]));self.assertEqual(failed['jobs'][0]['access'],'正文可见')
  absent=r.merge(third,dict(observations=[],scans=[{**self.scan,'state':'ok','complete':True}]));self.assertEqual(absent['jobs'][0]['access'],'本次未见')
 def test_unproven_closure_and_nonofficial_rejected(self):
  obs={**self.obs,'access':'明确关闭'}
  with self.assertRaises(ValueError):r.merge({},dict(observations=[obs],scans=[self.scan]))
  obs={**self.obs,'url':'https://fake.example/jobs/1'}
  with self.assertRaises(ValueError):r.merge({},dict(observations=[obs],scans=[self.scan]))
class ArtifactsTests(unittest.TestCase):
 def test_references_and_chain_coverage(self):
  data=json.loads((e.DATA/'intelligence.json').read_text());ids={i['id'] for i in data['items']}
  for d in json.loads((e.DATA/'daily.json').read_text())['editions']:self.assertTrue(set(d['itemIds'])<=ids)
  self.assertEqual(set().union(*(set(i['stages']) for i in data['items'])),set(e.industry()['stages']))
  self.assertEqual(len(json.loads((e.DATA/'valuechain.json').read_text())['items']),8)
  for event in data['events']:self.assertIn(event['representativeId'],ids)
if __name__=='__main__':unittest.main()
