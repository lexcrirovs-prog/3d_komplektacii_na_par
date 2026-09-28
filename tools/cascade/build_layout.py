"""Cascade display layout. DN200 header is an explicit visual placeholder."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'tools/s4000'))
from geometry import Geometry
sys.path.insert(0,str(Path(__file__).parent))
from build_cabinets import merge_meshes_per_material
from display_geometry import DisplayGeometry

SPACING=6.3
GREY=[3.15,-3.05,1.15]

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True);g=DisplayGeometry();rows=[]
    def route(key,label,points,r,requires=None,mat='steel'):
        g.part(key,label,'layout_visual',note='Компоновка для визуализации. Размеры коллектора уточняются проектом.')
        g.pipe(points,r,mat,.16,24,min(.004,r*.2))
        rows.append(dict(id=key,label=label,points=points,radius_m=r,requires=requires or []))
    route('cascade_header','Общий паровой коллектор DN200 (условно)',[[-.65,5.3,4.55],[7.1,5.3,4.55]],.1095)
    g.flange((7.1,5.3,4.55),(1,0,0),200,'steel',radius=.17,thickness=.026,bolts=12)
    g.cyl((-.67,5.3,4.55),(-.65,5.3,4.55),.112,'steel',48)
    for i,x in enumerate([0,SPACING]):
        route('cascade_steam_'+str(i+1),'Паропровод котла '+str(i+1)+' → общий коллектор',[[x,2.1,3.0],[x,4.55,3.0],[x,4.55,4.55],[x,5.3,4.55]],.057)
        for yy in [2.15,2.17]:g.flange((x,yy,3.0),(0,1,0),100,'steel')
    # One DA supplies both independent pump groups; outlet remains a boundary without DA.
    route('cascade_feed_header','Общий подвод к насосам двух котлов',[[-2.1,2.35,.45],[-1.90,2.35,.45],[-1.90,2.20,.45],[SPACING+1.65,2.20,.45]],.028,mat='green')
    for i,x in enumerate([0,SPACING]):
        route('cascade_suction_'+str(i+1),'Подвод к питательным насосам котла '+str(i+1),[[x+1.65,2.20,.45],[x+1.65,1.25,.45],[x+1.65,1.25,.235],[x+1.65,.2,.235]],.028,mat='green')
    route('cascade_bottom_2','Периодическая продувка котла 2 → общий BDV',[[9.2,3.1,.125],[9.2,5.8,.125],[4.55,5.8,.125],[4.55,2.4,.125],[2.9,2.4,.125]],.021)
    route('cascade_tds_2','Непрерывная продувка котла 2 → общий FV',[[7.86,2.95,.92],[7.86,4.95,.92],[3.1,4.95,.92],[3.1,3.65,.92]],.0135)
    g.part('cascade_supports','Опоры общего коллектора и каскадного шкафа','layout_visual')
    for x in [-.55,7.00]:
        g.box((x,5.3,2.2),(.10,.10,4.40),'zinc');g.box((x,5.3,.012),(.38,.38,.024),'zinc')
        g.box((x,5.3,4.406),(.30,.28,.015),'steel')
        for xx in [-.15,.15]:
            for yy in [-.15,.15]:g.cyl((x+xx,5.3+yy,0),(x+xx,5.3+yy,.039),.012,'steel',6)
    x,y,z=GREY
    for dx in [-.15,.15]:
        g.box((x+dx,y+.12,.73),(.038,.038,1.46),'zinc');g.box((x+dx,y+.06,.014),(.10,.43,.028),'zinc')
    for zz in [1.23,1.48]:g.box((x,y+.137,zz),(.40,.028,.035),'zinc')
    # Signal lines run on the lower frame/floor in black corrugated sleeves.
    for i,xx in enumerate([0,SPACING]):
        points=[[x+(-.10 if i==0 else .10),y+.080,z],[x+(-.10 if i==0 else .10),y+.080,.070+i*.026],
                [xx-1.18,y+.080,.070+i*.026],[xx-1.18,-1.00,.070+i*.026],[xx-1.18,-1.00,1.25]]
        route('cascade_signal_'+str(i+1),'Гофра связи каскадного шкафа с котлом '+str(i+1),points,.011,mat='black')
        for a,b in zip(points,points[1:]):
            a,b=Vector(a),Vector(b);length=(b-a).length
            for d in range(1,int(length/.035)):
                p=a+(b-a)*(.035*d/length);g.ring(p,b-a,.0115,.0013,'black',12)
    g.flush()
    for key in g.parts:merge_meshes_per_material(bpy.data.objects[key])
    bpy.context.view_layer.update()
    for row in rows:
        root=bpy.data.objects[row['id']];pts=[o.matrix_world@Vector(v) for o in root.children_recursive if o.type=='MESH' for v in o.bound_box]
        c=[(min(v[i] for v in pts)+max(v[i] for v in pts))/2 for i in range(3)];row['center']=[c[0],c[2],-c[1]]
    rows.append(dict(id='cascade_supports',label='Опоры коллектора и каскадного шкафа',requires=[],center=[3.15,2.2,-5.3]))
    common_ids=['deaerator','deaerator_details','deaerator_feed','deaerator_support','flash_to_da','flash_steam_common',
        'separator_bdv60_5','separator_fv8','fv_to_trap_gap','trap_gap_to_bdv','fv_bottom_drain_stub','trap_a31',
        'fv_safety','fv_safety_discharge','fv_identification','bdv_vent','bdv_water_drain','bdv_cooling_stub',
        'bdv_bottom_drain_stub','bdv_identification','bdv_cooling_marker','bottom_to_bdv','tds_to_fv','tds_without_fv']
    data=dict(version='2026.09.28.1',date='2026-09-28',executor='Codex / GPT-6',boiler_count=2,power=4000,
        spacing_m=SPACING,grey_origin=GREY,header_dn=200,branch_dn=100,header_status='VISUAL_DIAMETER_NOT_CALCULATED',
        shared_parts=common_ids,replaced_per_boiler=['suction_common'],parts=rows)
    out=REPO/'src/assets/cascade';out.mkdir(exist_ok=True,parents=True)
    (out/'layout.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out/'piping.glb'),export_format='GLB',use_selection=True,export_animations=False)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'build/layout.blend'))
    print('CASCADE_LAYOUT_READY',len(g.parts))
if __name__=='__main__':main()
