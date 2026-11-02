"""Hand-drawn looking SVGs for the learning pyramid tutorial: wobbly ink lines, marker fill that is a little off, double strokes."""
import math, random, pathlib

INK = "#2b2d42"
OUT = pathlib.Path(__file__).parent / "assets"

# marker colours, cool (passive) to warm (active)
TIER = ["#8fa8cf", "#7dbdc4", "#9ccb9a", "#ecd566", "#f3a95b", "#ee7d5c", "#d9534f"]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def subdivide(pts, closed, step=34, sharp=False):
    out = []
    n = len(pts)
    last = n if closed else n - 1
    for i in range(last):
        a, b = pts[i], pts[(i + 1) % n]
        d = math.dist(a, b)
        k = max(1, int(d // step))
        for j in range(k):
            out.append(lerp(a, b, j / k))
            if sharp and j == 0:
                out.append(lerp(a, b, 0.0))  # the corner twice: the smoothing then keeps it pointed
    if not closed:
        out.append(pts[-1])
    return out


def smooth(pts, closed):
    f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    n = len(pts)
    if closed:
        d = f"M{f(mid(pts[-1], pts[0]))}"
        for i in range(n):
            d += f" Q{f(pts[i])} {f(mid(pts[i], pts[(i + 1) % n]))}"
        return d + "Z"
    d = f"M{f(pts[0])}"
    for i in range(1, n - 1):
        d += f" Q{f(pts[i])} {f(mid(pts[i], pts[i + 1]))}"
    return d + f" L{f(pts[-1])}"


class Pen:
    def __init__(self, seed):
        self.r = random.Random(seed)

    def wob(self, pts, closed=False, amp=2.4, step=34, sharp=False):
        sp = subdivide(pts, closed, step, sharp)
        return [(x + self.r.uniform(-amp, amp), y + self.r.uniform(-amp, amp)) for x, y in sp]

    def line(self, pts, closed=False, width=3.2, amp=2.2, passes=2, fill=None, offset=(5, 4), step=34, color=INK, over=0, sharp=False):
        s = ""
        if fill:
            s += f'<path d="{smooth(self.wob(self._shift(pts, offset), closed, amp * 1.6, step, sharp), closed)}" fill="{fill}" stroke="none" opacity="0.92"/>'
        for k in range(passes):
            p = list(pts)
            if over and not closed and len(p) > 1:  # let the stroke run a little past its ends
                a, b = p[0], p[1]
                p[0] = (a[0] - (b[0] - a[0]) * over, a[1] - (b[1] - a[1]) * over)
                a, b = p[-1], p[-2]
                p[-1] = (a[0] - (b[0] - a[0]) * over, a[1] - (b[1] - a[1]) * over)
            w = width * (1 if k == 0 else 0.7)
            s += f'<path d="{smooth(self.wob(p, closed, amp, step, sharp), closed)}" fill="none" stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
        return s

    def _shift(self, pts, off):
        return [(x + off[0], y + off[1]) for x, y in pts]

    def dot(self, c, r, fill=INK):
        return f'<circle cx="{c[0] + self.r.uniform(-1, 1):.1f}" cy="{c[1] + self.r.uniform(-1, 1):.1f}" r="{r}" fill="{fill}"/>'


def ellipse_pts(cx, cy, rx, ry, n=18, a0=0.0, a1=2 * math.pi, closed=True):
    m = n if closed else n + 1
    pts = []
    for i in range(m):
        t = a0 + (a1 - a0) * (i / n)
        pts.append((cx + rx * math.cos(t), cy + ry * math.sin(t)))
    return pts


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>\n'


def save(name, w, h, body):
    (OUT / name).write_text(svg(w, h, body))


# ---- icons (200 x 200) ----------------------------------------------------------------------------------------------------

def icon_book(c):
    p = Pen(11)
    s = p.line([(22, 62), (97, 74), (97, 162), (22, 150)], True, fill=c)
    s += p.line([(103, 74), (178, 62), (178, 150), (103, 162)], True, fill=c)
    for i, y in enumerate((92, 108, 124)):
        s += p.line([(34, y - 2 + i), (84, y + 6 + i)], width=2.2, passes=1, amp=1.2)
        s += p.line([(116, y + 6 + i), (166, y - 2 + i)], width=2.2, passes=1, amp=1.2)
    return s


def icon_ear(c):
    p = Pen(12)
    outer = [(100, 172), (72, 152), (56, 112), (58, 72), (86, 42), (128, 38), (154, 62), (154, 100), (134, 124), (124, 150), (108, 170)]
    s = p.line(outer, True, fill=c)
    s += p.line([(98, 74), (124, 70), (134, 94), (118, 112), (108, 134)], width=2.8, passes=2, amp=1.6)
    for r, a in ((20, 0), (34, 0), (48, 0)):
        pts = ellipse_pts(36, 98, r * 0.55, r, 8, math.radians(110), math.radians(250), False)
        s += p.line(pts, width=2.4, passes=1, amp=1.2)
    return s


def icon_eye(c):
    p = Pen(13)
    top = [(14, 102), (50, 66), (100, 48), (150, 66), (186, 102)]
    bot = [(186, 102), (150, 138), (100, 156), (50, 138), (14, 102)]
    s = p.line(top + bot[1:], True, fill="#fff8e8", offset=(0, 0))
    s += p.line(ellipse_pts(100, 102, 36, 36, 14), True, fill=c, offset=(4, 3))
    s += p.dot((100, 102), 14)
    s += p.dot((90, 92), 5, "#fff8e8")
    for x, y0, y1 in ((60, 60, 38), (100, 46, 22), (140, 60, 38)):
        s += p.line([(x, y0), (x + (x - 100) * 0.1, y1)], width=2.6, passes=1, amp=1)
    return s


def icon_tv(c):
    p = Pen(14)
    s = p.line([(50, 42), (80, 66)], width=2.8, passes=1) + p.line([(110, 66), (130, 38)], width=2.8, passes=1)
    s += p.line([(22, 68), (178, 68), (178, 152), (22, 152)], True, fill=c)
    s += p.line([(34, 80), (140, 80), (140, 140), (34, 140)], True, width=2.4, passes=1, amp=1.4)
    s += p.line([(70, 96), (70, 126), (102, 111)], True, width=3, passes=1, fill=INK, offset=(0, 0))
    for r in (10, 18):
        s += p.line(ellipse_pts(150, 110, r * 0.6, r, 6, math.radians(-60), math.radians(60), False), width=2.2, passes=1, amp=1)
    s += p.line([(50, 154), (44, 172)], width=3, passes=1) + p.line([(150, 154), (156, 172)], width=3, passes=1)
    return s


def icon_bubbles(c):
    p = Pen(15)
    s = p.line([(18, 36), (118, 36), (122, 92), (84, 92), (62, 112), (66, 92), (22, 92)], True, fill=c)
    s += p.line([(84, 98), (182, 98), (184, 150), (150, 150), (134, 168), (136, 150), (88, 150)], True, fill="#fff3d6")
    for x in (44, 66, 88):
        s += p.dot((x, 64), 4.5)
    for x in (116, 138, 160):
        s += p.dot((x, 124), 4.5)
    return s


def icon_flask(c):
    p = Pen(16)
    s = p.line([(84, 30), (116, 30)], width=4, passes=1)
    s += p.line([(88, 30), (88, 84), (40, 160), (160, 160), (112, 84), (112, 30)], True, fill=c)
    s += p.line([(66, 126), (134, 126)], width=2.6, passes=1, amp=1.6)
    for (x, y, r) in ((92, 110, 6), (108, 98, 4), (98, 72, 5), (104, 56, 3.5)):
        s += p.line(ellipse_pts(x, y, r, r, 8), True, width=2.2, passes=1, amp=0.8)
    return s


def icon_teacher(c):
    p = Pen(17)
    s = p.line([(88, 28), (186, 28), (186, 108), (88, 108)], True, fill=c)
    s += p.line([(100, 92), (118, 70), (136, 80), (160, 46)], width=3, passes=1, amp=1.6)
    s += p.line([(150, 44), (160, 46), (156, 56)], width=3, passes=1, amp=0.8)
    s += p.line(ellipse_pts(46, 76, 20, 20, 12), True, fill="#fff3d6", offset=(3, 3))
    s += p.line([(46, 98), (46, 150)], width=3.4, passes=2) + p.line([(46, 150), (28, 184)], width=3.4, passes=1) + p.line([(46, 150), (66, 184)], width=3.4, passes=1)
    s += p.line([(46, 112), (74, 98), (118, 86)], width=3.4, passes=1)
    s += p.line([(46, 114), (26, 138)], width=3.4, passes=1)
    return s


def icon_bulb(c="#f6d55c"):
    p = Pen(18)
    s = p.line(ellipse_pts(100, 86, 46, 50, 16, math.radians(-215), math.radians(35), False) + [(122, 138), (122, 152), (78, 152), (78, 138)], True, fill=c)
    s += p.line([(82, 164), (118, 164)], width=3, passes=1) + p.line([(88, 176), (112, 176)], width=3, passes=1)
    s += p.line([(88, 120), (96, 96), (104, 120), (112, 96)], width=2.6, passes=1, amp=1.2)
    for a in (-150, -115, -90, -65, -30):
        r1, r2 = 66, 86
        x1, y1 = 100 + r1 * math.cos(math.radians(a)), 86 + r1 * math.sin(math.radians(a))
        x2, y2 = 100 + r2 * math.cos(math.radians(a)), 86 + r2 * math.sin(math.radians(a))
        s += p.line([(x1, y1), (x2, y2)], width=3, passes=1, amp=1)
    return s


def icon_check(c="#4caf7d"):
    p = Pen(19)
    return p.line([(40, 108), (82, 150), (164, 52)], width=14, passes=1, amp=2.2, color=c) + p.line([(42, 112), (84, 152), (160, 58)], width=6, passes=1, amp=2.4, color=c)


def icon_question(c="#e4572e"):
    p = Pen(20)
    s = p.line(ellipse_pts(100, 72, 36, 34, 12, math.radians(-200), math.radians(60), False) + [(112, 108), (100, 126), (100, 140)], width=12, passes=1, amp=2, color=c)
    s += p.dot((100, 170), 9, c)
    return s


ICONS = {"book": icon_book, "ear": icon_ear, "eye": icon_eye, "tv": icon_tv, "bubbles": icon_bubbles, "flask": icon_flask, "teacher": icon_teacher}


def squiggle(w=600, h=40, seed=3, color="#e4572e", width=6):
    p = Pen(seed)
    pts = [(10, h * 0.55)]
    x = 10
    k = 0
    while x < w - 20:
        x += 34
        pts.append((x, h * (0.3 if k % 2 == 0 else 0.7)))
        k += 1
    return svg(w, h, p.line(pts, width=width, passes=2, amp=1.8, color=color, step=60))


def arrow(w=300, h=160, seed=4, color=INK, curve=1.0):
    """A curved arrow from the top-left to the bottom-right."""
    p = Pen(seed)
    pts = []
    for i in range(0, 13):
        t = i / 12
        x = 14 + (w - 40) * t
        y = 16 + (h - 40) * (t ** 1.8) * 1.0 + math.sin(t * math.pi) * -14 * curve
        pts.append((x, y))
    head = [(w - 64, h - 24), (w - 26, h - 26), (w - 46, h - 62)]
    s = p.line(pts, width=4, passes=2, amp=1.4, color=color, step=60)
    s += p.line([head[0], head[1], head[2]], width=4, passes=1, amp=1, color=color)
    return svg(w, h, s)


def star(r=40, seed=5, color="#f6c945"):
    p = Pen(seed)
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((r + 6 + rr * math.cos(a), r + 6 + rr * math.sin(a)))
    return svg(2 * r + 12, 2 * r + 12, p.line(pts, True, width=3, passes=2, amp=1.2, fill=color, offset=(2, 2), step=60))


# ---- callouts: a scribbled ring, a curved arrow, a numbered marker (sizes in pixels of a 1280 x 720 slide) -------------------------

def circle_svg(path, w, h, seed=1, color="#e4572e", width=4.2):
    w, h = int(round(w)), int(round(h))
    p = Pen(seed)
    pts = ellipse_pts(w / 2, h / 2, w / 2 - 7, h / 2 - 7, 24, math.radians(-110), math.radians(-110 + 395), False)
    pts = [(x + (i / 24) * 5 * math.cos(math.radians(i * 15)), y) for i, (x, y) in enumerate(pts)]
    path.write_text(svg(w, h, p.line(pts, width=width, passes=2, amp=1.5, color=color, step=70)))


def arrow_svg(path, w, h, x0, y0, x1, y1, bend=0.25, seed=2, color="#e4572e", width=4.0):
    """an arrow from (x0, y0) to (x1, y1) in a canvas of w x h pixels"""
    w, h = int(round(w)), int(round(h))
    p = Pen(seed)
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy) or 1
    cx, cy = (x0 + x1) / 2 - dy / ln * ln * bend, (y0 + y1) / 2 + dx / ln * ln * bend
    pts = []
    for i in range(15):
        t = i / 14
        pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1))
    tx, ty = x1 - pts[-2][0], y1 - pts[-2][1]
    tl = math.hypot(tx, ty) or 1
    tx, ty = tx / tl, ty / tl
    s = p.line(pts, width=width, passes=2, amp=1.2, color=color, step=80)
    for a in (28, -28):
        r = math.radians(a)
        hx, hy = -(tx * math.cos(r) - ty * math.sin(r)), -(tx * math.sin(r) + ty * math.cos(r))
        s += p.line([(x1, y1), (x1 + hx * 16, y1 + hy * 16)], width=width, passes=1, amp=0.8, color=color)
    path.write_text(svg(w, h, s))


def marker_svg(path, seed=3, color="#e4572e"):
    p = Pen(seed)
    path.write_text(svg(100, 100, p.line(ellipse_pts(50, 50, 40, 40, 14), True, width=4, passes=2, amp=1.4, fill=color, offset=(3, 3))))


def card_svg(path, w, h, fill, seed=1, width=3.6):
    """a sketched card (w x h pixels of a 1280 x 720 slide)"""
    w, h = int(round(w)), int(round(h))
    p = Pen(seed)
    pts = [(10, 10), (w - 10, 10), (w - 10, h - 10), (10, h - 10)]
    path.write_text(svg(w, h, p.line(pts, True, width=width, amp=1.8, fill=fill, offset=(5, 4), step=60)))


# ---- notebook paper (1600 x 900) -------------------------------------------------------------------------------------------

def paper():
    s = ""
    for x in range(0, 1601, 40):
        s += f'<line x1="{x}" y1="0" x2="{x}" y2="900" stroke="#b9c7de" stroke-opacity="0.45" stroke-width="1.2"/>'
    for y in range(0, 901, 40):
        s += f'<line x1="0" y1="{y}" x2="1600" y2="{y}" stroke="#b9c7de" stroke-opacity="0.45" stroke-width="1.2"/>'
    return svg(1600, 900, s)


# ---- the pyramid (1600 x 900): one picture per tier, same canvas, so that they lie on top of one another ----------------------

APEX = (480, 196)
BASE_Y = 744
HALF_BASE = 336
N = 7
LABEL_X = 900


def half(y):
    return HALF_BASE * (y - APEX[1]) / (BASE_Y - APEX[1])


def tier_bounds(i):
    h = (BASE_Y - APEX[1]) / N
    return APEX[1] + h * i, APEX[1] + h * (i + 1)


def tier_svg(i):
    y0, y1 = tier_bounds(i)
    cx = APEX[0]
    p = Pen(100 + i)
    if i == 0:
        pts = [(cx, y0), (cx + half(y1), y1), (cx - half(y1), y1)]
    else:
        pts = [(cx - half(y0), y0), (cx + half(y0), y0), (cx + half(y1), y1), (cx - half(y1), y1)]
    s = p.line(pts, True, width=4.2, amp=2.0, fill=TIER[i], offset=(7, 6), step=60, sharp=True)
    ym = (y0 + y1) / 2
    xe = cx + half(ym) + 6
    s += p.line([(xe, ym), (LABEL_X - 16, ym)], width=2.6, passes=1, amp=1.2, color=INK, step=90)
    return s


def build():
    OUT.mkdir(exist_ok=True)
    cols = dict(zip(ICONS, [TIER[0], TIER[1], TIER[2], TIER[3], TIER[4], TIER[5], TIER[6]]))
    for name, fn in ICONS.items():
        save(f"icon_{name}.svg", 200, 200, fn(cols[name]))
    save("icon_bulb.svg", 200, 200, icon_bulb())
    save("icon_check.svg", 200, 200, icon_check())
    save("icon_question.svg", 200, 200, icon_question())
    (OUT / "squiggle.svg").write_text(squiggle())
    (OUT / "squiggle_blue.svg").write_text(squiggle(seed=8, color="#3b6fd4"))
    (OUT / "arrow.svg").write_text(arrow())
    (OUT / "arrow_down.svg").write_text(svg(200, 300, Pen(6).line([(100, 12), (86, 80), (112, 160), (98, 240)], width=4, passes=2, amp=1.4, step=60) + Pen(7).line([(62, 206), (98, 262), (136, 208)], width=4, passes=1, amp=1)))
    (OUT / "arrow_right.svg").write_text(svg(300, 160, Pen(9).line([(14, 118), (90, 92), (170, 70), (266, 56)], width=4, passes=2, amp=1.4, step=60) + Pen(10).line([(226, 24), (272, 56), (232, 98)], width=4, passes=1, amp=1)))
    (OUT / "star.svg").write_text(star())
    (OUT / "paper.svg").write_text(paper())
    q = Pen(31)
    (OUT / "strike.svg").write_text(svg(900, 50, q.line([(6, 28), (300, 20), (600, 30), (894, 22)], width=6, passes=1, amp=1.6, color="#e4572e", step=150)))
    for i in range(N):
        save(f"tier_{i + 1}.svg", 920, 610, '<g transform="translate(0,-150)">' + tier_svg(i) + "</g>")


if __name__ == "__main__":
    build()
    print("ok")
