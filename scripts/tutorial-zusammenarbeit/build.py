"""Builds the tutorial "Gemeinsam an einem Weft-Dokument arbeiten" (German; the other languages are put in by build.sh) with the weft command line tool.

How to work together on a Weft module: first a way out for people who prefer to work alone, then three ways - the invitation link, the file with the link in it, the
shared folder (Nextcloud) - and, between the first two and the third, what a TURN server is for. The pictures of the editor (crops/) come from capture.mjs."""
import json
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
LANGS = ["de_DE", "en_US", "es_ES", "fr_FR", "pt_BR", "it_IT", "tr_TR", "pl_PL"]  # (the texts of the others come with build.sh: tr/)
if os.environ.get("DE_ONLY"):  # a quick draft in German alone (./run.sh): no other languages, so no pictures of the editor of the others are needed
    LANGS = LANGS[:1]
TITLE = "Gemeinsam an einem Weft-Dokument arbeiten"
LAST = 14  # the number of the last slide: the one a person who works alone is taken to

kit.LANGS = LANGS
drawings.build()
late = []  # operations that need slides made after the one they belong to


def rect(crop, name, pad=(0, 0)):
    """a rectangle of a crop (pixels of the German picture - the others have the same geometry), a little bigger by pad"""
    x0, y0, x1, y1 = RECTS[crop][name]
    return (x0 - pad[0], y0 - pad[1], x1 + pad[0], y1 + pad[1])


# ---- module, look ----------------------------------------------------------------------------------------------------------------
op(op="set_title", title=TITLE)
op(op="set_languages", languages=LANGS)
op(op="set_look", brightness="dark", accentColor=CYAN, interactiveStyle="plain")
op(op="set_palette", colors=[INK, CYAN, ORANGE, MUTED, CYAN_D, PANEL, BG])
for name in ("bg_content", "bg_title"):
    op(op="add_asset", file=str(A / f"{name}.svg"), **{"as": name})


def button_set(x, y, w, h, label, action, name, primary=True, **extra):
    appearance = {"background": CYAN if primary else None, "borderColor": CYAN if primary else MUTED, "borderWidth": 0 if primary else 0.1, "radius": 12}
    color = DARK if primary else INK
    return {"position": {"x": x, "y": y, "width": w, "height": h}, "text": label, "action": action, "name": name,
            "html": f'<p style="line-height:1.25;margin:0"><font face="{BODY}" color="{color}"><b>{label}</b></font></p>', "appearance": appearance, **extra}


# ---- layouts -----------------------------------------------------------------------------------------------------------------
for lay, nav, bg in (("Inhalt", True, "bg_content"), ("Titel", False, "bg_title"), ("Ende", False, "bg_title")):
    ops.append({"op": "add_layout", "name": lay, "as": "L_" + lay})
    L = "$L_" + lay
    ops.append({"op": "add_image", "layout": L, "asset": "$" + bg, "alt": "", "position": {"x": 0, "y": 0, "width": 100, "height": 100}, "fit": False, "as": "bg_" + lay})
    ops.append({"op": "update_block", "block": "$bg_" + lay, "set": {"name": "Hintergrund"}})
    if nav:
        ops.append({"op": "add_block", "layout": L, "kind": "progress", "set": {"position": {"x": 7, "y": 94.2, "width": 86, "height": 0.6}, "variable": "progress", "color": CYAN, "trackColor": "#0b2a3a", "rounded": True, "animate": True, "name": "Fortschritt"}})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": button_set(7, 85.6, 11, 6.2, "Zurück", "prev", "Zurück", primary=False)})
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": button_set(81, 85.6, 12, 6.2, "Weiter", "advance", "Weiter")})
    if lay == "Ende":
        ops.append({"op": "add_block", "layout": L, "kind": "button", "set": button_set(7, 85.6, 11, 6.2, "Zurück", "prev", "Zurück", primary=False)})
    # The language switch is on the first slide only (the layout "Titel"): whoever does not understand the language finds it there at once.
    if lay == "Titel":
        ops.append({"op": "add_block", "layout": L, "kind": "language", "set": {"position": {"x": 69, "y": 1.4, "width": 24, "height": 6.4}, "name": "Sprache"}})


def new_page(name, layout="Inhalt"):
    ops.append({"op": "add_page", "layout": f"$L_{layout}", "as": name})
    return "$" + name


def steps(page, items, x, y, w, h, gap=2.2, size=1.9, start=500, as_prefix="st"):
    """numbered steps in cards, one under the other: they appear one after the other with a single Weiter for all"""
    names = []
    for i, content in enumerate(items):
        yy = y + i * (h + gap)
        card(page, x, yy, w, h, as_=f"{as_prefix}c{i}", effect=fx("up", 380), name=f"Schritt {i + 1}")
        text(page, str(i + 1), x + 1.4, yy + 0.8, 4, size=2.8, color=ORANGE, font=HEAD, bold=True, align="center", line=1.0, h=7, effect=fx("up", 380), name=f"Nummer {i + 1}", as_=f"{as_prefix}n{i}")
        text(page, content, x + 6.4, yy + 1.2, w - 8, size=size, line=1.25, h=h - 2, effect=fx("up", 380), name=f"Text {i + 1}", as_=f"{as_prefix}t{i}")
        names += [f"{as_prefix}c{i}", f"{as_prefix}n{i}", f"{as_prefix}t{i}"]
    ops.append({"op": "set_trigger", "page": page, "to": f"entrance:${names[0]}", "from": "start", "delayMs": start, "weiter": False})
    chain(page, names, 140)


# ---- 1: title ----------------------------------------------------------------------------------------------------------------
P = new_page("p1", "Titel")
text(P, "WEFT-TUTORIAL", 8, 15, 50, size=2.2, color=CYAN, font=BODY, bold=True, name="Kicker")
text(P, TITLE, 8, 21, 49, size=3.8, font=HEAD, bold=True, line=1.15, name="Titel", h=38)
ops.append({"op": "add_shape", "page": P, "shape": "rectangle", "x": 8, "y": 57.6, "width": 14, "height": 0.3, "color": CYAN, "radius": 50, "shadow": glow(CYAN, 0.8, 0.9), "name": "Linie"})
ops.append({"op": "add_shape", "page": P, "shape": "rectangle", "x": 8, "y": 57.35, "width": 4.5, "height": 0.8, "color": ORANGE, "radius": 50, "shadow": glow(ORANGE, 0.8, 0.9), "name": "Kappe"})
text(P, "Live, per Datei oder über einen Cloud-Ordner wie Nextcloud.", 8, 61, 46, size=2.1, color=MUTED, name="Untertitel", h=14)
ops.append({"op": "add_block", "page": P, "kind": "button", "set": button_set(8, 83, 15, 7, "Los geht’s", "advance", "Los geht’s")})
pic(P, "hero.svg", 55, 13, 40, h=round(40 * PX * 410 / 500 / PY, 2), name="Netzwerk")

# ---- 2: alone or together ----------------------------------------------------------------------------------------------------
P = new_page("p2")
kicker(P, "ZUERST EINE FRAGE")
heading(P, "Lieber allein?", size=3.6)
text(P, "Du arbeitest am liebsten allein an deinen Dokumenten und Präsentationen? Das ist völlig in Ordnung. Weft verbindet sich mit niemandem, solange du nichts einschaltest.", 7, 23.5, 86, size=2.2, name="Frage", h=13)
for k, (x, icon, title, desc, label, action, primary) in enumerate((
    (7, "person", "Allein arbeiten", "Dann brauchst du nichts davon. Weft funktioniert genauso gut für dich allein.", "Tutorial beenden", "goto", False),
    (52, "people", "Zusammen arbeiten", "Dann zeige ich dir drei Wege – vom Link bis zum Cloud-Ordner.", "Zeig mir, wie", "advance", True),
)):
    card(P, x, 41, 41, 37, name=f"Karte {k + 1}")
    pic(P, f"icon_{icon}.svg", x + 2.5, 43, 6, name=f"Symbol {k + 1}")
    text(P, title, x + 10, 44.2, 29, size=2.6, font=BODY, bold=True, line=1.1, h=8, name=f"Titel {k + 1}")
    text(P, desc, x + 2.5, 54.5, 36, size=2.0, color=MUTED, h=12, name=f"Text {k + 1}")
    extra = {"targetPageId": str(LAST)} if action == "goto" else {}
    # (the button that jumps to the last slide is made when that slide is there: the number of a slide that does not exist yet means nothing)
    (late if action == "goto" else ops).append({"op": "add_block", "page": P, "kind": "button", "set": button_set(x + 2.5, 69, 20, 7.2, label, action, label, primary=primary, **extra)})

# ---- 3: three ways -----------------------------------------------------------------------------------------------------------
P = new_page("p3")
kicker(P, "ÜBERBLICK")
heading(P, "Drei Wege, zusammen zu arbeiten", size=3.6)
WAYS = [
    ("link", "1  Der Freigabelink", "Du schickst einen Link. Wer ihn öffnet, arbeitet live am selben Dokument.", "LIVE"),
    ("file", "2  Die Datei mit Link", "Der Link steckt in der gespeicherten Datei. Wer sie öffnet, ist gleich dabei.", "LIVE"),
    ("cloud", "3  Der Cloud-Ordner", "Weft gleicht das Dokument über einen Ordner ab, zum Beispiel in der Nextcloud.", "ZEITVERSETZT"),
]
way_names = []
for i, (icon, title, desc, tag) in enumerate(WAYS):
    x = 7 + i * 29.7
    card(P, x, 24, 27.6, 52, as_=f"wc{i}", effect=fx("up", 400), name=f"Karte {i + 1}")
    pic(P, f"icon_{icon}.svg", x + 2.2, 26, 6.5, effect=fx("up", 400), name=f"Symbol {i + 1}", as_=f"wi{i}")
    text(P, title, x + 2.2, 40.5, 24, size=2.0, font=BODY, bold=True, line=1.15, h=9, effect=fx("up", 400), name=f"Titel {i + 1}", as_=f"wt{i}")
    text(P, desc, x + 2.2, 50.5, 23.5, size=1.9, color=MUTED, h=18, effect=fx("up", 400), name=f"Text {i + 1}", as_=f"wx{i}")
    text(P, tag, x + 2.2, 71, 23, size=1.9, color=ORANGE if i == 2 else CYAN, font=BODY, bold=True, h=4.5, effect=fx("up", 400), name=f"Art {i + 1}", as_=f"wg{i}")
    way_names += [f"wc{i}", f"wi{i}", f"wt{i}", f"wx{i}", f"wg{i}"]
ops.append({"op": "set_trigger", "page": P, "to": f"entrance:${way_names[0]}", "from": "start", "delayMs": 500, "weiter": False})
chain(P, way_names, 120)
text(P, "Klappt eine Verbindung nicht, hilft ein TURN-Server – dazu gleich mehr.", 7, 78.4, 86, size=1.8, color=MUTED, name="TURN", h=6)

# ---- 4: way 1, the link (1/2) --------------------------------------------------------------------------------------------------
P = new_page("p4")
kicker(P, "WEG 1 – FREIGABELINK")
heading(P, "Der Freigabelink", size=3.6)
cur[0] = 24
body(P, "Öffne in der Seitenleiste den Reiter „Einstellungen“ und die Karte „Kollaboration“.", w=36, size=2.2, name="Karte")
body(P, "Setze den Haken bei „An Datei zusammen arbeiten“: Weft erzeugt einen Link, der mit „weft://“ beginnt.", w=36, size=2.2, name="Haken", effect=fx("up"))
body(P, "Kopiere ihn und schicke ihn per E-Mail oder Chat an die anderen.", w=36, size=2.2, color=MUTED, name="Weitergeben", effect=fx("up"))
if SHOTS:
    c = shot(P, "card-on", *RECTS["card-on"]["size"], 45, 24, 30)
    callout(P, c, rect("card-on", "switch"), "Einschalten", (78.5, 0), label_w=15, bend=0.05, centre=True)
    callout(P, c, rect("card-on", "link"), "Der Link", (78.5, 0), label_w=15, bend=0.05, centre=True)
    callout(P, c, rect("card-on", "copy"), "Kopieren", (78.5, 0), label_w=15, bend=0.05, centre=True)

# ---- 5: way 1, joining (2/2) -----------------------------------------------------------------------------------------------------
P = new_page("p5")
kicker(P, "WEG 1 – FREIGABELINK")
heading(P, "So treten die anderen bei", size=3.6)
cur[0] = 24
body(P, "Ist Weft installiert, genügt ein Klick auf den Link: Weft öffnet sich und fragt, ob du beitreten willst.", w=43, size=1.9, name="Klick")
body(P, "Oder du wählst „Datei“ → „Einladung beitreten…“ und fügst den Link ein.", w=43, size=1.9, name="Menü", effect=fx("up"))
body(P, "Dann arbeitet ihr live am selben Dokument. Wer gerade dabei ist, siehst du über der Folie als kleine Bilder.", w=43, size=1.9, color=MUTED, name="Live", effect=fx("up"))
text(P, "", 7, 69.5, 43, size=1.8, line=1.25, h=14, name="Wichtig", effect=fx("up"), paragraphs=[[{"text": "WICHTIG  ", "color": ORANGE, "bold": True, "font": BODY}, "Beitreten klappt nur, solange jemand das Dokument geöffnet hat. Wer den Link hat, darf alles ändern."]])
if SHOTS:
    c = shot(P, "join", *RECTS["join"]["size"], 54, 24, 39)
    callout(P, c, rect("join", "link"), "Hier den Link einfügen", (54, 74.4), label_w=24, bend=0.05, size=2.0)
    callout(P, c, rect("join", "join"), "… und beitreten", (77.5, 74.4), label_w=18, bend=0.05, size=2.0)

# ---- 6: way 2, the file with the link in it ----------------------------------------------------------------------------------------
P = new_page("p6")
kicker(P, "WEG 2 – DATEI MIT LINK")
heading(P, "Die Datei mit eingebautem Link", size=3.6)
text(P, "Derselbe Haken macht noch etwas: Beim Speichern steckt der Link in der Datei. So wird die Datei selbst zur Einladung.", 7, 23.5, 86, size=2.1, name="Idee", h=10)
steps(P, [
    "Haken bei „An Datei zusammen arbeiten“ setzen.",
    "Mit „Datei“ → „Speichern“ sichern.",
    "Die .weft-Datei verschicken: per E-Mail, Messenger, USB-Stick oder Cloud.",
], 7, 33.5, 46, 13.5, gap=1.5)
text(P, "Beim Exportieren steckt kein Link in der Datei.", 7, 78.4, 46, size=1.8, color=MUTED, name="Export", h=7, effect=fx("up"))
card(P, 58, 33, 35, 46, name="Frage-Karte", effect=fx("up", 400), as_="qc")
pic(P, "icon_file.svg", 60, 34.5, 7, effect=fx("up", 400), name="Datei", as_="qi")
text(P, "Wer die Datei öffnet, wird gefragt:", 68.5, 36.5, 23, size=1.8, font=BODY, bold=True, line=1.15, h=8, effect=fx("up", 400), name="Gefragt", as_="qt")
text(P, "„Diese Datei ist zur Live-Zusammenarbeit eingerichtet … Verbinden?“", 60, 49.5, 31, size=1.9, color=CYAN, line=1.3, h=14, effect=fx("up", 400), name="Rückfrage", as_="qq")
text(P, "Stimmt die Person zu, ist sie mit allen verbunden, die die Datei gerade geöffnet haben.", 60, 65, 31, size=1.8, color=MUTED, h=14, effect=fx("up", 400), name="Verbunden", as_="qv")
chain(P, ["qc", "qi", "qt", "qq", "qv"], 200)
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$qc", "from": "entrance:$stt2", "delayMs": 500, "weiter": False})

# ---- 7: the TURN server (1/2) ------------------------------------------------------------------------------------------------------
P = new_page("p7")
kicker(P, "WENN ES HAKT")
heading(P, "Der TURN-Server", size=3.6)
text(P, "Weft verbindet eure Computer direkt miteinander. In manchen Netzen – etwa an Hochschulen oder in Firmen – blockiert eine Firewall diesen Weg.", 7, 23.5, 86, size=2.2, name="Direkt", h=9)
text(P, "Dann hilft ein TURN-Server: Er leitet den Datenverkehr weiter.", 7, 32.5, 86, size=2.2, color=CYAN, font=BODY, bold=True, name="Dann", h=5, effect=fx("up"), as_="dann")
# the picture in two layers: the blocked way first, then the server and the way over it
DW, DH = 52, round(52 * PX * 430 / 1000 / PY, 2)
DX, DY = 24, 39
(A / "diagram_turn_a.svg").write_text(drawings.diagram_turn(part="a"))
(A / "diagram_turn_b.svg").write_text(drawings.diagram_turn(part="b"))
pic(P, "diagram_turn_a.svg", DX, DY, DW, h=DH, name="Gesperrter Weg")
pic(P, "diagram_turn_b.svg", DX, DY, DW, h=DH, effect=fx("up", 450), name="Weg über den Server", as_="turnb")


def at_d(px, py):
    return DX + px / 1000 * DW, DY + py / 430 * DH


lx, ly = at_d(110, 408)
text(P, "Dein Computer", lx - 10, ly, 20, size=1.9, color=MUTED, align="center", name="Dein Computer", h=5)
rx_, ry_ = at_d(890, 408)
text(P, "Computer der anderen", rx_ - 11, ry_, 22, size=1.9, color=MUTED, align="center", name="Computer der anderen", h=8)
wx, wy = at_d(500, 400)
text(P, "Firewall", wx - 8, wy, 16, size=1.9, color=ORANGE, align="center", name="Firewall", h=5)
sx_, sy_ = at_d(570, 70)
text(P, "TURN-Server", sx_ + 1, sy_, 18, size=2.0, color=ORANGE, font=BODY, bold=True, name="TURN-Server", h=5, effect=fx("up", 450), as_="turnl")
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$dann", "from": "start", "delayMs": 1800, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$turnb", "from": "entrance:$dann", "delayMs": 300, "weiter": False})
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$turnl", "from": "entrance:$turnb", "delayMs": 300, "weiter": False})

# ---- 8: the TURN server (2/2) ------------------------------------------------------------------------------------------------------
P = new_page("p8")
kicker(P, "WENN ES HAKT")
heading(P, "Den TURN-Server eintragen", size=3.6)
cur[0] = 24
body(P, "Öffne die Einstellungen von Weft (das Zahnrad oben rechts) und suche die Gruppe „Netzwerk (Zusammenarbeit)“.", w=33, size=2.0, name="Einstellungen")
body(P, "Trage dort Adresse, Benutzernamen und Passwort deines TURN-Servers ein.", w=33, size=2.0, name="Eintragen", effect=fx("up"))
body(P, "Einen TURN-Server bekommst du von deiner Schule, Hochschule oder Firma – oder du betreibst selbst einen.", w=33, size=2.0, color=MUTED, name="Woher", effect=fx("up"))
if SHOTS:
    c = shot(P, "network", *RECTS["network"]["size"], 61, 23, 31)
    callout(P, c, rect("network", "turn"), "Adresse des Servers", (41.5, 0), label_w=16.5, bend=0.05, align="right", centre=True, size=2.2)
    ring_box = (rect("network", "user")[0], rect("network", "user")[1], rect("network", "password")[2], rect("network", "password")[3])
    callout(P, c, ring_box, "Zugangsdaten", (41.5, 0), label_w=16.5, bend=0.05, align="right", centre=True, size=2.2)
    text(P, "Er gehört nur dir und steht nicht im Link: Wer selbst hinter so einer Firewall sitzt, trägt seinen eigenen ein.", 61, c["y"] + c["h"] + 3.5, 32, size=1.9, color=MUTED, name="Nur deiner", h=14, effect=fx("up"))

# ---- 9: way 3, the shared folder ---------------------------------------------------------------------------------------------------------
P = new_page("p9")
kicker(P, "WEG 3 – CLOUD-ORDNER")
heading(P, "Zusammenarbeit im Cloud-Ordner", size=3.6)
text(P, "Wenn nicht alle gleichzeitig online sein sollen, nehmt einen Ordner, den ein Dienst wie Nextcloud, Sciebo, Dropbox oder Syncthing für alle gleich hält. Weft legt dort seine Änderungen ab und übernimmt, was die anderen hineinlegen – ganz ohne Link, ohne Direktverbindung, ohne TURN-Server.", 7, 23.5, 86, size=2.0, name="Ordner", h=15)
DX, DY, DW = 25, 41, 50
DH = round(DW * PX * 430 / 1000 / PY, 2)
pic(P, "diagram_cloud.svg", DX, DY, DW, h=DH, name="Cloud-Ordner", effect=fx("up", 450), as_="cloud")
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$cloud", "from": "start", "delayMs": 1000, "weiter": False})
lx, ly = at_d(110, 408)
text(P, "Dein Computer", lx - 10, ly, 20, size=1.9, color=MUTED, align="center", name="Dein Computer", h=5)
rx_, ry_ = at_d(890, 408)
text(P, "Computer der anderen", rx_ - 11, ry_, 22, size=1.9, color=MUTED, align="center", name="Computer der anderen", h=8)
cx_, cy_ = at_d(600, 100)
text(P, "Ordner in der Cloud", cx_ + 1, cy_, 26, size=1.9, color=CYAN, font=BODY, bold=True, name="Ordner in der Cloud", h=5)
text(P, "Nur in der Desktop-App", 60, 2.4, 33, size=1.7, color=ORANGE, font=BODY, bold=True, align="right", name="Desktop-App", h=5)

# ---- 10: setting it up -----------------------------------------------------------------------------------------------------------
P = new_page("p10")
kicker(P, "WEG 3 – CLOUD-ORDNER")
heading(P, "So richtest du es ein", size=3.6)
steps(P, [
    "Lege in der Nextcloud einen Ordner an und gib ihn den anderen frei – mit Bearbeitungsrecht.",
    "Der Nextcloud-Client hält den Ordner auf deinem Computer aktuell.",
    "In Weft: „Einstellungen“ → „Kollaboration“ → „Ordner wählen und abgleichen …“ und den Ordner wählen.",
], 7, 24, 41, 18, gap=2.0, size=1.8)
if SHOTS:
    fo = RECTS["folder-off"]["size"]
    fn = RECTS["folder-on"]["size"]
    c1 = shot(P, "folder-off", *fo, 51, 25, 20.5, effect=fx("up", 450), as_="shot_off")
    c2 = shot(P, "folder-on", *fn, 73, 25, 20.5, effect=fx("up", 450), as_="shot_on")
    text(P, "Nachher: Weft gleicht ab, und die anderen erscheinen", 72.5, 25 + c2["h"] + 2.5, 21.5, size=1.8, color=MUTED, align="center", name="Nachher", h=10)
    callout(P, c1, rect("folder-off", "button"), "Hier klicken", (51, 25 + c1["h"] + 6), label_w=19, bend=0.05, align="left", size=2.2)
    ops.append({"op": "set_trigger", "page": P, "to": "entrance:$shot_off", "from": "entrance:$stt2", "delayMs": 500, "weiter": False})
    ops.append({"op": "set_trigger", "page": P, "to": "entrance:$shot_on", "from": "entrance:$shot_off", "delayMs": 900, "weiter": False})

# ---- 11: what happens in the folder ----------------------------------------------------------------------------------------------------
P = new_page("p11")
kicker(P, "WEG 3 – CLOUD-ORDNER")
heading(P, "Was im Ordner passiert", size=3.6)
TW = 55
TH = round(TW * PX * 300 / 1000 / PY, 2)
pic(P, "tree.svg", 7, 24, TW, h=TH, name="Ordner")


def at_t(py):
    return 24 + py / 300 * TH


for py, label in ((50, "Der Ordner deines Dokuments"), (112, "Öffnet das Dokument"), (168, "Änderungen von Mara"), (224, "Änderungen von Timo"), (276, "Bilder, Videos, Schriften")):
    text(P, label, 64.5, at_t(py) - 2.5, 31, size=1.9, color=MUTED, name="Zu: " + label, h=4.5)
text(P, "Jede Person schreibt nur in ihre eigene Datei. So entstehen in der Nextcloud nie „Konfliktkopien“ – Weft führt alles selbst zusammen.", 7, 58, 40, size=2.1, name="Eigene Datei", h=16)
text(P, "Alle paar Sekunden schaut Weft in den Ordner und übernimmt, was neu ist – in jeder Reihenfolge.", 52, 58, 41, size=2.1, color=MUTED, name="Alle paar Sekunden", h=16, effect=fx("up"))

# ---- 12: how the others join the folder ---------------------------------------------------------------------------------------------
P = new_page("p12")
kicker(P, "WEG 3 – CLOUD-ORDNER")
heading(P, "So machen die anderen mit", size=3.6)
steps(P, [
    "Sie bekommen den Ordner in der Nextcloud freigegeben und synchronisieren ihn auf ihren Computer.",
    "Im Ordner des Dokuments öffnen sie die Datei „Erdkunde 7a.weft“ mit einem Doppelklick – oder über „Datei“ → „Öffnen…“ in Weft.",
    "Weft legt eine Kopie auf ihrem Computer an und gleicht sie ab jetzt mit dem Ordner ab.",
], 7, 24, 50, 17, gap=2.0, size=1.9)
card(P, 62, 24, 31, 57, name="Frage-Karte", effect=fx("up", 400), as_="oc")
pic(P, "icon_folder.svg", 64, 25.5, 7, effect=fx("up", 400), name="Ordner", as_="oi")
text(P, "Weft fragt:", 72.5, 28, 19, size=1.9, font=BODY, bold=True, line=1.15, h=6, effect=fx("up", 400), name="Fragt", as_="ot")
text(P, "„Dieses Lernmodul wird in einem gemeinsamen Ordner zusammen bearbeitet … Wo soll die Kopie gespeichert werden?“", 64, 38, 27, size=1.8, color=CYAN, line=1.3, h=22, effect=fx("up", 400), name="Rückfrage", as_="oq")
text(P, "Danach sehen alle, wer gerade mitarbeitet: Wer in den letzten Minuten etwas geändert hat, leuchtet grün.", 64, 62.5, 27, size=1.7, color=MUTED, h=16, effect=fx("up", 400), name="Grün", as_="og")
chain(P, ["oc", "oi", "ot", "oq", "og"], 200)
ops.append({"op": "set_trigger", "page": P, "to": "entrance:$oc", "from": "entrance:$stt2", "delayMs": 500, "weiter": False})

# ---- 13: which way fits ----------------------------------------------------------------------------------------------------------------
P = new_page("p13")
kicker(P, "ZUSAMMENFASSUNG")
heading(P, "Welcher Weg passt zu euch?", size=3.6)
FITS = [
    ("link", "Der Freigabelink", "Ihr arbeitet gleichzeitig und wollt schnell loslegen."),
    ("file", "Die Datei mit Link", "Die Datei geht ohnehin per E-Mail oder Cloud herum."),
    ("cloud", "Der Cloud-Ordner", "Ihr arbeitet zu verschiedenen Zeiten, zum Beispiel über die Nextcloud."),
]
for i, (icon, title, desc) in enumerate(FITS):
    x = 7 + i * 29.7
    card(P, x, 24, 27.6, 40, name=f"Karte {i + 1}")
    pic(P, f"icon_{icon}.svg", x + 2.2, 25.5, 5.5, name=f"Symbol {i + 1}")
    text(P, title, x + 2.2, 36, 24, size=2.0, font=BODY, bold=True, line=1.15, h=9, name=f"Titel {i + 1}")
    text(P, desc, x + 2.2, 46, 23.5, size=1.9, color=MUTED, h=16, name=f"Text {i + 1}")
text(P, "", 7, 67.5, 86, size=1.9, line=1.3, h=17, name="Noch zwei Dinge", gap=1.0, paragraphs=[
    [{"text": "Ganz ohne Netz:  ", "color": CYAN, "bold": True, "font": BODY}, "„Datei“ → „Mit Datei zusammenführen…“ fügt die Änderungen einer anderen Kopie in dein Dokument ein."],
    [{"text": "Wenn die Direktverbindung nicht klappt:  ", "color": ORANGE, "bold": True, "font": BODY}, "ein TURN-Server in den Einstellungen von Weft."],
])

# ---- 14: the end ---------------------------------------------------------------------------------------------------------------------
P = new_page("p14", "Ende")
pic(P, "icon_check.svg", 8, 14, 9, name="Haken")
text(P, "Das war’s!", 8, 33, 50, size=5.0, font=HEAD, bold=True, name="Überschrift", h=14)
ops.append({"op": "add_shape", "page": P, "shape": "rectangle", "x": 8, "y": 49, "width": 14, "height": 0.3, "color": CYAN, "radius": 50, "shadow": glow(CYAN, 0.8, 0.9), "name": "Linie"})
ops.append({"op": "add_shape", "page": P, "shape": "rectangle", "x": 8, "y": 48.75, "width": 4.5, "height": 0.8, "color": ORANGE, "radius": 50, "shadow": glow(ORANGE, 0.8, 0.9), "name": "Kappe"})
text(P, "Ob allein oder gemeinsam: Weft funktioniert beides. Dieses Tutorial findest du jederzeit auf dem Startbildschirm wieder.", 8, 53, 44, size=2.4, color=MUTED, name="Schluss", h=16)
pic(P, "hero.svg", 55, 13, 40, h=round(40 * PX * 410 / 500 / PY, 2), name="Netzwerk")

ops.extend(late)

# ---- write -----------------------------------------------------------------------------------------------------------------------------
(HERE / "ops.json").write_text(json.dumps(ops, ensure_ascii=False, indent=1))
print(f"{len(ops)} operations, pictures of the editor: {'yes' if SHOTS else 'no'}")
