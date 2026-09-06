"""Original Starling prop library. Run with Blender --background --python this-file.
No downloaded meshes or textures. Exports a real copper galley and a harbor lantern.
"""
import bpy
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "apps/web/public/art/starling"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, metallic=0.0, roughness=0.4, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat

wood = material("Rosewood enamel", (.22, .075, .055), .15)
brass = material("Warm brushed brass", (.65, .39, .13), .72)
copper = material("Polished copper", (.63, .25, .10), .7)
cream = material("Ivory ceramic", (.83, .76, .55), .1)
dark = material("Cast iron", (.025, .04, .05), .55)
mint = material("Mint enamel", (.23, .62, .46), .22)
fire = material("Warm hearth", (1, .35, .045), .05, emission=2)

def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft crafted edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

def cube(name, location, scale, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)

def uv(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)

def cylinder(name, location, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=location)
    return finish(bpy.context.object, name, mat, .012)

def torus(name, location, radius, tube, mat, rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8, location=location, major_radius=radius, minor_radius=tube)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, mat)

cube("Galley cabinet", (0, 0, .26), (.98, .48, .48), wood)
cube("Brass countertop", (0, 0, .515), (1.08, .57, .08), brass)
cube("Ivory stove top", (0, 0, .562), (1.01, .5, .025), cream, .012)
for x in [-.25, .25]:
    cube("Cabinet door", (x, -.25, .26), (.43, .03, .35), mint, .025)
    uv("Drawer pull", (x + .12, -.28, .35), (.025, .024, .025), brass)
    torus("Burner", (x, 0, .59), .15, .023, dark)
    cylinder("Hearth glow", (x, 0, .585), .115, .02, fire)
for x in [-.40, .40]:
    for y in [-.17, .17]:
        cylinder("Brass feet", (x, y, .035), .037, .1, brass)
uv("Copper soup pot", (-.24, 0, .72), (.22, .20, .18), copper)
cylinder("Soup surface", (-.24, 0, .83), .17, .015, fire)
torus("Pot rim", (-.24, 0, .84), .188, .018, brass)
for x in [-.49, .01]:
    torus("Pot handle", (x, 0, .76), .062, .013, brass, (math.pi/2, 0, 0))
uv("Ivory kettle", (.25, 0, .72), (.15, .14, .17), cream)
cylinder("Kettle lid", (.25, 0, .875), .095, .025, brass)
uv("Kettle knob", (.25, 0, .903), (.029, .029, .029), dark)
torus("Kettle handle", (.25, .07, .84), .14, .023, dark, (math.pi/2, 0, 0))
spout = cylinder("Kettle spout", (.41, -.01, .77), .034, .22, brass)
spout.rotation_euler[1] = math.pi/3
cube("Hanging utensil rail", (0, .24, .96), (.88, .055, .055), brass, .02)
for x in [-.37, -.04, .29]:
    cylinder("Utensil", (x, .25, .85), .016, .21, brass)
    uv("Spoon bowl", (x, .25, .72), (.055, .025, .07), brass)
for mat in list(bpy.data.materials):
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mat]
    if len(objects) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = mat.name
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "galley.glb"), export_format="GLB", export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "art/starling/galley.blend"))
print("STARLING_MODEL: galley.glb / galley.blend")
