#!/usr/bin/env bash
# voice-join.sh <seg-dir> <out.mp3> [quiz-section]
#
# Joins the per-section TTS clips (<seg-dir>/s1.mp3 ... sN.mp3, one Deepgram call per script section) into one voice
# track with the pauses the board timing and captions.py assume:
#   0.4 s lead, 1 s between sections, 2 s after the quiz section (default 5: the question, before the answer), 0.8 s tail.
# It also writes <seg-dir>/s<N>.wav (captions.py measures these). Needs ffmpeg.
set -euo pipefail
SEG="$1"; OUT="$2"; QUIZ="${3:-5}"
cd "$SEG"
N=$(ls s*.mp3 | wc -l | tr -d ' ')
silence() { ffmpeg -v error -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t "$2" -c:a pcm_s16le "$1.wav"; }
silence lead 0.4; silence p1 1.0; silence p2 2.0; silence tail 0.8
: > list.txt
echo "file 'lead.wav'" >> list.txt
for i in $(seq 1 "$N"); do
  ffmpeg -v error -y -i "s$i.mp3" -ar 44100 -ac 1 -c:a pcm_s16le "s$i.wav"
  echo "file 's$i.wav'" >> list.txt
  if [ "$i" -lt "$N" ]; then
    if [ "$i" -eq "$QUIZ" ]; then echo "file 'p2.wav'" >> list.txt; else echo "file 'p1.wav'" >> list.txt; fi
  fi
done
echo "file 'tail.wav'" >> list.txt
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c:a libmp3lame -q:a 2 "$OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
