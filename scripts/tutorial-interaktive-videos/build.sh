#!/bin/sh
# Builds the tutorial "Ein interaktives Video erstellen" with the `weft` command line tool, in all eight languages:
#
#   sh build.sh shots   -> crops/<de|en|...>/*.jpg   (the pictures of the editor in every interface language; needs `npm run dev` on port 1420)
#   sh build.sh         -> tutorial.i18n.weft        (the tutorial itself, with those pictures)
#
# Needs `npm run build:cli` first, Node 22, ffmpeg (for the video) and Chrome (see README.md). Order: `sh build.sh shots`, then `sh build.sh`.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WEFT="node $ROOT/cli/dist/weft.mjs"
LANGS=en_US,es_ES,fr_FR,pt_BR,it_IT,tr_TR,pl_PL
cd "$HERE" || exit 1
[ -f assets/farben.mp4 ] || { mkdir -p assets && node video/render.mjs assets/farben.mp4 || exit 1; }

# build.py -> operations -> the module (German) -> the texts exported, the translations of tr/ put in, imported: $1.i18n.weft
make_module() {
  python3 -I build.py || exit 1
  rm -f "$1.weft"
  $WEFT new "$1.weft" --empty >/dev/null || exit 1
  $WEFT edit "$1.weft" ops.json -o "$1.weft" --force > "edit-$1.log" 2>&1 || { grep -v image-no-alt "edit-$1.log" | tail -5; exit 1; }
  $WEFT text export "$1.weft" --from de_DE --to $LANGS -o "texts-$1.json" >/dev/null || exit 1
  TEXTS="texts-$1.json" FILLED="texts-$1-filled.json" python3 -I assemble.py || exit 1
  $WEFT text import "$1.weft" "texts-$1-filled.json" -o "$1.i18n.weft" --force | tail -1
}

if [ "$1" = "shots" ]; then
  # the module without pictures of the editor first; then a copy of it for each language, that language as the default one (see variants.py)
  SHOTS=0 make_module stage || exit 1
  rm -rf variants && python3 -I variants.py stage.i18n.weft variants >/dev/null || exit 1
  for UI in de en es fr pt it tr pl; do
    mkdir -p crops/$UI && node capture.mjs "$HERE/variants/variant-$UI.weft" crops/$UI $UI || exit 1
  done
  rm -rf variants
  exit 0
fi
SHOTS=1 make_module tutorial || exit 1
python3 -I cover.py tutorial.i18n.weft || exit 1
ls -l tutorial.i18n.weft | awk '{print $5, "bytes: tutorial.i18n.weft"}'
