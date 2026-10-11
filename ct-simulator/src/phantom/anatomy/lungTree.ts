/**
 * Prosedürel pulmoner damar ve bronş ağacı (alan doldurucu ikiye bölünme).
 * Her lob için hacim içinde rastgele hedef noktalar üretilir; dal, alt bölgenin
 * ağırlık merkezine yönelir ve bölge ana eksene göre ikiye bölünerek yinelenir.
 * Kesitlerde damarlar nokta/kısa elips, bronkovasküler demetler olarak görünür.
 */
import type { TubePt } from '../primitives';
import { mulberry } from './common';

export interface Lobe {
  root: [number, number, number];
  c: [number, number, number];
  r: [number, number, number];
}

export const LOBES: Lobe[] = [
  // sağ üst, orta, alt
  { root: [-46, 22, 400], c: [-70, 26, 360], r: [60, 66, 56] },
  { root: [-50, 10, 412], c: [-88, -40, 450], r: [50, 42, 40] },
  { root: [-50, 30, 418], c: [-90, 42, 505], r: [62, 64, 72] },
  // sol üst, lingula, alt
  { root: [48, 22, 396], c: [72, 24, 362], r: [60, 66, 58] },
  { root: [52, 10, 410], c: [92, -38, 455], r: [46, 38, 40] },
  { root: [52, 32, 416], c: [94, 44, 508], r: [60, 64, 72] },
];

export interface Segment {
  pts: TubePt[];
  gen: number;
}

function insideEll(p: number[], l: Lobe): boolean {
  const dx = (p[0] - l.c[0]) / l.r[0], dy = (p[1] - l.c[1]) / l.r[1], dz = (p[2] - l.c[2]) / l.r[2];
  return dx * dx + dy * dy + dz * dz <= 1;
}

export function growTree(seed: number, r0: number, ratio: number, nPts: number, maxGen: number, offset: [number, number, number] = [0, 0, 0]): Segment[] {
  const rnd = mulberry(seed);
  const segs: Segment[] = [];
  for (const lobe of LOBES) {
    const pts: number[][] = [];
    let guard = 0;
    while (pts.length < nPts && guard++ < nPts * 50) {
      const p = [lobe.c[0] + (rnd() * 2 - 1) * lobe.r[0], lobe.c[1] + (rnd() * 2 - 1) * lobe.r[1], lobe.c[2] + (rnd() * 2 - 1) * lobe.r[2]];
      if (insideEll(p, lobe)) pts.push(p);
    }
    const root: number[] = [lobe.root[0] + offset[0], lobe.root[1] + offset[1], lobe.root[2] + offset[2]];
    const rec = (from: number[], set: number[][], r: number, gen: number) => {
      const cx = set.reduce((a, p) => a + p[0], 0) / set.length;
      const cy = set.reduce((a, p) => a + p[1], 0) / set.length;
      const cz = set.reduce((a, p) => a + p[2], 0) / set.length;
      // hedefe doğru uzunluk: merkezin %55'i (yaprakta tamamı)
      const leaf = set.length <= 1 || gen >= maxGen;
      const f = leaf ? 1 : 0.55;
      const to = [from[0] + (cx - from[0]) * f, from[1] + (cy - from[1]) * f, from[2] + (cz - from[2]) * f];
      // hafif kıvrım için ara nokta
      const mid = [(from[0] + to[0]) / 2 + (rnd() - 0.5) * 3, (from[1] + to[1]) / 2 + (rnd() - 0.5) * 3, (from[2] + to[2]) / 2 + (rnd() - 0.5) * 3];
      const rEnd = r * (leaf ? 0.6 : 0.92);
      segs.push({ pts: [[from[0], from[1], from[2], r], [mid[0], mid[1], mid[2], (r + rEnd) / 2], [to[0], to[1], to[2], rEnd]], gen });
      if (leaf) return;
      // en büyük varyans eksenine göre ikiye böl
      let best = 0, bv = -1;
      for (let a = 0; a < 3; a++) {
        const m = [cx, cy, cz][a];
        const v = set.reduce((acc, p) => acc + (p[a] - m) * (p[a] - m), 0);
        if (v > bv) {
          bv = v;
          best = a;
        }
      }
      const sorted = [...set].sort((p, q) => p[best] - q[best]);
      const h = Math.floor(sorted.length / 2);
      rec(to, sorted.slice(0, h), r * ratio, gen + 1);
      rec(to, sorted.slice(h), r * ratio, gen + 1);
    };
    rec(root, pts, r0, 0);
  }
  return segs;
}
