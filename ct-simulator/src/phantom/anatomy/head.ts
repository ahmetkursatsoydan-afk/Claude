/**
 * Baş: saçlı deri, kafatası (dış tabula / diploe / iç tabula), kafa tabanı (doldur–oy yaklaşımı),
 * beyin (gri/beyaz cevher, sulkuslar, ventriküller, bazal ganglionlar, talamus, kalsifikasyonlar,
 * beyin sapı, serebellum, sisternalar, Willis poligonu, dural sinüsler), orbitalar, paranazal
 * sinüsler, yüz kemikleri, mandibula, dişler, dil, tükürük bezleri.
 */
import { axisEllipsoid, blobShape, ell, ellipsoid, props, seg, smoothPath, structure, sweep, sweepSampler, tube, type SweepKey, type TubePt } from '../primitives';
import type { EllShape } from '../types';
import type { HalfPlane, Paint, PhantomConfig, Structure } from '../types';
import { HABITUS_FAT, interpTable, mulberry } from './common';

export const SKULL_C: [number, number, number] = [0, 18, 103];
export const SKULL_R: [number, number, number] = [71, 94, 98];
/** saçlı deri kalınlığı (mm) */
const SCALP = 6;

/** Kafa dış hattı (saçlı deri) – orta habitus. [z, cx, cy, rx, ry] */
export const HEAD_KEYS: SweepKey[] = [
  [-3, 0, 22, 6, 7],
  [1, 0, 22, 32, 40],
  [7, 0, 21, 48, 62],
  [17, 0, 21, 61, 79],
  [32, 0, 20, 70, 90],
  [50, 0, 19, 76, 98],
  [70, 0, 18, 79, 101],
  [90, 0, 17, 80, 102],
  [108, 0, 15, 79, 102],
  [122, 0, 12, 77, 101],
  [138, 0, 10, 74, 98],
  [152, 0, 8, 69, 93],
  [168, 0, 6, 64, 87],
  [185, 0, 2, 59, 79],
  [200, 0, -4, 56, 71],
  [215, 0, -10, 52, 61],
  [228, 0, -16, 44, 50],
  [236, 0, -22, 22, 26],
];

const yClipTab = [
  [100, -400],
  [104, -90],
  [108, -64],
  [115, -48],
  [125, -32],
  [140, -16],
  [150, 4],
  [160, 24],
  [172, 46],
  [180, 70],
];
function vaultClip(z: number): HalfPlane[] | undefined {
  if (z <= 100) return undefined;
  const yc = interpTable(yClipTab, z, 1);
  return [{ nx: 0, ny: -1, d: -yc }]; // y ≥ yc
}

export function headSoft(cfg: PhantomConfig): Structure[] {
  const k = HABITUS_FAT[cfg.habitus];
  const fs = 1 + (k - 1) * 0.04;
  return [
    sweep('baş derisi', HEAD_KEYS, props('skin', { comp: 'skin' }), {
      scaleX: fs,
      scaleY: fs,
      layers: [
        [props('fat'), 1.8],
        [props('softTissue', { comp: 'muscle' }), 3.2 * Math.min(1.6, k)],
      ],
    }),
    ellipsoid('burun', { c: [0, -98, 142], r: [12, 16, 26] }, props('skin', { comp: 'skin' })),
    ellipsoid('burun kıkırdağı', { c: [0, -100, 150], r: [9, 11, 16] }, props('cartilage')),
    ...[-1, 1].map((s) => ellipsoid('kulak kepçesi', { c: [s * 80, 26, 132], r: [5, 16, 28], rot: [0, 0, s * -12] }, props('skin', { comp: 'skin' }))),
    ...[-1, 1].map((s) => ellipsoid('kulak kıkırdağı', { c: [s * 80, 26, 132], r: [2, 13, 24], rot: [0, 0, s * -12] }, props('cartilage'))),
    ...[-1, 1].map((s) => ellipsoid('masseter', { c: [s * 52, -18, 186], r: [9, 18, 24] }, props('muscle', { comp: 'muscle' }))),
    ...[-1, 1].map((s) => ellipsoid('temporal kas', { c: [s * 70, -10, 95], r: [5, 30, 30] }, props('muscle', { comp: 'muscle' }))),
  ];
}

const headSampler = sweepSampler(HEAD_KEYS);
/** Kafa dış hattından içe doğru `inset` mm kesit (kafatası/beyin boşluğu ile tutarlı). */
export function headSection(z: number, inset: number): EllShape | null {
  // Kafatası tabanı bölgesinde dış hat yüz/boyun içerdiği için z>100'de hattı dondur.
  const zz = Math.min(z, 112);
  const r = headSampler.at(zz);
  if (!r) return null;
  let rx = r[2] - inset, ry = r[3] - inset;
  let cy = r[1];
  if (z > 112) {
    // taban: elipsoidal daralma (verteks–taban yüksekliği ~ 98 mm ellipsoid gibi)
    const t = (z - 112) / (SKULL_C[2] + SKULL_R[2] - 4 - 112);
    if (t >= 1) return null;
    const f = Math.sqrt(Math.max(0, 1 - t * t));
    rx *= f;
    ry *= f;
    cy += (1 - f) * 10;
  }
  if (rx < 0.5 || ry < 0.5) return null;
  return ell(r[0], cy, rx, ry);
}

export function skull(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const pCort = props('corticalBone');
  const pDip = props('diploe', { tex: { kind: 'trab', amp: 0.5, scale: 1.4, seed: 101 } });
  const pBase = props('diploe', { tex: { kind: 'trab', amp: 0.35, scale: 1.6, seed: 102 } });
  out.push(
    structure('kafatası', 0, 182, (z, o) => {
      const clip = vaultClip(z);
      const a = headSection(z, SCALP), b = headSection(z, SCALP + 1.8), c = headSection(z, SCALP + 4.4), d = headSection(z, SCALP + 5.8);
      if (a) o.push({ shape: a, p: pCort, clip });
      if (b) o.push({ shape: b, p: pDip, clip });
      if (c) o.push({ shape: c, p: pCort, clip });
      // kafa tabanı dolgusu (sonra oyulur)
      if (d && z > 103) o.push({ shape: d, p: pBase, clip });
    }),
  );
  void cfg;
  return out;
}

/** Beyin ve kafa içi yapılar. */
export function brain(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const C = SKULL_C, R = SKULL_R;
  const cav = { at: (z: number) => headSection(z, SCALP + 5.8) };
  const br = { at: (z: number) => headSection(z, SCALP + 7.6) };
  const pCsf = props('csf');
  const pGray = props('grayMatter', { comp: 'brain' });
  const pWhite = props('whiteMatter', { comp: 'brain' });
  const pBG = props('basalGanglia', { comp: 'brain' });
  const pDura = props('dura');
  // serebral hemisferler (tentoryum üstü), z ≤ 104
  out.push(
    structure('serebrum', 0, 106, (z, o) => {
      const a = cav.at(z), b = br.at(z);
      if (a) o.push({ shape: a, p: pCsf });
      if (b) o.push({ shape: b, p: pGray });
    }),
  );
  // kafa tabanı kompartmanlarının oyulması: [ad, merkez, yarıçap, rot]
  const comps: [string, [number, number, number], [number, number, number], number][] = [
    ['frontal lob tabanı', [0, -26, 98], [54, 46, 15], 0],
    ['temporal lob', [-44, 0, 118], [25, 40, 24], -10],
    ['temporal lob', [44, 0, 118], [25, 40, 24], 10],
    ['oksipital lob', [0, 66, 106], [60, 42, 24], 0],
    ['arka fossa', [0, 52, 140], [60, 46, 29], 0],
  ];
  for (const [name, c, r, rz] of comps) {
    out.push(ellipsoid(name + ' (BOS)', { c, r: [r[0] + 1.6, r[1] + 1.6, r[2] + 1.6], rot: [0, 0, rz] }, pCsf));
    out.push(ellipsoid(name, { c, r, rot: [0, 0, rz] }, pGray));
  }
  // beyaz cevher
  out.push(ellipsoid('temporal beyaz cevher', { c: [-44, 4, 112], r: [12, 26, 13], rot: [0, 0, -10] }, pWhite));
  out.push(ellipsoid('temporal beyaz cevher', { c: [44, 4, 112], r: [12, 26, 13], rot: [0, 0, 10] }, pWhite));
  out.push(ellipsoid('oksipital beyaz cevher', { c: [0, 66, 96], r: [42, 22, 14] }, pWhite));
  // sulkuslar (gri cevher astarlı BOS yarıkları)
  const rnd = mulberry(cfg.seed * 31 + 5);
  const K = 64;
  const sul = Array.from({ length: K }, () => ({
    th0: rnd() * Math.PI * 2,
    amp: 0.08 + rnd() * 0.18,
    fr: 1 / (10 + rnd() * 22),
    ph: rnd() * 6.28,
    depth: 7 + rnd() * 14,
    w: 0.45 + rnd() * 0.6,
    bend: (rnd() - 0.5) * 0.9,
    branch: rnd() < 0.55 ? (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5) : 0,
    z0: 4 + rnd() * 30,
    z1: 70 + rnd() * 34,
  }));
  // Beyaz cevher: korteksin (~4.5 mm) altında, sulkus derinliklerinde geri çekilen girus parmakları
  out.push(
    structure('beyaz cevher (giral)', 8, 97, (z, o) => {
      const b = br.at(z);
      if (!b) return;
      const N = 360;
      const radii = new Float32Array(N);
      const taper = Math.min(1, (z - 8) / 14) * Math.min(1, (97 - z) / 10);
      const ctx = 4.5 + (1 - taper) * 6;
      for (let k = 0; k < N; k++) {
        const ph = (k / N) * Math.PI * 2;
        const rb = 1 / Math.sqrt((Math.cos(ph) / b.rx) ** 2 + (Math.sin(ph) / b.ry) ** 2);
        radii[k] = Math.max(2, rb - ctx);
      }
      for (const sl of sul) {
        if (z < sl.z0 || z > sl.z1) continue;
        const th = sl.th0 + sl.amp * Math.sin(z * sl.fr * 6.28 + sl.ph);
        let ang = Math.atan2(Math.sin(th) * b.ry, Math.cos(th) * b.rx);
        if (ang < 0) ang += Math.PI * 2;
        const kc = Math.round((ang / (Math.PI * 2)) * N);
        const d = sl.depth * (0.75 + 0.25 * Math.sin(z * 0.11 + sl.ph));
        for (let dk = -14; dk <= 14; dk++) {
          const k = (kc + dk + N) % N;
          const arc = ((dk * Math.PI * 2) / N) * (radii[k] + ctx);
          radii[k] = Math.max(2, Math.min(radii[k], radii[k] + ctx - (d + 3.5) * Math.exp(-((arc / 2.6) ** 2))));
        }
      }
      o.push({ shape: blobShape(b.cx, b.cy, radii), p: pWhite });
    }),
  );
  out.push(
    structure('sulkuslar', 4, 104, (z, o) => {
      const b = br.at(z);
      if (!b) return;
      for (const s of sul) {
        if (z < s.z0 || z > s.z1) continue;
        const th = s.th0 + s.amp * Math.sin(z * s.fr * 6.28 + s.ph);
        // elips üzerinde nokta (yerel eksenler)
        const lx = Math.cos(th) * b.rx, ly = Math.sin(th) * b.ry;
        const x = b.cx + lx * b.c - ly * b.s, y = b.cy + lx * b.s + ly * b.c;
        const dx = b.cx - x, dy = b.cy - y;
        const L = Math.hypot(dx, dy);
        if (L < 20) continue;
        const d = Math.min(s.depth * (0.75 + 0.25 * Math.sin(z * 0.11 + s.ph)), L * 0.35);
        const ux = dx / L, uy = dy / L;
        const bend = s.bend * Math.sin(z * s.fr * 3 + s.ph);
        const c1 = Math.cos(bend), s1 = Math.sin(bend);
        const vx = ux * c1 - uy * s1, vy = ux * s1 + uy * c1;
        const mx = x + vx * d * 0.5, my = y + vy * d * 0.5;
        const ex = mx + ux * d * 0.5, ey = my + uy * d * 0.5;
        o.push({ shape: seg(x, y, mx, my, 3.4), p: pGray });
        o.push({ shape: seg(mx, my, ex, ey, 3.4), p: pGray });
        o.push({ shape: seg(x - ux * 2, y - uy * 2, mx, my, s.w), p: pCsf });
        o.push({ shape: seg(mx, my, ex, ey, s.w * 0.8), p: pCsf });
        if (s.branch) {
          const cb = Math.cos(s.branch), sb = Math.sin(s.branch);
          const bx = mx + (ux * cb - uy * sb) * d * 0.4, by = my + (ux * sb + uy * cb) * d * 0.4;
          o.push({ shape: seg(mx, my, bx, by, 3), p: pGray });
          o.push({ shape: seg(mx, my, bx, by, s.w * 0.7), p: pCsf });
        }
      }
    }),
  );
  // derin gri cevher
  for (const s of [-1, 1]) {
    out.push(ellipsoid('kaudat başı', { c: [s * 15, -14, 78], r: [7, 10, 11] }, pBG));
    out.push(ellipsoid('kaudat gövdesi', { c: [s * 15, 10, 64], r: [5, 18, 6] }, pBG));
    out.push(ellipsoid('lentiform nükleus', { c: [s * 26, 4, 84], r: [7, 17, 11], rot: [0, 0, s * 8] }, pBG));
    out.push(ellipsoid('talamus', { c: [s * 10, 22, 84], r: [10, 13, 10] }, pGray));
    out.push(ellipsoid('insula', { c: [s * 40, 2, 88], r: [4, 22, 14] }, pGray));
    out.push(ellipsoid('sylvian fissür', { c: [s * 47, 0, 92], r: [2.5, 22, 16], rot: [0, 0, s * 4] }, pCsf));
  }
  // ventriküller
  for (const s of [-1, 1]) {
    out.push(ellipsoid('lateral ventrikül gövdesi', { c: [s * 10, 12, 62], r: [6, 32, 8] }, pCsf));
    out.push(ellipsoid('frontal boynuz', { c: [s * 11, -20, 74], r: [6.5, 14, 11], rot: [0, 0, s * -18] }, pCsf));
    out.push(ellipsoid('atriyum/oksipital boynuz', { c: [s * 22, 46, 76], r: [8, 17, 11], rot: [0, 0, s * 25] }, pCsf));
    out.push(ellipsoid('temporal boynuz', { c: [s * 36, 4, 104], r: [3.5, 15, 5], rot: [0, 0, s * 12] }, pCsf));
    out.push(ellipsoid('koroid pleksus kalsifikasyonu', { c: [s * 23, 50, 77], r: [2.6, 3, 2.6] }, props('choroidCalc', { comp: 'choroid' })));
  }
  out.push(ellipsoid('3. ventrikül', { c: [0, 14, 86], r: [2.4, 15, 11] }, pCsf));
  out.push(ellipsoid('pineal kalsifikasyon', { c: [0, 38, 84], r: [2.4, 2.6, 2.4] }, props('pinealCalc')));
  // interhemisferik fissür ve falks
  out.push(
    structure('interhemisferik fissür', 3, 96, (z, o) => {
      const b = br.at(z);
      if (!b) return;
      const y0 = b.cy - b.ry, y1 = b.cy + b.ry;
      o.push({ shape: seg(0, y0 - 1, 0, Math.min(y0 + b.ry * 0.62, -2), 1.4), p: pCsf });
      o.push({ shape: seg(0, Math.max(y1 - b.ry * 0.7, 40), 0, y1 + 1, 1.4), p: pCsf });
      o.push({ shape: seg(0, y0 - 1, 0, Math.min(y0 + b.ry * 0.55, -6), 0.5), p: pDura });
      o.push({ shape: seg(0, Math.max(y1 - b.ry * 0.62, 46), 0, y1 + 1, 0.5), p: pDura });
    }),
  );
  // orta beyin, sisternalar, beyin sapı, serebellum
  out.push(ellipsoid('suprasellar sisterna', { c: [0, -4, 106], r: [13, 9, 5] }, pCsf));
  out.push(ellipsoid('ambiens sisterna', { c: [0, 22, 102], r: [19, 18, 6] }, pCsf));
  out.push(ellipsoid('mezensefalon', { c: [0, 20, 102], r: [14, 12, 8] }, pWhite));
  out.push(ellipsoid('interpedinküler sisterna', { c: [0, 10, 104], r: [4, 4, 5] }, pCsf));
  out.push(ellipsoid('kuadrigeminal sisterna', { c: [0, 40, 100], r: [9, 5, 6] }, pCsf));
  out.push(ellipsoid('serebellum', { c: [-25, 62, 142], r: [30, 27, 20] }, props('grayMatter', { comp: 'brain', tex: { kind: 'noise', amp: 0.008, scale: 1.6, seed: 113 } })));
  out.push(ellipsoid('serebellum', { c: [25, 62, 142], r: [30, 27, 20] }, props('grayMatter', { comp: 'brain', tex: { kind: 'noise', amp: 0.008, scale: 1.6, seed: 114 } })));
  for (const s of [-1, 1]) out.push(ellipsoid('serebellar beyaz cevher', { c: [s * 22, 56, 138], r: [12, 10, 9] }, pWhite));
  out.push(ellipsoid('prepontin sisterna', { c: [0, 10, 132], r: [13, 5, 16] }, pCsf));
  out.push(ellipsoid('pons', { c: [0, 26, 130], r: [17, 13, 15] }, pWhite));
  out.push(ellipsoid('medulla', { c: [0, 32, 158], r: [10, 10, 14] }, pWhite));
  out.push(ellipsoid('4. ventrikül', { c: [0, 46, 134], r: [8, 4.5, 9] }, pCsf));
  out.push(ellipsoid('sisterna magna', { c: [0, 88, 160], r: [14, 9, 9] }, pCsf));
  // Willis poligonu ve damarlar
  const art = props('blood', { comp: 'artery' });
  out.push(tube('baziler arter', smoothPath([[0, 14, 156, 1.7], [0, 10, 132, 1.8], [0, 8, 110, 1.8]]), art));
  for (const s of [-1, 1]) {
    out.push(tube('MCA', smoothPath([[s * 12, -4, 112, 1.6], [s * 26, -6, 106, 1.5], [s * 40, -2, 100, 1.3], [s * 50, 4, 90, 1]]), art));
    out.push(tube('ACA', smoothPath([[s * 12, -4, 112, 1.3], [s * 3, -14, 104, 1.2], [s * 2, -36, 92, 1.1], [s * 2, -50, 70, 1]]), art));
    out.push(tube('PCA', smoothPath([[0, 8, 110, 1.4], [s * 14, 16, 106, 1.3], [s * 24, 34, 100, 1.2], [s * 22, 60, 96, 1]]), art));
    out.push(tube('transvers sinüs', smoothPath([[0, 100, 120, 3.6], [s * 40, 92, 124, 3.8], [s * 58, 62, 136, 4], [s * 50, 46, 150, 4]]), props('blood', { comp: 'venousSinus' })));
  }
  // süperior sagittal sinüs (iç tabla boyunca orta hat)
  const sss: TubePt[] = [];
  for (let a = -1.0; a <= 1.9; a += 0.25) {
    const ry = R[1] - 7.5, rz = R[2] - 7.5;
    sss.push([0, C[1] + Math.sin(a) * ry, C[2] - Math.cos(a) * rz, 3.2]);
  }
  out.push(tube('süperior sagittal sinüs', smoothPath(sss, 2), props('blood', { comp: 'venousSinus' })));
  out.push(tube('düz sinüs', smoothPath([[0, 42, 86, 2.4], [0, 70, 100, 2.6], [0, 98, 118, 3]]), props('blood', { comp: 'venousSinus' })));
  return out;
}

/** Kafa tabanı kemikleri, orbitalar, sinüsler, yüz iskeleti, dişler. */
export function face(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const pCort = props('corticalBone');
  const pDense = props('denseBone');
  const pDip = props('diploe', { tex: { kind: 'trab', amp: 0.4, scale: 1.4, seed: 121 } });
  const pTrab = props('trabecularBone', { tex: { kind: 'trab', amp: 0.6, scale: 1.3, seed: 122 } });
  const pAir = props('air');
  const pFat = props('fat');
  const pMuc = props('softTissue');
  // petröz kemikler
  for (const s of [-1, 1]) {
    out.push(ellipsoid('petröz kemik', axisEllipsoid([s * 44, 36, 136], [s * 0.78, 0.6, 0.12], [28, 8, 9]), pDense));
    out.push(ellipsoid('iç kulak', { c: [s * 38, 32, 134], r: [3, 3, 3] }, pMuc));
    out.push(ellipsoid('mastoid hava hücreleri', { c: [s * 62, 50, 148], r: [9, 13, 14] }, props('diploe', { tex: { kind: 'mottle', amp: 1, scale: 2.2, seed: 123 + s, thr: -0.05 } })));
    out.push(tube('dış kulak yolu', [[s * 82, 24, 136, 3.8], [s * 70, 26, 136, 3.5], [s * 56, 28, 135, 3]], pAir));
    out.push(ellipsoid('orta kulak', { c: [s * 50, 28, 134], r: [4, 5, 4] }, pAir));
    // büyük kanat
    out.push(structure('sfenoid büyük kanat', 108, 142, (_z, o) => o.push({ shape: seg(s * 26, -30, s * 58, -14, 2.6), p: pCort })));
  }
  // sfenoid gövde + sinüs, klivus
  out.push(ellipsoid('sfenoid gövdesi', { c: [0, 2, 132], r: [22, 24, 20] }, pDip));
  out.push(ellipsoid('sfenoid sinüs', { c: [0, -8, 132], r: [15, 14, 12] }, pAir));
  out.push(ellipsoid('sella', { c: [0, 6, 115], r: [7, 6, 5] }, props('softTissue')));
  out.push(ellipsoid('klivus', axisEllipsoid([0, 12, 145], [0, 0.5, 0.86], [22, 10, 7]), pDip));
  // orbitalar
  for (const s of [-1, 1]) {
    const oc: [number, number, number] = [s * 33, -58, 122];
    out.push(ellipsoid('orbita duvarı', { c: oc, r: [22, 38, 21], rot: [0, 0, s * -12] }, pCort));
    out.push(ellipsoid('orbita yağı', { c: oc, r: [20, 36, 19], rot: [0, 0, s * -12] }, pFat));
    out.push(ellipsoid('medial rektus', { c: [s * 19, -56, 122], r: [3, 18, 4.5], rot: [0, 0, s * -5] }, props('muscle', { comp: 'muscle' })));
    out.push(ellipsoid('lateral rektus', { c: [s * 46, -56, 122], r: [3, 18, 4.5], rot: [0, 0, s * -18] }, props('muscle', { comp: 'muscle' })));
    out.push(tube('optik sinir', [[s * 31, -64, 122, 2.6], [s * 22, -40, 121, 2.4], [s * 12, -18, 118, 2.2]], props('whiteMatter')));
    out.push(ellipsoid('sklera', { c: [s * 32, -74, 121], r: [12.8, 12.8, 12.8] }, props('softTissue')));
    out.push(ellipsoid('vitreus', { c: [s * 32, -74, 121], r: [11.6, 11.6, 11.6] }, props('vitreous')));
    out.push(ellipsoid('lens', { c: [s * 32, -84, 121], r: [4.4, 1.9, 4.4] }, props('lens')));
    out.push(ellipsoid('göz kapağı', { c: [s * 32, -88, 121], r: [12, 2.5, 10] }, props('skin')));
    // maksiller sinüs
    out.push(ellipsoid('maksiller sinüs duvarı', { c: [s * 32, -48, 154], r: [20, 23, 21] }, pCort));
    out.push(ellipsoid('maksiller sinüs', { c: [s * 32, -48, 154], r: [18, 21, 19] }, pAir));
    // zigoma ve zigomatik ark
    out.push(ellipsoid('zigoma', { c: [s * 52, -64, 134], r: [10, 10, 14] }, pCort));
    out.push(ellipsoid('zigoma iç', { c: [s * 52, -64, 134], r: [8, 8, 12] }, pTrab));
    out.push(tube('zigomatik ark', smoothPath([[s * 54, -62, 140, 4], [s * 64, -38, 142, 4], [s * 67, -12, 141, 4], [s * 60, 8, 140, 3.6]]), pCort));
    // pterigoid kaslar, parotis, submandibuler bez
    out.push(ellipsoid('pterigoid kas', { c: [s * 30, 2, 174], r: [9, 13, 16] }, props('muscle', { comp: 'muscle' })));
    out.push(ellipsoid('parotis', { c: [s * 47, 22, 180], r: [12, 16, 24] }, props('breast', { comp: 'gland' })));
    out.push(ellipsoid('submandibuler bez', { c: [s * 32, -22, 228], r: [10, 12, 10] }, props('pancreas', { comp: 'gland' })));
  }
  // etmoid hava hücreleri
  out.push(ellipsoid('etmoid', { c: [0, -52, 122], r: [12, 26, 16] }, props('diploe', { tex: { kind: 'mottle', amp: 1, scale: 2.4, seed: 131, thr: -0.25 } })));
  // frontal sinüs
  out.push(ellipsoid('frontal kemik kalınlaşması', { c: [0, -71, 86], r: [20, 9, 13] }, pDip));
  out.push(ellipsoid('frontal sinüs', { c: [0, -71, 87], r: [14, 5.5, 9] }, pAir));
  // nazal kavite
  out.push(ellipsoid('nazal kavite', { c: [0, -56, 150], r: [14, 38, 23] }, pAir));
  out.push(structure('nazal septum', 126, 174, (_z, o) => o.push({ shape: seg(0, -92, 0, -22, 1.1), p: pCort })));
  for (const s of [-1, 1]) {
    out.push(ellipsoid('alt konka', { c: [s * 10, -52, 160], r: [4, 24, 6] }, pMuc));
    out.push(ellipsoid('orta konka', { c: [s * 8, -50, 146], r: [3, 20, 5] }, pMuc));
  }
  // nazofarinks
  out.push(tube('farinks', smoothPath([[0, 2, 142, 8], [0, 8, 160, 9], [0, 10, 180, 8.5], [0, 6, 205, 8], [0, -2, 228, 8.5], [0, -10, 244, 7]]), pAir));
  // sert damak
  out.push(ellipsoid('sert damak', { c: [0, -48, 178], r: [24, 30, 2.6] }, pCort));
  // mandibula
  for (const s of [-1, 1]) {
    out.push(tube('mandibula ramus', smoothPath([[s * 52, 14, 142, 5.5], [s * 51, 9, 168, 5], [s * 48, 2, 196, 6], [s * 45, -10, 212, 6.5]]), pCort, { lumen: [pTrab, 2] }));
    out.push(tube('koronoid', [[s * 47, -6, 150, 3], [s * 49, 0, 176, 3.4]], pCort));
    out.push(ellipsoid('kondil', { c: [s * 52, 16, 138], r: [9, 5, 6] }, pCort));
  }
  out.push(
    tube('mandibula gövdesi', smoothPath([
      [-45, -10, 212, 6.5],
      [-38, -36, 218, 7],
      [-24, -60, 222, 7.5],
      [0, -74, 226, 8],
      [24, -60, 222, 7.5],
      [38, -36, 218, 7],
      [45, -10, 212, 6.5],
    ], 3), pCort, { lumen: [pTrab, 2.2] }),
  );
  // dil, ağız boşluğu
  out.push(ellipsoid('dil', { c: [0, -34, 200], r: [26, 32, 17] }, props('muscle', { comp: 'muscle' })));
  out.push(ellipsoid('ağız boşluğu', { c: [0, -54, 197], r: [18, 12, 2.2] }, pAir));
  // dişler
  out.push(...teeth(cfg));
  return out;
}

function archPoint(t: number, upper: boolean): [number, number] {
  // t ∈ [-1, 1] ark boyunca
  const w = upper ? 31 : 29;
  const x = w * Math.sin(t * 1.25);
  const y = (upper ? -74 : -70) + 44 * (1 - Math.cos(t * 1.25));
  return [x, y];
}

function teeth(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const enamel = props('enamel');
  const dentin = props('dentin');
  const alv = props('trabecularDense', { tex: { kind: 'trab', amp: 0.4, scale: 1.3, seed: 141 } });
  const amalgam = props('amalgam');
  const N = 14;
  for (const upper of [true, false]) {
    const zc = upper ? 192 : 205; // oklüzal düzlem ~198
    out.push(
      structure(upper ? 'üst alveol' : 'alt alveol', upper ? 178 : 199, upper ? 197 : 216, (z, o) => {
        // alveol kemiği (kök bölgesi)
        const inRoot = upper ? z < 190 : z > 206;
        for (let i = 0; i < N; i++) {
          const t = -0.95 + (1.9 * i) / (N - 1);
          const [x, y] = archPoint(t, upper);
          const molar = Math.abs(t) > 0.55;
          const r = molar ? 5.2 : Math.abs(t) > 0.3 ? 4.2 : 3.4;
          if (inRoot) o.push({ shape: ell(x, y, r + 2.5, r + 2.5), p: alv });
          const crown = upper ? z >= 190 : z <= 206;
          o.push({ shape: ell(x, y, r, r * 0.85), p: crown ? enamel : dentin });
          if (crown) o.push({ shape: ell(x, y, r * 0.55, r * 0.45), p: dentin });
          if (cfg.implant === 'dental' && molar && (i % 3 !== 1) && Math.abs(z - zc) < 3.5) o.push({ shape: ell(x, y, r * 0.55, r * 0.5), p: amalgam });
        }
      }),
    );
  }
  return out;
}

export function head(cfg: PhantomConfig): { soft: Structure[]; bone: Structure[]; brain: Structure[]; face: Structure[] } {
  return { soft: headSoft(cfg), bone: skull(cfg), brain: brain(cfg), face: face(cfg) };
}

export type { Paint };
