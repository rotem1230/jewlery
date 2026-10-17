import { JewelryModel } from './geometry';

/** Wavefront OBJ of the model in millimetres, one group per part (metal, each stone kind). */
export function modelToObj(model: JewelryModel, header: string): Buffer {
  const lines: string[] = [`# ${header}`, '# units: millimetres'];
  let base = 1;
  model.parts.forEach((part, index) => {
    lines.push(`g ${part.material}_${part.code.toLowerCase()}_${index}`);
    const { positions: p, normals: n, indices } = part.mesh;
    for (let i = 0; i < p.length; i += 3) lines.push(`v ${p[i].toFixed(4)} ${p[i + 1].toFixed(4)} ${p[i + 2].toFixed(4)}`);
    for (let i = 0; i < n.length; i += 3) lines.push(`vn ${n[i].toFixed(4)} ${n[i + 1].toFixed(4)} ${n[i + 2].toFixed(4)}`);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] + base;
      const b = indices[i + 1] + base;
      const c = indices[i + 2] + base;
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }
    base += p.length / 3;
  });
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}
