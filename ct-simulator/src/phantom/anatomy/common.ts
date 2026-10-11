/**
 * Ortak anatomik referanslar: omurga seviyeleri, gövde dış hattı ve katmanları,
 * vücut yapısına (habitus) bağlı ölçekleme.
 * Tüm ölçüler mm; z verteksten kaudale, y posteriora, x hastanın soluna pozitif.
 */
import type { PhantomConfig } from '../types';
import { TABLE_TOP_Y } from '../types';

export interface Vertebra {
  name: string;
  zTop: number;
  h: number; // gövde yüksekliği
  disc: number; // alttaki disk
  rx: number;
  ry: number;
  type: 'C' | 'T' | 'L';
}

const V = (name: string, zTop: number, h: number, disc: number, rx: number, ry: number, type: 'C' | 'T' | 'L'): Vertebra => ({ name, zTop, h, disc, rx, ry, type });

export const VERTEBRAE: Vertebra[] = [
  V('C2', 172, 22, 5, 9, 8, 'C'),
  V('C3', 199, 13, 5, 9, 8, 'C'),
  V('C4', 217, 13, 5, 9.5, 8, 'C'),
  V('C5', 235, 13, 5, 10, 8, 'C'),
  V('C6', 253, 13, 5, 10.5, 8.5, 'C'),
  V('C7', 271, 14, 5, 11, 9, 'C'),
  V('T1', 290, 16, 4, 12, 10, 'T'),
  V('T2', 310, 17, 4, 12.5, 11, 'T'),
  V('T3', 331, 18, 4, 13, 12, 'T'),
  V('T4', 353, 18, 4, 13.5, 12.5, 'T'),
  V('T5', 375, 19, 4, 14, 13, 'T'),
  V('T6', 398, 19, 4.5, 14.5, 13.5, 'T'),
  V('T7', 421.5, 20, 4.5, 15, 14, 'T'),
  V('T8', 446, 21, 5, 15.5, 14.5, 'T'),
  V('T9', 472, 21, 5, 16, 15, 'T'),
  V('T10', 498, 22, 5, 17, 15.5, 'T'),
  V('T11', 525, 23, 6, 18, 16, 'T'),
  V('T12', 554, 24, 7, 19.5, 16.5, 'T'),
  V('L1', 585, 26, 9, 21, 17, 'L'),
  V('L2', 620, 27, 10, 22, 17.5, 'L'),
  V('L3', 657, 28, 10, 23, 18, 'L'),
  V('L4', 695, 28, 10, 24, 18, 'L'),
  V('L5', 733, 27, 9, 25, 17.5, 'L'),
];

export function vert(name: string): Vertebra {
  const v = VERTEBRAE.find((x) => x.name === name);
  if (!v) throw new Error(name);
  return v;
}

function interpTable(tab: number[][], z: number, col: number): number {
  if (z <= tab[0][0]) return tab[0][col];
  for (let i = 0; i < tab.length - 1; i++) {
    if (z <= tab[i + 1][0]) {
      const t = (z - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
      const s = t * t * (3 - 2 * t);
      return tab[i][col] + (tab[i + 1][col] - tab[i][col]) * s;
    }
  }
  return tab[tab.length - 1][col];
}

/** Omur gövdesi merkezinin y koordinatı (lordoz/kifoz). */
const SPINE_Y = [
  [150, 28],
  [185, 30],
  [240, 36],
  [275, 48],
  [295, 58],
  [360, 72],
  [450, 78],
  [520, 76],
  [580, 68],
  [610, 62],
  [670, 52],
  [730, 52],
  [770, 60],
];
export function spineY(z: number): number {
  return interpTable(SPINE_Y, z, 1);
}

/* ------------------------------------------------------------------------ */
/* Gövde dış hattı ve katmanlar                                              */
/* ------------------------------------------------------------------------ */

/** [z, cy, rx, ry, n] — orta habitus, deri yüzeyi */
const OUTLINE = [
  [205, 28, 56, 55, 2.0],
  [240, 30, 58, 58, 2.0],
  [265, 30, 60, 60, 2.0],
  [285, 34, 74, 66, 2.1],
  [300, 38, 128, 80, 2.6],
  [315, 31, 156, 92, 2.45],
  [340, 22, 164, 103, 2.3],
  [380, 16, 166, 110, 2.25],
  [440, 12, 166, 114, 2.25],
  [500, 12, 163, 113, 2.25],
  [560, 14, 158, 112, 2.25],
  [620, 16, 153, 110, 2.3],
  [680, 16, 156, 108, 2.35],
  [720, 15, 165, 106, 2.4],
  [780, 14, 175, 104, 2.45],
  [840, 14, 182, 104, 2.5],
  [880, 15, 183, 104, 2.5],
  [915, 17, 176, 101, 2.4],
  [935, 20, 150, 92, 2.2],
];

/** [z, yağ ön, yan, arka, kas ön, yan, arka] (orta habitus) */
const LAYERS = [
  [205, 5, 7, 7, 0, 0, 0],
  [285, 7, 9, 8, 0, 0, 0],
  [300, 9, 12, 8, 16, 14, 26],
  [330, 10, 14, 8, 18, 14, 28],
  [400, 10, 15, 9, 18, 13, 30],
  [480, 14, 18, 10, 14, 13, 30],
  [560, 20, 22, 12, 12, 14, 30],
  [640, 24, 26, 14, 12, 16, 32],
  [720, 24, 28, 14, 12, 18, 30],
  [780, 24, 28, 16, 14, 30, 38],
  [860, 22, 26, 18, 14, 34, 42],
  [935, 20, 24, 18, 14, 30, 40],
];

export const HABITUS_FAT: Record<PhantomConfig['habitus'], number> = { small: 0.45, medium: 1, large: 2.2 };

export interface Ell {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  n: number;
}

export interface TorsoLayers {
  skin: Ell;
  fat: Ell; // deri altı yağ başlangıcı (deri içi)
  muscle: Ell;
  cavity: Ell;
  /** sırt (masa teması) y değeri */
  backY: number;
  antY: number;
}

export const TORSO_Z0 = 205;
export const TORSO_Z1 = 935;

function inset(e: Ell, ant: number, lat: number, post: number): Ell {
  return { cx: e.cx, cy: e.cy + (ant - post) / 2, rx: e.rx - lat, ry: e.ry - (ant + post) / 2, n: e.n };
}

/** Gövde katmanları – habitus ölçeklemesi kas duvarı korunarak yağ ile yapılır. */
export function torsoAt(z: number, fatScale: number): TorsoLayers | null {
  if (z < TORSO_Z0 || z > TORSO_Z1) return null;
  const base: Ell = { cx: 0, cy: interpTable(OUTLINE, z, 1), rx: interpTable(OUTLINE, z, 2), ry: interpTable(OUTLINE, z, 3), n: interpTable(OUTLINE, z, 4) };
  const fa = interpTable(LAYERS, z, 1), fl = interpTable(LAYERS, z, 2), fp = interpTable(LAYERS, z, 3);
  const ma = interpTable(LAYERS, z, 4), ml = interpTable(LAYERS, z, 5), mp = interpTable(LAYERS, z, 6);
  // kas duvarı (habitustan bağımsız)
  const muscle = inset(base, fa + 2, fl + 2, fp + 2);
  // yeni dış yüzey: kas + ölçekli yağ + deri; sırt masaya oturacak biçimde
  const k = fatScale;
  const skin: Ell = {
    cx: 0,
    cy: muscle.cy - ((fa - fp) * k) / 2,
    rx: muscle.rx + fl * k + 2,
    ry: muscle.ry + ((fa + fp) * k) / 2 + 2,
    n: base.n,
  };
  // sırtı masaya yasla (yumuşak doku sıkışması)
  const back = skin.cy + skin.ry;
  const shift = Math.min(0, TABLE_TOP_Y + 2 - back);
  skin.cy += shift;
  muscle.cy += shift;
  const fat = inset(skin, 2, 2, 2);
  const cavity = inset(muscle, ma, ml, mp);
  return { skin, fat, muscle, cavity, backY: skin.cy + skin.ry, antY: skin.cy - skin.ry };
}

/** Superelips sınırında açıyla nokta (φ: 0 = +x, π/2 = +y posterior). */
export function ellPt(e: Ell, phi: number, grow = 0): [number, number] {
  const c = Math.cos(phi), s = Math.sin(phi);
  const n = e.n;
  const r = Math.pow(Math.pow(Math.abs(c) / (e.rx + grow), n) + Math.pow(Math.abs(s) / (e.ry + grow), n), -1 / n);
  return [e.cx + r * c, e.cy + r * s];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Basit tohumlu rastgele. */
export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { interpTable };
