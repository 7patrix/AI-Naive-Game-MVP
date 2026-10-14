from pathlib import Path
root=Path(__file__).resolve().parents[1]
web=root/'exports/web'
text=(web/'index.html').read_text(encoding='utf-8')
for name,argument in [('qa_dialog','--qa-dialog'),('qa_first_night','--qa-first-night'),('qa_experience','--qa-experience'),('qa_animation','--qa-animation'),('qa','--qa')]:
    assert '"args":[]' in text
    (web/(name+'.html')).write_text(text.replace('"args":[]','"args":["--","'+argument+'"]'),encoding='utf-8')
print('Created local QA entry points')
