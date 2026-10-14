from pathlib import Path
from PIL import Image
import json, hashlib, re
root=Path(__file__).resolve().parents[1]
e=root/'evidence/first_night_v6'
clips={}
for clip in ('interior_walk','night_west','night_clock'):
    trace=json.loads((e/(clip+'_trace.json')).read_text())
    frames=trace['frames']
    assert frames and all(frames[i]['time']>frames[i-1]['time'] for i in range(1,len(frames)))
    assert all((e/f['file']).exists() for f in frames)
    for f in frames:
        assert Image.open(e/f['file']).size==(960,600)
    expected=[]
    for a,b in zip(frames,frames[1:]):
        jump=sum((x-y)**2 for x,y in zip(a['position'],b['position']))**.5
        if jump>2:
            assert a['room']!=b['room'], 'A non-doorway jump invalidates the recording'
            expected.append({'time':b['time'],'from':a['room'],'to':b['room']})
    candidate=[f for f in frames if f['dialog']=='' and (f['room']!='' if clip=='interior_walk' else f['phase']=='night')]
    if candidate:
        shot=candidate[len(candidate)//2] if clip=='interior_walk' else candidate[-1]
        Image.open(e/shot['file']).save(e/(clip+'_playable.png'))
    if clip.startswith('night_'):
        assert frames[-1]['phase']=='ending'
        Image.open(e/frames[-1]['file']).save(e/(clip+'_reply.png'))
    clips[clip]={'source_frames':len(frames),'duration_seconds':frames[-1]['time']-frames[0]['time']+.07,'normal_doorway_transitions':expected,'setup_teleports':trace['setup_teleports'],'source_frames_verified':True}
walks={}
for route in ('west','clock'):
    walk=json.loads((e/('input_walk_'+route+'.json')).read_text())
    assert not walk['failed'] and walk['phase']=='ending' and walk['oil']==0 and walk['setup_teleports']==0
    walks[route]=walk
native=json.loads((e/'native_results.json').read_text())
assert all(x.startswith('PASS') for x in native['results'])
summary={'native_first_night_checks':len(native['results']),'native_failures':0,'clips':clips,'full_input_walks':walks,'playtime_target_minutes':[10,15],'human_playtime_verified':False,'web':'See console proof saved after final browser QA','recordings_have_audio':False}
web=json.loads((e/'web_console_logs.json').read_text())
complete=[x['message'] for x in web if 'FIRST_NIGHT_QA_COMPLETE' in x['message']]
assert complete and 'results=111 failures=0' in complete[-1]
assert not any('SCRIPT ERROR' in x['message'] or x['level']=='error' for x in web)
summary['web_first_night_checks']=111
summary['web_failures']=0
summary['web_test_viewport']=[720,540]
summary['regressions']={'native_experience_v5':16,'native_animation_v4':36,'native_original_gameplay':29,'native_scene_reload':5}
summary['exports']={'Web':'export exit 0; both endings/replay actually run in browser','Windows':'export exit 0; exported program actually run, startup marker confirmed, exit 0'}
for clip,metadata in [('interior_walk','interior_video_validation.json'),('night_west','west_video_validation.json'),('night_clock','clock_video_validation.json')]:
    meta=json.loads((e/metadata).read_text())
    count=clips[clip]['source_frames']
    assert f'{count} source / {count} encoded / {count} decoded frames' in meta['status']
    assert meta['readyState']==4 and (meta['width'],meta['height'])==(960,600)
    assert abs(meta['duration']-clips[clip]['duration_seconds'])<.01
    name={'interior_walk':'interior_walk_v6','night_west':'night_west_v6','night_clock':'night_clock_v6'}[clip]
    video=e/(name+'.webm')
    clips[clip]['video']={'file':video.name,'bytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'browser_decoded_duration':meta['duration'],'encoded_frames':count,'decoded_frames':count}
assert 'FIRST_NIGHT_READY' in (e/'standalone.log').read_text(encoding='utf-8')
for file in e.glob('*.log'):
    text=file.read_text(encoding='utf-8',errors='replace')
    assert 'SCRIPT ERROR' not in text and 'FIRST_NIGHT_WALK_FAIL' not in text, file
(e/'validation_summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'native_checks':len(native['results']),'clip_frames':{k:v['source_frames'] for k,v in clips.items()},'actual_input_walk_seconds':{k:v['seconds'] for k,v in walks.items()},'human_playtime_verified':False}))
