import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import recruitment as r
from editorial import timestamp
class ResearchTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.work=Path(self.tmp.name)
  self.clock=timestamp('2026-11-09T12:00:00+08:00')
  self.url='https://app.mokahr.com/social-recruitment/zuoyebang/41328#/job/one'
  self.raw=dict(url=self.url,text='负责儿童手表结构设计与可靠性验证。',bodyStatus='body',readAt=self.clock.isoformat())
  (self.work/'one.json').write_text(json.dumps(self.raw))
  self.obs=dict(company='作业帮',postingId='one',title='结构工程师',family='硬件',location='深圳',stages=['研发与系统'],url=self.url,postedAt=None,access='正文可见',responsibilities=['结构设计'],interfaces=['研发评审'],requirements=['硬件经验'],decisionQuestion='谁批准设计？',boundary='不代表新增人数。',readId='one',anchors=['儿童手表结构设计'],educationResearch=True,businessScope='硬件直接相关',scopeNote='儿童手表岗位',educationCategories=['watch'])
  self.scan=dict(company='作业帮',complete=False,state='partial',note='定向检查')
  self.patch=patch.object(r,'WORK',self.work);self.patch.start();self.addCleanup(self.patch.stop)
 def run_batch(self,old=None,obs=None,insights=None):
  b=dict(observations=[obs or self.obs],scans=[self.scan])
  if insights is not None:b['insights']=insights
  return r.merge(old or {},b,self.clock.isoformat())
 def test_shared_ats_rejects_wrong_tenant_and_fragment(self):
  company=next(c for c in r.industry()['companies'] if c['name']=='作业帮')
  self.assertTrue(r.source_allowed(company,self.url))
  for url in ['https://app.mokahr.com/social-recruitment/fenbi/45505#/job/one','https://app.mokahr.com/social-recruitment/zuoyebang/413280#/job/one','https://app.mokahr.com.evil.test/social-recruitment/zuoyebang/41328']:
   self.assertFalse(r.source_allowed(company,url))
  with self.assertRaises(ValueError):self.run_batch(obs={**self.obs,'url':self.url.replace('/one','/two')})
 def test_scope_retained_and_false_category_rejected(self):
  first=self.run_batch();obs=copy.deepcopy(self.obs)
  for field in ('educationResearch','educationCategories','businessScope','scopeNote'):obs.pop(field)
  second=self.run_batch(first,obs);self.assertEqual(second['jobs'][0]['educationCategories'],['watch']);self.assertEqual(len(second['jobs'][0]['versions']),1)
  with self.assertRaises(ValueError):self.run_batch(obs={**self.obs,'businessScope':'公司共享能力'})
 def test_insights_preserve_others_dates_and_before_content(self):
  first=self.run_batch();jid=first['jobs'][0]['id'];ins=dict(id='test',title='职责接口需要交接验证',finding='这是一项原文职责事实',interpretation='这是一项研究解释线索',alternative='仍然存在其他可能解释',nextAction='下一步需要继续核验接口',boundary='不能通过岗位推断人数',jobIds=[jid])
  one=self.run_batch(first,insights=[ins]);self.clock+=dt.timedelta(hours=1)
  two=self.run_batch(one,insights=[ins]);self.assertEqual(two['insights'],one['insights'])
  three=self.run_batch(two,insights=[{**ins,'id':'other','title':'这是另一个独立观察'}]);self.assertEqual(len(three['insights']),2)
  four=self.run_batch(three,insights=[{**ins,'finding':'这是修订后的岗位事实'}]);self.assertEqual(four['insights'][0]['history'][0]['finding'],ins['finding'])
 def test_product_checks_cannot_satisfy_role_maintenance(self):
  state=self.run_batch();plan=r.research_plan(state,self.clock)
  self.assertEqual(len(plan['overdueRoleChecks']),15);self.assertTrue(plan['needsResearch'])
  jid=state['jobs'][0]['id'];self.scan['familyChecks']=[dict(family='硬件',state='body',url=self.url,note='正文已读',jobIds=[jid])]
  state=self.run_batch(state);self.assertEqual(len(r.research_plan(state,self.clock)['overdueRoleChecks']),14)
  self.assertEqual(len(r.research_plan(state,self.clock+dt.timedelta(days=8))['overdueRoleChecks']),15)
  failed=copy.deepcopy(state);failed['scans'][-1]['familyChecks'][0]['state']='error'
  self.assertEqual(len(r.research_plan(failed,self.clock)['overdueRoleChecks']),15)
  self.scan['familyChecks'][0]['jobIds']=['invented']
  with self.assertRaises(ValueError):self.run_batch(state)
if __name__=='__main__':unittest.main()
