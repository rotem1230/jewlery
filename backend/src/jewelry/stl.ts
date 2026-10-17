import { JewelryModel } from './geometry';

/**
 * Binary STL of every part of the model (metal and stones), in millimetres — the unit jewelry
 * CAM and 3D-printing tools assume for STL. Each part is a closed shell; overlapping shells are
 * expected (stones sit in their settings) and are unioned by the slicer.
 */
export function modelToStl(model: JewelryModel, header: string): Buffer {
  const triangles = model.parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0);
  const out = Buffer.alloc(84 + triangles * 50);
  out.write(header.slice(0, 79).padEnd(80, ' '), 0, 80, 'ascii');
  out.writeUInt32LE(triangles, 80);
  let offset = 84;
  for (const part of model.parts) {
    const { positions: p, indices } = part.mesh;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      const ux = p[b] - p[a];
      const uy = p[b + 1] - p[a + 1];
      const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a];
      const vy = p[c + 1] - p[a + 1];
      const vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      out.writeFloatLE(nx, offset);
      out.writeFloatLE(ny, offset + 4);
      out.writeFloatLE(nz, offset + 8);
      offset += 12;
      for (const v of [a, b, c]) {
        out.writeFloatLE(p[v], offset);
        out.writeFloatLE(p[v + 1], offset + 4);
        out.writeFloatLE(p[v + 2], offset + 8);
        offset += 12;
      }
      out.writeUInt16LE(0, offset);
      offset += 2;
    }
  }
  return out;
}
