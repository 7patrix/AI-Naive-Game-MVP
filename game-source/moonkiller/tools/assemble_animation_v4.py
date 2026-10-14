"""Package chronological native viewport captures; never reorder or interpolate."""
from pathlib import Path
from PIL import Image, ImageDraw
from statistics import median
from math import dist
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/animation_v4'
trace=json.loads((OUT/'continuous_trace.json').read_text(encoding='utf-8'))
frames=trace['frames']
assert trace['fixed_camera'] and trace['teleports_during_recording']==0
assert len(frames)>100 and not frames[0]['walking'] and not frames[-1]['walking']
directions={f['facing'] for f in frames if f['walking']}
assert directions=={'front','back','left','right'}
deltas=[b['time']-a['time'] for a,b in zip(frames,frames[1:])]
assert min(deltas)>0
movements=[dist(a['position'],b['position']) for a,b in zip(frames,frames[1:])]
# Small render/physics sampling skew is allowed, teleport-scale jumps are not.
assert all(d<=5.5*dt+0.15 for d,dt in zip(movements,deltas))
sources=[Image.open(OUT/f['file']).convert('RGB') for f in frames]
assert {s.size for s in sources}=={(960,600)}
selected=[next(i for i,f in enumerate(frames) if f['facing']==d and f['walking']) for d in ['front','back','right','left']]
palette_source=Image.new('RGB',(1800,590))
for column,i in enumerate([0]+selected):
    palette_source.paste(sources[i].resize((360,200)),(column*360,0))
    # Give the small painted character enough palette weight to retain ochre,
    # skin and lantern warmth rather than spending every color on paving.
    x,y=frames[i]['screen']
    detail=sources[i].crop((round(x-60),round(y-125),round(x+60),round(y+5)))
    palette_source.paste(detail.resize((360,390),Image.Resampling.NEAREST),(column*360,200))
palette=palette_source.quantize(colors=256)
warm_pixels=[rgb for i in [0]+selected for rgb in sources[i].getdata() if rgb[0]>110 and rgb[0]>rgb[1]*1.2 and rgb[1]>rgb[2]*1.3]
warm=Image.new('RGB',(len(warm_pixels),1))
warm.putdata(warm_pixels)
warm_palette=warm.quantize(colors=16).getpalette()[:48]
combined=palette.getpalette()
combined[-48:]=warm_palette
palette.putpalette(combined)
converted=[s.quantize(palette=palette,dither=Image.Dither.NONE) for s in sources]
boundaries=[round((f['time']-frames[0]['time'])*100) for f in frames]
durations=[max(10,(b-a)*10) for a,b in zip(boundaries,boundaries[1:])]+[max(10,round(median(deltas)*100)*10)]
gif=OUT/'courier_walk_continuous_v4.gif'
converted[0].save(gif,save_all=True,append_images=converted[1:],duration=durations,loop=0,optimize=True,disposal=1)

# Companion inspection sheet uses actual viewport crops, not painted source frames.
sheet=Image.new('RGB',(8*170,4*190),(27,36,34))
draw=ImageDraw.Draw(sheet)
for row,d in enumerate(['front','back','right','left']):
    for col,phase in enumerate(range(1,9)):
        match=next(((i,f) for i,f in enumerate(frames) if f['facing']==d and f['frame']==phase and f['walking']),None)
        if match is None: continue
        i,f=match
        x,y=f['screen']
        crop=sources[i].crop((round(x-80),round(y-145),round(x+80),round(y+15)))
        sheet.paste(crop,(col*170+5,row*190+20))
        draw.text((col*170+5,row*190+4),f'{d} step {phase}',fill=(232,217,183))
sheet.save(OUT/'native_step_frames_v4.png')
report={
    'frame_count':len(frames),'gif_duration_ms':sum(durations),
    'source_sample_duration_seconds':frames[-1]['time']-frames[0]['time'],
    'fixed_camera':True,'teleports_during_recording':0,
    'directions':sorted(directions),'first_and_last_idle':True,
    'maximum_frame_displacement':max(movements),
    'peak_recorded_speed':max(f['speed'] for f in frames),
    'max_sample_gap_seconds':max(deltas),
    'gif':gif.name,'gif_bytes':gif.stat().st_size,
    'method':'Chronological native viewport JPEGs. No pose substitution, reordered frames, montage, interpolation or camera cuts.'
}
(OUT/'recording_validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
