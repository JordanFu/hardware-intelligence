"""Read public article text into ignored local work files, never publish full text."""
import html
import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import urlsplit

class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.preferred=[]; self.stack=[]; self.ignore=0; self.scope=0
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        ignore=tag in ('script','style','nav','header','footer','noscript','svg','form')
        scope=tag in ('article','main') or any(x in (attrs.get('class','')+' '+attrs.get('id','')).lower() for x in ('post-content','entry-content','article-content','post_content','post_body','news_content'))
        if tag not in ('br','img','meta','link','input','hr','source','wbr','area','embed','param','track'):
            self.stack.append((tag,ignore,scope));self.ignore+=ignore;self.scope+=scope
        if tag in ('p','div','li','h1','h2','h3','br'):self.parts.append('\n');self.preferred.append('\n')
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:
                for _,ignore,scope in self.stack[i:]:self.ignore-=ignore;self.scope-=scope
                self.stack=self.stack[:i];break
    def handle_data(self, value):
        if not self.ignore:
            self.parts.append(value)
            if self.scope:self.preferred.append(value)
    def text(self):
        preferred=' '.join(self.preferred)
        text=preferred if len(re.sub(r'\s','',preferred))>400 else ' '.join(self.parts)
        return re.sub(r'[ \t]+',' ',re.sub(r'\n\s*\n+','\n',html.unescape(text))).strip()

def read_url(url):
    p=urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.hostname in ('localhost','127.0.0.1','::1'):raise ValueError('HTTPS public source required')
    result=subprocess.run(['curl','-fsSL','--proto','=https','--proto-redir','=https','--connect-timeout','12','--max-time','35','--max-filesize','8000000',url],capture_output=True,timeout=40)
    if result.returncode:raise RuntimeError(result.stderr.decode(errors='replace')[:180])
    parser=ArticleParser();parser.feed(result.stdout.decode('utf-8',errors='replace'))
    text=parser.text()
    if len(text)<250 or any(x in text[:700].lower() for x in ('just a moment','access denied','verify you are human')):raise ValueError('No usable article text; browser/source verification needed')
    return text[:60000]
