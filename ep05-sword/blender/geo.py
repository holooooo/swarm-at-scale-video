# EP05 · mesh helpers for the Blender build script.
# Every part is built from rings of points. Each vertex carries bone weights, a UV, and a "flutter"
# pair (weight, phase) written to a second UV map: three.js reads it as uv1 and the cloth shader
# uses it for wind and gravity sag. Weights are rigid or blended between neighbouring bones.
import bpy, bmesh, math
from mathutils import Vector


def V(*a): return Vector(a)


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


class Part:
    """vertex / face soup for one character or prop; becomes a single mesh with material slots"""
    def __init__(self, name):
        self.name = name; self.co = []; self.w = []; self.uv = []; self.fl = []; self.faces = []; self.mats = []

    def mat_index(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)

    def vert(self, co, w, uv=(0, 0), fl=(0, 0)):
        self.co.append(Vector(co)); self.w.append(w); self.uv.append(uv); self.fl.append(fl); return len(self.co) - 1

    def face(self, idx, mat, smooth=True): self.faces.append((tuple(idx), self.mat_index(mat), smooth))

    def grid(self, rings, mat, w, fl=None, closed=True, cap0=False, cap1=False, keep=None, smooth=True):
        """quads between consecutive rings. w(i, j, co) -> {bone: weight}; fl(i, j, co) -> (weight, phase)"""
        m, n = len(rings), len(rings[0]); ids = []
        for i, r in enumerate(rings):
            ids.append([self.vert(p, w(i, j, p), (j / (n - (0 if closed else 1)), i / max(1, m - 1)), fl(i, j, p) if fl else (0, 0))
                        for j, p in enumerate(r)])
        for i in range(m - 1):
            for j in range(n if closed else n - 1):
                q = (ids[i][j], ids[i][(j + 1) % n], ids[i + 1][(j + 1) % n], ids[i + 1][j])
                if keep and not keep(sum((self.co[k] for k in q), Vector()) / 4): continue
                self.face(q, mat, smooth)
        for cap, i in ((cap0, 0), (cap1, m - 1)):
            if not cap: continue
            c = sum(rings[i], Vector()) / n
            k = self.vert(c, w(i, 0, c), (0.5, i / max(1, m - 1)), fl(i, 0, c) if fl else (0, 0))
            for j in range(n): self.face((k, ids[i][(j + 1) % n], ids[i][j]), mat, smooth)
        return ids


def ring(c, u, v, ru, rv, n, f=None):
    """ellipse around c in the (u, v) plane; f(angle) -> radius multiplier"""
    out = []
    for j in range(n):
        a = 2 * math.pi * j / n; k = f(a) if f else 1.0
        out.append(c + u * (math.cos(a) * ru * k) + v * (math.sin(a) * rv * k))
    return out


def tube(path, radius, n, up=V(0, 0, 1)):
    """rings along a polyline; radius(u) -> r or (ru, rv)"""
    rings, m = [], len(path)
    for i, p in enumerate(path):
        t = (path[min(m - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        u = t.cross(up)
        if u.length < 1e-4: u = t.cross(V(1, 0, 0))
        u.normalize(); v = t.cross(u)
        r = radius(i / max(1, m - 1)); ru, rv = r if isinstance(r, tuple) else (r, r)
        rings.append(ring(p, u, v, ru, rv, n))
    return rings


def ellipsoid(P, c, r, mat, w, n=12, m=8, fl=None):
    rings = []
    for k in range(1, m):
        a = math.pi * k / m; z = -math.cos(a); s = math.sin(a)
        rings.append(ring(c + V(0, 0, z * r[2]), V(1, 0, 0), V(0, 1, 0), r[0] * s, r[1] * s, n))
    return P.grid(rings, mat, lambda i, j, p: w, fl, cap0=True, cap1=True)


def strip(P, pts, normals, width, mat, w, fl=None):
    """flat ribbon through pts; its width lies across (tangent x normal)"""
    rings, m = [], len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(m - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        d = t.cross(normals[i]).normalized() * (width(i / (m - 1)) / 2)
        rings.append([p - d, p + d])
    return P.grid(rings, mat, w, fl, closed=False)


def catmull(pts, per=8):
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    return out + [pts[-1]]


def material(name, rgb, rough=0.6, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    b = next(nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    m.use_backface_culling = False
    return m


def build_mesh(P, mats, arm=None):
    me = bpy.data.meshes.new(P.name)
    me.from_pydata([tuple(c) for c in P.co], [], [f[0] for f in P.faces]); me.update()
    for poly, f in zip(me.polygons, P.faces): poly.material_index = f[1]; poly.use_smooth = f[2]
    for name, uvs in (('UVMap', P.uv), ('Flutter', P.fl)):
        layer = me.uv_layers.new(name=name)
        for lp in me.loops: layer.data[lp.index].uv = uvs[lp.vertex_index]
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(P.name, me); bpy.context.collection.objects.link(ob)
    for m in P.mats: me.materials.append(mats[m])
    if arm:
        groups = {}
        for vi, w in enumerate(P.w):
            tot = sum(w.values()) or 1.0
            for b, x in w.items():
                if x <= 1e-4: continue
                if b not in groups: groups[b] = ob.vertex_groups.new(name=b)
                groups[b].add([vi], x / tot, 'REPLACE')
        ob.parent = arm; md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return ob
