#!/bin/sh
# Builds "Mit Lernmodulen arbeiten" (the tutorial) or its template "Lernpyramide" with the `weft` command line tool, in all eight languages:
#
#   sh build.sh            -> lernpyramide.i18n.weft   (the tutorial: part A, the learning pyramide, and part B, how it is built)
#   sh build.sh template   -> vorlage.i18n.weft        (the template: part A only, marked as a template)
#
#   sh build.sh shots      -> crops/<de|en|...>/*.jpg  (new pictures of the editor, in every interface language; needs `npm run dev` on port 1420)
#
# Needs `npm run build:cli` first, Node 22 and the pictures of the editor in crops/ (see README.md).
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WEFT="node $ROOT/cli/dist/weft.mjs"
LANGS=en_US,es_ES,fr_FR,pt_BR,it_IT,tr_TR,pl_PL
cd "$HERE" || exit 1
if [ "$1" = "shots" ]; then
  # The pictures of the editor in each interface language: from a copy of the tutorial that has that language as its default one (see variants.py).
  SRC=${2:-$ROOT/src/start-content/tutorials/erstes-lernmodul.weft}
  rm -rf variants && python3 -I variants.py "$SRC" variants >/dev/null || exit 1
  for UI in de en es fr pt it tr pl; do
    mkdir -p crops/$UI && node capture.mjs "$HERE/variants/variant-$UI.weft" crops/$UI $UI || exit 1
  done
  rm -rf variants
  exit 0
fi
if [ "$1" = "template" ]; then NAME=vorlage; export TEMPLATE=1; else NAME=lernpyramide; fi
python3 -I doodles.py && python3 -I build.py || exit 1
rm -f $NAME.weft
$WEFT new $NAME.weft --empty >/dev/null || exit 1
if [ "$NAME" = vorlage ]; then OPS=ops-vorlage.json; else OPS=ops.json; fi
$WEFT edit $NAME.weft $OPS -o $NAME.weft > edit-$NAME.log 2>&1 || { tail -5 edit-$NAME.log; exit 1; }
$WEFT text export $NAME.weft --from de_DE --to $LANGS -o texts-$NAME.json >/dev/null || exit 1
TEXTS=texts-$NAME.json FILLED=texts-$NAME-filled.json python3 -I assemble.py || exit 1
$WEFT text import $NAME.weft texts-$NAME-filled.json -o $NAME.i18n.weft --force | tail -1
# The tutorial gets a cover picture (logo.png): the pyramid and its percentages, without text - what its tile on the start screen shows.
if [ "$NAME" = lernpyramide ]; then python3 -I cover.py $NAME.i18n.weft || exit 1; fi
