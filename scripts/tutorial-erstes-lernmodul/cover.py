"""Gives the tutorial its cover picture (the file logo.png in the archive): what a tile on the start screen shows instead of the first slide.

    python3 -I cover.py lernpyramide.i18n.weft

The picture is the slide with the learning pyramid, cut down to the paper, the pyramid and the percentages - without the heading, the words
beside the percentages and the buttons: a picture does not change its language, so no text is left on it. Made from a copy of the module (the
module itself is not touched) with `weft edit` and `weft render`; the archive then gets the picture as logo.png (Weft's own files have it
there, see core/io/coverImage.ts).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WEFT = ["node", str(ROOT / "cli" / "dist" / "weft.mjs")]
SHIFT = 14  # the pyramid and the percentages together are a little left of the middle: moved by this many percent of the width
LABEL_WIDTH = 22


def weft(*args):
    return subprocess.run(WEFT + [str(a) for a in args], check=True, capture_output=True, text=True).stdout


def blocks_of(box):
    return list(box.values()) if isinstance(box, dict) else list(box)


def main(path):
    path = Path(path)
    with zipfile.ZipFile(path) as z:
        data = json.loads(z.read("weft.json"))
    content = data.get("content", data)
    page_id = next(pid for pid, p in content["pages"].items() if any(b.get("name") == "Stufe 1" for b in blocks_of(p["blocks"])))
    page = content["pages"][page_id]
    blocks = {b["name"]: b for b in blocks_of(page["blocks"]) if b.get("name")}

    ops = []
    for name in ("Überschrift", "Unterstreichung"):
        ops.append({"op": "remove_block", "block": blocks[name]["id"]})
    for i in range(1, 8):
        tier, label = blocks[f"Stufe {i}"], blocks[f"Beschriftung {i}"]
        ops.append({"op": "update_block", "block": tier["id"], "set": {"position": {"x": round(tier["position"]["x"] + SHIFT, 3)}}})
        # the percentage is the first run of the text, the word beside it the second
        html = label["html"].split("</font></span></font>")[0] + "</font></span></font></p>"
        ops.append({"op": "update_block", "block": label["id"], "set": {"html": html, "position": {"x": round(label["position"]["x"] + SHIFT, 3), "width": LABEL_WIDTH}}})
    for b in blocks_of(content["layouts"][page["layoutId"]]["blocks"]):
        if b["kind"] in ("progress", "button", "language"):
            ops.append({"op": "remove_block", "block": b["id"]})

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "ops.json").write_text(json.dumps(ops), encoding="utf-8")
        weft("edit", path, tmp / "ops.json", "-o", tmp / "cover.weft")
        # the number of the slide as `weft` counts it (a slide of a branch is "4.a.1"): read from its overview
        number = re.search(r"#### Folie (\S+) \[" + re.escape(page_id) + r"\]", weft("inspect", path)).group(1)
        weft("render", tmp / "cover.weft", "--page", number, "-o", tmp / "logo.png", "--width", "1280")
        logo = (tmp / "logo.png").read_bytes()

        # the archive again, with logo.png in it (a picture is already compressed: stored as it is, like Weft does)
        out = tmp / "out.weft"
        with zipfile.ZipFile(path) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for item in src.infolist():
                if item.filename != "logo.png":
                    dst.writestr(item, src.read(item.filename))
            dst.writestr(zipfile.ZipInfo("logo.png", date_time=(2026, 1, 1, 0, 0, 0)), logo, zipfile.ZIP_STORED)
        shutil.move(str(out), str(path))
    print(f"{path.name}: logo.png ({len(logo) // 1024} KB) from slide {number}")


if __name__ == "__main__":
    main(sys.argv[1])
