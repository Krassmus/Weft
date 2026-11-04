"""Puts the cover picture (logo.png: what the tile of the tutorial on the start screen shows) into the archive: python3 -I cover.py <tutorial.weft> - the picture comes from
video/cover.mjs (the video's picture with a time mark on its bar - nothing written on it, so it needs no translation)."""
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main(path):
    path = Path(path)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(["node", str(HERE / "video" / "cover.mjs"), str(tmp / "logo.png")], check=True)
        logo = (tmp / "logo.png").read_bytes()
        out = tmp / "out.weft"
        with zipfile.ZipFile(path) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for item in src.infolist():
                if item.filename != "logo.png":
                    dst.writestr(item, src.read(item.filename))
            dst.writestr(zipfile.ZipInfo("logo.png", date_time=(2026, 1, 1, 0, 0, 0)), logo, zipfile.ZIP_STORED)
        shutil.move(str(out), str(path))
    print(f"{path.name}: logo.png ({len(logo) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
