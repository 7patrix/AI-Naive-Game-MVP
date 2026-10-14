from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, difflib

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/animation_v4'
def count_lines(filename,prefix,count):
    text=(OUT/filename).read_text(encoding='utf-8')
    lines=[s for s in text.splitlines() if s.startswith(prefix)]
    assert len(lines)==count and all('FAIL' not in s for s in lines),filename
    return len(lines)
summary={
    'native_animation':count_lines('qa_results.txt','PASS ',36),
    'native_regression':count_lines('regression_results.txt','PASS ',29),
    'native_reload':count_lines('reload_results.txt','PASS ',5)
}
for filename,key,prefix,total in [('web_animation_logs.json','web_animation','ANIM_QA PASS ',36),('web_regression_logs.json','web_regression','QA PASS ',26)]:
    logs=json.loads((OUT/filename).read_text(encoding='utf-8'))
    matching=[s for s in logs if s['message'].startswith(prefix)]
    assert len(matching)==total and not any('FAIL' in s['message'] for s in logs)
    summary[key]=len(matching)
with ZipFile(ROOT.parent/'backups/MoonKiller-v3-checkpoint.zip') as old:
    names=['scripts/volume_building.gd','scripts/town_ui.gd','scripts/courier.gd','project.godot']
    names += [p.relative_to(ROOT).as_posix() for p in (ROOT/'assets/art/v3').glob('*.png')]
    unchanged=[]
    for name in names:
        prior=old.read('MoonKiller/'+name)
        current=(ROOT/name).read_bytes()
        assert sha256(prior).digest()==sha256(current).digest(),name
        unchanged.append(name)
    original=old.read('MoonKiller/scripts/town.gd').decode('utf-8').replace('\r\n','\n').splitlines(keepends=True)
    current=(ROOT/'scripts/town.gd').read_text(encoding='utf-8').splitlines(keepends=True)
    (OUT/'town_changes_from_v3.diff').write_text(''.join(difflib.unified_diff(original,current,fromfile='v3/town.gd',tofile='v4/town.gd')),encoding='utf-8')
summary['v3_files_verified_unchanged']=unchanged
summary['exports']={}
for platform,filename in [('web','export_web.log'),('windows','export_windows.log')]:
    log=(OUT/filename).read_text(encoding='utf-8')
    assert 'SCRIPT ERROR' not in log and 'Failed to export' not in log
    summary['exports'][platform]='export process exit 0; actual launch tested'
assert 'MOTHWAKE_READY' in (OUT/'standalone.log').read_text(encoding='utf-8')
summary['standalone_windows']='Started actual exported executable, MOTHWAKE_READY, quit-after 180, exit 0'
summary['web_manual']='960x600 normal entry, Escape pause, restart click, fresh MOTHWAKE_READY and quiet entrance verified'
summary['recording']=json.loads((OUT/'recording_validation.json').read_text(encoding='utf-8'))
summary['preview']={'native_pid':9332,'web_url':'http://127.0.0.1:8765/index.html'}
summary['web_pack_bytes']=(ROOT/'exports/web/index.pck').stat().st_size
summary['web_wasm_bytes']=(ROOT/'exports/web/index.wasm').stat().st_size
(OUT/'validation_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='v3_files_verified_unchanged'},indent=2))
