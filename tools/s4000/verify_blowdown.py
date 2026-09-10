"""Independent flow checks: destination selection, missing devices and slope."""
import numpy as np


def verify_blowdown(manifest,ids,options):
    revision=manifest['blowdown_revision'];ports=manifest['ports']
    edges=[e for e in manifest['flow_edges'] if e['part'] in ids]
    edges += [e for e in revision['device_edges'] if e['part'] in ids]
    graph={}
    for edge in edges:graph.setdefault(edge['start'],set()).add(edge['end'])

    def reachable(start,end):
        visited=set();todo=[start]
        while todo:
            node=todo.pop()
            if node==end:return True
            if node in visited:continue
            visited.add(node);todo.extend(graph.get(node,()))
        return False

    # No pressure feed, steam delivery or instrument manifold may receive blowdown.
    for start in ['tds_out','boiler_bottom']:
        for end in ['pump_delivery','suction_header','boiler_feed_train','boiler_steam','da_flash_in']:
            assert not reachable(start,end),(start,end)
    assert reachable('boiler_bottom','bottom_join')
    assert reachable('bottom_gate_in','bottom_auto_in')
    assert reachable('bottom_bypass_in','bottom_join')
    assert graph['bottom_split']=={'bottom_gate_in','bottom_bypass_in'}
    assert reachable('boiler_bottom','bdv_C')==options['bdv']
    assert not reachable('boiler_bottom','fv_N')
    assert reachable('tds_out','fv_N')==options['fv']
    assert reachable('tds_out','bdv_D')==(options['bdv'] and not options['fv'])
    assert reachable('tds_out','tds_external')==(not options['bdv'] and not options['fv'])
    if options['fv']:
        assert reachable('fv_P','trap_in')
        assert not reachable('fv_P','bdv_D'),'Missing trap must not be replaced by a continuous pipe'
        assert not reachable('trap_in','trap_out')
        assert reachable('trap_out','bdv_D')==options['bdv']
        assert reachable('fv_O','flash_boundary')
        assert reachable('fv_O','da_flash_in')==(options['deaerator'] and revision['da_steam_connected'])
        assert not reachable('fv_O','bdv_A')
    assert ('bdv_vent' in ids)==options['bdv']
    assert ('bdv_cooling_stub' in ids)==options['bdv']
    assert ('fv_support' in ids)==options['fv']
    # Source FV dimensions, measured relative to its mounting base.
    lift=revision['fv_support_height_m']
    for key,z in [('fv_N',.920),('fv_P',.695),('fv_O',1.530),('fv_S',.400)]:
        assert abs(ports[key]['position_m'][2]-lift-z)<1e-8
    # Each liquid section falls towards the trap / BDV, never into an uphill loop.
    for key in ['fv_to_trap_gap','trap_gap_to_bdv']:
        for edge in edges:
            if edge['part']==key:
                zs=np.array(edge['polyline_m'])[:,2]
                assert np.all(np.diff(zs)<=1e-9),(key,zs)
    gap=np.linalg.norm(np.array(ports['trap_in']['position_m'])-ports['trap_out']['position_m'])
    assert abs(gap-.32)<1e-8
    assert all(not item['added'] for item in revision['missing_equipment'])
    return dict(continuous='FV8' if options['fv'] else 'BDV' if options['bdv'] else 'external boundary',
                periodic='BDV' if options['bdv'] else 'external boundary',
                flash_steam='DA-15' if options['fv'] and options['deaerator'] and revision['da_steam_connected'] else 'boundary',
                condensate_trap='explicit missing device, no direct bypass',
                condensate_no_uphill_segment=True)
