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
    assert abs(joint['rotation_degrees'] - 90) < 1e-6
    assert math.dist(joint['boiler_port'], joint['economizer_port']) < 1e-5
    assert sum(a*b for a,b in zip(joint['boiler_normal'], joint['economizer_normal'])) < -0.99999
    assert joint['boiler_bore_m'] == joint['economizer_bore_m'] == 0.45
    assert joint['boiler_outside_m'] == joint['economizer_outside_m'] == 0.456
    assert assembly['engineering_acceptance'] == 'NOT_VERIFIED'
    content = (root / 's3000-assembly.glb').read_bytes()
    magic,version,size = struct.unpack_from('<4sII', content)
    assert magic == b'glTF' and version == 2 and size == len(content)
    length,kind = struct.unpack_from('<II', content, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(content[20:20+length])
    names = {n.get('name') for n in gltf['nodes']}
    assert {'boiler', 'economizer', 'burner'} <= names
    for nodes in assembly['bom_nodes'].values():
        assert set(nodes) <= names, set(nodes)-names
    assert len(content) < 18_000_000, 'Web model exceeds 18 MB budget'
    assert gltf.get('materials') and len(gltf['materials']) > 5
    print(json.dumps(dict(status='PASSED_LOCAL_ASSEMBLY', bom_rows=len(quantities),
                         components=sum(quantities.values()), joint_error_m=math.dist(joint['boiler_port'],joint['economizer_port']),
                         glb_bytes=len(content), materials=len(gltf['materials'])), indent=2))

if __name__ == '__main__':
    verify(Path(sys.argv[1]))
