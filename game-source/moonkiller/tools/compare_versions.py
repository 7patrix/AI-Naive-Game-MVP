from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root=Path(__file__).resolve().parents[1]
a=Image.open(root/'evidence/v1_before.png').convert('RGB')
b=Image.open(root/'evidence/v2_after.png').convert('RGB')
a.thumbnail((960,600)); b.thumbnail((960,600))
out=Image.new('RGB',(1920,648),'#172426')
out.paste(a,(0,48)); out.paste(b,(960,48))
d=ImageDraw.Draw(out)
font=ImageFont.truetype(str(root/'assets/fonts/NotoSansCJKsc-Regular.otf'),22)
d.text((24,10),'首版：英文 HUD',font=font,fill='#e5dcc0')
d.text((984,10),'小完善：中文 HUD / 可切回英文',font=font,fill='#e5dcc0')
out.save(root/'evidence/v1_v2_comparison.png')
