# EP05 · the white-robed swordswoman (and her rival): a CC0 VRoid avatar (face, hair, skin; see vroid.py)
# wearing a hanfu built here from code and fitted to the measured body.
# Blender axes: Z up, the character faces -Y, her left hand is +X (bones *.L).
# The robe is skinned to the VRoid humanoid bones by height (torso) and by distance along the arm (sleeves);
# the three.js shader adds wind, gravity sag and flutter from the "Flutter" UV map.
import bpy, math
from mathutils import Vector
from geo import V, Part, ring, tube, ellipsoid, strip, catmull, smooth01
import vroid

STYLE = {
    'heroine': dict(robe=(0.93, 0.94, 0.96), trim=(0.62, 0.78, 0.86), skin=(0.98, 0.86, 0.78), hair=(0.035, 0.035, 0.045),
                    gauze=(0.84, 0.92, 0.95), sash=(0.7, 0.86, 0.9), jade=(0.45, 0.8, 0.68), lip=(0.78, 0.38, 0.4), boot=(0.85, 0.87, 0.9)),
    'rival': dict(robe=(0.09, 0.085, 0.1), trim=(0.62, 0.08, 0.1), skin=(0.9, 0.78, 0.7), hair=(0.03, 0.03, 0.035),
                  gauze=(0.25, 0.05, 0.07), sash=(0.5, 0.06, 0.08), jade=(0.75, 0.6, 0.3), lip=(0.5, 0.3, 0.3), boot=(0.05, 0.05, 0.06)),
}
FRONT = -math.pi / 2
# the hand-designed silhouette (heroine units): the robe is never tighter than this, nor than the body + a margin
TOR = [(0.95, 0.13, 0.1), (1.04, 0.118, 0.088), (1.12, 0.122, 0.09), (1.22, 0.135, 0.1), (1.29, 0.142, 0.105),
       (1.34, 0.15, 0.098), (1.38, 0.162, 0.085), (1.41, 0.12, 0.07), (1.43, 0.055, 0.05)]
SK = [(1.06, 0.124, 0.094), (0.95, 0.15, 0.125), (0.8, 0.19, 0.165), (0.6, 0.23, 0.205), (0.4, 0.26, 0.235), (0.2, 0.29, 0.26), (0.04, 0.32, 0.29)]
GZ = [(1.42, 0.13, 0.08), (1.38, 0.172, 0.098), (1.3, 0.158, 0.118), (1.2, 0.148, 0.114), (1.08, 0.142, 0.108),
      (0.9, 0.18, 0.15), (0.6, 0.25, 0.225), (0.3, 0.31, 0.28), (0.08, 0.35, 0.33)]


def table(T, z):
    T = sorted(T); z = max(T[0][0], min(T[-1][0], z))
    for (z0, x0, y0), (z1, x1, y1) in zip(T, T[1:]):
        if z0 <= z <= z1: k = (z - z0) / (z1 - z0 + 1e-9); return x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    return T[-1][1], T[-1][2]


def ellipse_r(rx, ry, a): return rx * ry / math.hypot(ry * math.cos(a), rx * math.sin(a))


def hanfu(kind, fit):
    P = Part(kind + '_robe'); hero = kind == 'heroine'; B = fit['bones']
    s = 1.0 if hero else 1.08; sr = 1.0 if hero else 1.1          # rival: taller, broader
    zs = B['spine'].z; zn = B['neck'].z
    chain = [(n, B[n].z) for n in ('pelvis', 'spine', 'chest', 'upperchest', 'neck')]
    def w_z(z):
        if z <= chain[0][1]: return {'pelvis': 1.0}
        for (b0, z0), (b1, z1) in zip(chain, chain[1:]):
            if z <= z1: c = smooth01(z0, z1, z); return {b0: 1 - c, b1: c}
        return {'neck': 1.0}
    w_tor = lambda i, j, p: w_z(p.z)
    cy = lambda z: vroid.centre_y(fit, z)
    def r_robe(z, a):
        rx, ry = table(TOR, z / s)
        return max(ellipse_r(rx * s * sr, ry * s * sr, a), vroid.body_r(fit, 'torso', z, a) + 0.016)
    fold_amp = lambda z: 0.07 * max(0.0, 1.06 * s - z) / s + 0.03 * max(0.0, 1.06 * s - z) / s
    def r_skirt(z, a):
        rx, ry = table(SK, z / s); body = max(vroid.body_r(fit, 'legs', z, a), vroid.body_r(fit, 'torso', z, a))
        return max(ellipse_r(rx * s * sr, ry * s * sr, a), (body + 0.03) / (1 - fold_amp(z)))
    surf = lambda z, a, off=0.0: V(math.cos(a) * (r_robe(z, a) + off), cy(z) + math.sin(a) * (r_robe(z, a) + off), z)
    NR = 48; ang = [2 * math.pi * j / NR for j in range(NR)]
    # ---------------- inner robe: torso ----------------
    z_top = zn + 0.02; z_bot = 0.95 * s                    # closes round the neck; the rings follow the shoulder slope
    zl = [z_bot + (z_top - z_bot) * k / 17 for k in range(18)]
    P.grid([[surf(z, a) for a in ang] for z in zl], 'robe', w_tor)
    # crossed collar, right over left as worn (the wearer's left lapel crosses to her right side)
    for a0, a1, z1, wd in ((FRONT + 0.75, FRONT - 0.95, 1.13 * s, 0.034), (FRONT - 0.75, FRONT + 0.25, 1.22 * s, 0.026)):
        pts, nrm = [], []
        for k in range(15):
            u = k / 14; z = z_top - 0.012 + (z1 - z_top) * u; a = a0 + (a1 - a0) * (u ** 0.8)
            pts.append(surf(z, a, 0.006 if wd > 0.03 else 0.003)); nrm.append(V(math.cos(a), math.sin(a), 0.25).normalized())
        strip(P, pts, nrm, lambda u, wd=wd: wd * s, 'trim', w_tor)
    # standing collar: just above the robe's neckline, kept under the chin
    nr = lambda a: vroid.body_r(fit, 'torso', zn + 0.035, a)
    nk = lambda z, a, off: V(math.cos(a) * (nr(a) + off), cy(z) + math.sin(a) * (nr(a) + off), z)
    c_top = max(z_top + 0.012, min(z_top + 0.035, fit['chin'] - 0.012))
    P.grid([[nk(z, a, off) for a in ang] for z, off in ((z_top - 0.012, 0.016), (z_top + 0.004, 0.013), (c_top, 0.011))], 'trim',
           lambda i, j, p: {'upperchest': 1 - smooth01(z_top - 0.012, c_top, p.z), 'neck': smooth01(z_top - 0.012, c_top, p.z)})
    # belt + hanging ties + jade pendant
    zb0, zb1 = zs + 0.015, zs + 0.07
    P.grid([[surf(z, a, 0.008) for a in ang] for z in (zb0, zb1)], 'trim', lambda i, j, p: {'pelvis': 1.0} if p.z < zs else w_z(p.z))
    skirt_out = lambda z, a, off: V(math.cos(a) * (r_skirt(z, a) * (1 + fold_amp(z)) + off), cy(z) + math.sin(a) * (r_skirt(z, a) * (1 + fold_amp(z)) + off), z)
    for da, wd, ln in ((0.25, 0.03, 0.42), (0.38, 0.024, 0.5)):
        a = FRONT + da; pts = [surf(zb0 + 0.005, a, 0.012)]
        for k in range(1, 9):
            u = k / 8; z = zb0 + 0.005 - ln * s * u; pts.append(skirt_out(z, a - 0.02 * u, 0.006 + 0.012 * u))
        strip(P, pts, [V(math.cos(a), math.sin(a), 0)] * len(pts), lambda u, wd=wd: wd * s * (1 - 0.3 * u), 'sash',
              lambda i, j, p: {'pelvis': 1.0}, lambda i, j, p, ln=ln: (smooth01(zb0, zb0 - ln * s, p.z), 2.0 + da * 4))
    if hero:
        a = FRONT - 0.3; zj = zb0 - 0.115
        ellipsoid(P, skirt_out(zj, a, 0.012), (0.02, 0.008, 0.026), 'jade', {'pelvis': 1.0}, fl=lambda i, j, p: (0.3, 1.0))
    # ---------------- skirt ----------------
    fold = lambda z, a: 1 + (0.07 * (1.06 * s - z) / s) * math.sin(a * 9 + z * 3) + 0.03 * (1.06 * s - z) / s * math.sin(a * 17)
    zk = [zs + 0.01 - (zs + 0.01 - 0.04 * s) * k / 12 for k in range(13)]
    rings = [[V(math.cos(a) * r_skirt(z, a) * fold(z, a), cy(z) + 0.02 * (1.06 * s - z) + math.sin(a) * r_skirt(z, a) * fold(z, a), z) for a in ang] for z in zk]
    P.grid(rings, 'robe', lambda i, j, p: {'pelvis': 1.0}, lambda i, j, p: (smooth01(0.95 * s, 0.05, p.z), math.atan2(p.y, p.x) * 2 + p.z * 3))
    # ---------------- gauze over-robe (heroine) / long cape (rival) ----------------
    if hero:
        def gz_pt(z, a):
            rx, ry = table(GZ, z)
            r = ellipse_r(rx + 0.012, ry + 0.012, a)
            r = max(r, r_robe(z, a) + 0.014) if z >= zs else max(r, r_skirt(z, a) * (1 + fold_amp(z)) + 0.016)
            back = max(0.0, math.sin(a)) * (0.06 if z < 0.5 else 0.0)
            return V(math.cos(a) * r, cy(z) + math.sin(a) * r + back, z - back * 0.8)
        zg = [min(z_top - 0.005, 1.42)] + [z for z, _, _ in GZ[1:]]
        rings = [[gz_pt(z, FRONT + 0.32 + (2 * math.pi - 0.64) * j / 40) for j in range(41)] for z in zg]
        P.grid(rings, 'gauze', w_tor, lambda i, j, p: (smooth01(1.0, 0.1, p.z), math.atan2(p.y, p.x) * 2.5 + p.z * 2.2), closed=False)
    else:
        rings = []
        for k in range(12):
            u = k / 11; z = (1.4 - 1.36 * u) * s; wd = (0.2 + 0.24 * u) * s
            row = []
            for q in range(13):
                x = (-1 + 2 * q / 12) * wd
                yb = max(cy(z) + vroid.body_r(fit, 'torso', z, math.atan2(1, x / max(wd, 1e-3))) if z > zs else 0.0,
                         cy(z) + (r_robe(z, math.pi / 2) if z > zs else r_skirt(z, math.pi / 2) * (1 + fold_amp(z))))
                row.append(V(x, max((0.11 + 0.16 * u + 0.05 * u * u) * s + 0.03 * math.cos(x * 3), yb + 0.025 + 0.12 * u), z))
            rings.append(row)
        P.grid(rings, 'gauze', lambda i, j, p: {'chest': 1 - smooth01(1.2 * s, 0.9 * s, p.z), 'pelvis': smooth01(1.2 * s, 0.9 * s, p.z)},
               lambda i, j, p: (smooth01(1.3 * s, 0.2 * s, p.z), p.x * 3 + p.z * 2), closed=False)
    # ---------------- wide sleeves ----------------
    arms = {}
    for side, sx in (('L', 1), ('R', -1)):
        sh, el, wr = B[f'upperarm.{side}'], B[f'forearm.{side}'], B[f'hand.{side}']
        d = (wr - sh).normalized(); L1 = (el - sh).length; L2 = (wr - el).length; arms[side] = (sh, d)
        g = V(0, 0, -1); droop = (g - d * g.dot(d)).normalized(); side_v = d.cross(droop).normalized()
        rings = []
        for k in range(15):
            u = k / 14; x = (L1 + L2 + 0.02) * u; c = sh + d * x
            r = (0.07 + 0.1 * smooth01(0.3, 1.0, u)) * s if hero else (0.075 + 0.06 * smooth01(0.4, 1.0, u)) * s
            sag = (0.22 if hero else 0.1) * s * smooth01(0.45, 1.0, u)
            rings.append([c + side_v * (math.sin(a) * r) + droop * (math.cos(a) * r + max(0.0, math.cos(a)) * sag) for a in (2 * math.pi * j / 24 for j in range(24))])
        def w_slv(i, j, p, sh=sh, d=d, side=side, L1=L1):
            x = (p - sh).dot(d)
            if x < 0.05: c = smooth01(0.0, 0.05, x); return {'upperchest': 1 - c, f'upperarm.{side}': c}
            c = smooth01(L1 - 0.04, L1 + 0.04, x); return {f'upperarm.{side}': 1 - c, f'forearm.{side}': c}
        def f_slv(i, j, p, sh=sh, d=d, droop=droop, n=(L1 + L2)):
            x = (p - sh).dot(d) / n; dd = (p - sh - d * (p - sh).dot(d)).dot(droop)
            return (smooth01(0.35, 1.0, x) * (0.4 + 0.6 * smooth01(0.0, 0.2 * s, dd)), x * 5 + (1.5 if sx > 0 else 0))
        P.grid(rings, 'robe', w_slv, f_slv)
        P.grid([rings[-1], [q + d * 0.012 for q in rings[-1]]], 'trim', w_slv, f_slv)
    # ---------------- floating sash (披帛) + hair ornament ----------------
    if hero:
        (shL, dL), (shR, dR) = arms['L'], arms['R']
        mL, mR = shL + dL * 0.38, shR + dR * 0.38
        yb = max(0.2, fit['hair_back'] + 0.035)
        ctrl = [mL + V(0.06, -0.02, -0.25), mL + V(0.045, -0.01, -0.12), mL + V(0, 0.03, 0.02), mL + V(-0.04, 0.09, 0.06),
                V(0.16, yb, 1.22), V(0.0, yb + 0.04, 1.17), V(-0.16, yb, 1.22),
                mR + V(0.04, 0.09, 0.06), mR + V(0, 0.03, 0.02), mR + V(-0.05, -0.01, -0.12), mR + V(-0.08, -0.03, -0.32), mR + V(-0.1, -0.02, -0.55)]
        pts = catmull(ctrl, 7); aL, aR = 2 * 7, 8 * 7
        def w_sash(i, j, p):
            if i <= aL + 4: c = smooth01(aL - 2, aL + 6, i); return {'forearm.L': 1 - c, 'chest': c}
            if i >= aR - 4: c = smooth01(aR + 2, aR - 6, i); return {'forearm.R': (1 - c) * 0.5, 'chest': c + (1 - c) * 0.5}
            return {'chest': 1.0}
        def f_sash(i, j, p):
            return (min(1.0, 0.25 + 0.75 * smooth01(0, 18, min(abs(i - aL), abs(i - aR)) if aL < i < aR else max(i - aR, aL - i) * 1.6)), i * 0.22)
        nrm = [(V(p.x, p.y, 0).normalized() if V(p.x, p.y, 0).length > 1e-3 else V(0, 1, 0)) for p in pts]
        strip(P, pts, nrm, lambda u: (0.07 + 0.03 * math.sin(u * math.pi)) * s, 'sash', w_sash, f_sash)
        # jade hairpin through the hair at the back of the head, two ribbons hanging from it
        hb = fit['hair_back_at']; zc = B['head'].z + 0.1; yc = hb(zc) + 0.004
        P.grid(tube([V(-0.075, yc - 0.01, zc - 0.012), V(0.085, yc - 0.004, zc + 0.012)], lambda u: 0.0045, 8), 'jade', lambda i, j, p: {'head': 1.0}, cap0=True, cap1=True)
        ellipsoid(P, V(0.09, yc - 0.003, zc + 0.013), (0.011, 0.011, 0.011), 'jade', {'head': 1.0}, n=8, m=5)
        ellipsoid(P, V(0, yc + 0.006, zc), (0.026, 0.01, 0.018), 'trim', {'head': 1.0}, n=12, m=6)
        for sx in (1, -1):
            zz = [zc - 0.02 - 0.5 * k / 9 for k in range(10)]
            pts = [V(sx * (0.012 + 0.03 * k / 9), hb(z) + 0.012 + 0.02 * k / 9, z) for k, z in enumerate(zz)]
            strip(P, pts, [V(0, 1, 0)] * len(pts), lambda u: 0.022, 'sash', lambda i, j, p: {'head': 1.0} if p.z > B['neck'].z else {'head': 0.5, 'upperchest': 0.5},
                  lambda i, j, p: (smooth01(zc - 0.03, zc - 0.5, p.z), 3.0 + sx))
    return P


def build(kind):
    arm, meshes, fit = vroid.load(kind)
    for o in meshes.values(): vroid.flutter(o, fit, 1.0 if kind == 'heroine' else 0.6)
    return arm, hanfu(kind, fit), STYLE[kind], list(meshes.values())


HUMANOID = None      # set by build.py: the humanoid bone names (for the turntable's x-ray bones)
