"""The pictures of the tutorial "Ein interaktives Video erstellen" (SVG, into assets/): flat, clean shapes in the colours of the module - no hand drawing, so that
the module does not look like "Mit Lernmodulen arbeiten". Icons are 200 x 200; rings, arrows and the marker are made to measure (see kit.py)."""
import math
import pathlib

OUT = pathlib.Path(__file__).parent / "assets"
BG, PANEL, LINE = "#0f1629", "#17223d", "#3a4a70"
AMBER, TEAL, CORAL, BLUE, PAPER_TEXT = "#ffb400", "#2dd4bf", "#ff6b5e", "#5b8def", "#e9edf7"
DARK = "#0f1629"


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>\n'


def save(name, w, h, body):
    OUT.mkdir(exist_ok=True)
    (OUT / name).write_text(svg(w, h, body))


def star_points(cx, cy, r_out, r_in, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return " ".join(pts)


def icon_clapper():
    stripes = "".join(f'<polygon points="{28 + i * 30},52 {52 + i * 30},52 {36 + i * 30},82 {12 + i * 30},82" fill="{AMBER if i % 2 == 0 else DARK}"/>' for i in range(6))
    return (
        f'<rect x="28" y="88" width="144" height="82" rx="10" fill="{PAPER_TEXT}"/>'
        f'<rect x="46" y="110" width="70" height="9" rx="4.5" fill="#aab6d3"/><rect x="46" y="130" width="108" height="9" rx="4.5" fill="#aab6d3"/><rect x="46" y="150" width="50" height="9" rx="4.5" fill="#aab6d3"/>'
        f'<g transform="rotate(-10 28 84)"><clipPath id="c"><rect x="28" y="52" width="144" height="30" rx="7"/></clipPath><rect x="28" y="52" width="144" height="30" rx="7" fill="{DARK}"/><g clip-path="url(#c)">{stripes}</g></g>'
        f'<rect x="28" y="82" width="144" height="12" rx="4" fill="{DARK}"/>'
    )


def icon_clock():
    return (
        f'<rect x="86" y="24" width="28" height="13" rx="4" fill="#9fb0cc"/><rect x="94" y="36" width="12" height="12" fill="#9fb0cc"/>'
        f'<rect x="146" y="46" width="22" height="11" rx="4" fill="#9fb0cc" transform="rotate(40 157 51)"/>'
        f'<circle cx="100" cy="114" r="62" fill="{TEAL}"/><circle cx="100" cy="114" r="50" fill="{DARK}"/>'
        f'<path d="M100 114 L100 78 M100 114 L126 128" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none"/><circle cx="100" cy="114" r="7" fill="#ffffff"/>'
    )


def icon_note():
    return (
        f'<path d="M36 52 a16 16 0 0 1 16 -16 H148 a16 16 0 0 1 16 16 V120 L120 164 H52 a16 16 0 0 1 -16 -16 Z" fill="{AMBER}"/>'
        f'<path d="M120 164 V132 a12 12 0 0 1 12 -12 H164 Z" fill="#c78a00"/>'
        f'<rect x="56" y="66" width="88" height="9" rx="4.5" fill="{DARK}"/><rect x="56" y="88" width="88" height="9" rx="4.5" fill="{DARK}"/><rect x="56" y="110" width="50" height="9" rx="4.5" fill="{DARK}"/>'
    )


def icon_cursor():
    return (
        f'<rect x="24" y="40" width="134" height="86" rx="14" fill="{TEAL}"/>'
        f'<rect x="44" y="62" width="94" height="9" rx="4.5" fill="{DARK}"/><rect x="44" y="84" width="60" height="9" rx="4.5" fill="{DARK}"/>'
        f'<path d="M104 96 V176 L124 158 L140 190 L154 183 L138 152 L166 150 Z" fill="#ffffff" stroke="{DARK}" stroke-width="6" stroke-linejoin="round"/>'
    )


def icon_fork():
    return (
        f'<path d="M100 164 V112 L54 70 M100 112 L146 70" stroke="#e5e9f5" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<circle cx="100" cy="170" r="16" fill="{BLUE}"/><circle cx="54" cy="46" r="24" fill="{CORAL}"/><circle cx="146" cy="46" r="24" fill="{TEAL}"/>'
        f'<path d="M44 46 L52 54 L66 38" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    )


def icon_cards():
    return (
        f'<rect x="20" y="34" width="76" height="66" rx="12" fill="{CORAL}"/><rect x="104" y="100" width="76" height="66" rx="12" fill="{PAPER_TEXT}"/>'
        f'<path d="M96 66 C124 66 130 82 130 96" stroke="#e5e9f5" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M120 90 L130 102 L141 90" stroke="#e5e9f5" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<rect x="36" y="58" width="44" height="8" rx="4" fill="{DARK}"/><rect x="120" y="124" width="44" height="8" rx="4" fill="{DARK}"/>'
    )


def icon_star():
    return f'<polygon points="{star_points(100, 106, 76, 32)}" fill="{AMBER}" stroke="{AMBER}" stroke-width="10" stroke-linejoin="round"/>'


def icon_check():
    return f'<circle cx="100" cy="100" r="76" fill="{TEAL}"/><path d="M62 104 L90 132 L140 74" stroke="{DARK}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'


def icon_play():
    return f'<circle cx="100" cy="100" r="76" fill="{AMBER}"/><path d="M82 66 L140 100 L82 134 Z" fill="{DARK}" stroke="{DARK}" stroke-width="8" stroke-linejoin="round"/>'


def timeline(w=1000, h=110):
    """a bar for a video with two time marks on it: one that does not stop it (teal) and one that does (coral, with a pause sign)"""
    return svg(w, h, (
        f'<rect x="20" y="49" width="960" height="14" rx="7" fill="{LINE}"/><rect x="20" y="49" width="620" height="14" rx="7" fill="{BLUE}"/>'
        f'<circle cx="300" cy="56" r="22" fill="{TEAL}" stroke="{BG}" stroke-width="6"/>'
        f'<circle cx="640" cy="56" r="22" fill="{CORAL}" stroke="{BG}" stroke-width="6"/>'
        f'<rect x="632" y="46" width="6" height="20" rx="2" fill="#ffffff"/><rect x="643" y="46" width="6" height="20" rx="2" fill="#ffffff"/>'
    ))


def timeline3(w=1000, h=110):
    """a bar for a video with three time marks that stop it (coral, with a pause sign)"""
    body = f'<rect x="20" y="49" width="960" height="14" rx="7" fill="{LINE}"/><rect x="20" y="49" width="780" height="14" rx="7" fill="{BLUE}"/>'
    for x in (200, 500, 800):
        body += f'<circle cx="{x}" cy="56" r="22" fill="{CORAL}" stroke="{BG}" stroke-width="6"/><rect x="{x - 8}" y="46" width="6" height="20" rx="2" fill="#ffffff"/><rect x="{x + 3}" y="46" width="6" height="20" rx="2" fill="#ffffff"/>'
    return svg(w, h, body)


def marker():
    return svg(100, 100, f'<circle cx="50" cy="50" r="46" fill="{AMBER}" stroke="{BG}" stroke-width="6"/>')


def ring_svg(path, w, h, color=AMBER, width=4.5):
    w, h = int(round(w)), int(round(h))
    path.write_text(svg(w, h, f'<ellipse cx="{w / 2}" cy="{h / 2}" rx="{w / 2 - width}" ry="{h / 2 - width}" fill="none" stroke="{color}" stroke-width="{width}"/>'))


def arrow_svg(path, w, h, x0, y0, x1, y1, bend=0.25, color=AMBER, width=4.5):
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
    path.write_text(svg(w, h, f'<path d="M{x0:.1f} {y0:.1f} Q{cx:.1f} {cy:.1f} {bx:.1f} {by:.1f}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/><polygon points="{head}" fill="{color}"/>'))


def build():
    OUT.mkdir(exist_ok=True)
    for name, fn in {"clapper": icon_clapper, "clock": icon_clock, "note": icon_note, "cursor": icon_cursor, "fork": icon_fork, "cards": icon_cards, "star": icon_star, "check": icon_check, "play": icon_play}.items():
        save(f"icon_{name}.svg", 200, 200, fn())
    (OUT / "timeline.svg").write_text(timeline())
    (OUT / "timeline3.svg").write_text(timeline3())
    (OUT / "marker.svg").write_text(marker())


if __name__ == "__main__":
    build()
    print("ok")
