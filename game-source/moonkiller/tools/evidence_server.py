"""Temporary loopback-only packaging server; writes only generated evidence WebM."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, re, os, hashlib

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_POST(self):
        parsed=urlparse(self.path); query=parse_qs(parsed.query)
        source=query.get('source',[''])[0]; name=query.get('name',[''])[0]
        size=int(self.headers.get('Content-Length','0'))
        if parsed.path!='/save-video' or self.headers.get('Origin')!='http://127.0.0.1:8767' or source not in {'experience_v5','first_night_v6'} or not re.fullmatch(r'[a-z0-9_-]+',name) or not 0<size<32*1024*1024:
            self.send_error(403); return
        data=self.rfile.read(size)
        if not data.startswith(bytes.fromhex('1a45dfa3')): self.send_error(415); return
        target=(ROOT/'evidence'/source/(name+'.webm')).resolve()
        assert target.is_relative_to(ROOT/'evidence')
        target.write_bytes(data)
        payload=json.dumps({'saved':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)

print('EVIDENCE_SERVER_PID',os.getpid(),flush=True)
ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
