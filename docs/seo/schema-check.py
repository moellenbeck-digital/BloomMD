"""Limited vocabulary check, not a Rich Results eligibility validator.
Usage: python3 docs/seo/schema-check.py AUDIT.jsonl VOCABULARY.json
Vocabulary: https://schema.org/version/latest/schemaorg-current-https.jsonld
Checks only the types/domains/ranges implemented below; not full JSON-LD validation.
"""
import json,sys
v=json.load(open(sys.argv[2]))['@graph']; idx={x['@id']:x for x in v}
def vals(x):
 if not x:return []
 return [i['@id'] for i in (x if isinstance(x,list) else [x])]
def ancestry(t):
 return {t}|set().union(*(ancestry(p) for p in vals(idx.get(t,{}).get('rdfs:subClassOf'))))
errors=[];count=0
def walk(o,path):
 global count
 if isinstance(o,list):
  for x in o:walk(x,path)
 elif isinstance(o,dict):
  ts=o.get('@type',[]);ts=[ts] if isinstance(ts,str) else ts
  parents=set()
  for t in ts:
   count+=1; key='schema:'+t
   if key not in idx:errors.append((path,'unknown type',t))
   parents |= ancestry(key)
  for k,x in o.items():
   if k.startswith('@'):continue
   prop=idx.get('schema:'+k)
   if prop is None:errors.append((path,'unknown property',k))
   elif parents:
    ds=set(vals(prop.get('schema:domainIncludes')))
    if ds and not parents&ds:errors.append((path,'invalid domain',k,ts))
    ranges=set(vals(prop.get('schema:rangeIncludes')))
    for val in x if isinstance(x,list) else [x]:
     if isinstance(val,dict) and '@type' in val:
      vt=val['@type'];vt=[vt] if isinstance(vt,str) else vt
      if ranges and not set().union(*(ancestry('schema:'+t) for t in vt))&ranges:errors.append((path,'invalid object range',k,vt))
     elif isinstance(val,str) and ranges and not ranges&{'schema:Text','schema:URL','schema:Date','schema:DateTime','schema:Time','schema:CssSelectorType','schema:XPathType'} and not val.startswith('http'):errors.append((path,'invalid text range',k,sorted(ranges)))
   walk(x,path+'/'+k)
for line in open(sys.argv[1]):
 if line.startswith('{'):
  r=json.loads(line)
  for s in r['schemas']:walk(s,r['path'])
print(json.dumps({'typed_nodes':count,'vocabulary':'schema.org vocabulary supplied as argv[2]','validation':'type/property existence, inherited domain, object and scalar ranges','errors':errors},indent=2))
sys.exit(bool(errors))
