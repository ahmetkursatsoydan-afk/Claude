/**
 * Gövde duvarı (deri, deri altı yağ, kas), toraks ve batın boşlukları, diyafram kubbeleri,
 * mediasten yağı, sırt/psoas/gluteal kaslar, uyluklar, bacaklar ve kollar.
 */
import { ell, ellipsoid, ellipsoidSection, props, structure, tube, type TubePt } from '../primitives';
import type { PhantomConfig, Structure } from '../types';
import { HABITUS_FAT, TORSO_Z0, TORSO_Z1, interpTable, spineY, torsoAt } from './common';

const lungTex = { kind: 'lung' as const, amp: 0.1, scale: 2.2, seed: 11, grad: 0.0016 };

export function bodyWall(cfg: PhantomConfig): Structure[] {
  const k = HABITUS_FAT[cfg.habitus];
  const pSkin = props('skin', { comp: 'skin' });
  const pFat = props('fat');
  const pMus = props('muscle', { comp: 'muscle' });
  const pLung = props('lung', { comp: 'lung', tex: lungTex });
  const pAbd = props('fatDirty', { tex: { kind: 'noise', amp: 0.02, scale: 3, seed: 9 } });
  const pPelvFat = props('fatDirty', { tex: { kind: 'noise', amp: 0.02, scale: 3, seed: 19 } });
  const out: Structure[] = [];
  out.push(
    structure('gövde duvarı', TORSO_Z0, TORSO_Z1, (z, o) => {
      const L = torsoAt(z, k);
      if (!L) return;
      const e = (q: typeof L.skin, sx = 1, sy = 1, dy = 0) => ell(q.cx, q.cy + dy, q.rx * sx, q.ry * sy, 0, q.n);
      o.push({ shape: e(L.skin), p: pSkin });
      o.push({ shape: e(L.fat), p: pFat });
      o.push({ shape: e(L.muscle), p: pMus });
      // Boşluklar
      if (z >= 330 && z <= 628) {
        const f = interpTable([[330, 0.78], [350, 0.9], [372, 0.97], [395, 1]], z, 1);
        const fy = interpTable([[330, 0.72], [350, 0.86], [372, 0.95], [395, 1]], z, 1);
        o.push({ shape: e(L.cavity, f, fy, (1 - fy) * 18), p: pLung });
      }
      if (z >= 600 && z <= 920) {
        const pel = z > 760;
        const f = interpTable([[600, 1], [880, 1], [920, 0.6]], z, 1);
        o.push({ shape: e(L.cavity, f, f), p: pel ? pPelvFat : pAbd });
      }
    }),
  );
  // Akciğer apeksleri
  for (const s of [-1, 1]) {
    out.push(ellipsoid('akciğer apeksi', { c: [s * 44, 34, 345], r: [40, 40, 58] }, pLung));
  }
  return out;
}

/** Diyafram kubbeleri (karın içeriği akciğerin altında) – toraks boşluğu ile sınırlı */
export function diaphragm(): Structure[] {
  const pMus = props('muscle', { comp: 'muscle' });
  const pAbd = props('fatDirty', { tex: { kind: 'noise', amp: 0.02, scale: 3, seed: 9 } });
  const out: Structure[] = [];
  const domes: [number, number, number][] = [
    [-48, 0, 652],
    [52, 4, 667],
  ];
  for (const [x, y, zc] of domes) {
    const outer = ellipsoidSection({ c: [x, y, zc], r: [120, 114, 156] });
    const inner = ellipsoidSection({ c: [x, y, zc], r: [116, 110, 152] });
    out.push(
      structure('diyafram', outer.zMin, 640, (z, o) => {
        const L = torsoAt(z, 1);
        if (!L) return;
        const cav = ell(L.cavity.cx, L.cavity.cy, L.cavity.rx + 0.5, L.cavity.ry + 0.5, 0, L.cavity.n);
        const a = outer.at(z), b = inner.at(z);
        if (a) o.push({ shape: a, p: pMus, within: cav });
        if (b) o.push({ shape: b, p: pAbd, within: cav });
      }),
    );
  }
  // Krura (aortanın önünde) – arka orta hat
  for (const s of [-1, 1]) {
    out.push(
      tube('diyafram krusu', [
        [s * 14, 45, 520, 5],
        [s * 18, 48, 560, 7],
        [s * 16, 45, 600, 8],
        [s * 14, 45, 640, 6],
      ], pMus),
    );
  }
  return out;
}

export function mediastinumFat(): Structure[] {
  const pFat = props('fat', { tex: { kind: 'noise', amp: 0.03, scale: 3, seed: 21 } });
  const out: Structure[] = [];
  const keys: [number, number, number, number, number][] = [
    [322, 0, 20, 24, 40],
    [345, 0, 14, 32, 54],
    [370, 3, 10, 40, 60],
    [395, 8, 6, 44, 60],
    [420, 12, 0, 46, 58],
    [450, 14, -4, 50, 58],
    [480, 14, -2, 50, 54],
    [505, 10, 4, 40, 44],
    [522, 6, 10, 24, 28],
  ];
  out.push(
    structure('mediasten', keys[0][0], keys[keys.length - 1][0], (z, o) => {
      let i = 0;
      while (i < keys.length - 2 && z > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[i + 1];
      const t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
      const L = (j: number) => a[j] + (b[j] - a[j]) * t;
      o.push({ shape: ell(L(1), L(2), L(3), L(4), 0, 2.2), p: pFat });
    }),
  );
  // arka mediasten (aorta/özofagus çevresi)
  out.push(
    structure('arka mediasten', 330, 560, (z, o) => {
      const sy = spineY(z);
      o.push({ shape: ell(8, sy - 28, 30, 22), p: pFat });
    }),
  );
  // timus yağı (ön mediasten)
  out.push(ellipsoid('timus (yağlı involüsyon)', { c: [0, -50, 360], r: [28, 14, 36] }, pFat));
  return out;
}

export function trunkMuscles(): Structure[] {
  const pMus = props('muscle', { comp: 'muscle' });
  const pFat = props('fat');
  const out: Structure[] = [];
  // Paraspinal (erektör spina) – arka gövde
  for (const s of [-1, 1]) {
    const pts: TubePt[] = [];
    for (let z = 280; z <= 790; z += 30) {
      const sy = spineY(z);
      const r = interpTable([[280, 14], [330, 18], [450, 19], [560, 22], [650, 26], [740, 24], [790, 16]], z, 1);
      pts.push([s * (28 + r * 0.45), sy + 32 + r * 0.55, z, r]);
    }
    out.push(tube('paraspinal kaslar', pts, pMus));
    // multifidus–longissimus arası yağ planı
    const fp: TubePt[] = pts.map((p) => [p[0] + s * p[3] * 0.25, p[1] + 2, p[2], 1.2]);
    out.push(tube('paraspinal yağ planı', fp, pFat));
  }
  // Psoas – T12'den femura
  for (const s of [-1, 1]) {
    out.push(
      tube('psoas', [
        [s * 24, 58, 555, 4],
        [s * 30, 56, 600, 10],
        [s * 38, 50, 650, 16],
        [s * 46, 46, 700, 21],
        [s * 54, 42, 740, 23],
        [s * 66, 25, 790, 22],
        [s * 76, 2, 840, 20],
        [s * 78, -16, 880, 18],
        [s * 80, -14, 915, 14],
        [s * 86, 0, 945, 9],
      ], pMus),
    );
    out.push(
      tube('quadratus lumborum', [
        [s * 52, 82, 575, 6],
        [s * 60, 86, 620, 13],
        [s * 66, 84, 680, 14],
        [s * 70, 80, 715, 8],
      ], pMus),
    );
    out.push(ellipsoid('iliakus', { c: [s * 88, 14, 768], r: [18, 16, 42] }, pMus));
    out.push(ellipsoid('obturator internus', { c: [s * 64, 18, 890], r: [10, 28, 30] }, pMus));
    // gluteal kaslar
    out.push(ellipsoid('gluteus medius', { c: [s * 122, 58, 775], r: [26, 42, 55] }, pMus));
    out.push(ellipsoid('gluteus maximus yağ planı', { c: [s * 78, 96, 870], r: [70, 33, 74] }, pFat));
    out.push(ellipsoid('gluteus maximus', { c: [s * 78, 96, 870], r: [67, 30, 72] }, pMus));
    // rektus abdominis (ön duvar, linea alba ile ayrık)
    out.push(
      structure('rektus kılıfı', 500, 900, (z, o) => {
        const L = torsoAt(z, 1);
        if (!L) return;
        const y = L.muscle.cy - L.muscle.ry + 6;
        const w = interpTable([[500, 30], [700, 38], [880, 26]], z, 1);
        o.push({ shape: ell(s * (w + 4), y, w, 6.5, 0, 2.2), p: pMus });
      }),
    );
  }
  // linea alba
  out.push(
    structure('linea alba', 520, 880, (z, o) => {
      const L = torsoAt(z, 1);
      if (!L) return;
      const y = L.muscle.cy - L.muscle.ry + 6;
      o.push({ shape: ell(0, y, 2.2, 7), p: props('tendon') });
    }),
  );
  return out;
}

/* ------------------------------------------------------------------------ */
/* Uyluklar ve bacaklar                                                      */
/* ------------------------------------------------------------------------ */

export const THIGH_KEYS: [number, number, number, number][] = [
  // z, cx(|x|), cy, r
  [895, 92, 20, 88],
  [940, 92, 18, 92],
  [1000, 90, 16, 85],
  [1100, 89, 15, 76],
  [1200, 87, 16, 64],
  [1280, 86, 18, 56],
  [1330, 86, 22, 52],
  [1400, 86, 26, 48],
  [1500, 86, 30, 44],
  [1600, 86, 34, 36],
  [1700, 86, 40, 26],
  [1745, 86, 45, 12],
];

export function legAt(z: number): { cx: number; cy: number; r: number } | null {
  if (z < THIGH_KEYS[0][0] || z > THIGH_KEYS[THIGH_KEYS.length - 1][0]) return null;
  return { cx: interpTable(THIGH_KEYS, z, 1), cy: interpTable(THIGH_KEYS, z, 2), r: interpTable(THIGH_KEYS, z, 3) };
}

export function legs(cfg: PhantomConfig): Structure[] {
  const k = HABITUS_FAT[cfg.habitus];
  const pSkin = props('skin', { comp: 'skin' });
  const pFat = props('fat');
  const pMus = props('muscle', { comp: 'muscle' });
  const pSeptum = props('fat');
  const z0 = THIGH_KEYS[0][0], z1 = THIGH_KEYS[THIGH_KEYS.length - 1][0];
  return [
    structure('bacaklar', z0, z1, (z, o) => {
      const g = legAt(z);
      if (!g) return;
      const fat = interpTable([[895, 18], [1100, 14], [1300, 8], [1700, 4]], z, 1) * k;
      const mr = g.r - 18; // kas yarıçapı (orta habitusta deri+yağ=18)
      const rr = mr + fat + 2;
      for (const s of [-1, 1]) {
        const cx = s * g.cx;
        const cy = Math.min(g.cy, 124 + 2 - rr);
        o.push({ shape: ell(cx, cy, rr * 1.02, rr), p: pSkin });
        o.push({ shape: ell(cx, cy, rr * 1.02 - 2, rr - 2), p: pFat });
        if (mr > 4) {
          o.push({ shape: ell(cx, cy, mr * 1.02, mr), p: pMus });
          // kas kompartman septaları
          for (const a of [0.7, 2.6, 4.4]) {
            const ang = s > 0 ? a : Math.PI - a;
            o.push({ shape: { k: 1, x0: cx + Math.cos(ang) * mr * 0.25, y0: cy + Math.sin(ang) * mr * 0.25, x1: cx + Math.cos(ang) * mr * 0.95, y1: cy + Math.sin(ang) * mr * 0.95, r: 0.8 }, p: pSeptum });
          }
        }
      }
    }),
  ];
}

/* ------------------------------------------------------------------------ */
/* Kollar                                                                    */
/* ------------------------------------------------------------------------ */

/** Kol yolu: [x, y, z, r] (deri yarıçapı, orta habitus) – sol kol için (+x); sağ = −x */
export function armPath(cfg: PhantomConfig): TubePt[] {
  if (cfg.arms === 'down') {
    return [
      [160, 52, 312, 44],
      [196, 78, 380, 43],
      [206, 82, 470, 40],
      [208, 84, 590, 37],
      [206, 88, 650, 35],
      [204, 92, 760, 30],
      [202, 96, 830, 26],
      [196, 100, 880, 22],
      [190, 102, 960, 16],
    ];
  }
  // kollar başın üstünde
  return [
    [160, 50, 312, 44],
    [150, 60, 250, 43],
    [132, 66, 150, 40],
    [118, 68, 40, 37],
    [110, 70, -10, 35],
    [92, 72, -100, 30],
    [60, 74, -170, 26],
    [36, 76, -205, 22],
    [16, 78, -240, 16],
  ];
}

/** Kol kemikleri yolu (humerus + önkol) */
function armBones(cfg: PhantomConfig): { humerus: TubePt[]; radius: TubePt[]; ulna: TubePt[] } {
  const p = armPath(cfg);
  const lerpPt = (a: TubePt, b: TubePt, t: number, r: number, dx = 0, dy = 0): TubePt => [a[0] + (b[0] - a[0]) * t + dx, a[1] + (b[1] - a[1]) * t + dy, a[2] + (b[2] - a[2]) * t, r];
  // humerus: p0..p3 (dirsek)
  const humerus: TubePt[] = [lerpPt(p[0], p[1], 0.35, 11), lerpPt(p[1], p[2], 0.5, 10), lerpPt(p[2], p[3], 0.6, 11), lerpPt(p[2], p[3], 0.95, 16)];
  const radius: TubePt[] = [lerpPt(p[3], p[4], 0.3, 7, -9, 0), lerpPt(p[4], p[5], 0.5, 6, -9, 0), lerpPt(p[5], p[6], 0.9, 9, -8, 0)];
  const ulna: TubePt[] = [lerpPt(p[3], p[4], 0.1, 8, 9, 2), lerpPt(p[4], p[5], 0.5, 6, 9, 2), lerpPt(p[5], p[6], 0.85, 5, 8, 2)];
  return { humerus, radius, ulna };
}

export function arms(cfg: PhantomConfig): Structure[] {
  const k = HABITUS_FAT[cfg.habitus];
  const pSkin = props('skin', { comp: 'skin' });
  const pFat = props('fat');
  const pMus = props('muscle', { comp: 'muscle' });
  const pCort = props('corticalBone');
  const pMarrow = props('marrowFat');
  const pTrab = props('trabecularBone', { tex: { kind: 'trab', amp: 0.6, scale: 1.3, seed: 41 } });
  const out: Structure[] = [];
  const path = armPath(cfg);
  const bones = armBones(cfg);
  for (const s of [-1, 1]) {
    const mir = (pts: TubePt[], rs = 1, radd = 0): TubePt[] => pts.map((q) => [s * q[0], q[1], q[2], q[3] * rs + radd]);
    // dış yarıçap: kas + habitus yağı
    const skinPts = path.map((q): TubePt => {
      const fat = 8 * k;
      const r = q[3] - 10 + fat + 2;
      return [s * q[0], q[1] + (q[3] - r) * (cfg.arms === 'down' ? 1 : 0.3), q[2], r];
    });
    out.push(tube('kol derisi', skinPts, pSkin));
    out.push(tube('kol yağı', skinPts.map((q): TubePt => [q[0], q[1], q[2], q[3] - 2]), pFat));
    out.push(tube('kol kasları', mir(path, 1, -10), pMus));
    out.push(tube('humerus', mir(bones.humerus), pCort, { lumen: [pMarrow, 3.5] }));
    out.push(tube('radius', mir(bones.radius), pCort, { lumen: [pTrab, 2] }));
    out.push(tube('ulna', mir(bones.ulna), pCort, { lumen: [pTrab, 2] }));
  }
  return out;
}
