"""Builds lernpyramide.weft (part A of the tutorial "Dein erstes Lernmodul") with the weft command line tool."""
import json, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
A = HERE / "assets"
TEMPLATE = os.environ.get("TEMPLATE") == "1"  # only part A, marked as a template
OUT = HERE / ("vorlage.weft" if TEMPLATE else "lernpyramide.weft")

INK, MUTED, ACCENT, BLUE, GREEN = "#2b2d42", "#5d6078", "#e4572e", "#3b6fd4", "#2f9e6f"
HEAD, BODY = "Caveat", "Quicksand"
TIER = ["#8fa8cf", "#7dbdc4", "#9ccb9a", "#ecd566", "#f3a95b", "#ee7d5c", "#d9534f"]
TIER_DARK = ["#5f7db0", "#4a9aa3", "#5fa65c", "#b8962a", "#d77f26", "#d65a37", "#b83a37"]

ops = []


def op(**kw):
    ops.append(kw)


def fx(motion="up", ms=500):
    return {"type": "fade", "durationMs": ms, "motion": motion}


def estimate(content, paragraphs, w, size, font, bold, gap, line, box):
    """height in percent of the slide: lines x size x line height, in cqw (1 cqw = 1.78 % at 16:9), with some air"""
    import math
    per = 0.37 if font == HEAD else 0.60
    if bold and font != HEAD:
        per *= 1.07
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
    if h is None:
        # translations are longer than the German: room for a third more than the German needs
        h = round(estimate(content, paragraphs, w, size, font, bold, gap, line, box) * 1.3, 1)
        h = min(h, round(99.5 - y, 1))
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
    if as_:
        o["as"] = as_
    ops.append(o)
    if effect:
        ops.append({"op": "update_block", "block": "$" + as_, "set": {"entranceEffect": effect}})
    if name:
        ops.append({"op": "update_block", "block": "$" + as_, "set": {"name": name}})


def heading(page, title, size=5.4, w=84, sub_width=30, y=6.5):
    h = estimate(title, None, w, size, HEAD, True, 1.0, 1.25, None)
    text(page, title, 7, y, w, size=size, font=HEAD, bold=True, name="Überschrift", h=h, line=1.25)
    ul = y + h - 0.6
    pic(page, "squiggle.svg", 7, ul, sub_width, h=sub_width * 16 / 9 * 40 / 600, name="Unterstreichung")
    return ul + 5.5


# ---- module, look, variables -----------------------------------------------------------------------------------------------
LANGS = ["de_DE", "en_US", "es_ES", "fr_FR", "pt_BR", "it_IT", "tr_TR", "pl_PL"]
op(op="set_title", title="Lernpyramide" if TEMPLATE else "Dein erstes Lernmodul")
op(op="set_languages", languages=LANGS)
op(op="set_look", brightness="light", accentColor=ACCENT, interactiveStyle="round")
op(op="set_palette", colors=[INK, ACCENT, BLUE, GREEN, "#f6c945", "#f7f2e7"] + TIER)
op(op="add_variable", name="sortCorrect", type="boolean", initialValue=False)
op(op="add_variable", name="quizCorrect", type="boolean", initialValue=False)
if not TEMPLATE:
    op(op="add_variable", name="score", type="number", initialValue=0)

# ---- layouts -------------------------------------------------------------------------------------------------------------
for lay, nav in (("Skizzenheft", True), ("Titel", False)):
    ops.append({"op": "add_layout", "name": lay, "as": "L_" + lay})
    L = "$L_" + lay
    ops.append({"op": "add_shape", "layout": L, "shape": "rectangle", "x": 0, "y": 0, "width": 100, "height": 100, "color": "#f7f2e7", "name": "Papier"})
    ops.append({"op": "add_image", "layout": L, "file": str(A / "paper.svg"), "alt": "", "position": {"x": 0, "y": 0, "width": 100, "height": 100}, "fit": False, "name": "Karomuster"})
    if nav:
        ops.append({"op": "add_block", "layout": L, "kind": "progress", "set": {"position": {"x": 7, "y": 94.2, "width": 86, "height": 1.1}, "variable": "progress", "color": ACCENT, "trackColor": "#e3dcc8", "rounded": True, "animate": True, "name": "Fortschritt"}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 7, "y": 85.6, "width": 11, "height": 6.2}, "text": "Zurück", "action": "prev", "name": "Zurück", "html": f'<p style="line-height:1.25;margin:0"><font color="{INK}">Zurück</font></p>', "appearance": {"background": None, "borderColor": INK, "borderWidth": 0.12}}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 81, "y": 85.6, "width": 12, "height": 6.2}, "text": "Weiter", "action": "advance", "name": "Weiter", "html": "Weiter"}})
    ops.append({"op": "add_block", "layout": L, "kind": "language", "set": {"position": {"x": 69, "y": 1.4, "width": 24, "height": 6.4}, "name": "Sprache"}})

# ---- 1: title ------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Titel", "as": "p1"})
P = "$p1"
text(P, "DEIN ERSTES LERNMODUL", 8, 15, 50, size=2.6, color=ACCENT, font=HEAD, bold=True, name="Kicker")
text(P, "Wie lernt man eigentlich am besten?", 8, 22, 52, size=7.4, font=HEAD, bold=True, line=1.05, name="Titel", h=42)
pic(P, "squiggle.svg", 8, 64.5, 34, h=34 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Finde es heraus – und lerne nebenbei, wie man ein Lernmodul baut.", 8, 70, 46, size=2.3, color=MUTED, name="Untertitel")
ops.append({"op": "add_block", "page": P, "kind": "button", "set": {"position": {"x": 8, "y": 84, "width": 15, "height": 7}, "text": "Los geht’s", "action": "advance", "name": "Los geht’s", "html": "Los geht’s"}})
pic(P, "icon_bulb.svg", 63, 17, 24, name="Glühbirne")
pic(P, "icon_question.svg", 54, 8, 9, name="Fragezeichen")
pic(P, "star.svg", 87, 11, 5, h=square(5), name="Stern 1")
pic(P, "star.svg", 58, 62, 4, h=square(4), name="Stern 2")
pic(P, "icon_check.svg", 84, 56, 8, name="Haken")

# ---- 2: seven ways ---------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p2"})
P = "$p2"
heading(P, "Sieben Wege, etwas zu lernen")
ways = [("book", "Lesen"), ("ear", "Zuhören"), ("eye", "Ansehen"), ("tv", "Sehen und hören"), ("bubbles", "Diskutieren"), ("flask", "Selbst ausprobieren"), ("teacher", "Anderen etwas beibringen")]
cell, left = 21.5, 7.0
prev, delay = "start", 450
for i, (icon, label) in enumerate(ways):
    col, row = i % 4, i // 4
    cx = left + cell * (col + 0.5)
    y0 = 21.5 if row == 0 else 53.0
    pic(P, f"icon_{icon}.svg", cx - 5, y0, 10, effect=fx("up"), name=label, as_=f"w{i}")
    text(P, label, cx - cell / 2 + 0.5, y0 + 18.4, cell - 1, size=2.7, font=HEAD, bold=True, align="center", effect=fx("up"), name=label + " (Text)", as_=f"wt{i}", line=1.1, h=11.8)
    ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$w{i}", "from": prev, "delayMs": delay, "weiter": False})
    ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$wt{i}", "from": f"entrance:$w{i}", "delayMs": 150, "weiter": False})
    prev, delay = f"entrance:$wt{i}", 280
pic(P, "icon_question.svg", 73.5, 55, 6.5, effect=fx("up"), name="Fragezeichen", as_="wq")
text(P, "Welcher bringt am meisten?", 71, 70.5, 22, size=3.0, color=ACCENT, font=HEAD, bold=True, align="center", effect=fx("up"), name="Frage", as_="wqt", line=1.1, h=13)
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$wq", "from": prev, "delayMs": 700, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$wqt", "from": "entrance:$wq", "delayMs": 150, "weiter": False})

# ---- 3: sort ---------------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p3"})
P = "$p3"
y = heading(P, "Was bleibt am besten hängen?", w=40, sub_width=32)
task = "Bring die sieben Lernwege in die richtige Reihenfolge: oben das, was am wenigsten hängen bleibt, unten das, was am meisten bringt."
text(P, task, 7, y, 36, size=2.4, name="Aufgabe")
y2 = y + estimate(task, None, 36, 2.4, BODY, False, 1.0, 1.25, None) + 1.5
text(P, "Ziehe die Karten an die richtige Stelle – und schätze einfach!", 7, y2, 36, size=2.3, color=MUTED, name="Hinweis")
pic(P, "arrow_right.svg", 37, y2 + 2, 10, h=10 * 16 / 9 * 160 / 300, name="Pfeil")
items = ["Lesen", "Zuhören", "Ansehen", "Sehen und hören", "Diskutieren", "Selbst ausprobieren", "Anderen etwas beibringen"]
ops.append({"op": "add_sort", "page": P, "items": [{"text": t} for t in items], "orientation": "vertical", "startLabel": "bleibt wenig hängen", "endLabel": "bleibt viel hängen",
            "x": 48, "y": 6, "width": 45, "height": 77, "required": True,
            "onCorrect": [{"variableId": "sortCorrect", "op": "set", "value": True}], "onIncorrect": [{"variableId": "sortCorrect", "op": "set", "value": False}], "name": "Reihenfolge", "as": "sort"})

# fork 1: right / almost
ops.append({"op": "add_logic", "after": "end", "name": "Reihenfolge richtig?", "layout": "$L_Skizzenheft", "as": "fork1",
            "branches": [{"label": "Richtig", "condition": {"variable": "sortCorrect", "comparator": "eq", "value": True}}, {"label": "Fast"}]})

P = "4.a.1"
text(P, "Genau so!", 7, 12, 60, size=9, color=GREEN, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 30, h=30 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Du hast ein gutes Gefühl dafür, wie Lernen funktioniert.", 7, 40, 62, size=3.0, name="Text", h=15)
text(P, "Gleich wird aus deiner Reihenfolge eine Pyramide.", 7, 60, 62, size=2.4, color=MUTED, name="Hinweis", effect=fx("up"))
pic(P, "icon_check.svg", 62, 18, 24, name="Haken")
pic(P, "star.svg", 88, 14, 5, h=square(5), name="Stern")

P = "4.b.1"
text(P, "Fast!", 7, 12, 60, size=9, color=ACCENT, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 24, h=24 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Gar nicht so einfach, oder? Das war auch eine Schätzfrage.", 7, 40, 62, size=3.0, name="Text", h=15)
text(P, "Gleich siehst du die Reihenfolge, wie sie meistens erzählt wird.", 7, 60, 62, size=2.4, color=MUTED, name="Hinweis", effect=fx("up"))
pic(P, "icon_bulb.svg", 62, 18, 22, name="Glühbirne")
pic(P, "star.svg", 88, 14, 5, h=square(5), name="Stern")

# ---- 5: the pyramid grows --------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "after": "end", "as": "p5"})
P = "$p5"
heading(P, "Die Lernpyramide", sub_width=26)
pct = ["10 %", "20 %", "30 %", "50 %", "70 %", "80 %", "90 %"]
mid_y = [196 + (744 - 196) / 7 * (i + 0.5) for i in range(7)]
for i in range(7):
    pic(P, f"tier_{i + 1}.svg", 0, round(150 / 9, 3), 57.5, h=round(610 / 9, 3), effect=fx("down", 650), name=f"Stufe {i + 1}", as_=f"t{i}")
    lab_h = round(3.7 * 1.3 * 1.78 + 2.0, 1)  # the percent figure (3.7 cqw) is the tallest part of the line
    lab_y = mid_y[i] / 9 - lab_h / 2
    text(P, "", 58.2, lab_y, 37.5, size=2.8, font=HEAD, bold=True, line=1.3, h=lab_h, effect=fx("up", 500), name=f"Beschriftung {i + 1}", as_=f"l{i}",
         paragraphs=[[{"text": pct[i], "color": TIER_DARK[i], "size": 3.7, "bold": True}, {"text": "  " + ways[i][1], "color": INK}]])
    ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$l{i}", "from": f"entrance:$t{i}", "delayMs": 250, "weiter": False})

# ---- 6: more active -> more sticks -----------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p6"})
P = "$p6"
text(P, "Je aktiver du lernst,", 7, 15, 88, size=6.0, font=HEAD, bold=True, name="Satz 1", line=1.05, h=13.5)
text(P, "desto mehr bleibt hängen.", 7, 28, 88, size=6.0, color=ACCENT, font=HEAD, bold=True, name="Satz 2", line=1.05, h=13.5, effect=fx("up", 600))
pic(P, "squiggle.svg", 7, 42.5, 40, h=40 * 16 / 9 * 40 / 600, name="Unterstreichung", effect=fx("up", 600))
text(P, "So steht es in vielen Büchern, Seminaren und Fortbildungen.", 7, 55, 78, size=2.5, color=MUTED, name="Hinweis", effect=fx("up"))
text(P, "Klingt logisch, oder?", 7, 66, 55, size=4.2, font=HEAD, bold=True, name="Frage", effect=fx("up"))
pic(P, "arrow_down.svg", 91, 8, 5.5, h=5.5 * 16 / 9 * 300 / 200, name="Pfeil")
pic(P, "star.svg", 90, 30, 5, h=square(5), name="Stern")

# ---- 7: is it true? -------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p7"})
P = "$p7"
heading(P, "Aber stimmt das überhaupt?", sub_width=30)
ops.append({"op": "add_block", "page": P, "kind": "quiz", "set": {
    "position": {"x": 7, "y": 24, "width": 56, "height": 58}, "name": "Stimmt das?", "single": True, "required": True,
    "questionHtml": f'<p style="margin:0;line-height:1.25"><font face="{BODY}"><span style="font-size:2.7cqw">Die Prozentzahlen der Lernpyramide (10\u00a0%, 20\u00a0% … 90\u00a0%) sind wissenschaftlich belegt.</span></font></p>',
    "options": [{"id": "wahr", "html": "Wahr"}, {"id": "falsch", "html": "Falsch"}], "correctOptionIds": ["falsch"],
    "onCorrect": [{"variableId": "quizCorrect", "op": "set", "value": True}], "onIncorrect": [{"variableId": "quizCorrect", "op": "set", "value": False}]}})
pic(P, "icon_question.svg", 72, 20, 15, name="Fragezeichen")

# fork 2: skeptical / surprised
ops.append({"op": "add_logic", "after": "end", "name": "Skeptisch?", "layout": "$L_Skizzenheft", "as": "fork2",
            "branches": [{"label": "Richtig", "condition": {"variable": "quizCorrect", "comparator": "eq", "value": True}}, {"label": "Überrascht"}]})

P = "8.a.1"
text(P, "Richtig erkannt!", 7, 12, 70, size=9, color=GREEN, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 36, h=36 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Du bist skeptisch – genau richtig.", 7, 40, 62, size=3.0, name="Text", h=15)
text(P, "Warum, siehst du auf der nächsten Folie.", 7, 60, 62, size=2.4, color=MUTED, name="Hinweis", effect=fx("up"))
pic(P, "icon_check.svg", 64, 18, 22, name="Haken")

P = "8.b.1"
text(P, "Überraschung!", 7, 12, 70, size=9, color=ACCENT, font=HEAD, bold=True, name="Überschrift")
pic(P, "squiggle.svg", 7, 31, 34, h=34 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Das glauben fast alle – die Zahlen sehen so ordentlich aus.", 7, 40, 62, size=3.0, name="Text", h=15)
text(P, "Warum es nicht stimmt, siehst du auf der nächsten Folie.", 7, 60, 62, size=2.4, color=MUTED, name="Hinweis", effect=fx("up"))
pic(P, "icon_bulb.svg", 64, 18, 22, name="Glühbirne")

# ---- 9: not proven -----------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "after": "end", "as": "p9"})
P = "$p9"
heading(P, "Die Zahlen sind nicht belegt.", sub_width=32)
text(P, "10\u00a0%   20\u00a0%   30\u00a0%   50\u00a0%   70\u00a0%   80\u00a0%   90\u00a0%", 7, 28, 84, size=4.8, color=MUTED, font=HEAD, bold=True, name="Prozentzahlen", line=1.1)
pic(P, "strike.svg", 6.0, 30.0, 76, h=76 * 16 / 9 * 50 / 900, name="Durchgestrichen", effect=fx("scale", 450), as_="strike")
text(P, "", 7, 44, 68, size=2.7, name="Dale", effect=fx("up"), as_="dale", h=19,
     paragraphs=[[{"text": "Edgar Dale", "bold": True}, " zeichnete 1946 einen „Kegel der Erfahrung“ – ganz ohne Prozentzahlen."]])
text(P, "Die Zahlen kamen später dazu. Eine Studie, die dahintersteckt, ist bis heute nicht auffindbar.", 7, 63, 72, size=2.7, name="Zahlen", effect=fx("up"), as_="zahlen")
pic(P, "icon_question.svg", 82, 40, 9, name="Fragezeichen")
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$strike", "from": "start", "delayMs": 700, "weiter": False})

# ---- 10: a true core -----------------------------------------------------------------------------------------------------------
ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p10"})
P = "$p10"
heading(P, "Ein wahrer Kern steckt trotzdem drin.", sub_width=38)
text(P, "Wer aktiv mitarbeitet, lernt meist besser als wer nur zuhört oder liest.", 7, 24, 68, size=2.8, name="Kern", h=16)
text(P, "", 7, 42, 80, size=2.4, name="Studie", effect=fx("up"), box={"fill": "#ffffff", "fillOpacity": 0.7, "radius": 2, "padding": 2, "borderColor": INK, "borderWidth": 0.12},
     paragraphs=[[{"text": "225 Studien", "bold": True}, " (Freeman u. a., 2014): Mit aktivem Lernen fielen ", {"text": "21,8\u00a0%", "bold": True, "color": GREEN}, " durch, in reinen Vorlesungen ", {"text": "33,8\u00a0%", "bold": True, "color": ACCENT}, "."]])
for i, (icon, label) in enumerate((("flask", "Ausprobieren"), ("bubbles", "Diskutieren"), ("teacher", "Erklären"))):
    x = 12 + i * 22
    pic(P, f"icon_{icon}.svg", x, 63, 8, effect=fx("up"), name=label)
    text(P, label, x - 4, 63 + square(8) + 0.5, 16, size=2.6, font=HEAD, bold=True, align="center", effect=fx("up"), name=label + " (Text)")
pic(P, "icon_check.svg", 78, 22, 12, name="Haken")

if not TEMPLATE:
    # ---- 11: bridge ------------------------------------------------------------------------------------------------------------------
    ops.append({"op": "add_page", "layout": "$L_Skizzenheft", "as": "p11"})
    P = "$p11"
    text(P, "Und jetzt der Trick:", 7, 10, 70, size=6.2, font=HEAD, bold=True, color=ACCENT, name="Überschrift")
    text(P, "Du hast gerade aktiv gelernt.", 7, 27, 56, size=3.4, font=HEAD, bold=True, name="Satz 1")
    text(P, "Du hast sortiert, geraten und entschieden – statt nur zu lesen.", 7, 36, 52, size=2.6, name="Satz 2", effect=fx("up"))
    text(P, "Genau so ist dieses Lernmodul gebaut. Im zweiten Teil zeige ich dir, wie.", 7, 52, 52, size=2.6, name="Satz 3", effect=fx("up"))
    pic(P, "icon_bulb.svg", 66, 14, 22, name="Glühbirne")
    pic(P, "star.svg", 90, 12, 4, h=square(4), name="Stern")

if TEMPLATE:
    ops.append({"op": "set_template", "template": True})
else:
    exec(compile((HERE / "partb.py").read_text(), "partb.py", "exec"))

ops.append({"op": "set_transition", "page": "all", "type": "fade", "durationMs": 350})

# The template is used by people in every language, and the names of blocks, branches and layouts are not translated: in the template they are English.
NAMES_EN = {
    "Anderen etwas beibringen": "Teaching someone else", "Ansehen": "Looking", "Aufgabe": "Task", "Ausprobieren": "Trying out", "Dale": "Dale",
    "Diskutieren": "Discussing", "Durchgestrichen": "Crossed out", "Erklären": "Explaining", "Fast": "Almost", "Fortschritt": "Progress", "Frage": "Question",
    "Fragezeichen": "Question mark", "Glühbirne": "Light bulb", "Haken": "Check mark", "Hinweis": "Hint", "Karomuster": "Grid pattern", "Kern": "Core",
    "Kicker": "Kicker", "Lesen": "Reading", "Los geht’s": "Let’s go", "Papier": "Paper", "Pfeil": "Arrow", "Prozentzahlen": "Percentages", "Reihenfolge": "Order",
    "Reihenfolge richtig?": "Order correct?", "Richtig": "Correct", "Satz 1": "Sentence 1", "Satz 2": "Sentence 2", "Sehen und hören": "Seeing and hearing",
    "Selbst ausprobieren": "Trying it yourself", "Skeptisch?": "Sceptical?", "Skizzenheft": "Sketchbook", "Sprache": "Language", "Stern": "Star", "Stern 1": "Star 1",
    "Stern 2": "Star 2", "Stimmt das?": "Is that true?", "Studie": "Study", "Text": "Text", "Titel": "Title", "Unterstreichung": "Underline", "Untertitel": "Subtitle",
    "Weiter": "Next", "Zahlen": "Numbers", "Zuhören": "Listening", "Zurück": "Back", "Überrascht": "Surprised", "Überschrift": "Heading",
}
for _i in range(1, 8):
    NAMES_EN[f"Beschriftung {_i}"] = f"Label {_i}"
    NAMES_EN[f"Stufe {_i}"] = f"Level {_i}"


def english_names(node):
    if isinstance(node, dict):
        return {k: (english_names_value(v) if k in ("name", "label") and isinstance(v, str) else english_names(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [english_names(x) for x in node]
    return node


def english_names_value(v):
    if v.endswith(" (Text)"):
        return NAMES_EN.get(v[:-7], v[:-7]) + " (text)"
    return NAMES_EN.get(v, v)


if TEMPLATE:
    ops = english_names(ops)

(HERE / ("ops-vorlage.json" if TEMPLATE else "ops.json")).write_text(json.dumps(ops, ensure_ascii=False, indent=1))
print(len(ops), "operations")
