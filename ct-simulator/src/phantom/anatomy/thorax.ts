/**
 * Toraks: kalp ve büyük damarlar, hava yolları, pulmoner damar/bronş ağaçları,
 * özofagus, sternum, kaburgalar ve kostal kıkırdaklar, klavikulalar, skapulalar,
 * humerus başları, lenf nodları.
 */
import { axisEllipsoid, ell, ellipsoid, ellipsoidSection, props, seg, smoothPath, structure, tube, type TubePt } from '../primitives';
import type { PaintProps, PhantomConfig, Structure } from '../types';
import { interpTable, spineY, torsoAt, vert } from './common';
import { growTree } from './lungTree';

const pCort = () => props('corticalBone');
const pTrab = (seed = 61) => props('trabecularBone', { comp: 'marrow', tex: { kind: 'trab', amp: 0.7, scale: 1.3, seed } });

export function heart(): Structure[] {
  const out: Structure[] = [];
  const dir: [number, number, number] = [0.55, -0.55, 0.62];
  const c: [number, number, number] = [18, -12, 452];
  out.push(ellipsoid('perikard yağı', axisEllipsoid(c, dir, [62, 50, 46]), props('fat')));
  out.push(ellipsoid('perikard', axisEllipsoid(c, dir, [59.5, 47.5, 43.5]), props('softTissue')));
  out.push(ellipsoid('epikardiyal yağ', axisEllipsoid(c, dir, [58.5, 46.5, 42.5]), props('fat')));
  out.push(ellipsoid('miyokard', axisEllipsoid(c, dir, [56, 45, 40.5]), props('myocardium', { comp: 'myocardium' })));
  out.push(ellipsoid('sağ atriyum', { c: [-36, -2, 448], r: [24, 23, 32] }, props('blood', { comp: 'rightHeart' })));
  out.push(ellipsoid('sağ ventrikül', axisEllipsoid([2, -36, 458], [0.62, -0.25, 0.74], [38, 22, 11], 20), props('blood', { comp: 'rightHeart' })));
  out.push(ellipsoid('sol atriyum', { c: [10, 26, 428], r: [32, 16, 19] }, props('blood', { comp: 'leftHeart' })));
  out.push(ellipsoid('sol ventrikül', axisEllipsoid([30, -14, 462], dir, [34, 19, 17]), props('blood', { comp: 'leftHeart' })));
  // papiller kaslar (kontrastlı incelemede dolum defekti)
  out.push(ellipsoid('papiller kas', { c: [42, -22, 478], r: [5, 5, 9] }, props('myocardium', { comp: 'myocardium' })));
  // koroner arter kalsifikasyonu (LAD proksimal) – yaşla ilişkili, küçük
  out.push(tube('LAD', smoothPath([[8, -42, 432, 1.8], [22, -50, 450, 1.6], [42, -48, 480, 1.3], [58, -38, 505, 1]]), props('blood', { comp: 'artery' })));
  out.push(ellipsoid('koroner kalsifikasyon', { c: [12, -45, 437], r: [2.2, 2, 2.5] }, props('cartilageCalc', {})));
  out.push(tube('RCA', smoothPath([[-18, -30, 438, 1.8], [-42, -30, 455, 1.6], [-50, -10, 478, 1.4], [-40, 10, 500, 1.2]]), props('blood', { comp: 'artery' })));
  return out;
}

export function greatVessels(): Structure[] {
  const out: Structure[] = [];
  const art = props('blood', { comp: 'aorta' });
  const aortaPts: TubePt[] = [
    [6, -4, 446, 15],
    [3, -8, 412, 16],
    [-2, -10, 376, 16],
    [0, -6, 354, 14],
    [10, 8, 344, 13],
    [20, 28, 346, 12.5],
    [24, 46, 362, 12],
    [22, 56, 410, 12],
    [18, 58, 470, 11.5],
    [10, 50, 535, 11],
    [5, 36, 590, 10.5],
    [4, 26, 640, 10],
    [3, 24, 690, 9.2],
    [2, 22, 708, 8.5],
  ];
  out.push(tube('aorta', smoothPath(aortaPts, 3), art));
  for (const s of [-1, 1]) {
    out.push(
      tube('iliak arter', smoothPath([
        [s * 4, 22, 706, 7],
        [s * 22, 18, 740, 6.2],
        [s * 42, 10, 785, 5.6],
        [s * 58, -10, 830, 5.2],
        [s * 68, -32, 870, 5],
        [s * 72, -40, 910, 4.6],
        [s * 76, -30, 1000, 4.2],
        [s * 80, -10, 1150, 3.8],
        [s * 84, 15, 1280, 3.5],
      ], 3), props('blood', { comp: 'artery' })),
    );
    out.push(tube('internal iliak', [[s * 40, 12, 782, 3.5], [s * 48, 40, 805, 3], [s * 55, 55, 830, 2.4]], props('blood', { comp: 'artery' })));
    out.push(
      tube('iliak ven', smoothPath([
        [s * 6, 26, 712, 9],
        [s * 26, 26, 745, 7.5],
        [s * 44, 20, 790, 7],
        [s * 54, -2, 835, 6.8],
        [s * 60, -26, 872, 6.5],
        [s * 62, -36, 910, 6.2],
        [s * 66, -24, 1000, 5.5],
        [s * 72, -4, 1150, 5],
        [s * 76, 22, 1280, 4.5],
      ], 3), props('blood', { comp: 'vein' })),
    );
  }
  // Arkus dalları
  out.push(tube('brakiyosefalik arter', smoothPath([[-4, -8, 352, 7], [-12, -8, 330, 6.5], [-18, -2, 312, 6]]), art));
  out.push(tube('sağ subklavyen arter', smoothPath([[-18, -2, 312, 5], [-34, 8, 306, 4.5], [-70, 22, 302, 4], [-110, 32, 306, 3.6], [-150, 42, 312, 3.4]]), art));
  out.push(tube('sol subklavyen arter', smoothPath([[14, 12, 348, 5.5], [24, 22, 320, 5], [50, 26, 306, 4.5], [100, 32, 304, 3.8], [150, 42, 312, 3.4]]), art));
  for (const s of [-1, 1]) {
    const start: TubePt = s < 0 ? [-18, -2, 312, 4.5] : [6, -4, 348, 4.8];
    out.push(
      tube('ana karotis', smoothPath([start, [s * 20, 0, 300, 4.2], [s * 22, 2, 270, 4], [s * 21, 4, 245, 4.2]]), art),
    );
    out.push(tube('internal karotis', smoothPath([[s * 21, 4, 245, 3.4], [s * 22, 12, 210, 3], [s * 24, 18, 180, 2.8], [s * 22, 12, 155, 2.6], [s * 15, 2, 135, 2.4], [s * 13, -4, 118, 2.2]]), art));
    out.push(tube('eksternal karotis', smoothPath([[s * 23, 0, 245, 2.8], [s * 28, -6, 215, 2.4], [s * 35, -2, 185, 2]]), art));
    out.push(tube('vertebral arter', smoothPath([[s * 30, 18, 312, 2], [s * 18, 32, 290, 2], [s * 20, 32, 220, 2], [s * 22, 34, 175, 2], [s * 10, 40, 165, 1.8], [s * 3, 34, 150, 1.8]]), art));
    out.push(tube('internal juguler ven', smoothPath([[s * 26, -6, 318, 7], [s * 32, 6, 290, 7.5], [s * 34, 10, 250, 7], [s * 36, 14, 210, 6.5], [s * 40, 28, 175, 6], [s * 42, 40, 158, 5]]), props('blood', { comp: s < 0 ? 'svc' : 'vein' })));
  }
  // Pulmoner arterler
  const pa = props('blood', { comp: 'pulmArtery' });
  out.push(tube('pulmoner trunkus', smoothPath([[12, -42, 432, 13], [14, -26, 410, 14], [12, -6, 396, 13]]), pa));
  out.push(tube('sol pulmoner arter', smoothPath([[12, -6, 396, 11], [32, 12, 392, 10.5], [50, 24, 396, 8.5]]), pa));
  out.push(tube('sağ pulmoner arter', smoothPath([[12, -6, 396, 11], [-12, 8, 400, 10.5], [-36, 16, 402, 9.5], [-48, 20, 405, 8.5]]), pa));
  // Pulmoner venler
  for (const [sx, z] of [[-1, 418], [-1, 438], [1, 416], [1, 436]] as const) {
    out.push(tube('pulmoner ven', [[sx * 18, 28, z + 4, 5.5], [sx * 38, 26, z, 6], [sx * 52, 26, z - 4, 5]], props('blood', { comp: 'pulmVein' })));
  }
  // Venler
  out.push(tube('SVC', smoothPath([[-28, -10, 314, 8.5], [-30, -6, 350, 9.5], [-32, -2, 395, 10], [-34, 0, 425, 10]]), props('blood', { comp: 'svc' })));
  out.push(tube('sağ brakiyosefalik ven', smoothPath([[-28, -10, 314, 8], [-34, -2, 300, 7], [-60, 12, 300, 6], [-110, 34, 312, 5], [-150, 46, 318, 4.5]]), props('blood', { comp: 'svc' })));
  out.push(tube('sol brakiyosefalik ven', smoothPath([[-26, -12, 318, 6.5], [-4, -24, 316, 6], [22, -18, 310, 6], [48, 2, 302, 6], [100, 30, 310, 5], [150, 46, 318, 4.5]]), props('blood', { comp: 'vein' })));
  out.push(
    tube('IVC', smoothPath([
      [-30, 8, 468, 12],
      [-24, 24, 500, 12],
      [-22, 32, 540, 11.5],
      [-20, 32, 580, 11],
      [-18, 30, 615, 11],
    ], 3), props('blood', { comp: 'ivcSupra' })),
  );
  out.push(tube('IVC infrarenal', smoothPath([[-18, 30, 612, 11], [-16, 28, 650, 10.5], [-12, 27, 690, 10], [-6, 27, 712, 9.5]], 3), props('blood', { comp: 'ivcInfra' })));
  out.push(tube('azigos', smoothPath([[-8, 70, 560, 3.5], [-10, 70, 470, 4], [-12, 64, 400, 4.5], [-20, 40, 384, 4.5], [-30, 4, 380, 4.5]]), props('blood', { comp: 'vein' })));
  out.push(tube('hemiazigos', smoothPath([[14, 70, 560, 2.8], [14, 72, 480, 3], [8, 74, 440, 3]]), props('blood', { comp: 'vein' })));
  return out;
}

export function airways(): Structure[] {
  const out: Structure[] = [];
  const air = props('air');
  const cart = props('cartilage');
  const tr: TubePt[] = smoothPath([
    [0, -14, 276, 9],
    [0, -6, 300, 9.5],
    [1, 6, 330, 9.5],
    [2, 18, 355, 9],
    [2, 28, 372, 8.5],
  ]);
  out.push(tube('trakea', tr, cart, { lumen: [air, 2], caps: false }));
  out.push(tube('sağ ana bronş', smoothPath([[2, 28, 372, 8], [-14, 34, 380, 7.5], [-30, 36, 388, 7], [-42, 32, 396, 6]]), cart, { lumen: [air, 1.8] }));
  out.push(tube('sol ana bronş', smoothPath([[2, 28, 372, 8], [18, 36, 382, 7], [34, 40, 392, 6.5], [46, 34, 402, 5.5]]), cart, { lumen: [air, 1.6] }));
  return out;
}

export function lungTrees(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const art = props('blood', { comp: 'pulmArtery', maskMaxW: 0.5 });
  const vein = props('blood', { comp: 'pulmVein', maskMaxW: 0.5 });
  const wall = props('softTissue', { maskMaxW: 0.5 });
  const air = props('air', { maskMaxW: 0.5 });
  const arteries = growTree(cfg.seed * 13 + 1, 6.5, 0.75, 128, 7);
  const veins = growTree(cfg.seed * 13 + 7, 6, 0.75, 96, 7, [0, 8, 14]);
  const bronchi = growTree(cfg.seed * 13 + 1, 5.2, 0.72, 96, 4, [3, -3, 2]);
  for (const s of arteries) out.push(tube('pulmoner arter dalı', s.pts, art));
  for (const s of veins) out.push(tube('pulmoner ven dalı', s.pts, vein));
  for (const s of bronchi) {
    const pts = s.pts.map((p): TubePt => [p[0], p[1], p[2], p[3] * 0.9 + 1.0]);
    out.push(tube('bronş', pts, wall, { lumen: [air, 1.0 + 0.15 * (4 - s.gen)] }));
  }
  return out;
}

export function esophagus(): Structure[] {
  const pts = smoothPath([
    [0, 6, 268, 7],
    [2, 14, 300, 7.5],
    [4, 30, 340, 7.5],
    [7, 44, 380, 7.5],
    [10, 50, 430, 8],
    [14, 50, 480, 8],
    [24, 42, 520, 8.5],
    [38, 28, 545, 9],
  ]);
  return [tube('özofagus', pts, props('stomachWall', { comp: 'stomachWall' }), { lumen: [props('air'), 6] })];
}

export function lymphNodes(): Structure[] {
  const p = props('lymph', { comp: 'lymph' });
  const nodes: [number, number, number, number, number, number][] = [
    [0, 46, 392, 9, 7, 7],
    [-16, 4, 352, 6, 5, 6],
    [-24, 22, 380, 5, 4, 5],
    [26, 10, 360, 5, 4, 5],
    [-20, 40, 640, 5, 4, 7],
    [24, 36, 660, 5, 4, 7],
    [30, 40, 690, 4, 4, 6],
    [-40, 20, 780, 5, 4, 7],
    [42, 18, 790, 5, 4, 7],
  ];
  return nodes.map(([x, y, z, a, b, c]) => ellipsoid('lenf nodu', { c: [x, y, z], r: [a, b, c] }, p));
}

/* ------------------------------------------------------------------------ */
/* Kemikler                                                                  */
/* ------------------------------------------------------------------------ */

/** Kaburga yolu (tek taraf, s=±1): her nokta [x,y,z,r] */
function ribPath(i: number, s: number): TubePt[] {
  const v = vert('T' + i);
  const zHead = v.zTop + 2;
  const drop = [0, 30, 62, 84, 98, 108, 114, 116, 110, 100, 88, 62, 38][i];
  const phiEnd = [0, 150, 158, 160, 160, 158, 155, 150, 140, 128, 118, 100, 78][i] * (Math.PI / 180);
  const phi0 = 18 * (Math.PI / 180);
  const r = i === 1 ? 4.6 : i >= 11 ? 3.2 : 4;
  const pts: TubePt[] = [];
  // baş: omur gövdesi yanı
  const sy0 = spineY(zHead);
  pts.push([s * (v.rx + 2), sy0 + 6, zHead, r * 0.9]);
  pts.push([s * (v.rx + 14), sy0 + 16, zHead + 1, r]);
  const N = 22;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const phi = phi0 + (phiEnd - phi0) * t;
    const z = zHead + 3 + drop * Math.pow(t, 1.15);
    const L = torsoAt(z, 1);
    if (!L) continue;
    const c = L.cavity;
    const widen = i <= 2 ? 0.72 + 0.12 * i : 1;
    // φ=0: posterior (+y), φ=π/2: lateral, φ=π: anterior
    const rr = Math.pow(Math.pow(Math.abs(Math.sin(phi)) / ((c.rx + 6) * widen), c.n) + Math.pow(Math.abs(Math.cos(phi)) / (c.ry + 5), c.n), -1 / c.n);
    pts.push([s * rr * Math.sin(phi), c.cy + rr * Math.cos(phi), z, r]);
  }
  return pts;
}

/** Kostal kıkırdak: kaburga ucundan sternum kenarına */
function cartilagePath(i: number, s: number, rib: TubePt[]): TubePt[] | null {
  if (i > 10) return null;
  const end = rib[rib.length - 1];
  const stZ = [0, 320, 346, 372, 396, 420, 444, 466, 482, 492, 500][i];
  const L = torsoAt(stZ, 1);
  if (!L) return null;
  const sy = L.skin.cy - L.skin.ry + 14;
  const mid: TubePt = [(end[0] + s * 14) / 2 + s * 8, (end[1] + sy) / 2 - 4, (end[2] + stZ) / 2 + (i >= 7 ? 6 : 0), 3.6];
  return smoothPath([[end[0], end[1], end[2], 3.8], mid, [s * 14, sy, stZ, 3.6]], 4);
}

export function ribs(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  void cfg;
  const marrow = pTrab(62);
  for (let i = 1; i <= 12; i++) {
    for (const s of [-1, 1]) {
      const p = ribPath(i, s);
      out.push(tube(`kaburga ${i}`, smoothPath(p, 2), pCort(), { lumen: [marrow, 1.3], maxElong: 6 }));
      const cp = cartilagePath(i, s, p);
      if (cp) out.push(tube('kostal kıkırdak', cp, props(i % 3 === 0 ? 'cartilageCalc' : 'cartilage'), { maxElong: 6 }));
    }
  }
  return out;
}

export function sternum(): Structure[] {
  return [
    structure('sternum', 314, 505, (z, o) => {
      const L = torsoAt(z, 1);
      if (!L) return;
      const y = L.muscle.cy - L.muscle.ry + 7;
      const hw = interpTable([[314, 26], [340, 28], [352, 18], [400, 15], [460, 16], [472, 9], [505, 4]], z, 1);
      const th = interpTable([[314, 8], [352, 6.5], [470, 6], [505, 3]], z, 1);
      o.push({ shape: ell(0, y, hw, th, 0, 2.6), p: pCort() });
      if (hw > 4) o.push({ shape: ell(0, y, hw - 1.6, th - 1.6, 0, 2.6), p: pTrab(64) });
      if (Math.abs(z - 351) < 1.5) o.push({ shape: ell(0, y, hw, 2), p: props('cartilage') });
    }),
  ];
}

export function shoulderGirdle(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  for (const s of [-1, 1]) {
    out.push(tube('klavikula', smoothPath([[s * 16, -70, 316, 8], [s * 50, -66, 310, 7], [s * 100, -42, 302, 6.5], [s * 140, -6, 296, 7], [s * 158, 16, 296, 8]], 4), pCort(), { lumen: [pTrab(66), 2] }));
    // skapula
    out.push(
      structure('skapula', 288, 478, (z, o) => {
        const L = torsoAt(Math.max(305, z), 1);
        if (!L) return;
        const back = L.backY;
        if (z >= 305) {
          const med = interpTable([[305, 66], [400, 72], [450, 78], [478, 86]], z, 1);
          const lat = interpTable([[305, 146], [340, 138], [400, 124], [450, 104], [478, 90]], z, 1);
          const ym = back - 20, yl = back - 56;
          o.push({ shape: seg(s * med, ym, s * lat, yl, 2.4), p: pCort() });
          // lateral kenar kalın
          o.push({ shape: ell(s * lat, yl, 5, 5), p: pCort() });
          if (z < 330) {
            // spina skapula
            o.push({ shape: seg(s * (med + 4), ym + 4, s * (lat - 10), back - 16, 4), p: pCort() });
            // glenoid ve boyun
            o.push({ shape: ell(s * 148, 34, 10, 17), p: pCort() });
            o.push({ shape: ell(s * 148, 34, 8, 15), p: pTrab(67) });
          }
        } else {
          // akromion
          o.push({ shape: seg(s * 125, 92, s * 162, 46, 6), p: pCort() });
          o.push({ shape: seg(s * 125, 92, s * 162, 46, 4.4), p: pTrab(68) });
        }
        if (z > 306 && z < 322) o.push({ shape: seg(s * 132, 30, s * 116, 2, 5), p: pCort() }); // korakoid
      }),
    );
    // humerus başı
    const hh = ellipsoidSection({ c: [s * 168, 40, cfg.arms === 'up' ? 306 : 318], r: [23, 23, 24] });
    const hhi = ellipsoidSection({ c: [s * 168, 40, cfg.arms === 'up' ? 306 : 318], r: [21.5, 21.5, 22.5] });
    out.push(
      structure('humerus başı', hh.zMin, hh.zMax, (z, o) => {
        const a = hh.at(z), b = hhi.at(z);
        if (a) o.push({ shape: a, p: pCort() });
        if (b) o.push({ shape: b, p: pTrab(69) });
      }),
    );
  }
  return out;
}

export function thoraxBones(cfg: PhantomConfig): Structure[] {
  return [...ribs(cfg), ...sternum(), ...shoulderGirdle(cfg)];
}

export type { PaintProps };
