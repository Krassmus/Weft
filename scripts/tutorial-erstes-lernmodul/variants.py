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
# The names that are to be seen in the pictures of the editor (slides 3 and 5, the fork), by language: de -> the others.
NAMES = {
    "Überschrift": dict(en="Heading", es="Título", fr="Titre", pt="Título", it="Titolo", tr="Başlık", pl="Nagłówek"),
    "Unterstreichung": dict(en="Underline", es="Subrayado", fr="Soulignement", pt="Sublinhado", it="Sottolineatura", tr="Altçizgi", pl="Podkreślenie"),
    "Aufgabe": dict(en="Task", es="Tarea", fr="Tâche", pt="Tarefa", it="Compito", tr="Görev", pl="Zadanie"),
    "Hinweis": dict(en="Hint", es="Pista", fr="Indice", pt="Dica", it="Suggerimento", tr="İpucu", pl="Podpowiedź"),
    "Pfeil": dict(en="Arrow", es="Flecha", fr="Flèche", pt="Seta", it="Freccia", tr="Ok", pl="Strzałka"),
    "Reihenfolge": dict(en="Order", es="Orden", fr="Ordre", pt="Ordem", it="Ordine", tr="Sıra", pl="Kolejność"),
    "Reihenfolge richtig?": dict(en="Order correct?", es="¿Orden correcto?", fr="Ordre correct ?", pt="Ordem correta?", it="Ordine corretto?", tr="Sıra doğru mu?", pl="Kolejność poprawna?"),
    "Richtig": dict(en="Correct", es="Correcto", fr="Correct", pt="Correto", it="Corretto", tr="Doğru", pl="Poprawnie"),
    "Fast": dict(en="Almost", es="Casi", fr="Presque", pt="Quase", it="Quasi", tr="Neredeyse", pl="Prawie"),
    "Stufe": dict(en="Level", es="Nivel", fr="Niveau", pt="Nível", it="Livello", tr="Seviye", pl="Poziom"),
    "Beschriftung": dict(en="Label", es="Etiqueta", fr="Étiquette", pt="Rótulo", it="Etichetta", tr="Etiket", pl="Etykieta"),
}


def rename(value, lang):
    m = re.fullmatch(r"(Stufe|Beschriftung) (\d)", value)
    if m:
        return f"{NAMES[m.group(1)][lang]} {m.group(2)}"
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
