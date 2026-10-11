/**
 * Topogram (scout / surview) simülasyonu: tüp sabit (AP: 12 yönünde, LAT: 9 yönünde),
 * masa hareket ederken satır satır izdüşüm. Polikromatik geçirgenlik + düşük doz gürültüsü
 * + su BHC. Ayrıca her satır için su-eşdeğer çap (Dw, AAPM 220) hesaplanır → ATCM.
 */
import { rasterizeSlab, type PhantomModel } from '../phantom/raster';
import { applyBhc, LUT_NB, LUT_NW, LUT_B_MAX, LUT_B_MIN, LUT_W_MAX } from './poly';
import { getPoly } from './slice';
import { Rng, hashSeed } from './rng';

export interface TopogramRequest {
  view: 'AP' | 'LAT';
  z0: number;
  z1: number;
  /** satır aralığı (mm) */
  dz: number;
  /** sütun aralığı (mm) */
  dx: number;
  /** görüntü genişliği (mm) */
  width: number;
  kVp: number;
  mA: number;
  isoXp: number;
  isoYp: number;
  seed: number;
  /** yalnızca bu satır aralığını hesapla (parçalı iş) */
  rowFrom?: number;
  rowTo?: number;
}

export interface TopogramChunk {
  rowFrom: number;
  rowTo: number;
  cols: number;
  /** satır öncelikli p_BHC (μref·L, birimsiz) */
  data: Float32Array;
  /** satır başına su-eşdeğer çap (cm) */
  dw: Float32Array;
  /** satır başına maksimum p (açısal modülasyon kestirimi için) */
  pmax: Float32Array;
  muRef: number;
}

export function topogramRows(req: TopogramRequest): number {
  return Math.max(1, Math.round((req.z1 - req.z0) / req.dz));
}

export function computeTopogramChunk(model: PhantomModel, req: TopogramRequest): TopogramChunk {
  const rows = topogramRows(req);
  const r0 = req.rowFrom ?? 0, r1 = Math.min(rows, req.rowTo ?? rows);
  let n = Math.ceil(req.width / req.dx);
  if (n % 2) n++;
  const dx = req.dx;
  const grid = { n, dx, x0: req.isoXp - ((n - 1) / 2) * dx, y0: req.isoYp - ((n - 1) / 2) * dx };
  const work = { tmp: [0, 1, 2, 3].map(() => new Float32Array(n * n)), out: [0, 1, 2, 3].map(() => new Float32Array(n * n)) };
  const poly = getPoly(req.kVp, 'body', 2, 1);
  const g = poly.groups[0];
  const nE = poly.nE;
  const ref = getPoly(120, 'body', 2, 1).groups[0].neq0;
  // Düşük doz: piksel başına foton (kalibrasyon: 120 kVp, 50 mA → hafif gürültülü)
  const n0 = 1.6e3 * req.mA * (g.neq0 / ref) * (req.dx / 1.6) * (req.dz / 2);
  const rng = new Rng(hashSeed(req.seed, r0, req.kVp));
  const cols = n;
  const data = new Float32Array((r1 - r0) * cols);
  const dw = new Float32Array(r1 - r0);
  const pmax = new Float32Array(r1 - r0);
  const LW = (LUT_NW - 1) / LUT_W_MAX, LB = (LUT_NB - 1) / (LUT_B_MAX - LUT_B_MIN);
  const lw = new Float32Array(n), lb = new Float32Array(n), li = new Float32Array(n), lm = new Float32Array(n);
  for (let r = r0; r < r1; r++) {
    const z = req.z0 + (r + 0.5) * req.dz;
    const ras = rasterizeSlab(model, [z], [1], grid, null, work);
    lw.fill(0); lb.fill(0); li.fill(0); lm.fill(0);
    const [W, B, I, M] = ras.buf;
    if (ras.bb.i1 >= ras.bb.i0) {
      const scale = dx * 0.1; // cm
      if (req.view === 'AP') {
        for (let j = ras.bb.j0; j <= ras.bb.j1; j++) {
          const o = j * n;
          for (let i = ras.bb.i0; i <= ras.bb.i1; i++) {
            lw[i] += W[o + i] * scale; lb[i] += B[o + i] * scale; li[i] += I[o + i] * scale; lm[i] += M[o + i] * scale;
          }
        }
      } else {
        for (let j = ras.bb.j0; j <= ras.bb.j1; j++) {
          const o = j * n;
          let a = 0, b = 0, c = 0, d = 0;
          for (let i = ras.bb.i0; i <= ras.bb.i1; i++) { a += W[o + i]; b += B[o + i]; c += I[o + i]; d += M[o + i]; }
          lw[j] = a * scale; lb[j] = b * scale; li[j] = c * scale; lm[j] = d * scale;
        }
      }
    }
    let area = 0, pm = 0;
    const row = (r - r0) * cols;
    for (let c = 0; c < cols; c++) {
      let te: number, s2rel: number;
      if (li[c] === 0 && lm[c] === 0 && lw[c] < LUT_W_MAX && lb[c] > LUT_B_MIN && lb[c] < LUT_B_MAX) {
        const uw = lw[c] * LW, ub = (lb[c] - LUT_B_MIN) * LB;
        const iw = uw | 0, ib = ub | 0, fw = uw - iw, fb = ub - ib;
        const L = g.lut;
        const o00 = 2 * (ib * LUT_NW + iw), o01 = o00 + 2, o10 = o00 + 2 * LUT_NW, o11 = o10 + 2;
        const pA = (L[o00] * (1 - fw) + L[o01] * fw) * (1 - fb) + (L[o10] * (1 - fw) + L[o11] * fw) * fb;
        const pB = (L[o00 + 1] * (1 - fw) + L[o01 + 1] * fw) * (1 - fb) + (L[o10 + 1] * (1 - fw) + L[o11 + 1] * fw) * fb;
        te = Math.exp(-pA);
        s2rel = Math.exp(-pB);
      } else {
        let s1 = 0, s2 = 0;
        for (let e = 0; e < nE; e++) {
          const x = lw[c] * g.mu[e] + lb[c] * g.mu[nE + e] + li[c] * g.mu[2 * nE + e] + lm[c] * g.mu[3 * nE + e];
          const ex = Math.exp(-x);
          s1 += g.wE[e] * ex;
          s2 += g.w2[e] * ex;
        }
        te = s1;
        s2rel = s2 > 0 ? (s1 * s1) / s2 : 0;
      }
      const neq = n0 * s2rel;
      let meas = neq + Math.sqrt(neq + 9) * rng.gauss();
      if (meas < 0.5) meas = 0.5;
      const p = applyBhc(g, -Math.log(Math.max(1e-12, (te * meas) / Math.max(neq, 1e-9))));
      data[row + c] = p;
      if (p > pm) pm = p;
      // su-eşdeğer alan (gürültüsüz)
      area += (applyBhc(g, -Math.log(Math.max(1e-12, te))) / poly.muRef) * (dx * 0.1);
    }
    // AP görünümünde tablo da projeksiyona girer; masayı kabaca çıkar (~1.6 cm su eşd. × genişlik)
    dw[r - r0] = 2 * Math.sqrt(Math.max(0, area - 0.9 * 43) / Math.PI);
    pmax[r - r0] = pm;
  }
  return { rowFrom: r0, rowTo: r1, cols, data, dw, pmax, muRef: poly.muRef };
}
