"""Register supplied STEP interfaces in millimetres; rigid placement only.

2026-09-13, Codex / GPT-6. Semantic positions follow the approved S assembly;
actual centres, axes and circular faces are read from each supplied STEP.
"""
import json, math
from pathlib import Path
ROOT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.2')
POWERS=[500,1000,1500,2000,2500,3000,3500,4000,5000]
def read(key):return json.loads((ROOT/'analytic'/f'{key}.json').read_text('utf8'))
def rounded(v):return [round(x,7) for x in v]
def point(c,t):return rounded([c[0]*.001+t[0],-c[2]*.001+t[1],c[1]*.001+t[2]])
def feature(d,center,axis):
 rows=[c for c in d['circles'] if math.dist(c['center'],center)<.02 and abs(c['axis'][axis])>.999]
 assert rows,(d['id'],center)
 same=[c for c in d['circles'] if c['solid']==rows[0]['solid'] and abs(c['axis'][axis])>.999 and all(abs(c['center'][i]-center[i])<.02 for i in range(3) if i!=axis)]
 return dict(raw_mm=center,axis_raw=rows[0]['axis'],radii_mm=sorted(set(c['radius'] for c in rows)),flange_outer_radius_mm=max(c['radius'] for c in same),solid=rows[0]['solid'])
models=[]
for power in POWERS:
 d=read(f's{power}');cs=d['circles']
 native_axis=-round(d['bounds'][1],1)*.001
 eco_key=1500 if power==1500 else 2000 if power<=2500 else 3000 if power<=3500 else power
 eco_native_axis=-round(read(f'eqs{eco_key}')['bounds'][1],1)*.001 if power>=1500 else native_axis
 axis=max(native_axis,eco_native_axis)
 front=max(c['center'][2] for c in cs if abs(c['axis'][2])==1 and abs(c['center'][0])<.01 and c['center'][1]<-50 and c['center'][2]>1200 and c['radius']>=100)
 t=[0,1.3+(front-3337)*.001,axis]
 top=[]
 for s in d['solids']:
  b=s['bounds']
  if b[1]<600 or b[3]-b[0]>300 or abs((b[0]+b[3])/2)>100:continue
  top.append((round((b[0]+b[3])/2,4),round((b[2]+b[5])/2,4),s['id']))
 top.sort(key=lambda r:r[1]);assert len(top)==7,(power,top)
 level_y=max(c['center'][1] for c in cs if c['solid']==top[0][2] and c['radius']>=29 and abs(c['axis'][1])>.999)
 if power<=1000:order=['safety_1','safety_2','feed','inspection','steam','level_single','level_dual']
 else:order=['feed','safety_2','safety_1','inspection','steam','level_single','level_dual']
 ports={}
 for name,(x,z,solid) in zip(order,top):
  f=feature(d,[x,level_y,z],1);f.update(position_m=point(f['raw_mm'],t),normal=[0,0,1]);ports[name]=f
 # All four side level connections, the pressure takeoff and TDS flange.
 side=[]
 for s in d['solids']:
  b=s['bounds']
  if b[0]>700 and b[3]-b[0]<25 and b[4]-b[1]>90:
   c=[round(b[3],3),round((b[1]+b[4])/2,3),round((b[2]+b[5])/2,3)]
   f=feature(d,c,0);f.update(position_m=point(c,t),normal=[1,0,0]);side.append(f)
 assert len(side)==5,(power,side)
 tds=max(side,key=lambda f:f['raw_mm'][2]);ports['tds']=tds
 glasses=sorted([f for f in side if f is not tds],key=lambda f:(-f['raw_mm'][2],-f['raw_mm'][1]))
 for name,f in zip(['level_upper_1','level_lower_1','level_upper_2','level_lower_2'],glasses):ports[name]=f
 takeoff=[c for c in cs if c['radius']==29 and abs(c['axis'][1])>.999 and c['center'][0]>300]
 c=max(takeoff,key=lambda c:c['center'][1])['center'];f=feature(d,c,1);f.update(position_m=point(c,t),normal=[0,0,1]);ports['pressure']=f
 flues=[c for c in cs if abs(c['axis'][2])==1 and abs(c['center'][0])+abs(c['center'][1])<.01 and c['center'][2]<-400 and c['radius'] in [150,175,200,225,250]]
 c=min(flues,key=lambda c:c['center'][2])['center'];f=feature(d,c,2);f.update(position_m=point(c,t),normal=[0,1,0]);ports['flue']=f
 drain=[c for c in cs if abs(c['axis'][2])==1 and c['radius']==39 and c['center'][1]<-600]
 c=min(drain,key=lambda c:c['center'][2])['center'];f=feature(d,c,2);f.update(position_m=point(c,t),normal=[0,1,0]);ports['drain']=f
 burner=[c for c in cs if abs(c['axis'][2])==1 and abs(c['center'][0])<.01 and c['center'][2]==front and c['radius']>=100][0]
 f=feature(d,burner['center'],2);f.update(position_m=point(f['raw_mm'],t),normal=[0,-1,0]);ports['burner']=f
 # The largest long coaxial cylinder is the cladding; rings/door remain dark.
 shell=max(c['radius'] for c in d['cylinders'] if abs(c['axis'][2])>.999 and abs(c['origin'][0])+abs(c['origin'][1])<.01 and c['bounds'][5]-c['bounds'][2]>1000)*.001
 model=dict(power=power,boiler_source=d['source'],boiler_sha256=d['sha256'],translation=t,axis=axis,boiler_floor_lift_m=round(axis-native_axis,6),shell=shell,ports=ports)
 if power>=1500:
  key=1500 if power==1500 else 2000 if power<=2500 else 3000 if power<=3500 else power
  e=read(f'eqs{key}');z=axis
  et=[-.448,ports['flue']['position_m'][1]+.5+.507,z]
  def eco(c):return rounded([-c[2]*.001+et[0],-c[0]*.001+et[1],c[1]*.001+et[2]])
  ep={}
  for name,c in [('flue_in',[507,0,-448]),('flue_out',[-507,0,-448])]:
   f=feature(e,c,0);f.update(position_m=eco(c),normal=[0,-1 if name=='flue_in' else 1,0]);ep[name]=f
  water=sorted([c for c in e['circles'] if c['radius']==61 and abs(c['center'][0]+507)<.01],key=lambda c:c['center'][1])
  assert len(water)==2
  for name,c in zip(['water_in','water_out'],water):
   f=feature(e,c['center'],0);f.update(position_m=eco(c['center']),normal=[0,1,0],dn=65);ep[name]=f
  assert ports['flue']['radii_mm']==ep['flue_in']['radii_mm']
  model['economizer']=dict(model=key,source=e['source'],sha256=e['sha256'],translation=et,ports=ep,spacer_length_mm=500,axis_offset_mm=0,source_axis_offset_mm=round((eco_native_axis-native_axis)*1000,3),floor_lift_m=round(axis-eco_native_axis,6))
 models.append(model)
(ROOT/'registration.json').write_text(json.dumps(dict(version='2026.09.13.2',date='2026-09-13',executor='Codex / GPT-6',models=models),ensure_ascii=False,indent=2),encoding='utf8')
for m in models:print(m['power'],m['translation'],'flue',m['ports']['flue']['radii_mm'],'eco',m.get('economizer',{}).get('axis_offset_mm'))
