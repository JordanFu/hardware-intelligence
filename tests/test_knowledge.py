import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import knowledge as k
from editorial import load,write,timestamp

class KnowledgeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.data=Path(self.tmp.name)
  self.clock=dt.datetime(2026,11,6,6,tzinfo=dt.timezone.utc);stamp=self.clock.isoformat()
  nodes=[{'id':f'chain-{i}','name':f'环节{i}',**{f:'原始知识内容，等待证据核验。' for f in k.FIELDS['chain']}} for i in range(1,9)]
  tracks=[{'id':f'track-{i}','name':f'领域{i}',**{f:'原始领域内容，等待证据核验。' for f in k.FIELDS['track']}} for i in range(6)]
  items=[{'id':iid,'title':'测试来源与证据边界','selected':True,'practices':[{'method':'公开的测试实践方法'}],'facts':[{'claim':'只用于隔离测试的来源事实。'}],'boundary':'仅为隔离测试，不发布。','sources':[{'url':'https://example.com/'+iid}]} for iid in ['unitree-supplier','test-security']]
  self.empty={'schemaVersion':1,'startedAt':stamp,'nodes':{},'runs':[],'history':[]}
  for name,value in [('valuechain',{'items':nodes}),('landscape',tracks),('intelligence',{'items':items}),('operations',{'knowledge':{'dailyReviewMinimum':3,'reviewIntervalDays':7}}),('knowledge',self.empty)]:write(self.data/(name+'.json'),value)
  reviews=[]
  for nid,iid in [('chain-3','unitree-supplier'),('chain-7','test-security'),('track-5','test-security')]:
   field='basics' if nid.startswith('chain') else 'constraint'
   reviews.append({'nodeId':nid,'status':'partial','reviewedFields':[field],'assessment':'本次核对部分字段，保留尚未核对的范围。','gaps':['其他字段仍待查证。'],'itemIds':[iid],'sourceChecks':[{'itemId':iid,'url':'https://example.com/'+iid,'checkedAt':stamp,'state':'body' if iid=='unitree-supplier' else 'index','note':'隔离测试的来源检查说明。'}],'patch':{field:'供应商登记不等于准入通过，仅为测试知识。'},'lessons':[{'id':'test-lesson','title':'测试知识补充','learning':'依据字段记录测试知识补充。','application':'仅用于回归测试，不作真实结论。','boundary':'测试资料不公开发布。','itemIds':[iid]}]})
  self.bundle={'reviews':reviews,'decisions':[{'itemId':i['id'],'decision':'integrated','reason':'隔离测试：引用到对应知识补充。'} for i in items]}
 def tearDown(self):self.tmp.cleanup()
 def merge(self,state=None,bundle=None,clock=None):return k.merge(state or self.empty,bundle or self.bundle,self.data,clock or self.clock)
 def test_unchanged_review_keeps_content_date(self):
  first=self.merge();later=self.clock+dt.timedelta(days=1);b=copy.deepcopy(self.bundle)
  for r in b['reviews']:
   for c in r['sourceChecks']:c['checkedAt']=later.isoformat()
  second=self.merge(first,b,later)
  for key,node in first['nodes'].items():
   self.assertEqual(second['nodes'][key]['updatedAt'],node['updatedAt'])
   self.assertEqual(second['nodes'][key]['reviewedAt'],later.isoformat())
  self.assertTrue(all(not h['changes'] and not h['lessonChanges'] for h in second['history'][-3:]))
 def test_change_preserves_before_after(self):
  result=self.merge();h=next(h for h in result['history'] if h['nodeId']=='chain-3')
  self.assertIn('供应商登记',h['changes']['basics']['after']);self.assertNotEqual(h['changes']['basics']['before'],h['changes']['basics']['after'])
 def test_missing_evidence_and_failed_source_cannot_change_content(self):
  b=copy.deepcopy(self.bundle);b['reviews'][0]['itemIds']=[]
  with self.assertRaises(ValueError):self.merge(bundle=b)
  b=copy.deepcopy(self.bundle);b['reviews'][0]['status']='error'
  with self.assertRaises(ValueError):self.merge(bundle=b)
 def test_index_cannot_claim_full_review(self):
  b=copy.deepcopy(self.bundle);r=b['reviews'][1];r.update(status='reviewed',reviewedFields=list(k.FIELDS['chain']),gaps=[])
  with self.assertRaisesRegex(ValueError,'current source bodies'):self.merge(bundle=b)
 def test_stale_checks_rejected(self):
  b=copy.deepcopy(self.bundle);b['reviews'][0]['sourceChecks'][0]['checkedAt']=(self.clock-dt.timedelta(days=1)).isoformat()
  with self.assertRaises(ValueError):self.merge(bundle=b)
 def test_unprocessed_candidate_rejected(self):
  b=copy.deepcopy(self.bundle);b['decisions']=b['decisions'][1:]
  with self.assertRaises(ValueError):self.merge(bundle=b)
 def test_partial_review_cannot_postpone_weekly_due_date(self):
  state=self.merge();write(self.data/'knowledge.json',state)
  plan=k.plan(self.data,timestamp(state['startedAt'])+dt.timedelta(days=8))
  self.assertEqual(plan['overdueCount'],14);self.assertTrue(plan['needsKnowledge'])
 def test_source_change_requeues_processed_candidate(self):
  write(self.data/'knowledge.json',self.merge())
  self.assertEqual(k.plan(self.data,self.clock)['pendingCandidates'],[])
  d=load(self.data/'intelligence.json');row=next(i for i in d['items'] if i['id']=='unitree-supplier');row['facts'][0]['claim']+=' 新事实需重审。';write(self.data/'intelligence.json',d)
  self.assertIn('unitree-supplier',[i['itemId'] for i in k.plan(self.data,self.clock)['pendingCandidates']])

 def test_withdrawn_evidence_requires_recheck(self):
  write(self.data/'knowledge.json',self.merge())
  d=load(self.data/'intelligence.json');d['items'][0]['selected']=False;write(self.data/'intelligence.json',d)
  plan=k.plan(self.data,self.clock)
  self.assertTrue(plan['needsKnowledge']);self.assertEqual(plan['invalidReferences'][0]['itemIds'],['unitree-supplier'])
