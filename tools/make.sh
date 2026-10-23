#!/bin/bash
# Build one episode end to end:
#   script.json -> MamboTTS voice + timeline.js -> transition events -> audio mix
#   -> headless-Chrome frame render (three.js / canvas) -> MP4 with loudness-normalised AAC + bilingual SRT
# usage: tools/make.sh ep01-boids "01_鸟群算法_三条规则到六万只鸟"   [WORKERS=3]
set -e
cd "$(dirname "$0")/.."
EP=$1; NAME=$2
mkdir -p out build/$EP
python3 tools/build_voice.py "$EP"
node tools/render.mjs "$EP" --events
[ -f "$EP/sims/clinks.mjs" ] && node "$EP/sims/clinks.mjs"
python3 tools/build_audio.py "$EP"
node tools/render.mjs "$EP" --workers ${WORKERS:-3}
node tools/render.mjs "$EP" --srt "out/$NAME.srt"
ffmpeg -y -v error -i "build/$EP/video_noaudio.mp4" -i "build/$EP/final_audio.wav" \
  -af "loudnorm=I=-15:TP=-1.5:LRA=11" -ar 48000 -ac 2 \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "out/$NAME.mp4"
# small preview audio for the in-browser player
ffmpeg -y -v error -i "build/$EP/final_audio.wav" -c:a aac -b:a 128k "$EP/audio.m4a"
echo "done: out/$NAME.mp4"
