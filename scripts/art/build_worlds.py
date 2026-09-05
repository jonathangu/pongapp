"""Original beveled miniature assets. Blender +Y forward exports as glTF -Z.

Each named asset is one vertex-painted mesh / one material / one draw call.
Scenery instances share these meshes. All randomness is reproducible.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/art"
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
assets = []
parts = []
IVORY = '#fff0ce'
TEAL = '#21aaa6'
GOLD = '#dca94e'
DARK = '#203342'
ORANGE = '#ed8f44'

def rgb(hex):
    v = [int(hex[i:i+2], 16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in v)

def finish(obj, color, smooth=False):
    obj['paint'] = color
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
    parts.append(obj)
    return obj

def box(loc, size, color, bevel=.07, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Hand-rounded edges', 'BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted toy normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.rotation_euler.z=rot
    return finish(obj,color)

def orb(loc, size, color, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj=bpy.context.object;obj.scale=size
    return finish(obj,color,True)

def rock(loc,size,color,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc)
    obj=bpy.context.object;obj.scale=size
    return finish(obj,color)

def cone(loc, r1, r2, depth, color, vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
    return finish(bpy.context.object,color)

def rod(a,b,r,color,vertices=10):
    mid=(Vector(a)+Vector(b))*.5
    obj=cone(mid,r,r,(Vector(b)-Vector(a)).length,color,vertices)
    obj.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler()
    return obj

def mesh(verts,faces,color):
    data=bpy.data.meshes.new('Sculpt');data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new('Sculpt',data);bpy.context.collection.objects.link(obj)
    return finish(obj,color)

def torus(loc,major,minor,color,rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=20,minor_segments=6,location=loc,major_radius=major,minor_radius=minor,rotation=rot)
    return finish(bpy.context.object,color,True)

def asset(name):
    global parts
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        colors=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        c=rgb(obj['paint'])
        for poly in obj.data.polygons:
            # Subtle face shading retains tiny details without extra textures/materials.
            shade=.88+.12*max(0,poly.normal.z)
            for li in poly.loop_indices: colors.data[li].color=(*[v*shade for v in c],1)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    obj=bpy.context.object;obj.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.data.materials.clear();obj.data.materials.append(paint)
    # All primitives have UVs; sculpted surfaces receive a modest planar projection.
    if not obj.data.uv_layers: obj.data.uv_layers.new(name='UVMap')
    uv=obj.data.uv_layers.active.data
    for poly in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        axes=[i for i in range(3) if i!=axis]
        for li in poly.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv[li].uv=(co[axes[0]]*.6,co[axes[1]]*.6)
    assets.append(obj);parts=[]

paint=bpy.data.materials.new('Shared hand-painted toy surface');paint.use_nodes=True
principled=paint.node_tree.nodes.get('Principled BSDF');principled.inputs['Roughness'].default_value=.7
color=paint.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
paint.node_tree.links.new(color.outputs['Color'],principled.inputs['Base Color'])

def crew():
    for x,col in [(-.36,TEAL),(.36,ORANGE)]:
        orb((x,-.25,.78),(.24,.23,.32),col)
        orb((x,-.23,1.17),(.28,.27,.28),col)
        box((x,-.005,1.18),(.39,.13,.13),DARK,.045)
        box((x,-.23,1.42),(.045,.38,.03),IVORY,.012)
        rod((x-.16,-.1,.87),(x-.17,.2,.82),.06,col)
        rod((x+.16,-.1,.87),(x+.17,.2,.82),.06,col)
        box((x,-.55,.85),(.26,.1,.28),GOLD,.03)

def deck():
    box((0,0,.42),(1.55,2.25,.3),IVORY,.16)
    box((0,-.1,.59),(1.22,1.45,.12),DARK,.08)
    for x in [-.68,.68]:
        box((x,0,.68),(.13,1.95,.24),TEAL,.05)
        box((x,.94,.73),(.18,.24,.16),GOLD,.05)
    box((0,.83,.7),(1.35,.25,.25),IVORY,.08)
    box((0,.9,.91),(.65,.16,.24),TEAL,.06)
    for x in [-.51,.51]: orb((x,1.025,.77),(.13,.05,.1),IVORY)
    crew()

# Boat: tapered, sculpted hull and gold rails; bow unmistakably forward.
orb((0,0,.23),(.91,1.57,.39),TEAL,16,10)
box((0,-1.1,.48),(1.4,.19,.32),GOLD,.06)
deck()
for side in [-1,1]:
    rod((side*.75,-.65,.5),(side*1.15,-1.15,.2),.035,GOLD)
    box((side*1.15,-1.14,.19),(.22,.52,.06),IVORY,.03,side*.3)
asset('boat')

# Monster truck: deep tires, individual tread blocks, front bumper and lamps.
box((0,0,.22),(1.5,2.3,.3),DARK,.09)
for x in [-.92,.92]:
    for y in [-.75,.75]:
        rod((x-.18,y,.3),(x+.18,y,.3),.43,DARK,16)
        rod((x-.195,y,.3),(x+.195,y,.3),.23,GOLD,12)
        for j in range(10):
            a=j*math.tau/10
            obj=box((x,y+math.sin(a)*.41,.3+math.cos(a)*.41),(.45,.2,.13),'#344349',.025)
            obj.rotation_euler.x=-a
deck()
box((0,1.22,.46),(1.95,.16,.18),GOLD,.06)
asset('truck')

# Spaceship has swept wings, engine pods, gold trim and luminous exhaust sockets.
orb((0,.08,.27),(.8,1.65,.32),IVORY,16,8)
for side in [-1,1]:
    mesh([(side*.5,.95,.4),(side*1.55,-.85,.12),(side*1.35,-1.22,.17),(side*.5,-.7,.55)],[(0,1,2),(0,2,3)],TEAL)
    rod((side*1.1,-1.1,.23),(side*1.1,-.45,.23),.26,GOLD)
    orb((side*1.1,-1.13,.23),(.19,.06,.19),'#78f2e4')
deck();asset('ship')

# Airship: longitudinal envelope high over the open gondola and four rigging lines.
deck()
for x in [-.7,.7]:
    for y in [-.75,.75]: rod((x,y,.65),(x*.85,y,1.9),.022,GOLD)
orb((0,.15,2.12),(.79,1.55,.65),IVORY,20,12)
for y in [-.9,.9]:
    # Brass transverse bands follow the envelope silhouette.
    obj=torus((0,y,2.12),.61,.035,GOLD,(math.pi/2,0,0));obj.scale.x=.93
box((0,.15,2.74),(.12,1.8,.04),TEAL,.02)
for side in [-1,1]:
    box((side*.88,-1.03,1.98),(.62,.6,.07),TEAL,.035,side*.4)
    rod((side*.83,-.6,.85),(side*.83,.05,.85),.23,GOLD)
asset('airship')

cone((0,0,.15),.21,.17,.3,TEAL,12)
rod((0,0,.25),(0,.73,.25),.12,GOLD)
rod((0,.7,.25),(0,.79,.25),.085,DARK)
torus((0,.56,.25),.13,.03,IVORY,(math.pi/2,0,0))
asset('turret')

# Crocodragon: chunky snout, eyes, individual teeth and back spines.
orb((0,0,.32),(.4,.8,.31),'#639354')
orb((0,.71,.27),(.33,.62,.19),'#8db86c')
box((0,.99,.19),(.54,.7,.12),'#e0cf8c',.05)
for x in [-.25,.25]:
    orb((x,.51,.52),(.13,.15,.13),'#7baa5d')
    orb((x,.62,.55),(.095,.055,.07),'#ffdf69')
    orb((x,.666,.55),(.032,.016,.05),DARK)
    for y in [.66,.87,1.09,1.28]: cone((x,y,.23),0,.045,.12,IVORY,5)
    for y in [-.42,.26]:
        orb((x*1.65,y,.12),(.25,.18,.12),'#65904e')
        for k in [-1,0,1]:cone((x*2+k*.045,y+.14,.12),.045,0,.08,IVORY,5)
for i in range(6):
    cone((0,-.65+i*.23,.61),.13,0,.25,'#c8d883',5)
for i in range(5):
    orb((math.sin(i*.55)*.15,-.75-i*.23,.25-i*.038),(.26-i*.04,.3-i*.035,.16-i*.025),'#5c8853')
asset('predator')

# A tiny duck rescue pod, with a readable orange beak.
orb((0,0,.26),(.28,.4,.23),'#ffda74')
orb((0,.28,.48),(.22,.23,.23),'#ffe59b')
box((0,.49,.44),(.26,.22,.065),ORANGE,.04)
for x in [-.14,.14]:orb((x,.43,.55),(.035,.035,.04),DARK)
orb((0,-.37,.3),(.12,.2,.12),IVORY)
asset('rescue')

# Collectibles, gates, and physical hazards.
verts=[(0,0,.22),(0,0,-.22)]
for i in range(10):
    a=i*math.tau/10;r=.5 if i%2==0 else .24
    verts.append((math.sin(a)*r,math.cos(a)*r,0))
mesh(verts,[(0,i+2,(i+1)%10+2) for i in range(10)]+[(1,(i+1)%10+2,i+2) for i in range(10)],'#ffe189');asset('star')
cone((0,0,.16),.27,0,.66,'#80e5d8',5)
cone((0,0,-.26),0,.27,.2,'#48aaa9',5);asset('crystal')
for x in [-.13,.13]:orb((x,0,.12),(.23,.15,.22),'#ff8d87')
mesh([(-.32,0,.06),(.32,0,.06),(0,0,-.32),(0,.13,.03),(0,-.13,.03)],[(0,1,3),(0,4,1),(0,3,2),(1,2,3),(0,2,4),(1,4,2)],'#ff8d87');asset('heart')
torus((0,0,.78),.8,.07,GOLD,(math.pi/2,0,0))
for x in [-.77,.77]:box((x,0,.13),(.25,.35,.3),TEAL,.06)
asset('gate')
rock((0,0,.2),(.57,.44,.54),'#8c9d99',2);asset('rock')
rod((-.7,0,.15),(.7,0,.15),.2,'#885f42')
rod((-.705,0,.15),(-.71,0,.15),.16,'#d7ae76')
rod((.705,0,.15),(.71,0,.15),.16,'#d7ae76')
asset('log')

# Organic island chunks; the renderer instantiates them along the route.
for name,top,base in [('jungle','#7da54d','#527260'),('mesa','#dea072','#a05f46'),('snow','#e4efed','#728ba7'),('garden','#9db66a','#ad8999'),('cosmic','#7964ae','#494a82')]:
    for j in range(3):
        rock((math.sin(j*2)*.35,math.cos(j*2)*.2,-.4-j*.27),(1.65-j*.23,1.5-j*.18,.65),base,2)
    rock((0,0,-.06),(1.62,1.45,.3),top,2)
    for j in range(7):
        a=j*math.tau/7
        rock((math.sin(a)*1.3,math.cos(a)*1.18,-.04),(.27,.28,.22),top)
    asset('island_'+name)

def palm_leaf(angle,z):
    verts=[]
    for i in range(5):
        r=i*.35;width=math.sin(i/4*math.pi)*.22
        for side in [-1,1]:
            verts.append((math.cos(angle)*r-math.sin(angle)*width*side,math.sin(angle)*r+math.cos(angle)*width*side,z+math.sin(i/4*math.pi)*.22-i*.1))
    mesh(verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(4)],'#419966' if angle%2>1 else '#8bbe6d')
for i in range(7):
    cone((math.sin(i*.13)*.18,0,.15+i*.31),.135-i*.008,.125-i*.008,.34,'#b69563',8)
for i in range(7):palm_leaf(i*math.tau/7,2.32)
for i in range(3):orb((math.sin(i*2)*.15,math.cos(i*2)*.15,2.21),(.14,.14,.16),'#d3a66b')
asset('palm')

rod((0,0,0),(0,0,2.2),.11,'#79594c')
for i in range(4):
    cone((0,0,.6+i*.43),.8-i*.14,.015,.95,'#3d7977',9)
    cone((0,0,.8+i*.43),.65-i*.12,.015,.68,'#e8f1e7',9)
asset('fir')

rod((0,0,0),(0,0,1.6),.19,'#79945d')
for side in [-1,1]:
    rod((0,0,.65),(side*.55,0,.65),.13,'#79945d')
    rod((side*.55,0,.65),(side*.55,0,1.16+side*.13),.13,'#91a46d')
    orb((side*.55,0,1.16+side*.13),(.13,.13,.13),'#91a46d')
orb((0,0,1.6),(.19,.19,.19),'#91a46d');asset('cactus')

rod((0,0,0),(.1,0,1.05),.13,'#887058')
for loc,size in [((0,0,1.35),(.75,.65,.55)),((.45,0,1.15),(.55,.48,.5)),((-.4,.1,1.12),(.5,.5,.45))]:
    rock(loc,size,'#91b264',2)
asset('garden_tree')

for j in range(3):
    obj=cone((j*.27-.27,0,.48-j*.08),.24,0,1.25-j*.2,['#a6efdd','#85b8e3','#c6a5ef'][j],5)
    obj.rotation_euler.y=(j-1)*.22
asset('crystal_cluster')

for j in range(5):
    orb(((j-2)*.43,math.sin(j)*.2,.2),(.6,.48,.32+j%2*.12),IVORY,12,6)
asset('cloud')

# Stacked temple roofs, stepped plinths, pillars and a dark inset doorway.
for i in range(4):box((0,0,i*.19),(2.05-i*.24,1.65-i*.2,.23),'#869274',.035)
box((0,.12,1.15),(1.15,.9,1.25),'#849a7f',.04)
box((0,-.36,.99),(.43,.06,.8),DARK,.025)
for x in [-.56,.56]:
    box((x,-.41,1.06),(.2,.23,1.1),'#cdc596',.035)
    box((x,-.41,1.57),(.29,.31,.15),GOLD,.025)
for i in range(3):box((0,0,1.7+i*.19),(1.65-i*.45,1.35-i*.32,.23),'#4d9589',.045)
cone((0,0,2.4),.19,0,.45,GOLD,4)
for i in range(5):box((0,-.95-i*.11,.45-i*.09),(.57,.25,.13),'#cdc596',.025)
asset('temple')

for name,base,cap in [('mesa','#b16b50','#e4ae7a'),('mountain','#829aad','#e9f2ed')]:
    if name=='mesa':
        for i in range(6):
            obj=cone((0,0,i*.44),(1.2-i*.1),(1.13-i*.1),.52,cap if i%3==0 else base,7)
            obj.rotation_euler.z=.17
    else:
        cone((0,0,1.9),1.75,.01,4,base,6)
        cone((0,0,3.35),.6,0,1.15,cap,6)
    asset(name)

for j in range(5):
    a=j*math.tau/5
    orb((math.cos(a)*.15,math.sin(a)*.15,.25),(.13,.13,.055),'#f5a39c',8,4)
orb((0,0,.29),(.095,.095,.065),'#ffe7a0',8,4)
rod((0,0,0),(0,0,.24),.03,'#649866');asset('flower')

# Export one compact library. Runtime chooses names, not the overlapping layout.
bpy.ops.object.select_all(action='DESELECT')
for obj in assets:obj.select_set(True)
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'tiny-worlds.glb'),export_format='GLB',use_selection=True,
                         export_apply=True,export_yup=True,export_normals=True,export_texcoords=True,
                         export_animations=False,export_materials='EXPORT')
manifest={'blender':bpy.app.version_string,'generator':'scripts/art/build_worlds.py','assets':[]}
for i,obj in enumerate(assets):
    obj.data.calc_loop_triangles()
    manifest['assets'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices)})
    obj.location=(i%6*4,i//6*5,0)
manifest['bytes']=(OUT/'tiny-worlds.glb').stat().st_size
(ROOT/'art/asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/tiny-worlds.blend'))
print(json.dumps(manifest))
