# Video playbook: Alphonso tutor videos

How a short Alphonso tutor video ("I'd like vs I want", "Can you or Could you?", "How to say no politely") is made, checked and put in front of learners. Written 2026-11-13 from the first three videos. The scripts are in `scripts/video/` (see its `README.md`); this file is the process around them.

A video is a 40 to 50 second vertical (9:16) English lesson: Alphonso stands next to a whiteboard, speaks in his app voice, and handwritten text appears on the board while he talks. Captions are required by the approved design, so a video without them is not finished.

## Who does what (the approval gates)

| Gate | Who | When |
|---|---|---|
| Scene still ("Classroom B" was picked) | the owner | before any voice or HeyGen work |
| Script, word for word | the owner | before any credit is spent (steps 3 and 4) |
| Finished video, watched end to end | the owner | before anything is uploaded |
| Publish (making it visible in the app) | the owner | a separate command from the upload |
| Social posting | the owner | a video is not approved for social just because it is approved for the app |

Nothing in this pipeline posts anywhere. An agent produces files and stops at each gate.

## What each step costs

Only two steps use a metered resource. Everything else is free to repeat.

| Step | Resource | Repeatable for free? |
|---|---|---|
| 1 Scene still | the owner's Codex plan (image generation) | no: regenerate only if the owner rejects it |
| 2 Script | none | yes |
| 3 Voice | Deepgram text to speech, one call per section | a re-read is a few short calls; verify the text first so you do not pay twice |
| 4 HeyGen render | HeyGen credits. Free plan: 3 videos a month, 1 minute maximum, a watermark, 720p | **no**: only the lip-sync costs credits, so get the voice and script right first |
| 5 Whiteboard writing | none (about 20 seconds on a laptop) | **yes**: timing and wording fixes never need a new render |
| 6 Finish | none | yes |

## The pipeline

### 1. Scene still (Codex image generation)

Approved stills and poses are kept permanently in the owner's SocialMedia workstation, `alphonso-art` folder (the 2026-11-13 classroom scenes and the 12 poses of 2026-11-14, with their prompts); reuse one before generating a new scene.

Headless Codex CLI, with the two Alphonso reference images attached:

```sh
codex exec -s workspace-write -C <outdir> \
  -i public/avatar/base.webp -i public/figures/alphonso-waving.png \
  - < scripts/video/scene-prompt.txt
```

The prompt must arrive on stdin (the trailing `-`): `-i` swallows a positional prompt. `scripts/video/scene-prompt.txt` asks for two compositions, A (centred, marker in hand) and B (Alphonso right of frame, an open hand toward the board). The owner picked B ("Classroom B").

Prompt rules that make the still animate well: an empty whiteboard with no marks at all (text is added later), Alphonso waist-up with his face large and evenly lit, mouth unobstructed, hands below chest level, vertical 9:16, no other people, no text or logos.

Quality check: open the PNG. Mouth visible, no text anywhere, glasses and robe like the references, board top 45 to 50 percent of the frame. If the owner has not approved the still, stop.

### 2. Script

About 45 to 50 seconds spoken, with pauses. Structure: **hook** (the blunt version and why it is blunt) / **three points** (the polite versions, each with a short usage note) / **A-B quick test** (two lines, the learner picks the better one) / the answer / **"Now it's your turn. Let's practice!"**. American English. No app-store call to action inside the app; a social version may add a silent end card later.

One script section per line in `seg/segs.txt` (see `scripts/video/examples/segs.example.txt`). The quiz question and its answer are two separate sections so a longer pause can sit between them.

The owner approves the script word for word before any credit is spent.

### 3. Voice (Deepgram, Alphonso's app voice)

Voice `aura-2-saturn-en` (`src/lib/voice-catalog.ts`, the English Alphonso default), one Deepgram `speak` call per section, key from `DEEPGRAM_API_KEY`, saved as `seg/s1.mp3` ... `seg/sN.mp3`. Join them with `scripts/video/voice-join.sh <seg-dir> <voice.mp3>`: 0.4 s lead, 1 s between sections, 2 s before the quiz answer, 0.8 s tail. The script also writes the `s<N>.wav` clips the captions use.

Quality check, before spending anything: transcribe the joined voice with faster-whisper and read the transcript against the script. The voice misreads "Can you...?" written with an ellipsis and a bare "-ing" fragment; reword the line instead of fighting it. In the board cues write the ellipsis ("Can you ...?"); in the spoken text do not.

### 4. HeyGen lip-sync

1. Upload the approved still as an image asset.
2. `create_photo_avatar` from it. A llama is accepted even though the tool says "human face"; one reusable photo-avatar look is enough for every video.
3. `create_video_from_avatar` with the uploaded voice audio, aspect 9:16, and the motion prompt: "calm, friendly teacher; occasional open-hand gesture toward the whiteboard; small natural head movements".
4. A render takes about 3 minutes. Poll the video status; download the finished mp4 (not committed).

Free plan: the watermark is part of the file. A watermarked video is a draft for the app review, not something to post.

Quality check: watch it with sound. Lips follow the voice, the face stays unobstructed, the board stays empty (the writing is added next), the length matches the voice track.

### 5. Whiteboard writing (`board.py`)

A Pillow compositor writes marker-style text onto the board: a left-to-right reveal per item, strike-throughs, ticks and circles, in a handwriting font (Windows "Ink Free" by default; `--font` overrides). Cues live in an `items.py` per episode, timed from faster-whisper word timestamps of the voice track (so "Could you" appears as he says it). The board clears before the quiz (`CLEAR_AT`), then the quiz lines appear.

`board.py` checks the cue file when it loads: known kinds, required parameters, cues in order, the board cleared before the first quiz cue. Use `--preview 27.0,41.0` to write still frames at chosen seconds and look at them before encoding the whole video. Re-running is free, so timing fixes never need a new HeyGen render.

Quality check: preview at the busiest moment of each phase. Text stays inside the board, does not cover Alphonso's face, is readable at phone size, and nothing is written that is not spoken.

### 6. Finish

`scripts/video/finish.sh <episode-dir> <slug> <heygen-url> <poster-second>` downloads the render, runs `board.py`, and writes into `<episode-dir>/publish/`:

- `<slug>.mp4`: H.264, CRF 25, faststart (about 6 to 8 MB);
- `<slug>.jpg`: the poster frame;
- `<slug>.en.vtt`: WebVTT captions from the per-section timings (`captions.py`): each section's sentences share its duration by length, on the same timeline as the voice join.

Slugs are `en-...` and lower-case with hyphens (`en-id-like-vs-i-want`, `en-can-you-could-you`, `en-saying-no-politely`).

Quality check: play the mp4 with captions on. Captions are in sync (within a fraction of a second), spelled as spoken, and the file is under the upload limit.

## How a video reaches the app

This is live (#499, merged 2026-11-13). The Library's Watch shelf reads the `videos` table and the public `videos` storage bucket (migration `20261115100000_videos_watch_shelf.sql`). The owner-run uploader is `scripts/video-tool.ts`, run from Git Bash with bun (`bun` is a Bash shim here; PowerShell cannot run it). It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or from the owner's `~/.alphonso-secrets/podcast.env`. Every command is a dry run that prints what it would do until you add `--confirm`.

1. `add --file en-x.mp4 --poster en-x.jpg --captions en-x.en.vtt --course en --slug en-x --title "..." [--description ...] [--level A1] [--tags food,travel] [--practice lesson:u3l2] [--sort 0] --confirm` uploads the mp4, poster and WebVTT captions to the `videos` bucket and writes the row **unpublished**. `--tags` are free labels; a goal or interest from the first-run answers (travel, work, food, tech, ...) puts the video on that learner's path. `--practice` is the item the player offers after the video (`lesson:`, `talk:` or `campaign:` plus its id).
2. Watch it (the owner, from the unpublished row).
3. `publish --slug en-x --confirm` makes it visible. It refuses a video without captions or with a missing object (a database CHECK enforces the captions rule too).
4. `unpublish --slug en-x --confirm` hides it again. This hides the row, not the file: the bucket is public-read, so the mp4 is still fetchable by anyone who has its URL. `published` is a staging flag, not privacy.

Limits: mp4 up to 50 MB, a JPEG, PNG or WebP poster, and `text/vtt` captions. Captions are mandatory because the player turns them on by default.

On the learner's side: the Watch shelf (in the Library tab, hidden when the course has no videos), a captioned player sheet that remembers where they stopped (`save_video_progress`, one row per user per video, deleted with the account), a "practice this" button at the end, and a stop on Your learning path. Usage events are `video_started` and `video_completed`. See `ARCHITECTURE.md`, "Library tab and Watch shelf".

Uploading and publishing are the owner's commands (they need the service-role key); the coordinator ran them for the first three videos at the owner's request. An agent prepares the `publish/` folder and hands the owner the exact `add` and `publish` commands.

## What is deliberately not in the repo

No media (mp4, jpg, png, wav, mp3), no keys, no account or asset ids from HeyGen or Deepgram. The working folder per episode (`heygen.mp4`, `board.mp4`, `seg/`, `publish/`) stays outside the repo. The first three videos' publish folders are on the owner's machine; the owner's own handoff files list where.

## Mistakes already made (so you can skip them)

- Putting the prompt after `-i` on the Codex command line: the image flag took it and the run had no prompt. Use stdin.
- Writing "Can you...?" for the voice: it was read wrongly. Reword.
- Re-rendering on HeyGen to fix a board timing problem: the board is added afterwards, so fix `items.py` and re-run `board.py`.
- Forgetting the free plan's limits: 3 videos a month and 1 minute each. Check the month's count before starting a batch.
