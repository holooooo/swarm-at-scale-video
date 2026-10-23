#!/bin/bash
# Render stills at the given times and tile them 3x3 (960x540 each) into one review sheet.
# usage: tools/sheet.sh ep01-boids out.jpg t1,t2,...
set -e
EP=$1; OUT=$2; TS=$3
node tools/render.mjs "$EP" --stills "$TS" 2>&1 | grep -v -E "omz|ms$" || true
args=(); f=""; i=0; lay=""
for t in ${TS//,/ }; do
  p=$(printf "build/$EP/stills/t%07.2f.jpg" "$t"); args+=(-i "$p")
  f+="[$i]scale=640:360[v$i];"; x=$(( (i % 3) * 640 )); y=$(( (i / 3) * 360 )); lay+="${x}_${y}|"; i=$((i+1))
done
ins=""; for ((k=0;k<i;k++)); do ins+="[v$k]"; done
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${ins}xstack=inputs=$i:layout=${lay%|}:fill=black" "$OUT"
