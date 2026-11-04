"""Fills the exported texts (TEXTS) with the translations of tr/<lang>.txt (one line per unique German segment, the number is the line in tr/segments.json) -> FILLED"""
import json, re, html, sys, pathlib
HERE = pathlib.Path(__file__).parent
segments = json.load(open(HERE / "tr/segments.json"))
index = {c: i for i, c in enumerate(segments)}
CODES = {"en": "en_US", "es": "es_ES", "fr": "fr_FR", "pt": "pt_BR", "it": "it_IT", "tr": "tr_TR", "pl": "pl_PL"}
import os
IN = os.environ.get("TEXTS", "texts-all.json")
OUTFILE = os.environ.get("FILLED", "texts-filled.json")
src = json.load(open(HERE / IN))
errors = 0
tr = {}
for lang in CODES:
    d = {}
    for line in (HERE / f"tr/{lang}.txt").read_text().split("\n"):
        if not line.strip():
            continue
        k, _, text = line.partition("|")
        d[int(k)] = text
    missing = [i for i in range(len(segments)) if i not in d or not d[i].strip()]
    extra = [i for i in d if i >= len(segments)]
    if missing or extra:
        print(lang, "missing", missing[:10], "extra", extra[:10]); errors += 1
    for i, c in enumerate(segments):
        t = d.get(i, "")
        if c.count("[[") != t.count("[[") or c.count("]]") != t.count("]]"):
            print(lang, i, "bracket mismatch:", t); errors += 1
    tr[lang] = d

def fill(source, lang):
    out = []
    for p in re.split(r"(<[^>]+>)", source):
        if not p or p.startswith("<"):
            out.append(p); continue
        raw = html.unescape(p); core = raw.strip()
        if core in index:
            lead = raw[: len(raw) - len(raw.lstrip())]; trail = raw[len(raw.rstrip()):]
            t = tr[lang][index[core]]
            t = re.sub(r"(\d) %", "\\1\u00a0%", t)
            out.append(html.escape(lead + t + trail, quote=False))
        else:
            out.append(p)
    return "".join(out)

for it in src["items"]:
    for part in re.split(r"(<[^>]+>)", it["source"]):
        if part and not part.startswith("<"):
            core = html.unescape(part).strip()
            if re.search(r"[A-Za-zÄÖÜäöüß]", core) and core not in index:
                print("not in the segment list:", core[:80]); errors += 1
    for lang, code in CODES.items():
        it["translations"][code] = fill(it["source"], lang)
if errors:
    print(errors, "errors"); sys.exit(1)
json.dump(src, open(HERE / OUTFILE, "w"), ensure_ascii=False, indent=1)
print("ok:", len(src["items"]), "texts x", len(CODES), "languages")
