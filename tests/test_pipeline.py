import datetime as dt
import contextlib
import io
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('collect',ROOT/'scripts/collect.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class CollectionTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,11,5,10,tzinfo=dt.timezone.utc)
  self.source=dict(id='test',name='Test',tier='官方一手',url='https://example.com/feed')
 def feed(self,rows):
  return ('<rss><channel>'+''.join(f'<item><title>{t}</title><link>{u}</link><pubDate>{d}</pubDate></item>' for t,u,d in rows)+'</channel></rss>').encode()
 def test_reject_future_missing_old_and_off_topic(self):
  rows=[('Robot release','https://example.com/a','Thu, 05 Nov 2026 09:00:00 GMT'),('Robot future','https://example.com/future','Fri, 06 Nov 2026 09:00:00 GMT'),('Robot no date','https://example.com/nodate',''),('Robot old','https://example.com/old','Tue, 01 Jan 2019 09:00:00 GMT'),('Football results','https://example.com/ball','Thu, 05 Nov 2026 09:00:00 GMT')]
  data,total,rejected=c.parse_feed(self.feed(rows),self.source,self.now)
  self.assertEqual(total,5);self.assertEqual(len(data),1);self.assertEqual(rejected,4);self.assertEqual(data[0]['status'],'待核验')
 def test_canonical_preserves_article_query(self):
  self.assertEqual(c.canonical('https://EXAMPLE.com/news/?id=1&utm_source=x#top'),'https://example.com/news?id=1')
  with self.assertRaises(ValueError):c.canonical('javascript:alert(1)')
 def test_atom_and_html_title(self):
  xml=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Robot &amp; vision</title><link href="https://example.com/robot"/><published>2026-11-04T09:00:00Z</published></entry></feed>'
  rows,_,_=c.parse_feed(xml,self.source,self.now);self.assertEqual(rows[0]['title'],'Robot & vision')
 def test_html_error_page_is_not_a_successful_empty_feed(self):
  with self.assertRaises(ValueError):c.parse_feed(b'<html><body>Service unavailable</body></html>',self.source,self.now)
 def test_promo_is_not_news(self):
  self.assertIsNone(c.category('Black Friday robot discount','test'))
 def test_failed_fetch_reports_error(self):
  with patch.object(c.subprocess,'run',side_effect=TimeoutError('timeout')):
   rows,h=c.fetch(self.source,self.now)
  self.assertEqual(rows,[]);self.assertEqual(h['state'],'error');self.assertIn('error',h)
 def test_full_failure_preserves_history_and_last_success(self):
  with tempfile.TemporaryDirectory() as d:
   data=Path(d);source={**self.source,'auto':True};(data/'sources.json').write_text(json.dumps([source]))
   now=dt.datetime.now(dt.timezone.utc);old=dict(id='rss-old',url='https://example.com/robot',title='Robot',date=now.isoformat(),discoveredAt=now.isoformat(),sourceId='test')
   (data/'radar.json').write_text(json.dumps(dict(items=[old],health=[dict(id='test',lastSuccessAt='2026-01-01')],lastSuccessfulAt='2026-01-01')))
   with patch.object(c,'DATA',data),patch.object(c,'fetch',return_value=([],dict(id='test',state='error',error='HTTP 503'))),contextlib.redirect_stdout(io.StringIO()):c.main()
   result=json.loads((data/'radar.json').read_text());self.assertEqual(len(result['items']),1);self.assertEqual(result['lastSuccessfulAt'],'2026-01-01');self.assertEqual(result['health'][0]['state'],'error')
class ContentTests(unittest.TestCase):
 def test_curated_and_org_have_evidence_boundaries(self):
  data=ROOT/'site/data'
  news=json.loads((data/'curated.json').read_text())['items'];orgs=json.loads((data/'organizations.json').read_text())
  ids=[]
  for item in news+orgs:
   ids.append(item['id']);self.assertTrue(item['facts']);self.assertTrue(item.get('boundary') or item.get('unknown'))
   for source in item['sources']:self.assertTrue(source['url'].startswith('https://'));self.assertTrue(source['date'])
  self.assertEqual(len(ids),len(set(ids)))
 def test_radar_never_marked_curated_and_no_duplicate_urls(self):
  r=json.loads((ROOT/'site/data/radar.json').read_text());urls=[]
  for item in r['items']:
   self.assertEqual(item['status'],'待核验');urls.append(c.canonical(item['url']))
  self.assertEqual(len(urls),len(set(urls)))
if __name__=='__main__':unittest.main()
