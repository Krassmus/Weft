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
op(op="set_look", brightness="light", accentColor=ACCENT, interactiveStyle="round")
op(op="set_palette", colors=[INK, ACCENT, BLUE, GREEN, "#f6c945", "#f7f2e7"] + TIER)
op(op="add_asset", file=str(A / "farben.mp4"), **{"as": "film"})

# ---- layouts -----------------------------------------------------------------------------------------------------------------
for lay, nav in (("Skizzenheft", True), ("Titel", False)):
    ops.append({"op": "add_layout", "name": lay, "as": "L_" + lay})
    L = "$L_" + lay
    ops.append({"op": "add_shape", "layout": L, "shape": "rectangle", "x": 0, "y": 0, "width": 100, "height": 100, "color": "#f7f2e7", "name": "Papier"})
    ops.append({"op": "add_image", "layout": L, "file": str(A / "paper.svg"), "alt": "", "position": {"x": 0, "y": 0, "width": 100, "height": 100}, "fit": False, "name": "Karomuster"})
    if nav:
        ops.append({"op": "add_block", "layout": L, "kind": "progress", "set": {"position": {"x": 7, "y": 94.2, "width": 86, "height": 1.1}, "variable": "progress", "color": ACCENT, "trackColor": "#e3dcc8", "rounded": True, "animate": True, "name": "Fortschritt"}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 7, "y": 85.6, "width": 11, "height": 6.2}, "text": "Zurück", "action": "prev", "name": "Zurück", "html": f'<p style="line-height:1.25;margin:0"><font color="{INK}">Zurück</font></p>', "appearance": {"background": None, "borderColor": INK, "borderWidth": 0.12}}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": {"position": {"x": 81, "y": 85.6, "width": 12, "height": 6.2}, "text": "Weiter", "action": "advance", "name": "Weiter", "html": "Weiter"}})
    # The language switch is on the first slide only (the layout "Titel"): whoever does not understand the language finds it there at once.
    if not nav:
        ops.append({"op": "add_block", "layout": L, "kind": "language", "set": {"position": {"x": 69, "y": 1.4, "width": 24, "height": 6.4}, "name": "Sprache"}})


def new_page(name, layout="Skizzenheft"):
    ops.append({"op": "add_page", "layout": f"$L_{layout}", "as": name})
    return "$" + name


def video(page, x, y, w, name, as_, stops=()):
    """the film, w percent wide at (x, y) (it is 16:9, like the slide, so it is as high as it is wide); stops: (id, second, stops the video)"""
    ops.append({"op": "add_video", "page": page, "asset": "$film", "controls": True, "autoplay": False, "muted": False, "position": {"x": x, "y": y, "width": w, "height": w}, "fit": False, "as": as_})
    sets = {"name": name, "stopPoints": [{"id": i, "timeSeconds": t, "stopsVideo": s} for i, t, s in stops]}
    ops.append({"op": "update_block", "block": "$" + as_, "set": sets})


# ---- 1: title --------------------------------------------------------------------------------------------------------------
P = new_page("p1", "Titel")
text(P, "WEFT-TUTORIAL", 8, 15, 50, size=2.6, color=ACCENT, font=HEAD, bold=True, name="Kicker")
text(P, "Ein interaktives Video erstellen", 8, 22, 52, size=7.4, font=HEAD, bold=True, line=1.05, name="Titel", h=30)
pic(P, "squiggle.svg", 8, 53.5, 34, h=34 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Wie aus einem Video, das nur abläuft, eine Lernaufgabe wird – in drei Schritten.", 8, 60, 46, size=2.3, color=MUTED, name="Untertitel")
ops.append({"op": "add_block", "page": P, "kind": "button", "set": {"position": {"x": 8, "y": 78, "width": 15, "height": 7}, "text": "Los geht’s", "action": "advance", "name": "Los geht’s", "html": "Los geht’s"}})
pic(P, "icon_tv.svg", 63, 17, 24, name="Fernseher")
pic(P, "icon_question.svg", 54, 8, 9, name="Fragezeichen")
pic(P, "star.svg", 87, 11, 5, h=square(5), name="Stern 1")
pic(P, "star.svg", 58, 62, 4, h=square(4), name="Stern 2")
pic(P, "icon_clock.svg", 84, 58, 9, name="Stoppuhr")

# ---- 2: a video is an element of a presentation ----------------------------------------------------------------------------------------
P = new_page("p2")
heading(P, "Das Video-Element", sub_width=26)
cur[0] = 25
body(P, "Eigentlich ist das Video in Weft ein Element für Präsentationen: Datei auf die Folie ziehen, auf Abspielen drücken – fertig.", w=40, size=2.5, name="Präsentation")
body(P, "Es weiß nichts von dem, was sonst auf der Folie passiert.", w=40, size=2.5, color=MUTED, name="Ohne Verbindung", effect=fx("up"))
video(P, 51, 26, 42, "Video (ohne Zeitmarken)", "v2")

# ---- 3: ... but it can be interactive ------------------------------------------------------------------------------------------------
P = new_page("p3")
heading(P, "Aber es kann mehr: ein Video mit Frage", sub_width=36)
text(P, "Starte das Video. Es hält von selbst an – und stellt dir eine Frage.", 7, 25, 86, size=2.4, color=MUTED, name="Aufgabe", h=6)
video(P, 7, 33, 44, "Video (mit Zeitmarke)", "v3", stops=[("s1", 6.0, True)])
ops.append({"op": "add_block", "page": P, "kind": "quiz", "set": {
    "position": {"x": 56, "y": 33, "width": 37, "height": 44}, "name": "Welche Farben?", "single": True,
    "questionHtml": f'<p style="margin:0;line-height:1.25"><font face="{BODY}"><span style="font-size:2.5cqw">Welche beiden Farben wurden gemischt?</span></font></p>',
    "options": [{"id": "a", "html": "Blau und Gelb"}, {"id": "b", "html": "Rot und Gelb"}, {"id": "c", "html": "Rot und Blau"}], "correctOptionIds": ["a"],
    "entranceEffect": fx("up", 450), "exitEffect": fx("up", 450)}, "as": "q3"})
# the video stops at the time mark and the question appears; when it is answered (a moment later, to see whether it was right) the video goes on, and the question goes
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$q3", "from": "video-stop:$v3:s1", "delayMs": 300, "weiter": False})
ops.append({"op": "add_trigger", "page": P, "to": "video-start:$v3", "from": "quiz-submit:$q3", "delayMs": 1800, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "exit:$q3", "from": "video-resume:$v3:s1", "delayMs": 0, "weiter": False})

# ---- 4: step 1, a time mark -----------------------------------------------------------------------------------------------------------
P = new_page("p4")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 1: Eine Zeitmarke setzen", sub_width=38)
text(P, "Wähle das Video aus und öffne „Zeitmarken konfigurieren“. Spiele das Video bis zur gewünschten Stelle und erstelle dort eine Zeitmarke.", 7, 25, 86, size=2.4, name="Zeitmarke", h=11)
if SHOTS:
    c = shot(P, "dialog-mark", 720, 185, 12, 47, 76)
    callout(P, c, rect("dialog-mark", "mark", (2, 2)), "Hier sitzt die Zeitmarke: 0:06", (60, 37.5), label_w=34, anchor=(70, 44.5), bend=0.2)
    callout(P, c, rect("dialog-mark", "stop", width=150), "Hier hält das Video an", (38, 82), label_w=26, anchor=(48, 82), bend=-0.25)

# ---- 5: step 2, the question appears there -------------------------------------------------------------------------------------------------
P = new_page("p5")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 2: Das Quiz erscheint dort", sub_width=38)
text(P, "Im selben Dialog wählst du bei „Lässt erscheinen“ das Quiz aus. Bis das Video die Zeitmarke erreicht, bleibt es unsichtbar.", 7, 25, 86, size=2.4, name="Quiz", h=11)
if SHOTS:
    c = shot(P, "dialog-shows", 720, 125, 12, 47, 76)
    callout(P, c, rect("dialog-shows", "row", width=210), "Das Quiz erscheint an der Zeitmarke", (40, 38), label_w=40, anchor=(60, 44.5), bend=0.2)
    callout(P, c, rect("dialog-shows", "again", width=395), "… und geht wieder, wenn das Video weiterläuft", (36, 75), label_w=50, anchor=(50, 77), bend=-0.2)

# ---- 6: step 3, the video goes on ----------------------------------------------------------------------------------------------------------
P = new_page("p6")
kicker(P, "SO GEHT’S")
heading(P, "Schritt 3: Das Video läuft weiter", sub_width=38)
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
     paragraphs=[[{"text": "0:03 ", "color": "#4a9aa3"}, {"text": "läuft weiter", "color": INK}], [{"text": "blendet nur einen Hinweis ein", "color": MUTED, "bold": False, "size": 2.0}]])
text(P, "", 50, 67, 24, size=2.3, align="center", font=HEAD, bold=True, line=1.15, h=14, name="Marke mit Stopp", effect=fx("up"), as_="m2",
     paragraphs=[[{"text": "0:06 ", "color": "#d9534f"}, {"text": "hält an", "color": INK}], [{"text": "das Quiz erscheint", "color": MUTED, "bold": False, "size": 2.0}]])

# ---- 8: the event graph -------------------------------------------------------------------------------------------------------------------
P = new_page("p8")
kicker(P, "EVENT-GRAPH")
heading(P, "Der Event-Graph", sub_width=26)
text(P, "Unter der Folie zeigt der Event-Graph, was wann passiert. Für jede weitere Frage wiederholt sich dieses Muster.", 7, 24.5, 86, size=2.4, name="Graph", h=11)
if SHOTS:
    c = shot(P, "graph", 1034, 295, 13, 37.5, 74)
    LEGEND = [("mark", "Zeitmarke erreicht"), ("shown", "Quiz erscheint"), ("submitted", "Quiz abgeschickt"), ("start", "Video startet"), ("resume", "Video läuft weiter"), ("gone", "Quiz verschwindet")]
    names = []
    for n, (key, word) in enumerate(LEGEND, 1):
        x0, y0, x1, y1 = RECTS["graph"][key]
        marker(P, c, x1 - 2, y0 + 2, n, f"mk{n}")
        text(P, "", 13 + (n - 1) * 12.4, 76, 12.2, size=2.1, font=HEAD, bold=True, line=1.15, h=9, effect=fx("up", 350), name=f"Legende {n}", as_=f"lg{n}",
             paragraphs=[[{"text": f"{n} ", "color": ACCENT}, {"text": word, "color": INK}]])
        ops.append({"op": "set_trigger", "page": P, "to": f"entrance:$lg{n}", "from": f"entrance:$mk{n}t", "delayMs": 100, "weiter": False})
        names += [f"mk{n}m", f"lg{n}"]
    # (the whole row comes with one Weiter: the markers and their words follow each other)
    for prev, nxt in zip([f"lg{n}" for n in range(1, 6)], [f"mk{n}m" for n in range(2, 7)]):
        ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${nxt}", "from": f"entrance:${prev}", "delayMs": 250, "weiter": False})

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
    x, y = 7 + col * (iw + 2.0), 25 + row * 29
    pic(P, "star.svg" if icon == "star" else f"icon_{icon}.svg", x + 0.6, y + 0.4, 5, effect=fx("up", 380), name=f"Symbol {i + 1}", as_=f"id{i}")
    text(P, title, x + 7, y + 1.0, iw - 7, size=2.8, font=HEAD, bold=True, line=1.1, h=7, effect=fx("up", 380), name=f"Titel {i + 1}", as_=f"it{i}")
    text(P, desc, x + 0.6, y + 10.5, iw - 0.6, size=2.0, color=MUTED, line=1.25, h=15, effect=fx("up", 380), name=f"Text {i + 1}", as_=f"ix{i}")
    idea_names += [f"id{i}", f"it{i}", f"ix{i}"]
ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${idea_names[0]}", "from": "start", "delayMs": 500, "weiter": False})
chain(P, idea_names, 120)

# ---- 11: your turn ----------------------------------------------------------------------------------------------------------------------
P = new_page("p11")
text(P, "Jetzt bist du dran", 7, 12, 70, size=7.0, font=HEAD, bold=True, color=ACCENT, name="Überschrift")
pic(P, "squiggle.svg", 7, 30, 38, h=38 * 16 / 9 * 40 / 600, name="Unterstreichung")
text(P, "Starte ein neues Lernmodul, ziehe ein Video auf eine Folie und setze deine erste Zeitmarke.", 7, 38, 56, size=3.0, font=HEAD, bold=True, name="Aufforderung")
text(P, "Ein Quiz, das von ihr ausgelöst wird, und ein Video, das danach weiterläuft – schon ist dein erstes interaktives Video fertig.", 7, 55, 56, size=2.5, effect=fx("up"), name="Schluss")
pic(P, "icon_tv.svg", 66, 14, 22, name="Fernseher")
pic(P, "icon_check.svg", 70, 54, 12, name="Haken")

# ---- write -----------------------------------------------------------------------------------------------------------------------------
(HERE / "ops.json").write_text(json.dumps(ops, ensure_ascii=False, indent=1))
print(f"{len(ops)} operations, pictures of the editor: {'yes' if SHOTS else 'no'}")
