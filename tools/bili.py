"""Download a bilibili video (no login): python3 bili.py BVID out.mp4 [qn]"""
import json, subprocess, sys, urllib.request, http.cookiejar, os
bv, out = sys.argv[1], sys.argv[2]
qn = sys.argv[3] if len(sys.argv) > 3 else "64"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(url, ref="https://www.bilibili.com/"):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
    return op.open(r, timeout=60).read()
get("https://www.bilibili.com/")
v = json.loads(get(f"https://api.bilibili.com/x/web-interface/view?bvid={bv}"))["data"]
print(v["title"], "|", v["owner"]["name"], "|", v["duration"], "s | pages", len(v["pages"]), file=sys.stderr)
cid = v["pages"][0]["cid"]
p = json.loads(get(f"https://api.bilibili.com/x/player/playurl?bvid={bv}&cid={cid}&qn={qn}&fnval=16&fourk=1"))
if p.get("code") != 0: print(p, file=sys.stderr); sys.exit(1)
d = p["data"]["dash"]
vids = sorted(d["video"], key=lambda x: (x["id"], "avc" in x.get("codecs", "")), reverse=True)
vv = vids[0]; aa = sorted(d["audio"], key=lambda x: x["id"], reverse=True)[0] if d.get("audio") else None
print("video", vv["id"], vv["width"], vv["height"], vv["codecs"], file=sys.stderr)
ref = f"https://www.bilibili.com/video/{bv}"
def dl(url, path):
    with open(path, "wb") as f:
        r = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
        with op.open(r, timeout=120) as s:
            while True:
                b = s.read(1 << 20)
                if not b: break
                f.write(b)
dl(vv["baseUrl"], out + ".v.m4s")
args = ["ffmpeg", "-y", "-v", "error", "-i", out + ".v.m4s"]
if aa: dl(aa["baseUrl"], out + ".a.m4s"); args += ["-i", out + ".a.m4s"]
subprocess.run(args + ["-c", "copy", out], check=True)
for x in (out + ".v.m4s", out + ".a.m4s"):
    if os.path.exists(x): os.remove(x)
json.dump({"bvid": bv, "title": v["title"], "owner": v["owner"]["name"], "url": ref}, open(out + ".json", "w"), ensure_ascii=False)
print("ok", out, file=sys.stderr)
