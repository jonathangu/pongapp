"""Offscreen Blender QA renders of the original articulated library. No user scene touched."""
import bpy,math,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else ROOT/'art/renders'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'apps/web/public/art/tiny-worlds.glb'))
library={o.name:o for o in list(bpy.data.objects) if o.type=='MESH'}
for o in library.values():o.hide_render=True;o.hide_viewport=True
copies=[]
def part(name,loc=(0,0,0),scale=(1,1,1),rot=(0,0,0)):
    o=library[name].copy();o.data=library[name].data;bpy.context.collection.objects.link(o)
    o.hide_render=False;o.hide_viewport=False;o.location=loc;o.scale=scale;o.rotation_euler=rot;copies.append(o)
    return o
def crew(x,y):
    part('crew_body',(x,.49,y))
    part('crew_head',(x,1.56,y))
    for side in [-1,1]:part('crew_arm',(x+side*.27,1.32,y));part('crew_boot',(x+side*.13,.82,y))
# Imported glTF keeps a Y-up basis in mesh coordinates; rotate complete scene for Blender Z-up.
def scene(name):
    if name=='ark':
        part('ark_hull');part('ark_controls');part('ark_cannon',(0,1.06,-2.32));part('ark_engine',(0,.95,2.42))
        crew(-1.5,0);crew(.18,-1.85)
    elif name=='crab':
        part('beast_crab')
        for side in [-1,1]:
            for j in range(4):part('crab_leg',(side*.64,.5,(j-1.5)*.3),(side,1,1))
            part('crab_claw',(side*.55,.58,-.49),(side,1,1))
    elif name=='manta':
        part('beast_manta')
        for side in [-1,1]:part('manta_wing',(side*.27,.44,0),(side,1,1),(0,0,side*.2))
    elif name=='jelly':
        part('beast_jelly')
        for j in range(8):
            a=j/8*math.tau;part('jelly_tentacle',(math.cos(a)*.56,.61,math.sin(a)*.56))
    else:
        part('beast_wyrm')
        for j in range(7):
            x=math.sin(j*.6)*.24;scale=1-j*.085;z=.5+j*.45-j*j*.018;part('wyrm_segment',(x,0,z),(scale,scale,scale))
            if j%2==0:
                for side in [-1,1]:part('wyrm_fin',(x+side*.25*scale,.48*scale,z),(side*scale,scale,scale))
    parent=bpy.data.objects.new('Assembly',None);bpy.context.collection.objects.link(parent)
    for o in copies:o.parent=parent
    # GLTF importer already converts mesh basis; assembly coordinate conversion is below.
    return parent

# Convert desired glTF coordinates back into Blender coordinates for each copied object.
def convert():
    for o in copies:
        x,y,z=o.location;o.location=(x,-z,y)
        sx,sy,sz=o.scale;o.scale=(sx,sz,sy)
        rx,ry,rz=o.rotation_euler;o.rotation_euler=(rx,-rz,ry)

scene_data=bpy.context.scene;scene_data.render.engine='CYCLES';scene_data.cycles.samples=32
scene_data.render.resolution_x=1100;scene_data.render.resolution_y=1000;scene_data.render.resolution_percentage=100
scene_data.world.color=(.22,.27,.3)
scene_data.view_settings.view_transform='AgX'
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.55));plane=bpy.context.object
mat=bpy.data.materials.new('Backdrop');mat.diffuse_color=(.10,.19,.23,1);plane.data.materials.append(mat)
for loc,power,size in [((2,4,9),1700,7),((-5,0,5),1100,5),((0,-5,7),1300,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(8,11,14));camera=bpy.context.object;camera.data.type='ORTHO';scene_data.camera=camera
for name in ['ark','crab','manta','jelly','wyrm']:
    copies=[];assembly=scene(name);convert()
    camera.data.ortho_scale=8 if name=='ark' else 5.8 if name=='wyrm' else 4.7
    target=Vector((0,-1 if name=='wyrm' else 0,.5));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene_data.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.objects.remove(assembly,do_unlink=True)
