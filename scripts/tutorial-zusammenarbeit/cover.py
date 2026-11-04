"""Puts the cover picture (logo.png: what the tile of the tutorial on the start screen shows) into the archive: python3 -I cover.py <tutorial.weft> - the picture comes from
cover.mjs (the floor of lines and the network - nothing written on it, so it needs no translation)."""
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
        subprocess.run(["node", str(HERE / "cover.mjs"), str(tmp / "raw.png")], check=True)
        # (a palette of 96 colours makes the picture a third of its size - the installation is not to grow; without ffmpeg the full picture is kept)
        logo = (tmp / "raw.png").read_bytes()
        try:
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp / "raw.png"), "-vf", "split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3", str(tmp / "logo.png")], check=True)
            logo = (tmp / "logo.png").read_bytes()
        except (OSError, subprocess.CalledProcessError):
            pass
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
