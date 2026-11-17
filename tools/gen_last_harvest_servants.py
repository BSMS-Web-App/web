#!/usr/bin/env python3
"""Draw the Hollow Mother and Hollow Father and append them to img/bosses.png.

The boss sheet is a row of 64x64 cells with two rows: row 0 is the idle frame
and row 1 the second frame of the same slow breathing loop. The two servants
are drawn here because no guardian in the pack looks like a pair of hollow
parents.

Method, matched to the pack: build a flat silhouette out of solid shapes, give
it a 2px dark inner outline, then lay the linework (eye light, seams, finger
gaps, lantern glint) on top of the outline so thin details survive. Run from
the repo root: python3 tools/gen_last_harvest_servants.py
"""
import sys
from PIL import Image

SHEET = 'img/bosses.png'
CELL = 64

OUT = (26, 12, 22, 255)
HILITE = (255, 255, 255, 255)

MOTHER = {
    'deep': (43, 12, 40, 255),
    'robe': (92, 27, 58, 255),
    'light': (128, 44, 80, 255),
    'glow': (255, 122, 156, 255),
    'glowdim': (201, 82, 122, 255),
    'bone': (240, 229, 203, 255),
    'bone_shade': (203, 184, 148, 255),
    'bone_dark': (141, 122, 95, 255),
    'socket': (24, 8, 20, 255),
}
FATHER = {
    'deep': (14, 28, 44, 255),
    'robe': (30, 62, 94, 255),
    'light': (52, 100, 140, 255),
    'glow': (122, 198, 255, 255),
    'glowdim': (60, 126, 172, 255),
    'brass': (206, 164, 60, 255),
    'brass_dark': (140, 106, 34, 255),
    'bone': (232, 230, 216, 255),
    'socket': (10, 18, 28, 255),
}


def blank():
    return Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))


def px(im, x, y, c):
    if 0 <= x < CELL and 0 <= y < CELL:
        im.putpixel((int(x), int(y)), c)


def rect(im, x0, y0, x1, y1, c):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            px(im, x, y, c)


def hspan(im, y, x0, x1, c):
    rect(im, x0, y, x1, y, c)


def vspan(im, x, y0, y1, c):
    rect(im, x, y0, x, y1, c)


def ellipse(im, cx, cy, rx, ry, c):
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            dx = (x - cx) / max(0.001, rx)
            dy = (y - cy) / max(0.001, ry)
            if dx * dx + dy * dy <= 1.0:
                px(im, x, y, c)


def opaque(im, x, y):
    return 0 <= x < CELL and 0 <= y < CELL and im.getpixel((x, y))[3] > 0


def outline(im, colour=OUT, width=2):
    for _ in range(width):
        edge = []
        for y in range(CELL):
            for x in range(CELL):
                if not opaque(im, x, y):
                    continue
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if not (0 <= nx < CELL and 0 <= ny < CELL) or not opaque(im, nx, ny):
                        edge.append((x, y))
                        break
        for x, y in edge:
            px(im, x, y, colour)


def taper(im, y0, y1, top_half, bottom_half, cx, colour, curve=1.0):
    for y in range(int(y0), int(y1) + 1):
        t = (y - y0) / max(1, (y1 - y0))
        half = top_half + (bottom_half - top_half) * (t ** curve)
        for x in range(int(cx - half), int(cx + half) + 1):
            px(im, x, y, colour)


def tatters(im, cx, half, pal, deep_min=2, deep_max=6):
    """Uneven cloth teeth along the bottom of a robe."""
    for x in range(cx - half, cx + half + 1):
        depth = deep_min + ((x * 5 + 1) % (deep_max - deep_min + 1))
        for y in range(CELL - depth, CELL):
            px(im, x, y, (0, 0, 0, 0))
        px(im, x, CELL - depth, pal['deep'])


# ---------------------------------------------------------------- mother
def mother(frame):
    im = blank()
    m = MOTHER
    cx = 31
    bob = -1 if frame else 0
    drop = 1 if frame else 0

    # veil: a tall hood that comes to a soft point
    for y in range(5 + bob, 20 + bob):
        half = 3 + (y - 5 - bob) * 0.85
        hspan(im, y, cx - half, cx + half, m['deep'])
    ellipse(im, cx, 21 + bob, 14, 15, m['deep'])

    # cape over the shoulders, then the long skirt
    ellipse(im, cx, 33 + bob, 15, 6, m['robe'])
    taper(im, 34 + bob, 63, 11, 24, cx, m['robe'], curve=1.8)

    # sleeves read darker than the cloak so the arms separate from the body
    for side in (-1, 1):
        ax = cx + side * 18
        taper(im, 35 + bob, 45 + bob, 4, 5, ax, m['deep'], curve=1.1)
        ellipse(im, ax, 50 + drop + bob // 2, 6, 6, m['bone'])

    # the mask, set back inside the veil
    ellipse(im, cx, 23 + bob, 10, 12, m['light'])
    ellipse(im, cx, 23 + bob, 8, 10, m['bone'])
    ellipse(im, cx, 29 + bob, 6, 4, m['bone_shade'])

    outline(im, OUT, 2)

    # ---- linework on top of the outline
    for sx in (cx - 5, cx + 5):
        rect(im, sx - 2, 20 + bob, sx + 2, 25 + bob, m['socket'])
        rect(im, sx - 1, 22 + bob, sx + 1, 24 + bob, m['glow'] if frame else m['glowdim'])
        px(im, sx, 23 + bob, HILITE if frame else m['glow'])
        px(im, sx, 19 + bob, m['bone_shade'])
    vspan(im, cx, 14 + bob, 19 + bob, m['bone_dark'])
    vspan(im, cx, 26 + bob, 31 + bob, m['bone_dark'])
    rect(im, cx - 2, 32 + bob, cx + 2, 33 + bob, m['socket'])
    px(im, cx - 1, 32 + bob, m['bone'])
    px(im, cx + 1, 32 + bob, m['bone'])
    # solid veil rim, catching a little light
    for side in (-1, 1):
        for y in range(8 + bob, 32 + bob):
            ex = cx + side * (13 - abs(y - 21 - bob) // 4)
            px(im, ex, y, m['light'])
            px(im, ex - side, y, m['light'])
    # throat brooch
    rect(im, cx - 2, 35 + bob, cx + 2, 37 + bob, m['glow'])
    px(im, cx, 36 + bob, (255, 238, 246, 255))
    # cuffs, and fingers cut into the mitts
    for side in (-1, 1):
        ax = cx + side * 18
        hy = 50 + drop + bob // 2
        hspan(im, hy - 4, ax - 5, ax + 5, m['glowdim'])
        vspan(im, ax - 2, hy, hy + 6, m['bone_dark'])
        vspan(im, ax + 2, hy, hy + 6, m['bone_dark'])
        hspan(im, hy + 1, ax - 6, ax + 6, m['bone_shade'])
    # skirt folds and ragged hem
    for fox in (-11, -3, 5, 12):
        vspan(im, cx + fox, 42 + bob, 58, m['deep'] if fox % 2 else m['light'])
    hspan(im, 58, cx - 23, cx + 23, m['light'])
    hspan(im, 59, cx - 23, cx + 23, m['glowdim'])
    tatters(im, cx, 23, m, 3, 6)
    return im


# ---------------------------------------------------------------- father
def father(frame):
    im = blank()
    f = FATHER
    cx = 30
    bob = -1 if frame else 0
    swing = 2 if frame else 0

    # hunched shoulders, wide cowl, long robe
    ellipse(im, cx, 33 + bob, 18, 7, f['robe'])
    taper(im, 34 + bob, 63, 14, 20, cx, f['robe'], curve=1.5)
    ellipse(im, cx, 21 + bob, 15, 14, f['deep'])
    ellipse(im, cx, 25 + bob, 10, 11, f['socket'])

    # left arm hangs, right arm holds the lantern out
    taper(im, 36 + bob, 54, 4, 5, cx - 16, f['robe'], curve=1.1)
    ellipse(im, cx - 17, 57, 5, 5, f['bone'])
    taper(im, 36 + bob, 42 + swing, 4, 5, cx + 16, f['robe'], curve=1.1)
    ellipse(im, cx + 17, 44 + swing, 5, 5, f['bone'])

    # lantern: cap, brass cage, glass core, foot
    lx, ly = cx + 17, 48 + swing
    rect(im, lx - 3, ly - 5, lx + 3, ly - 4, f['brass'])
    rect(im, lx - 6, ly - 3, lx + 6, ly - 1, f['brass_dark'])
    rect(im, lx - 6, ly, lx + 6, ly + 10, f['brass'])
    rect(im, lx - 4, ly + 1, lx + 4, ly + 9, (10, 22, 34, 255))
    rect(im, lx - 3, ly + 2, lx + 3, ly + 8, f['glowdim'])
    rect(im, lx - 6, ly + 11, lx + 6, ly + 12, f['brass_dark'])

    # pale jaw under the cowl
    ellipse(im, cx, 35 + bob, 6, 4, f['bone'])

    outline(im, OUT, 2)

    # ---- linework on top of the outline
    for sx in (cx - 5, cx + 5):
        rect(im, sx - 2, 21 + bob, sx + 2, 25 + bob, (6, 12, 20, 255))
        rect(im, sx - 1, 22 + bob, sx + 1, 24 + bob, f['glow'] if frame else f['glowdim'])
        px(im, sx, 23 + bob, HILITE if frame else f['glow'])
    # teeth bitten out of the jaw
    hspan(im, 35 + bob, cx - 5, cx + 5, f['deep'])
    for k in (-3, 0, 3):
        rect(im, cx + k - 1, 32 + bob, cx + k, 35 + bob, f['bone'])
        px(im, cx + k, 34 + bob, (196, 194, 180, 255))
    # cowl edge, lit on one side only
    for y in range(14 + bob, 32 + bob):
        px(im, cx - (13 - abs(y - 21 - bob) // 5), y, f['light'])
    # shoulder highlight and robe folds
    hspan(im, 30 + bob, cx - 10, cx + 4, f['light'])
    for fox in (-12, -4, 6, 13):
        vspan(im, cx + fox, 42 + bob, 58, f['deep'] if fox % 2 else f['light'])
    # chest clasp
    rect(im, cx - 2, 39 + bob, cx + 2, 41 + bob, f['brass'])
    px(im, cx, 40 + bob, f['brass_dark'])
    # the light inside the cage
    rect(im, lx - 3, ly + 3, lx + 3, ly + 7, f['glow'] if frame else f['glowdim'])
    rect(im, lx - 2, ly + 3, lx + 2, ly + 7, (228, 248, 255, 255))
    px(im, lx, ly - 6, f['glow'])
    # hem
    hspan(im, 58, cx - 19, cx + 19, f['light'])
    hspan(im, 59, cx - 19, cx + 19, f['glowdim'])
    tatters(im, cx, 19, f, 3, 6)
    return im


def main():
    sheet = Image.open(SHEET).convert('RGBA')
    w, h = sheet.size
    cols = w // CELL
    if h != CELL * 2:
        sys.exit('unexpected boss sheet height %d' % h)
    if cols > 10:
        sys.exit('bosses.png already has %d columns; it is meant to gain two once' % cols)
    out = Image.new('RGBA', (CELL * (cols + 2), h), (0, 0, 0, 0))
    out.paste(sheet, (0, 0))
    for frame in (0, 1):
        out.paste(mother(frame), (cols * CELL, frame * CELL))
        out.paste(father(frame), ((cols + 1) * CELL, frame * CELL))
    out.save(SHEET)
    print('bosses.png -> %dx%d, mother=%d father=%d' % (out.size[0], out.size[1], cols, cols + 1))


if __name__ == '__main__':
    main()
