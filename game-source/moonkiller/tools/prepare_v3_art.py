"""Deterministic splits/crops of the original v3 imagegen sheets; no repainting."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets/art/v3'
im = Image.open(root / 'materials.png'); w, h = im.size
for i, name in enumerate(['side', 'slate', 'timber', 'stone', 'door', 'plaster']):
    x, y = i % 3, i // 3
    im.crop((round(x*w/3), round(y*h/2), round((x+1)*w/3), round((y+1)*h/2))).save(root / (name+'.png'))

im = Image.open(root / 'fronts.png'); w, h = im.size
for i, name in enumerate(['archive_front', 'apothecary_front', 'forge_front']):
    im.crop((round(i*w/3), 0, round((i+1)*w/3), h)).save(root / (name+'.png'))

im = Image.open(root / 'icons.png').convert('RGBA'); w, h = im.size
for i, name in enumerate(['moth', 'clock', 'herb', 'anvil']):
    x, y = i % 2, i // 2
    part = im.crop((round(x*w/2), round(y*h/2), round((x+1)*w/2), round((y+1)*h/2)))
    part.crop(part.getchannel('A').getbbox()).save(root / (name+'.png'))

im = Image.open(root / 'side.png'); w, h = im.size
im.crop((0, round(h/3), w, h)).save(root / 'side2.png')
im.crop((0, round(h*2/3), w, h)).save(root / 'side1.png')
Image.open(root / 'inn_front.png').crop((530,40,703,337)).save(root / 'attic_window.png')
im = Image.open(root / 'apothecary_front.png'); w, h = im.size
im.crop((round(w*.045), round(h*.43), round(w*.32), round(h*.79))).save(root / 'shop_window.png')
Image.open(root / 'stone.png').crop((210,82,354,176)).save(root / 'flagstone.png')
print('v3 textures prepared:', root)
