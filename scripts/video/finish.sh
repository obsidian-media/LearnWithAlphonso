#!/usr/bin/env bash
# finish.sh <episode-dir> <slug> <heygen-video-url> <poster-second> [font.ttf]
#
# Downloads the HeyGen render, writes the whiteboard text over it (board.py), encodes the delivery file and writes
#   <episode-dir>/publish/<slug>.mp4   H.264 CRF 25, faststart, about 6 to 8 MB
#   <episode-dir>/publish/<slug>.jpg   poster frame at <poster-second>
#   <episode-dir>/publish/<slug>.en.vtt  captions (captions.py)
#
# <episode-dir> must hold items.py (board cues) and seg/ (segs.txt and the per-section s<N>.wav clips). Everything is
# a path argument; nothing here knows where your working folder is. Needs bash, curl, ffmpeg, ffprobe, python with Pillow.
set -euo pipefail
EP="$1"; SLUG="$2"; URL="$3"; POSTER_T="$4"; FONT="${5:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$EP"; mkdir -p publish
curl -s -o heygen.mp4 "$URL"
FONT_ARGS=()
if [ -n "$FONT" ]; then FONT_ARGS=(--font "$FONT"); fi
python -I "$HERE/board.py" "$EP/heygen.mp4" "$EP/board.mp4" --items "$EP/items.py" "${FONT_ARGS[@]}"
ffmpeg -v error -y -i board.mp4 -c:v libx264 -preset slow -crf 25 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "publish/$SLUG.mp4"
ffmpeg -v error -y -ss "$POSTER_T" -i board.mp4 -frames:v 1 -q:v 3 "publish/$SLUG.jpg"
python -I "$HERE/captions.py" "$EP" "$SLUG"
ls -la publish
