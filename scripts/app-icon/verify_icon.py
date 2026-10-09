"""Checks an App Store icon: 1024x1024, RGB (no alpha channel, no palette), and full-bleed: no near-white pixel
(weakest channel above 228) in any of the four 16 px corner patches, which is what a pre-rounded icon has.
Usage: python verify_icon.py <png> [<png> ...]   exit 0 only when every file passes."""
import sys
from PIL import Image

failed = False
for path in sys.argv[1:]:
    im = Image.open(path)
    problems = []
    if im.size != (1024, 1024):
        problems.append(f"size {im.size}, want (1024, 1024)")
    if im.mode != "RGB":
        problems.append(f"mode {im.mode}, want RGB (no alpha, no palette)")
    rgb = im.convert("RGB")
    for name, (cx, cy) in {"TL": (0, 0), "TR": (1008, 0), "BL": (0, 1008), "BR": (1008, 1008)}.items():
        patch = [rgb.getpixel((cx + dx, cy + dy)) for dx in range(16) for dy in range(16)]
        white = sum(1 for p in patch if min(p) > 228)
        if white:
            problems.append(f"corner {name}: {white}/256 near-white pixels (pre-rounded or not full-bleed)")
    print(("PASS " if not problems else "FAIL ") + path + ("" if not problems else ": " + "; ".join(problems)))
    failed |= bool(problems)
sys.exit(1 if failed else 0)
