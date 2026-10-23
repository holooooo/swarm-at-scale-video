#!/usr/bin/env python3
"""Check publish copy: every title <= 20 characters, exactly 5 hashtags, including #vibe知识大赏.
usage: python3 tools/check_publish.py out/*_发布文案.md"""
import re, sys

ok = True
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    titles = re.findall(r"^- 标题[^：:]*[：:]\s*(.+)$", text, re.M)
    tags = re.findall(r"#\S+", re.search(r"## 话题标签\s*\n(.+?)(\n##|\Z)", text, re.S).group(1))
    print(path)
    for t in titles:
        n = len(t.strip())
        flag = "OK " if n <= 20 else "TOO LONG"
        if n > 20: ok = False
        print(f"  [{flag}] {n:2d}  {t.strip()}")
    good = len(tags) == 5 and "#vibe知识大赏" in tags
    ok &= good
    print(f"  [{'OK ' if good else 'BAD'}] tags {len(tags)}: {' '.join(tags)}")
sys.exit(0 if ok else 1)
