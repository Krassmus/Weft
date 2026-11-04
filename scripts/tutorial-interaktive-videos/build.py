"""Builds the tutorial "Ein interaktives Video erstellen" (German; the other languages are put in by build.sh) with the weft command line tool.

The module is a short one: a video (made by video/render.mjs) that is first a plain element of a presentation, then an interactive one (it stops by itself and
asks a question), then three steps that show how that is made, the time marks, the event graph, and some ideas. The pictures of the editor (crops/) come from
capture.mjs, which needs the module without them first: SHOTS=0 builds that one."""
import json
import math
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import drawings  # noqa: E402
import kit  # noqa: E402
from kit import *  # noqa: E402,F401,F403
from kit import ops  # noqa: E402

CROPS = HERE / "crops"
SHOTS = os.environ.get("SHOTS", "1") == "1" and (CROPS / "de" / "rects.json").exists()
RECTS = json.loads((CROPS / "de" / "rects.json").read_text()) if SHOTS else {}

def rect(crop, name, pad=(0, 0), width=None):
    """a rectangle of a crop (pixels of the German picture - the others have the same geometry), a little bigger by pad, or only `width` wide"""
    x0, y0, x1, y1 = RECTS[crop][name]
    if width:
        x1 = x0 + width
    return (x0 - pad[0], y0 - pad[1], x1 + pad[0], y1 + pad[1])


LANGS = ["de_DE"]  # build.sh adds the others when it puts the translations in (see tr/)

kit.LANGS = LANGS
drawings.build()

# ---- module, look ------------------------------------------------------------------------------------------------------------
op(op="set_title", title="Ein interaktives Video erstellen")
op(op="set_languages", languages=LANGS)
op(op="set_look", brightness="dark", accentColor=ACCENT, interactiveStyle="plain")
op(op="set_palette", colors=[INK, ACCENT, TEAL, CORAL, BLUE, PANEL, BG])
op(op="add_asset", file=str(A / "farben.mp4"), **{"as": "film"})

# ---- layouts -----------------------------------------------------------------------------------------------------------------
for lay, nav in (("Inhalt", True), ("Titel", False)):
    ops.append({"op": "add_layout", "name": lay, "as": "L_" + lay})
    L = "$L_" + lay
    ops.append({"op": "add_shape", "layout": L, "shape": "rectangle", "x": 0, "y": 0, "width": 100, "height": 100, "color": BG, "name": "Hintergrund"})
    if nav:
        ops.append({"op": "add_block", "layout": L, "kind": "progress", "set": {"position": {"x": 7, "y": 94.2, "width": 86, "height": 1.0}, "variable": "progress", "color": ACCENT, "trackColor": "#26335a", "rounded": True, "animate": True, "name": "Fortschritt"}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 7, "y": 85.6, "width": 11, "height": 6.2}, "text": "Zurück", "action": "prev", "name": "Zurück", "html": f'<p style="line-height:1.25;margin:0"><font face="{BODY}" color="{INK}">Zurück</font></p>', "appearance": {"background": None, "borderColor": MUTED, "borderWidth": 0.12}}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 81, "y": 85.6, "width": 12, "height": 6.2}, "text": "Weiter", "action": "advance", "name": "Weiter", "html": f'<p style="line-height:1.25;margin:0"><font face="{BODY}" color="{DARK}"><b>Weiter</b></font></p>', "appearance": {"background": ACCENT, "borderColor": ACCENT, "borderWidth": 0}}})
    # The language switch is on the first slide only (the layout "Titel"): whoever does not understand the language finds it there at once.
    if not nav:
        ops.append({"op": "add_block", "layout": L, "kind": "language", "set": {"position": {"x": 69, "y": 1.4, "width": 24, "height": 6.4}, "name": "Sprache"}})


def new_page(name, layout="Inhalt"):
    ops.append({"op": "add_page", "layout": f"$L_{layout}", "as": name})
    return "$" + name


def video(page, x, y, w, name, as_, stops=()):
    """the film, w percent wide at (x, y) (it is 16:9, like the slide, so it is as high as it is wide); stops: (id, second, stops the video)"""
    ops.append({"op": "add_video", "page": page, "asset": "$film", "controls": True, "autoplay": False, "muted": False, "position": {"x": x, "y": y, "width": w, "height": w}, "fit": False, "as": as_})
    sets = {"name": name, "stopPoints": [{"id": i, "timeSeconds": t, "stopsVideo": s} for i, t, s in stops]}
    ops.append({"op": "update_block", "block": "$" + as_, "set": sets})


def card(page, x, y, w, h, as_=None, color=PANEL, name="Karte", effect=None):
    o = {"op": "add_shape", "page": page, "shape": "rectangle", "x": x, "y": y, "width": w, "height": h, "color": color, "radius": 5, "name": name}
    if effect:
        o["effect"] = effect
    if as_:
        o["as"] = as_
    ops.append(o)


# ---- 1: title --------------------------------------------------------------------------------------------------------------
P = new_page("p1", "Titel")
card(P, 58, 14, 35, 64, name="Tafel", color=PANEL)
pic(P, "icon_clapper.svg", 64.5, 22, 22, name="Filmklappe")
pic(P, "icon_play.svg", 61, 59, 7, name="Abspielen")
pic(P, "icon_clock.svg", 71, 59, 7, name="Stoppuhr")
pic(P, "icon_star.svg", 81, 59, 7, name="Stern")
text(P, "WEFT-TUTORIAL", 8, 15, 50, size=2.6, color=TEAL, font=HEAD, bold=True, name="Kicker")
text(P, "Ein interaktives Video erstellen", 8, 22, 49, size=6.4, font=HEAD, bold=True, line=1.1, name="Titel", h=32)
bar(P, 8, 56, 14)
text(P, "Wie aus einem Video, das nur abläuft, eine Lernaufgabe wird – in vier Schritten.", 8, 62, 44, size=2.3, color=MUTED, name="Untertitel")
ops.append({"op": "add_block", "page": P, "kind": "button", "set": {"position": {"x": 8, "y": 79, "width": 15, "height": 7}, "text": "Los geht’s", "action": "advance", "name": "Los geht’s", "html": f'<p style="line-height:1.25;margin:0"><font face="{BODY}" color="{DARK}"><b>Los geht’s</b></font></p>', "appearance": {"background": ACCENT, "borderColor": ACCENT, "borderWidth": 0}}})

# ---- 2: a video is an element of a presentation ----------------------------------------------------------------------------------------
P = new_page("p2")
heading(P, "Das Video-Element", sub_width=26)
cur[0] = 25
body(P, "Eigentlich ist das Video in Weft ein Element für Präsentationen: Datei auf die Folie ziehen, auf Abspielen drücken – fertig.", w=40, size=2.5, name="Präsentation")
body(P, "Es weiß nichts von dem, was sonst auf der Folie passiert.", w=40, size=2.5, color=MUTED, name="Ohne Verbindung", effect=fx("up"))
video(P, 51, 26, 42, "Video (ohne Zeitmarken)", "v2")

# ---- 3: ... but it can be interactive ------------------------------------------------------------------------------------------------
P = new_page("p3")
heading(P, "Aber es kann mehr", sub_width=36)
text(P, "Starte das Video. Es hält in der Mitte von selbst an – und eine Frage erscheint.", 7, 25, 86, size=2.4, color=MUTED, name="Aufgabe", h=6)
video(P, 7, 33, 44, "Video (mit Zeitmarke)", "v3", stops=[("s1", 6.0, True)])
ops.append({"op": "add_block", "page": P, "kind": "quiz", "set": {
    "position": {"x": 56, "y": 32, "width": 37, "height": 48}, "name": "Welche Farben?", "single": True,
    "questionHtml": f'<p style="margin:0;line-height:1.25"><font face="{BODY}"><span style="font-size:2.5cqw">Welche beiden Farben wurden gemischt?</span></font></p>',
    "options": [{"id": "a", "html": "Blau und Gelb"}, {"id": "b", "html": "Rot und Gelb"}, {"id": "c", "html": "Rot und Blau"}], "correctOptionIds": ["a"],
    "entranceEffect": fx("up", 450), "exitEffect": fx("up", 450)}, "as": "q3"})
# the video stops at the time mark and the question appears; when it is answered (a moment later, to see whether it was right) the video goes on, and the question goes
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$q3", "from": "video-stop:$v3:s1", "delayMs": 300, "weiter": False})
ops.append({"op": "add_trigger", "page": P, "to": "video-start:$v3", "from": "quiz-submit:$q3", "delayMs": 1800, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "exit:$q3", "from": "video-resume:$v3:s1", "delayMs": 0, "weiter": False})

# ---- 4: step 1, the question ---------------------------------------------------------------------------------------------------------
P = new_page("p4")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 1: Das Quiz erstellen", sub_width=38)
cur[0] = 25
body(P, "Lege zuerst die Elemente an: Mit „+“ über der Folie fügst du ein Quiz hinzu.", w=36, size=2.4, name="Quiz anlegen")
body(P, "Schreibe die Frage und die Antworten hinein und gib dem Quiz einen Namen.", w=36, size=2.4, color=MUTED, name="Frage", effect=fx("up"))
if SHOTS:
    c = shot(P, "plus-menu", 352, 461, 67, 25, 24)
    callout(P, c, rect("plus-menu", "quiz", (4, 3)), "Hier: Quiz", (44, 52), label_w=16, anchor=(52, 55), bend=0.2)

# ---- 5: step 2, a time mark -----------------------------------------------------------------------------------------------------------
P = new_page("p5")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 2: Die Zeitmarke setzen", sub_width=38)
text(P, "Wähle das Video aus und öffne „Zeitmarken konfigurieren“. Spiele das Video bis zur gewünschten Stelle und erstelle dort eine Zeitmarke.", 7, 25, 86, size=2.4, name="Zeitmarke", h=11)
if SHOTS:
    c = shot(P, "dialog-mark", 720, 185, 12, 47, 76)
    callout(P, c, rect("dialog-mark", "mark", (2, 2)), "Hier sitzt die Zeitmarke: 0:06", (60, 37.5), label_w=34, anchor=(70, 44.5), bend=0.2)
    callout(P, c, rect("dialog-mark", "stop", width=150), "Hier hält das Video an", (38, 82), label_w=26, anchor=(48, 82), bend=-0.25)

# ---- 6: step 3, the question appears there -------------------------------------------------------------------------------------------------
P = new_page("p6")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 3: Das Quiz erscheint dort", sub_width=38)
text(P, "Im selben Dialog wählst du bei „Lässt erscheinen“ das Quiz aus. Bis das Video die Zeitmarke erreicht, bleibt es unsichtbar.", 7, 25, 86, size=2.4, name="Erscheinen", h=11)
if SHOTS:
    c = shot(P, "dialog-shows", 720, 125, 12, 47, 76)
    callout(P, c, rect("dialog-shows", "row", width=210), "Das Quiz erscheint an der Zeitmarke", (36, 38.5), label_w=52, anchor=(60, 44.5), bend=0.2)
    callout(P, c, rect("dialog-shows", "again", width=395), "… und geht wieder, wenn das Video weiterläuft", (28, 75), label_w=64, anchor=(50, 77), bend=-0.2)

# ---- 7: step 4, the video goes on ----------------------------------------------------------------------------------------------------------
P = new_page("p7")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 4: Das Video läuft weiter", sub_width=38)
cur[0] = 25
body(P, "Im Event-Graph klickst du auf „Start des Videos“. Dort stellst du ein, wann das Video wieder losgeht: nach dem Ereignis „Quiz abgeschickt“.", w=36, size=2.4, name="Weiter")
body(P, "Mit etwas Verzögerung – dann sieht man erst, ob die Antwort richtig war.", w=36, size=2.4, color=MUTED, name="Verzögerung", effect=fx("up"))
if SHOTS:
    c = shot(P, "event-panel", 300, 420, 70, 24, 22)
    callout(P, c, rect("event-panel", "after", (3, 3)), "Nach diesem Ereignis geht es weiter", (46, 70), label_w=20, anchor=(56, 73), bend=0.2)
    callout(P, c, rect("event-panel", "delay", (3, 3)), "Wartezeit in Sekunden", (46, 50), label_w=20, anchor=(56, 53), bend=0.2)

# ---- 7: time marks in detail --------------------------------------------------------------------------------------------------------------
P = new_page("p7")
kicker(P, "ZEITMARKEN")
heading(P, "Zeitmarken genau genommen", sub_width=36)
text(P, "Jede Zeitmarke hat eine Zeit in Minuten und Sekunden – auf etwa eine Viertelsekunde genau. Du kannst beliebig viele setzen; Weft sortiert sie.", 7, 24.5, 40, size=2.3, name="Viele")
text(P, "Mit „Video hier stoppen“ hält das Video an. Ohne den Haken läuft es weiter, und die Zeitmarke löst nur etwas aus – zum Beispiel einen Hinweis.", 53, 24.5, 40, size=2.3, name="Stoppen", effect=fx("up"))
pic(P, "timeline.svg", 7, 50, 86, h=round(86 * 16 / 9 * 110 / 1000, 2), name="Zeitleiste", effect=fx("up"))
text(P, "", 20.8, 67, 24, size=2.3, align="center", font=HEAD, bold=True, line=1.15, h=14, name="Marke ohne Stopp", effect=fx("up"), as_="m1",
     paragraphs=[[{"text": "0:03 ", "color": TEAL}, {"text": "läuft weiter", "color": INK}], [{"text": "blendet nur einen Hinweis ein", "color": MUTED, "bold": False, "size": 2.0}]])
text(P, "", 50, 67, 24, size=2.3, align="center", font=HEAD, bold=True, line=1.15, h=14, name="Marke mit Stopp", effect=fx("up"), as_="m2",
     paragraphs=[[{"text": "0:06 ", "color": CORAL}, {"text": "hält an", "color": INK}], [{"text": "das Quiz erscheint", "color": MUTED, "bold": False, "size": 2.0}]])

# ---- 8: the event graph -------------------------------------------------------------------------------------------------------------------
P = new_page("p8")
kicker(P, "EVENT-GRAPH")
heading(P, "Der Event-Graph", sub_width=26)
text(P, "Der Event-Graph zeigt, was wann passiert. Mit „Weiter“ gehen wir ihn einmal Schritt für Schritt ab.", 7, 24.5, 86, size=2.4, name="Graph", h=11)
if SHOTS:
    c = shot(P, "graph", 1034, 295, 18, 36.5, 64)
    STATIONS = [
        ("mark", "Das Video erreicht die Zeitmarke 0:06 und hält an."),
        ("shown", "Im selben Moment erscheint das Quiz."),
        ("submitted", "Von 2 nach 3 geht es, sobald die Frage abgeschickt wird – ganz gleich, ob die Antwort richtig oder falsch ist."),
        ("start", "Daraufhin startet das Video wieder, nach 1,8 Sekunden Wartezeit."),
        ("resume", "Das Video läuft weiter."),
        ("gone", "Und das Quiz verschwindet wieder. Für jede weitere Frage wiederholt sich dieses Muster."),
    ]
    STAY = 4200  # how long one station is shown (ms): time to read
    for n, (key, caption) in enumerate(STATIONS, 1):
        x0, y0, x1, y1 = RECTS["graph"][key]
        marker(P, c, x1 - 2, y0 + 2, n, f"mk{n}")
        text(P, "", 13, 70.5, 74, size=2.4, font=BODY, line=1.25, h=13, effect=fx("up", 350), name=f"Station {n}", as_=f"cp{n}",
             paragraphs=[[{"text": f"{n}  ", "color": ACCENT, "bold": True, "font": HEAD}, caption]])
        ops.append({"op": "update_block", "block": f"$cp{n}", "set": {"exitEffect": fx("up", 300)}})
        ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$cp{n}", "from": f"entrance:$mk{n}m", "delayMs": 150, "weiter": False})
        if n > 1:
            # the next station comes by itself, after the time to read; its words replace those of the one before (the markers stay: at the end the whole way is to be seen)
            ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$mk{n}m", "from": f"entrance:$mk{n - 1}m", "delayMs": STAY, "weiter": False})
            ops.append({"op": "set_trigger", "page": P, "to": f"exit:$cp{n - 1}", "from": f"entrance:$mk{n}m", "delayMs": 0, "weiter": False})

# ---- 9: several questions: create everything first --------------------------------------------------------------------------------------------
P = new_page("p9")
kicker(P, "TIPP")
heading(P, "Mehrere Fragen: erst alles anlegen", sub_width=40)
text(P, "Hast du mehrere Fragen im Video, lege zuerst alle Elemente an – und benenne sie gut, damit du die Quizze später auseinanderhältst. Erst dann setzt du die Zeitmarken und ordnest ihnen die Elemente zu.", 7, 24.5, 86, size=2.4, name="Erst anlegen", h=17)
text(P, "1  Elemente anlegen und benennen", 7, 43, 60, size=2.6, color=TEAL, font=HEAD, bold=True, name="Schritt eins", effect=fx("up", 380), as_="tp1", h=6.5)
MARKS_X = [24.2, 50.0, 75.8]  # where the three marks of timeline3.svg are (percent of the slide)
tip_names = ["tp1"]
for k, (x, label) in enumerate(zip(MARKS_X, ["Frage 1 – Farben", "Frage 2 – Mischen", "Frage 3 – Merken"])):
    card(P, x - 12, 49.5, 24, 7.5, as_=f"tc{k}", color="#22305a", effect=fx("up", 380), name=f"Element {k + 1}")
    text(P, label, x - 12, 51.2, 24, size=2.3, bold=True, align="center", font=BODY, line=1.1, h=5, effect=fx("up", 380), name=f"Name {k + 1}", as_=f"tn{k}")
    tip_names += [f"tc{k}", f"tn{k}"]
pic(P, "timeline3.svg", 7, 60.5, 86, h=round(86 * 16 / 9 * 110 / 1000, 2), name="Zeitleiste", effect=fx("up", 380), as_="tl")
for k, x in enumerate(MARKS_X):
    arrow(P, x, 57.6, x, 64.2, f"ta{k}", bend=0.0, color=MUTED)
    text(P, ["0:06", "0:20", "0:41"][k], x - 6, 72, 12, size=2.6, color=CORAL, font=HEAD, bold=True, align="center", line=1.1, h=6.2, effect=fx("up", 380), name=f"Zeit {k + 1}", as_=f"tt{k}")
text(P, "2  Zeitmarken setzen und zuordnen", 7, 78, 60, size=2.6, color=TEAL, font=HEAD, bold=True, name="Schritt zwei", effect=fx("up", 380), as_="tp2", h=6.5)
tip_names += ["tl", "ta0", "ta1", "ta2", "tt0", "tt1", "tt2", "tp2"]
ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${tip_names[0]}", "from": "start", "delayMs": 800, "weiter": False})
chain(P, tip_names, 220)

# ---- 10: more ideas ------------------------------------------------------------------------------------------------------------------------
P = new_page("p10")
kicker(P, "IDEEN")
heading(P, "Was du sonst noch einbauen kannst", sub_width=40)
IDEAS = [
    ("note", "Hinweis einblenden", "Eine Zeitmarke ohne Stopp zeigt Text oder Bild, das Video läuft weiter."),
    ("cursor", "Zum Aufdecken", "Das Video hält an, ein Klick auf einen Button zeigt mehr."),
    ("fork", "Verzweigen", "Falsche Antwort? Dann gibt es erst noch eine Erklärung."),
    ("cards", "Zuordnen, sortieren", "Nach dem Video festigen Lernende, was sie gesehen haben."),
    ("star", "Punkte sammeln", "Jede richtige Antwort zählt – am Ende gibt es eine Auswertung."),
    ("clock", "Viele Zeitmarken", "Eine Frage nach der anderen: Das Video wird zum kleinen Test."),
]
iw = 27.5
idea_names = []
for i, (icon, title, desc) in enumerate(IDEAS):
    col, row = i % 3, i // 3
    x, y = 7 + col * (iw + 2.0), 24.5 + row * 30
    card(P, x, y, iw, 27.5, as_=f"ic{i}", effect=fx("up", 380), name=f"Karte {i + 1}")
    pic(P, f"icon_{icon}.svg", x + 1.6, y + 1.8, 5, effect=fx("up", 380), name=f"Symbol {i + 1}", as_=f"id{i}")
    text(P, title, x + 8, y + 1.8, iw - 9, size=2.5, font=HEAD, bold=True, line=1.1, h=11.5, effect=fx("up", 380), name=f"Titel {i + 1}", as_=f"it{i}")
    text(P, desc, x + 1.6, y + 12.5, iw - 3, size=2.0, color=MUTED, line=1.25, h=14, effect=fx("up", 380), name=f"Text {i + 1}", as_=f"ix{i}")
    idea_names += [f"ic{i}", f"id{i}", f"it{i}", f"ix{i}"]
ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${idea_names[0]}", "from": "start", "delayMs": 500, "weiter": False})
chain(P, idea_names, 100)

# ---- 11: your turn ----------------------------------------------------------------------------------------------------------------------
P = new_page("p11")
card(P, 66, 14, 27, 56, name="Tafel")
pic(P, "icon_check.svg", 69.5, 24, 20, name="Haken")
text(P, "Jetzt bist du dran", 7, 12, 56, size=7.0, font=HEAD, bold=True, color=ACCENT, name="Überschrift", h=16)
bar(P, 7, 28, 14)
text(P, "Starte ein neues Lernmodul, ziehe ein Video und ein Quiz auf eine Folie und setze die erste Zeitmarke.", 7, 35, 54, size=3.0, font=HEAD, bold=True, name="Aufforderung")
text(P, "Lass das Quiz dort erscheinen und das Video danach weiterlaufen – schon ist dein erstes interaktives Video fertig.", 7, 60, 54, size=2.5, effect=fx("up"), name="Schluss")

# ---- write -----------------------------------------------------------------------------------------------------------------------------
(HERE / "ops.json").write_text(json.dumps(ops, ensure_ascii=False, indent=1))
print(f"{len(ops)} operations, pictures of the editor: {'yes' if SHOTS else 'no'}")
