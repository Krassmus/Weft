# One copy of the tutorial for each language, with THAT language as the default one and the names of the blocks, branches and layouts in it - what
# the pictures of the editor (capture.mjs) show: the editor then shows the slides, the elements' list and the branches in that language too. (Weft does not
# translate names; the finished tutorial keeps the German ones.)
#
#   python3 -I variants.py <tutorial.weft> <folder>      -> <folder>/variant-<de|en|es|fr|pt|it|tr|pl>.weft
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEFT = ["node", str(HERE.parent.parent / "cli" / "dist" / "weft.mjs")]
LOCALES = {"de": "de_DE", "en": "en_US", "es": "es_ES", "fr": "fr_FR", "pt": "pt_BR", "it": "it_IT", "tr": "tr_TR", "pl": "pl_PL"}
# The names that are to be seen in the pictures of the editor (the question, the video: in the dialog of the time marks and in the event graph), by language.
NAMES = {
    "Welche Farben?": dict(en="Which colors?", es="¿Qué colores?", fr="Quelles couleurs ?", pt="Quais cores?", it="Quali colori?", tr="Hangi renkler?", pl="Które kolory?"),
    "Video (mit Zeitmarke)": dict(en="Video (with time mark)", es="Vídeo (con marca de tiempo)", fr="Vidéo (avec repère temporel)", pt="Vídeo (com marca de tempo)", it="Video (con marcatore temporale)", tr="Video (zaman işaretli)", pl="Wideo (ze znacznikiem czasu)"),
}


def rename(value, lang):
    return NAMES[value][lang] if value in NAMES else value


def walk(node, lang):
    if isinstance(node, dict):
        return {k: (rename(v, lang) if k in ("name", "label") and isinstance(v, str) else walk(v, lang)) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(x, lang) for x in node]
    return node


def main(source, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for ui, locale in LOCALES.items():
        order = [locale] + [x for x in LOCALES.values() if x != locale]
        ops = folder / f"ops-{ui}.json"
        ops.write_text(json.dumps([{"op": "set_languages", "languages": order}]))
        turned = folder / f"turned-{ui}.weft"
        subprocess.run(WEFT + ["edit", source, str(ops), "-o", str(turned)], check=True, capture_output=True)
        target = folder / f"variant-{ui}.weft"
        with zipfile.ZipFile(turned) as zin, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "weft.json" and ui != "de":
                    data = json.dumps(walk(json.loads(data), ui), ensure_ascii=False).encode()
                zout.writestr(item, data)
        ops.unlink()
        turned.unlink()
        print(target)


if __name__ == "__main__":
    main(*sys.argv[1:3])
