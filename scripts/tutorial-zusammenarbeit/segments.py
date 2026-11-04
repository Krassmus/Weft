"""Keeps tr/segments.json up to date: every distinct German text of the module (what `weft text export` found: texts of blocks, labels, names of nothing - only what a
learner sees) is a segment, and its number is its line in tr/<language>.txt. New German texts are put at the END (so the translations that are there keep their lines);
texts that are no longer used are reported (and kept: the numbers must not move). `python3 -I segments.py texts-tutorial.json` -> tr/segments.json and what is missing."""
import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
TR = HERE / "tr"
TR.mkdir(exist_ok=True)
CODES = ["en", "es", "fr", "pt", "it", "tr", "pl"]


def segments_of(source):
    for part in re.split(r"(<[^>]+>)", source):
        if part and not part.startswith("<"):
            core = html.unescape(part).strip()
            if re.search(r"[A-Za-zÄÖÜäöüß]", core):
                yield core


def main(path):
    export = json.load(open(HERE / path))
    found = []
    for item in export["items"]:
        for seg in segments_of(item["source"]):
            if seg not in found:
                found.append(seg)
    known = json.load(open(TR / "segments.json")) if (TR / "segments.json").exists() else []
    new = [s for s in found if s not in known]
    unused = [s for s in known if s not in found]
    known += new
    json.dump(known, open(TR / "segments.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(known)} segments ({len(new)} new, {len(unused)} no longer used)")
    for lang in CODES:
        f = TR / f"{lang}.txt"
        have = {int(line.split("|", 1)[0]) for line in f.read_text().split("\n") if line.strip()} if f.exists() else set()
        todo = [i for i in range(len(known)) if i not in have and known[i] in found]
        if todo:
            print(f"  {lang}: {len(todo)} lines to write: {todo[:12]}{' …' if len(todo) > 12 else ''}")
    # the German texts of the segments that still need a translation, as a list to translate from (tr/todo.txt: number|German)
    (TR / "todo.txt").write_text("\n".join(f"{i}|{s}" for i, s in enumerate(known) if s in found and not all((TR / f"{lang}.txt").exists() and f"\n{i}|" in "\n" + (TR / f"{lang}.txt").read_text() for lang in CODES)))


if __name__ == "__main__":
    main(sys.argv[1])
