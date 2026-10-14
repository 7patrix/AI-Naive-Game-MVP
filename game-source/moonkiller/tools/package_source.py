from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED

root=Path(__file__).resolve().parents[1]
target=root.parent/'MoonKiller-source.zip'
skip={'.godot','.runtime','exports'}
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file(): continue
        rel=p.relative_to(root)
        if any(part in skip for part in rel.parts): continue
        if p.suffix in {'.b64','.log','.tmp'}: continue
        if p.name.endswith('_console.txt'): continue
        z.write(p,Path('MoonKiller')/rel)
print(target)
print('Bytes:',target.stat().st_size)
