"""Deterministic sprite-atlas extraction. No repainting or background removal.
Preserves generated RGBA pixels; trims alpha, assigns bottom-center anchors.
"""
from PIL import Image, ImageFilter, ImageDraw
from pathlib import Path
from collections import deque
import json

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'assets' / 'art'

def components(im):
    alpha = im.getchannel('A')
    w,h=im.size
    raw=bytearray(alpha.tobytes())
    comps=[]
    for start in range(w*h):
        if raw[start] < 12: continue
        raw[start]=0
        q=deque([start]); pts=[]; left=right=start%w; top=bottom=start//w
        while q:
            p=q.popleft(); pts.append(p); x=p%w; y=p//w
            left=min(left,x); right=max(right,x); top=min(top,y); bottom=max(bottom,y)
            for n in (p-1 if x>0 else -1,p+1 if x<w-1 else -1,p-w if y>0 else -1,p+w if y<h-1 else -1):
                if n>=0 and raw[n]>=12:
                    raw[n]=0; q.append(n)
        if len(pts)>8: comps.append((len(pts),(left,top,right+1,bottom+1),pts))
    return sorted(comps,reverse=True)

def extract(sheet,names,centers):
    im=Image.open(ART/sheet).convert('RGBA'); w,h=im.size
    cs=components(im)
    print(sheet, im.size, [(c[0],c[1]) for c in cs[:12]])
    groups=[[] for _ in names]
    for count,box,pts in cs:
        cx=(box[0]+box[2])/2/w; cy=(box[1]+box[3])/2/h
        group=min(range(len(names)),key=lambda i:(cx-centers[i][0])**2+(cy-centers[i][1])**2)
        groups[group].extend(pts)
    for name,pts in zip(names,groups):
        mask=Image.new('L',im.size,0); px=mask.load()
        for p in pts: px[p%w,p//w]=255
        # Include original anti-aliased contour without altering its alpha.
        mask=mask.filter(ImageFilter.MaxFilter(5))
        a=im.getchannel('A'); source=im.copy()
        from PIL import ImageChops
        source.putalpha(ImageChops.multiply(a,mask))
        box=source.getbbox()
        sprite=source.crop(box)
        sprite.save(ART/(name+'.png'))
        print(' ',name,sprite.size,box)

extract('buildings.png',['inn','archive','apothecary','forge'],[(.26,.28),(.76,.28),(.26,.77),(.76,.77)])
extract('props.png',['lamp','well','noticeboard','tree','bench','fence'],[(.19,.28),(.52,.36),(.85,.3),(.22,.77),(.52,.84),(.86,.79)])
if (ART/'details.png').exists():
    extract('details.png',['supplies','brambles','waymarker','milestone'],[(.25,.2),(.74,.2),(.25,.72),(.74,.72)])

# Character cells have clean gutters. Normalize all poses to identical
# canvas dimensions and ground anchors rather than independent sprite sizes.
im=Image.open(ART/'courier.png').convert('RGBA'); w,h=im.size
frames=[]
for row in range(2):
    for col in range(3):
        cell=im.crop((round(col*w/3),round(row*h/2),round((col+1)*w/3),round((row+1)*h/2)))
        box=cell.getbbox(); frames.append(cell.crop(box))
ch=max(f.height for f in frames); cw=max(f.width for f in frames)
for i,f in enumerate(frames):
    out=Image.new('RGBA',(cw+16,ch+16))
    out.alpha_composite(f,((out.width-f.width)//2,out.height-f.height-8))
    out.save(ART/f'courier_{i}.png')

# Visual sprite QA contact sheet, with checkerboard only for inspection.
files=['inn','archive','apothecary','forge','lamp','well','noticeboard','tree','bench','fence','courier_0','courier_3']
out=Image.new('RGB',(1200,900),'#526161'); dr=ImageDraw.Draw(out)
for i,name in enumerate(files):
    x=(i%4)*300; y=(i//4)*300
    for a in range(0,300,20):
        for b in range(0,300,20):
            dr.rectangle((x+a,y+b,x+a+19,y+b+19),fill='#697574' if (a+b)//20%2 else '#566362')
    f=Image.open(ART/(name+'.png')); f.thumbnail((278,262))
    out.paste(f,(x+(300-f.width)//2,y+276-f.height),f)
    dr.text((x+12,y+280),name,fill='#fff4d8')
out.save(ROOT/'evidence'/'asset_qa.png')
print('Character canvas:',cw+16,ch+16)
