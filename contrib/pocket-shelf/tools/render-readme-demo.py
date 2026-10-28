#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Export README media from the actual native renderer, without loading a ROM."""
import argparse
from pathlib import Path
import platform
import shlex
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work-dir', type=Path, default=ROOT / 'build-readme-media')
args = parser.parse_args()
work = args.work_dir.resolve()
frames = work / 'frames'
frames.mkdir(parents=True, exist_ok=True)
docs = ROOT / 'contrib/pocket-shelf/docs'
for tool in ['cc', 'pkg-config', 'ffmpeg']:
    if not shutil.which(tool):
        raise SystemExit(f'Missing dependency: {tool}')
flags = shlex.split(subprocess.check_output(
    ['pkg-config', '--cflags', '--libs', 'sdl2', 'freetype2', 'libpng'], text=True))
graphics = ['-framework', 'OpenGL', '-mmacosx-version-min=15.0'] if platform.system() == 'Darwin' else ['-lGL', '-lm']
binary = work / 'render-demo'
subprocess.run([
    'cc', '-std=c11', '-O2', '-Isrc/platform/pocket-shelf',
    'contrib/pocket-shelf/tools/render-readme-demo.c',
    'src/platform/pocket-shelf/pocket-shelf.c',
    'src/platform/pocket-shelf/renderer.c', *flags, *graphics,
    '-o', str(binary),
], cwd=ROOT, check=True)
subprocess.run([str(binary), str(ROOT), str(frames)], check=True)
for name in ['native-shelf.png', 'native-boot.png', 'native-insertion.png']:
    shutil.copy2(frames / name, docs / name)
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y',
    '-framerate', '15', '-i', str(frames / 'frame-%04d.png'),
    '-filter_complex',
    '[0:v]scale=960:-1:flags=lanczos,split[a][b];'
    '[a]palettegen=stats_mode=diff[p];'
    '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop', '0', str(docs / 'pocket-shelf-demo.gif'),
], check=True)
print(f'README media updated in {docs.relative_to(ROOT)}')
