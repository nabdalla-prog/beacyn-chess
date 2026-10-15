#!/usr/bin/env bash
# Builds public/sounds/*.mp3 from two CC0 packs by Kenney (www.kenney.nl):
#   Impact Sounds    https://kenney.nl/assets/impact-sounds
#   Interface Sounds https://kenney.nl/assets/interface-sounds
# Usage: scripts/build-sounds.sh <unzipped impact pack> <unzipped interface pack>
# Needs ffmpeg. Output: short mono MP3s with matched loudness, a few KB each.
set -euo pipefail
impact="$1/Audio"
iface="$2/Audio"
out="$(dirname "$0")/../public/sounds"
mkdir -p "$out"

enc() { # enc <name> <ffmpeg input and filter args...>
  local name="$1"; shift
  ffmpeg -v error -y "$@" -ac 1 -ar 44100 -codec:a libmp3lame -b:a 64k "$out/$name.mp3"
}
lim='alimiter=limit=0.7:level=false'
norm="loudnorm=I=-18:TP=-2:LRA=7,afade=t=out:st=0.25:d=0.08,atrim=0:0.4,$lim"

enc move -i "$impact/impactWood_light_000.ogg" -af "$norm"
enc capture -i "$impact/impactWood_heavy_000.ogg" -af "$norm"
enc check -i "$impact/impactMetal_light_000.ogg" -af "$norm"
# Castling: two knocks, king then rook.
enc castle -i "$impact/impactWood_light_000.ogg" -i "$impact/impactWood_light_002.ogg" \
  -filter_complex "[1]adelay=120[b];[0][b]amix=inputs=2:normalize=0,loudnorm=I=-18:TP=-2,atrim=0:0.5,$lim"
enc end -i "$iface/confirmation_002.ogg" -af "loudnorm=I=-20:TP=-2,$lim"
enc right -i "$iface/confirmation_001.ogg" -af "loudnorm=I=-20:TP=-2,volume=-6dB,$lim"
enc wrong -i "$iface/error_006.ogg" -af "loudnorm=I=-22:TP=-3,$lim"
ls -l "$out"
