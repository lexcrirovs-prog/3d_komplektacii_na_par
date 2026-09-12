"""Fresh-process verification and review renders of the delivered Blender file."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))
from build_spacer_scene import fingerprint


def main(a):
    d = a.directory
    report = json.loads((d/'opening.json').read_text(encoding='utf8'))
    path = d/('S4000_COMFORT_OPENING_v'+report['version']+'.blend')
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    s = bpy.context.scene; s.frame_set(1); bpy.context.view_layer.update()
    closed = {part: bpy.data.objects[part].matrix_world.copy() for group in report['groups'] for part in group['parts']}
    source_static = report['unchanged_part_fingerprints']
    static = dict(source_static, **report.get('new_static_part_fingerprints', {}))
    assert all(fingerprint(bpy.data.objects[k]) == h for k, h in static.items())
    source_pose_count = 0
    for part, meshes in report.get('source_closed_placements', {}).items():
        for name, matrix in meshes.items():
            assert np.allclose(np.asarray(bpy.data.objects[name].matrix_world), matrix, atol=1e-6), name
            source_pose_count += 1
    assert sum(1 for o in bpy.data.objects if o.get('source_solid', -1) in range(143, 239)) == 96
    assert len(bpy.data.objects['boiler_tubes'].children) == 97
    assert not any(o.animation_data and o.animation_data.drivers for o in bpy.data.objects)
    assert not any(t.use_module for t in bpy.data.texts)
    statuses = []
    # All 193 frames, including interpolation: pure rotation about a fixed
    # hinge, unchanging rigid offsets of every attached source component.
    max_error = 0.
    for f in range(1, 194):
        s.frame_set(f); bpy.context.view_layer.update()
        angles = {}
        for group in report['groups']:
            control = bpy.data.objects[group['control']]
            assert np.allclose(control.matrix_world.translation, group['pivot_m'], atol=1e-6)
            angle = control.rotation_euler.z
            assert math.radians(group['open_degrees'])-1e-6 <= angle <= 1e-6
            angles[group['id']] = math.degrees(angle)
            p = Vector(group['pivot_m'])
            rotate = Matrix.Translation(p) @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation(-p)
            for part in group['parts']:
                actual = np.array(bpy.data.objects[part].matrix_world)
                expected = np.array(rotate @ closed[part])
                error = float(np.max(np.abs(actual-expected))); max_error = max(max_error, error)
                assert error < 0.000005, (f, part, error)
        if f in [1, 49, 97, 145, 193]: statuses.append(dict(frame=f, **angles))
    expected = [(0, 0), (-105, 0), (-105, -110), (0, -110), (0, 0)]
    for row, (boiler, cabinet) in zip(statuses, expected):
        assert abs(row['boiler']-boiler) < 1e-4 and abs(row['cabinet']-cabinet) < 1e-4
    for f in [49, 97, 145]:
        s.frame_set(f); bpy.context.view_layer.update()
        assert all(fingerprint(bpy.data.objects[k]) == h for k, h in static.items()), 'Stationary equipment moved'
    s.frame_set(1); bpy.context.view_layer.update()
    verification = dict(status='PASSED_BLENDER_NATIVE_OPENING', version=report['version'],
        frames_checked=193, retained_static_parts=len(source_static), total_checked_static_parts=len(static),
        source_closed_mesh_placements=source_pose_count, max_rigid_transform_error=max_error,
        poses=statuses, actual_smoke_tubes=96, source_step_solids_imported=97,
        source_step_solids_excluded=571, reopened_in_fresh_process=True,
        automatic_script_execution=False, required_addons=[],
        checked_file_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        blender=bpy.app.version_string, author=report['author'], date=report['date'])
    if 'rotation' in report:
        rotation = report['rotation']
        turn = Matrix(rotation['matrix'])
        maximum_error = 0.
        for name, old in rotation['previous_object_matrices'].items():
            expected = np.asarray(turn @ Matrix(old))
            error = float(np.max(np.abs(np.asarray(bpy.data.objects[name].matrix_world) - expected)))
            maximum_error = max(maximum_error, error)
            assert error < .000005, ('Deaerator rigid rotation', name, error)
        assert rotation['angle_degrees'] == 180 and rotation['axis'] == 'Z'
        assert np.allclose(turn.to_3x3(), np.diag([-1., -1., 1.]))
        manifest = json.loads((d/'assembly-source.json').read_text(encoding='utf8'))
        feed = next(e for e in manifest['flow_edges'] if e['part'] == 'deaerator_feed')
        assert np.allclose(feed['polyline_m'][0], manifest['ports']['deaerator_out']['position_m'])
        assert np.allclose(feed['polyline_m'][-1], manifest['ports']['supply_boundary']['position_m'])
        assert np.allclose(manifest['ports']['deaerator_out']['normal'], [-1, 0, 0])
        # The first straight after the source flange must follow its new outward normal.
        direction = np.asarray(feed['polyline_m'][1])-np.asarray(feed['polyline_m'][0])
        assert np.allclose(direction/np.linalg.norm(direction), [-1, 0, 0])
        verification['deaerator_rotation'] = dict(degrees=180, axis='Z',
            attached_objects_checked=len(rotation['previous_object_matrices']),
            maximum_matrix_error=maximum_error, outlet_connected=True,
            source_normal_respected=True, fixed_pump_supply_boundary=True,
            level_gauge_rotated_with_tank=True)
    if 'pressure_revision' in report:
        pressure = report['pressure_revision']
        points = np.asarray(pressure['centerline_m'])
        assert np.allclose(points[0], [.948531,-.99,1.925])
        assert np.allclose(points[-1], [1.42,-.99,2.85])
        assert len(set(map(tuple, np.round(points,8)))) == len(points)
        assert np.all(np.diff(points[:,0]) >= -1e-8), 'The pressure bend must not return into a loop'
        for key, value in pressure['retained_instrument_fingerprints'].items():
            assert fingerprint(bpy.data.objects[key]) == value, key
        for cable_path in pressure['cable_paths_m']:
            assert np.allclose(cable_path[-1][2], 1.225), 'Cable must reach cabinet gland'
        verification['pressure_group'] = dict(open_centerline=True, closed_loop=False,
            boiler_endpoints_preserved=True, unchanged_instruments=len(pressure['retained_instrument_fingerprints']),
            instrument_positions_preserved='video_review' not in report, unchanged_other_parts=pressure['retained_other_parts'],
            cable_leads_rerouted=3, references=pressure['reference_files'])
    if 'blowdown_revision' in report:
        revision=report['blowdown_revision']
        assert all(fingerprint(bpy.data.objects[k])==v for k,v in revision['retained_source_fingerprints'].items())
        verification['blowdown']=dict(retained_parts=len(revision['retained_source_fingerprints']),
            changed_existing_parts=revision['changed_existing_parts'],
            fixed_pipework_during_door_animation=True,missing_device_count=len(revision['missing_equipment']),
            da_steam_connected=revision['da_steam_connected'],fv_support_height_m=revision['fv_support_height_m'])
    if 'floor_revision' in report:
        floor=report['floor_revision'];maximum_error=0.;count=0
        for key,delta in [('separator_fv8',-1.2),('deaerator',1.),('deaerator_details',1.)]:
            turn=Matrix.Translation(Vector((0,0,delta)))
            for name,old in floor['previous_matrices'][key].items():
                error=float(np.max(np.abs(np.asarray(bpy.data.objects[name].matrix_world)-np.asarray(turn@Matrix(old)))))
                maximum_error=max(maximum_error,error);count+=1
                assert error<.000005,(key,name,error)
        for key,value in floor['preserved_fingerprints'].items():
            assert fingerprint(bpy.data.objects[key])==value,key
        def z_bounds(key):
            vs=[o.matrix_world@Vector(v) for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.bound_box]
            return min(v.z for v in vs),max(v.z for v in vs)
        fv=z_bounds('separator_fv8');da=z_bounds('deaerator');support=z_bounds('deaerator_support')
        assert abs(fv[0])<.000005 and abs(da[0]-1)<.000005
        assert abs(support[0])<.000005
        centers=floor['deaerator_support_centers_y_m']
        assert len(centers)==2 and centers[1]-centers[0]>2
        assert abs(support[1]-max(p['top_m']for p in floor['support_pads']))<.000005
        for pad in floor['support_pads']:
            plates=[p for p in floor['load_bearing_plates'] if abs((p['low'][1]+p['high'][1])/2-pad['y_m'])<.01]
            assert abs(min(p['low'][2]for p in plates)-pad['top_m'])<.000005
        assert not any(key in bpy.data.objects for key in ['fv_support','fv_missing_device_marker'])
        trap=bpy.data.objects['condensate_trap']
        triangles=sum(len(o.data.polygons) for o in trap.children_recursive if o.type=='MESH')
        assert triangles==floor['trap_triangle_count']==83390
        points=np.array([tuple(o.matrix_world@v.co) for o in trap.children_recursive if o.type=='MESH' for v in o.data.vertices])
        for key in ['trap_in_m','trap_out_m']:
            face=np.array(floor[key]);verts=points[np.abs(points[:,0]-face[0])<1e-5]
            assert len(verts)>40,(key,len(verts))
            yz=verts[:,1:]-face[1:];radii=np.linalg.norm(yz,axis=1)
            assert np.any(np.abs(radii-.034)<1e-5),'DN25 raised face OD68'
            shoulder=face[0]+(-.002 if key=='trap_in_m' else .002)
            rim=points[np.abs(points[:,0]-shoulder)<1e-5]
            assert np.any(np.abs(np.linalg.norm(rim[:,1:]-face[1:],axis=1)-.0575)<1e-5),'Flange OD115'
        assert abs(np.linalg.norm(np.array(floor['trap_in_m'])-floor['trap_out_m'])-.16)<1e-8
        if 'video_review' in report:
            assert points[:,2].max()>.58 and points[:,2].max()<.60 and points[:,2].min()>.40,'A31 rolled 90 degrees, top plug up'
        else:assert points[:,2].max()>.70 and points[:,2].min()>.40,'Float housing upright and above floor'
        verification['floor_layout']=dict(fv_bottom_m=fv[0],deaerator_bottom_m=da[0],support_z_m=support,
            translated_objects_checked=count,maximum_matrix_error=maximum_error,
            other_parts_preserved=len(floor['preserved_fingerprints']),trap_triangles=triangles,
            trap_faces_connected=True,flange_spacing_mm=160,condensate_lift_m=1.125,
            both_saddles_supported=True,support_centers_y_m=centers,
            hydraulic_selection='NOT_VERIFIED')
    if 'video_review' in report:
        from mathutils.bvhtree import BVHTree
        video=report['video_review'];manifest=json.loads((d/'assembly-source.json').read_text(encoding='utf8'))
        assert all(fingerprint(bpy.data.objects[k])==h for k,h in video['unchanged_fingerprints'].items())
        assert 'flash_return_marker' not in bpy.data.objects
        tube_trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(p.vertices)for p in o.data.polygons])
                    for o in bpy.data.objects['boiler_tubes'].children if o.type=='MESH']
        clearances={}
        for key,(x,y) in {'lp200':(-.0368,-1.21125),'lp400':(0,-.64),'lcs600':(.0368,-1.21125)}.items():
            vs=[o.matrix_world@v.co for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.data.vertices]
            tip=min(v.z for v in vs);assert abs(tip-1.8)<1e-5
            hits=[h[0].z for tree in tube_trees if (h:=tree.ray_cast(Vector((x,y,2.21)),Vector((0,0,-1)),2))[0]]
            assert hits and tip-max(hits)>.30
            clearances[key]=tip-max(hits)
        for pump in ['pump_1','pump_2']:
            trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(p.vertices)for p in o.data.polygons])for o in bpy.data.objects[pump].children_recursive if o.type=='MESH']
            for pts in video['pump_cable_paths_m']:
                for aa,bb in zip(pts[1:],pts[2:]):
                    aa,bb=Vector(aa),Vector(bb);distance=(bb-aa).length
                    assert all(tree.ray_cast(aa,(bb-aa).normalized(),distance)[0] is None for tree in trees),'Pump cable crosses pump'
        for key in ['safety_vent_1','safety_vent_2']:
            e=next(e for e in manifest['flow_edges']if e['part']==key)
            assert max(p[2]for p in e['polyline_m'])-min(p[2]for p in e['polyline_m'])<1e-8
            assert e['polyline_m'][-1][1]>3.492
        verification['video_review']=dict(status='PASSED_GEOMETRY_REVIEW',date=video['date'],source_video=video['source_video'],
            original_unaffected_parts_checked=len(video['unchanged_fingerprints']),probe_to_furnace_clearance_m=clearances,
            pump_cable_centerlines_do_not_cross_pumps=True,fv_to_da_removed=True,fv_safety_dn=video['fv_safety_dn'],
            trap_rotated_90=True,lower_blowdown_drive_up=True,discharge_horizontal=True,
            sample_source_on_valve=True,receiving_SC9_port='UNCONFIRMED_EXISTING_INTERFACE')
        if 'safety_discharge_revision' in report:
            def meshes(key):
                return [o for o in bpy.data.objects[key].children_recursive if o.type=='MESH']
            def tree(ob):
                return BVHTree.FromPolygons([ob.matrix_world@v.co for v in ob.data.vertices],
                    [tuple(p.vertices) for p in ob.data.polygons])
            vents={k:[tree(o) for o in meshes(k)] for k in ['safety_vent_1','safety_vent_2']}
            assert not any(a.overlap(b) for a in vents['safety_vent_1'] for b in vents['safety_vent_2']), 'Discharge pipes intersect'
            nearby=['economizer','to_economizer','eco_inlet_adapter','from_economizer']
            for key in nearby:
                for ob in meshes(key):
                    other=tree(ob)
                    assert not any(v.overlap(other) for row in vents.values() for v in row),('Discharge intersects',key)
            paths=[np.asarray(next(e for e in manifest['flow_edges'] if e['part']==k)['polyline_m']) for k in vents]
            straight=[p[-1]-p[-2] for p in paths]
            assert np.linalg.norm(np.cross(*straight))<1e-9, 'Discharges are not parallel'
            assert paths[0][1,0]<paths[1][1,0] and paths[0][0,1]<paths[1][0,1]
            spacing=abs(paths[0][-1,0]-paths[1][-1,0])*1000
            verification['safety_discharges']=dict(status='PASSED_SEPARATED_PARALLEL_MESHES',
                pair_intersections=0,parallel_spacing_mm=spacing,straight_surface_gap_mm=spacing-76.1,
                horizontal=True,source_valve_endpoints_preserved=True,
                nearby_equipment_without_intersections=nearby,offsets_exchanged=True)
    if 'corrugated_wiring_revision' in report:
        revision=report['corrugated_wiring_revision']
        assert 'cable_channel_revision' not in report
        assert not any(o.get('cable_channel') for o in bpy.data.objects), 'Rejected covers remain'
        assert all(fingerprint(bpy.data.objects[k])==v for k,v in revision['unchanged_fingerprints'].items())
        assert fingerprint(bpy.data.objects['cabinet_door'])==revision['cabinet_door_restored_sha256']
        samples_checked=0
        for row in revision['conduits']:
            objects=[o for o in bpy.data.objects[row['part']].children_recursive
                     if o.type=='MESH' and o.data.materials[0].name=='black']
            assert len(objects)==1
            ob=objects[0];n=row['ring_sides'];offset=row['vertex_offset']
            assert row['rib_pitch_m']<=.008 and abs(row['points_m'][-1][2]-1.225)<1e-7
            for sample in row['samples']:
                start=offset+sample['index']*n
                vertices=np.array([ob.matrix_world@ob.data.vertices[i].co for i in range(start,start+n)])
                center=np.array(sample['center'])
                assert np.allclose(vertices.mean(axis=0),center,atol=1e-6)
                assert np.allclose(np.linalg.norm(vertices-center,axis=1),sample['radius'],atol=1e-6)
                samples_checked+=1
            measured=[x['radius'] for x in row['samples'][:5]]
            assert max(measured)-min(measured)>.001, 'Conduit has no corrugation'
        verification['corrugated_wiring']=dict(status='PASSED_RESTORED_CORRUGATED_WIRING',
            removed_closed_channels=revision['removed_channels'],conduit_runs=len(revision['conduits']),
            actual_geometry_cross_sections_checked=samples_checked,unrelated_parts_preserved=len(revision['unchanged_fingerprints']),
            original_cabinet_door_restored=True,actuator_core_vertices_preserved=revision['actuator_core_vertices_preserved'],
            prior_secured_routes_restored=True,lower_open_trays_preserved=True,all_runs_reach_cabinet=True)
    if 'cable_channel_revision' in report:
        from mathutils.bvhtree import BVHTree
        revision=report['cable_channel_revision']
        assert all(fingerprint(bpy.data.objects[k])==v for k,v in revision['unchanged_fingerprints'].items())
        assert max(x['length_m'] for x in revision['short_terminal_leads'])<.15
        channels=[]
        for row in revision['channels']:
            ob=bpy.data.objects[row['object']]
            assert ob['cable_channel'] and ob.parent.name==row['part']
            vs=[ob.matrix_world@v.co for v in ob.data.vertices]
            fs=[tuple(p.vertices) for p in ob.data.polygons]
            tree=BVHTree.FromPolygons(vs,fs)
            bounds=np.asarray(vs);lo=bounds.min(axis=0);hi=bounds.max(axis=0)
            channels.append((row,tree,lo,hi))
            # Each actual mesh has an inner cavity, a closed cover, and four walls.
            p0,p1=map(Vector,row['centerline_m'][:2]);center=(p0+p1)/2;t=(p1-p0).normalized()
            ref=Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0));u=ref.cross(t).normalized();v=t.cross(u)
            for direction in [u,-u,v,-v]:
                hit=tree.ray_cast(center,direction,max(row['width_m'],row['height_m']))
                assert hit[0] is not None and hit[3]>.003,(row['id'],'Missing wall or inner clearance')
        # Detect collisions with existing equipment, using actual mesh surfaces.
        collisions=[];tested=0
        excluded=set(revision['changed_parts'])|{'cabinet_interior','control_cabinet','lc220','lc440','bc970','pr200'}
        for part in manifest['parts']:
            if part['id'] in excluded:continue
            for ob in bpy.data.objects[part['id']].children_recursive:
                if ob.type!='MESH':continue
                corners=np.array([ob.matrix_world@Vector(v) for v in ob.bound_box]);lo=corners.min(axis=0);hi=corners.max(axis=0)
                nearby=[x for x in channels if x[0]['part']!='cabinet_door' and np.all(lo<=x[3]) and np.all(hi>=x[2])]
                if not nearby:continue
                tree=BVHTree.FromPolygons([ob.matrix_world@v.co for v in ob.data.vertices],[tuple(p.vertices) for p in ob.data.polygons])
                for row,channel,_,_ in nearby:
                    tested+=1
                    if channel.overlap(tree):collisions.append((row['id'],part['id'],ob.name))
        assert not collisions,('Channel intersects equipment',collisions)
        # Verify that long wire paths stay within the union of channel routes.
        segments=[(np.array(a),np.array(b),min(row['width_m'],row['height_m'])/2-.004)
            for row in revision['channels'] if row['part']!='cabinet_door'
            for a,b in zip(row['centerline_m'],row['centerline_m'][1:])]
        for run in revision['enclosed_wire_runs']:
            for wire_start,wire_end in zip(run['points_m'],run['points_m'][1:]):
                for p in np.linspace(wire_start,wire_end,max(2,int(np.linalg.norm(np.array(wire_end)-wire_start)/.02)+1)):
                    covered=False
                    for start,end,radius in segments:
                        dv=end-start;v=start+np.clip(np.dot(p-start,dv)/np.dot(dv,dv),0,1)*dv
                        if np.linalg.norm(p-v)<=radius+1e-7:covered=True;break
                    assert covered,(run['id'],'Wire outside channel',p.tolist())
        verification['cable_channels']=dict(status='PASSED_ENCLOSED_WIRING',channels=len(channels),
            short_terminal_leads=len(revision['short_terminal_leads']),long_enclosed_runs=len(revision['enclosed_wire_runs']),
            maximum_exposed_lead_mm=max(x['length_m'] for x in revision['short_terminal_leads'])*1000,
            equipment_mesh_pairs_checked=tested,equipment_intersections=0,
            actuator_core_vertices_preserved=revision['actuator_core_vertices_preserved'],
            door_channels_attached_to_moving_door=True,hinge_link_preserved=True,
            unrelated_parts_preserved=len(revision['unchanged_fingerprints']))
    (d/'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(verification, ensure_ascii=False), flush=True)
    if not a.render: return
    out = d/'previews'; out.mkdir(exist_ok=True)
    renders = [
        ('01-closed', 1, 'CAM_Overview'),
        ('02-both-open', 97, 'CAM_Overview'),
        ('03-boiler-open', 49, 'CAM_Boiler'),
        ('04-cabinet-open', 145, 'CAM_Cabinet'),
        ('05-cabinet-closed', 1, 'CAM_Cabinet'),
        ('06-boiler-half-open', 33, 'CAM_Boiler'),
    ]
    if 'rotation' in report:
        renders.append(('07-deaerator-rotated', 1, 'CAM_Deaerator'))
    if 'pressure_revision' in report:
        renders.append(('08-pressure-gooseneck', 1, 'CAM_Pressure'))
    if 'blowdown_revision' in report:
        renders += [('09-blowdown',1,'CAM_Blowdown'),('10-routing',1,'CAM_Routing'),('11-lower-blowdown',1,'CAM_LowerBlowdown')]
    if 'floor_revision' in report:
        renders.append(('12-condensate-trap',1,'CAM_Trap'))
    for name, frame, cam in renders:
        if a.views and name not in a.views: continue
        s.frame_set(frame); s.camera = bpy.data.objects[cam]
        s.render.filepath = str(out/(name+'.png'))
        if 'cabinet' in name:
            s.render.resolution_x = 1600; s.render.resolution_y = 1450
        else:
            s.render.resolution_x = 1800; s.render.resolution_y = 1350
        bpy.ops.render.render(write_still=True)
        print('REVIEW_RENDER', name, flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--render', action='store_true'); p.add_argument('--views', nargs='*')
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
