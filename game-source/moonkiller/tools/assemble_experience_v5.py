from pathlib import Path
from PIL import Image
import json, math, statistics, sys

root=Path(__file__).resolve().parents[1]/'evidence/experience_v5'
data=json.loads((root/'continuous_trace.json').read_text())
frames=data['frames']
assert data['teleports_during_recording']==0 and any(f['locator'] for f in frames)
assert frames[0]['prompt']=='board' and frames[-1]['prompt']=='door'
assert any(f['occluded'] and not f['locator'] for f in frames) # small delay before indicator
gaps=[b['time']-a['time'] for a,b in zip(frames,frames[1:])]
moves=[math.dist(a['position'],b['position']) for a,b in zip(frames,frames[1:])]
assert all(d<5.5*dt+0.15 for d,dt in zip(moves,gaps))
selected=[0,len(frames)//4,len(frames)//2,3*len(frames)//4,len(frames)-1]
sources=[Image.open(root/f['file']).convert('RGB').resize((768,480),Image.Resampling.LANCZOS) for f in frames]
atlas=Image.new('RGB',(768,480*len(selected)))
for k,i in enumerate(selected): atlas.paste(sources[i],(0,480*k))
palette=atlas.quantize(colors=256)
warm=[c for i in selected for c in sources[i].get_flattened_data() if c[0]>110 and c[0]>c[1]*1.2 and c[1]>c[2]*1.3]
tile=Image.new('RGB',(len(warm),1)); tile.putdata(warm)
values=palette.getpalette(); values[-48:]=tile.quantize(colors=16).getpalette()[:48]; palette.putpalette(values)
time=[round((f['time']-frames[0]['time'])*100) for f in frames]
durations=[(b-a)*10 for a,b in zip(time,time[1:])]+[round(statistics.median(gaps)*100)*10]
target=root/'experience_continuous_v5.gif'
if '--gif' in sys.argv:
    images=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in sources]
    images[0].save(target,save_all=True,append_images=images[1:],duration=durations,loop=0,optimize=True,disposal=1)
marker=next(f for f in frames if f['locator'])
Image.open(root/marker['file']).save(root/'occlusion_locator.png')
Image.open(root/frames[0]['file']).save(root/'stable_prompt.png')
video=root/'experience_continuous_v5.webm'
report={'frames':len(frames),'duration_ms':sum(durations),'continuous':True,'teleports':0,'camera':data['camera'],'locator_frames':sum(f['locator'] for f in frames),'foot_contact_count':len(data['contacts']),'contact_frames':sorted(set(c['frame'] for c in data['contacts'])),'video_bytes':video.stat().st_size,'video':video.name}
assert report['contact_frames']==[1,5]
(root/'recording_validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
