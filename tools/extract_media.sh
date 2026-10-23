#!/bin/bash
# Cut footage into 30 fps JPEG sequences the film page can seek frame-exactly.
# usage: tools/extract_media.sh <src.mp4> <out_dir> <in_sec> <dur_sec> [crop_filter]
set -e
SRC=$1; OUT=$2; IN=$3; DUR=$4; CROP=${5:-"scale=1920:1080"}
rm -rf "$OUT"; mkdir -p "$OUT"
ffmpeg -v error -ss "$IN" -t "$DUR" -i "$SRC" -vf "$CROP,fps=30" -q:v 3 "$OUT/f%04d.jpg"
echo "$OUT: $(ls "$OUT" | wc -l | tr -d ' ') frames"
