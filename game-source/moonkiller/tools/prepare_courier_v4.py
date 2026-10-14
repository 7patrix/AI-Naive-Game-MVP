"""Split original generated animation sheets and align scale/head/ground anchors.
No repainting. Fixed scale within each direction avoids breathing-sized frames.
The game uses one stable original head layer plus each animated body crop.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from statistics import median
import json
from collections import deque

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'assets/art/v4'
SIZE=(720,643)
GROUND=638
HEAD_CUT=278
mapping={'front':0,'back':3,'right':5,'left':5}
manifest={'canvas':SIZE,'ground_pixel':GROUND,'body_cut':HEAD_CUT,'directions':{}}

def bounds(im):
    return im.getchannel('A').point(lambda x:255 if x>=64 else 0).getbbox()

def head_x(im, bb):
    part=im.crop((bb[0],bb[1],bb[2],round(bb[1]+(bb[3]-bb[1])*.30)))
    b=bounds(part)
    return bb[0]+(b[0]+b[2])*.5

def clean_cell(cell):
    # Generated rows can intrude a few pixels into the neighbouring cell.
    # Keep the main body's vertical extent; preserve original RGBA within it.
    w,h=cell.size;raw=bytearray(cell.getchannel('A').tobytes());best=(0,(0,0,w,h))
    for start in range(w*h):
        if raw[start]<64:continue
        raw[start]=0;q=deque([start]);count=0;l=r=start%w;t=b=start//w
        while q:
            p=q.popleft();x=p%w;y=p//w;count+=1
            l=min(l,x);r=max(r,x);t=min(t,y);b=max(b,y)
            for n in (p-1 if x else -1,p+1 if x<w-1 else -1,p-w if y else -1,p+w if y<h-1 else -1):
                if n>=0 and raw[n]>=64:raw[n]=0;q.append(n)
        if count>best[0]:best=(count,(l,t,r+1,b+1))
    bb=best[1]
    return cell.crop((0,max(0,bb[1]-2),w,min(h,bb[3]+2)))

for direction, reference in mapping.items():
    path=ART/(direction+'_sheet.png')
    if not path.exists():continue
    original=Image.open(ROOT/('assets/art/courier_%d.png'%reference)).convert('RGBA')
    ref_bb=bounds(original)
    target_height=ref_bb[3]-ref_bb[1]
    target_x=head_x(original,ref_bb)+(SIZE[0]-original.width)*0.5
    sheet=Image.open(path).convert('RGBA');w,h=sheet.size
    cells=[clean_cell(sheet.crop((round(i%3*w/3),round(i//3*h/3),round((i%3+1)*w/3),round((i//3+1)*h/3)))) for i in range(9)]
    boxes=[bounds(c) for c in cells]
    if any(bb is None for bb in boxes):raise ValueError('Empty animation cell: '+direction)
    scale=target_height/median([b[3]-b[1] for b in boxes])
    records=[]
    for i,(cell,bb) in enumerate(zip(cells,boxes)):
        cx=head_x(cell,bb)
        cropped=cell.crop(bb)
        resized=cropped.resize((round(cropped.width*scale),round(cropped.height*scale)),Image.Resampling.LANCZOS)
        x=round(target_x-(cx-bb[0])*scale)
        y=GROUND-resized.height
        out=Image.new('RGBA',SIZE)
        out.alpha_composite(resized,(x,y))
        out.save(ART/(direction+'_%d.png'%i))
        records.append({'frame':i,'source_bounds':bb,'paste':[x,y],'alpha_bounds':bounds(out)})
    manifest['directions'][direction]={'reference':reference,'fixed_scale':scale,'head_x':target_x,'head_shift_pixels':GROUND-ref_bb[3],'frames':records}

(ART/'alignment.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
contact=Image.new('RGB',(9*180,len(manifest['directions'])*272),'#324144')
d=ImageDraw.Draw(contact)
for row,direction in enumerate(manifest['directions']):
    for i in range(9):
        im=Image.open(ART/(direction+'_%d.png'%i));im.thumbnail((170,242))
        x=i*180+(180-im.width)//2;y=row*272+248-im.height
        contact.paste(im,(x,y),im)
        d.line((i*180,row*272+248,(i+1)*180,row*272+248),fill='#86938a')
        d.text((i*180+6,row*272+253),direction+' '+('idle' if i==0 else str(i)),fill='#eee6cc')
contact.save(ROOT/'evidence/animation_v4/asset_frames.png')
print('Aligned directions:',list(manifest['directions']))
