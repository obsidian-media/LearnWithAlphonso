# scripts/video

Tools for the Alphonso tutor-video pipeline. The process, the approval gates and the quality checks are in `docs/VIDEO-PLAYBOOK.md`; read that first.

| File | What it does |
|---|---|
| `scene-prompt.txt` | The Codex image prompt for the classroom scene (an empty whiteboard, Alphonso waist-up). Pass it on stdin. |
| `voice-join.sh` | Joins the per-section TTS clips into one voice track with the fixed pauses, and writes the per-section wavs. |
| `board.py` | Writes handwritten whiteboard text over the HeyGen render from an `items.py` cue file. Validates the cues. `--preview` writes still frames. |
| `captions.py` | WebVTT captions from `seg/segs.txt` and the per-section clip lengths. |
| `finish.sh` | Download, board, encode (H.264 CRF 25 + faststart), poster, captions. |
| `examples/items.example.py`, `examples/segs.example.txt` | A real episode's cues and script sections, to copy from. |
| `test_video_scripts.py` | Tests for the cue file checks and the caption timeline. |

Needs: Git Bash (or any bash), ffmpeg and ffprobe, curl, Python 3 with Pillow. Everything takes paths as arguments; nothing is tied to a folder. The font defaults to the Windows "Ink Free" path; on another machine pass `--font <ttf>` to `board.py` (or the fifth argument of `finish.sh`).

```sh
# episode folder: seg/s1.mp3 ... (one Deepgram call per section), seg/segs.txt, items.py
bash scripts/video/voice-join.sh <ep>/seg <ep>/voice.mp3
python -I scripts/video/board.py <ep>/heygen.mp4 <ep>/prev --items <ep>/items.py --preview 12.0,30.5
bash scripts/video/finish.sh <ep> <slug> <heygen-video-url> <poster-second>

# the tests (no network, no ffmpeg, no Pillow); not in CI, run them when you change board.py or captions.py
PYTHONDONTWRITEBYTECODE=1 python -I -m unittest discover -s scripts/video -p "test_*.py"
```

Checked on 2026-11-13 against the first episodes: `voice-join.sh` reproduced the original voice track's length to the microsecond, and `captions.py` reproduced the published captions file byte for byte.

No media, keys or account ids live here and none may be added.
