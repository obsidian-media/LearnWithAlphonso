"""Builds ios/.../AppIcon.appiconset/AppIcon.png from the owner-supplied native 1024 x 1024 artwork.

The artwork has rounded white corners baked in (it was exported with the iOS mask applied). An App Store icon
must be full bleed and unrounded: iOS applies its own mask. This script keeps every pixel of the artwork and
only replaces the baked-in white corners, by continuing the background gradient into them. No scaling is done.

Usage:
    python scripts/app-icon/build_app_icon.py <source-1024.jpg|png> <out.png>

Then check the result with:
    python scripts/app-icon/verify_icon.py <out.png>

The source artwork is not stored in the repository; only the produced PNG is.
"""
import sys

from PIL import Image, ImageFilter

SIZE = 1024
WHITE_MIN = 205  # a pixel whose weakest channel is above this is "white" for the corner flood fill


def is_white(p):
    return min(p) > WHITE_MIN


def corner_mask(im):
    """Pixels reachable from the four corners through near-white: exactly the baked-in rounded corners."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    px, mp = im.load(), mask.load()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or mp[x, y] or not is_white(px[x, y]):
            continue
        mp[x, y] = 255
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    # grow a few pixels to swallow the anti-aliased and JPEG-ringing rim of the old rounding
    return mask.filter(ImageFilter.MaxFilter(9))


ROBE_BLUE = (47, 109, 171)  # sampled from the artwork's shoulder, near (170, 1005)
ROBE_NAVY = (14, 30, 58)  # the outline and hem band, sampled near (400, 1018)


def is_background(p):
    """The artwork's orange to yellow gradient: strong red, no cream (ears, face) and no dark or blue ink."""
    return p[0] > 235 and p[2] < 125 and p[1] < 200


def background_profile(im, mask):
    """Background colour for every row, read from the artwork itself: the median of background pixels just
    inside the baked-in corner, row by row. Rows with no such pixel (the bottom rows, where the robe reaches
    the old rounding) continue the fitted slope of the last rows."""
    w, h = im.size
    px, mp = im.load(), mask.load()
    rows = {}
    for y in range(h):
        x0 = next((x for x in range(w) if not mp[x, y]), None)
        if x0 is None:
            continue
        samples = [px[x, y] for x in range(x0 + 4, min(x0 + 40, w)) if not mp[x, y] and is_background(px[x, y])]
        if len(samples) >= 8:
            rows[y] = tuple(sorted(s[c] for s in samples)[len(samples) // 2] for c in range(3))
    ys = sorted(rows)
    # a small moving average hides JPEG noise
    smooth = {}
    for y in ys:
        near = [rows[k] for k in range(y - 6, y + 7) if k in rows]
        smooth[y] = tuple(sum(v[c] for v in near) / len(near) for c in range(3))
    last = ys[-1]
    tail = [y for y in ys if y > last - 60]
    slopes = [(smooth[last][c] - smooth[tail[0]][c]) / max(1, last - tail[0]) for c in range(3)]
    first = ys[0]
    head = [y for y in ys if y < first + 60]
    head_slopes = [(smooth[head[-1]][c] - smooth[first][c]) / max(1, head[-1] - first) for c in range(3)]

    def colour(y):
        if y in smooth:
            v = smooth[y]
        elif y > last:
            v = tuple(smooth[last][c] + slopes[c] * (y - last) for c in range(3))
        else:
            v = tuple(smooth[first][c] + head_slopes[c] * (y - first) for c in range(3))
        return tuple(max(0, min(255, round(t))) for t in v)

    return colour


def shoulder_colour(x, y):
    """The old rounding also clipped the robe's shoulder at the bottom corners. Continue the shoulder outline
    (outer edge through (132, 1001), falling 0.9 px per px toward the corner, about 12 px thick measured
    vertically), the blue robe under it, and the navy hem band from y = 1010. Mirrored for the right corner.
    Returns None where the pixel is plain background."""
    mx = x if x < SIZE // 2 else SIZE - 1 - x
    d = y - (1001 - 0.9 * (mx - 132))
    if d < 0 or y < 985:
        return None
    if y >= 1010 or d < 12:
        return ROBE_NAVY
    return ROBE_BLUE


def build(src_path):
    src = Image.open(src_path).convert("RGB")
    if src.size != (SIZE, SIZE):
        raise SystemExit(f"{src_path} is {src.size}; this script never rescales, supply a native {SIZE}x{SIZE} image")
    mask = corner_mask(src)
    background = background_profile(src, mask)
    out = src.copy()
    op, mp = out.load(), mask.load()
    for y in range(SIZE):
        fill = background(y)
        for x in range(SIZE):
            if mp[x, y]:
                op[x, y] = shoulder_colour(x, y) or fill
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    image = build(sys.argv[1])
    assert image.size == (SIZE, SIZE) and image.mode == "RGB"
    image.save(sys.argv[2], optimize=True)
    print("wrote", sys.argv[2])
