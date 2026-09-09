"""Create detailed, coloured CAD blocks from extracted S-3000 native geometry.

No mesh simplification. Each material uses indexed MESH entities rather than
millions of separate 3DFACE objects. Two mutually exclusive feed configurations
are exported. The texture-only logo becomes coloured CAD geometry so the DWG
does not require external raster references.
"""
import argparse
import hashlib
import json
from pathlib import Path

import ezdxf
from ezdxf.colors import rgb2int
import numpy as np
from PIL import Image

VERSION = '2026.09.09.4'
AUTHOR = 'Codex / GPT-6 Astra'
EXCLUSIONS = {'WITH_ECONOMIZER': {'feed_direct'},
              'DIRECT': {'economizer', 'feed_to_economizer', 'feed_from_economizer'}}
MAX_FACES = 60000


def add_meshes(block, layer, vertices, faces, color, material):
    count = 0
    for start in range(0, len(faces), MAX_FACES):
        chunk = faces[start:start + MAX_FACES]
        used, remap = np.unique(chunk, return_inverse=True)
        obj = block.add_mesh(dxfattribs={'layer': layer, 'true_color': rgb2int(color), 'subdivision_levels': 0})
        obj.vertices = vertices[used].tolist()
        obj.faces = remap.reshape((-1, chunk.shape[1])).tolist()
        obj.set_xdata('S3000', [(1000, material)])
        count += 1
    return count


def logo_meshes(image_path, root_matrix):
    """Map source PNG scanline colour runs to the same cylindrical decal surface.

    The source pixels are read unchanged. Three dominant ink colours preserve
    the black mark and two blue flame colours. Fully transparent pixels produce
    no geometry; antialiasing is represented at the source's original resolution.
    """
    pixels = np.asarray(Image.open(image_path).convert('RGBA'))
    height, width, _ = pixels.shape
    inks = np.array([[29, 29, 27], [53, 76, 155], [90, 163, 218]], dtype=np.int32)
    distances = ((pixels[:, :, None, :3].astype(np.int32) - inks[None, None, :, :]) ** 2).sum(axis=3)
    labels = distances.argmin(axis=2)
    labels[pixels[:, :, 3] < 102] = -1
    matrix = np.asarray(root_matrix)
    for side in (-1, 1):
        batches = {i: ([], []) for i in range(3)}
        for row in range(height):
            values = labels[row]
            breaks = np.r_[0, np.flatnonzero(values[1:] != values[:-1]) + 1, width]
            for a, b in zip(breaks[:-1], breaks[1:]):
                color = int(values[a])
                if color < 0:
                    continue
                vs, fs = batches[color]
                start = len(vs)
                for u, v in [(a / width, 1 - (row + 1) / height), (b / width, 1 - (row + 1) / height),
                             (b / width, 1 - row / height), (a / width, 1 - row / height)]:
                    z = .09 + (v - .5) * 1.23 * 607 / 1415
                    x = side * np.sqrt(.919 ** 2 - z ** 2)
                    y = -.63 + side * (u - .5) * 1.23
                    point = (matrix @ np.array([x, y, z, 1]))[:3] * 1000
                    vs.append(point)
                fs.append((start, start + 1, start + 2, start + 3))
        for color, (vs, fs) in batches.items():
            yield np.asarray(vs), np.asarray(fs), tuple(int(c) for c in inks[color])


def create(cache, logo, destination, variant):
    source = json.loads((cache / 'meshes.json').read_text(encoding='utf8'))
    destination.mkdir(parents=True, exist_ok=True)
    doc = ezdxf.new('R2018', setup=True)
    doc.units = 4
    doc.header['$MEASUREMENT'] = 1
    doc.header['$LUNITS'] = 2
    doc.header['$LUPREC'] = 2
    doc.header['$INSBASE'] = (0, 0, 0)
    doc.header['$DISPSILH'] = 0
    doc.appids.new('S3000')
    doc.ezdxf_metadata()['TITLE'] = 'PREMIUM S-3000 / ADL / 8 bar / ' + variant
    doc.ezdxf_metadata()['AUTHOR'] = AUTHOR
    doc.ezdxf_metadata()['CAD_VERSION'] = VERSION
    doc.ezdxf_metadata()['SOURCE_VERSION'] = source['source_version']
    model = doc.modelspace()
    report = dict(version=VERSION, date='2026-09-09', author=AUTHOR, source_version=source['source_version'],
                  source_sha256=source['source_sha256'], configuration=variant, units='mm', geometry='MESH in component blocks',
                  decimation=False, engineering_acceptance='NOT_VERIFIED', parts=[])
    for number, part in enumerate(source['parts'], 1):
        key = part['id']
        if key in EXCLUSIONS[variant]:
            continue
        layer = 'S3000_%02d_%s' % (number, key)
        dl = doc.layers.new(layer, dxfattribs={'color': 7})
        dl.description = part['label']
        block = doc.blocks.new('S3000_' + key)
        row = dict(id=key, label=part['label'], layer=layer, mesh_entities=0, source_triangles=0, exported_triangles=0,
                   bounds_mm=[[x * 1000 for x in corner] for corner in part['bounds_blender']])
        for item in part['meshes']:
            with np.load(cache / item['file']) as data:
                vs, fs, indices = data['vertices'], data['faces'], data['materials']
                row['source_triangles'] += len(fs)
                for index, material in enumerate(item['materials']):
                    selected = fs[indices == index]
                    if not len(selected):
                        continue
                    if material['texture']:
                        if key == 'boiler' and 'PNG decal' in material['name']:
                            continue
                        assert material['name'] == 'Galvanized zinc sheet', 'Unmapped texture material'
                        report['material_transfer'] = 'True colours; zinc spangle texture and PBR reflections use a uniform grey CAD surface. All seams/rivets remain geometry.'
                    row['mesh_entities'] += add_meshes(block, layer, vs, selected, material['rgb'], material['name'])
                    row['exported_triangles'] += len(selected)
        if key == 'boiler':
            for vs, fs, ink in logo_meshes(logo, part['root_world']):
                row['mesh_entities'] += add_meshes(block, layer, vs, fs, ink, 'PREMIUM original PNG -> CAD colour runs')
                row['exported_triangles'] += len(fs) * 2
            report['logo'] = dict(source_sha256=hashlib.sha256(logo.read_bytes()).hexdigest(),
                                  method='Source-resolution scanline runs, 3 ink colours, cylindrical mapping', external_images=False)
        inserted = model.add_blockref(block.name, (0, 0, 0), dxfattribs={'layer': layer})
        inserted.set_xdata('S3000', [(1000, key), (1000, part['label']), (1000, part['source_kind']),
                                    (1000, 'CAD ' + VERSION + '; source ' + source['source_version'])])
        report['parts'].append(row)
        print('CAD_BLOCK', variant, key, row['mesh_entities'], row['exported_triangles'], flush=True)
    bounds = np.asarray([p['bounds_mm'] for p in report['parts']])
    minimum, maximum = bounds[:, 0, :].min(axis=0), bounds[:, 1, :].max(axis=0)
    target = (minimum + maximum) / 2
    doc.set_modelspace_vport(11000, dxfattribs={'direction': (1, -1, .75), 'target': target,
        'aspect_ratio': 1.6, 'render_mode': 4, 'grid_on': 0, 'ucs_icon': 0, 'default_lighting_on': 1})
    for name, direction in [('01_ASSEMBLY_ISO', (1, -1, .75)), ('02_REAR_ISO', (1, 1, .7)),
                            ('03_FRONT', (0, -1, 0)), ('04_TOP', (0, 0, 1))]:
        doc.views.new(name, dxfattribs={'height': 10000, 'width': 16000, 'direction': direction,
                                      'target': target, 'render_mode': 4})
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
    path = destination / ('S3000_ADL_8bar_' + variant + '_v' + VERSION + '.dxf')
    assert not path.exists(), 'Use a new destination or explicitly preserve the previous output first'
    doc.saveas(path, fmt='bin')
    report.update(file=path.name, bytes=path.stat().st_size, blocks=len(report['parts']),
                  mesh_entities=sum(r['mesh_entities'] for r in report['parts']),
                  exported_triangles=sum(r['exported_triangles'] for r in report['parts']),
                  bounds_mm=[minimum.tolist(), maximum.tolist()], audit_errors=0, audit_fixes=0,
                  sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    path.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('CAD_DXF_PASSED', path.name, path.stat().st_size, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--logo', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--variant', choices=list(EXCLUSIONS), required=True)
    args = parser.parse_args()
    create(args.cache, args.logo, args.output, args.variant)
