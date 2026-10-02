"""2026-10-02 · Codex / GPT-6. Validate PHP with fake transport; never send email."""
import base64,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=(root/'public/api/request-quote.php').read_bytes()
test=(root/'tools/cascade/quote-endpoint.test.php').read_text('utf8').split('\n',3)[3]
code="<?php $path=tempnam(sys_get_temp_dir(),'quote-test-');file_put_contents($path,base64_decode('"+base64.b64encode(source).decode()+"'));require $path;unlink($path);\n"+test
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=20','premiuig@premiuig.beget.tech','php'],input=code,text=True,encoding='utf8',capture_output=True,check=True)
assert r.stdout.strip()=='PASSED_QUOTE_ENDPOINT_FAKE_TRANSPORT',r.stdout
out=root/'artifacts/customer-experience/quote-endpoint.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(dict(status=r.stdout.strip(),sha256=hashlib.sha256(source).hexdigest(),runtime='Hosting PHP CLI',delivery='FAKE_TRANSPORT_NO_MAIL_SENT'),indent=2)+'\n','utf8')
print(r.stdout.strip())
