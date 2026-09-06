"""Four-room Ark and articulated bestiary, translated from art/concepts/*.png.

Executed inside build_worlds.py. Blender +Y is forward; all part pivots are origin.
No baked crew in the hull: runtime animates independent bodies, boots and arms.
"""
CORAL='#e78676'
BLUE='#627fa5'
VIOLET='#76679d'
GLOW='#a5eee1'

# Four rounded lobes connected by an unobstructed crossing. Low gunwales only.
orb((0,0,-.04),(2.65,3.1,.55),TEAL,24,10)
box((0,0,.27),(2.1,5.5,.25),IVORY,.22)
box((0,0,.28),(5.35,2.1,.25),IVORY,.22)
for x,y,c in [(-1.7,0,TEAL),(1.7,0,BLUE),(0,1.85,GOLD),(0,-1.85,CORAL)]:
    box((x,y,.42),(1.55,1.55,.08),c,.15)
    for j in range(5):box((x-.6+j*.3,y,.465),(.018,1.35,.012),IVORY,.0)
    torus((x,y,.475),.44,.024,GOLD)
    if x:
        box((x+(1 if x>0 else -1)*.68,y,.66),(.16,1.6,.45),IVORY,.055)
        box((x+(1 if x>0 else -1)*.73,y,.91),(.11,1.6,.06),GOLD,.025)
    else:
        for side in [-1,1]:box((side*.77,y,.64),(.11,1.5,.4),IVORY,.035)
        box((0,y+(1 if y>0 else -1)*.7,.6),(1.5,.15,.34),IVORY,.05)
for x in [-1.08,1.08]:
    rod((x,-2.85,-.05),(x,-1.3,-.05),.29,GOLD,12)
    orb((x,-2.88,-.05),(.23,.08,.23),GLOW)
for x,y in [(-1.05,1.05),(1.05,1.05),(-1.05,-1.05),(1.05,-1.05)]:
    cone((x,y,.59),.14,.1,.26,GOLD)
    orb((x,y,.79),(.12,.12,.14),GLOW)
box((0,0,.44),(1.26,1.26,.06),DARK,.08)
for x in [-.46,.46]:box((x,0,.48),(.025,1.15,.02),GOLD,0)
asset('ark_hull')

# Helm controls sit outside the room's standing circle, preserving clear crew sightlines.
for x in [-2.22,2.22]:
    cone((x,0,.78),.2,.14,.6,DARK)
    torus((x,0,1.14),.29,.045,GOLD,(math.pi/2,0,0))
    for j in range(6):
        a=j*math.tau/6;rod((x,0,1.14),(x+math.cos(a)*.34,0,1.14+math.sin(a)*.34),.027,IVORY,6)
box((0,-2.38,.76),(1.0,.42,.53),DARK,.1)
for x in [-.3,0,.3]:orb((x,-2.12,.86),(.065,.035,.065),GLOW)
cone((0,2.32,.74),.45,.37,.52,DARK,16)
torus((0,2.32,1.0),.36,.05,GOLD)
asset('ark_controls')
rod((0,0,0),(0,1.14,0),.2,GOLD,16)
rod((0,.83,0),(0,1.17,0),.24,DARK,16)
torus((0,1.19,0),.2,.05,GLOW,(math.pi/2,0,0))
box((0,.25,0),(.6,.65,.33),TEAL,.12)
asset('ark_cannon')
for j in range(4):
    a=j*math.tau/4;box((math.cos(a)*.31,math.sin(a)*.31,0),(.24,.52,.05),TEAL,.06,a)
orb((0,0,0),(.17,.17,.13),GOLD);asset('ark_engine')

# Crew suits use white paint tinted at runtime, contrasting gold backpacks and dark visors.
orb((0,0,.69),(.23,.19,.29),'#ffffff')
box((0,-.2,.69),(.3,.17,.37),GOLD,.065)
box((0,.174,.73),(.21,.04,.16),IVORY,.025)
asset('crew_body')
orb((0,0,0),(.29,.27,.28),'#ffffff',16,10)
orb((0,.21,.015),(.235,.1,.13),DARK,16,8)
box((-.075,.295,.04),(.13,.018,.035),GLOW,.012)
box((0,-.02,.275),(.05,.36,.025),IVORY,.012)
asset('crew_head')
rod((0,0,0),(0,0,-.29),.08,'#ffffff',8)
orb((0,0,-.31),(.095,.09,.095),GOLD);asset('crew_arm')
rod((0,0,0),(0,0,-.25),.095,DARK,8)
box((0,.075,-.27),(.2,.32,.15),IVORY,.06);asset('crew_boot')

# Bastion crab: layered shell, four jointed legs per side and oversized hammer claws.
orb((0,0,.5),(.82,.72,.55),TEAL,16,10)
orb((0,-.1,.71),(.71,.6,.41),IVORY,16,8)
for j in [-1,0,1]:rod((j*.24,-.5,.86),(j*.24,.4,.97),.065,GOLD)
for x in [-.32,.32]:
    rod((x,.48,.5),(x,.73,.81),.065,DARK)
    orb((x,.74,.82),(.13,.13,.12),GLOW)
asset('beast_crab')
rod((0,0,0),(.38,.1,-.17),.1,TEAL)
rod((.38,.1,-.17),(.68,.15,-.45),.065,GOLD)
asset('crab_leg')
rod((0,0,0),(.3,.35,0),.13,TEAL)
box((.37,.65,.08),(.55,.65,.4),GOLD,.14)
box((.37,.76,.13),(.4,.4,.35),IVORY,.1)
asset('crab_claw')

# Lantern manta: broad swept wings, luminous lure, forked flowing tail.
orb((0,0,.43),(.4,.95,.28),VIOLET,16,8)
orb((0,.57,.49),(.31,.25,.19),IVORY)
for x in [-.21,.21]:orb((x,.75,.52),(.075,.06,.07),GLOW)
rod((0,.62,.59),(0,.86,1.1),.035,GOLD)
rod((0,.86,1.1),(0,1.13,.99),.035,GOLD)
orb((0,1.13,.93),(.12,.12,.16),GLOW)
for x in [-.14,.14]:rod((x,-.65,.4),(x*2,-1.6,.3),.055,GOLD)
asset('beast_manta')
mesh([(0,.5,0),(.75,.85,.09),(1.72,-.28,-.12),(.95,-.58,-.08),(0,-.5,0),(.5,.05,.19)],[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],VIOLET)
rod((0,.5,0),(.75,.85,.09),.045,GOLD);rod((.75,.85,.09),(1.72,-.28,-.12),.035,GLOW)
for j in range(3):rod((.18,-.35+j*.27,.08),(1.15,-.35+j*.12,-.06),.018,GOLD,6)
asset('manta_wing')

# Crown jelly: an opaline bell, crown prongs and long independently waving tentacles.
orb((0,0,.85),(.81,.81,.56),VIOLET,20,10)
torus((0,0,.62),.75,.08,GOLD)
orb((0,0,.6),(.49,.49,.43),GLOW,16,8)
for j in range(7):
    a=j*math.tau/7;cone((math.cos(a)*.55,math.sin(a)*.55,1.39),.13,0,.56,GOLD,6)
asset('beast_jelly')
for j in range(4):rod((math.sin(j*.7)*.1,0,-j*.24),(math.sin((j+1)*.7)*.1,0,-(j+1)*.24),.07-j*.012,GLOW,7)
orb((.09,0,-1.04),(.07,.07,.09),GOLD);asset('jelly_tentacle')

# Stormwyrm: horned skull, individually undulating armor segments and swept fins.
orb((0,.18,.55),(.46,.68,.37),BLUE,16,8)
box((0,.67,.47),(.53,.47,.25),IVORY,.12)
for x in [-.26,.26]:
    orb((x,.57,.7),(.1,.09,.085),GLOW)
    rod((x,-.12,.76),(x*1.8,-.5,1.1),.075,GOLD)
asset('beast_wyrm')
orb((0,0,.48),(.4,.42,.31),BLUE,12,8)
torus((0,0,.48),.31,.045,GOLD,(math.pi/2,0,0))
cone((0,0,.87),.12,0,.38,IVORY,5)
asset('wyrm_segment')
mesh([(0,0,0),(.6,-.5,.2),(.8,-.85,-.05),(.15,-.48,-.06)],[(0,1,2,3)],TEAL)
rod((0,0,0),(.6,-.5,.2),.03,GOLD,6);asset('wyrm_fin')
