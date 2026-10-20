#!/usr/bin/env python3
"""
Makes the background picture of the window that opens when the .dmg is opened (src-tauri/dmg/background.png, see
bundle.macOS.dmg in src-tauri/tauri.conf.json): dark like Weft's own work area - the quiet blue glow in the middle and the faint dot
grid - with a blue dashed line from the place of the Weft icon to the place of the Applications folder.

The positions below must be the ones of tauri.conf.json (windowSize, appPosition, applicationFolderPosition). The picture is made twice
as large and carries 144 dpi, which is what makes Finder show it sharp on a Retina screen at the size of the window.

    python3 scripts/make-dmg-background.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw

WINDOW = (660, 400)  # points
APP = (180, 190)
APPLICATIONS = (480, 190)
SCALE = 2
ICON_RADIUS = 78  # how far from an icon's centre the line stops (the icon is 128 wide, plus a little air)

BG = np.array([10, 13, 22], dtype=np.float32)  # --weft-bg
DOT = np.array([160, 180, 230], dtype=np.float32)
LINE = (77, 141, 255)  # --weft-eg-blue

width, height = WINDOW[0] * SCALE, WINDOW[1] * SCALE
ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
# The glow: the ellipse of the work area (App.css has 75% x 70%; a little smaller and softer here, the window is small), strongest in
# the middle, gone towards its rim. d is 0 in the centre and 1 at the rim.
d = np.sqrt(((xs - width / 2) / (width * 0.55)) ** 2 + ((ys - height / 2) / (height * 0.65)) ** 2)
alpha = np.interp(d, [0.0, 0.40, 0.60, 0.90], [0.30, 0.30, 0.15, 0.0])
alpha = np.clip(alpha, 0, 1)[..., None]
pixels = BG * (1 - alpha) + np.array([112, 150, 212], dtype=np.float32) * alpha
# The dot grid: a faint dot every 22 points.
grid = 22 * SCALE
dot = (np.abs(((xs + grid / 2) % grid) - grid / 2) < 1.0 * SCALE) & (np.abs(((ys + grid / 2) % grid) - grid / 2) < 1.0 * SCALE)
pixels = np.where(dot[..., None], pixels * 0.84 + DOT * 0.16, pixels)
image = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8)).convert("RGBA")

# The dashed line, drawn on a layer of its own at four times the size and brought down: smooth ends and edges.
SS = 4
layer = Image.new("RGBA", (width * SS, height * SS), (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)
x0 = (APP[0] + ICON_RADIUS) * SCALE * SS
x1 = (APPLICATIONS[0] - ICON_RADIUS) * SCALE * SS
y = APP[1] * SCALE * SS
thickness = 3 * SCALE * SS
dash, gap = 9 * SCALE * SS, 7 * SCALE * SS
x = x0
while x < x1:
    end = min(x + dash, x1)
    draw.rounded_rectangle([x, y - thickness / 2, end, y + thickness / 2], radius=thickness / 2, fill=LINE + (255,))
    x += dash + gap
layer = layer.resize((width, height), Image.LANCZOS)
image = Image.alpha_composite(image, layer).convert("RGB")

out = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "dmg", "background.png")
image.save(out, dpi=(72 * SCALE, 72 * SCALE), optimize=True)
print("wrote", os.path.normpath(out), image.size)
