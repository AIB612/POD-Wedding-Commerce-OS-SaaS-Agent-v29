import json,sys,numpy as np
sys.path.insert(0,'scripts')
from PIL import Image,ImageDraw
from scipy import ndimage as nd
import print_area_seg as seg2
N=seg2.N
cat=json.load(open('server/data/studio-catalog.json'));ps=cat['products']
WRAP={'mug':2.3,'tumbler':2.3,'bottle':2.3,'candle':2.3,'bowl':2.3}
KEEP={'polo_emb','fleece'}  # left-chest logo placements: keep position, only verify
def poly(pts):
  im=Image.new('L',(N,N),0);ImageDraw.Draw(im).polygon([(x*N/100,y*N/100) for x,y in pts],fill=1);return np.asarray(im)>0
def ell(cx,cy,rx,ry):
  yy,xx=np.mgrid[0:N,0:N]*100/N;return ((xx-cx)/rx)**2+((yy-cy)/ry)**2<=1
MANUAL={'coaster':lambda:ell(62,30,24.5,17.5)|ell(37.5,68,25.5,20.5),
 'team_jersey':lambda:poly([(36,0),(64,0),(79,10),(79,100),(22,100),(22,10)]),
 'bucket_hat':lambda:poly([(37,17),(63,17),(68,47),(32,47)]),
 'sports_towel':lambda:poly([(17,0),(84,0),(84,99),(17,99)])}
def best(mask,A):
  S=np.pad(mask.astype(np.int32).cumsum(0).cumsum(1),((1,0),(1,0)))
  cy,cx=nd.center_of_mass(mask)
  def pos(h):
    w=max(1,int(round(h*A))); h=max(1,h)
    if w>N or h>N: return None
    tot=S[h:,w:]-S[:-h,w:]-S[h:,:-w]+S[:-h,:-w]
    ys,xs=np.nonzero(tot==w*h)
    if not len(ys): return None
    d=(ys+h/2-cy)**2+(xs+w/2-cx)**2;k=np.argmin(d);return xs[k],ys[k],w,h
  lo,hi=1,N;r=None
  while lo<=hi:
    m=(lo+hi)//2;q=pos(m)
    if q: r=q;lo=m+1
    else: hi=m-1
  return r
def inside(mask,area):
  x,y,w,h=[v*N/100 for v in area];sub=mask[int(y):int(np.ceil(y+h)),int(x):int(np.ceil(x+w))];return sub.size and sub.mean()
res={}
for p in ps:
  if p['id'] in MANUAL: fg=MANUAL[p['id']](); src='manual'
  else:
    a,fg,src=seg2.seg(p,'rect') if (not p['mockup_photo'].get('mask') or p['id']=='tumbler') else seg2.seg(p)
  er=nd.binary_erosion(fg,iterations=3 if p['id']=='lanyard' else 8)  # 2% of image off the silhouette edge / shadow
  old=p['mockup_photo']['area']
  if p['id'] in KEEP:
    res[p['id']]=(old,inside(er,old),src);continue
  pw,ph=p['print_area_mm'];A=pw/ph/WRAP.get(p['shape'],1)
  if p['id']=='lanyard': A=0.12
  b=best(er,A)
  if b is None: print('FAIL',p['id'],er.sum()); continue
  x,y,w,h=b
  m=0.06  # 6% inset per side
  x,y,w,h=x+w*m,y+h*m,w*(1-2*m),h*(1-2*m)
  new=[round(v*100/N,1) for v in (x,y,w,h)]
  res[p['id']]=(new,inside(fg,new),src)
json.dump({k:v[0] for k,v in res.items()},open('scripts/new_areas.json','w'),indent=0)
for k,v in res.items(): print(k,v)
