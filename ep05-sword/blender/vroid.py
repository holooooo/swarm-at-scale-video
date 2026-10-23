# EP05 · the two characters start from CC0 VRoid sample avatars (sources/raw/vroid/): face, hair and body skin.
# This script strips the modern clothes, turns them to face -Y (Blender) = +Z (three.js), scales them, lowers the
# T-pose arms to the 48-degree A-pose the robe is built around, renames the humanoid bones to the names rig.js uses,
# and measures the body so body.py can fit a hanfu over it. MToon colours ride along as glTF material extras.
import bpy, bmesh, json, math, os, struct
from mathutils import Vector, Matrix

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'sources', 'raw', 'vroid')
MODEL = {'heroine': ('Sendagaya_Shino.vrm', 1.38), 'rival': ('HairSample_Male.vrm', 1.38 * 1.08)}   # file, shoulder height
DROP = ('_Tops_', '_Bottoms_', '_Shoes_', '_AccessoryNeck_')        # modern clothes; the robe covers the body
DROP_K = {'heroine': ('_HAIR_02',)}                                 # Shino's X-shaped hair clip
ARM_DOWN = math.radians(48)                                          # arm angle from vertical in the rest pose

SIDE = {'L': 'L', 'R': 'R'}
NAMES = {'C_Hips': 'pelvis', 'C_Spine': 'spine', 'C_Chest': 'chest', 'C_UpperChest': 'upperchest', 'C_Neck': 'neck', 'C_Head': 'head'}
PER = {'Shoulder': 'clavicle', 'UpperArm': 'upperarm', 'LowerArm': 'forearm', 'Hand': 'hand', 'UpperLeg': 'thigh', 'LowerLeg': 'shin',
       'Foot': 'foot', 'ToeBase': 'toe', 'Index': 'index', 'Middle': 'middle', 'Ring': 'ring', 'Little': 'pinky', 'Thumb': 'thumb'}


def rename(n):
    """J_Bip_L_Index2 -> index2.L, J_Bip_C_Head -> head; anything else (hair, bust, eyes) keeps its name"""
    if not n.startswith('J_Bip_'): return n
    k = n[6:]; end = k.endswith('_end'); k = k[:-4] if end else k
    if k in NAMES: return NAMES[k] + ('_end' if end else '')
    s, part = k[0], k[2:]
    digit = part[-1] if part[-1].isdigit() else ''
    base = PER.get(part[:-1] if digit else part)
    return f'{base}{digit}{"_end" if end else ""}.{SIDE[s]}' if base else n


def vrm_json(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; return json.loads(b[20:20 + n])


def load(kind):
    """import + clean + pose; returns (armature, meshes dict, fit)"""
    fn, shoulder_h = MODEL[kind]; path = os.path.join(SRC, fn)
    mtoon = {p['name']: p for p in vrm_json(path)['extensions']['VRM']['materialProperties']}
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and not o.vertex_groups: bpy.data.objects.remove(o)        # the importer's bone-shape icosphere
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = kind + '_rig'
    meshes = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
    # 1. drop the clothes (faces by material), the shape keys (neutral face only) and normal maps
    for o in meshes.values():
        me = o.data
        if me.shape_keys: o.shape_key_clear()
        bm = bmesh.new(); bm.from_mesh(me)
        bad = {i for i, m in enumerate(me.materials) if m and any(d in m.name for d in DROP + DROP_K.get(kind, ()))}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in bad], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(me); bm.free()
        for i in sorted(bad, reverse=True): me.materials.pop(index=i)
    for m in bpy.data.materials:
        if not m.node_tree: continue
        for nd in list(m.node_tree.nodes):
            if nd.type == 'NORMAL_MAP': m.node_tree.nodes.remove(nd)
        p = mtoon.get(m.name)
        if p:                                                # MToon look for the three.js toon shader (material.userData)
            v, f = p['vectorProperties'], p['floatProperties']; kw = p.get('keywordMap', {})
            m['toon'] = 1; m['col'] = list(v.get('_Color', [1, 1, 1, 1])); m['shade'] = list(v.get('_ShadeColor', [1, 1, 1, 1]))
            m['shift'] = f.get('_ShadeShift', 0.0); m['queue'] = p.get('renderQueue', 2000); m['cull'] = f.get('_CullMode', 2)
            m['alpha'] = 'BLEND' if kw.get('_ALPHABLEND_ON') else 'MASK' if kw.get('_ALPHATEST_ON') else 'OPAQUE'
    for im in list(bpy.data.images):
        if im.users == 0 or im.name.startswith('Thumbnail'): bpy.data.images.remove(im); continue
        if im.size[0] > 1024 and 'Face' not in im.name: im.scale(1024, im.size[1] * 1024 // im.size[0])
    # 2. pose: turn round, scale to the shoulder height, arms down into the A-pose
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
    pb = arm.pose.bones
    sh0 = (arm.matrix_world @ pb['J_Bip_L_UpperArm'].head).z
    sc = shoulder_h / sh0
    pb['Root'].matrix = Matrix.Translation(pb['Root'].head) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Diagonal((sc, sc, sc, 1)) @ Matrix.Translation(-pb['Root'].head) @ pb['Root'].matrix
    bpy.context.view_layer.update()
    for s, sx in (('L', 1), ('R', -1)):
        want = Vector((sx * math.sin(ARM_DOWN), 0.03, -math.cos(ARM_DOWN))).normalized()
        for b, child in ((f'J_Bip_{s}_UpperArm', f'J_Bip_{s}_LowerArm'), (f'J_Bip_{s}_LowerArm', f'J_Bip_{s}_Hand')):
            h, c = pb[b].head.copy(), pb[child].head.copy()
            q = (c - h).normalized().rotation_difference(want)
            pb[b].matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb[b].matrix
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')
    # 3. bake the pose into the meshes, make it the rest pose, rename the humanoid bones
    for o in meshes.values():
        bpy.context.view_layer.objects.active = o
        md = next(m for m in o.modifiers if m.type == 'ARMATURE'); bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes.values():
        md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    for b in arm.data.bones: b.name = rename(b.name)                  # Blender renames the vertex groups too
    return arm, meshes, measure(arm, meshes)


TORSO = {'pelvis', 'spine', 'chest', 'upperchest', 'neck', 'clavicle.L', 'clavicle.R'}
LEGS = {f'{b}.{s}' for b in ('thigh', 'shin', 'foot', 'toe') for s in 'LR'}
NA = 48


def measure(arm, meshes):
    """bone heads + the body's radius profile r(z, angle) around the torso axis, from the body skin"""
    bones = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    bones.update({b.name + '>': arm.matrix_world @ b.tail_local for b in arm.data.bones})
    body = meshes.get('Body'); gid = {g.index: g.name for g in body.vertex_groups}
    pts = {'torso': [], 'legs': []}
    for v in body.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda g: g.weight); n = gid[g.group]
        key = 'torso' if n in TORSO or n.startswith('J_Sec_') else 'legs' if n in LEGS else None
        if key: pts[key].append(body.matrix_world @ v.co)
    DZ = 0.01; top = bones['head'].z
    prof = {k: [[0.0] * NA for _ in range(int(top / DZ) + 2)] for k in pts}
    cy = [0.0] * (int(top / DZ) + 2); cn = [0] * len(cy)
    for p in pts['torso']: k = int(p.z / DZ); cy[k] += p.y; cn[k] += 1
    cy = [cy[k] / cn[k] if cn[k] else None for k in range(len(cy))]
    for k in range(len(cy)):                                   # fill gaps with the nearest measured centre
        if cy[k] is None: cy[k] = next((cy[j] for d in range(1, len(cy)) for j in (k - d, k + d) if 0 <= j < len(cy) and cy[j] is not None), 0.0)
    for key, P in pts.items():
        for p in P:
            k = int(p.z / DZ); a = math.atan2(p.y - cy[k], p.x) % (2 * math.pi); j = int(a / (2 * math.pi) * NA) % NA
            r = math.hypot(p.x, p.y - cy[k]); prof[key][k][j] = max(prof[key][k][j], r)
    for key in prof:                                           # angular + vertical max filter: a loose envelope
        T = prof[key]
        T[:] = [[max(T[k][(j + d) % NA] for d in (-2, -1, 0, 1, 2)) for j in range(NA)] for k in range(len(T))]
        T[:] = [[max(T[q][j] for q in (k - 1, k, k + 1) if 0 <= q < len(T)) for j in range(NA)] for k in range(len(T))]
        for _ in range(2):                                     # then a blur, so cloth doesn't show every bump of the body
            T[:] = [[max(T[k][j] - 0.006, sum(T[q][j] for q in range(k - 3, k + 4) if 0 <= q < len(T)) / len([q for q in range(k - 3, k + 4) if 0 <= q < len(T)])) for j in range(NA)] for k in range(len(T))]
            T[:] = [[max(T[k][j], sum(T[k][(j + d) % NA] for d in range(-3, 4)) / 7) for j in range(NA)] for k in range(len(T))]
    hz = [o.matrix_world @ v.co for o in meshes.values() if 'Hair' in o.name for v in o.data.vertices]
    hb = {}                                                    # how far back the hair reaches, near the middle, per 2 cm
    for p in hz:
        if abs(p.x) < 0.07: k = int(p.z / DZ); hb[k] = max(hb.get(k, -1.0), p.y)
    def hair_back_at(z):
        ks = [k for k in hb if abs(k * DZ + DZ / 2 - z) < 0.03]
        return max((hb[k] for k in ks), default=max(hb.values(), default=0.1))
    face = meshes['Face']; fz = [face.matrix_world @ v.co for v in face.data.vertices]
    return dict(bones=bones, prof=prof, cy=cy, DZ=DZ, NA=NA, hair_back=max((p.y for p in hz if p.z < bones['neck'].z), default=0.1),
                hair_back_at=hair_back_at, hair_top=max((p.z for p in hz), default=bones['head'].z + 0.2),
                chin=min((p.z for p in fz if p.y < bones['head'].y - 0.03), default=1.46))


def body_r(fit, key, z, a):
    """envelope radius of the body at height z, angle a (0 = +X, pi/2 = +Y = behind)"""
    T, DZ, NA = fit['prof'][key], fit['DZ'], fit['NA']
    k = max(0, min(len(T) - 2, z / DZ - 0.5)); k0 = int(k); u = k - k0
    j = (a % (2 * math.pi)) / (2 * math.pi) * NA - 0.5; j0 = int(math.floor(j)); w = j - j0
    g = lambda kk, jj: T[kk][jj % NA]
    return (g(k0, j0) * (1 - w) + g(k0, j0 + 1) * w) * (1 - u) + (g(k0 + 1, j0) * (1 - w) + g(k0 + 1, j0 + 1) * w) * u


def centre_y(fit, z):
    cy, DZ = fit['cy'], fit['DZ']; k = max(0, min(len(cy) - 2, z / DZ - 0.5)); k0 = int(k); u = k - k0
    return cy[k0] * (1 - u) + cy[k0 + 1] * u


def flutter(o, fit, amount=1.0):
    """second UV map: (weight, phase) for the wind shader; hair below the crown moves, the rest doesn't"""
    me = o.data; layer = me.uv_layers.new(name='Flutter'); head = fit['bones']['head']
    hairy = [bool(m and 'HAIR' in m.name.upper()) for m in me.materials]
    for poly in me.polygons:
        for li in poly.loop_indices:
            p = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            w = 0.0
            if hairy[poly.material_index]:
                w = amount * max(0.0, min(1.0, (head.z + 0.06 - p.z) / 0.45)) ** 1.3 * (0.6 + 0.4 * max(0.0, min(1.0, (p.y - head.y) / 0.08 + 0.5)))
            layer.data[li].uv = (w, p.z * 5 + p.x * 3)
