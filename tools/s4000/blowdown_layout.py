"""Connection schedule for the existing S-4000 Comfort equipment, metres.

Functional reference: the supplied 30 t/h thermal diagram. Diameters and port
locations come from the individual S-4000 / DA-15 / FV8 / BDV source drawings,
not from the larger plant's common headers. Missing devices are explicit gaps.
"""
from math import sqrt

VERSION = '2026.09.10.6'
FV_LIFT = 1.20
FV_BASE = (3.65, 3.65, FV_LIFT)
BDV_BASE = (3.65, 2.40, 0.)
BDV_D_NORMAL = (-1/sqrt(2), 1/sqrt(2), 0.)
BDV_D = tuple(BDV_BASE[i]+BDV_D_NORMAL[i]*.4965 for i in range(2))+(1.605,)
DA_STEAM = (-3.65, .975, 1.65214)
BCV_OLD_IN = (.207465533725, 2.092812391845, .2506662389)
BCV_IN = (0., 2.72, .125)
BCV_OUT = (0., 2.8955, .125)
BCV_SHIFT = tuple(a-b for a,b in zip(BCV_IN, BCV_OLD_IN))
TDS_OUT = (1.429534746111, -1.39, 1.27300215958)
TDS_BOUNDARY = (1.56, 2.95, .92)
TRAP_IN = (3.10, 4.16, 1.87)
TRAP_OUT = (2.78, 4.16, 1.87)


def schedule(da_connected=False):
    ports = {}; routes = []

    def port(key, p, n, dn, role, source, when=None, boundary=False):
        ports[key] = dict(position_m=list(p), normal=list(n), dn=dn, role=role,
                          source=source, when=when or {}, boundary=boundary)

    def route(key, label, start, end, via=(), dn=32, when=None, mat='dark',
              radius=None, system='blowdown', start_dn=None, end_dn=None):
        routes.append(dict(id=key, label=label, start=start, end=end,
            polyline_m=[ports[start]['position_m'], *[list(p) for p in via], ports[end]['position_m']],
            dn=dn, when=when or {}, material=mat,
            radius_m=radius or {15:.01065,20:.0135,25:.01685,32:.0212,50:.0285,65:.038,80:.0445,100:.057,150:.084}[dn],
            system=system, start_dn=start_dn, end_dn=end_dn))

    port('boiler_bottom', (0,2.005,.125), (0,1,0),32,'Нижняя продувка котла', 'S-4000 STEP solid 6, flange Z=-705 mm')
    port('bottom_split', (0,2.20,.125), (0,1,0),32,'Разделение основной и ручной обходной линии','Layout')
    port('bottom_gate_in', (0,2.32,.125), (0,-1,0),32,'Вход ручного вентиля','Retained DN32 geometry')
    port('bottom_gate_out', (0,2.516,.125), (0,1,0),32,'Выход ручного вентиля','Retained DN32 geometry, 180 mm between flange centres plus two 8 mm half-flanges')
    port('bottom_auto_in', BCV_IN, (0,-1,0),32,'Вход BCV7432','ATECH STEP, bore R16, flange face')
    port('bottom_auto_out', BCV_OUT, (0,1,0),32,'Выход BCV7432','ATECH STEP, 175.5 mm between connection faces')
    port('bottom_bypass_in', (.62,2.46,.125), (0,-1,0),32,'Вход обходного вентиля','Retained DN32 geometry')
    port('bottom_bypass_out', (.62,2.656,.125), (0,1,0),32,'Выход обходного вентиля','Retained DN32 geometry')
    port('bottom_join', (0,3.10,.125), (0,1,0),32,'Сбор после двух ветвей','Layout')
    port('bottom_boundary', (2.90,3.10,.125), (1,0,0),32,'Граница нижней продувки без BDV','Layout',boundary=True)
    port('bdv_C', (3.1535,2.40,1.415), (-1,0,0),50,'C: основная продувка','BDV60/5 PDF C',{'bdv':True})
    port('bdv_D', BDV_D, BDV_D_NORMAL,25,'D: продувка по солесодержанию / вода после FV','BDV60/5 PDF D',{'bdv':True})
    port('bdv_A', (3.65,2.40,1.995), (0,0,1),150,'A: вентиляция','BDV60/5 PDF A',{'bdv':True})
    port('bdv_B', (4.1465,2.40,1.165), (1,0,0),100,'B: слив воды','BDV60/5 PDF B',{'bdv':True})
    port('bdv_K', (3.65,2.40,.34), (0,0,-1),50,'K: дренаж','Existing BDV mesh',{'bdv':True})
    port('bdv_F', (3.65+.4965/sqrt(2),2.4-.4965/sqrt(2),.90), (1/sqrt(2),-1/sqrt(2),0),25,'F: охлаждающая вода','BDV60/5 PDF F; threaded fitting simplified in retained mesh',{'bdv':True})
    port('tds_out', TDS_OUT, (0,0,-1),20,'Выход BCV925','ATECH STEP analytic connection face')
    port('tds_boundary', TDS_BOUNDARY, (0,1,0),20,'Граница непрерывной продувки','Layout')
    port('tds_external', (2.70,2.95,.92), (1,0,0),20,'Внешняя система непрерывной продувки','Layout',boundary=True)
    port('fv_N', (3.378,3.65,FV_LIFT+.920), (-1,0,0),80,'N: непрерывная продувка','FV8 PDF N: 520 above drain, drain 400 above base',{'fv':True})
    port('fv_O', (3.65,3.65,FV_LIFT+1.530), (0,0,1),50,'O: вторичный пар','FV8 PDF O: 1130 above drain',{'fv':True})
    port('fv_P', (3.65,3.897,FV_LIFT+.695), (0,1,0),50,'P: конденсат','FV8 PDF P: 295 above drain',{'fv':True})
    port('fv_S', (3.65,3.65,FV_LIFT+.400), (0,0,-1),15,'S: дренаж','FV8 PDF datum: 400 above base',{'fv':True})
    port('flash_boundary', (-2.20,2.95,3.32), (-1,0,0),50,'Подвод вторичного пара к деаэратору','Layout',{'fv':True},True)
    port('da_flash_in', DA_STEAM, (0,0,1),50,'Возврат вторичного пара в бак ДА-15','DA-15 STEP solids 25/26, source (0,808,-975)',{'deaerator':True,'fv':True})
    port('trap_in', TRAP_IN, (-1,0,0),50,'До отсутствующего конденсатоотводчика','Deliberate unconnected interface',{'fv':True},True)
    port('trap_out', TRAP_OUT, (1,0,0),50,'После отсутствующего конденсатоотводчика','Deliberate unconnected interface',{'fv':True,'bdv':True},True)
    port('bdv_vent_boundary', (3.65,2.40,3.85), (0,0,1),150,'Продолжить вентиляцию наружу','External plant boundary',{'bdv':True},True)
    port('bdv_drain_boundary', (4.65,2.40,.20), (1,0,0),100,'Слив в наружную систему охлаждённых стоков','External plant boundary',{'bdv':True},True)
    port('bdv_cooling_boundary', (4.60,1.60,.90), (1,0,0),25,'Подключение отсутствующего узла охлаждения','Missing cooling control package',{'bdv':True},True)
    port('bdv_drain_valve_gap', (3.65,2.40,.20), (0,0,-1),50,'Место дренажного вентиля BDV','Missing valve; no automatic connection to sewer',{'bdv':True},True)
    port('fv_drain_valve_gap', (3.65,3.65,FV_LIFT+.25), (0,0,-1),15,'Место дренажного вентиля FV','Missing valve; no automatic connection to sewer',{'fv':True},True)

    route('bottom_piping','Периодическая продувка: от котла к разделению ветвей','boiler_bottom','bottom_split')
    route('bottom_before_gate','Основная ветвь: к ручному вентилю','bottom_split','bottom_gate_in')
    route('bottom_before_auto','Основная ветвь: вентиль → BCV7432','bottom_gate_out','bottom_auto_in')
    route('bottom_after_auto','Основная ветвь: после BCV7432','bottom_auto_out','bottom_join')
    route('bottom_bypass_before','Ручная обходная ветвь','bottom_split','bottom_bypass_in',[(.62,2.20,.125)])
    route('bottom_bypass_after','Ручная обходная ветвь: возврат','bottom_bypass_out','bottom_join',[(.62,3.10,.125)])
    route('bottom_discharge','Общая нижняя продувка','bottom_join','bottom_boundary')
    route('bottom_to_bdv','Нижняя продувка → вход C BDV60/5','bottom_boundary','bdv_C',[(2.90,2.40,.125),(2.90,2.40,1.415)],when={'bdv':True},end_dn=50)
    route('tds_common','BCV925 → линия непрерывной продувки','tds_out','tds_boundary',
          [(TDS_OUT[0],TDS_OUT[1],1.15),(1.56,-1.39,1.15),(1.56,-1.10,1.15),(1.56,-1.10,.94)],dn=20)
    route('tds_to_fv','Непрерывная продувка → N FV8','tds_boundary','fv_N',
          [(1.56,3.65,.92),(1.56,3.65,FV_LIFT+.920),(3.10,3.65,FV_LIFT+.920)],dn=20,when={'fv':True},end_dn=80)
    near_d = tuple(BDV_D[i]+BDV_D_NORMAL[i]*.25 for i in range(3))
    route('tds_without_fv','Без FV8: непрерывная продувка → D BDV','tds_boundary','bdv_D',
          [(2.60,2.95,.92),(2.60,3.12,1.605),near_d],dn=20,when={'fv':False,'bdv':True},end_dn=25)
    route('tds_without_vessels','Без сепараторов: граница непрерывной продувки','tds_boundary','tds_external',dn=20,when={'fv':False,'bdv':False})
    route('flash_steam_common','O FV8 → возврат вторичного пара','fv_O','flash_boundary',
          [(3.65,3.65,3.20),(3.65,2.95,3.23)],dn=50,when={'fv':True},mat='steel',system='flash_steam',start_dn=50)
    if da_connected:
        route('flash_steam_to_da','Вторичный пар → верхний DN50 ДА-15','flash_boundary','da_flash_in',
              [(-3.65,2.95,3.35),(-3.65,.975,3.39)],dn=50,when={'fv':True,'deaerator':True},mat='steel',system='flash_steam',end_dn=50)
    route('fv_to_trap_gap','Конденсат FV8 → место конденсатоотводчика','fv_P','trap_in',
          [(3.65,4.16,1.87)],dn=50,when={'fv':True},mat='steel',system='condensate',start_dn=50)
    route('trap_gap_to_bdv','После конденсатоотводчика → D BDV','trap_out','bdv_D',
          [(2.60,4.16,1.85),(2.60,3.40,1.70),near_d],dn=25,when={'fv':True,'bdv':True},mat='steel',system='condensate',start_dn=50,end_dn=25)
    route('bdv_vent','Вентиляция A BDV: граница отвода наружу','bdv_A','bdv_vent_boundary',dn=150,when={'bdv':True},start_dn=150,system='vent')
    route('bdv_water_drain','Слив B BDV → граница системы стоков','bdv_B','bdv_drain_boundary',
          [(4.45,2.40,1.165),(4.45,2.40,.20)],dn=100,when={'bdv':True},start_dn=100,system='drain')
    fn=ports['bdv_F']['normal'];fp=ports['bdv_F']['position_m']
    route('bdv_cooling_stub','F BDV → место узла охлаждения','bdv_cooling_boundary','bdv_F',
          [tuple(fp[i]+fn[i]*.24 for i in range(3))],dn=25,when={'bdv':True},mat='green',system='cooling',end_dn=25)
    route('bdv_bottom_drain_stub','K BDV: подвод до дренажного вентиля','bdv_K','bdv_drain_valve_gap',dn=50,when={'bdv':True},system='drain')
    route('fv_bottom_drain_stub','S FV8: подвод до дренажного вентиля','fv_S','fv_drain_valve_gap',dn=15,when={'fv':True},system='drain',start_dn=15)
    for i,y in enumerate([.66,.96],1):
        port(f'safety_{i}_out',(-.169,y,2.389),(-1,0,0),65,'Выход существующего предохранительного клапана','Retained source valve outlet')
        port(f'safety_{i}_boundary',(-.55,y,3.65),(0,0,1),65,'Отдельный отвод наружу','External boundary; final height is project-specific',boundary=True)
        route(f'safety_vent_{i}',f'Предохранительный клапан №{i}: отдельный отвод',f'safety_{i}_out',f'safety_{i}_boundary',
              [(-.55,y,2.389)],dn=65,mat='steel',system='safety_discharge',start_dn=65)
    return ports, routes


MISSING = [
    dict(id='condensate_trap', label='Конденсатоотводчик после FV8',
         interfaces=['trap_in','trap_out'], added=False,
         note='Разрыв 320 мм обозначает место отсутствующего узла. Сквозная труба вместо него не установлена.'),
    dict(id='bdv_cooling_control', label='Узел регулирования охлаждения BDV',
         interfaces=['bdv_cooling_boundary'], added=False,
         note='Показан подвод к F. Регулятор, фильтр и арматура из более богатой комплектации не добавлены.'),
    dict(id='fv_safety', label='Предохранительный клапан FV8 на T DN25', interfaces=[], added=False),
    dict(id='vessel_instruments', label='Приборы на M FV8 и G/L BDV', interfaces=[], added=False),
    dict(id='vessel_drains', label='Дренажные вентили S FV8 и K BDV',
         interfaces=['fv_drain_valve_gap','bdv_drain_valve_gap'], added=False),
    dict(id='plant_extras', label='Охладитель выпара, ХВО, БТП и общезаводские коллекторы', interfaces=[], added=False),
]
