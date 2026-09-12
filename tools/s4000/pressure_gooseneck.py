"""Open gooseneck for the boiler, preserving its installed ports and instruments."""
import math

TAKEOFF = (.948531, -.99, 1.925)
HEADER = (1.42, -.99, 2.85)
INSTRUMENTS = ['pressure_switch_1', 'pressure_switch_2', 'pressure_transmitter',
               'pressure_gauge', 'instrument_valve']


def centerline():
    # The DA-15 reference supplies the open arch form. Its absolute installation
    # dimensions and DN32 are not imposed on the existing boiler's DN20 takeoff.
    # Keep both boiler endpoints and every instrument position unchanged.
    x, y, _ = TAKEOFF
    h = HEADER[2] + .105
    points = [TAKEOFF, (x, y, 2.04), (x, y, h)]
    for i in range(1, 65):
        angle = math.pi - i*math.pi/64
        points.append((x+.125+.125*math.cos(angle), y, h+.125*math.sin(angle)))
    for i in range(1, 33):
        angle = math.pi + i*math.pi/2/32
        points.append((x+.355+.105*math.cos(angle), y, h+.105*math.sin(angle)))
    points.append(HEADER)
    return points


def header(g):
    g.pipe(centerline(), .013, 'dark', 0, 48)
    g.flange((.948531,-.99,1.936), (0,0,1), 20, 'dark')
    g.pipe([(1.42,-1.64,2.85),(1.42,-.45,2.85)], .019, 'dark')
    g.cyl((1.42,-1.644,2.85),(1.42,-1.64,2.85),.019,'dark',48)


def old_pressure_cables(g):
    """Exact old prefix used to identify only the three affected cable meshes."""
    for j,y in enumerate([-1.52,-1.28,-1.04]):
        x=1.030+j*.009
        start=(1.469,y,2.995) if j<2 else (1.441,y,3.024)
        pts=[start,(1.458+j*.009,y,2.879),(1.458+j*.009,-.99,2.879),
             (1.458+j*.009,-.99,2.07+j*.009),(x,-.99,2.07+j*.009),(x,-1.10,2.07+j*.009),(x,-1.10,.30),
             (x,-2.18,.30),(x,-2.18,.105),(-1.045,-2.18,.105),(-1.045,-2.18,.30),
             (-1.045,-1.22,.30),(-1.17+j*.009,-1.22,.30),(-1.17+j*.009,-1.22,1.225)]
        g.pipe(pts,.006,'black',.035,16)


def pressure_cables(g):
    paths=[]
    main=centerline()
    for j,y in enumerate([-1.52,-1.28,-1.04]):
        x=1.030+j*.009; lane=-.99-.036-j*.014
        start=(1.469,y,2.995) if j<2 else (1.441,y,3.024)
        follows=[(p[0],lane,p[2]+.002*j) for p in reversed(main)]
        pts=[start,(1.458+j*.009,y,2.879),(1.458+j*.009,lane,2.879),*follows,
             (x,lane,1.925+j*.002),(x,-1.10,1.925+j*.002),(x,-1.10,.30),
             (x,-2.18,.30),(x,-2.18,.105),(-1.045,-2.18,.105),(-1.045,-2.18,.30),
             (-1.045,-1.22,.30),(-1.17+j*.009,-1.22,.30),(-1.17+j*.009,-1.22,1.225)]
        g.pipe(pts,.006,'black',.012,16); paths.append(pts)
    # Saddles tie the three parallel leads to the actual pipe, including its arch.
    anchors=[(.948531,-.99,z) for z in [2.02,2.23,2.48,2.72,2.91]]
    anchors += [main[i] for i in [16,32,48,65,82,96]]
    for p in anchors:
        g.cyl((p[0],p[1]-.010,p[2]),(p[0],p[1]-.074,p[2]),.003,'steel',12)
        for j in range(3):
            lane=-.99-.036-j*.014
            g.ring((p[0],lane,p[2]+j*.002),(0,0,1),.0068,.001,'steel',12)
    return paths
