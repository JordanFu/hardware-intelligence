import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import education as edu
from editorial import load,write,timestamp
class EducationTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.data=Path(self.temp.name);self.work=self.data/'raw';self.work.mkdir()
  self.seed=load(edu.DATA/'education.json');self.clock=timestamp(self.seed['runs'][-1]['completedAt'])+dt.timedelta(hours=1)
  write(self.data/'recruitment.json',load(edu.DATA/'recruitment.json'));write(self.data/'education.json',self.seed);write(self.data/'operations.json',load(edu.DATA/'operations.json'))
  self.p=self.seed['profiles'][0];s=self.p['sources'][0]
  self.check=dict(company=self.p['company'],url=s['url'],name=s['title'],state='body',checkedAt=self.clock.isoformat(),categoryIds=self.p['categoryIds'],readId='fixture',note='Read actual public body')
  write(self.work/'fixture.json',dict(url=s['url'],text='Public evidence anchor. '*30,bodyStatus='body',readAt=self.clock.isoformat()))
 def bundle(self,patch=None,status='reviewed'):
  return dict(summary='Actual review without invented new event',checks=[self.check],reviews=[dict(profileId=self.p['id'],status=status,assessment='Review result and remaining gaps',patch=patch or {})])
 def test_noop_preserves_content_date_and_records_review(self):
  result=edu.publish(self.bundle(),self.data,self.work,self.clock);p=result['profiles'][0]
  self.assertEqual(p['updatedAt'],self.p['updatedAt']);self.assertEqual(p['reviewedAt'],self.clock.isoformat());self.assertEqual(result['history'][-1]['changes'],{})
 def test_failed_read_never_advances_review(self):
  self.check['state']='error';r=edu.publish(self.bundle(status='error'),self.data,self.work,self.clock)
  self.assertEqual(r['profiles'][0]['reviewedAt'],self.p['reviewedAt']);self.assertEqual(r['profiles'][0]['updatedAt'],self.p['updatedAt'])
  with self.assertRaises(ValueError):edu.publish(self.bundle({'boundary':'Changed without evidence'},'error'),self.data,self.work,self.clock)
 def test_rejects_stale_body_and_unmatched_fact_without_writing(self):
  raw=load(self.work/'fixture.json');raw['readAt']=(self.clock-dt.timedelta(days=1)).isoformat();write(self.work/'fixture.json',raw)
  with self.assertRaises(ValueError):edu.publish(self.bundle(),self.data,self.work,self.clock)
  self.assertEqual(load(self.data/'education.json'),self.seed)
 def test_anchor_gate_and_history(self):
  s=self.p['sources'][0];source={k:v for k,v in s.items() if k not in ('readAt','coverage','textHash')};source['readId']='fixture'
  patch=dict(boundary='Revised with a verified supporting fact',sources=[source],facts=[dict(sourceId=s['id'],claim='New verified observation',locator='Test section',anchor='missing anchor')])
  with self.assertRaises(ValueError):edu.publish(self.bundle(patch),self.data,self.work,self.clock)
  patch['facts'][0]['anchor']='Public evidence anchor';r=edu.publish(self.bundle(patch),self.data,self.work,self.clock)
  self.assertEqual(r['history'][-1]['changes']['boundary']['before'],self.p['boundary']);self.assertEqual(r['profiles'][0]['updatedAt'],self.clock.isoformat());self.assertNotIn('anchor',r['profiles'][0]['facts'][0])
 def test_source_date_change_alone_is_not_content_update(self):
  p=copy.deepcopy(self.p);s=p['sources'][0];s['readId']='fixture';patch={'sources':[s],'facts':[dict(f,anchor='Public evidence anchor') for f in p['facts']]}
  r=edu.publish(self.bundle(patch),self.data,self.work,self.clock);self.assertEqual(r['profiles'][0]['updatedAt'],self.p['updatedAt']);self.assertEqual(r['history'][-1]['changes'],{})
 def test_new_profile_without_evidence_is_not_written(self):
  b=self.bundle();b['newProfiles']=[dict(id='new-reader',company='New reader',tier='相邻场景',categoryIds=['reader'])]
  with self.assertRaises(ValueError):edu.publish(b,self.data,self.work,self.clock)
  self.assertEqual(load(self.data/'education.json'),self.seed)
 def test_daily_and_weekly_gaps_remain_actionable(self):
  current=edu.plan(self.data,self.clock);self.assertTrue(current['today']);self.assertFalse(current['needsEducation'])
  late=edu.plan(self.data,self.clock+dt.timedelta(days=8));self.assertTrue(late['needsEducation']);self.assertEqual(set(late['uncoveredCategories']),edu.CATEGORIES);self.assertEqual(len(late['overdueProfiles']),len(self.seed['profiles']))
if __name__=='__main__':unittest.main()
