"""Read-only HTML, linked llms resources and bot transport audit; stdlib only."""
import json,re,sys,urllib.request,urllib.error
from html.parser import HTMLParser
base=sys.argv[1].rstrip('/')
class Page(HTMLParser):
 def __init__(self):
  super().__init__();self.tags=[];self.schemas=[];self.ld=False
 def handle_starttag(self,t,a):
  d=dict(a);self.tags.append((t,d));self.ld=t=='script' and d.get('type')=='application/ld+json'
 def handle_endtag(self,t):
  if t=='script': self.ld=False
 def handle_data(self,d):
  if self.ld: self.schemas.append(json.loads(d))
def get(path,ua='Mozilla/5.0'):
 import subprocess
 result=subprocess.check_output(['curl','-sS','-L','--max-time','30','-A',ua,'-w','\n%{http_code}\n%{url_effective}',base+path],text=True)
 body,code,url=result.rsplit('\n',2)
 return int(code),body,url

for path in ['/','/en','/download','/download?lang=en','/obsidian','/obsidian?lang=en','/docs','/docs?lang=en','/impressum','/datenschutz','/missing-seo-test','/robots.txt','/llms.txt','/sitemap.xml']:
 code,body,url=get(path);p=Page();p.feed(body)
 print(json.dumps({'path':path,'status':code,'url':url,'h1':sum(t=='h1' for t,d in p.tags),'alternates':[d for t,d in p.tags if t=='link' and d.get('rel') in ['canonical','alternate']],'schemas':p.schemas,'bytes':len(body)},ensure_ascii=False))
 if path=='/llms.txt' and code==200:
  for link in re.findall(r'\]\(https://bloommd.io([^)]*)\)',body): print('llms-link',link,get(link)[0])
for bot in ['GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','Claude-User','PerplexityBot','Perplexity-User','Google-Extended','Applebot-Extended','Bingbot','CCBot']:print('bot',bot,get('/',bot)[0])
