"""Native DWG save, actual option commands, clean reopen and full mesh proof."""
import argparse,hashlib,itertools,json,sys
from pathlib import Path
import numpy as np
import ezdxf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'s3000'))
from convert_autocad_dwg import run_core,snapshot
from check_autocad_opening import plot_lines

KEYS=['economizer','deaerator','modulation','gpz','bdv','fv']
def lisp_forms(source):
 """Validate complete forms before sending them to a command stream."""
 forms=[];buf=[];depth=0;quoted=False;escape=False
 for line in source.splitlines():
  for char in line:
   if not quoted and char==';':break
   buf.append(char)
   if quoted:
    if escape:escape=False
    elif char=='\\':escape=True
    elif char=='"':quoted=False
   elif char=='"':quoted=True
   elif char=='(':depth+=1
   elif char==')':
    depth-=1;assert depth>=0,'Extra closing parenthesis in AutoLISP'
    if depth==0:forms.append(''.join(buf).strip());buf=[]
  if buf:buf.append(' ')
 assert depth==0 and not quoted,'Incomplete AutoLISP form'
 assert not ''.join(buf).strip(),'Text outside AutoLISP forms'
 return forms

def lisp_lines(source):
 """Core Console truncates long input lines: preserve the validated source layout."""
 lisp_forms(source)
 lines=[line for line in source.splitlines() if line.strip() and not line.lstrip().startswith(';')]
 assert max(map(len,lines))<255,'Keep AutoLISP command-stream lines below 255 characters'
 return lines

def state(values):return "'("+' '.join('("'+k+'" . '+str(int(v))+')' for k,v in zip(KEYS,values))+')'
def config_script(commands,manifest,out,full=True,plots=False):
 configs=list(itertools.product([0,1],repeat=6)) if not full else [(*v,1,1) for v in itertools.product([0,1],repeat=4)]+[(1,1,1,1,0,0),(1,1,1,1,0,1),(1,1,1,1,1,0),(1,1,1,1,1,1)]
 lines=['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)','(setvar "BACKGROUNDPLOT" 0)','(command "_.AUDIT" "_N")',*lisp_lines(commands),
  '(defun s4:record (filename / f rule d)',
  ' (setq f (open filename "w"))',
  ' (foreach rule s4:rules (setq d (tblsearch "LAYER" (car rule)))',
  '  (write-line (strcat (car rule) "|" (itoa (cdr (assoc 70 d)))) f)) (close f)',
  ' (setq f (open (strcat filename ".options") "w"))',
  ' (write-line (vl-prin1-to-string (s4:read)) f)',
  ' (setq d (dictsearch (namedobjdict) "S4000_STATE"))',
  ' (write-line (itoa (length (vl-remove-if-not \'(lambda (x) (= (car x) 1)) d))) f) (close f))']
 for i,values in enumerate(configs):
  lines+=['(s4:apply '+state(values)+')','(s4:record "state-'+str(i)+'.txt")']
  if full and plots and values==(0,1,1,1,1,1):lines+=['(c:S4000REAR)','(command "_.ZOOM" "_E")','(command "_.ZOOM" "0.90x")',*plot_lines('S4000-native-direct')]
 lines+=['(c:S4000ALL)','(s4:record "state-restored.txt")']
 if full and plots:lines+=['(c:S4000VIEW)',*plot_lines('S4000-native-overview')]
 lines+=['(command "_.AUDIT" "_N")','(princ "S4000_OPTION_CHECK_FINISHED")','(command "_.QUIT" "_Y")','']
 script=out/'options.scr';script.write_text('\n'.join(lines),encoding='ascii');return script,configs

def check_options(source,autocad,out,manifest,commands,fixture=False,plots=False):
 out.mkdir(parents=True,exist_ok=True)
 if fixture:
  source=out/'fixture.dxf';doc=ezdxf.new('R2018');doc.units=4
  for part in manifest['parts']:doc.layers.new('S4000_'+part['id'])
  doc.modelspace().add_line((0,0),(100,100));doc.saveas(source)
 before=hashlib.sha256(source.read_bytes()).hexdigest()
 script,configs=config_script(commands,manifest,out,not fixture,plots)
 text=run_core(autocad,source,script,out/'native-options.log')
 body=text.split('Command: (command "_.QUIT"')[0].lower()
 assert 's4000_option_check_finished' in body
 assert not any(x in body for x in ['error:','malformed list','extra right paren','no function definition']),body[-3000:]
 configs.append(tuple(int(manifest['default_options'][k]) for k in KEYS))
 for i,values in enumerate(configs):
  filename='state-restored.txt' if i==len(configs)-1 else 'state-'+str(i)+'.txt'
  actual={line.split('|')[0]:int(line.split('|')[1]) for line in (out/filename).read_text().splitlines()};opts=dict(zip(KEYS,values))
  stored=(out/(filename+'.options')).read_text().splitlines()
  assert ''.join(stored[0].split())==''.join(state(values)[1:].split()),'Stored option state is stale'
  assert stored[1]=='1','Persistent state must contain exactly one payload'
  assert len(actual)==len(manifest['parts'])
  for part in manifest['parts']:
   shown=all(opts[k]==int(v) for k,v in part['when'].items())
   assert (actual['S4000_'+part['id']]&1==0)==shown,(i,part['id'],opts)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==before
 if plots:
  for name in ['S4000-native-direct.pdf','S4000-native-overview.pdf']:assert (out/name).stat().st_size>10000,name
 return dict(status='PASSED_NATIVE_LAYER_OPTIONS',fixture=fixture,combinations=len(configs)-1,restored=True,parts=len(manifest['parts']),source_unchanged=True,audit_errors=0,state_matches_every_configuration=True,single_payload=True)

def run(a):
 a.private.mkdir(parents=True,exist_ok=True);manifest=json.loads(a.manifest.read_text(encoding='utf8'))
 commands=(a.source.parent/'S4000-options.lsp').read_text(encoding='ascii')
 if a.plots_only:
  output=a.source.with_suffix('.dwg');before=hashlib.sha256(output.read_bytes()).hexdigest()
  script=a.private/'plots.scr'
  lines=['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)','(setvar "BACKGROUNDPLOT" 0)','(command "_.AUDIT" "_N")',*lisp_lines(commands),
   '(c:S4000ECOOFF)','(c:S4000REAR)','(command "_.ZOOM" "_E")','(command "_.ZOOM" "0.90x")',*plot_lines('S4000-native-direct'),
   '(c:S4000ALL)','(c:S4000VIEW)',*plot_lines('S4000-native-overview'),'(command "_.QUIT" "_Y")','']
  script.write_text('\n'.join(lines),encoding='ascii');run_core(a.autocad,output,script,a.private/'plots.log')
  assert before==hashlib.sha256(output.read_bytes()).hexdigest()
  for stem in ['S4000-native-direct','S4000-native-overview']:assert (a.private/(stem+'.pdf')).stat().st_size>10000
  print('NATIVE_PLOTS_CREATED_SOURCE_UNCHANGED',flush=True);return
 fixture=check_options(a.source,a.autocad,a.private/'fixture',manifest,commands,True)
 print('FIXTURE_PASSED',fixture,flush=True)
 if a.fixture_only:return
 output=a.source.with_suffix('.dwg');assert not output.exists(),output
 expected=snapshot(a.source);source_hash=hashlib.sha256(a.source.read_bytes()).hexdigest()
 view_names=['S4000_ALL','S4000_REAR','S4000_PUMPS','S4000_DEAERATOR','S4000_TOP']
 if 'door_groups' in manifest:view_names+=['S4000_DOOR','S4000_CABINET']
 if 'pressure_revision' in manifest:view_names+=['S4000_PRESSURE']
 if 'blowdown_revision' in manifest:view_names+=['S4000_BLOWDOWN','S4000_ROUTING']
 if 'floor_revision' in manifest:view_names+=['S4000_TRAP']
 style_views=['(command "_.-VIEW" "_E" "_V" "'+v+'" "PREMIUM_SOLID" "" "")' for v in view_names]
 overview_direction='-1,-1,0.72' if 'door_groups' in manifest else '1,-1,0.8'
 # Use full ASCII paths only in AutoLISP; source is passed as a structured arg.
 assert str(output).isascii()
 lines=['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)','(setvar "INSUNITS" 4)','(setvar "UCSICON" 0)','(setvar "GRIDMODE" 0)',
  '(command "_.VSCURRENT" "_Shaded")','(setvar "VSEDGES" 0)','(setvar "VSSILHEDGES" 0)',
  '(setvar "VSOCCLUDEDEDGES" 0)','(setvar "VSINTERSECTIONEDGES" 0)','(setvar "VSFACEOPACITY" 100)','(setvar "VSSHADOWS" 0)',
  '(command "_.-VISUALSTYLES" "_S" "PREMIUM_SOLID")',*lisp_lines(commands),'(c:S4000ALL)',
  *style_views,
  '(command "_.VPOINT" "'+overview_direction+'")','(command "_.ZOOM" "_E")','(command "_.ZOOM" "0.94x")',
  '(command "_.-VIEW" "_D" "S4000_ALL")','(command "_.-VIEW" "_S" "S4000_ALL")',
  '(command "_.AUDIT" "_N")','(setvar "FILEDIA" 1)','(setvar "CMDDIA" 1)',
  '(command "_.SAVEAS" "_2018" "'+output.as_posix()+'")','(command "_.QUIT")','']
 script=a.private/'save.scr';script.write_text('\n'.join(lines),encoding='ascii')
 run_core(a.autocad,a.source,script,a.private/'save.log');assert output.read_bytes()[:6]==b'AC1032'
 print('DWG_SAVED',output.stat().st_size,flush=True)
 options=check_options(output,a.autocad,a.private/'full-options',manifest,commands,plots=a.plots)
 print('NATIVE_OPTIONS_PASSED',options,flush=True)
 roundtrip=a.private/'reopened.dxf';assert not roundtrip.exists()
 script=a.private/'reopen.scr';script.write_text('\n'.join(['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)',
  '(command "_.AUDIT" "_N")','(command "_.DXFOUT" "'+roundtrip.as_posix()+'" "16")','(command "_.QUIT" "_Y")','']),encoding='ascii')
 run_core(a.autocad,output,script,a.private/'reopen.log');actual=snapshot(roundtrip)
 assert set(actual['blocks'])==set(expected['blocks']);reversed_count=0
 for name,part in expected['blocks'].items():
  other=actual['blocks'][name];assert other['layer']==part['layer'];assert len(other['meshes'])==len(part['meshes'])
  for x,y in zip(part['meshes'],other['meshes']):
   for key in ['vertices','faces','triangles','xyz_sha256_1micron','rgb']:assert x[key]==y[key],(name,key)
   if x['topology_sha256']!=y['topology_sha256']:
    assert x['reversed_topology_sha256']==y['topology_sha256'],name;reversed_count+=1
 reopened=ezdxf.readfile(roundtrip)
 assert 'S4000_STATE' in reopened.rootdict
 for p in manifest['parts']:
  should_show=all(manifest['default_options'][k]==v for k,v in p['when'].items())
  assert reopened.layers.get('S4000_'+p['id']).is_frozen()!=should_show,p['id']
 assert source_hash==hashlib.sha256(a.source.read_bytes()).hexdigest()
 result=dict(status='PASSED_AUTOCAD_SAVE_OPTIONS_REOPEN',version=manifest['version'],date=manifest['date'],author=manifest['author'],
  file=output.name,bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest(),units='mm',
  format='AutoCAD 2018 / AC1032',autocad='2027 Core Console',blocks=len(actual['blocks']),meshes=sum(len(p['meshes']) for p in actual['blocks'].values()),
  triangles=sum(m['triangles'] for p in actual['blocks'].values() for m in p['meshes']),coordinates_preserved_mm=.001,
  topology_preserved=True,whole_mesh_reversals=reversed_count,colours_preserved=True,default_layers_preserved=True,state_persistent=True,
  audit_errors=0,fixture=fixture,native_options=options)
 output.with_suffix('.verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--manifest',type=Path,required=True)
 p.add_argument('--autocad',type=Path,default=Path('E:/AutoCAD 2027/accoreconsole.exe'));p.add_argument('--private',type=Path,required=True)
 p.add_argument('--fixture-only',action='store_true');p.add_argument('--plots',action='store_true');p.add_argument('--plots-only',action='store_true');run(p.parse_args())
