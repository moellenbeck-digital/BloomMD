import re, json, urllib.request, sys, html as H
base="http://localhost:3461"
UAS={"chrome":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
"gptbot":"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
"googlebot":"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
"claudebot":"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"}
def get(path,ua):
    r=urllib.request.Request(base+path,headers={"User-Agent":ua})
    with urllib.request.urlopen(r) as resp: return resp.status, resp.read().decode()
_,xml=get("/sitemap.xml",UAS["chrome"])
locs=re.findall(r"<url>(.*?)</url>",xml,re.S)
entries=[(re.search(r"<loc>(.*?)</loc>",u).group(1), bool(re.search("<lastmod>",u))) for u in locs]
res={"urls":len(entries),"lastmod":sum(l for _,l in entries),"no_lastmod":[u for u,l in entries if not l],"status_not_200":[],"h1_not_one":[],"head_missing":[],"title_gt_60":[],"desc_gt_155":[],"articles":0,"checks":0}
for url,_ in entries:
    path=H.unescape(url.replace("https://bloommd.io",""))
    art=bool(re.match(r"^/(en/)?(blog|news)/",path)); res["articles"]+=art
    for name,ua in (UAS.items() if art else [("chrome",UAS["chrome"]),("gptbot",UAS["gptbot"])]):
        st,h=get(path,ua); res["checks"]+=1
        if st!=200: res["status_not_200"].append((path,st))
        head=h[:h.find("</head>")]
        miss=[k for k,rx in [("title",r"<title>[^<]+</title>"),("canonical",r'<link rel="canonical"'),("hreflang",r'hrefLang="x-default"')] if not re.search(rx,head)]
        if miss: res["head_missing"].append((path,name,miss))
        if name=="chrome":
            if len(re.findall(r"<h1[\s>]",h))!=1: res["h1_not_one"].append(path)
            t=re.search(r"<title>([^<]*)</title>",h); t=H.unescape(t.group(1)) if t else ""
            if len(t)>60: res["title_gt_60"].append((path,len(t),t))
            d=re.search(r'<meta name="description" content="([^"]*)"',h); d=H.unescape(d.group(1)) if d else ""
            if len(d)>155: res["desc_gt_155"].append((path,len(d)))
print(json.dumps(res,ensure_ascii=False,indent=1))
