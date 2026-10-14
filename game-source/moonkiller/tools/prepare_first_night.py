"""Deterministic crop/scale only; original generated pixels are never repainted."""
from pathlib import Path
from PIL import Image
import json, shutil
root=Path(__file__).resolve().parents[1]
src=root.parent/'staging/first_night'
out=root/'assets/art/first_night'
out.mkdir(parents=True,exist_ok=True)
for name in ('npc_sheet.png','npc_prompt.txt','interior_walls.png','interior_prompt.txt'):
    shutil.copy2(src/name,out/name)
im=Image.open(src/'npc_sheet.png').convert('RGBA')
report={'method':'crop, uniform resize, transparent canvas; no repaint','residents':{}}
for i,name in enumerate(('innkeeper','apothecary','clockmaker')):
    cell=im.crop((i*im.width//3,0,(i+1)*im.width//3,im.height))
    bb=cell.getchannel('A').point(lambda a:255 if a>=64 else 0).getbbox()
    crop=cell.crop(bb); scale=min(418/crop.width,620/crop.height)
    crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(434,643),(0,0,0,0))
    canvas.alpha_composite(crop,((434-crop.width)//2,638-crop.height))
    canvas.save(out/(name+'.png'))
    report['residents'][name]={'source_column':i,'source_bounds':bb,'uniform_scale':scale,'foot_y':638}
wall=Image.open(src/'interior_walls.png').convert('RGB')
split=wall.height//2
for name,top,bottom in [('inn_wall',0,split),('apothecary_wall',split,wall.height)]:
    wall.crop((0,top,1172,bottom)).save(out/(name+'.png'))
report['walls']={'source_size':wall.size,'crop_width':1172,'world_size':[12,3.4]}
(out/'preparation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
