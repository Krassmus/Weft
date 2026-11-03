"""The hand-drawn pictures of the tutorial "Ein interaktives Video erstellen" (SVG, into assets/): the look and most of the pens are those of the first
tutorial (../tutorial-erstes-lernmodul/doodles.py); what is new here are the icons of the ideas (a clock, a note, a fork, cards, a pointer)."""
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "tutorial-erstes-lernmodul"))
import doodles as base  # noqa: E402
from doodles import INK, TIER, Pen, ellipse_pts  # noqa: E402

OUT = HERE / "assets"
base.OUT = OUT  # (base.save writes there)
save = base.save
svg = base.svg


def icon_clock(c):
    p = Pen(41)
    s = p.line([(86, 28), (114, 28)], width=5, passes=1) + p.line([(100, 30), (100, 48)], width=4, passes=1)
    s += p.line([(150, 52), (162, 38)], width=5, passes=1)
    s += p.line(ellipse_pts(100, 112, 62, 62, 18), True, fill=c)
    for a in (-90, 0, 90, 180):
        x1, y1 = 100 + 48 * math.cos(math.radians(a)), 112 + 48 * math.sin(math.radians(a))
        x2, y2 = 100 + 56 * math.cos(math.radians(a)), 112 + 56 * math.sin(math.radians(a))
        s += p.line([(x1, y1), (x2, y2)], width=3, passes=1, amp=0.8)
    s += p.line([(100, 112), (100, 70)], width=4.2, passes=1, amp=1) + p.line([(100, 112), (130, 128)], width=4.2, passes=1, amp=1)
    return s + p.dot((100, 112), 5.5)


def icon_note(c):
    p = Pen(42)
    s = p.line([(34, 34), (166, 34), (166, 122), (122, 166), (34, 166)], True, fill=c)
    s += p.line([(122, 166), (124, 124), (166, 122)], True, width=3, passes=1, fill="#fff3d6", offset=(0, 0))
    for y, x1 in ((64, 144), (88, 144), (112, 100)):
        s += p.line([(56, y), (x1, y)], width=3, passes=1, amp=1.2)
    return s


def icon_fork(c):
    p = Pen(43)
    s = p.line([(100, 160), (100, 112), (56, 70)], width=4.2, passes=2, amp=1.4, step=60)
    s += p.line([(100, 112), (146, 70)], width=4.2, passes=2, amp=1.4, step=60)
    s += p.line([(44, 82), (56, 66), (70, 76)], width=4, passes=1, amp=0.8) + p.line([(134, 80), (146, 66), (160, 74)], width=4, passes=1, amp=0.8)
    s += p.line(ellipse_pts(100, 172, 15, 15, 10), True, fill=c)
    s += p.line(ellipse_pts(54, 42, 24, 24, 12), True, fill=c, offset=(4, 3)) + p.line(ellipse_pts(148, 42, 24, 24, 12), True, fill="#fff3d6", offset=(4, 3))
    return s


def icon_cards(c):
    p = Pen(44)
    s = p.line([(22, 36), (92, 36), (92, 100), (22, 100)], True, fill=c)
    s += p.line([(108, 100), (178, 100), (178, 164), (108, 164)], True, fill="#fff3d6")
    s += p.line([(92, 68), (126, 76), (140, 98)], width=3.4, passes=1, amp=1.4, step=40)
    s += p.line([(130, 88), (140, 100), (150, 90)], width=3.4, passes=1, amp=0.8)
    s += p.line([(36, 58), (78, 58)], width=3, passes=1, amp=1) + p.line([(122, 122), (164, 122)], width=3, passes=1, amp=1)
    return s


def icon_cursor(c):
    p = Pen(45)
    s = p.line([(24, 44), (148, 44), (148, 116), (24, 116)], True, fill=c)
    s += p.line([(44, 66), (128, 66)], width=3, passes=1, amp=1.2) + p.line([(44, 88), (100, 88)], width=3, passes=1, amp=1.2)
    s += p.line([(112, 96), (112, 176), (132, 158), (148, 190), (162, 182), (146, 152), (174, 150)], True, width=3.4, passes=1, fill="#ffffff", offset=(0, 0), sharp=True)
    return s


def timeline(w=1000, h=110):
    """a bar for a video with two time marks on it: one that does not stop it (blue) and one that does (red, with a pause sign)"""
    p = Pen(51)
    s = p.line([(20, 56), (980, 56)], width=6, passes=2, amp=1.6, step=80, over=0.01)
    s += p.line([(20, 38), (20, 74)], width=5, passes=1, amp=0.8) + p.line([(980, 38), (980, 74)], width=5, passes=1, amp=0.8)
    s += p.line(ellipse_pts(300, 56, 20, 20, 12), True, fill="#7dbdc4", offset=(3, 3))
    s += p.line(ellipse_pts(640, 56, 20, 20, 12), True, fill="#d9534f", offset=(3, 3))
    s += p.line([(634, 47), (634, 65)], width=5, passes=1, amp=0.5, color="#ffffff") + p.line([(647, 47), (647, 65)], width=5, passes=1, amp=0.5, color="#ffffff")
    return svg(w, h, s)


def build():
    OUT.mkdir(exist_ok=True)
    save("icon_tv.svg", 200, 200, base.icon_tv(TIER[2]))
    save("icon_bulb.svg", 200, 200, base.icon_bulb())
    save("icon_check.svg", 200, 200, base.icon_check())
    save("icon_question.svg", 200, 200, base.icon_question())
    save("icon_clock.svg", 200, 200, icon_clock(TIER[0]))
    save("icon_note.svg", 200, 200, icon_note(TIER[3]))
    save("icon_fork.svg", 200, 200, icon_fork(TIER[1]))
    save("icon_cards.svg", 200, 200, icon_cards(TIER[4]))
    save("icon_cursor.svg", 200, 200, icon_cursor(TIER[5]))
    (OUT / "star.svg").write_text(base.star())
    (OUT / "squiggle.svg").write_text(base.squiggle())
    (OUT / "squiggle_blue.svg").write_text(base.squiggle(seed=8, color="#3b6fd4"))
    (OUT / "arrow.svg").write_text(base.arrow())
    (OUT / "paper.svg").write_text(base.paper())
    (OUT / "timeline.svg").write_text(timeline())
    base.marker_svg(OUT / "marker.svg")


if __name__ == "__main__":
    build()
    print("ok")
