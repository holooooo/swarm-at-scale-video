"""Voiceover for one episode with local MamboTTS (mambo-mac, voice "manbo").
usage: python3 tools/build_voice.py ep01-boids [--force]

One TTS call per subtitle line (cached in build/<ep>/tts/), so every line's start/end is exact.
Clip segments ({"clip": ...}) are not synthesized: their source audio is cut from the clip and
their subtitle lines carry their own relative timings.
Writes build/<ep>/voice.wav (mono 44.1k, voice + clip audio) and <ep>/timeline.js."""
import json, os, re, shutil, subprocess, sys, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EP = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "ep01-boids"
FORCE = "--force" in sys.argv
EPDIR = os.path.join(ROOT, EP)
BUILD = os.path.join(ROOT, "build", EP)
CACHE = os.path.join(BUILD, "tts")
os.makedirs(CACHE, exist_ok=True)
SR = 44100
cfg = json.load(open(os.path.join(EPDIR, "voice.json"), encoding="utf-8"))
START = cfg.get("start", 0.8)        # lead-in before the first word
LINE_GAP = cfg.get("lineGap", 0.32)   # breath between lines of one scene
SEG_GAP = cfg.get("segGap", 0.75)     # pause between scenes
TAIL = cfg.get("tail", 2.5)           # hold after the last word
HOLD = cfg.get("hold", {})            # extra seconds after a scene
PAUSE = cfg.get("pause", {})          # {"scene": {"lineIndex": seconds}} extra pause after a line
SPEED = str(cfg.get("speed", 1.0))
SPOKEN = cfg.get("spoken", [])

segments = json.load(open(os.path.join(EPDIR, "script.json"), encoding="utf-8"))


def spoken(text):
    text = text.replace("|", "")
    for a, b in SPOKEN:
        text = text.replace(a, b)
    return text


def tts(key, text):
    out = os.path.join(CACHE, f"{key}.wav")
    meta = os.path.join(CACHE, f"{key}.txt")
    stamp = text + "\n@" + SPEED
    if not FORCE and os.path.exists(out) and os.path.exists(meta) and open(meta, encoding="utf-8").read() == stamp:
        return out
    # mambo-mac never overwrites (it appends _1, _2 ...), so synthesize to a fresh temp dir and move into place
    tmp = tempfile.mkdtemp(dir=CACHE)
    r = subprocess.run(["mambo-mac", "--voice", "manbo", "--speed", SPEED, "--json", "-q", text, "-o", os.path.join(tmp, "o.wav")],
                       check=True, capture_output=True, text=True)
    os.replace(json.loads(r.stdout)["output"], out)
    shutil.rmtree(tmp, ignore_errors=True)
    open(meta, "w", encoding="utf-8").write(stamp)
    return out


def load(path, ss=None, to=None):
    cmd = ["ffmpeg", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss), "-to", str(to)]
    cmd += ["-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def trim(d, thr=0.012):
    idx = np.where(np.abs(d) > thr)[0]
    if not len(idx):
        return d
    return d[max(0, idx[0] - int(0.03 * SR)): min(len(d), idx[-1] + int(0.12 * SR))]


def norm(d, peak=0.92):
    p = np.abs(d).max()
    return d / p * peak if p > 0 else d


voice_chunks, clip_chunks, t = [np.zeros(int(START * SR), np.float32)], [np.zeros(int(START * SR), np.float32)], START
timeline = []


def push(sig, is_clip=False):
    global t
    voice_chunks.append(np.zeros_like(sig) if is_clip else sig)
    clip_chunks.append(sig if is_clip else np.zeros_like(sig))
    t += len(sig) / SR


def silence(sec):
    push(np.zeros(int(sec * SR), np.float32))


for si, seg in enumerate(segments):
    seg_start = t
    lines = []
    if "clip" in seg:
        c = seg["clip"]
        d = load(os.path.join(ROOT, c["src"]), c["in"], c["out"])
        n = len(d); fade = int(0.08 * SR)
        d[:fade] *= np.linspace(0, 1, fade); d[n - fade:] *= np.linspace(1, 0, fade)
        d = norm(d, 0.7)
        for l in seg["lines"]:
            lines.append({"zh": l[0], "en": l[1], "start": round(t + l[2], 3), "end": round(t + l[3], 3)})
        push(d, True)
    else:
        for li, l in enumerate(seg["lines"]):
            d = norm(trim(load(tts(f"{seg['id']}_{li}", spoken(l[0])))))
            lines.append({"zh": l[0], "en": l[1], "start": round(t, 3), "end": round(t + len(d) / SR, 3)})
            push(d)
            if li < len(seg["lines"]) - 1:
                silence(LINE_GAP + PAUSE.get(seg["id"], {}).get(str(li), 0))
    voice_end = t
    gap = SEG_GAP + HOLD.get(seg["id"], 0) + (TAIL if si == len(segments) - 1 else 0)
    silence(gap)
    timeline.append({"id": seg["id"], "start": round(seg_start, 3), "voiceEnd": round(voice_end, 3), "end": round(t, 3),
                     "lines": lines, **({"clip": seg["clip"], "credit": seg.get("credit", "")} if "clip" in seg else {})})
    print(f"{seg['id']:8s} {seg_start:7.2f} -> {t:7.2f}  ({voice_end - seg_start:5.2f}s spoken)")

timeline[0]["start"] = 0.0


def write(path, chunks):
    tr = np.concatenate(chunks)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(tr, -1, 1) * 32767).astype(np.int16).tobytes())


write(os.path.join(BUILD, "voice.wav"), voice_chunks)
write(os.path.join(BUILD, "clipaudio.wav"), clip_chunks)
with open(os.path.join(EPDIR, "timeline.js"), "w", encoding="utf-8") as f:
    f.write("window.TIMELINE = " + json.dumps({"duration": round(t, 3), "scenes": timeline}, ensure_ascii=False, indent=1) + ";\n")
print("total duration", round(t, 2), "s")
