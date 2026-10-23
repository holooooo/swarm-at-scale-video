"""Build the static website from an explicit runtime allowlist.
Usage: python3 tools/build_site.py [destination]
No source files are modified. Production excludes MP4s, TTS caches and raw downloads.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
DEST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'dist'
if DEST == ROOT or ROOT in DEST.parents and DEST.name not in ('dist', 'site-preview'):
    raise SystemExit('Use dist or site-preview within this project, or an external build directory.')
DEST.mkdir(parents=True, exist_ok=True)
files = []
for name in ('index.html', 'README.md', 'SOURCES.md', 'THIRD_PARTY_NOTICES.md', '_headers'):
    p = ROOT / name
    if p.exists(): files.append(p)
for name in ('core', 'lib', 'assets', 'interactive'):
    files += [p for p in (ROOT / name).rglob('*') if p.is_file() and not p.name.startswith('.')]
for ep in sorted(ROOT.glob('ep[0-9][0-9]-*')):
    files += [p for p in ep.rglob('*') if p.is_file() and p.suffix.lower() in {'.js', '.mjs', '.json', '.html', '.css', '.glb', '.jpg', '.jpeg', '.png', '.webp', '.m4a'} and 'blender' not in p.parts and not p.name.startswith('.')]
files += list((ROOT / 'out').glob('*.srt'))
for p in files:
    rel = p.relative_to(ROOT)
    if p.stat().st_size > 24 * 1024 * 1024: raise SystemExit(f'Asset exceeds deployment limit: {rel}')
    target = DEST / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, target)
print(f'Website: {len(files)} files, {sum(p.stat().st_size for p in files)/1024/1024:.1f} MiB -> {DEST}')
