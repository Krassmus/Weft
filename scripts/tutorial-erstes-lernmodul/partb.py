# ======================================================================================================================
# PART B: "So ist das gebaut" - pictures of the real editor with hand-drawn rings, arrows and labels
# ======================================================================================================================
import json
import math
import doodles

# The pictures of the editor: one folder per interface language (crops/de, crops/en ...), taken by capture.mjs. The block has the German one as its own picture,
# every other language has its own (set_media with "language") - so a learner in French sees the French editor. rects.json: where the things are the callouts point
# to, in pixels of the German picture (they are in the same place in the others: the pictures are cut where those things are).
CROPS = HERE / "crops"
RECTS = json.loads((CROPS / "de" / "rects.json").read_text())


def rect(crop, name, pad=(0, 0)):
    x0, y0, x1, y1 = RECTS[crop][name]
    return (x0 - pad[0], y0 - pad[1], x1 + pad[0], y1 + pad[1])
PX, PY = 12.8, 7.2  # pixels per percent of a 1280 x 720 slide
_gen = [0]


def gen_asset(prefix):
    _gen[0] += 1
    return f"gen_{prefix}{_gen[0]}.svg"


cur = [24.0]


def kicker(page, label, color=BLUE):
    cur[0] = 24.0
    text(page, label, 7, 1.6, 60, size=2.0, color=color, font=HEAD, bold=True, name="Kapitel")


def shot(page, name, cw, ch, x, y, w, effect=None, as_=None):
    """a crop of the editor, w percent wide at (x, y); returns its geometry for the callouts"""
    h = round(w * PX * ch / cw / PY, 2)
    ops.append({"op": "add_image", "page": page, "file": str(CROPS / "de" / f"{name}.jpg"), "alt": "", "position": {"x": x, "y": y, "width": w, "height": h}, "fit": False, "as": as_ or f"shot_{name}"})
    block = "$" + (as_ or f"shot_{name}")
    for locale in LANGS[1:]:
        ops.append({"op": "set_media", "block": block, "language": locale, "file": str(CROPS / locale.split("_")[0] / f"{name}.jpg")})
    sets = {"name": "Editor: " + name, "effect": {"kind": "shadow", "blur": 1.2, "color": INK, "offsetX": 0.35, "offsetY": 0.6, "opacity": 0.45}}
    if effect:
        sets["entranceEffect"] = effect
    ops.append({"op": "update_block", "block": block, "set": sets})
    return dict(cw=cw, ch=ch, x=x, y=y, w=w, h=h)


def at(c, px, py):
    return c["x"] + px / c["cw"] * c["w"], c["y"] + py / c["ch"] * c["h"]


def ring(page, cx, cy, w, h, as_):
    f = gen_asset("ring")
    doodles.circle_svg(A / f, w * PX, h * PY, seed=_gen[0])
    pic(page, f, cx - w / 2, cy - h / 2, w, h=h, effect=fx("scale", 380), name="Markierung", as_=as_)


def arrow(page, x0, y0, x1, y1, as_, bend=0.22):
    pad = 2.0
    lx, rx = min(x0, x1) - pad, max(x0, x1) + pad
    ty, by = min(y0, y1) - pad * 1.8, max(y0, y1) + pad * 1.8
    w, h = rx - lx, by - ty
    f = gen_asset("arrow")
    doodles.arrow_svg(A / f, w * PX, h * PY, (x0 - lx) * PX, (y0 - ty) * PY, (x1 - lx) * PX, (y1 - ty) * PY, bend=bend, seed=_gen[0])
    pic(page, f, lx, ty, w, h=h, effect=fx("scale", 350), name="Pfeil", as_=as_)


def callout(page, c, rect, label, label_xy, label_w=14, anchor=None, bend=0.22, color=ACCENT, size=2.7):
    """a ring around rect (pixels of the crop), a label, an arrow from the label to the ring - they appear on Weiter, one after the other"""
    x0, y0, x1, y1 = rect
    (ax, ay), (bx, by) = at(c, x0, y0), at(c, x1, y1)
    cx, cy, w, h = (ax + bx) / 2, (ay + by) / 2, (bx - ax) + 1.6, (by - ay) + 2.4
    k = _gen[0] + 1
    ring(page, cx, cy, w, h, f"r{k}")
    # the arrow starts at the anchor (default: the middle of the label's left or right edge) and ends at the ring
    lx, ly = label_xy
    ah = estimate(label, None, label_w, size, HEAD, True, 1.0, 1.2, None)
    sx, sy = anchor if anchor else (lx + label_w / 2, ly + ah / 2)
    dx, dy = (cx - sx) * PX, (cy - sy) * PY
    ln = math.hypot(dx, dy) or 1
    ux, uy = dx / ln, dy / ln
    rx, ry = w / 2 * PX, h / 2 * PY
    t = 1 / math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2)
    ex, ey = cx - ux * t / PX * 1.06, cy - uy * t / PY * 1.06
    arrow(page, sx, sy, ex, ey, f"a{k}", bend)
    text(page, label, lx, ly, label_w, size=size, color=color, font=HEAD, bold=True, line=1.2, h=round(3 * size * 1.2 * 1.78 + 1.2, 1), effect=fx("up", 400), name="Beschriftung: " + label, as_=f"b{k}")
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:$a{k}", "from": f"entrance:$r{k}", "delayMs": 250, "weiter": False})
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:$b{k}", "from": f"entrance:$a{k}", "delayMs": 250, "weiter": False})


def marker(page, c, px, py, n, as_):
    """a numbered marker on a picture, at crop pixel (px, py)"""
    x, y = at(c, px, py)
    w = 3.0
    h = w * PX / PY
    f = "marker.svg"
    pic(page, f, x - w / 2, y - h / 2, w, h=h, effect=fx("scale", 350), name=f"Marke {n}", as_=as_ + "m")
    text(page, str(n), x - w / 2, y - h / 2 + 0.55, w, size=2.2, color="#ffffff", font=HEAD, bold=True, align="center", line=1.0, h=h - 0.8, effect=fx("scale", 350), name=f"Zahl {n}", as_=as_ + "t")
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${as_}t", "from": f"entrance:${as_}m", "delayMs": 0, "weiter": False})


def body(page, content, x=7, y=None, w=33, size=2.4, color=INK, fixed=False, **kw):
    """a text of the slide: below the one before it (the texts of a slide follow each other), or at y when `fixed`"""
    yy = y if (fixed and y is not None) else cur[0]
    text(page, content, x, yy, w, size=size, color=color, name=kw.pop("name", "Text"), **kw)
    est = estimate(content, kw.get("paragraphs"), w, size, kw.get("font", BODY), kw.get("bold", False), kw.get("gap", 1.0), kw.get("line", 1.25), None)
    cur[0] = yy + est * 1.25 + 2.2
    return cur[0]


doodles.marker_svg(A / "marker.svg")

# ---- 12: overview ------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "after": "end", "as": "p12"})
P = "$p12"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "So ist dieses Modul gebaut", sub_width=34)
body(P, "Du hast gerade ein Lernmodul gespielt. Jetzt schauen wir hinein – in den Editor von Weft, in dem es entstanden ist.", w=32, y=24, name="Einleitung")
c = shot(P, "overview", 1600, 900, 42, 19, 52)
legend = [(1, "Folien", (140, 105)), (2, "Die Folie", (800, 112)), (3, "Eigenschaften", (1450, 105)), (4, "Ereignisse", (790, 782))]
for i, (n, word, (px, py)) in enumerate(legend):
    marker(P, c, px, py, n, f"mk{n}")
    text(P, "", 42 + i * 13.2, 74.5, 13.2, size=2.4, font=HEAD, bold=True, line=1.2, h=12.5, effect=fx("up", 350), name=f"Legende {n}", as_=f"lg{n}",
         paragraphs=[[{"text": f"{n} ", "color": ACCENT}, {"text": word, "color": INK}]])
    ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$lg{n}", "from": f"entrance:$mk{n}t", "delayMs": 150, "weiter": False})

# ---- 13: new slides, the layout ------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p13"})
P = "$p13"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Neue Folien und das Layout", sub_width=34)
body(P, "Mit „Hinzufügen“ links legst du eine neue Folie an. Jede Folie bekommt ein Layout.", w=38, name="Einleitung")
body(P, "Das Karopapier, „Zurück“, „Weiter“ und der Fortschrittsbalken stehen nur einmal im Layout – und gelten für alle Folien.", w=38, name="Layout", effect=fx("up"))
c = shot(P, "layout-panel", 274, 232, 54, 24, 34)
callout(P, c, (60, 188, 214, 218), "hier änderst du es – für alle Folien", (50, 74), label_w=26, anchor=(64, 75), bend=0.3)

# ---- 14: the + menu ------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p14"})
P = "$p14"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Text, Bilder, Formen – und Aufgaben", sub_width=42)
body(P, "Über das + über der Folie kommt alles auf die Folie.", w=44, name="Einleitung")
body(P, "Links stehen Dinge zum Zeigen, rechts Dinge zum Mitmachen – wie das Sortierrätsel von eben.", w=38, name="Menü", effect=fx("up"))
c = shot(P, "plus-menu", 350, 490, 62, 22, 22)
callout(P, c, (14, 72, 88, 100), "zum Zeigen", (47, 50), label_w=12, anchor=(58, 53), bend=-0.2)
callout(P, c, (186, 311, 304, 340), "zum Mitmachen", (85, 68), label_w=14, anchor=(86, 69), bend=0.25)

# ---- 15: the pyramid is pictures -----------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p15"})
P = "$p15"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Die Pyramide besteht aus Bildern", sub_width=44)
body(P, "Die sieben Stufen sind gezeichnete Bilder (SVG), die genau übereinander liegen. Jede Stufe ist ein eigenes Bild – so kann jede einzeln erscheinen.", w=40, name="Stufen")
body(P, "Die Beschriftungen daneben sind ganz normale Texte.", w=40, name="Beschriftungen", effect=fx("up"))
c = shot(P, "tier-canvas", 545, 455, 52, 22, 38)

# ---- 16: the sorting puzzle ----------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p16"})
P = "$p16"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Das Sortierrätsel", sub_width=26)
body(P, "Du schreibst die Karten in der richtigen Reihenfolge ein. Weft mischt sie für die Lernenden.", w=26, size=2.2, name="Karten")
body(P, "An den Enden der Linie stehen zwei Wörter – hier „wenig“ und „viel“.", w=26, size=2.2, name="Enden", effect=fx("up"))
c1 = shot(P, "sort-canvas", 445, 430, 36, 17, 27)
c2 = shot(P, "sort-panel", 274, 300, 70, 14, 24)
callout(P, c2, rect("sort-panel", "words", (-2, 2)), "die Wörter an den Enden", (46, 68), label_w=20, anchor=(63, 70), bend=-0.25)

# ---- 17: required task -----------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p17"})
P = "$p17"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Eine Pflichtaufgabe", sub_width=26)
body(P, "Das Häkchen „Pflichtangabe“ sperrt „Weiter“, bis die Aufgabe abgeschickt ist.", w=44, name="Pflicht")
c1 = shot(P, "sort-required", 274, 125, 60, 18, 32)
c2 = shot(P, "timeline-sort", 1030, 124, 7, 50, 86)
callout(P, c1, rect("sort-required", "tick", (4, 3)), "das Häkchen", (50, 30), label_w=9, anchor=(54, 31.5), bend=0.2)
callout(P, c2, (950, 28, 1020, 90), "das Schloss: Weiter ist gesperrt", (50, 77), label_w=26, anchor=(76, 77.5), bend=0.2)

# ---- 18: effect panel --------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p18"})
P = "$p18"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Wie wächst die Pyramide?", sub_width=32)
body(P, "Jede Stufe hat einen Aufbau-Effekt: Sie blendet von unten ein, in 0,65 Sekunden …", w=46, name="Effekt")
body(P, "… und zwar bei „Weiter“, nachdem die Beschriftung der Stufe davor erschienen ist.", w=46, name="Auslöser", effect=fx("up"))
c = shot(P, "tier-effect", 274, 366, 62, 17, 28)
callout(P, c, rect("tier-effect", "how", (2, 0)), "wie sie erscheint", (40, 34), label_w=20, anchor=(58, 36), bend=0.25)
callout(P, c, rect("tier-effect", "trigger", (2, 0)), "was sie auslöst", (40, 66), label_w=20, anchor=(58, 68), bend=0.25)

# ---- 19: the event graph -----------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p19"})
P = "$p19"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Der Ereignisgraph", sub_width=24)
body(P, "Unter der Folie siehst du, was wann passiert:", w=70, y=22, name="Einleitung", fixed=True)
body(P, "Weiter – Stufe 1 erscheint – 0,3 Sekunden später ihre Beschriftung – Weiter – Stufe 2 …", w=84, y=29, name="Ablauf", effect=fx("up"), color=ACCENT, font=HEAD, size=3.2, bold=True, fixed=True)
c = shot(P, "timeline-pyramid", 1030, 76, 7, 46, 86)
callout(P, c, (92, 6, 178, 70), "Stufe 1", (18, 66), label_w=10, anchor=(24, 66), bend=-0.2)
callout(P, c, (168, 6, 215, 32), "0,3 s Pause", (36, 66), label_w=16, anchor=(40, 66), bend=0.2)
body(P, "Jeder Kreis ist ein Ereignis, die Linien sagen, was es auslöst.", w=84, y=79, name="Hinweis", effect=fx("up"), size=2.2, color=MUTED, fixed=True)

# ---- variables 1: define one ---------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "pv1"})
P = "$pv1"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Eine Variable anlegen", sub_width=28)
body(P, "Im Reiter „Variablen“ legst du mit „+ Variable“ eine neue an.", w=46, size=2.3, name="Anlegen")
body(P, "Sie bekommt einen Namen und einen Typ: Zahl, Text, Ja/Nein – oder „Berechnet“, wenn sie sich aus anderen Variablen ergibt.", w=46, size=2.3, name="Typ", effect=fx("up"))
body(P, "Tipp: englische Namen ohne Leerzeichen.", w=46, name="Tipp", effect=fx("up"), size=2.0, color=MUTED)
c = shot(P, "variables", 262, 330, 60, 17, 25)
callout(P, c, rect("variables", "add", (-1, 0)), "hier legst du eine an", (42, 74), label_w=22, anchor=(58, 75.5), bend=-0.2)
callout(P, c, rect("variables", "row", (0, 0)), "Name und Typ", (44, 56), label_w=14, anchor=(56, 58), bend=-0.2)

# ---- variables 2: one variable for the whole module ----------------------------------------------------------------------------
def card(page, x, y, w, h, fill, paragraphs, size, key, seed, depends=None, delay=0, line_gap=1.0):
    """a sketched card with a text on it; the text appears with the card (the card is `depends` on Weiter, or follows the card before after `delay`)"""
    f = gen_asset("card")
    doodles.card_svg(A / f, w * PX, h * PY, fill, seed=seed)
    pic(page, f, x, y, w, h=h, effect=fx("up", 450), name="Karte: " + key, as_=key + "c")
    est = estimate("", paragraphs, w - 3, size, HEAD, True, line_gap, 1.15, None)
    text(page, "", x + 1.5, y + (h - est) / 2 + 0.2, w - 3, size=size, font=HEAD, bold=True, align="center", line=1.15, h=est, effect=fx("up", 450), name="Text: " + key, as_=key + "t", paragraphs=paragraphs, gap=line_gap)
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${key}t", "from": f"entrance:${key}c", "delayMs": 0, "weiter": False})
    if depends:
        ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${key}c", "from": depends, "delayMs": delay, "weiter": False})


ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "pv2"})
P = "$pv2"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Eine Variable gilt für das ganze Modul", sub_width=44)
body(P, "Sie gehört nicht zu einer Folie: Jedes Element auf jeder Folie kann sie verändern – und jede Weiche kann sie lesen.", w=84, name="Global")
# the variable (a sticky note), then the ones that change it, then the one that reads it
f = gen_asset("card")
doodles.card_svg(A / f, 17 * PX, 25 * PY, "#f6d55c", seed=77)
pic(P, f, 44, 49, 17, h=25, effect=fx("scale", 450), name="Variable (Notiz)", as_="vnote")
text(P, "", 44.8, 55, 15.4, size=4.6, font=HEAD, bold=True, align="center", line=1.1, h=9, effect=fx("scale", 450), name="Variablenname", as_="vname", paragraphs=[["score"]])
text(P, "", 44.8, 66, 15.4, size=2.4, font=HEAD, bold=True, color=MUTED, align="center", line=1.1, h=5, effect=fx("scale", 450), name="Variablentyp", as_="vtype", paragraphs=[["Zahl"]])
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$vname", "from": "entrance:$vnote", "delayMs": 100, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$vtype", "from": "entrance:$vnote", "delayMs": 200, "weiter": False})
lefts = [("Zuordnung: +1 je Paar", TIER[2], 44), ("Lückentext: +1", TIER[1], 57), ("Button: +1 bei jedem Klick", TIER[0], 70)]
prev = None
for i, (label, fill, cy) in enumerate(lefts):
    key = f"vl{i}"
    card(P, 7, cy, 28, 10.5, fill, [[label]], 2.4, key, 80 + i, depends=prev, delay=350)
    arrow(P, 35.4, cy + 5.2, 43.4, 56 + i * 6.5, key + "a", bend=0.12)
    ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${key}a", "from": f"entrance:${key}c", "delayMs": 250, "weiter": False})
    prev = f"entrance:${key}a"
card(P, 66.5, 55, 26.5, 14, TIER[4], [["Weiche: liest score"]], 2.4, "vr", 90)
arrow(P, 61.6, 62, 66, 62, "vra", bend=0.15)
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$vra", "from": "entrance:$vrc", "delayMs": 250, "weiter": False})

# ---- variables 3: elements change them -------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "pv3"})
P = "$pv3"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Elemente verändern Variablen", sub_width=34)
body(P, "Fast jedes interaktive Element kann Variablen verändern: ein Quiz, eine Zuordnung, ein Lückentext, ein Button …", w=42, name="Elemente")
body(P, "Hier: Stimmt die Reihenfolge, wird „sortCorrect“ auf „Ja“ gesetzt. Bei Zahlen kannst du auch addieren – so zählt „score“ die Punkte.", w=42, name="Beispiel", effect=fx("up"))
c = shot(P, "effect-row", 274, 150, 52, 31, 40)
callout(P, c, rect("effect-row", "row", (-1, 0)), "diese Variable bekommt den Wert „Ja“", (52, 23), label_w=40, anchor=(72, 28), bend=-0.1)
callout(P, c, (80, RECTS["effect-row"]["more"][1], 195, RECTS["effect-row"]["more"][3]), "mehrere Effekte sind möglich", (55, 74), label_w=34, anchor=(72, 74), bend=0.1)

# ---- 20: the fork --------------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p20"})
P = "$p20"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Die Weiche", sub_width=18)
body(P, "Eine Verzweigung schickt Lernende je nach Ergebnis auf einen anderen Weg.", w=33, name="Verzweigung")
body(P, "Jeder Zweig hat eine Bedingung über eine Variable. Hier: „sortCorrect = Ja“. Trifft sie nicht zu, gilt der letzte Zweig.", w=33, name="Bedingung", effect=fx("up"))
c1 = shot(P, "fork-sidebar", 240, 135, 43, 20, 21)
c2 = shot(P, "fork-panel", 274, 420, 68, 12, 25)
callout(P, c1, (24, 4, 235, 36), "die Weiche", (44, 52), label_w=14, anchor=(49, 53), bend=0.2)
callout(P, c2, rect("fork-panel", "condition", (0, 0)), "die Bedingung", (48, 70), label_w=16, anchor=(64, 71), bend=-0.2)

# ---- 22: languages -------------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p22"})
P = "$p22"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Ein Modul, acht Sprachen", sub_width=30)
body(P, "Unter „Einstellungen“ fügst du Sprachen hinzu. Die oberste ist die Standardsprache.", w=46, name="Sprachen")
body(P, "Dieses Modul gibt es in acht Sprachen: Es startet in der Sprache deiner App – und oben rechts kann man wechseln.", w=46, name="Wechseln", effect=fx("up"))
c = shot(P, "settings-languages", 240, 420, 62, 13, 22)

# ---- 23: sharing -----------------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p23"})
P = "$p23"
kicker(P, "SO IST DAS GEBAUT")
heading(P, "Weitergeben", sub_width=18)
body(P, "", w=46, name="Dateien", paragraphs=[[{"text": "Speichern", "bold": True}, " macht eine .weft-Datei – zum Weiterbauen in Weft."]], gap=1.2)
body(P, "", w=46, name="Export", effect=fx("up"), paragraphs=[[{"text": "Exportieren", "bold": True}, " macht eine Webseite zum Abspielen im Browser oder im Lernmanagementsystem."]])
body(P, "", w=46, name="PDF", effect=fx("up"), paragraphs=[[{"text": "Als PDF", "bold": True}, " gibt es die Folien zum Drucken."]])
c = shot(P, "file-menu", 262, 455, 64, 15, 20)
callout(P, c, (14, 276, 166, 302), "Webseite zum Abspielen", (43, 70), label_w=18, anchor=(57, 71.5), bend=-0.2)

# ---- 24: knowledge check, part 1 -----------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p24"})
P = "$p24"
kicker(P, "WISSENSCHECK", ACCENT)
heading(P, "Was gehört wozu?", sub_width=24)
ops.append({"op": "add_matching", "page": P, "sources": [{"text": "Layout"}, {"text": "Aufbau-Effekt"}, {"text": "Verzweigung"}, {"text": "Variable"}],
            "targets": [{"text": "gilt für viele Folien auf einmal"}, {"text": "lässt etwas bei „Weiter“ erscheinen"}, {"text": "schickt Lernende auf andere Wege"}, {"text": "merkt sich, was passiert ist"}],
            "pairs": [[0, 0], [1, 1], [2, 2], [3, 3]], "shuffle": True, "required": True, "x": 7, "y": 24, "width": 86, "height": 58,
            "onEachCorrect": [{"variableId": "score", "op": "add", "value": 1}], "name": "Zuordnung"})

# ---- 25: knowledge check, part 2 -----------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p25"})
P = "$p25"
kicker(P, "WISSENSCHECK", ACCENT)
heading(P, "Noch eine Frage", sub_width=20)
ops.append({"op": "add_block", "page": P, "kind": "cloze", "set": {
    "position": {"x": 7, "y": 26, "width": 80, "height": 34}, "name": "Lückentext", "required": True,
    "html": f'<p style="margin:0;line-height:1.4"><font face="{BODY}"><span style="font-size:2.9cqw">Damit niemand weiterklickt, ohne zu antworten, machst du die Aufgabe zur [[Pflichtaufgabe|Pflichtangabe]].</span></font></p>',
    "onCorrect": [{"variableId": "score", "op": "add", "value": 1}], "onIncorrect": [], "onEachCorrect": []}})

pic(P, "icon_question.svg", 80, 40, 12, name="Fragezeichen")

# fork 3: enough points?
ops.append({"op": "add_logic", "after": "end", "name": "Genug Punkte?", "layout": "$L_Skizzenheft", "as": "fork3",
            "branches": [{"label": "Geschafft", "condition": {"variable": "score", "comparator": "gte", "value": 4}}, {"label": "Fast"}]})
P = "28.a.1"
text(P, "Geschafft!", 7, 12, 70, size=9, color=GREEN, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 34, h=34 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Du kennst jetzt die wichtigsten Bausteine eines Lernmoduls.", 7, 40, 50, size=3.0, name="Text")
pic(P, "icon_check.svg", 64, 18, 22, name="Haken")
pic(P, "star.svg", 88, 14, 5, h=square(5), name="Stern")
P = "28.b.1"
text(P, "Fast!", 7, 12, 70, size=9, color=ACCENT, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 24, h=24 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Noch ist nicht alles hängen geblieben. Das ist normal – schau dir den zweiten Teil gern noch einmal an.", 7, 40, 52, size=2.8, name="Text")
ops.append({"op": "add_block", "page": P, "kind": "button", "set": {"position": {"x": 7, "y": 66, "width": 32, "height": 8}, "text": "Zweiten Teil noch einmal ansehen", "action": "goto", "targetPageId": "$p12", "name": "Noch einmal", "html": "Zweiten Teil noch einmal ansehen"}})
pic(P, "icon_bulb.svg", 64, 18, 22, name="Glühbirne")

# ---- 27: the end ------------------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "after": "end", "as": "p27"})
P = "$p27"
text(P, "Jetzt bist du dran.", 7, 11, 80, size=7.4, font=HEAD, bold=True, color=ACCENT, name="Überschrift")
pic(P, "squiggle.svg", 7, 29, 36, h=36 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Starte auf dem Startbildschirm ein neues Lernmodul – oder wähle „Mit Vorlage starten“ und baue die Lernpyramide um.", 7, 38, 60, size=2.8, name="Anleitung")
text(P, "Mehr Tutorials findest du unter „Weft kennenlernen“.", 7, 67, 62, size=2.4, color=MUTED, name="Mehr", effect=fx("up"))
pic(P, "icon_bulb.svg", 66, 16, 22, name="Glühbirne")
pic(P, "star.svg", 90, 12, 4, h=square(4), name="Stern")
