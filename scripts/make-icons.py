#!/usr/bin/env python3
"""Generates the icons in icons/ from Syncthing's own tray icons: symbolic ones,
and the full-colour logo for the info box.

The geometry is taken from https://github.com/syncthing/syncthing/tree/main/assets/statusicons
(MPL-2.0): the logo, a bite out of the bottom right corner, and a badge in it.
Symbolic icons are recoloured by forcing `fill`, so masks and strokes would break;
everything is flattened into filled paths with boolean operations instead.

    nix shell --impure --expr 'with import <nixpkgs> {}; python3.withPackages (p: [p.skia-pathops])' \
        -c python3 scripts/make-icons.py
"""
import math
import os

import pathops

K = 0.5522847498  # cubic Bézier approximation of a quarter circle

# Logo, from statusicons/default.svg
RING_CENTER, RING_RADIUS = (8, 7.9727402), 5.9557071
LINE_WIDTH = 0.81771719
HUB = (9.1993189, 8.776825)
NODES = [(2.262351, 9.4173737), (13.301533, 5.3696747), (11.788756, 12.51107)]
NODE_RADIUS = 1.22

# Bite and badge
BADGE_CENTER = (11.5, 11.5)
BITE_RADIUS, BADGE_RADIUS = 5.5, 4.5


def circle(center, r):
    cx, cy = center
    p = pathops.Path()
    p.moveTo(cx + r, cy)
    p.cubicTo(cx + r, cy + K * r, cx + K * r, cy + r, cx, cy + r)
    p.cubicTo(cx - K * r, cy + r, cx - r, cy + K * r, cx - r, cy)
    p.cubicTo(cx - r, cy - K * r, cx - K * r, cy - r, cx, cy - r)
    p.cubicTo(cx + K * r, cy - r, cx + r, cy - K * r, cx + r, cy)
    p.close()
    return p


def polygon(points):
    p = pathops.Path()
    p.moveTo(*points[0])
    for pt in points[1:]:
        p.lineTo(*pt)
    p.close()
    return p


def bar(a, b, width):
    """A stroked line from a to b without caps, like SVG's default butt cap."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    return polygon([(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny),
                    (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)])


def rect(x, y, w, h):
    return polygon([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])


def union(*paths):
    result = paths[0]
    for p in paths[1:]:
        result = pathops.op(result, p, pathops.PathOp.UNION)
    return result


def difference(a, b):
    return pathops.op(a, b, pathops.PathOp.DIFFERENCE)


def disc():
    return circle((8, 8), 8)


def mark():
    """Ring, lines and nodes: cut out of the symbolic logo, white in the coloured one."""
    ring = difference(circle(RING_CENTER, RING_RADIUS + LINE_WIDTH / 2),
                      circle(RING_CENTER, RING_RADIUS - LINE_WIDTH / 2))
    lines = [bar(HUB, node, LINE_WIDTH) for node in NODES]
    nodes = [circle(c, NODE_RADIUS) for c in [HUB, *NODES]]
    return union(ring, *lines, *nodes)


def logo():
    return difference(disc(), mark())


def rotated_rect(center, length, width, degrees):
    cx, cy = center
    a = math.radians(degrees)
    ux, uy = math.cos(a) * length / 2, math.sin(a) * length / 2
    vx, vy = -math.sin(a) * width / 2, math.cos(a) * width / 2
    return polygon([(cx - ux - vx, cy - uy - vy), (cx + ux - vx, cy + uy - vy),
                    (cx + ux + vx, cy + uy + vy), (cx - ux + vx, cy - uy + vy)])


def arrows():
    # statusicons/sync.svg, converted to absolute coordinates
    left = pathops.Path()
    left.moveTo(11.5, 14)
    left.lineTo(11.5, 13)
    left.cubicTo(10, 13, 10, 13, 10, 11)
    for pt in [(11, 11), (9.5, 9), (8, 11), (9, 11)]:
        left.lineTo(*pt)
    left.cubicTo(9, 14, 9, 14, 11.5, 14)
    left.close()
    right = pathops.Path()
    right.moveTo(11.5, 9)
    right.lineTo(11.5, 10)
    right.cubicTo(13, 10, 13, 10, 13, 12)
    for pt in [(12, 12), (13.5, 14), (15, 12), (14, 12)]:
        right.lineTo(*pt)
    right.cubicTo(14, 9, 14, 9, 11.5, 9)
    right.close()
    return union(left, right)


GLYPHS = {
    # statusicons/notify.svg
    'folder-issue': lambda: union(rect(11, 9, 1, 3), rect(11, 13, 1, 1)),
    # statusicons/pause.svg
    'paused': lambda: union(rect(10, 9, 1, 5), rect(12, 9, 1, 5)),
    'syncing': arrows,
    # Not in upstream: a cross in the same weight
    'error': lambda: union(rotated_rect(BADGE_CENTER, 4.6, 1, 45),
                           rotated_rect(BADGE_CENTER, 4.6, 1, -45)),
}


def with_badge(glyph):
    bitten = difference(logo(), circle(BADGE_CENTER, BITE_RADIUS))
    return union(bitten, difference(circle(BADGE_CENTER, BADGE_RADIUS), glyph))


def ignore_list():
    """A page with text lines, the bite, and a no-entry badge (a bar in the disc)."""
    page = difference(rect(2, 0.5, 11, 15), rect(3, 1.5, 9, 13))
    lines = union(rect(5, 4, 5, 1), rect(5, 7, 5, 1), rect(5, 10, 3, 1))
    bitten = difference(union(page, lines), circle(BADGE_CENTER, BITE_RADIUS))
    return union(bitten, difference(circle(BADGE_CENTER, BADGE_RADIUS), rect(9.25, 11, 4.5, 1)))


def fmt(n):
    s = f'{n:.3f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def to_d(path):
    out = []
    for verb, pts in path.segments:
        coords = ' '.join(f'{fmt(x)} {fmt(y)}' for x, y in pts)
        if verb == 'moveTo':
            out.append(f'M{coords}')
        elif verb == 'lineTo':
            out.append(f'L{coords}')
        elif verb == 'curveTo':
            out.append(f'C{coords}')
        elif verb == 'qCurveTo':
            out.append(f'Q{coords}')
        elif verb == 'closePath':
            out.append('Z')
        else:
            raise ValueError(verb)
    return ''.join(out)


# Full-colour logo, after Syncthing's app icon: a disc with a blue vertical
# gradient and the mark in white.
GRADIENT = ('<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#24b2da"/><stop offset="1" stop-color="#0a85c9"/>'
            '</linearGradient>')


def save(filename, svg):
    dest = os.path.join(os.path.dirname(__file__), '..', 'syncbeacon@whoozy82.github.io',
                        'icons', filename)
    with open(dest, 'w') as f:
        f.write(svg)
    print(f'{filename}: {len(svg)} bytes')


def write(name, path):
    save(f'syncbeacon-{name}-symbolic.svg',
         '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">\n'
         f'  <path fill="#2e3436" fill-rule="evenodd" d="{to_d(path)}"/>\n'
         '</svg>\n')


def write_colored(name):
    white = pathops.op(disc(), mark(), pathops.PathOp.INTERSECTION)
    save(f'syncbeacon-{name}.svg',
         '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">\n'
         f'  <defs>{GRADIENT}</defs>\n'
         f'  <path fill="url(#blue)" d="{to_d(disc())}"/>\n'
         f'  <path fill="#ffffff" fill-rule="evenodd" d="{to_d(white)}"/>\n'
         '</svg>\n')


def main():
    write('syncthing', logo())
    write('in-sync', logo())
    for state, glyph in GLYPHS.items():
        write(state, with_badge(glyph()))
    write('ignore', ignore_list())
    write_colored('syncthing')


if __name__ == '__main__':
    main()
