#!/bin/sh
# (a quick build of the German draft: SHOTS=0 ./run.sh  - without the pictures of the editor)
cd "$(dirname "$0")" || exit 1
WEFT="node ../../cli/dist/weft.mjs"
python3 -I build.py || exit 1
rm -f iv.weft && $WEFT new iv.weft --empty >/dev/null && $WEFT edit iv.weft ops.json -o iv.weft --force > edit.log 2>&1 || { grep -v image-no-alt edit.log | tail -5; exit 1; }
ls -l iv.weft | awk '{print $5, "bytes"}'
