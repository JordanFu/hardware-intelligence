import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import editorial as e
import health

class CoverageTests(unittest.TestCase):
 def setUp(self):
  self.clock=dt.datetime(2026,11,6,6,tzinfo=e.UTC)
  self.checks=[dict(url='https://example.com/source',company=name,purpose=purpose,stages=['供应链与采购','质量与合规'],state='read',checkedAt=self.clock.isoformat(),note='已经读取公开内容，记录实际证据边界。') for name,purpose in [('安克创新','recruitment'),('DJI 大疆','recruitment'),('小米','practice')]]
 def test_coverage_requires_real_checks(self):
  with self.assertRaises(ValueError):e.assess_coverage({},self.clock)
  self.assertFalse(e.assess_coverage({'sourceChecks':self.checks},self.clock)['passed']) # old company-only gate must fail
 def news(self):
  reads={};checks=copy.deepcopy(self.checks)
  for i in range(6):
   rid='news'+str(i);url='https://publisher'+str(i%3)+'.example/'+str(i);text='A verified announcement with concrete delivery boundaries. '*8
   reads[rid]=dict(url=url,text=text,bodyStatus='body',readAt=self.clock.isoformat())
   checks.append(dict(url=url,company=None,purpose='news',stages=['制造与交付'],state='read',checkedAt=self.clock.isoformat(),note='已读取正文并核对发布日期与具体行动。',readId=rid,publishedAt='2026-11-06',publisherGroup='group'+str(i%3),bodyReview=dict(decision='hold',reason='已有正文但未完成行动结果独立验证，保留暂缓。',anchor='concrete delivery boundaries')))
  return checks,reads
 def test_news_review_gate_with_no_selected_items(self):
  checks,reads=self.news();result=e.assess_coverage({'sourceChecks':checks},self.clock,reads)
  self.assertTrue(result['passed']);self.assertEqual(result['newsResearch']['bodyCount'],6)
 def test_downloads_indexes_and_duplicate_urls_are_insufficient(self):
  checks,reads=self.news();checks[-1]=copy.deepcopy(checks[-2])
  self.assertFalse(e.assess_coverage({'sourceChecks':checks},self.clock,reads)['passed'])
  checks,reads=self.news();checks[-1]['bodyReview']={}
  self.assertFalse(e.assess_coverage({'sourceChecks':checks},self.clock,reads)['passed'])
  checks,reads=self.news();checks[0]['state']='index'
  self.assertFalse(e.assess_coverage({'sourceChecks':checks},self.clock,reads)['passed'])
 def test_stale_bodies_and_single_publisher_cannot_pass(self):
  checks,reads=self.news();reads['news5']['readAt']='2026-11-05T00:00:00Z'
  self.assertFalse(e.assess_coverage({'sourceChecks':checks},self.clock,reads)['passed'])
  checks,reads=self.news()
  for c in checks[3:]:c['publisherGroup']='same'
  self.assertFalse(e.assess_coverage({'sourceChecks':checks},self.clock,reads)['passed'])
 def test_invented_anchor_rejected(self):
  checks,reads=self.news();checks[-1]['bodyReview']['anchor']='Fabricated unrelated body quotation'
  with self.assertRaises(ValueError):e.assess_coverage({'sourceChecks':checks},self.clock,reads)
 def test_failure_does_not_count_as_coverage(self):
  for check in self.checks:check['state']='error'
  result=e.assess_coverage({'sourceChecks':self.checks},self.clock)
  self.assertFalse(result['passed']);self.assertEqual(result['usableSources'],0)
 def test_old_checks_cannot_be_today(self):
  self.checks[0]['checkedAt']='2026-11-05T06:00:00Z'
  with self.assertRaises(ValueError):e.assess_coverage({'sourceChecks':self.checks},self.clock)
 def test_inadequate_coverage_is_partial_daily(self):
  run={'coverageCheck':{'passed':False},'successfulScan':True,'coverage':'只读了单一来源，尚未达标','reviewedCount':0}
  self.assertEqual(e.make_digest([],[],[],run,self.clock)['state'],'partial')

class HealthTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.data=Path(self.tmp.name)
  self.clock=dt.datetime(2026,11,6,6,tzinfo=e.UTC);t=self.clock.isoformat()
  self.files={'operations':{'dueHour':10,'requirements':{'recruitmentCompanies':2}},'radar':{'checkedAt':t,'lastSuccessfulAt':t,'health':[{'state':'ok'}]},'intelligence':{'lastCompletedAt':t,'items':[],'runs':[{'successfulScan':True,'coverageCheck':{'passed':True,'newsResearch':{'passed':True}},'failedSources':[]}]},'recruitment':{'checkedAt':t,'jobs':[],'scans':[{'company':c,'state':'partial','checkedAt':t} for c in ['安克创新','DJI 大疆']]},'daily':{'editions':[{'date':'2026-11-06','state':'no_new','itemIds':[],'coverageCheck':{'passed':True,'newsResearch':{'passed':True}}}]}}
 def tearDown(self):self.tmp.cleanup()
 def report(self,clock=None):
  for name,value in self.files.items():(self.data/(name+'.json')).write_text(json.dumps(value))
  return health.report(self.data,clock or self.clock)
 def test_complete_scan_without_new_items_is_current(self):
  result=self.report();self.assertEqual(result['state'],'current');self.assertFalse(result['needsEditorial'])
 def test_legacy_completion_without_news_review_needs_recovery(self):
  del self.files['intelligence']['runs'][0]['coverageCheck']['newsResearch']
  self.assertTrue(self.report()['needsEditorial'])
 def test_all_jobs_failed_is_not_complete(self):
  for scan in self.files['recruitment']['scans']:scan['state']='error'
  result=self.report();self.assertTrue(result['needsEditorial']);self.assertFalse(result['parts']['recruitment']['today'])
 def test_incomplete_edition_needs_recovery(self):
  self.files['daily']['editions'][0]['coverageCheck']={'passed':False}
  self.assertTrue(self.report()['needsEditorial'])
 def test_legacy_edition_is_not_completed_by_new_run(self):
  del self.files['daily']['editions'][0]['coverageCheck']['newsResearch']
  self.assertTrue(self.report()['needsEditorial'])
 def test_rss_failure_is_partial_not_current(self):
  self.files['radar']['health'][0]['state']='error'
  self.assertEqual(self.report()['state'],'partial')
 def test_build_does_not_make_old_content_fresh(self):
  self.files['intelligence']['lastCompletedAt']='2026-11-05T06:00:00Z'
  self.assertEqual(self.report()['state'],'overdue')
  early=self.clock.replace(hour=1)
  self.assertEqual(self.report(early)['state'],'pending')
