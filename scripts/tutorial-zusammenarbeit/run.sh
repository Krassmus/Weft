#!/bin/sh
# (a quick build of the German draft: ./run.sh -> zu.weft, then e.g. `node ../../cli/dist/weft.mjs render zu.weft --page 4 -o folie.png`)
cd "$(dirname "$0")" || exit 1
WEFT="node ../../cli/dist/weft.mjs"
python3 -I build.py || exit 1
rm -f zu.weft && $WEFT new zu.weft --empty >/dev/null && $WEFT edit zu.weft ops.json -o zu.weft --force > edit.log 2>&1 || { grep -v image-no-alt edit.log | tail -8; exit 1; }
ls -l zu.weft | awk '{print $5, "bytes"}'
