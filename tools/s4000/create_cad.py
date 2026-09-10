"""Native MESH blocks, isolated option layers, persistent AutoLISP controls."""
import argparse,hashlib,json
from pathlib import Path
import ezdxf
from ezdxf.colors import rgb2int
import numpy as np

OPTIONS=['economizer','deaerator','modulation','gpz','bdv','fv']

def add_meshes(block,layer,vertices,faces,color,name):
 count=0
 for start in range(0,len(faces),60000):
  chunk=faces[start:start+60000];used,remap=np.unique(chunk,return_inverse=True)
  mesh=block.add_mesh(dxfattribs=dict(layer=layer,true_color=rgb2int(color),subdivision_levels=0))
  mesh.vertices=vertices[used].tolist();mesh.faces=remap.reshape((-1,3)).tolist()
  mesh.set_xdata('S4000',[(1000,name[:240])]);count+=1
 return count

def controls(manifest,destination):
 rules='\n'.join('  ("S4000_'+p['id']+'" '+ ' '.join('("'+k+'" . '+str(int(v))+')' for k,v in p['when'].items())+')' for p in manifest['parts'])
 default='('+' '.join('("'+k+'" . '+str(int(manifest['default_options'][k]))+')' for k in OPTIONS)+')'
 template=Path(__file__).with_name('options-template.lsp').read_text(encoding='ascii')
 template=template.replace('2026.09.10.1',manifest['version'])
 options=template.replace('__RULES__',rules).replace('__DEFAULT__',default)
 if 'pressure_revision' in manifest:
  options+='\n(defun c:S4000PRESSUREVIEW () (command "_.-VIEW" "_R" "S4000_PRESSURE") (princ))\n'
 destination.joinpath('S4000-options.lsp').write_text(options,encoding='ascii')
 import shutil
 shutil.copy2(Path(__file__).with_name('S4000-options.dcl'),destination/'S4000-options.dcl')
 if 'door_groups' in manifest:
  groups=[]
  for g in manifest['door_groups']:
   pivot=' '.join(str(round(x*1000,6)) for x in g['pivot_m'])
   names=' '.join('"S4000_'+name+'"' for name in g['parts'])
   groups.append(' ("'+g['id']+'" ('+pivot+') '+str(g['open_degrees'])+' ('+names+'))')
  doors=Path(__file__).with_name('doors-template.lsp').read_text(encoding='ascii')
  doors=doors.replace('__VERSION__',manifest['version']).replace('__GROUPS__','(\n'+'\n'.join(groups)+'\n)')
  destination.joinpath('S4000-doors.lsp').write_text(doors,encoding='ascii')
  destination.joinpath('S4000-controls.lsp').write_text(options+'\n'+doors,encoding='ascii')
  shutil.copy2(Path(__file__).with_name('S4000-doors.dcl'),destination/'S4000-doors.dcl')

def create(cache,manifest_path,destination):
 source=json.loads((cache/'meshes.json').read_text(encoding='utf8'));manifest=json.loads(manifest_path.read_text(encoding='utf8'))
 destination.mkdir(parents=True,exist_ok=True);doc=ezdxf.new('R2018',setup=True);doc.units=4
 for key,value in {'$MEASUREMENT':1,'$LUNITS':2,'$LUPREC':2,'$INSBASE':(0,0,0),'$DISPSILH':0}.items():doc.header[key]=value
 doc.appids.new('S4000');meta=doc.ezdxf_metadata()
 meta['TITLE']=manifest['title'];meta['AUTHOR']=manifest['author'];meta['VERSION']=manifest['version'];meta['PRESSURE']='8-12 bar range; current BOM: 12 bar'
 report=dict(version=manifest['version'],date=manifest['date'],author=manifest['author'],units='mm',decimation=False,
  source_sha256=source['source_sha256'],source_name=source['source_name'],display_pressure='8-12 bar',selected_pressure_bar=12,parts=[])
 for part in source['parts']:
  key=part['id'];layer='S4000_'+key;dl=doc.layers.new(layer,dxfattribs={'color':7});dl.description=part['label']
  visible=all(manifest['default_options'][k]==v for k,v in part['when'].items())
  if not visible:dl.freeze()
  block=doc.blocks.new(layer);row=dict(id=key,layer=layer,when=part['when'],mesh_entities=0,triangles=0,bounds_mm=[[x*1000 for x in b] for b in part['bounds_blender']])
  for item in part['meshes']:
   with np.load(cache/item['file']) as data:
    for idx,mat in enumerate(item['materials']):
     fs=data['faces'][data['materials']==idx]
     if len(fs):
      row['mesh_entities']+=add_meshes(block,layer,data['vertices'],fs,mat['rgb'],mat['name'])
      row['triangles']+=len(fs)
  ob=doc.modelspace().add_blockref(layer,(0,0,0),dxfattribs={'layer':layer})
  ob.set_xdata('S4000',[(1000,key),(1000,part['label'][:240]),(1000,part['source_kind']),(1000,'v'+manifest['version'])])
  report['parts'].append(row);print('CAD_PART',key,row['triangles'],flush=True)
 doc.set_modelspace_vport(8000,dxfattribs={'direction':(1,-1,.8),'target':(-300,800,1700),'aspect_ratio':1.5,'render_mode':4,'grid_on':0,'ucs_icon':0,'default_lighting_on':1})
 for name,direction,target,height in [('S4000_ALL',(1,-1,.8),(-300,800,1700),8000),('S4000_REAR',(1,1,.8),(0,1700,1600),6000),
    ('S4000_PUMPS',(1,-1,.6),(1750,500,1600),3700),('S4000_DEAERATOR',(1,1,.6),(-3650,100,1400),4800),('S4000_TOP',(0,0,1),(0,800,1600),8000)]:
  doc.views.new(name,dxfattribs={'height':height,'width':height*1.5,'direction':direction,'target':target,'render_mode':4})
 if 'door_groups' in manifest:
  for name,direction,target,height in [
   ('S4000_DOOR',(1,-2.8,1.1),(-400,-1700,1250),3800),
   ('S4000_CABINET',(-1,-.55,.35),(-1450,-910,1580),1100)]:
   doc.views.new(name,dxfattribs={'height':height,'width':height*1.5,'direction':direction,'target':target,'render_mode':4})
  doc.views.get('S4000_DEAERATOR').dxf.direction=(-1,-1.1,.6)
  doc.views.get('S4000_DEAERATOR').dxf.target=(-3650,30,1650)
  doc.views.get('S4000_ALL').dxf.direction=(-1,-1,.72)
  doc.views.get('S4000_ALL').dxf.target=(-500,150,1700)
 if 'pressure_revision' in manifest:
  doc.views.new('S4000_PRESSURE',dxfattribs={'height':1900,'width':2850,
   'direction':(1,-.7,.45),'target':(1120,-980,2450),'render_mode':4})
 audit=doc.audit();assert not audit.errors and not audit.fixes,(audit.errors,audit.fixes)
 target=destination/('S4000_COMFORT_8-12bar_v'+manifest['version']+'.dxf');assert not target.exists(),target
 doc.saveas(target,fmt='bin');report.update(blocks=len(report['parts']),triangles=sum(x['triangles'] for x in report['parts']),
  meshes=sum(x['mesh_entities'] for x in report['parts']),audit_errors=0,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size)
 target.with_suffix('.cad.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');controls(manifest,destination)
 print('CAD_CREATED',target.name,report['bytes'],flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 a=p.parse_args();create(a.cache,a.manifest,a.output)
