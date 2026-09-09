"""Acceptance checks derived from the selected workbook and source CAD ports."""
import json
import math
from pathlib import Path
import struct
import sys

def verify(root):
    bom = json.loads((root / 'bom.json').read_text(encoding='utf-8'))
    assembly = json.loads((root / 'assembly.json').read_text(encoding='utf-8'))
    assert bom['supplier'] == 'АДЛ' and bom['operating_pressure_bar'] == 8
    quantities = {x['id']: x['quantity'] for x in bom['items']}
    assert len(quantities) == 27
    assert quantities['pressure_switches'] == 3
    assert quantities['safety_pair'] == quantities['sight_glasses'] == quantities['feed_pumps'] == 2
    assert bom['pump_model'] == 'Jetex V4-10'
    assert bom['safety_valve_setting_bar'] == 9
    assert not any(x['source_range'] in ('J12:K12', 'J33:K33') for x in bom['items'])
    assert 'price' not in json.dumps(bom).lower()
    assert assembly['units'] == 'm'
    assert set(assembly['bom_nodes']) == set(quantities)
    for key, nodes in assembly['bom_nodes'].items():
        assert len(nodes) == quantities[key], (key, 'quantity mismatch')
    joint = assembly['economizer_joint']
    assert abs(joint['rotation_degrees'] - 270) < 1e-6
    assert joint['additional_rotation_degrees'] == 180
    spacer = joint['spacer']
    assert spacer['length_mm'] == 500 and spacer['bore_mm'] == 450
    assert spacer['visibility_owner'] == 'economizer'
    assert math.dist(spacer['start'], joint['boiler_port']) < 1e-5
    assert math.dist(spacer['end'], joint['economizer_port']) < 1e-5
    assert abs(math.dist(spacer['start'], spacer['end']) - .500) < 1e-6
    assert sum(a*b for a,b in zip(joint['boiler_normal'], joint['economizer_normal'])) < -0.99999
    assert joint['boiler_bore_m'] == joint['economizer_bore_m'] == 0.45
    assert joint['boiler_outside_m'] == joint['economizer_outside_m'] == 0.456
    assert assembly['engineering_acceptance'] == 'NOT_VERIFIED'
    assert assembly['version']=='2026.09.09.5'
    parts={p['id']:p for p in assembly['parts']}
    assert parts['pressure_header']['bounds_blender'][0][0]>.85, 'Header must be on the sight-glass side'
    assert parts['pressure_header']['bounds_blender'][0][1]<-.68
    assert assembly['sensor_mounts']['lp200']==[0,-.8925,2.1185]
    assert assembly['sensor_mounts']['lp400']==[0,-.485,2.1185]
    assert parts['burner']['source_kind']=='user_cad'
    assert parts['deaerator']['source_kind']=='drawing_photo'
    assert assembly['deaerator']['capacity_t_h']==25
    feed=assembly['feed_routing']
    assert feed['boiler_port']==[0,.565,2.085], 'Use the TOP feed nozzle, not the side instrument tap'
    assert feed['economizer_lower']==[-.525,3.202,.700]
    assert feed['economizer_upper']==[-.525,3.202,1.420]
    assert feed['economizer_water_normals']==[0,1,0], 'Water ports face away from boiler'
    endpoints={
        'feed_to_economizer':(feed['pump_header'],feed['economizer_lower']),
        'feed_from_economizer':(feed['economizer_upper'],feed['boiler_stack']),
        'feed_direct':(feed['pump_header'],feed['boiler_stack']),
    }
    for key,(start,end) in endpoints.items():
        path=feed['paths'][key]
        assert path[0]==start and path[-1]==end, (key,'Disconnected water route')
    assert all(parts[key]['requires']==['economizer'] for key in feed['with_economizer'])
    assert parts['feed_direct']['excludes']==['economizer']
    wiring=assembly['cable_routing']
    assert wiring['cabinet_inputs']==9
    assert {c['id'] for c in wiring['cables']}=={'lp200','lp400','pressure_switches_1','pressure_switches_2','pressure_switches_3','cp930','bcv925','feed_pumps_1','feed_pumps_2'}
    for cable in wiring['cables']:
        x,y,z=cable['end']
        assert -1.22<x<-.92 and -.895<y<-.365 and 1.139<z<1.2, (cable['id'],'Cable must enter cabinet')
        for p in cable['shell_samples']:
            clearance=math.hypot(p[0],p[2]-1.06)-.919
            assert .009<clearance<.025, (cable['id'],'Cable must follow shell')
    assert len(wiring['cladding_clamps'])>=15
    for clamp in wiring['cladding_clamps']:
        p=clamp['surface']
        assert abs(math.hypot(p[0],p[2]-1.06)-.919)<1e-6, 'Clamp foot must meet shell'
    gauge=assembly['deaerator_gauge'];cfg=assembly['deaerator']
    assert abs(gauge['gauge_x_m'])<.5, 'Gauge moved inboard'
    assert len(gauge['connections'])==2
    for conn in gauge['connections']:
        x,y,z=conn['pipe_start']
        radius=cfg['tank_bare_radius_m']+cfg['jacket_thickness_visual_m']
        implicit=(x*x+(z-cfg['tank_center_height_m'])**2)/radius**2+((y+cfg['tank_straight_half_length_m'])/cfg['tank_dome_depth_visual_m'])**2
        assert implicit<1, 'Gauge tap must penetrate tank head'
        assert .05<conn['escutcheon_diameter_m']<.20
    content = (root / 's3000-assembly.glb').read_bytes()
    magic,version,size = struct.unpack_from('<4sII', content)
    assert magic == b'glTF' and version == 2 and size == len(content)
    length,kind = struct.unpack_from('<II', content, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(content[20:20+length])
    names = {n.get('name') for n in gltf['nodes']}
    assert {'boiler', 'economizer', 'burner'} <= names
    assert set(parts)<=names, 'Export every optional route for the configurator'
    for nodes in assembly['bom_nodes'].values():
        assert set(nodes) <= names, set(nodes)-names
    assert len(content) < 35_000_000, 'Detailed web model exceeds 35 MB budget'
    assert gltf.get('materials') and len(gltf['materials']) > 5
    assert len(gltf.get('images',[]))>=2, 'Original logo and galvanized metal map must be embedded'
    logo=next(m for m in gltf['materials'] if m['name']=='Original PREMIUM PNG decal')
    assert logo.get('alphaMode')=='MASK' and 'baseColorTexture' in logo['pbrMetallicRoughness']
    print(json.dumps(dict(status='PASSED_LOCAL_ASSEMBLY', bom_rows=len(quantities),
                         components=sum(quantities.values()), joint_error_m=math.dist(spacer['end'],joint['economizer_port']),
                         spacer_length_mm=spacer['length_mm'],
                         glb_bytes=len(content), materials=len(gltf['materials']),
                         water_route_variants=2, cabinet_inputs=wiring['cabinet_inputs'],
                         da_gauge_connected_taps=len(gauge['connections'])), indent=2))

if __name__ == '__main__':
    verify(Path(sys.argv[1]))
