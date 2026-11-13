"""Composite handwritten whiteboard text over a HeyGen render.

Usage:
  python -I board.py <heygen.mp4> <out.mp4> --items <items.py> [--font <ttf>] [--src-width 941]
  python -I board.py <heygen.mp4> <out-prefix> --items <items.py> --preview 12.0,30.5

Coordinates in the items file are in source-image pixels (the scene still is 941 px wide) and are scaled to the video.
The audio of <heygen.mp4> is copied through. Pillow and ffmpeg/ffprobe are required (not for `load_items`, which the
tests use). Re-running is free (about 20 s), so cue timing fixes never need new HeyGen credits.

An items file defines two names (the colours INK, BLUE, RED, GREEN, GREY are already in scope):

  ITEMS    = [(kind, start_seconds, reveal_seconds, phase, params), ...]
  CLEAR_AT = seconds   # phase-1 items fade out here (the board clears before the quiz)

kinds: text (x, y, s, c, size), strike (x1, x2, y, c), tick (x, y, c), circle (x, y, w, h, c).
See examples/items.example.py.
"""
import json
import subprocess
import sys

# Windows default; override with --font <path to a handwriting-style .ttf> on any other machine.
DEFAULT_FONT = "C:/Windows/Fonts/Inkfree.ttf"
INK = (31, 41, 55, 255)       # dark marker
BLUE = (29, 78, 216, 255)
RED = (220, 38, 38, 255)
GREEN = (22, 163, 74, 255)
GREY = (90, 98, 110, 255)
KINDS = ("text", "strike", "tick", "circle")
REQUIRED = {
    "text": ("x", "y", "s", "c", "size"),
    "strike": ("x1", "x2", "y", "c"),
    "tick": ("x", "y", "c"),
    "circle": ("x", "y", "w", "h", "c"),
}
CLEAR_DUR = 0.45  # seconds the phase-1 writing takes to fade at CLEAR_AT
SRC_W = 941
FONT = DEFAULT_FONT
ITEMS = []
CLEAR_AT = 0.0


def load_items(path):
    """Read an items file and return (items, clear_at). Raises ValueError on a malformed cue."""
    ns = dict(INK=INK, BLUE=BLUE, RED=RED, GREEN=GREEN, GREY=GREY)
    with open(path, encoding="utf-8") as fh:
        exec(compile(fh.read(), path, "exec"), ns)
    items, clear_at = ns.get("ITEMS"), ns.get("CLEAR_AT")
    if not items or clear_at is None:
        raise ValueError("items file must define ITEMS and CLEAR_AT")
    last_start = {}
    for n, cue in enumerate(items, 1):
        if len(cue) != 5:
            raise ValueError(f"cue {n}: expected (kind, start, reveal, phase, params)")
        kind, start, reveal, phase, params = cue
        if kind not in KINDS:
            raise ValueError(f"cue {n}: unknown kind {kind!r}")
        if phase not in (1, 2):
            raise ValueError(f"cue {n}: phase must be 1 or 2")
        if start < 0 or reveal <= 0:
            raise ValueError(f"cue {n}: start must be >= 0 and reveal > 0")
        missing = [k for k in REQUIRED[kind] if k not in params]
        if missing:
            raise ValueError(f"cue {n} ({kind}): missing {', '.join(missing)}")
        if phase in last_start and start < last_start[phase]:
            raise ValueError(f"cue {n}: starts before the previous phase-{phase} cue")
        last_start[phase] = start
    phase1_last = max((c[1] for c in items if c[3] == 1), default=0)
    phase2_first = min((c[1] for c in items if c[3] == 2), default=None)
    if clear_at < phase1_last:
        raise ValueError("CLEAR_AT is before the last phase-1 cue starts")
    if phase2_first is not None and phase2_first < clear_at:
        raise ValueError("a phase-2 cue starts before the board clears")
    return items, clear_at


def render_item(kind, p, scale):
    """Return (rgba image, (left, top)) in video pixels."""
    from PIL import Image, ImageDraw, ImageFont
    if kind == "text":
        f = ImageFont.truetype(FONT, int(p["size"] * scale))
        l, t, r, b = f.getbbox(p["s"])
        im = Image.new("RGBA", (r + 6, b + 6), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((2, 2), p["s"], font=f, fill=p["c"])
        return im, (int(p["x"] * scale), int(p["y"] * scale))
    w = max(3, int(5 * scale))
    if kind == "strike":
        L = int((p["x2"] - p["x1"]) * scale)
        im = Image.new("RGBA", (L + 4, w * 3), (0, 0, 0, 0))
        ImageDraw.Draw(im).line([(2, w * 2), (L, w)], fill=p["c"], width=w)
        return im, (int(p["x1"] * scale), int(p["y"] * scale) - w)
    if kind == "tick":
        S = int(46 * scale)
        im = Image.new("RGBA", (S + 8, S + 8), (0, 0, 0, 0))
        ImageDraw.Draw(im).line([(4, S * 0.55), (S * 0.38, S), (S, 4)], fill=p["c"], width=w + 1, joint="curve")
        return im, (int(p["x"] * scale), int(p["y"] * scale))
    if kind == "circle":
        W, H = int(p["w"] * scale), int(p["h"] * scale)
        im = Image.new("RGBA", (W + 8, H + 8), (0, 0, 0, 0))
        ImageDraw.Draw(im).ellipse([4, 4, W, H], outline=p["c"], width=w)
        return im, (int(p["x"] * scale), int(p["y"] * scale))
    raise ValueError(kind)


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,r_frame_rate:format=duration", "-of", "json", path])
    j = json.loads(out)
    s = j["streams"][0]
    n, d = s["r_frame_rate"].split("/")
    return s["width"], s["height"], float(n) / float(d), float(j["format"]["duration"])


def overlay_at(t, rendered, size):
    from PIL import Image, ImageDraw
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    for (kind, start, dur, phase, p), (im, pos) in zip(ITEMS, rendered):
        if t < start:
            continue
        alpha = 1.0
        if phase == 1 and t >= CLEAR_AT:
            alpha = max(0.0, 1 - (t - CLEAR_AT) / CLEAR_DUR)
            if alpha == 0:
                continue
        frac = min(1.0, (t - start) / dur)
        if kind == "circle":
            piece = im if frac >= 1 else Image.new("RGBA", im.size, (0, 0, 0, 0))
            if frac < 1:  # draw a partial arc
                W, H = im.size
                ImageDraw.Draw(piece).arc([4, 4, W - 8, H - 8], -90, -90 + 360 * frac,
                                          fill=p["c"], width=max(3, int(5 * size[0] / SRC_W)))
        else:
            cw = max(1, int(im.size[0] * frac))
            piece = Image.new("RGBA", im.size, (0, 0, 0, 0))
            piece.paste(im.crop((0, 0, cw, im.size[1])), (0, 0))
        if alpha < 1:
            a = piece.getchannel("A").point(lambda v: int(v * alpha))
            piece.putalpha(a)
        layer.alpha_composite(piece, pos)
    return layer


def flag(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    global ITEMS, CLEAR_AT, FONT, SRC_W
    from PIL import Image
    if len(sys.argv) < 3 or "--items" not in sys.argv:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    FONT = flag("--font", DEFAULT_FONT)
    SRC_W = int(flag("--src-width", SRC_W))
    ITEMS, CLEAR_AT = load_items(flag("--items"))
    W, H, fps, dur = probe(src)
    scale = W / SRC_W
    rendered = [render_item(k, p, scale) for k, _, _, _, p in ITEMS]
    if "--preview" in sys.argv:
        for t in [float(x) for x in flag("--preview").split(",")]:
            frame = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1",
                                             "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
            im = Image.frombytes("RGBA", (W, H), frame)
            im.alpha_composite(overlay_at(t, rendered, (W, H)))
            im.convert("RGB").save(f"{out}.{t:05.1f}.png")
        return
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
                            "-r", str(fps), "-i", "-", "-i", src, "-map", "0:v", "-map", "1:a?",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-c:a", "aac", "-b:a", "160k",
                            "-shortest", out], stdin=subprocess.PIPE)
    fsize = W * H * 4
    i = 0
    while True:
        buf = dec.stdout.read(fsize)
        if len(buf) < fsize:
            break
        im = Image.frombytes("RGBA", (W, H), buf)
        im.alpha_composite(overlay_at(i / fps, rendered, (W, H)))
        enc.stdin.write(im.tobytes())
        i += 1
    enc.stdin.close()
    enc.wait()
    print("frames", i)


if __name__ == "__main__":
    main()
