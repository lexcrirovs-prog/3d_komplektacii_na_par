"""Separate, non-destructive S-4000 Blender presentation with two native hinges.

All animation uses ordinary Euler-Z keyframes and native constraints. The file
does not depend on an add-on, Python handlers, drivers, or trusted auto-execution.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geometry import Geometry, material
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))
from build_spacer_scene import fingerprint

VERSION = '2026.09.10.2'
AUTHOR = 'Codex / GPT-6 Astra'
BOILER_PIVOT = (-.8936025, -1.895, 1.135)
CABINET_PIVOT = (-1.300, -.763, 1.575)
SPLIT_Y = -1.685
POSES = {'01-closed': 1, '02-boiler-open': 49, '03-both-open': 97, '04-cabinet-open': 145}
MOVING = ['boiler_door', 'boiler_door_labels', 'burner', 'cabinet_door', 'lc220', 'lc440', 'bc970']


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4*1024*1024), b''): h.update(block)
    return h.hexdigest()


def root(name, label):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o['label'] = label
    return o


def reparent(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def split_mesh(obj, front_root):
    """Bisect only the single source solid crossing the real door/body joint."""
    originals = []
    for front in [False, True]:
        mesh = obj.data.copy()
        mesh.transform(obj.matrix_world)
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces],
            dist=.0000001, plane_co=(0, SPLIT_Y, 0), plane_no=(0, -1, 0),
            clear_inner=front, clear_outer=not front)
        if not bm.faces:
            bm.free(); bpy.data.meshes.remove(mesh); continue
        bm.to_mesh(mesh); bm.free(); mesh.update()
        owner = front_root if front else obj.parent
        mesh.transform(owner.matrix_world.inverted())
        new = bpy.data.objects.new('S4000 front door CAD' if front else 'S4000 stationary body CAD', mesh)
        bpy.context.scene.collection.objects.link(new); new.parent = owner
        new['source_object'] = obj.name
        originals.append(dict(name=new.name, moving=front, vertices=len(mesh.vertices), polygons=len(mesh.polygons)))
    bpy.data.objects.remove(obj, do_unlink=True)
    return originals


def hinge(name, label, pivot, angle, parts, keys):
    ob = root(name, label); ob.location = pivot; ob.rotation_mode = 'XYZ'
    ob.empty_display_type = 'ARROWS'; ob.empty_display_size = .15; ob.show_in_front = True
    ob['closed_degrees'] = 0.; ob['open_degrees'] = angle
    ob['instruction'] = 'Поворот только вокруг Z. Кадры: 1 — закрыто; 49 — котёл; 97 — обе двери; 145 — шкаф.'
    bpy.context.view_layer.update()
    for name in parts: reparent(bpy.data.objects[name], ob)
    limit = ob.constraints.new('LIMIT_ROTATION'); limit.name = 'Предел открывания'
    limit.owner_space = 'LOCAL'; limit.use_limit_x = True; limit.use_limit_y = True; limit.use_limit_z = True
    limit.min_z = math.radians(angle); limit.max_z = 0.; limit.use_transform_limit = True
    for frame, opened in keys:
        ob.rotation_euler.z = math.radians(angle) if opened else 0.
        ob.keyframe_insert(data_path='rotation_euler', index=2, frame=frame)
    for fc in ob.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'; kp.handle_left_type = 'AUTO_CLAMPED'; kp.handle_right_type = 'AUTO_CLAMPED'
    return ob


def clean_controller_normals():
    """Recalculate rear-housing normals without changing controller bounds."""
    rows = []
    for name in ['lc220', 'lc440', 'bc970']:
        for ob in bpy.data.objects[name].children:
            if ob.type != 'MESH': continue
            before = [tuple(v) for v in ob.bound_box]
            bm = bmesh.new(); bm.from_mesh(ob.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0000001)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(ob.data); bm.free(); ob.data.update()
            for face in ob.data.polygons:
                if face.area > .0001: face.use_smooth = False
            assert np.allclose(before, [tuple(v) for v in ob.bound_box], atol=2e-7)
            rows.append(dict(part=name, dimensions_unchanged=True))
    return rows


def collect(manifest):
    """An understandable Outliner, while retaining individual source components."""
    scene = bpy.context.scene
    groups = {}
    for name in ['01 Котёл и обвязка', '02 Дверь котла и горелка', '03 Шкаф управления',
                 '04 Деаэратор', '05 Экономайзер', '06 Насосы', '07 Сепараторы',
                 '08 Другие маршруты', '00 Управление дверьми', '09 Свет и камеры']:
        col = bpy.data.collections.new(name); scene.collection.children.link(col); groups[name] = col
    for o in list(scene.objects):
        if o.type in ['CAMERA', 'LIGHT'] or o.name.startswith('Presentation '):
            group = '09 Свет и камеры'
        elif o.name.startswith('DOOR_'):
            group = '00 Управление дверьми'
        else:
            ancestor = o
            while ancestor.parent and not ancestor.parent.name.startswith('DOOR_'): ancestor = ancestor.parent
            key = ancestor.name
            if key in ['boiler_door', 'boiler_door_labels', 'burner', 'door_lining']: group = '02 Дверь котла и горелка'
            elif key in ['control_cabinet', 'cabinet_interior', 'cabinet_door', 'lc220', 'lc440', 'bc970']: group = '03 Шкаф управления'
            elif key.startswith('deaerator'): group = '04 Деаэратор'
            elif key in ['economizer', 'flue_spacer']: group = '05 Экономайзер'
            elif key.startswith('pump'): group = '06 Насосы'
            elif key.startswith('separator'): group = '07 Сепараторы'
            elif o.hide_render: group = '08 Другие маршруты'
            else: group = '01 Котёл и обвязка'
        for col in list(o.users_collection): col.objects.unlink(o)
        groups[group].objects.link(o)
    return groups


def camera(name, center, direction, width):
    data = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    center = Vector(center); ob.location = center+Vector(direction).normalized()*width*2
    ob.rotation_euler = (center-ob.location).to_track_quat('-Z', 'Y').to_euler()
    data.type = 'ORTHO'; data.ortho_scale = width; data.lens = 45
    # Tight orthographic depth range resolves sub-millimetre supplier panels.
    data.clip_start = .05; data.clip_end = width*5
    return ob


def presentation():
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'; s.eevee.taa_render_samples = 96
    s.eevee.use_gtao = True; s.eevee.gtao_distance = .25; s.eevee.gtao_factor = 1.35
    s.eevee.use_soft_shadows = True
    s.world.color = (.30, .30, .30)
    s.view_settings.view_transform = 'Filmic'; s.view_settings.look = 'Medium High Contrast'; s.view_settings.exposure = -.3
    floor = material('Presentation floor', (.38, .42, .47), .05, .6)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.03))
    bpy.context.object.name = 'Presentation floor'; bpy.context.object.data.materials.append(floor)
    for i, (position, energy, size) in enumerate([
        ((-4, -6, 8), 5500, 7), ((6, -3, 6), 4200, 6), ((0, 7, 8), 7000, 7), ((-5, -4, 3), 1200, 4)]):
        data = bpy.data.lights.new('Presentation softbox '+str(i+1), 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size
        ob = bpy.data.objects.new(data.name, data); s.collection.objects.link(ob); ob.location = position
        ob.rotation_euler = (Vector((0, 0, 1.3))-ob.location).to_track_quat('-Z', 'Y').to_euler()
    views = {
        'CAM_Overview': ((-.5, .15, 1.7), (-1, -1, .72), 11.5),
        'CAM_Boiler': ((-.4, -1.7, 1.25), (1, -2.8, 1.1), 5.1),
        'CAM_Cabinet': ((-1.45, -.91, 1.58), (-1, -.55, .35), 1.38),
    }
    cams = {key: camera(key, *values) for key, values in views.items()}
    s.camera = cams['CAM_Overview']
    s.render.resolution_x = 1800; s.render.resolution_y = 1350; s.render.resolution_percentage = 100
    return cams


def setup_ui(cams, instructions):
    s = bpy.context.scene
    s['version'] = VERSION; s['author'] = AUTHOR
    s['title'] = 'PREMIUM S-4000 · Комфорт · 8–12 бар · Открывание дверей'
    s['opening_instructions'] = '1: закрыто; 49: котёл открыт; 97: обе открыты; 145: шкаф открыт; 193: закрыто. Пробел: анимация.'
    text = bpy.data.texts.new('НАЧАТЬ ЗДЕСЬ — двери S4000.txt'); text.write(instructions)
    text.use_module = False
    bpy.ops.object.select_all(action='DESELECT')
    active = bpy.data.objects['DOOR_BOILER']; active.select_set(True); bpy.context.view_layer.objects.active = active
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                sp = area.spaces.active; sp.clip_end = 150
                sp.shading.type = 'SOLID'; sp.shading.color_type = 'MATERIAL'; sp.shading.light = 'STUDIO'
                sp.shading.show_shadows = True; sp.shading.show_cavity = True
                sp.overlay.show_floor = False; sp.overlay.show_axis_x = False; sp.overlay.show_axis_y = False
                sp.overlay.show_extras = False
                sp.region_3d.view_distance = 12.; sp.region_3d.view_location = (-.4, .1, 1.5)
                sp.region_3d.view_rotation = cams['CAM_Overview'].rotation_euler.to_quaternion()
                sp.region_3d.view_perspective = 'ORTHO'
            elif area.type == 'PROPERTIES': area.spaces.active.context = 'OBJECT'
    s.tool_settings.use_keyframe_insert_auto = False


def build(a):
    assert a.output.resolve() != a.source.parent.resolve()
    a.output.mkdir(parents=True, exist_ok=True)
    target = a.output / ('S4000_COMFORT_OPENING_v'+VERSION+'.blend')
    assert not target.exists(), 'Do not overwrite a delivered file; use a fresh build directory.'
    original_sha = sha(a.source)
    manifest = json.loads(a.manifest.read_text(encoding='utf8'))
    bpy.ops.wm.open_mainfile(filepath=str(a.source), load_ui=False, use_scripts=False)
    s = bpy.context.scene; s.frame_set(1); bpy.context.view_layer.update()
    unchanged = {p['id']: fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts']
                 if p['id'] not in [*MOVING, 'boiler', 'boiler_cladding']}
    source_placements = {name: {o.name: np.asarray(o.matrix_world).tolist()
                                for o in bpy.data.objects[name].children_recursive if o.type == 'MESH'}
                         for name in ['burner', 'cabinet_door', 'lc220', 'lc440', 'bc970']}
    tube_data = json.load(gzip.open(a.tubes, 'rt', encoding='utf8'))
    assert tube_data['smoke_tubes'] == 96 and len(tube_data['selected_solids']) == 97
    door = root('boiler_door', 'Передняя дверь S-4000 — исходная CAD-геометрия')
    labels = root('boiler_door_labels', 'Маркировка передней двери')
    split = []
    for obj in list(bpy.data.objects['boiler'].children):
        if obj.type != 'MESH': continue
        coords = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
        if min(v.y for v in coords) < SPLIT_Y:
            split.extend(split_mesh(obj, door))
    assert len(door.children) == 1
    for obj in list(bpy.data.objects['boiler_cladding'].children):
        pts = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
        if max(v.y for v in pts) < -2.10: reparent(obj, labels)
    assert len(labels.children) == 2, 'Only the two front-door labels should move'
    g = Geometry.__new__(Geometry)
    g.materials = {key: bpy.data.materials[key] for key in ['dark', 'steel', 'black']}
    g.materials['tubes'] = material('S4000 tube steel', (.105, .135, .16), .60, .40)
    g.materials['lining'] = material('Door inner lining', (.22, .225, .23), .05, .80)
    g.batches = {}; g.parts = {}; g.ports = {}; g.edges = []; g.owner = None
    g.part('boiler_tubes', '96 дымогарных труб и жаровая труба S-4000', 'user_cad_tube_whitelist')
    basis = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
    def mapped(vs): return (np.asarray(vs) @ basis.T*.001 + [0, 1.3, 1.135]).tolist()
    for row in tube_data['solids']:
        ob = g.mesh('S4000 '+row['kind']+' '+str(row['source_solid']), mapped(row['vertices']), row['triangles'], 'tubes', True)
        ob['source_solid'] = row['source_solid']
    g.part('boiler_tubeplate', 'Вид отверстий трубной доски', 'generated_tube_opening_mask')
    mask = tube_data['presentation_mask']
    g.mesh('S4000 tube opening mask', mapped(mask['vertices']), mask['triangles'], 'steel', True)
    # Render-only lining at the inside of the original front door, retaining
    # its offset burner port. It is generated, not imported construction CAD.
    g.owner = 'boiler_door'
    for i in range(128):
        a0 = i*math.tau/128; a1 = (i+1)*math.tau/128
        pts = [(.890*math.cos(a0), -2.015, 1.135+.890*math.sin(a0)),
               (.890*math.cos(a1), -2.015, 1.135+.890*math.sin(a1)),
               (.212*math.cos(a1), -2.015, .879+.212*math.sin(a1)),
               (.212*math.cos(a0), -2.015, .879+.212*math.sin(a0))]
        g.batch(pts, [(0, 1, 2, 3)], 'lining')
    g.flush(); bpy.context.view_layer.update()
    controller_cleanup = clean_controller_normals()
    boil = hinge('DOOR_BOILER', 'ДВЕРЬ КОТЛА — поворот Z от 0 до −105°', BOILER_PIVOT, -105,
                 ['boiler_door', 'boiler_door_labels', 'burner'],
                 [(1, False), (17, False), (49, True), (97, True), (129, False), (193, False)])
    cab = hinge('DOOR_CABINET', 'ДВЕРЦА ШКАФА — поворот Z от 0 до −110°', CABINET_PIVOT, -110,
                ['cabinet_door', 'lc220', 'lc440', 'bc970'],
                [(1, False), (65, False), (97, True), (145, True), (177, False), (193, False)])
    s.frame_start = 1; s.frame_end = 193; s.render.fps = 24; s.sync_mode = 'FRAME_DROP'
    s.timeline_markers.clear()
    for frame, name in [(1, 'ЗАКРЫТО'), (49, 'КОТЁЛ ОТКРЫТ'), (97, 'ОБЕ ДВЕРИ ОТКРЫТЫ'),
                        (145, 'ШКАФ ОТКРЫТ'), (193, 'ЗАКРЫТО')]: s.timeline_markers.new(name, frame=frame)
    s.frame_set(1); bpy.context.view_layer.update()
    assert all(fingerprint(bpy.data.objects[key]) == value for key, value in unchanged.items())
    cams = presentation()
    instructions = ('PREMIUM S-4000 · КОМФОРТ · 8–12 БАР\n'
        'Версия '+VERSION+' · 10.09.2026 · '+AUTHOR+'\n\n'
        'Откройте файл в Blender. Дополнения и разрешение на исполнение сценариев не нужны.\n'
        'Пробел запускает и останавливает анимацию. Колесо мыши — приближение; средняя кнопка — вращение вида.\n\n'
        'Кадры на нижней шкале:\n1 — обе двери закрыты;\n49 — открыта дверь котла;\n'
        '97 — обе двери открыты;\n145 — открыт шкаф;\n193 — обе двери снова закрыты.\n'
        'Введите номер в поле текущего кадра или переместите ползунок шкалы.\n\n'
        'Дверь котла поворачивается с горелкой, дверь шкафа — с приборами и закреплённым на ней жгутом.\n'
        'Для ручного изменения в списке объектов есть DOOR_BOILER и DOOR_CABINET. Меняйте только поворот Z, '
        'затем I над полем поворота для сохранения собственного ключа анимации.\n\n'
        'Внутри котла: 96 настоящих дымогарных труб и жаровая труба из STEP S-4000 1,2 МПа. '
        'Остальные 571 конструкционные детали не переносились. Маска отверстий — отдельная геометрия для показа.\n'
        'Шкаф воспроизводит предоставленное фото. Точная компоновка шкафа «Комфорт» с ПР200 остаётся на замену.\n'
        'Исходная сборка AutoCAD и её Blender-сцена сохранены отдельно без изменений.\n')
    setup_ui(cams, instructions); collect(manifest)
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name.startswith('Presentation '): ob.hide_set(True)
    report = dict(version=VERSION, date='2026-09-10', author=AUTHOR,
        source_scene_sha256=original_sha, source_scene_unchanged=True,
        source_scene_version=manifest['version'], source_split=split,
        unchanged_part_fingerprints=unchanged,
        tube_source={k: v for k, v in tube_data.items() if k not in ['solids', 'centers_mm', 'presentation_mask']},
        groups=[dict(id='boiler', control=boil.name, pivot_m=list(BOILER_PIVOT), open_degrees=-105,
                     parts=['boiler_door', 'boiler_door_labels', 'burner']),
                dict(id='cabinet', control=cab.name, pivot_m=list(CABINET_PIVOT), open_degrees=-110,
                     parts=['cabinet_door', 'lc220', 'lc440', 'bc970'])],
        poses=POSES, frame_start=1, frame_end=193, fps=24, scripts_required=False)
    report['controller_surface_cleanup'] = controller_cleanup
    report['source_closed_placements'] = source_placements
    report['new_static_part_fingerprints'] = {key: fingerprint(bpy.data.objects[key])
        for key in ['boiler', 'boiler_cladding', 'boiler_tubes', 'boiler_tubeplate']}
    (a.output/'opening.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    (a.output/'Как открыть двери.txt').write_text(instructions, encoding='utf8')
    (a.output/'assembly-source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    assert sha(a.source) == original_sha
    print('BUILT_S4000_OPENING', target, 'MOVING', MOVING, flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for key in ['source', 'manifest', 'tubes', 'output']: p.add_argument('--'+key, type=Path, required=True)
    build(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
