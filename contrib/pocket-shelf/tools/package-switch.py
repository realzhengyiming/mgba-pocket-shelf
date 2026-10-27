#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Validate the actual NRO and assemble a separate, non-overwriting SD package."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
SHELF = ROOT / 'contrib/pocket-shelf'


def validate(data):
    if len(data) < 0x80 or data[0x10:0x14] != b'NRO0':
        raise ValueError('Not a Switch NRO')
    nro_size = struct.unpack_from('<I', data, 0x18)[0]
    if data[nro_size:nro_size + 4] != b'ASET':
        raise ValueError('NRO has no embedded assets')
    header = struct.unpack_from('<4sI6Q', data, nro_size)
    ranges = []
    for offset, size in zip(header[2::2], header[3::2]):
        start = nro_size + offset
        if offset < 56 or not size or start + size > len(data):
            raise ValueError('Invalid embedded asset range')
        ranges.append(data[start:start + size])
    icon, nacp, romfs = ranges
    if not icon.startswith(b'\xff\xd8') or b'mGBA Pocket Shelf' not in nacp[:512]:
        raise ValueError('Unexpected app identity or icon')
    h = struct.unpack_from('<10Q', romfs)
    if h[0] != 0x50:
        raise ValueError('Invalid RomFS')
    dir_base, file_base, data_base = h[3], h[7], h[9]
    files = {}
    visited = set()

    def walk(offset, parent=''):
        if offset in visited:
            raise ValueError('RomFS directory cycle')
        visited.add(offset)
        meta = struct.unpack_from('<6I', romfs, dir_base + offset)
        name = romfs[dir_base + offset + 24:dir_base + offset + 24 + meta[5]].decode('utf-8')
        current = '/'.join(x for x in [parent, name] if x)
        child_file = meta[3]
        file_seen = set()
        while child_file != 0xffffffff:
            if child_file in file_seen:
                raise ValueError('RomFS file cycle')
            file_seen.add(child_file)
            f = struct.unpack_from('<IIQQII', romfs, file_base + child_file)
            fname = romfs[file_base + child_file + 32:file_base + child_file + 32 + f[5]].decode('utf-8')
            start = data_base + f[2]
            if start + f[3] > len(romfs):
                raise ValueError('Truncated RomFS file')
            files['/'.join(x for x in [current, fname] if x)] = romfs[start:start + f[3]]
            child_file = f[1]
        child_dir = meta[2]
        dir_seen = set()
        while child_dir != 0xffffffff:
            if child_dir in dir_seen:
                raise ValueError('RomFS sibling cycle')
            dir_seen.add(child_dir)
            sibling = struct.unpack_from('<I', romfs, dir_base + child_dir + 4)[0]
            walk(child_dir, current)
            child_dir = sibling

    walk(0)
    required = ['font-new.png', 'fileassoc.cfg.in', 'pocket-shelf/scene.psm', 'pocket-shelf/boot-logo.png', 'pocket-shelf/boot-chime.wav',
                'pocket-shelf/NotoSansSC-Regular.otf', 'pocket-shelf/FONT-LICENSE.txt']
    if not all(name in files for name in required) or not files['pocket-shelf/scene.psm'].startswith(b'PSM1'):
        raise ValueError('The NRO is missing native shelf assets')
    expected = (SHELF / 'assets/native/scene.psm').read_bytes()
    if files['pocket-shelf/scene.psm'] != expected:
        raise ValueError('The NRO does not contain the current model')
    if files['pocket-shelf/boot-logo.png'] != (SHELF / 'assets/native/boot-logo.png').read_bytes():
        raise ValueError('The NRO does not contain the current boot logo')
    if files['pocket-shelf/boot-chime.wav'] != (SHELF / 'assets/native/boot-chime.wav').read_bytes():
        raise ValueError('The NRO does not contain the current boot chime')
    return {name: len(blob) for name, blob in files.items()}


def package(source, target):
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=ROOT, text=True).strip())
    data = source.read_bytes()
    assets = validate(data)
    dest = target / 'SD卡文件/switch/mgba-pocket-shelf/mgba-pocket-shelf.nro'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    sha = hashlib.sha256(data).hexdigest()
    (target / 'SHA256SUMS.txt').write_text(f'{sha}  SD卡文件/switch/mgba-pocket-shelf/mgba-pocket-shelf.nro\n')
    (target / 'BUILD-INFO.json').write_text(json.dumps({
        'app': 'mGBA Pocket Shelf', 'source': 'https://github.com/realzhengyiming/mgba-pocket-shelf',
        'commit': revision, 'dirty': dirty, 'toolchainImage': 'devkitpro/devkita64:20260219@sha256:1fc388c3a0d34bd2045a6dadcb1020e069d5f876a187fd705de14b4440c00282',
        'sha256': sha, 'bytes': len(data), 'embeddedAssets': assets,
        'verification': 'Native Mac rendering and ROM smoke-tested; Switch cross-built; hardware validation pending.',
    }, indent=2) + '\n')
    license_dir = target / 'licenses'
    license_dir.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'LICENSE', license_dir / 'mGBA-MPL-2.0.txt')
    shutil.copy2(SHELF / 'assets/fonts/LICENSE.txt', license_dir / 'NotoSansSC-OFL.txt')
    shutil.copy2(ROOT / 'src/third-party/inih/LICENSE.txt', license_dir / 'inih-BSD.txt')
    if (SHELF / 'licenses').is_dir():
        shutil.copytree(SHELF / 'licenses', license_dir, dirs_exist_ok=True)
    ports = Path(os.environ.get('DEVKITPRO', '/opt/devkitpro')) / 'portlibs/switch/licenses'
    for name in ['switch-freetype', 'switch-bzip2', 'switch-libpng', 'switch-zlib']:
        if (ports / name).is_dir():
            shutil.copytree(ports / name, license_dir / name, dirs_exist_ok=True)
    shutil.copy2(SHELF / 'SWITCH_TEST.md', target / '安装与测试说明.md')
    shutil.copy2(SHELF / 'NOTICE.md', target / 'NOTICE.md')
    print(f'Validated {len(assets)} embedded assets; NRO {len(data):,} bytes; SHA256 {sha}')
    print(dest)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Usage: package-switch.py source.nro output-directory')
    package(Path(sys.argv[1]), Path(sys.argv[2]))
