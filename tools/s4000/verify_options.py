"""Exercise actual option rules in all combinations and check routed endpoints."""
import argparse,itertools,json
from pathlib import Path
import numpy as np

def visible(part,options):return all(options[k]==v for k,v in part['when'].items())

def verify(path):
 m=json.loads(path.read_text(encoding='utf8'));parts={p['id']:p for p in m['parts']};checks=[]
 assert m['operating_pressure_bar']==12 and m['display_pressure']=='8–12 бар'
 assert np.allclose(m['ports']['boiler_feed']['position_m'],[0,1.26,2.235])
 assert m['ports']['boiler_feed']['dn']==32
 for p in parts.values():
  if 'source_transform_mm_to_m' in p:
   t=p['source_transform_mm_to_m'];r=np.array(t['basis']);assert np.allclose(r.T@r,np.eye(3)) and np.isclose(np.linalg.det(r),1)
   assert t['scale']==.001
 assert np.allclose(parts['flue_spacer']['bounds_blender'][0][1],1.978,atol=.004)
 assert np.allclose(parts['flue_spacer']['bounds_blender'][1][1],2.478,atol=.004)
 assert np.allclose(parts['feed_check']['flow_direction'],[0,0,-1])
 endpoints=m['ports'];max_gap=0
 for edge in m['flow_edges']:
  for end,point in [('start',edge['polyline_m'][0]),('end',edge['polyline_m'][-1])]:
   if edge[end] in endpoints:
    gap=np.linalg.norm(np.array(point)-endpoints[edge[end]]['position_m']);max_gap=max(max_gap,float(gap))
    assert gap<1e-6,(edge['part'],edge[end],gap)
 for values in itertools.product([False,True],repeat=6):
  opts=dict(zip(['economizer','deaerator','modulation','gpz','bdv','fv'],values));ids={k for k,p in parts.items() if visible(p,opts)}
  for required in ['boiler','pump_1','pump_2','suction_common','pump_delivery','feed_valve','feed_check','steam_manual','burner']:assert required in ids
  assert ('deaerator' in ids)==opts['deaerator'] and ('deaerator_feed' in ids)==opts['deaerator']
  assert ('economizer' in ids)==opts['economizer'] and ('flue_spacer' in ids)==opts['economizer']
  selected='eco' if opts['economizer'] else 'direct';other='direct' if opts['economizer'] else 'eco'
  assert (('mod_'+selected) in ids)==opts['modulation']
  assert (('mod_'+selected+'_bypass') in ids)!=opts['modulation']
  assert not any(k in ids for k in ['mod_'+other,'mod_'+other+'_drive','mod_'+other+'_bypass'])
  assert ('gpz' in ids)==opts['gpz'] and ('gpz_drive' in ids)==opts['gpz'] and ('gpz_bypass' in ids)!=opts['gpz']
  assert ('separator_bdv60_5' in ids)==opts['bdv'] and ('separator_fv8' in ids)==opts['fv']
  edges=[e for e in m['flow_edges'] if e['part'] in ids];graph={}
  for e in edges:graph.setdefault(e['start'],[]).append(e['end'])
  # The selectable feed train must have exactly one directed path from the
  # pump discharge to the fixed rear boiler inlet train, with no branch stubs.
  node='pump_delivery';walk=[node]
  while node!='boiler_feed_train':
   nxt=graph.get(node,[]);assert len(nxt)==1,(opts,node,nxt)
   node=nxt[0];assert node not in walk,(opts,walk);walk.append(node)
   if node=='economizer_in':
    assert opts['economizer'];node='economizer_out';walk.append(node)
  assert ('economizer_in' in walk)==opts['economizer']
  assert ('from_economizer' in ids)==opts['economizer'] and ('direct_inlet' in ids)!=opts['economizer']
  row=dict(options=opts,visible_parts=len(ids),feed_path=walk)
  if 'blowdown_revision' in m:
   from verify_blowdown import verify_blowdown
   row['blowdown']=verify_blowdown(m,ids,opts)
  checks.append(row)
 result=dict(status='PASSED_64_CONFIGURATION_GRAPHS',configurations=len(checks),maximum_endpoint_gap_m=max_gap,
             cad_rotations_rigid=True,boiler_feed='native rear DN32',flue_spacer_mm=500,checks=checks)
 if 'blowdown_revision' in m:
  result['blowdown']=dict(configurations_checked=64,periodic_to_bdv=True,continuous_to_fv=True,
    alternate_routes_checked=True,missing_devices_not_bypassed=True,
    condensate_sections_fall=not m['blowdown_revision'].get('trap_installed',False),
    condensate_trap_installed=m['blowdown_revision'].get('trap_installed',False),
    pressure_driven_lift_m=m['blowdown_revision'].get('condensate_riser_m',0),
    da_steam_connected=m['blowdown_revision']['da_steam_connected'])
 print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 a.output.write_text(json.dumps(verify(a.manifest),ensure_ascii=False,indent=2),encoding='utf8')
