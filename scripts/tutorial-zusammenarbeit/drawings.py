"""The pictures of the tutorial "Gemeinsam an einem Weft-Dokument arbeiten" (SVG, into assets/): thin glowing lines on near-black - a digital world in the manner of
Tron: a perspective floor of lines, a network of nodes, icons made of one line, diagrams. Cyan is the colour of the world, orange the one of what matters.
No words in any of them (words are blocks of the slide, so they are translated) - except file names in the picture of the folder, which are no language."""
import math
import pathlib

OUT = pathlib.Path(__file__).parent / "assets"
BG, PANEL, GRID = "#02060d", "#071524", "#0b3547"
CYAN, CYAN_D, ORANGE, INK, MUTED = "#26e6ff", "#0e7c94", "#ff8a1f", "#e6faff", "#86aebd"

DEFS = (
    '<defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    '<filter id="G" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
)


def svg(w, h, body, defs=DEFS):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{defs}{body}</svg>\n'


def save(name, w, h, body):
    OUT.mkdir(exist_ok=True)
    (OUT / name).write_text(svg(w, h, body))


def line(d, color=CYAN, width=6, glow="g", fill="none", extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" filter="url(#{glow})" {extra}/>'


# ---- backgrounds ---------------------------------------------------------------------------------------------------------------
def bracket(x, y, sx, sy, n=34):
    return line(f"M{x} {y + sy * n} V{y} H{x + sx * n}", CYAN, 2.5)


def bg_content():
    body = f'<rect width="1280" height="720" fill="{BG}"/>'
    body += '<radialGradient id="r" cx="88%" cy="6%" r="75%"><stop offset="0" stop-color="#26e6ff" stop-opacity=".16"/><stop offset="1" stop-color="#26e6ff" stop-opacity="0"/></radialGradient><rect width="1280" height="720" fill="url(#r)"/>'
    # a faint grid: the world the slide is in
    grid = "".join(f'M{x} 0V720' for x in range(0, 1281, 64)) + "".join(f'M0 {y}H1280' for y in range(0, 721, 64))
    body += f'<path d="{grid}" stroke="{CYAN}" stroke-opacity=".055" stroke-width="1" fill="none"/>'
    body += bracket(26, 22, 1, 1) + bracket(1254, 22, -1, 1) + bracket(26, 698, 1, -1) + bracket(1254, 698, -1, -1)
    # a trace at the right edge: a line, a bend, ticks, a node
    body += line("M1256 120V300L1240 316V470", CYAN_D, 2, "g", extra='opacity=".8"')
    body += "".join(f'<path d="M1256 {y}h-8" stroke="{CYAN_D}" stroke-width="2"/>' for y in range(140, 300, 20))
    body += f'<circle cx="1240" cy="470" r="5" fill="{ORANGE}" filter="url(#g)"/>'
    return body


def bg_title():
    body = f'<rect width="1280" height="720" fill="{BG}"/>'
    body += '<radialGradient id="r" cx="50%" cy="63%" r="60%"><stop offset="0" stop-color="#26e6ff" stop-opacity=".22"/><stop offset="1" stop-color="#26e6ff" stop-opacity="0"/></radialGradient><rect width="1280" height="720" fill="url(#r)"/>'
    horizon = 452
    # the floor: lines that run to a point on the horizon, and lines across that crowd together towards it (fading out towards the horizon)
    body += '<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26e6ff" stop-opacity="0"/><stop offset=".25" stop-color="#26e6ff" stop-opacity=".55"/><stop offset="1" stop-color="#26e6ff" stop-opacity=".95"/></linearGradient>'
    floor = ""
    for xb in range(-1400, 2700, 170):
        t = (720 - horizon)
        floor += f'M640 {horizon}L{xb} 720'
    for k in range(1, 12):
        y = horizon + (720 - horizon) * (k / 11) ** 2.1
        floor += f'M0 {y:.1f}H1280'
    body += f'<path d="{floor}" stroke="url(#f)" stroke-width="1.6" fill="none" stroke-opacity=".6"/>'
    body += f'<path d="M0 {horizon}H1280" stroke="{CYAN}" stroke-width="2.4" filter="url(#G)"/>'
    body += bracket(26, 22, 1, 1) + bracket(1254, 22, -1, 1) + bracket(26, 698, 1, -1) + bracket(1254, 698, -1, -1)
    return body


# ---- the network of the title slide: people, connected - and the cover -------------------------------------------------------------
NODES = [(250, 200, 50, ORANGE), (70, 110, 30, CYAN), (430, 90, 30, CYAN), (90, 330, 30, CYAN), (420, 320, 30, CYAN), (250, 50, 18, CYAN_D), (250, 360, 18, CYAN_D)]
EDGES = [(0, 1), (0, 2), (0, 3), (0, 4), (1, 5), (2, 5), (3, 6), (4, 6), (1, 3), (2, 4)]


def person(cx, cy, r, color, width=4):
    """a person made of two lines: head and shoulders, in a circle of radius r"""
    h = r * 0.34
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{BG}" stroke="{color}" stroke-width="{width}" filter="url(#g)"/>'
        f'<circle cx="{cx}" cy="{cy - r * 0.2}" r="{h}" fill="none" stroke="{color}" stroke-width="{width}"/>'
        f'<path d="M{cx - r * 0.55} {cy + r * 0.62}C{cx - r * 0.5} {cy + r * 0.15} {cx + r * 0.5} {cy + r * 0.15} {cx + r * 0.55} {cy + r * 0.62}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'
    )


def network(w=500, h=410):
    body = ""
    for a, b in EDGES:
        (x0, y0, _, _), (x1, y1, _, _) = NODES[a], NODES[b]
        body += line(f"M{x0} {y0}L{x1} {y1}", CYAN, 2.4, "g", extra='opacity=".85"')
        # a packet on its way, near the middle
        body += f'<circle cx="{x0 + (x1 - x0) * 0.58:.1f}" cy="{y0 + (y1 - y0) * 0.58:.1f}" r="4.5" fill="#ffffff" filter="url(#g)"/>'
    for x, y, r, color in NODES:
        body += person(x, y, r, color, 4.5 if r > 20 else 3.5) if r > 20 else f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BG}" stroke="{color}" stroke-width="3" filter="url(#g)"/><circle cx="{x}" cy="{y}" r="5" fill="{color}"/>'
    return svg(w, h, body)


def cover():
    """the cover picture (the tile on the start screen): the floor and the network - nothing written on it"""
    inner = bg_title()
    scale = 1.45
    net = network().split("</defs>")[1].rsplit("</svg>", 1)[0]
    return svg(1280, 720, inner + f'<g transform="translate({640 - 250 * scale:.0f} {232 - 200 * scale + 40:.0f}) scale({scale})">{net}</g>')


# ---- icons: one line, 200 x 200 ----------------------------------------------------------------------------------------------------------------
def icon_link():
    return (
        f'<g transform="rotate(-45 100 100)"><rect x="24" y="72" width="96" height="56" rx="28" fill="none" stroke="{CYAN}" stroke-width="9" filter="url(#g)"/>'
        f'<rect x="80" y="72" width="96" height="56" rx="28" fill="none" stroke="{ORANGE}" stroke-width="9" filter="url(#g)"/></g>'
    )


def icon_file():
    return (
        line("M52 26H112L150 64V174H52Z", CYAN, 7) + line("M112 26V64H150", CYAN, 7)
        + line("M72 96H128M72 120H112", CYAN_D, 6)
        + f'<circle cx="138" cy="148" r="30" fill="{BG}" stroke="{ORANGE}" stroke-width="7" filter="url(#g)"/>'
        + line("M127 148h22M146 140l8 8-8 8", ORANGE, 6, glow="g")
    )


def icon_cloud():
    return line("M56 138H148a30 30 0 0 0 4-60 46 46 0 0 0-88-8 36 36 0 0 0-8 68Z", CYAN, 8) + line("M86 118V150M86 150L74 138M86 150L98 138", ORANGE, 7) + line("M114 150V118M114 118L102 130M114 118L126 130", CYAN, 7)


def icon_folder():
    return line("M24 60H78L94 80H176V160H24Z", CYAN, 8) + line("M24 96H176", CYAN_D, 6) + f'<circle cx="152" cy="128" r="14" fill="none" stroke="{ORANGE}" stroke-width="6"/>'


def icon_server():
    body = ""
    for y in (30, 82, 134):
        body += f'<rect x="32" y="{y}" width="136" height="40" rx="9" fill="none" stroke="{ORANGE}" stroke-width="7" filter="url(#g)"/><circle cx="58" cy="{y + 20}" r="5" fill="{ORANGE}"/><path d="M84 {y + 20}h60" stroke="{ORANGE}" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>'
    return body


def icon_laptop():
    return line("M42 52H158a6 6 0 0 1 6 6V132H36V58a6 6 0 0 1 6-6Z", CYAN, 7) + line("M14 152H186L172 166H28Z", CYAN, 7)


def icon_person():
    return f'<circle cx="100" cy="68" r="32" fill="none" stroke="{CYAN}" stroke-width="8" filter="url(#g)"/>' + line("M38 170C38 120 162 120 162 170", CYAN, 8)


def icon_people():
    return (
        f'<circle cx="72" cy="70" r="26" fill="none" stroke="{CYAN}" stroke-width="7" filter="url(#g)"/>' + line("M26 164C26 122 118 122 118 164", CYAN, 7)
        + f'<circle cx="138" cy="84" r="22" fill="none" stroke="{ORANGE}" stroke-width="7" filter="url(#g)"/>' + line("M104 168C104 136 172 136 172 168", ORANGE, 7)
    )


def icon_clock():
    return f'<circle cx="100" cy="100" r="70" fill="none" stroke="{CYAN}" stroke-width="8" filter="url(#g)"/>' + line("M100 56V100L132 118", ORANGE, 8)


def icon_check():
    return f'<circle cx="100" cy="100" r="72" fill="none" stroke="{CYAN}" stroke-width="8" filter="url(#g)"/>' + line("M64 104L90 130L138 76", ORANGE, 10)


def icon_wall():
    body = ""
    for row in range(5):
        y = 28 + row * 28
        off = 0 if row % 2 == 0 else 22
        for x in range(-22 + off, 200, 44):
            x0, x1 = max(30, x), min(170, x + 44)
            if x1 - x0 > 8:
                body += f'<rect x="{x0 + 2}" y="{y + 2}" width="{x1 - x0 - 4}" height="24" rx="3" fill="none" stroke="{ORANGE}" stroke-width="5" filter="url(#g)"/>'
    return body


# ---- diagrams ------------------------------------------------------------------------------------------------------------------------------------
def arrow_head(x, y, ang, color, size=16):
    a1, a2 = ang + math.radians(150), ang - math.radians(150)
    return f'<path d="M{x:.1f} {y:.1f}L{x + size * math.cos(a1):.1f} {y + size * math.sin(a1):.1f}M{x:.1f} {y:.1f}L{x + size * math.cos(a2):.1f} {y + size * math.sin(a2):.1f}" stroke="{color}" stroke-width="5" stroke-linecap="round" fill="none"/>'


def icon_at(fn, x, y, size, scale_to=200):
    k = size / scale_to
    return f'<g transform="translate({x - size / 2:.1f} {y - size / 2:.1f}) scale({k:.3f})">{fn()}</g>'


def diagram_turn(w=1000, h=430, part=None):
    """two computers behind a wall (the network): the direct way is blocked (part "a"), the way over the TURN server is open (part "b"); both: part None"""
    body = ""
    if part in (None, "a"):
        body += icon_at(icon_laptop, 110, 320, 170) + icon_at(icon_laptop, 890, 320, 170)
        body += icon_at(icon_wall, 500, 300, 190)
        # the direct way: dashed, stops short of the wall, with a cross
        body += f'<path d="M205 316H368" stroke="{CYAN_D}" stroke-width="4" stroke-dasharray="14 12" stroke-linecap="round"/>'
        body += f'<path d="M382 296l24 40M406 296l-24 40" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round" filter="url(#g)"/>'
    if part in (None, "b"):
        body += icon_at(icon_server, 500, 90, 130)
        # the way over the server: out, over the wall, in
        body += line("M150 238L430 110", CYAN, 5) + arrow_head(430, 110, math.atan2(110 - 238, 430 - 150), CYAN)
        body += line("M570 110L850 238", CYAN, 5) + arrow_head(850, 238, math.atan2(238 - 110, 850 - 570), CYAN)
    return svg(w, h, body)


def diagram_cloud(w=1000, h=430):
    """two computers with the same file, and the folder in the cloud between them: what one writes, the other reads"""
    body = icon_at(icon_laptop, 110, 320, 170) + icon_at(icon_laptop, 890, 320, 170)
    body += icon_at(icon_cloud, 500, 120, 190)
    body += icon_at(icon_file, 110, 206, 92) + icon_at(icon_file, 890, 206, 92)
    for sx, sy, ex, ey, c in ((178, 246, 408, 144, CYAN), (822, 246, 592, 144, CYAN)):
        body += line(f"M{sx} {sy}L{ex} {ey}", c, 5, extra='stroke-dasharray="2 14"')
        body += arrow_head(ex, ey, math.atan2(ey - sy, ex - sx), c) + arrow_head(sx, sy, math.atan2(sy - ey, sx - ex), c)
    return svg(w, h, body)


def tree(w=1000, h=300):
    """the folder of a module in the shared folder: its link file, one file of changes for each person, and the pictures"""
    mono = 'font-family="Menlo, Consolas, \'DejaVu Sans Mono\', monospace" font-size="27"'
    body = f'<rect x="3" y="3" width="{w - 6}" height="{h - 6}" rx="20" fill="{PANEL}" stroke="{CYAN_D}" stroke-width="3"/>'
    rows = [
        (50, "folder", "erdkunde-7a-7ee653a5/", 0, CYAN),
        (112, "file", "Erdkunde 7a.weft", 1, INK),
        (168, "file", "peer-k3f9a2.automerge", 1, INK),
        (224, "file", "peer-x81b0q.automerge", 1, INK),
        (276, "folder", "assets/", 1, MUTED),
    ]
    body += f'<path d="M60 70V272" stroke="{CYAN_D}" stroke-width="3"/>'
    for y, kind, name, depth, color in rows:
        x = 40 + depth * 56
        if depth:
            body += f'<path d="M60 {y - 9}H{x - 8}" stroke="{CYAN_D}" stroke-width="3"/>'
        glyph = (
            f'<path d="M{x} {y - 22}h14l5 6h17v26h-36z" fill="none" stroke="{color}" stroke-width="3.5" stroke-linejoin="round"/>' if kind == "folder"
            else f'<path d="M{x + 4} {y - 24}h20l10 10v28h-30z M{x + 24} {y - 24}v10h10" fill="none" stroke="{color}" stroke-width="3.5" stroke-linejoin="round"/>'
        )
        body += glyph + f'<text x="{x + 52}" y="{y}" {mono} fill="{color}">{name.replace("&", "&amp;")}</text>'
    return svg(w, h, body)


def marker():
    return svg(100, 100, f'<circle cx="50" cy="50" r="44" fill="{BG}" stroke="{ORANGE}" stroke-width="6" filter="url(#g)"/>')


def ring_svg(path, w, h, color=ORANGE, width=4.5):
    w, h = int(round(w)), int(round(h))
    path.write_text(svg(w, h, f'<ellipse cx="{w / 2}" cy="{h / 2}" rx="{w / 2 - width - 4}" ry="{h / 2 - width - 4}" fill="none" stroke="{color}" stroke-width="{width}" filter="url(#g)"/>'))


def arrow_svg(path, w, h, x0, y0, x1, y1, bend=0.25, color=ORANGE, width=4.5):
    """an arrow from (x0, y0) to (x1, y1) in a canvas of w x h pixels: a curve with a head"""
    w, h = int(round(w)), int(round(h))
    dx, dy = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2 - dy * bend, (y0 + y1) / 2 + dx * bend
    tx, ty = x1 - cx, y1 - cy
    ln = math.hypot(tx, ty) or 1
    tx, ty = tx / ln, ty / ln
    size = 15
    bx, by = x1 - tx * size, y1 - ty * size
    head = f"{x1:.1f},{y1:.1f} {bx - ty * size * 0.55:.1f},{by + tx * size * 0.55:.1f} {bx + ty * size * 0.55:.1f},{by - tx * size * 0.55:.1f}"
    path.write_text(svg(w, h, f'<g filter="url(#g)"><path d="M{x0:.1f} {y0:.1f} Q{cx:.1f} {cy:.1f} {bx:.1f} {by:.1f}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/><polygon points="{head}" fill="{color}"/></g>'))


def build():
    OUT.mkdir(exist_ok=True)
    save("bg_content.svg", 1280, 720, bg_content())
    save("bg_title.svg", 1280, 720, bg_title())
    (OUT / "hero.svg").write_text(network())
    (OUT / "cover.svg").write_text(cover())
    for name, fn in {"link": icon_link, "file": icon_file, "cloud": icon_cloud, "folder": icon_folder, "server": icon_server, "laptop": icon_laptop, "person": icon_person,
                     "people": icon_people, "clock": icon_clock, "check": icon_check, "wall": icon_wall}.items():
        save(f"icon_{name}.svg", 200, 200, fn())
    (OUT / "diagram_turn.svg").write_text(diagram_turn())
    (OUT / "diagram_cloud.svg").write_text(diagram_cloud())
    (OUT / "tree.svg").write_text(tree())
    (OUT / "marker.svg").write_text(marker())


if __name__ == "__main__":
    build()
    print("ok")
