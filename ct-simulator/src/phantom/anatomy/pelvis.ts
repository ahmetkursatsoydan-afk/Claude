/**
 * Pelvis: iliak kanatlar (krista → asetabulum), asetabulum, femur başı/boynu/trokanterler/
 * cisim, pubis ve iskiyum, mesane (geç fazda kontrast tabakalaşması), prostat, seminal veziküller.
 */
import { ell, ellipsoid, ellipsoidSection, props, seg, smoothPath, structure, tube } from '../primitives';
import type { Paint, PhantomConfig, Structure } from '../types';
import { lerp } from './common';

const pCort = props('corticalBone');
const pTrab = props('trabecularBone', { comp: 'marrow', tex: { kind: 'trab', amp: 0.75, scale: 1.3, seed: 91 } });
const pTrabD = props('trabecularDense', { tex: { kind: 'trab', amp: 0.5, scale: 1.3, seed: 92 } });
const pMarrow = props('marrowFat');

/** İliak kanat anahtarları: z, [P(x,y)], [M(x,y)], [A(x,y)], kalınlık */
const ILIUM: [number, number, number, number, number, number, number, number][] = [
  [690, 62, 96, 104, 62, 112, 22, 6],
  [698, 56, 98, 112, 56, 122, 8, 13],
  [720, 50, 96, 112, 50, 124, -2, 7],
  [750, 48, 92, 106, 44, 120, -8, 6],
  [780, 52, 86, 98, 38, 112, -6, 9],
  [805, 58, 80, 88, 36, 102, 2, 15],
  [830, 64, 70, 80, 34, 92, 12, 22],
  [850, 70, 60, 78, 30, 86, 18, 22],
];

function iliumAt(z: number) {
  if (z < ILIUM[0][0] || z > ILIUM[ILIUM.length - 1][0]) return null;
  let i = 0;
  while (i < ILIUM.length - 2 && z > ILIUM[i + 1][0]) i++;
  const a = ILIUM[i], b = ILIUM[i + 1];
  const t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  const L = (j: number) => lerp(a[j], b[j], t);
  return { P: [L(1), L(2)], M: [L(3), L(4)], A: [L(5), L(6)], th: L(7) };
}

function boneBand(o: Paint[], pts: number[][], s: number, th: number) {
  for (let k = 0; k < pts.length - 1; k++) o.push({ shape: seg(s * pts[k][0], pts[k][1], s * pts[k + 1][0], pts[k + 1][1], th / 2), p: pCort });
  if (th > 4.5) for (let k = 0; k < pts.length - 1; k++) o.push({ shape: seg(s * pts[k][0], pts[k][1], s * pts[k + 1][0], pts[k + 1][1], th / 2 - 1.5), p: pTrab });
}

export function pelvisBones(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const hip = (s: number) => cfg.implant === 'hipBilateral' || (cfg.implant === 'hipRight' && s < 0);
  for (const s of [-1, 1]) {
    out.push(
      structure('iliak kemik', 688, 852, (z, o) => {
        const a = iliumAt(z);
        if (!a) return;
        boneBand(o, [a.P, a.M, a.A], s, a.th);
      }),
    );
    // Asetabulum (medial yarı) + eklem kıkırdağı + femur başı
    const hc: [number, number, number] = [s * 90, 6, 868];
    const acet = ellipsoidSection({ c: [s * 86, 6, 866], r: [33, 36, 34] });
    const acetIn = ellipsoidSection({ c: [s * 86, 6, 866], r: [31, 34, 32] });
    const clipMed = [{ nx: s, ny: 0, d: s * s * 96 }]; // s·x ≤ 96
    out.push(
      structure('asetabulum', acet.zMin, acet.zMax, (z, o) => {
        const e1 = acet.at(z), e2 = acetIn.at(z);
        if (e1) o.push({ shape: e1, p: pCort, clip: clipMed });
        if (e2) o.push({ shape: e2, p: pTrabD, clip: clipMed });
      }),
    );
    out.push(ellipsoid('eklem aralığı', { c: hc, r: [26, 26, 26] }, props('cartilage')));
    if (!hip(s)) {
      out.push(ellipsoid('femur başı korteks', { c: hc, r: [24, 24, 24] }, pCort));
      out.push(ellipsoid('femur başı', { c: hc, r: [22.6, 22.6, 22.6] }, pTrab));
      // fovea
      out.push(ellipsoid('fovea', { c: [s * 70, 6, 872], r: [3, 4, 4] }, props('softTissue')));
    }
    out.push(tube('femur boynu', [[s * 96, 6, 872, 16], [s * 112, 10, 884, 15], [s * 122, 12, 896, 16]], pCort, { lumen: [pTrab, 2] }));
    out.push(ellipsoid('büyük trokanter', { c: [s * 132, 18, 890], r: [18, 22, 24] }, pCort));
    out.push(ellipsoid('büyük trokanter iç', { c: [s * 132, 18, 890], r: [16.5, 20.5, 22.5] }, pTrab));
    out.push(ellipsoid('küçük trokanter', { c: [s * 108, 30, 918], r: [9, 9, 11] }, pCort));
    out.push(
      tube('femur cismi', smoothPath([
        [s * 124, 14, 900, 17],
        [s * 118, 12, 950, 15],
        [s * 110, 8, 1030, 14],
        [s * 100, 8, 1130, 14],
        [s * 92, 12, 1220, 16],
        [s * 88, 18, 1290, 24],
        [s * 88, 20, 1315, 26],
      ], 3), pCort, { lumen: [pMarrow, 5.5] }),
    );
    // tibia (topogram/uzun FOV için)
    out.push(tube('tibia', smoothPath([[s * 84, 22, 1330, 24], [s * 82, 14, 1380, 17], [s * 80, 10, 1500, 12], [s * 80, 18, 1700, 14]], 3), pCort, { lumen: [pMarrow, 4] }));
    out.push(tube('fibula', [[s * 110, 34, 1350, 7], [s * 108, 34, 1500, 6], [s * 106, 36, 1700, 7]], pCort));
    out.push(ellipsoid('patella', { c: [s * 88, -30, 1295], r: [20, 9, 22] }, pCort));
    // Pubis ve iskiyum
    out.push(tube('üst pubik ramus', smoothPath([[s * 76, -14, 866, 10], [s * 50, -40, 876, 9], [s * 14, -58, 884, 9]]), pCort, { lumen: [pTrab, 2] }));
    out.push(
      structure('simfiz', 868, 908, (_z, o) => {
        o.push({ shape: ell(s * 10, -60, 8.5, 14), p: pCort });
        o.push({ shape: ell(s * 10, -60, 7, 12.5), p: pTrab });
      }),
    );
    out.push(tube('alt pubik ramus', smoothPath([[s * 10, -54, 906, 7], [s * 34, -34, 918, 7], [s * 52, 10, 926, 8]]), pCort, { lumen: [pTrab, 2] }));
    out.push(tube('iskiyum', smoothPath([[s * 74, 30, 872, 15], [s * 68, 38, 900, 14], [s * 60, 36, 926, 13]]), pCort, { lumen: [pTrab, 2] }));
  }
  return out;
}

export function pelvicOrgans(): Structure[] {
  const out: Structure[] = [];
  out.push(ellipsoid('mesane duvarı', { c: [0, -36, 862], r: [44, 34, 33] }, props('bowelWall', { comp: 'bowelWall' })));
  out.push(ellipsoid('mesane', { c: [0, -36, 862], r: [41, 31, 30] }, props('urine')));
  // geç fazda yoğun kontrastın bağımlı (posterior) kısımda tabakalaşması
  out.push(ellipsoid('mesane kontrast tabakası', { c: [0, -36, 862], r: [41, 31, 30] }, props('urine', { comp: 'bladderLayer' }), [{ nx: 0, ny: -1, d: 26 }]));
  out.push(ellipsoid('prostat', { c: [0, -18, 902], r: [19, 15, 17] }, props('prostate', { comp: 'prostate', tex: { kind: 'noise', amp: 0.02, scale: 3, seed: 95 } })));
  out.push(ellipsoid('prostat kalsifikasyonu', { c: [3, -16, 898], r: [1.5, 1.5, 1.5] }, props('cartilageCalc')));
  for (const s of [-1, 1]) {
    out.push(ellipsoid('seminal vezikül', { c: [s * 18, 6, 882], r: [15, 6, 7], rot: [0, 0, s * 15] }, props('water')));
    out.push(tube('spermatik kord', [[s * 60, -50, 880, 6], [s * 40, -70, 930, 6]], props('fatDirty')));
  }
  return out;
}

export function pelvis(cfg: PhantomConfig): Structure[] {
  return [...pelvicOrgans(), ...pelvisBones(cfg)];
}
