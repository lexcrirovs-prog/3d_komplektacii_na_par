"""Find front-door assemblies and paired vertical hinge pins in source metadata.

19.10.2026, Codex / GPT-6. Runs after conversion, before GLB compression.
Does not alter CAD or mesh geometry. Ambiguous cases remain without animation.
"""
import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def inspect(asset, metadata):
    blob = Path(asset).read_bytes()
    if hashlib.sha256(blob).hexdigest() != metadata.get('outputSha256'):
        raise ValueError('GLB does not match conversion metadata; regenerate matching raw files before building doors')
    size, kind = struct.unpack_from('<II', blob, 12)
    if kind != 0x4e4f534a:
        raise ValueError('First GLB chunk is not JSON')
    gltf = json.loads(blob[20:20+size])
    if ('EXT_meshopt_compression' in gltf.get('extensionsUsed', []) or
        'EXT_meshopt_compression' in gltf.get('extensionsRequired', []) or
        any('EXT_meshopt_compression' in view.get('extensions', {})
            for view in gltf.get('bufferViews', []))):
        raise ValueError('Door metadata requires the uncompressed GLB with its matching '
                         'conversion metadata; run build_doors before meshopt compression')
    nodes = gltf['nodes']
    parents = {child: index for index, node in enumerate(nodes) for child in node.get('children', [])}
    def ancestors(index):
        while index in parents:
            index = parents[index]
            yield index
    def is_door(index):
        return bool(re.search(r'фронтовая\s+дверь', nodes[index].get('name', ''), re.I))
    doors = [index for index in range(len(nodes)) if is_door(index)
             and not any(is_door(parent) for parent in ancestors(index))]
    if len(doors) not in (1,2):
        return [], dict(reason='Expected one full front door or two leaves', candidates=doors)
    pin_groups = []
    for part in metadata['parts']:
        # Some CLA assemblies keep the drawing code, but omit the Russian name.
        # PR.04.01.006 «Ось», tabular drawing dated 06.10.2025, confirms
        # the -01/-02/-03 shaft family. Still require paired vertical solids.
        named_shaft = re.search(r'\bОсь\b', part['name'], re.I)
        documented_cla_shaft = re.match(r'^PR\.04\.01\.006(?:-\d+)?(?=[:\s]|$)', part['name'], re.I)
        if not (named_shaft or documented_cla_shaft):
            continue
        b = part['bounds']
        extents = [b[i+3]-b[i] for i in range(3)]
        if extents[1] < 2 * max(extents[0], extents[2]):
            continue
        centre = [(b[i]+b[i+3])/2 for i in range(3)]
        group = next((g for g in pin_groups if math.hypot(centre[0]-g[0]['centre'][0],
                                                        centre[2]-g[0]['centre'][2]) < 0.002), None)
        item = dict(node=part['node'], name=part['name'], centre=centre,
                    identification='source-name' if named_shaft else 'CLA drawing PR.04.01.006')
        if group is None:
            pin_groups.append([item])
        else:
            group.append(item)
    pin_groups = [g for g in pin_groups if len(g) >= 2]
    if len(pin_groups) != 2:
        return [], dict(reason='Expected two pairs of named vertical hinge pins', pinGroups=pin_groups)
    pivots = sorted(([sum(p['centre'][i] for p in g)/len(g) for i in range(3)]
                     for g in pin_groups), key=lambda p:p[0])
    result, evidence = [], []
    for index in doors:
        members = [p for p in metadata['parts'] if p['node'] == index or index in ancestors(p['node'])]
        if not members:
            return [], dict(reason='Door has no inventoried surfaces', node=index)
        box = ([min(p['bounds'][i] for p in members) for i in range(3)] +
               [max(p['bounds'][i+3] for p in members) for i in range(3)])
        centre = [(box[i]+box[i+3])/2 for i in range(3)]
        outward_z = 1 if centre[2] >= (metadata['bounds'][2]+metadata['bounds'][5])/2 else -1
        side = 0 if len(doors) == 1 or centre[0] < (pivots[0][0]+pivots[1][0])/2 else 1
        pivot = pivots[side]
        label = nodes[index].get('extras', {}).get('occurrenceLabel')
        if not label:
            return [], dict(reason='Door occurrence label missing', node=index)
        result.append(dict(node='occurrence:'+label, pivot=[round(v,7) for v in pivot],
                           axis=[0,1,0], angle=math.radians((-100 if side==0 else 100)*outward_z),
                           label='Фронтовая дверь' if len(doors)==1 else ('Левая створка' if side==0 else 'Правая створка')))
        evidence.append(dict(nodeIndex=index, sourceName=nodes[index]['name'], occurrenceLabel=label,
                             descendantParts=len(members), bounds=box, chosenPinGroup=side))
    return result, dict(doors=evidence, pinGroups=pin_groups, note='Pivots from paired named shaft bounding-box centres; browser visual QA required')


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=root/'src/assets/hotwater')
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--write', action='store_true', help='Write only unambiguous door rows to catalog.json')
    args=parser.parse_args()
    path=args.assets/'catalog.json'; catalog=read_json(path)
    audits=[]
    for model in catalog['models']:
        metadata=read_json(args.metadata/(model['id']+'.metadata.json'))
        doors, audit=inspect(args.assets/model['asset'], metadata)
        audits.append(dict(id=model['id'], animation=doors, evidence=audit))
        if args.write:
            if doors: model['doors']=doors
            else: model.pop('doors',None)
        print(model['id'], len(doors), audit.get('reason','OK'), flush=True)
    (args.metadata/'door-audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.write:
        path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__': main()
