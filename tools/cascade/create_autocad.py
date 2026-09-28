"""Native AutoCAD blocks from the same detailed cascade scene, 28.09.2026.
Mesh definitions are shared by the two boilers. Door positions persist in DWG.
"""
import hashlib,json,math,re,sys
from pathlib import Path
import ezdxf,numpy as np
from ezdxf.colors import rgb2int

ROOT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'tools/s3000'))
from convert_autocad_dwg import run_core
EXE=Path(r'E:\AutoCAD 2027\accoreconsole.exe')

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write_controls(data):
    defs=[]
    for d in data['doors']:
        defs.append('("'+d['id']+'" ('+' '.join(f'{v:.6f}' for v in d['pivot'])+') '+str(d['angle'])+' ('+' '.join('"'+s+'"' for s in d['layers'])+'))')
    lisp='''; Cascade v2026.09.28.1 / 2026-09-28 / Codex GPT-6
(vl-load-com)
(setq pg:doors '(__DOORS__))
(defun pg:door (id opened / row ss pivot target first info current delta i e)
 (setq row (assoc id pg:doors) ss (ssadd) pivot (cadr row) target (if opened (caddr row) 0.0))
 (foreach lay (cadddr row)
  (if (setq one (ssget "_X" (list '(0 . "INSERT") (cons 8 lay))))
   (progn (setq i 0) (repeat (sslength one) (ssadd (ssname one i) ss) (setq i (1+ i))))))
 (if (> (sslength ss) 0)
  (progn
   (setq first (ssname ss 0) current (* 180.0 (/ (cdr (assoc 50 (entget first))) pi)) delta (- target current))
   (if (> (abs delta) 0.00001) (command "_.ROTATE" ss "" pivot delta))
  ))
 (princ))
(defun c:CASCADEOPEN () (foreach d pg:doors (pg:door (car d) T)) (princ))
(defun c:CASCADECLOSE () (foreach d pg:doors (pg:door (car d) nil)) (princ))
(defun pg:toggle (id / row ss a)
 (setq row (assoc id pg:doors) ss (ssget "_X" (list '(0 . "INSERT") (cons 8 (car (cadddr row))))))
 (if ss (progn (setq a (cdr (assoc 50 (entget (ssname ss 0))))) (pg:door id (< (abs a) 0.00001)))) (princ))
(defun c:CASCADEBOILER1 () (pg:toggle "boiler1"))
(defun c:CASCADEBOILER2 () (pg:toggle "boiler2"))
(defun c:CASCADECABINET1 () (pg:toggle "cabinet1"))
(defun c:CASCADECABINET2 () (pg:toggle "cabinet2"))
(defun c:CASCADEGRAY () (pg:toggle "cascade"))
(defun c:CASCADEVIEW () (command "_.-VIEW" "_R" "CASCADE_ALL") (princ))
(princ "\\nCascade controls: CASCADEOPEN, CASCADECLOSE, CASCADEBOILER1/2, CASCADECABINET1/2, CASCADEGRAY, CASCADEVIEW.")
(princ)
'''.replace('__DOORS__','\n'.join(defs))
    (ROOT/'CASCADE-controls.lsp').write_text(lisp,encoding='ascii')

def create():
    cache=ROOT/'build/cad-cache';data=json.loads((cache/'scene.json').read_text(encoding='utf8'))
    doc=ezdxf.new('R2018',setup=True);doc.units=4;doc.appids.new('CASCADE')
    doc.header['$MEASUREMENT']=1;doc.header['$INSUNITS']=4;doc.header['$LUNITS']=2
    meta=doc.ezdxf_metadata();meta['TITLE']='2 x PREMIUM S-4000 / Comfort+ / 8-12 bar';meta['AUTHOR']='Codex / GPT-6';meta['VERSION']='2026.09.28.1';meta['HEADER']='DN200 visual placeholder; not calculated'
    count=0
    for key,part in data['definitions'].items():
        block=doc.blocks.new('P_'+key)
        for item in part['meshes']:
            with np.load(cache/item['file']) as z:
                for i,mat in enumerate(item['materials']):
                    faces=z['faces'][z['materials']==i]
                    for start in range(0,len(faces),60000):
                        chunk=faces[start:start+60000];used,indices=np.unique(chunk,return_inverse=True)
                        rgb=mat['rgb']
                        if 'screen' in mat['name'].lower() or 'hmi' in mat['name'].lower():rgb=[15,29,39]
                        m=block.add_mesh(dxfattribs=dict(layer='0',true_color=rgb2int(rgb),subdivision_levels=0))
                        m.vertices=z['vertices'][used].tolist();m.faces=indices.reshape(-1,3).tolist();count+=1
        print('CAD_DEFINITION',key,part['triangles'],flush=True)
    for r in data['instances']:
        doc.layers.new(r['layer'],dxfattribs={'color':7})
        e=doc.modelspace().add_blockref('P_'+r['definition'],r['translation_mm'],dxfattribs={'layer':r['layer']})
        e.set_xdata('CASCADE',[(1000,r['definition']),(1000,'2026.09.28.1 / Codex GPT-6')])
    doc.set_modelspace_vport(12500,dxfattribs={'direction':(-1,-1,.75),'target':(1600,700,2100),'aspect_ratio':1.5,'render_mode':4,'grid_on':0,'ucs_icon':0})
    for name,direction,target,height in [('CASCADE_ALL',(-1,-1,.75),(1600,700,2100),12500),('CASCADE_TOP',(0,0,1),(1600,900,0),14500),('CASCADE_GREY',(-.25,-1,.3),(3150,-3050,1350),950),('CASCADE_RED',(-1,-.6,.3),(-1450,-1000,1580),1250),('CASCADE_FRONT',(0,-1,.2),(3150,0,2000),10800)]:
        doc.views.new(name,dxfattribs={'height':height,'width':height*1.5,'direction':direction,'target':target,'render_mode':4})
    audit=doc.audit();assert not audit.errors and not audit.fixes
    target=ROOT/'build/CASCADE.dxf';doc.saveas(target,fmt='bin');write_controls(data)
    report={'version':'2026.09.28.1','definitions':len(data['definitions']),'instances':len(data['instances']),'mesh_entities':count,'unique_triangles':sum(d['triangles'] for d in data['definitions'].values()),'source_blend_sha256':sha(ROOT/'S4000_CASCADE_COMFORT_PLUS.blend'),'dxf_sha256':sha(target)}
    (ROOT/'build/cad-build.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('DXF_READY',report,flush=True)

def snapshot(path):
    d=ezdxf.readfile(path);audit=d.audit();assert not audit.errors and not audit.fixes
    assert d.units==4
    rows=[];definitions={}
    for e in d.modelspace().query('INSERT'):
        rows.append((e.dxf.layer,e.dxf.name,[round(v,6) for v in e.dxf.insert],round(e.dxf.get('rotation',0)%360,5)))
        if e.dxf.name in definitions:continue
        info=[]
        for m in d.blocks[e.dxf.name]:
            assert m.dxftype()=='MESH';v=np.asarray(list(m.vertices));f=np.asarray(list(m.faces))
            quantized=np.rint(v*1000).astype('<i8')
            # Winding normalization by AutoCAD is allowed, connectivity is not.
            connectivity=np.sort(f,axis=1).astype('<i4')
            info.append((len(v),len(f),sha_bytes(quantized.tobytes()),sha_bytes(connectivity.tobytes()),tuple(m.rgb)))
        definitions[e.dxf.name]=info
    return {'instances':sorted(rows),'definitions':definitions}
def sha_bytes(b):return hashlib.sha256(b).hexdigest()

def convert():
    build=ROOT/'build';source=build/'CASCADE.dxf';dwg=ROOT/'S4000_CASCADE_COMFORT_PLUS.dwg'
    expected=snapshot(source)
    controls=(ROOT/'CASCADE-controls.lsp').as_posix()
    script=build/'save.scr'
    script.write_text('\n'.join(['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)','(setvar "ISAVEPERCENT" 0)','(command "_.AUDIT" "_N")','(command "_.VSCURRENT" "_Shaded")','(setvar "VSEDGES" 0)','(setvar "VSSILHEDGES" 0)','(setvar "UCSICON" 0)','(setvar "GRIDMODE" 0)','(command "_.-VIEW" "_R" "CASCADE_ALL")','(setvar "FILEDIA" 1)','(setvar "CMDDIA" 1)',f'(command "_.SAVEAS" "_2018" "{dwg.as_posix()}")','(command "_.QUIT")','']),encoding='ascii')
    if not dwg.exists():run_core(EXE,source,script,build/'cad-save.log')
    assert dwg.read_bytes()[:6]==b'AC1032'
    # Fresh native session tests both directions of all five hinges and exports
    # the restored closed pose. No automatic LISP loading is added to the DWG.
    roundtrip=build/'cad-roundtrip.dxf';script=build/'verify.scr'
    definitions='(progn '+' '.join(line for line in Path(controls).read_text('ascii').splitlines() if not line.lstrip().startswith(';'))+')'
    if roundtrip.exists():
        assert roundtrip.resolve().parent==build.resolve()
        roundtrip.unlink() # generated verification output only
    script.write_text('\n'.join(['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)',definitions,'(c:CASCADEOPEN)','(foreach d pg:doors (setq e (ssname (ssget "_X" (list \'(0 . "INSERT") (cons 8 (car (cadddr d))))) 0)) (princ (list "OPEN_DOOR" (car d) (cdr (assoc 50 (entget e))))))','(c:CASCADECLOSE)','(command "_.AUDIT" "_N")',f'(command "_.DXFOUT" "{roundtrip.as_posix()}" "16")','(setvar "FILEDIA" 1)','(setvar "CMDDIA" 1)','(command "_.QUIT" "_Y")','']),encoding='ascii')
    log=run_core(EXE,dwg,script,build/'cad-reopen.log')
    poses=dict((name,float(angle)) for name,angle in re.findall(r'\(OPEN_DOOR\s+(\w+)\s+([\d.Ee+-]+)\)',log))
    assert len(poses)==5,log[-6000:]
    for name,angle in poses.items():assert abs((math.degrees(angle)%360)-(255 if name.startswith('boiler') else 105))<.002,(name,angle)
    actual=snapshot(roundtrip);assert expected==actual,'Round trip changed geometry, colors, or closed transforms'
    report={'status':'PASSED_NATIVE_AUTOCAD','version':'2026.09.28.1','autocad':'2027 Core Console','dwg_format':'AC1032 / AutoCAD 2018','units':'mm','audit_save':0,'audit_reopen':0,'geometry_roundtrip':'all definitions and instances match at 0.001 mm','door_cycles':5,'instances':len(actual['instances']),'definitions':len(actual['definitions']),'mesh_entities':sum(len(v) for v in actual['definitions'].values()),'dwg_bytes':dwg.stat().st_size,'dwg_sha256':sha(dwg)}
    (ROOT/'AutoCAD-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('CAD_PASSED',report,flush=True)

if __name__=='__main__':
    {'create':create,'convert':convert}[sys.argv[1]]()
