/**
 * Omurga: servikal–lomber omurlar (gövde, uç plaklar, disk, pedikül, lamina,
 * spinöz/transvers çıkıntılar, faset eklemler), spinal kanal ve kord, sakrum, koksiks.
 */
import { ell, props, seg, structure } from '../primitives';
import type { Paint, PaintProps, Structure } from '../types';
import { VERTEBRAE, interpTable, spineY, type Vertebra } from './common';

const pCort = props('corticalBone');
const pTrab = props('trabecularBone', { comp: 'marrow', tex: { kind: 'trab', amp: 0.75, scale: 1.25, seed: 51 } });
const pTrabD = props('trabecularDense', { tex: { kind: 'trab', amp: 0.5, scale: 1.3, seed: 52 } });
const pDisc = props('disc');
const pAnnulus = props('tendon');
const pCsf = props('csf');
const pCord = props('whiteMatter');
const pFat = props('fat');
const pSoft = props('softTissue');

function canalDims(v: Vertebra): { rx: number; ry: number } {
  if (v.type === 'C') return { rx: 12, ry: 7.5 };
  if (v.type === 'T') return { rx: 8.5, ry: 8 };
  return { rx: 11, ry: 9 };
}

export function canalCenterY(z: number, v?: Vertebra): number {
  const vv = v ?? nearestVert(z);
  const c = canalDims(vv);
  return spineY(z) + vv.ry + c.ry + 2;
}

export function nearestVert(z: number): Vertebra {
  let best = VERTEBRAE[0], bd = Infinity;
  for (const v of VERTEBRAE) {
    const mid = v.zTop + v.h / 2;
    const d = Math.abs(z - mid);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

function boneSeg(o: Paint[], x0: number, y0: number, x1: number, y1: number, r: number, inner: PaintProps = pTrabD): void {
  o.push({ shape: seg(x0, y0, x1, y1, r), p: pCort });
  if (r > 2.2) o.push({ shape: seg(x0, y0, x1, y1, r - 1.3), p: inner });
}

function vertebraEmit(v: Vertebra, z: number, o: Paint[]): void {
  const sy = spineY(z);
  const cd = canalDims(v);
  const ccy = sy + v.ry + cd.ry + 2;
  const zr = z - v.zTop;
  const h = v.h;
  // Gövde
  if (zr >= 0 && zr <= h) {
    const u = zr / h;
    const n = v.type === 'L' ? 2.35 : 2.15;
    const endplate = u < 0.05 || u > 0.95;
    // gövde kenarında hafif "bel" (orta kısımda daralma)
    const waist = 1 - 0.06 * Math.sin(Math.PI * u);
    o.push({ shape: ell(0, sy, v.rx * waist, v.ry * waist, 0, n), p: pCort });
    o.push({ shape: ell(0, sy, v.rx * waist - 1.4, v.ry * waist - 1.4, 0, n), p: endplate ? pTrabD : pTrab });
    // bazivertebral ven
    if (u > 0.3 && u < 0.7) o.push({ shape: ell(0, sy + v.ry * 0.62, 2.2, 1.6), p: pSoft });
    // osteofit (alt lomber)
    if (v.type === 'L' && (u < 0.12 || u > 0.88)) o.push({ shape: ell(-v.rx * 0.9, sy - 2, 3, 4), p: pCort });
  } else if (zr > h && zr <= h + v.disc) {
    o.push({ shape: ell(0, sy, v.rx + 0.6, v.ry + 0.6, 0, 2.2), p: pAnnulus });
    o.push({ shape: ell(0, sy + 1, v.rx * 0.55, v.ry * 0.5), p: pDisc });
  }
  // Arka elemanlar
  const pr = v.type === 'L' ? 4.6 : v.type === 'T' ? 3.6 : 3;
  if (zr > 0.1 * h && zr < 0.65 * h) {
    for (const s of [-1, 1]) {
      boneSeg(o, s * v.rx * 0.5, sy + v.ry * 0.75, s * (cd.rx + 2.5), ccy - 1, pr);
    }
  }
  if (zr > 0.35 * h && zr < h + 0.7 * v.disc) {
    for (const s of [-1, 1]) boneSeg(o, s * (cd.rx + 2.5), ccy + 1, s * 3, ccy + cd.ry + 4.5, 3.2);
  }
  // spinöz çıkıntı (torakalde aşağı eğimli)
  const spLen = v.type === 'C' ? (v.name === 'C7' ? 34 : 20) : v.type === 'T' ? 32 : 30;
  const spZ0 = v.type === 'T' ? 0.55 * h : 0.4 * h;
  const spZ1 = v.type === 'T' ? h + v.disc + 0.75 * h : h + 0.7 * v.disc;
  if (zr > spZ0 && zr < spZ1) {
    const t = (zr - spZ0) / (spZ1 - spZ0);
    const y0 = ccy + cd.ry + 3;
    const y1 = y0 + spLen * (v.type === 'T' ? 0.35 + 0.65 * t : 1);
    const ya = v.type === 'T' ? y0 + spLen * Math.max(0, t - 0.45) : y0;
    boneSeg(o, 0, ya, 0, y1, v.type === 'L' ? 4.2 : 3.2);
    if (v.type === 'C' && v.name !== 'C7') for (const s of [-1, 1]) boneSeg(o, 0, y1 - 2, s * 5, y1 + 3, 2.5); // bifid
  }
  // transvers çıkıntılar
  if (zr > 0.15 * h && zr < 0.62 * h) {
    const len = v.type === 'C' ? 24 : v.type === 'T' ? 30 : v.name === 'L3' ? 42 : 36;
    const dy = v.type === 'T' ? 10 : v.type === 'C' ? -8 : 2;
    const r = v.type === 'L' ? 3.6 : 4;
    for (const s of [-1, 1]) {
      boneSeg(o, s * (cd.rx + 3), ccy - 2, s * len, ccy - 2 + dy, r);
      if (v.type === 'C') o.push({ shape: ell(s * (len - 7), ccy - 2 + dy * 0.8, 2.6, 2.6), p: pSoft }); // transvers foramen
    }
  }
  // faset eklemler (disk seviyesi)
  if (zr > h - 3 && zr < h + v.disc + 3) {
    for (const s of [-1, 1]) {
      const fx = s * (cd.rx + 6), fy = ccy + 3;
      o.push({ shape: ell(fx, fy, 6, 7.5, s * 0.5), p: pCort });
      o.push({ shape: ell(fx, fy, 4.5, 6, s * 0.5), p: pTrabD });
      o.push({ shape: seg(fx - s * 2, fy - 6, fx + s * 2, fy + 6, 0.5), p: pSoft });
    }
  }
}

export function spine(): Structure[] {
  const out: Structure[] = [];
  out.push(
    structure('omurga', 150, 790, (z, o) => {
      // C1 (atlas) ve C2 dens
      if (z >= 158 && z <= 174) {
        const sy = spineY(z);
        if (z >= 161) {
          boneSeg(o, -8, sy - 10, 8, sy - 10, 4);
          for (const s of [-1, 1]) {
            o.push({ shape: ell(s * 20, sy + 2, 9, 11), p: pCort });
            o.push({ shape: ell(s * 20, sy + 2, 7.5, 9.5), p: pTrabD });
            boneSeg(o, s * 22, sy + 10, s * 4, sy + 27, 3.5);
            boneSeg(o, s * 28, sy + 2, s * 38, sy + 4, 4.5);
          }
        }
        // dens
        if (z >= 158) {
          o.push({ shape: ell(0, sy - 1, 6, 6), p: pCort });
          o.push({ shape: ell(0, sy - 1, 4.5, 4.5), p: pTrab });
        }
      }
      for (const v of VERTEBRAE) {
        if (z < v.zTop - 2 || z > v.zTop + v.h + v.disc + v.h) continue;
        vertebraEmit(v, z, o);
      }
    }),
  );
  // Spinal kanal + kord
  out.push(
    structure('spinal kanal', 150, 845, (z, o) => {
      if (z < 769) {
        const v = nearestVert(z);
        const cd = canalDims(v);
        const ccy = spineY(z) + v.ry + cd.ry + 2;
        if (v.type === 'L') o.push({ shape: ell(0, ccy + cd.ry * 0.55, cd.rx * 0.6, cd.ry * 0.5), p: pFat });
        o.push({ shape: ell(0, ccy - (v.type === 'L' ? 1.5 : 0), cd.rx - 1, cd.ry - (v.type === 'L' ? 2.2 : 1)), p: pCsf });
        if (z < 598) {
          const cr = interpTable([[150, 6.5], [250, 7], [290, 5.5], [500, 4.5], [585, 4], [598, 1.5]], z, 1);
          o.push({ shape: ell(0, ccy - 0.5, cr * 1.3, cr), p: pCord });
        } else {
          // kauda ekuina kökleri
          for (const s of [-1, 1]) o.push({ shape: ell(s * 3, ccy + 1, 2.2, 1.6), p: pSoft });
        }
      } else {
        const a = sacrumAt(z);
        if (a) o.push({ shape: ell(0, a.yAnt + a.th * 0.72, Math.max(2, 9 - (z - 769) * 0.08), Math.max(1.5, 5 - (z - 769) * 0.04)), p: pCsf });
      }
    }),
  );
  // Sakrum + koksiks
  out.push(
    structure('sakrum', 765, 905, (z, o) => {
      const a = sacrumAt(z);
      if (!a) return;
      const cy = a.yAnt + a.th / 2;
      o.push({ shape: ell(0, cy, a.hw, a.th / 2, 0, 2.6), p: pCort });
      o.push({ shape: ell(0, cy, a.hw - 1.6, a.th / 2 - 1.6, 0, 2.6), p: pTrab });
      // S1-S2 artık disk
      if (Math.abs(z - 795) < 1.5) o.push({ shape: ell(0, cy - 2, 18, 5), p: pDisc });
      // sakral foramenler
      if (z > 775 && z < 860) for (const s of [-1, 1]) o.push({ shape: ell(s * (14 + (860 - z) * 0.08), cy, 3.2, a.th * 0.35), p: pSoft });
    }),
  );
  return out;
}

/** Sakrumun z'deki ön yüzeyi, kalınlığı ve yarı genişliği (alalar dahil) */
export function sacrumAt(z: number): { yAnt: number; th: number; hw: number } | null {
  if (z < 767 || z > 905) return null;
  const tab = [
    [767, 44, 38, 40],
    [775, 46, 40, 56],
    [790, 52, 36, 54],
    [805, 60, 32, 46],
    [830, 76, 26, 34],
    [855, 90, 20, 24],
    [880, 100, 14, 14],
    [905, 108, 8, 6],
  ];
  return { yAnt: interpTable(tab, z, 1), th: interpTable(tab, z, 2), hw: interpTable(tab, z, 3) };
}
