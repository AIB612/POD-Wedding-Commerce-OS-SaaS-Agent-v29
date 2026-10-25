import json,numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as nd
from skimage import filters,segmentation,color
d=json.load(open('server/data/studio-catalog.json'));ps=d['products']
N=400
def load(f): return np.asarray(Image.open('assets/mockups/'+f.split('/')[-1]).convert('RGB').resize((N,N))).astype(float)/255
def seg(p,mode='mask'):
  m=p['mockup_photo'];a=load(m['src'])
  if m.get('mask') and mode!='rect':
    mk=np.asarray(Image.open('assets/mockups/'+m['mask'].split('/')[-1]).convert('LA').resize((N,N)))
    al=mk[...,1] if mk[...,1].min()<250 else mk[...,0]
    fg=al>128
    if 0.01<fg.mean()<0.97: return a,clean(fg),'mask'
  lab=color.rgb2lab(a)
  # quadratic bg model from border band
  yy,xx=np.mgrid[0:N,0:N]/N
  B=np.zeros((N,N),bool);B[:10]=B[-10:]=B[:,:10]=B[:,-10:]=True
  A=np.stack([np.ones_like(xx),xx,yy,xx*yy,xx**2,yy**2],-1)
  model=np.zeros_like(lab)
  for c in range(3):
    co,*_=np.linalg.lstsq(A[B],lab[...,c][B],rcond=None); model[...,c]=A@co
  dist=np.sqrt(((lab-model)**2).sum(-1))
  import cv2
  g=np.full((N,N),cv2.GC_PR_BGD,np.uint8)
  g[dist>5]=cv2.GC_PR_FGD
  g[B]=cv2.GC_BGD
  img=(a*255).astype(np.uint8)[...,::-1].copy()
  bm=np.zeros((1,65));fm=np.zeros((1,65))
  if mode=='rect':
    g[:]=0; cv2.grabCut(img,g,(24,24,N-48,N-48),bm,fm,6,cv2.GC_INIT_WITH_RECT)
  else: cv2.grabCut(img,g,None,bm,fm,6,cv2.GC_INIT_WITH_MASK)
  return a,clean((g==1)|(g==3)),'seg'
def clean(fg):
  fg=nd.binary_opening(fg,iterations=2); fg=nd.binary_closing(fg,iterations=3); fg=nd.binary_fill_holes(fg)
  lab,n=nd.label(fg)
  if n:
    s=nd.sum(fg,lab,range(1,n+1)); keep=[i+1 for i,v in enumerate(s) if v>=0.15*s.max()]
    fg=np.isin(lab,keep)
  return fg
if __name__=='__main__':
  import sys;MODE=sys.argv[1]
  T=200;cols=10;sel=[p for p in ps if not p['mockup_photo'].get('mask')]
  sheet=Image.new('RGB',(cols*T,((len(sel)+cols-1)//cols)*(T+14)),'white')
  for i,p in enumerate(sel):
    a,fg,_=seg(p,MODE);im=a.copy()*255;im[~fg]*=0.35
    im=Image.fromarray(im.astype('uint8')).resize((T,T))
    X,Y=(i%cols)*T,(i//cols)*(T+14);sheet.paste(im,(X,Y));ImageDraw.Draw(sheet).text((X+2,Y+T),p['id'],fill='black')
  sheet.save('/workspace/print-area-check/seg_nomask_'+MODE+'.png')
