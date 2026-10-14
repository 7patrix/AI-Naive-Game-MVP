from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import shutil, json, subprocess, sys

root=Path(__file__).resolve().parents[1]
out=root.parent/'backups'
subprocess.run([sys.executable,str(root/'tools/package_source.py')],check=True)
source=out/'MoonKiller-v4-source.zip'
shutil.copyfile(root.parent/'MoonKiller-source.zip',source)
complete=out/'MoonKiller-v4-checkpoint.zip'
with ZipFile(complete,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file(): continue
        rel=p.relative_to(root)
        if any(part in {'.godot','.runtime'} for part in rel.parts): continue
        if p.suffix in {'.b64','.tmp'}: continue
        z.write(p,Path('MoonKiller')/rel)
manifest={}
for p in [source,complete]:
    with ZipFile(p) as z:
        assert z.testzip() is None
        manifest[p.name]={'bytes':p.stat().st_size,'crc_verified':True,'entries':len(z.namelist()),'sha256':sha256(p.read_bytes()).hexdigest()}
(out/'v4_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
