"""2026.09.11.1: owner elevations and real A31 DN25 flange interfaces."""
from copy import deepcopy
from blowdown_layout import schedule as previous_schedule

VERSION='2026.09.11.1'
DA_LIFT=1.0
TRAP_CENTER=(3.02,4.35,.48)
TRAP_BASIS=((0,0,-1),(0,1,0),(1,0,0))
TRAP_IN=(3.10,4.35,.48)
TRAP_OUT=(2.94,4.35,.48)
CHANGED_ROUTES={'tds_to_fv','flash_steam_common','fv_to_trap_gap','trap_gap_to_bdv','fv_bottom_drain_stub'}

def schedule():
    ports,rows=previous_schedule(False)
    ports=deepcopy(ports);rows=deepcopy(rows)
    for key in ['fv_N','fv_P','fv_O','fv_S','fv_drain_valve_gap']:
        ports[key]['position_m'][2]-=1.2
    ports['da_flash_in']['position_m'][2]+=DA_LIFT
    for key,point,normal in [('trap_in',TRAP_IN,(1,0,0)),('trap_out',TRAP_OUT,(-1,0,0))]:
        ports[key].update(position_m=list(point),normal=list(normal),dn=25,boundary=False,
                          role='Фланец конденсатоотводчика Стимакс А31 DN25',
                          source='Supplied A31 DN25 FF DWG: raw Z=-80/+80 mm, raised face OD68 mm',when={'fv':True})
    targets={
        'tds_to_fv':[(1.56,2.95,.92),(1.56,3.65,.92),(3.10,3.65,.92),ports['fv_N']['position_m']],
        'flash_steam_common':[ports['fv_O']['position_m'],[3.65,3.65,3.20],[3.65,2.95,3.23],ports['flash_boundary']['position_m']],
        'fv_to_trap_gap':[ports['fv_P']['position_m'],[3.65,4.35,.695],[3.65,4.35,.48],list(TRAP_IN)],
        # A pressure-driven lift, not a gravity drain. No intermediate high/low loops.
        'trap_gap_to_bdv':[list(TRAP_OUT),[2.60,4.35,.48],[2.60,3.40,.48],[2.60,3.40,1.605],
                           [ports['bdv_D']['position_m'][i]+ports['bdv_D']['normal'][i]*.25 for i in range(3)],ports['bdv_D']['position_m']],
        'fv_bottom_drain_stub':[ports['fv_S']['position_m'],ports['fv_drain_valve_gap']['position_m']]
    }
    for row in rows:
        if row['id'] not in CHANGED_ROUTES:continue
        row['polyline_m']=targets[row['id']]
        if row['id']=='fv_to_trap_gap':
            row.update(label='Конденсат FV8 → Стимакс А31 DN25',dn=25,radius_m=.01685,start_dn=50,end_dn=25)
        if row['id']=='trap_gap_to_bdv':
            row.update(label='Стимакс А31 → D BDV: напорный подъём',start_dn=25,end_dn=25)
    return ports,[r for r in rows if r['id'] in CHANGED_ROUTES]
