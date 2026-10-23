"""Music bed + ambience + transition SFX, ducked under the voice; GDC clip audio mixed in.
usage: python3 tools/build_audio.py ep01-boids  ->  build/<ep>/final_audio.wav (stereo 48 kHz)

Everything is synthesized here (no third-party music). The music loops seamlessly: its length is
a whole number of bars and the tail is cross-faded into the head, so the last frame flows into the first."""
import json, os, sys, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EP = sys.argv[1] if len(sys.argv) > 1 else "ep01-boids"
BUILD = os.path.join(ROOT, "build", EP)
SR = 48000
src = open(os.path.join(ROOT, EP, "timeline.js"), encoding="utf-8").read()
TL = json.loads(src[src.index("{"):src.rindex("}") + 1])
EV = json.load(open(os.path.join(BUILD, "events.json")))
DUR = TL["duration"]
N = int(round(DUR * SR))
SC = {s["id"]: s for s in TL["scenes"]}
t_all = np.arange(N) / SR
CFG = json.load(open(os.path.join(ROOT, EP, "audio.json")))
rng = np.random.default_rng(CFG.get("seed", 1))


def at(ref):
    """'scene' -> scene start, 'scene:k' -> start of line k, 'scene:end' -> scene end"""
    sid, _, k = ref.partition(":")
    s = SC[sid]
    return s["end"] if k == "end" else s["lines"][int(k)]["start"] if k else s["start"]


def midi(m): return 440.0 * 2 ** ((m - 69) / 12)


def add(buf, sig, t, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0: return
    a, j = max(0, i), min(buf.shape[1], i + len(sig))
    s = sig[a - i: j - i]
    buf[0, a:j] += s * np.sqrt(0.5 * (1 - pan)) * 1.414
    buf[1, a:j] += s * np.sqrt(0.5 * (1 + pan)) * 1.414


def env(n, a, r):
    e = np.ones(n, dtype=np.float32)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    e[:na] = np.linspace(0, 1, na) ** 2
    if nr: e[n - nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def osc(f, dur, harm=(1, .3, .12), det=0.0, ph=0.0):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for k, a in enumerate(harm, 1):
        s += a * np.sin(2 * np.pi * f * k * (1 + det) * t + ph * k)
    return s.astype(np.float32)


def lowpass(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / fc) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)


def noise(n): return rng.standard_normal(n).astype(np.float32)


def reverb(x, secs=2.6, mix=0.32):
    n = int(secs * SR)
    ir = noise(n) * np.exp(-np.arange(n) / SR * (6.9 / secs)).astype(np.float32)
    ir = lowpass(ir, 5000); ir /= np.sqrt((ir ** 2).sum())
    L = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L)[: len(x)].astype(np.float32)
    return x * (1 - mix) + y * mix * 2.2


def loop_fix(buf, xf=4.0):
    """wrap the part rendered past the end back onto the head, so the end flows into the start"""
    n = int(xf * SR)
    out = buf[:, :N].copy()
    tail = buf[:, N:N + n]
    out[:, :tail.shape[1]] += tail
    return out


# ---------------- music: four-chord loop, airy ----------------
BPM = CFG.get("bpm", 76); BEAT = 60 / BPM; BAR = 4 * BEAT
PROGS = {
    "dmaj": [([50, 57, 62, 66, 69], 38), ([47, 54, 59, 62, 66], 35), ([43, 50, 55, 59, 66], 31), ([45, 52, 57, 61, 64], 33)],
    "fmaj": [([53, 60, 64, 67, 69], 41), ([50, 57, 62, 65, 69], 38), ([46, 53, 58, 62, 65], 34), ([48, 55, 60, 64, 67], 36)],
    "amin": [([45, 52, 57, 60, 64], 33), ([41, 48, 53, 57, 60], 29), ([48, 55, 60, 64, 67], 36), ([43, 50, 55, 59, 62], 31)],
    "dmin": [([50, 57, 62, 65, 69], 38), ([46, 53, 58, 62, 65], 34), ([43, 50, 55, 58, 62], 31), ([45, 52, 57, 61, 64], 33)],
}
PROG = PROGS[CFG.get("prog", "dmaj")]
EXT = N + int(6 * SR)
pad = np.zeros((2, EXT), np.float32); keys = np.zeros((2, EXT), np.float32); bass = np.zeros((2, EXT), np.float32)
nb = int(DUR / BAR) + 3
for b in range(nb):
    t0 = b * BAR
    chord, root = PROG[b % 4]
    d = BAR + 1.4
    for i, m in enumerate(chord):
        for det, pan in ((-0.004, -0.6), (0.004, 0.6)):
            s = osc(midi(m), d, harm=(1, .2, .05), det=det, ph=i + b) * env(int(d * SR), 1.2, 1.4)
            add(pad, s * 0.02, t0, pan)
    s = osc(midi(root - 12), BAR, harm=(1, .25, .05)) * env(int(BAR * SR), 0.3, 0.8)
    add(bass, s * 0.055, t0)
    # sparse plucked arpeggio, a little like wingbeats
    seq = [chord[2] + 12, chord[3] + 12, chord[4] + 12, chord[3] + 24, chord[4] + 12, chord[2] + 12, chord[1] + 12, chord[3] + 12]
    for q in range(8):
        if q % 2 == 1 and rng.random() < 0.5: continue
        f = midi(seq[q]); dd = 1.8; tt = np.arange(int(dd * SR)) / SR
        s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6) + 0.12 * np.sin(6 * np.pi * f * tt) * np.exp(-tt * 9))
        s *= np.exp(-tt * 2.6) * (1 - np.exp(-tt * 300))
        add(keys, s.astype(np.float32) * 0.028, t0 + q * BEAT / 2, pan=0.5 * np.sin(q * 1.3 + b))
music = pad + keys + bass
music[0] = reverb(music[0]); music[1] = reverb(music[1])
music = loop_fix(music)

# ---------------- ambience: wind in the sky, a muffled bed underwater ----------------
beds = {}
for kind in ("wind", "sea"):
    beds[kind] = np.zeros((2, N), np.float32)
    for ch in range(2):
        if kind == "wind":
            x = lowpass(noise(N), 700) * 0.7 + (lowpass(noise(N), 2400) - lowpass(noise(N), 900)) * 0.3
            sw = 0.55 + 0.45 * np.sin(2 * np.pi * t_all / 9.1 + ch) * np.sin(2 * np.pi * t_all / 13.7 + 0.7)
            beds[kind][ch] = x * sw.astype(np.float32)
        else:
            bub = (rng.random(N) > 0.99985).astype(np.float32) * noise(N) * 4
            beds[kind][ch] = lowpass(noise(N), 260) + lowpass(bub, 3000)
    beds[kind] /= np.abs(beds[kind]).max() + 1e-9
ramp = lambda a, b: np.clip((t_all - a) / max(1e-3, b - a), 0, 1).astype(np.float32)
# bed timeline: each entry cross-fades to a new ambience type
w = {k: np.zeros(N, np.float32) for k in ("wind", "sea", "none")}
cur = None
for e in CFG["bed"]:
    t0 = at(e["at"]) + e.get("offset", 0); fd = e.get("fade", 0.01)
    r = ramp(t0, t0 + fd)
    if cur is None: w[e["type"]][:] = 1
    else:
        for k in w: w[k] *= 1 - r
        w[e["type"]] += r
    cur = e["type"]
level = np.ones(N, np.float32)
for q in CFG.get("quiet", []):              # diagram / lab scenes: almost no ambience
    t0 = at(q); sid = q.split(":")[0]; t1 = SC[sid]["end"]
    level -= 0.8 * ramp(t0, t0 + 1.0) * (1 - ramp(t1, t1 + 1.0))
level = np.clip(level, 0.1, 1)
amb = (beds["wind"] * w["wind"] + beds["sea"] * w["sea"] * 1.4) * level
for a0, a1, g in CFG.get("swell", []):      # louder ambience in the hook footage
    fs, fe = at(a0) - 0.5, at(a1)
    amb *= 1 + g * (ramp(fs, fs + 1.5) * (1 - ramp(fe, fe + 1.5)))

# ---------------- sfx ----------------
sfx = np.zeros((2, N), np.float32)


def whoosh(dur):
    n = int(dur * SR); x = noise(n); out = np.zeros(n, np.float32)
    win = 2048; hop = 512; w = np.hanning(win).astype(np.float32)
    for i in range(0, n - win, hop):
        k = i / max(1, n - win); seg = lowpass(x[i:i + win] * w, 300 * (12 ** np.sin(np.pi * k))); out[i:i + win] += seg
    out *= np.sin(np.linspace(0, np.pi, n)).astype(np.float32) ** 1.5
    return out / (np.abs(out).max() + 1e-9)


def chime(f, g=0.05):
    d = 2.2; tt = np.arange(int(d * SR)) / SR
    s = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 4)) * np.exp(-tt * 2.2) * (1 - np.exp(-tt * 400))
    return s.astype(np.float32) * g


for e in EV:
    add(sfx, whoosh(min(1.3, max(0.6, e["wipe"] * 0.9))) * 0.05, e["t"] - 0.05, pan=-0.3)
notes = [74, 76, 78, 81, 83, 86, 88]
for i, sid in enumerate(CFG.get("chapters", [])):
    add(sfx, chime(midi(notes[i % len(notes)]), 0.04), SC[sid]["start"] + 0.55, pan=0.2)
for ref, every, n in CFG.get("whooshAt", []):
    for k in range(n):
        t0 = at(ref) + 0.2 + k * every
        add(sfx, whoosh(0.9) * 0.035, t0, pan=0.5 * (-1) ** k)
# EP05: sword clashes from the sim's event log (build/<ep>/clinks.json), if present
CLK = os.path.join(BUILD, "clinks.json")
if os.path.exists(CLK):
    cl = json.load(open(CLK))

    def clink(f, d=0.35):
        tt = np.arange(int(d * SR)) / SR
        s = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * k) for r, a, k in ((1, 1, 14), (2.76, 0.6, 22), (5.4, 0.35, 30), (8.9, 0.2, 40)))
        return (s * (1 - np.exp(-tt * 3000))).astype(np.float32)

    def thud(f=180, d=0.5):
        tt = np.arange(int(d * SR)) / SR
        return (np.sin(2 * np.pi * f * tt * (1 - 0.3 * tt)) * np.exp(-tt * 9) + lowpass(noise(len(tt)), 900) * 0.15 * np.exp(-tt * 20)).astype(np.float32)

    for t0, kind, n in cl["cues"]:
        k = int(min(4, 1 + np.log2(1 + n) / 2))         # dense moments get more voices, never a wall of noise
        for j in range(k):
            tj = t0 + rng.random() * 0.1
            if kind == 0: add(sfx, clink(2200 + rng.random() * 2600) * 0.05 / np.sqrt(k), tj, pan=rng.uniform(-0.7, 0.7))
            elif kind == 1: add(sfx, thud(150 + rng.random() * 60) * 0.03 / np.sqrt(k), tj, pan=rng.uniform(-0.4, 0.4))
            else: add(sfx, clink(1300 + rng.random() * 900, 0.5) * 0.025 / np.sqrt(k), tj, pan=rng.uniform(-0.3, 0.3))
    for tb in cl.get("boom", []):
        d = 3.0; tt = np.arange(int(d * SR)) / SR
        boom = (np.sin(2 * np.pi * (70 - 30 * tt / d) * tt) * np.exp(-tt * 1.4) + lowpass(noise(len(tt)), 2500) * np.exp(-tt * 3) * 0.6).astype(np.float32)
        add(sfx, boom * 0.35, tb)
sfx[0] = reverb(sfx[0], 1.8, 0.25); sfx[1] = reverb(sfx[1], 1.8, 0.25)


# ---------------- voice + clip ----------------
def readwav(p):
    with wave.open(p) as w:
        sr0 = w.getframerate()
        v = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    vt = np.arange(int(len(v) / sr0 * SR)) / SR
    out = np.zeros(N, np.float32); r = np.interp(vt, np.arange(len(v)) / sr0, v).astype(np.float32)[:N]; out[:len(r)] = r
    return out


vo = readwav(os.path.join(BUILD, "voice.wav"))
clip = readwav(os.path.join(BUILD, "clipaudio.wav"))
spk = vo + clip
win = int(0.03 * SR)
rms = np.sqrt(np.convolve(spk ** 2, np.ones(win) / win, mode="same"))
act = (rms > 0.012).astype(np.float32)
sm = np.convolve(act, np.ones(int(0.35 * SR)) / int(0.35 * SR), mode="same")
duck = 1.0 - 0.5 * np.clip(sm * 1.6, 0, 1)
# music almost gone under the GDC talk, swells back for the outro
for s in TL["scenes"]:
    if "clip" in s:
        g0, g1 = s["start"], s["end"]
        duck *= 1 - 0.75 * (ramp(g0 - 0.4, g0 + 0.3) * (1 - ramp(g1 - 0.3, g1 + 0.5)))

rmsdb = lambda a: 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9)
ref = rmsdb(vo[np.abs(vo) > 0.01])
mg = 10 ** ((ref - 16 - rmsdb(music)) / 20)
ag = 10 ** ((ref - 27 - rmsdb(amb)) / 20)
sg = 10 ** ((ref - 22 - rmsdb(sfx)) / 20)
cl = clip[np.abs(clip) > 0.01]
cg = 10 ** ((ref - rmsdb(cl)) / 20) if len(cl) else 0.0   # episodes without a talk clip
amb = np.nan_to_num(amb)                                    # "none"-only beds normalise 0/0
print("stems dB  music", round(rmsdb(music), 1), "amb", round(rmsdb(amb), 1), "sfx", round(rmsdb(sfx), 1), "voice", round(ref, 1))
bed = (music * mg + amb * ag) * duck + sfx * sg
mix = bed + vo[None, :] * 0.95 + clip[None, :] * cg * 0.9
mix = mix / (np.abs(mix).max() + 1e-9) * 0.9
with wave.open(os.path.join(BUILD, "final_audio.wav"), "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype(np.int16).tobytes())
print("audio", EP, round(DUR, 2), "s")
