#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Bake Pocket Shelf's own GLB export into a tiny native draw-stream.
No glTF parser, JavaScript runtime or game artwork is needed on the Switch.
Usage: python3 bake-model.py path/to/pocket-shelf.glb [output-directory]
"""
import json
import math
from pathlib import Path
import struct
import sys


def identity():
    return [float(i % 5 == 0) for i in range(16)]


def mul(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def accessor(g, data, index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    code, size = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}[a['componentType']]
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', size * count)
    return [struct.unpack_from('<' + code * count, data, start + i * stride) for i in range(a['count'])]


def bake(source, dest):
    raw = source.read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2
    length = struct.unpack_from('<I', raw, 12)[0]
    g = json.loads(raw[20:20 + length])
    data = raw[28 + length:]
    dest.mkdir(parents=True, exist_ok=True)
    textures = {}
    groups = []
    roots = ['CartridgeRack', 'GameBoyAdvance_AGB001', 'Cartridge_0']
    for group, root_name in enumerate(roots):
        root = next(i for i, n in enumerate(g['nodes']) if n.get('name') == root_name)
        # Keep positions relative to each model's origin, not the exported scene.
        batches = {}

        def visit(index, parent):
            node = g['nodes'][index]
            matrix = mul(parent, node.get('matrix', identity()))
            if 'mesh' in node:
                for p in g['meshes'][node['mesh']]['primitives']:
                    assert p.get('mode', 4) == 4
                    m = g['materials'][p['material']]
                    pbr = m['pbrMetallicRoughness']
                    tex = pbr.get('baseColorTexture', {}).get('index', -1)
                    role = 0  # ordinary material; 1 = replaceable cover; 2 = LCD
                    if group == 2 and tex == 10:
                        role = 1
                    if node.get('name') == 'Display':
                        role = 2
                    if tex >= 0 and tex not in textures:
                        image = g['images'][g['textures'][tex]['source']]
                        v = g['bufferViews'][image['bufferView']]
                        pixels = data[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
                        name = f'texture-{tex:02}.png'
                        (dest / name).write_bytes(pixels)
                        textures[tex] = name
                    color = pbr.get('baseColorFactor', [1, 1, 1, 1])
                    unlit = int('KHR_materials_unlit' in m.get('extensions', {}))
                    key = (tex, role, unlit)
                    batch = batches.setdefault(key, bytearray())
                    a = p['attributes']
                    pos = accessor(g, data, a['POSITION'])
                    normal = accessor(g, data, a['NORMAL'])
                    uv = accessor(g, data, a['TEXCOORD_0']) if 'TEXCOORD_0' in a else [(0, 0)] * len(pos)
                    indices = accessor(g, data, p['indices']) if 'indices' in p else [(i,) for i in range(len(pos))]
                    for (i,) in indices:
                        xyz = [sum(matrix[k * 4 + r] * (*pos[i], 1)[k] for k in range(4)) for r in range(3)]
                        n = [sum(matrix[k * 4 + r] * normal[i][k] for k in range(3)) for r in range(3)]
                        scale = math.sqrt(sum(x * x for x in n)) or 1
                        batch.extend(struct.pack('<12f', *xyz, *(x / scale for x in n), *uv[i], *color))
            for child in node.get('children', []):
                visit(child, matrix)

        for child in g['nodes'][root]['children']:
            visit(child, identity())
        for (tex, role, unlit), vertices in batches.items():
            groups.append((group, tex, role, unlit, vertices))
    with (dest / 'scene.psm').open('wb') as out:
        out.write(struct.pack('<4sIII', b'PSM1', 1, len(groups), len(textures)))
        for group, tex, role, unlit, vertices in groups:
            unique = {}
            indices = []
            for offset in range(0, len(vertices), 48):
                vertex = bytes(vertices[offset:offset + 48])
                if vertex not in unique:
                    unique[vertex] = len(unique)
                indices.append(unique[vertex])
            out.write(struct.pack('<IiIIII', group, tex, role, unlit, len(unique), len(indices)))
            out.write(b''.join(unique))
            out.write(struct.pack('<' + 'I' * len(indices), *indices))
    # These are our own illustrative labels, not extracted game artwork.
    for texture_index, title in [(10, 'anguna'), (13, 'apotris'), (16, 'celeste')]:
        image = g['images'][g['textures'][texture_index]['source']]
        v = g['bufferViews'][image['bufferView']]
        (dest / f'label-{title}.png').write_bytes(data[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
    (dest / 'manifest.json').write_text(json.dumps({
        'format': 'PSM1', 'source': 'Pocket Shelf AGB-001 browser model export',
        'license': 'MPL-2.0', 'groups': roots,
        'batches': len(groups), 'vertices': sum(len(v) // 48 for *_, v in groups),
        'textures': textures,
    }, indent=2) + '\n')
    print(f'Baked {len(groups)} batches, {(dest / "scene.psm").stat().st_size:,} geometry bytes')


if __name__ == '__main__':
    bake(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'assets/native')
