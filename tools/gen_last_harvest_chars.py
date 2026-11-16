#!/usr/bin/env python3
"""Append a batch of new characters to img/last-harvest/people.png.

The atlas is a stack of 16x16 cells, 2 columns per row: column 0 faces the
player, column 1 faces away. Each new character starts from a complete
existing row so the body, face and outline stay pixel-identical to the pack,
then swaps the hat rows and recolours it into a new outfit.
"""
import sys
from PIL import Image

ATLAS = 'img/last-harvest/people.png'
PREVIEW = '../artifacts/new-chars-draft.png'
BASE_ROW = 31          # steel-helmed townsperson, full 2-column row

O = '#3f2631'
SKIN = '#bd6c4a'


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def row(*segments):
    s = ''.join(segments)
    if len(s) != 16:
        raise SystemExit('row is %d wide: %r' % (len(s), s))
    return s


BLANK = '.' * 16
# hat rows, drawn over rows 0-2 of the base character
HATS = {
    'miller': [BLANK,
               row('...', 'AAAAAAAAAA', '...'),
               row('AAAAAAAAAAAAAAAA')],
    'elder': [BLANK,
              row('....', 'AAAAAAAA', '....'),
              row('...', 'A', 'WWWWWWWW', 'A', '...')],
    'scout': [BLANK,
              row('...', 'AAAAAAAAAA', '...'),
              row('..', 'AAAAAAAAAAAA', '..')],
    'guard': [row('.......', 'LL', '.......'),
              row('...', 'AAAAAAAAAA', '...'),
              row('..', 'AAAAAAAAAAAA', '..')],
    'wanderer': [BLANK,
                 row('...', 'AAAAAAAAAA', '...'),
                 row('..', 'AAAAAAAAAAAA', '..')],
    'merchant': [BLANK,
                 row('...', 'AAAAAAAAAA', '...'),
                 row('..', 'AAAAAAAAAAAA', '..')],
}

# front: helmet colour, band/trouser colour; back: same but hair/hat colour
LOOKS = {
    'miller':   ('#b4b18b', '#763b36', '#763b36'),
    'elder':    ('#763b36', '#44262b', '#e9e6ef'),
    'scout':    ('#36763b', '#44262b', '#4ca361'),
    'guard':    ('#c0cbdc', '#4c62a3', '#52607c'),
    'wanderer': ('#703676', '#44262b', '#703676'),
    'merchant': ('#36763b', '#763b36', '#763b36'),
}


def rows_of(cell):
    px = cell.load()
    out = []
    for y in range(16):
        line = []
        for x in range(16):
            p = px[x, y]
            line.append('.') if p[3] == 0 else line.append('#%02x%02x%02x' % p[:3])
        out.append(line)
    return out


HAT_COLOURS = {'A': O, 'W': '#e9e6ef', 'L': '#9b4ca3', 'U': '#703676', 'V': '#a34c62'}


def paint(grid, colour_map, hat):
    """colour_map: hex string -> hex string; hat: leading rows of palette letters."""
    out = []
    for y, line in enumerate(grid):
        if y < len(hat):
            cells = []
            for c in hat[y]:
                if c == '.':
                    cells.append('.')
                else:
                    if c not in HAT_COLOURS:
                        raise SystemExit('unknown hat letter %r' % c)
                    cells.append(HAT_COLOURS[c])
            out.append(cells)
        else:
            out.append([colour_map.get(v, v) for v in line])
    return out


def to_img(grid):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, line in enumerate(grid):
        for x, v in enumerate(line):
            if v != '.':
                px[x, y] = hx(v)
    return im


def build(name, atlas):
    helmet, band, hair = LOOKS[name]
    front_map = {'#c0cbdc': helmet, '#365b76': band}
    back_map = {'#c0cbdc': helmet, '#365b76': hair}
    hat = HATS[name]
    front = paint(rows_of(atlas.crop((0, BASE_ROW * 16, 16, BASE_ROW * 16 + 16))), front_map, hat)
    back = paint(rows_of(atlas.crop((16, BASE_ROW * 16, 32, BASE_ROW * 16 + 16))), back_map, hat)
    return to_img(front), to_img(back)


def main():
    atlas = Image.open(ATLAS).convert('RGBA')
    names = list(HATS)
    sheet = Image.new('RGBA', (2 * 16 * 7 + 12, len(names) * 16 * 7 + 8), (40, 34, 28, 255))
    built = {}
    for i, name in enumerate(names):
        built[name] = build(name, atlas)
        sheet.alpha_composite(built[name][0].resize((112, 112), Image.NEAREST), (4, 4 + i * 112))
        sheet.alpha_composite(built[name][1].resize((112, 112), Image.NEAREST), (4 + 112, 4 + i * 112))
    sheet.save(PREVIEW)

    if '--write' in sys.argv:
        start = atlas.size[1] // 16
        out = Image.new('RGBA', (atlas.size[0], (start + len(names)) * 16), (0, 0, 0, 0))
        out.paste(atlas, (0, 0))
        for i, name in enumerate(names):
            front, back = built[name]
            out.paste(front, (0, (start + i) * 16))
            out.paste(back, (16, (start + i) * 16))
        out.save(ATLAS)
        print('appended rows %d..%d' % (start, start + len(names) - 1))
    print('characters:', names)


if __name__ == '__main__':
    main()
