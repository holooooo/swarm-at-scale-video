# EP05 · props: the jian (one mesh, instanced 16,384 times in three.js), her stone pinnacle, a pine, far peaks.
# Sword: built along +Z (glTF +Y) with the guard at the origin and the tip at z = 1.
# UVMap.x = part id (0 blade, 1 guard, 2 grip, 3 pommel, 4 tassel), UVMap.y = position along the blade (0 guard .. 1 tip),
# which the vertex shader uses for bending: offset ~ y^2.
import math, random
from geo import V, Part, ring, tube, ellipsoid, strip, catmull, smooth01


def sword():
    P = Part('sword'); W = {'root': 1.0}
    def put(part, mat_ids_y):
        def f(i, j, p): return (part, mat_ids_y(p))
        return f
    # blade: flattened hexagon (ridge down the middle), tapering to a point
    ST = [(0.0, 0.034, 0.008), (0.06, 0.031, 0.0075), (0.2, 0.029, 0.007), (0.4, 0.027, 0.0065), (0.6, 0.025, 0.006),
          (0.75, 0.023, 0.0055), (0.86, 0.02, 0.005), (0.93, 0.014, 0.004), (0.975, 0.006, 0.002), (1.0, 0.0006, 0.0004)]
    rings = []
    for z, wd, th in ST:
        rings.append([V(wd, 0, z), V(wd * 0.45, th, z), V(-wd * 0.45, th, z), V(-wd, 0, z), V(-wd * 0.45, -th, z), V(wd * 0.45, -th, z)])
    P.grid(rings, 'sword', lambda i, j, p: W, None, smooth=False)
    nb = len(P.co)
    # guard: swept-back wings
    rings = []
    for k in range(9):
        u = -1 + 2 * k / 8; x = u * 0.085
        rings.append(ring(V(x, 0, -0.012 + 0.018 * abs(u) ** 1.6), V(0, 0, 1), V(0, 1, 0), 0.016 - 0.007 * abs(u), 0.017 - 0.006 * abs(u), 8))
    P.grid(rings, 'sword', lambda i, j, p: W, cap0=True, cap1=True, smooth=False)
    ng = len(P.co)
    # grip with a cord wrap, pommel ring
    path = [V(0, 0, -0.02 - 0.19 * k / 16) for k in range(17)]
    P.grid(tube(path, lambda u: (0.0135 + 0.0015 * math.cos(u * 16 * math.pi), 0.011 + 0.0012 * math.cos(u * 16 * math.pi)), 8, up=V(0, 1, 0)),
                'sword', lambda i, j, p: W, cap0=True, cap1=True)
    n0 = len(P.co)
    ellipsoid(P, V(0, 0, -0.228), (0.02, 0.012, 0.018), 'sword', W, n=10, m=6)
    # tassel
    pts = [V(0, 0, -0.245 - 0.03 * k) + V(0.0, 0.002 * k * k, 0) for k in range(7)]
    t0 = len(P.co)
    strip(P, pts, [V(0, 1, 0)] * len(pts), lambda u: 0.012 + 0.012 * u, 'sword', lambda i, j, p: W)
    for k in range(len(P.co)):
        z = P.co[k].z
        P.uv[k] = (0.0, z) if k < nb else (1.0, 0.0) if k < ng else (2.0, 0.0) if k < n0 else (3.0, 0.0) if k < t0 else (4.0, (-0.245 - z) / 0.18)
    return P


def _noise(x, y, z):
    return (math.sin(x * 1.7 + z * 0.9) * 0.5 + math.sin(y * 2.3 - x * 1.1) * 0.3 + math.sin(z * 3.1 + y * 1.9 + x * 0.7) * 0.2)


def pinnacle():
    """her standing rock: flat-ish top at z = 0, flaring down 70 m into the clouds"""
    P = Part('peak'); W = {'root': 1.0}
    rings = []
    for k in range(26):
        depth = (k / 25) ** 1.6 * 70; z = -depth
        r0 = 1.25 + 0.42 * depth ** 0.85 + (0.15 if k == 0 else 0)
        rings.append(ring(V(0.4 * math.sin(depth * 0.05), 0.6 * math.sin(depth * 0.033), z), V(1, 0, 0), V(0, 1, 0), r0, r0 * 0.86, 40,
                          lambda a, d=depth: 1 + 0.2 * _noise(math.cos(a) * 2.2, math.sin(a) * 2.2, d * 0.18) + 0.06 * _noise(a * 7, d, 3.0)))
    rings = rings[::-1]
    ids = P.grid(rings, 'rock', lambda i, j, p: W, None, cap1=True, smooth=False)
    # moss cap: the top ring and centre re-tinted later in three.js by height; boulders around the rim
    rnd = random.Random(7)
    for k in range(9):
        a = rnd.random() * 6.283; r = 0.85 + rnd.random() * 0.45
        if -2.2 < a - 4.712 < 1.1 and r < 1.1: continue
        c = V(math.cos(a) * r, math.sin(a) * r, 0.02)
        ellipsoid(P, c, (0.12 + rnd.random() * 0.18, 0.1 + rnd.random() * 0.15, 0.07 + rnd.random() * 0.12), 'rock', W, n=7, m=4)
    # a crooked pine leaning out over the edge, behind her right shoulder
    path = catmull([V(-0.75, 0.75, -0.05), V(-0.85, 0.85, 0.7), V(-1.25, 1.0, 1.35), V(-1.9, 1.05, 1.85), V(-2.6, 1.25, 2.05)], 6)
    P.grid(tube(path, lambda u: 0.11 * (1 - 0.7 * u) + 0.02, 9), 'bark', lambda i, j, p: W, cap1=True, smooth=True)
    for k, (c, rr) in enumerate([(V(-2.65, 1.25, 2.12), 0.75), (V(-1.95, 1.0, 1.98), 0.6), (V(-1.35, 0.95, 1.62), 0.45), (V(-2.2, 1.45, 2.3), 0.5)]):
        for t in range(4):                                   # tiered needle pads
            q = V(rnd.uniform(-0.25, 0.25) * rr, rnd.uniform(-0.25, 0.25) * rr, (t - 1.2) * rr * 0.16)
            sc = rr * (1.05 - 0.2 * t)
            ellipsoid(P, c + q, (sc, sc * 0.75, rr * 0.13), 'pine', W, n=14, m=5, fl=lambda i, j, p, k=k: (1.0, k * 1.7))
    return P


def far_peaks():
    P = Part('farpeaks'); W = {'root': 1.0}; rnd = random.Random(21)
    spots = []
    for k in range(26):
        a = (rnd.random() * 1.6 - 0.8) * math.pi + (math.pi / 2 if k % 3 else -math.pi / 2)
        d = 140 + rnd.random() * 380
        x, y = math.cos(a) * d, math.sin(a) * d
        if abs(x) < 40 and y < -20: x += 70 if x >= 0 else -70          # keep the corridor in front of her clear
        spots.append((x, y, 25 + rnd.random() * 90 * (d / 300), 10 + rnd.random() * 18))
    for x, y, h, r in spots:
        rings = []
        for k in range(14):
            u = k / 13; z = h * (1 - u) - 70 * u
            rr = (r * (0.18 + 0.82 * u ** 0.7)) if k else r * 0.12
            ledge = 1 + 0.12 * (math.floor(u * 7 + 0.5 * math.sin(x)) % 2)          # stacked karst ledges
            rings.append(ring(V(x + math.sin(u * 3 + x) * r * 0.2, y + math.cos(u * 2 + y) * r * 0.1, z), V(1, 0, 0), V(0, 1, 0), rr * ledge, rr * 0.9 * ledge, 18,
                              lambda a, u=u: 1 + 0.32 * _noise(math.cos(a) * 2.5, math.sin(a) * 2.5, u * 9 + x) + 0.1 * _noise(a * 5, u * 20, y)))
        P.grid(rings, 'farrock', lambda i, j, p: W, None, cap0=True, smooth=False)
    return P
