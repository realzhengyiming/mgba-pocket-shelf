#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Bake PD-textlogo wordmarks into the shared LCD mask. Requires Pillow + CairoSVG.
Source and trademark attribution: ../NOTICE.md. This contains no BIOS code/data.
"""
import io
from pathlib import Path
import cairosvg
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
image = Image.open(io.BytesIO(cairosvg.svg2png(url=str(ROOT / 'assets/reference/gameboy-wordmark.svg'), output_width=1186, output_height=199))).convert('RGBA')
canvas = Image.new('RGBA',(480,320))
def add(mask, size, at):
    alpha=mask.getchannel('A').resize(size,Image.Resampling.LANCZOS)
    ink=Image.new('RGBA',size,'white');ink.putalpha(alpha);canvas.alpha_composite(ink,at)
add(image.crop((0,0,1128,199)),(344,60),(68,122))
add(image.crop((1150,19,1176,186)).transpose(Image.Transpose.ROTATE_90),(170,26),(155,236))
canvas.save(ROOT / 'assets/native/boot-logo.png')
