#!/usr/bin/env python3
"""Placeholder jewelry GLBs for studio catalog. Replace with studio meshes later."""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "assets" / "models" / "studio"


def vec_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def torus(R: float, r: float, seg_u=48, seg_v=14, rx=1.0, ry=1.0, rz=1.0, plane='xy'):
    pos, nrm, idx = [], [], []
    for i in range(seg_u):
        u0 = i / seg_u * math.tau
        u1 = (i + 1) / seg_u * math.tau
        for j in range(seg_v):
            v0 = j / seg_v * math.tau
            v1 = (j + 1) / seg_v * math.tau
            corners = []
            norms = []
            for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1)):
                cv, sv = math.cos(v), math.sin(v)
                cu, su = math.cos(u), math.sin(u)
                if plane == 'xy':
                    px = (R + r * cv) * cu * rx
                    py = (R + r * cv) * su * ry
                    pz = r * sv * rz
                    nx, ny, nz = cv * cu, cv * su, sv
                else:
                    px = (R + r * cv) * cu * rx
                    py = r * sv * ry
                    pz = (R + r * cv) * su * rz
                    nx, ny, nz = cv * cu, sv, cv * su
                ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
                corners.append((px, py, pz))
                norms.append((nx / ln, ny / ln, nz / ln))
            base = len(pos) // 3
            for p, n in zip(corners, norms):
                pos.extend(p)
                nrm.extend(n)
            idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return pos, nrm, idx


def sphere(radius: float, seg_u=20, seg_v=12, origin=(0.0, 0.0, 0.0)):
    pos, nrm, idx = [], [], []
    for i in range(seg_u):
        u0 = i / seg_u * math.tau
        u1 = (i + 1) / seg_u * math.tau
        for j in range(seg_v):
            v0 = j / seg_v * math.pi
            v1 = (j + 1) / seg_v * math.pi
            corners, norms = [], []
            for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1)):
                x = math.sin(v) * math.cos(u)
                y = math.cos(v)
                z = math.sin(v) * math.sin(u)
                corners.append(vec_add((x * radius, y * radius, z * radius), origin))
                norms.append((x, y, z))
            base = len(pos) // 3
            for p, n in zip(corners, norms):
                pos.extend(p)
                nrm.extend(n)
            idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return pos, nrm, idx


def cylinder(radius: float, height: float, origin=(0, 0, 0), axis=(0, 1, 0), segs=10):
    """Short claw along +Y then rotated toward axis (axis is unit direction)."""
    pos, nrm, idx = [], [], []
    ax, ay, az = axis
    ln = math.sqrt(ax * ax + ay * ay + az * az) or 1
    ax, ay, az = ax / ln, ay / ln, az / ln
    up = (0.0, 1.0, 0.0) if abs(ay) < 0.9 else (1.0, 0.0, 0.0)
    # orthonormal basis
    bx = up[1] * az - up[2] * ay
    by = up[2] * ax - up[0] * az
    bz = up[0] * ay - up[1] * ax
    bl = math.sqrt(bx * bx + by * by + bz * bz) or 1
    bx, by, bz = bx / bl, by / bl, bz / bl
    cx = ay * bz - az * by
    cy = az * bx - ax * bz
    cz = ax * by - ay * bx

    def xf(lx, ly, lz):
        return (
            origin[0] + bx * lx + ax * ly + cx * lz,
            origin[1] + by * lx + ay * ly + cy * lz,
            origin[2] + bz * lx + az * ly + cz * lz,
        )

    for i in range(segs):
        a0 = i / segs * math.tau
        a1 = (i + 1) / segs * math.tau
        ring = []
        for a, y in ((a0, 0.0), (a1, 0.0), (a1, height), (a0, height)):
            ring.append((math.cos(a) * radius, y, math.sin(a) * radius))
        base = len(pos) // 3
        for lx, ly, lz in ring:
            p = xf(lx, ly, lz)
            n = xf(lx, 0, lz)
            nx, ny, nz = n[0] - origin[0], n[1] - origin[1], n[2] - origin[2]
            nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            pos.extend(p)
            nrm.extend((nx / nl, ny / nl, nz / nl))
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return pos, nrm, idx


def add_tri(pos, nrm, idx, a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    n = (nx / ln, ny / ln, nz / ln)
    base = len(pos) // 3
    for p in (a, b, c):
        pos.extend(p)
        nrm.extend(n)
    idx.extend([base, base + 1, base + 2])


def ring_pts(radius: float, y: float, segs: int, origin=(0.0, 0.0, 0.0), spin=0.0):
    ox, oy, oz = origin
    return [
        (
            ox + math.cos(spin + i / segs * math.tau) * radius,
            oy + y,
            oz + math.sin(spin + i / segs * math.tau) * radius,
        )
        for i in range(segs)
    ]


def add_strip(pos, nrm, idx, a, b):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        add_tri(pos, nrm, idx, a[i], b[i], b[j])
        add_tri(pos, nrm, idx, a[i], b[j], a[j])


def brilliant(girdle_r: float, origin=(0.0, 0.0, 0.0), segs=16):
    """Round brilliant: table, crown, girdle, pavilion. y=0 is the girdle."""
    pos, nrm, idx = [], [], []
    table_r = girdle_r * 0.55
    crown_h = girdle_r * 0.34
    pav_h = girdle_r * 0.38
    girdle_h = girdle_r * 0.045
    table = ring_pts(table_r, crown_h, segs, origin)
    star = ring_pts(girdle_r * 0.78, crown_h * 0.42, segs, origin, math.pi / segs)
    girdle_u = ring_pts(girdle_r, girdle_h * 0.5, segs, origin)
    girdle_l = ring_pts(girdle_r, -girdle_h * 0.5, segs, origin)
    pav = ring_pts(girdle_r * 0.52, -pav_h * 0.42, segs, origin, math.pi / segs)
    culet = (origin[0], origin[1] - pav_h, origin[2])
    ox, oy, oz = origin
    table_c = (ox, oy + crown_h, oz)
    for i in range(segs):
        add_tri(pos, nrm, idx, table_c, table[i], table[(i + 1) % segs])
    add_strip(pos, nrm, idx, table, star)
    add_strip(pos, nrm, idx, star, girdle_u)
    add_strip(pos, nrm, idx, girdle_u, girdle_l)
    add_strip(pos, nrm, idx, girdle_l, pav)
    for i in range(segs):
        add_tri(pos, nrm, idx, pav[i], culet, pav[(i + 1) % segs])
    return pos, nrm, idx


def cone(r0: float, r1: float, height: float, origin=(0, 0, 0), axis=(0, 1, 0), segs=12):
    pos, nrm, idx = [], [], []
    ax, ay, az = axis
    ln = math.sqrt(ax * ax + ay * ay + az * az) or 1
    ax, ay, az = ax / ln, ay / ln, az / ln
    up = (0.0, 1.0, 0.0) if abs(ay) < 0.9 else (1.0, 0.0, 0.0)
    bx = up[1] * az - up[2] * ay
    by = up[2] * ax - up[0] * az
    bz = up[0] * ay - up[1] * ax
    bl = math.sqrt(bx * bx + by * by + bz * bz) or 1
    bx, by, bz = bx / bl, by / bl, bz / bl
    cx = ay * bz - az * by
    cy = az * bx - ax * bz
    cz = ax * by - ay * bx

    def xf(lx, ly, lz):
        return (
            origin[0] + bx * lx + ax * ly + cx * lz,
            origin[1] + by * lx + ay * ly + cy * lz,
            origin[2] + bz * lx + az * ly + cz * lz,
        )

    for i in range(segs):
        a0 = i / segs * math.tau
        a1 = (i + 1) / segs * math.tau
        ring = [
            (math.cos(a0) * r0, 0.0, math.sin(a0) * r0),
            (math.cos(a1) * r0, 0.0, math.sin(a1) * r0),
            (math.cos(a1) * r1, height, math.sin(a1) * r1),
            (math.cos(a0) * r1, height, math.sin(a0) * r1),
        ]
        base = len(pos) // 3
        for lx, ly, lz in ring:
            p = xf(lx, ly, lz)
            n = xf(lx, 0, lz)
            nx, ny, nz = n[0] - origin[0], n[1] - origin[1], n[2] - origin[2]
            nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            pos.extend(p)
            nrm.extend((nx / nl, ny / nl, nz / nl))
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return pos, nrm, idx


def pack_mesh(pos, nrm, idx):
    if len(idx) % 2:
        idx = idx + [idx[-1]]
    pmin = [min(pos[i::3]) for i in range(3)]
    pmax = [max(pos[i::3]) for i in range(3)]
    return {
        "pos": pos,
        "nrm": nrm,
        "idx": idx,
        "min": pmin,
        "max": pmax,
        "count": len(idx),
        "verts": len(pos) // 3,
    }


class Gltf:
    def __init__(self):
        self.meshes_data = []
        self.nodes = []
        self.mesh_nodes = []

    def add_part(self, name: str, mesh, material: int, translation=None, extras=None):
        mid = len(self.meshes_data)
        self.meshes_data.append(mesh)
        node = {"name": name, "mesh": mid}
        if translation:
            node["translation"] = list(translation)
        if extras:
            node["extras"] = extras
        nid = len(self.nodes)
        self.nodes.append(node)
        self.mesh_nodes.append((nid, material))
        return nid

    def write(self, path: Path, root_children: list[int]):
        bin_parts = []
        accessors = []
        views = []
        meshes = []
        offset = 0

        def align4(n):
            return (n + 3) & ~3

        for mesh, (_nid, material) in zip(self.meshes_data, self.mesh_nodes):
            pos_b = b"".join(struct.pack("<fff", mesh["pos"][i], mesh["pos"][i + 1], mesh["pos"][i + 2]) for i in range(0, len(mesh["pos"]), 3))
            nrm_b = b"".join(struct.pack("<fff", mesh["nrm"][i], mesh["nrm"][i + 1], mesh["nrm"][i + 2]) for i in range(0, len(mesh["nrm"]), 3))
            idx_b = b"".join(struct.pack("<H", i) for i in mesh["idx"])
            for blob, count, ctype, tpe, mn, mx in (
                (pos_b, mesh["verts"], 5126, "VEC3", mesh["min"], mesh["max"]),
                (nrm_b, mesh["verts"], 5126, "VEC3", None, None),
                (idx_b, mesh["count"], 5123, "SCALAR", None, None),
            ):
                padded = blob + b"\x00" * (align4(len(blob)) - len(blob))
                views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blob)})
                acc = {"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": tpe}
                if mn is not None:
                    acc["min"] = mn
                    acc["max"] = mx
                accessors.append(acc)
                bin_parts.append(padded)
                offset += len(padded)
            ai = len(accessors)
            meshes.append(
                {
                    "name": self.nodes[_nid]["name"],
                    "primitives": [
                        {
                            "attributes": {"POSITION": ai - 3, "NORMAL": ai - 2},
                            "indices": ai - 1,
                            "material": material,
                            "mode": 4,
                        }
                    ],
                }
            )

        root = {"name": "Root", "children": root_children}
        all_nodes = [root] + self.nodes
        # child indices are offset by +1 because root is 0
        for node in all_nodes[1:]:
            if "children" in node:
                node["children"] = [c + 1 for c in node["children"]]
        root["children"] = [c + 1 for c in root_children]

        blob = b"".join(bin_parts)
        doc = {
            "asset": {"version": "2.0", "generator": "mailnvosky-dummy-studio"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": all_nodes,
            "meshes": meshes,
            "materials": [
                {
                    "name": "Metal",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.89, 0.76, 0.28, 1],
                        "metallicFactor": 1,
                        "roughnessFactor": 0.28,
                    },
                },
                {
                    "name": "Stone",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.95, 0.97, 1, 1],
                        "metallicFactor": 0.05,
                        "roughnessFactor": 0.08,
                    },
                },
            ],
            "accessors": accessors,
            "bufferViews": views,
            "buffers": [{"byteLength": len(blob)}],
        }
        json_b = json.dumps(doc, separators=(",", ":")).encode("utf-8")
        json_b += b" " * ((4 - len(json_b) % 4) % 4)
        blob += b"\x00" * ((4 - len(blob) % 4) % 4)
        json_chunk = struct.pack("<II", len(json_b), 0x4E4F534A) + json_b
        bin_chunk = struct.pack("<II", len(blob), 0x004E4942) + blob
        header = struct.pack("<4sII", b"glTF", 2, 12 + len(json_chunk) + len(bin_chunk))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(header + json_chunk + bin_chunk)
        print(f"wrote {path} ({path.stat().st_size} bytes)")


def xy_torus_pt(R, r, u, v, rx=1.0, ry=1.0, rz=1.0):
    cv, sv = math.cos(v), math.sin(v)
    cu, su = math.cos(u), math.sin(u)
    return ((R + r * cv) * cu * rx, (R + r * cv) * su * ry, r * sv * rz)


def append_mesh(pos, nrm, idx, other):
    p, n, ix = other
    base = len(pos) // 3
    pos.extend(p)
    nrm.extend(n)
    idx.extend([v + base for v in ix])


def prongs(count: int, head_r: float, head_top_y: float, girdle_y: float, girdle_r: float, crown_h: float, axis_sign=1.0):
    """Claws that start on the head rim and hook the crown. axis_sign +1 = table +Y."""
    pos, nrm, idx = [], [], []
    start = math.pi / 4 if count == 4 else 0
    base_y = head_top_y - 0.012 * axis_sign
    tip_y = girdle_y + crown_h * 0.48 * axis_sign
    for i in range(count):
        a = start + i * math.tau / count
        ca, sa = math.cos(a), math.sin(a)
        origin = (ca * head_r * 0.92, base_y, sa * head_r * 0.92)
        tip = (ca * girdle_r * 0.7, tip_y, sa * girdle_r * 0.7)
        direction = (tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2])
        length = math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2) or 0.12
        append_mesh(pos, nrm, idx, cone(0.016, 0.008, length, origin, direction, segs=12))
        append_mesh(pos, nrm, idx, sphere(0.011, 10, 8, tip))
    return pos, nrm, idx


def pave_on_torus(R, r, count=16, skip_u=None, gem=0.024, rx=1.0, ry=1.0, rz=1.0):
    """Small stones half-in the camera-facing tube surface."""
    pos, nrm, idx = [], [], []
    for i in range(count):
        u = i / count * math.tau
        if skip_u is not None:
            du = (u - skip_u + math.pi) % math.tau - math.pi
            if abs(du) < 0.7:
                continue
        origin = xy_torus_pt(R, r, u, math.pi / 2, rx, ry, rz)
        origin = (origin[0], origin[1], origin[2] - gem * 0.4)
        append_mesh(pos, nrm, idx, sphere(gem, 10, 8, origin))
    return pos, nrm, idx


def build_ring():
    g = Gltf()
    R, r, gem = 1.0, 0.12, 0.16
    pav_h = gem * 0.38
    crown_h = gem * 0.34
    head_y = R
    head_h = r + 0.07
    head_r = r * 0.62
    head_top = head_y + head_h
    girdle_y = head_top - 0.02 + pav_h * 0.45
    band = pack_mesh(*torus(R, r, 72, 20, plane='xy'))
    head = pack_mesh(*cone(head_r * 1.05, head_r, head_h, (0, head_y, 0), (0, 1, 0), segs=20))
    stone = pack_mesh(*brilliant(gem, (0, girdle_y, 0)))
    p4 = pack_mesh(*prongs(4, head_r, head_top, girdle_y, gem, crown_h))
    p6 = pack_mesh(*prongs(6, head_r, head_top, girdle_y, gem, crown_h))
    bezel = pack_mesh(*torus(gem * 0.86, 0.016, 32, 10, plane='xz'))
    pave = pack_mesh(*pave_on_torus(R, r, 16, skip_u=math.pi / 2, gem=0.022))
    ids = [
        g.add_part("Band", band, 0),
        g.add_part("Head", head, 0),
        g.add_part("Stone", stone, 1),
        g.add_part("Setting_4_PRONG", p4, 0),
        g.add_part("Setting_6_PRONG", p6, 0),
        g.add_part("Setting_BEZEL", bezel, 0, translation=(0, girdle_y, 0)),
        g.add_part("Setting_PAVE", pave, 1),
    ]
    g.write(OUT / "ring.glb", ids)


def build_bracelet():
    g = Gltf()
    R, r, gem = 1.15, 0.09, 0.14
    pav_h = gem * 0.38
    crown_h = gem * 0.34
    head_y = R
    head_h = r + 0.06
    head_r = r * 0.62
    head_top = head_y + head_h
    girdle_y = head_top - 0.018 + pav_h * 0.45
    band = pack_mesh(*torus(R, r, 64, 16, plane='xy'))
    head = pack_mesh(*cone(head_r * 1.05, head_r, head_h, (0, head_y, 0), (0, 1, 0), segs=18))
    stone = pack_mesh(*brilliant(gem, (0, girdle_y, 0)))
    p4 = pack_mesh(*prongs(4, head_r, head_top, girdle_y, gem, crown_h))
    p6 = pack_mesh(*prongs(6, head_r, head_top, girdle_y, gem, crown_h))
    bezel = pack_mesh(*torus(gem * 0.86, 0.014, 28, 10, plane='xz'))
    pave = pack_mesh(*pave_on_torus(R, r, 18, skip_u=math.pi / 2, gem=0.02))
    ids = [
        g.add_part("Band", band, 0),
        g.add_part("Head", head, 0),
        g.add_part("Stone", stone, 1),
        g.add_part("Setting_4_PRONG", p4, 0),
        g.add_part("Setting_6_PRONG", p6, 0),
        g.add_part("Setting_BEZEL", bezel, 0, translation=(0, girdle_y, 0)),
        g.add_part("Setting_PAVE", pave, 1),
    ]
    g.write(OUT / "bracelet.glb", ids)


def build_necklace():
    g = Gltf()
    R, r, gem = 1.05, 0.032, 0.13
    ry = 1.26
    pav_h = gem * 0.38
    crown_h = gem * 0.34
    tube_y = -R * ry
    head_h = r + 0.08
    head_r = 0.048
    head_top = tube_y - head_h
    girdle_y = head_top - 0.02 + pav_h * 0.45
    chain = pack_mesh(*torus(R, r, 64, 12, ry=ry, plane='xy'))
    head = pack_mesh(*cone(head_r * 0.75, head_r, head_h, (0, tube_y, 0), (0, -1, 0), segs=16))
    stone = pack_mesh(*brilliant(gem, (0, girdle_y, 0)))
    p4 = pack_mesh(*prongs(4, head_r, head_top, girdle_y, gem, crown_h))
    p6 = pack_mesh(*prongs(6, head_r, head_top, girdle_y, gem, crown_h))
    bezel = pack_mesh(*torus(gem * 0.86, 0.014, 24, 10, plane='xz'))
    pave = pack_mesh(*pave_on_torus(R, r, 14, skip_u=-math.pi / 2, gem=0.018, ry=ry))
    ids = [
        g.add_part("Band", chain, 0),
        g.add_part("Head", head, 0),
        g.add_part("Stone", stone, 1),
        g.add_part("Setting_4_PRONG", p4, 0),
        g.add_part("Setting_6_PRONG", p6, 0),
        g.add_part("Setting_BEZEL", bezel, 0, translation=(0, girdle_y, 0)),
        g.add_part("Setting_PAVE", pave, 1),
    ]
    g.write(OUT / "necklace.glb", ids)


def earring_side(g: Gltf, x: float):
    cup_y, cup_r, gem = 0.28, 0.1, 0.11
    pav_h = gem * 0.38
    crown_h = gem * 0.34
    culet_y = cup_y + cup_r * 0.2
    girdle_y = culet_y + pav_h
    head_top = cup_y + cup_r * 0.7
    head_r = cup_r * 0.42
    cup = pack_mesh(*sphere(cup_r, 16, 12, (x, cup_y, 0)))
    stone = pack_mesh(*brilliant(gem, (x, girdle_y, 0)))
    p4 = pack_mesh(*prongs(4, head_r, head_top, girdle_y, gem, crown_h))
    p6 = pack_mesh(*prongs(6, head_r, head_top, girdle_y, gem, crown_h))
    bezel = pack_mesh(*torus(gem * 0.86, 0.013, 20, 8, plane='xz'))
    pos, nrm, idx = [], [], []
    for i in range(8):
        a = i / 8 * math.tau
        origin = (x + math.cos(a) * cup_r * 0.82, cup_y + cup_r * 0.15, math.sin(a) * cup_r * 0.82)
        append_mesh(pos, nrm, idx, sphere(0.016, 8, 6, origin))
    pave = pack_mesh(pos, nrm, idx)
    suffix = "L" if x < 0 else "R"
    return [
        g.add_part(f"Band_{suffix}", cup, 0),
        g.add_part(f"Stone_{suffix}", stone, 1),
        g.add_part(f"Setting_4_PRONG_{suffix}", p4, 0, translation=(x, 0, 0)),
        g.add_part(f"Setting_6_PRONG_{suffix}", p6, 0, translation=(x, 0, 0)),
        g.add_part(f"Setting_BEZEL_{suffix}", bezel, 0, translation=(x, girdle_y, 0)),
        g.add_part(f"Setting_PAVE_{suffix}", pave, 1),
    ]


def build_earrings():
    g = Gltf()
    ids = earring_side(g, -0.34) + earring_side(g, 0.34)
    g.write(OUT / "earrings.glb", ids)


if __name__ == "__main__":
    build_ring()
    build_bracelet()
    build_necklace()
    build_earrings()
