# EP05 · Blender build: model + rig + export GLB, and preview / making-of renders.
# usage: blender -b --factory-startup --python ep05-sword/blender/build.py -- [export] [preview] [turntable]
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, geo, vroid, body, props
for m in (geo, vroid, body, props): importlib.reload(m)
from geo import V, material, build_mesh

HERE = os.path.dirname(os.path.abspath(__file__))
EP = os.path.dirname(HERE); OUT = os.path.join(EP, 'models'); BUILD = os.path.join(os.path.dirname(EP), 'build', 'ep05-sword', 'blender')
os.makedirs(OUT, exist_ok=True); os.makedirs(BUILD, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['export', 'preview']


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mats_for(style):
    M = {}
    for k, rgb in style.items():
        M[k] = material(k, rgb, rough=0.25 if k == 'jade' else 0.55 if k in ('robe', 'trim') else 0.45 if k == 'skin' else 0.6,
                        alpha=0.55 if k == 'gauze' else 1.0)
    M.update({'sword': material('sword', (0.78, 0.82, 0.86), 0.25, 0.9), 'rock': material('rock', (0.2, 0.21, 0.22), 0.9),
              'bark': material('bark', (0.18, 0.13, 0.1), 0.9), 'pine': material('pine', (0.09, 0.2, 0.15), 0.8),
              'farrock': material('farrock', (0.3, 0.33, 0.38), 0.95)})
    return M


def export(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_skins=True,
                              export_animations=False, export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_morph=False, export_extras=True, export_image_format='AUTO')
    print('EXPORTED', name, sum(len(o.data.vertices) for o in objs if o.type == 'MESH'), 'verts')


def character(kind):
    """armature + [robe, VRoid body, face, hair]"""
    arm, P, style, meshes = body.build(kind)
    ob = build_mesh(P, mats_for(style), arm)
    return arm, [ob] + meshes


def is_humanoid(n): return not (n.startswith('J_') or n.startswith('Hair') or n == 'Root' or n.endswith('_end') or '_end.' in n)


def stage(cam_pos, look, lens=50, res=(800, 1000), bg=(0.42, 0.45, 0.5)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*bg, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    if 'cam' not in bpy.data.objects:
        c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(c); sc.camera = c
        for nm, rot, e in (('key', (math.radians(50), 0, math.radians(-35)), 3.2), ('rim', (math.radians(110), 0, math.radians(160)), 2.5)):
            L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); L.data.energy = e; L.rotation_euler = rot; sc.collection.objects.link(L)
    c = bpy.data.objects['cam']; c.data.lens = lens; c.location = cam_pos
    d = (V(*look) - V(*cam_pos)); c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def render(path):
    bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True); print('RENDERED', path)


if 'export' in ARGS or 'preview' in ARGS:
    for kind in ('heroine', 'rival'):
        clear(); arm, obs = character(kind)
        if 'export' in ARGS: export([arm] + obs, kind)
        if 'preview' in ARGS:
            for nm, cp, lk, lens in (('front', (0, -3.6, 1.0), (0, 0, 0.92), 50), ('side', (3.6, 0, 1.0), (0, 0, 0.92), 50),
                                     ('back', (-1.6, 3.3, 1.1), (0, 0, 0.92), 50), ('face', (0.35, -1.25, 1.62), (0, 0, 1.6), 85),
                                     ('hand', (-0.75, -0.75, 1.0), (-0.42, 0.02, 0.92), 85)):
                stage(cp, lk, lens); render(os.path.join(BUILD, f'{kind}_{nm}.png'))
    clear()
    M = mats_for(body.STYLE['heroine'])
    objs = [build_mesh(props.sword(), M)]
    if 'export' in ARGS: export(objs, 'sword')
    if 'preview' in ARGS:
        objs[0].rotation_euler = (0, math.radians(90), 0); stage((0, -1.6, 0.0), (0.38, 0, 0.0), 50, (1600, 600)); render(os.path.join(BUILD, 'sword.png'))
        objs[0].rotation_euler = (0, 0, 0)
    clear(); M = mats_for(body.STYLE['heroine'])
    peak = build_mesh(props.pinnacle(), M); far = build_mesh(props.far_peaks(), M)
    if 'export' in ARGS: export([peak, far], 'peaks')
    if 'preview' in ARGS:
        stage((6, -16, 4), (0, 0, -3), 35, (1600, 900)); render(os.path.join(BUILD, 'peaks.png'))

def set_alpha(m, a):
    """scale a material's alpha (the VRoid ones have their texture alpha wired in)"""
    nt = m.node_tree; b = next((nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
    if b is None: return
    inp = b.inputs['Alpha']
    if not inp.is_linked: inp.default_value = a; return
    mul = nt.nodes.get('xray_mul')
    if mul is None:
        src = inp.links[0].from_socket; mul = nt.nodes.new('ShaderNodeMath'); mul.name = 'xray_mul'; mul.operation = 'MULTIPLY'
        nt.links.new(src, mul.inputs[0]); nt.links.new(mul.outputs[0], inp)
    mul.inputs[1].default_value = a


# making-of: one turn of the rigged model, solid and x-ray with Blender-style octahedral bones
if 'turntable' in ARGS:
    clear(); arm, obs = character('heroine')
    import bmesh
    bmat = bpy.data.materials.new('bone'); bmat.use_nodes = True
    bs = next(nd for nd in bmat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (1, 0.5, 0.1, 1); bs.inputs['Emission Color'].default_value = (1, 0.45, 0.08, 1); bs.inputs['Emission Strength'].default_value = 2.5
    bones = []
    for b in arm.data.bones:
        if not is_humanoid(b.name): continue
        name, h, t = b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local
        d = t - h; L = d.length; ax = d.normalized(); u = ax.cross(V(0, 0, 1) if abs(ax.z) < 0.9 else V(1, 0, 0)).normalized(); w = ax.cross(u)
        r = 0.09 * L; m = h + d * 0.18
        vs = [h, m + u * r, m + w * r, m - u * r, m - w * r, t]
        fs = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1), (5, 2, 1), (5, 3, 2), (5, 4, 3), (5, 1, 4)]
        me = bpy.data.meshes.new('b_' + name); me.from_pydata([tuple(v) for v in vs], [], fs); me.materials.append(bmat)
        o = bpy.data.objects.new('b_' + name, me); bpy.context.collection.objects.link(o); bones.append(o)
    piv = bpy.data.objects.new('pivot', None); bpy.context.collection.objects.link(piv)
    for o in [arm] + bones: o.parent = piv
    stage((0, -4.1, 1.05), (0, 0, 0.9), 50, (640, 800), bg=(0.24, 0.24, 0.26))
    os.makedirs(os.path.join(BUILD, 'tt_solid'), exist_ok=True); os.makedirs(os.path.join(BUILD, 'tt_xray'), exist_ok=True)
    NF = int(os.environ.get('TT_FRAMES', '180'))
    for mode in ('solid', 'xray'):
        for o in bones: o.hide_render = mode == 'solid'
        for m in {m for o in obs for m in o.data.materials if m}:
            set_alpha(m, 0.22 if mode == 'xray' else (0.55 if m.name == 'gauze' else 1.0))
            try: m.surface_render_method = 'BLENDED' if mode == 'xray' or m.name == 'gauze' or m.get('alpha') == 'BLEND' else 'DITHERED'
            except Exception: pass
        for f in range(NF):
            piv.rotation_euler = (0, 0, 2 * math.pi * f / NF + math.radians(-25))
            bpy.context.scene.render.filepath = os.path.join(BUILD, f'tt_{mode}', f'f{f + 1:04d}.png'); bpy.ops.render.render(write_still=True)
        print('TURNTABLE', mode, NF)
