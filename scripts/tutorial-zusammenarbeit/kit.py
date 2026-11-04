"""The helpers the slides of the tutorial are made with (adapted from ../tutorial-interaktive-videos/kit.py): every call adds operations of `weft edit` to `ops`;
`text` and `pic` give blocks a place in percent of the slide (16:9). The look - colours, font - is at the top: near-black, cyan lines, orange for what matters."""
import math
import pathlib

import drawings

HERE = pathlib.Path(__file__).parent
A = HERE / "assets"
BG, PANEL, PANEL2 = "#02060d", "#071524", "#0b1d31"
INK, MUTED, CYAN, CYAN_D, ORANGE = "#e6faff", "#8fb4c2", "#26e6ff", "#0e7c94", "#ff8a1f"
DARK = "#02060d"
HEAD, BODY = "Unbounded", "Ubuntu"  # (both have the letters of Turkish and Polish; "Orbitron" and "Exo 2" would be nearer to Tron, but the one lacks them and the other does not load)
PX, PY = 12.8, 7.2  # pixels per percent of a 1280 x 720 slide

ops = []


def op(**kw):
    ops.append(kw)


def fx(motion="up", ms=500):
    return {"type": "fade", "durationMs": ms, "motion": motion}


def glow(color=CYAN, blur=0.9, opacity=0.8):
    return {"color": color, "opacity": opacity, "blur": blur, "offsetX": 0, "offsetY": 0}


def estimate(content, paragraphs, w, size, font, bold, gap, line, box, slack=1.0):
    """height in percent of the slide: lines x size x line height, in cqw (1 cqw = 1.78 % at 16:9), with some air"""
    per = (0.70 if font == HEAD else (0.52 if bold else 0.46)) * slack  # width of a letter, in units of the size
    paras = []
    if paragraphs is not None:
        for para in paragraphs:
            paras.append(sum((len(part) if isinstance(part, str) else len(part["text"]) * (part.get("size", size) / size)) for part in para))
    else:
        paras = [len(t) for t in content.split("\n")]
    inner = w - (2 * box.get("padding", 0) if box else 0)
    lines = sum(max(1, math.ceil(n * size * per / inner)) for n in paras)
    pad = 2 * box.get("padding", 0) * 1.78 if box else 0
    return round(lines * size * line * 1.78 + (len(paras) - 1) * gap * 1.78 + pad + 1.2, 1)


def text(page, content, x, y, w, size=2.4, color=INK, font=BODY, bold=False, align="left", effect=None, name=None, as_=None, paragraphs=None, gap=1.0, h=None, line=1.25, box=None):
    o = {"op": "add_text", "page": page, "x": x, "y": y, "width": w, "size": size, "color": color, "font": font, "bold": bold, "align": align, "gap": gap, "lineHeight": line}
    if paragraphs is not None:
        o["paragraphs"] = paragraphs
    else:
        o["text"] = content
    # translations are longer than the German: the box has room for a good deal more than the German needs (a box that is higher than its text costs
    # nothing - it is not seen - but one that is lower cuts the text off)
    need = round(estimate(content, paragraphs, w, size, font, bold, gap, line, box) * 1.5, 1)
    h = min(max(h or 0, need), round(99.5 - y, 1))
    o["height"] = h
    if box:
        o["box"] = box
    if effect:
        o["effect"] = effect
    if name:
        o["name"] = name
    if as_:
        o["as"] = as_
    ops.append(o)


def square(w):
    """height (percent of the slide) of a square picture that is w percent wide (16:9)"""
    return round(w * 16 / 9, 2)


_auto = [0]


def pic(page, file, x, y, w, h=None, effect=None, name=None, as_=None, layout=None):
    pos = {"x": x, "y": y, "width": w, "height": h if h is not None else square(w)}
    o = {"op": "add_image", "file": str(A / file), "alt": "", "position": pos, "fit": False}
    if layout:
        o["layout"] = layout
    else:
        o["page"] = page
    if not as_:
        _auto[0] += 1
        as_ = f"auto{_auto[0]}"
    o["as"] = as_
    ops.append(o)
    if effect:
        ops.append({"op": "update_block", "block": "$" + as_, "set": {"entranceEffect": effect}})
    if name:
        ops.append({"op": "update_block", "block": "$" + as_, "set": {"name": name}})


def heading(page, title, size=3.6, w=86, y=6.5):
    """the heading and, under it, a line of light with an orange cap at its start; returns the y below it"""
    h = estimate(title, None, w, size, HEAD, True, 1.0, 1.2, None)
    text(page, title, 7, y, w, size=size, font=HEAD, bold=True, name="Überschrift", h=h, line=1.2)
    ul = y + h + 0.3
    ops.append({"op": "add_shape", "page": page, "shape": "rectangle", "x": 7, "y": ul, "width": 40, "height": 0.28, "color": CYAN, "radius": 50, "shadow": glow(CYAN, 0.8, 0.9), "name": "Linie"})
    ops.append({"op": "add_shape", "page": page, "shape": "rectangle", "x": 7, "y": ul - 0.25, "width": 5, "height": 0.8, "color": ORANGE, "radius": 50, "shadow": glow(ORANGE, 0.8, 0.9), "name": "Kappe"})
    return ul + 4.2


cur = [24.0]


def kicker(page, label, color=CYAN):
    cur[0] = 24.0
    text(page, label, 7, 2.4, 70, size=1.9, color=color, font=BODY, bold=True, name="Kapitel")


def card(page, x, y, w, h, as_=None, color=PANEL, name="Karte", effect=None, line=CYAN_D, glowing=0.35):
    o = {"op": "add_shape", "page": page, "shape": "rectangle", "x": x, "y": y, "width": w, "height": h, "color": color, "radius": 3, "name": name,
         "stroke": {"color": line, "width": 0.14, "opacity": 0.95}, "shadow": glow(line, 0.8, glowing)}
    if effect:
        o["effect"] = effect
    if as_:
        o["as"] = as_
    ops.append(o)


def chain(page, names, delay=150):
    """the blocks of `names` (the `as` names) appear one after the other, with a single Weiter for the whole row (the first still waits for its own)"""
    for prev, nxt in zip(names, names[1:]):
        ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${nxt}", "from": f"entrance:${prev}", "delayMs": delay, "weiter": False})


def body(page, content, x=7, y=None, w=33, size=2.3, color=INK, **kw):
    """a text of the slide: below the one before it (the texts of a slide follow each other), or at y"""
    yy = y if y is not None else cur[0]
    text(page, content, x, yy, w, size=size, color=color, name=kw.pop("name", "Text"), **kw)
    est = estimate(content, kw.get("paragraphs"), w, size, kw.get("font", BODY), kw.get("bold", False), kw.get("gap", 1.0), kw.get("line", 1.25), None, slack=1.2)  # (words do not break where letters would)
    cur[0] = yy + est + 1.6
    return cur[0]


# ---- pictures of the editor with rings, arrows and labels (adapted from the other tutorials) ------------------------------------------------------------
CROPS = HERE / "crops"
LANGS = ["de_DE"]  # set by build.py: the pictures of the editor have one version per language
_gen = [0]


def gen_asset(prefix):
    _gen[0] += 1
    return f"gen_{prefix}{_gen[0]}.svg"


def shot(page, name, cw, ch, x, y, w, effect=None, as_=None):
    """a crop of the editor, w percent wide at (x, y); returns its geometry for the callouts. The block has the German picture, every other language its own."""
    h = round(w * PX * ch / cw / PY, 2)
    ops.append({"op": "add_shape", "page": page, "shape": "rectangle", "x": round(x - 0.5, 2), "y": round(y - 0.9, 2), "width": round(w + 1.0, 2), "height": round(h + 1.8, 2),
                "color": PANEL, "radius": 1.2, "stroke": {"color": CYAN_D, "width": 0.14, "opacity": 1}, "shadow": glow(CYAN, 1.2, 0.35), "name": "Rahmen"})
    ops.append({"op": "add_image", "page": page, "file": str(CROPS / "de" / f"{name}.jpg"), "alt": "", "position": {"x": x, "y": y, "width": w, "height": h}, "fit": False, "as": as_ or f"shot_{name}"})
    block = "$" + (as_ or f"shot_{name}")
    for locale in LANGS[1:]:
        ops.append({"op": "set_media", "block": block, "language": locale, "file": str(CROPS / locale.split("_")[0] / f"{name}.jpg")})
    sets = {"name": "Editor: " + name}
    if effect:
        sets["entranceEffect"] = effect
    ops.append({"op": "update_block", "block": block, "set": sets})
    return dict(cw=cw, ch=ch, x=x, y=y, w=w, h=h)


def at(c, px, py):
    return c["x"] + px / c["cw"] * c["w"], c["y"] + py / c["ch"] * c["h"]


def ring(page, cx, cy, w, h, as_):
    f = gen_asset("ring")
    drawings.ring_svg(A / f, w * PX, h * PY)
    pic(page, f, cx - w / 2, cy - h / 2, w, h=h, effect=fx("scale", 380), name="Markierung", as_=as_)


def arrow(page, x0, y0, x1, y1, as_, bend=0.22, effect=True, color=ORANGE, name="Pfeil"):
    pad = 2.0
    lx, rx = min(x0, x1) - pad, max(x0, x1) + pad
    ty, by = min(y0, y1) - pad * 1.8, max(y0, y1) + pad * 1.8
    w, h = rx - lx, by - ty
    f = gen_asset("arrow")
    drawings.arrow_svg(A / f, w * PX, h * PY, (x0 - lx) * PX, (y0 - ty) * PY, (x1 - lx) * PX, (y1 - ty) * PY, bend=bend, color=color)
    pic(page, f, lx, ty, w, h=h, effect=fx("scale", 350) if effect else None, name=name, as_=as_)


def callout(page, c, rect, label, label_xy, label_w=14, anchor=None, bend=0.1, color=ORANGE, size=2.4, align="left", pad=(1.6, 2.4), centre=False):
    """a ring around rect (pixels of the crop), a label, an arrow from the label to the ring - they appear one after the other, with a single Weiter for all.
    The arrow starts at the edge of the label's text that is nearest to the ring (never in the middle of the text) and ends at the ring; `align`: how the text
    stands in its box ("right" for a label that is left of the ring, so that the text ends where the arrow starts)."""
    x0, y0, x1, y1 = rect
    (ax, ay), (bx, by) = at(c, x0, y0), at(c, x1, y1)
    cx, cy, w, h = (ax + bx) / 2, (ay + by) / 2, (bx - ax) + pad[0], (by - ay) + pad[1]
    k = _gen[0] + 1
    ring(page, cx, cy, w, h, f"r{k}")
    lx, ly = label_xy
    per = 0.56  # (the width of a letter of the label, in percent of the slide per unit of size)
    lines = max(1, math.ceil(len(label) * per * size / label_w))
    tw = label_w if lines > 1 else min(label_w, len(label) * per * size)
    th = lines * size * 1.2 * 1.78
    if centre:  # (the label stands level with the ring: label_xy only says where it is from the left)
        ly = cy - th / 2
    tx = lx if align == "left" else (lx + label_w - tw if align == "right" else lx + (label_w - tw) / 2)
    # the point of the text's box that is nearest to the ring's middle, a little way off it
    nx = min(max(cx, tx), tx + tw)
    ny = min(max(cy, ly), ly + th)
    dx, dy = (cx - nx) * PX, (cy - ny) * PY
    ln = math.hypot(dx, dy) or 1
    gap = 9  # pixels
    if anchor:
        sx, sy = anchor
    else:
        sx, sy = nx + dx / ln * gap / PX, ny + dy / ln * gap / PY
    dx, dy = (cx - sx) * PX, (cy - sy) * PY
    ln = math.hypot(dx, dy) or 1
    ux, uy = dx / ln, dy / ln
    rx, ry = w / 2 * PX, h / 2 * PY
    t = 1 / math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2)
    ex, ey = cx - ux * t / PX * 1.08, cy - uy * t / PY * 1.08
    arrow(page, sx, sy, ex, ey, f"a{k}", bend)
    text(page, label, lx, ly, label_w, size=size, color=color, font=BODY, bold=True, line=1.2, align=align, h=round((lines + 1) * size * 1.2 * 1.78 + 1.6, 1), effect=fx("up", 400), name="Beschriftung: " + label, as_=f"b{k}")
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:$a{k}", "from": f"entrance:$r{k}", "delayMs": 250, "weiter": False})
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:$b{k}", "from": f"entrance:$a{k}", "delayMs": 250, "weiter": False})
    return k


def marker(page, x, y, n, as_):
    """a numbered marker (an orange ring with a number in it) with its middle at (x, y) - percent of the slide"""
    w = 3.2
    h = w * PX / PY
    pic(page, "marker.svg", x - w / 2, y - h / 2, w, h=h, effect=fx("scale", 350), name=f"Marke {n}", as_=as_ + "m")
    text(page, str(n), x - w / 2, y - h / 2 + 0.6, w, size=2.2, color=ORANGE, font=HEAD, bold=True, align="center", line=1.0, h=h - 0.9, effect=fx("scale", 350), name=f"Zahl {n}", as_=as_ + "t")
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${as_}t", "from": f"entrance:${as_}m", "delayMs": 0, "weiter": False})
