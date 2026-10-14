"""Versioned independent source/full archives with CRC and SHA256 verification."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import json, sys

root=Path(__file__).resolve().parents[1]
version=sys.argv[1]
assert version in {'v5','v6','v7'}
out=root.parent/'backups'
manifest={}
for kind in ['source','checkpoint']:
    target=out/f'MoonKiller-{version}-{kind}.zip'
    assert not target.exists(), 'Refuse overwriting an existing checkpoint'
    with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(root.rglob('*')):
            if not p.is_file(): continue
            rel=p.relative_to(root)
            if any(part in {'.godot','.runtime'} for part in rel.parts): continue
            if kind=='source' and ('exports' in rel.parts or p.suffix=='.log'): continue
            if p.suffix in {'.b64','.tmp'}: continue
            z.write(p,Path('MoonKiller')/rel)
    with ZipFile(target) as z:
        assert z.testzip() is None
        manifest[target.name]={'bytes':target.stat().st_size,'entries':len(z.namelist()),'crc_verified':True,'sha256':sha256(target.read_bytes()).hexdigest()}
(out/f'{version}_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
