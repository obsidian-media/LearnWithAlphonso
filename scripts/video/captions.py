"""WebVTT captions from the per-section voice timings.

Usage: python -I captions.py <episode-dir> <slug> [--quiz-section 5]

Reads <episode-dir>/seg/segs.txt (one script section per line) and <episode-dir>/seg/s<N>.wav (the TTS clip of section N),
and writes <episode-dir>/publish/<slug>.en.vtt. The timeline is exactly the one voice-join.sh builds: a 0.4 s lead, 1 s
between sections, 2 s after the quiz section (the question, before the answer). A section is split into sentences and each
sentence gets a share of the section's duration in proportion to its length, so the cues are close to the speech without a
second transcription. ffprobe is needed only to measure the clips (`cues` itself is pure).
"""
import re
import subprocess
import sys

LEAD = 0.4
GAP = 1.0
QUIZ_GAP = 2.0


def split_sentences(line):
    return [p for p in re.split(r'(?<=[.!?])\s+(?=[A-Z"])', line.strip()) if p]


def cues(lines, durations, quiz_section=5):
    """Return [(start, end, text)] for sections `lines` whose clips last `durations` seconds."""
    if len(lines) != len(durations):
        raise ValueError(f"{len(lines)} sections but {len(durations)} clips")
    t = LEAD
    out = []
    for i, (line, d) in enumerate(zip(lines, durations), 1):
        parts = split_sentences(line)
        total = sum(len(p) for p in parts)
        if total == 0:
            raise ValueError(f"section {i} is empty")
        s = t
        for p in parts:
            e = s + d * len(p) / total
            out.append((s, e, p))
            s = e
        t += d + (QUIZ_GAP if i == quiz_section else GAP)
    return out


def timestamp(x):
    return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{x % 60:06.3f}"


def vtt(cue_list):
    chunks = ["WEBVTT", ""]
    for n, (s, e, p) in enumerate(cue_list, 1):
        chunks += [str(n), f"{timestamp(s)} --> {timestamp(e)}", p, ""]
    return "\n".join(chunks) + "\n"


def clip_seconds(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    d, slug = sys.argv[1], sys.argv[2]
    quiz = int(sys.argv[sys.argv.index("--quiz-section") + 1]) if "--quiz-section" in sys.argv else 5
    with open(f"{d}/seg/segs.txt", encoding="utf-8") as fh:
        lines = [x for x in fh.read().strip().split("\n") if x]
    durations = [clip_seconds(f"{d}/seg/s{i}.wav") for i in range(1, len(lines) + 1)]
    cue_list = cues(lines, durations, quiz)
    with open(f"{d}/publish/{slug}.en.vtt", "w", encoding="utf-8", newline="\n") as fh:
        fh.write(vtt(cue_list))
    print(len(cue_list), "caption cues")


if __name__ == "__main__":
    main()
