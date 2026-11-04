#!/bin/sh
# Builds the tutorial "Gemeinsam an einem Weft-Dokument arbeiten" with the `weft` command line tool, in all eight languages:
#
#   sh build.sh shots   -> crops/<de|en|...>/*.jpg   (the pictures of the editor in every interface language; needs `npm run dev` on port 1420)
#   sh build.sh         -> tutorial.i18n.weft        (the tutorial itself, with those pictures)
#
# Needs `npm run build:cli` first, Node 22 and Chrome (see README.md). Order: `sh build.sh shots`, then `sh build.sh`.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WEFT="node $ROOT/cli/dist/weft.mjs"
LANGS=en_US,es_ES,fr_FR,pt_BR,it_IT,tr_TR,pl_PL
cd "$HERE" || exit 1

if [ "$1" = "shots" ]; then
  # a module to open in the editor (its title is the name of the folder in the pictures of the folder sync)
  rm -f capture.weft && $WEFT new capture.weft --empty >/dev/null || exit 1
  echo '[{"op":"set_title","title":"Erdkunde 7a"}]' > capture-ops.json && $WEFT edit capture.weft capture-ops.json -o capture.weft --force >/dev/null || exit 1
  rm -f capture-ops.json
  for UI in de en es fr pt it tr pl; do
    mkdir -p crops/$UI && node capture.mjs "$HERE/capture.weft" crops/$UI $UI || exit 1
  done
  exit 0
fi

# build.py -> operations -> the module (German) -> the texts exported, the translations of tr/ put in, imported: tutorial.i18n.weft
python3 -I build.py || exit 1
rm -f tutorial.weft
$WEFT new tutorial.weft --empty >/dev/null || exit 1
$WEFT edit tutorial.weft ops.json -o tutorial.weft --force > edit-tutorial.log 2>&1 || { grep -v image-no-alt edit-tutorial.log | tail -5; exit 1; }
$WEFT text export tutorial.weft --from de_DE --to $LANGS -o texts-tutorial.json >/dev/null || exit 1
TEXTS="texts-tutorial.json" FILLED="texts-tutorial-filled.json" python3 -I assemble.py || exit 1
$WEFT text import tutorial.weft texts-tutorial-filled.json -o tutorial.i18n.weft --force | tail -1
python3 -I cover.py tutorial.i18n.weft || exit 1
ls -l tutorial.i18n.weft | awk '{print $5, "bytes: tutorial.i18n.weft"}'
