/**
 * Tam istatistiksel (model tabanlı) iteratif rekonstrüksiyon – eğitim gösterimi.
 *
 * Amaç fonksiyonu (cezalı ağırlıklı en küçük kareler, PWLS):
 *     Φ(x) = ½ Σᵢ wᵢ ([Ax]ᵢ − yᵢ)²  +  β Σ_{j~k} ω_jk ψ_δ(x_j − x_k)
 *  - y: log-dönüştürülmüş, BHC uygulanmış ölçüm (sinogram)
 *  - A: sistem modeli (Joseph ileri izdüşümü – görüntüden sinogram tahmini)
 *  - wᵢ: istatistiksel ağırlık ≈ 1/Var(yᵢ) ≈ ışının etkin foton sayısı (NEQ). Az foton alan
 *    (gürültülü) ışınlar daha az güvenilir sayılır → metal/omuz çizgileri ve gürültü azalır.
 *  - ψ_δ: Huber kenar koruyucu ceza (küçük farklar – gürültü – karesel cezalanır,
 *    büyük farklar – gerçek kenarlar – doğrusal: kenarlar korunur).
 *
 * Çözücü: sıralı alt kümeli ayrılabilir karesel vekil (OS-SQS, Erdoğan & Fessler 1999):
 *     x ← [x − (M·Aₛᵀ Wₛ(Aₛx − yₛ) + β∇R(x)) / (Aᵀ W A 1 + β·D_R)]₊
 * Her alt-iterasyon görünümlerin 1/M'ini kullanır; tam iterasyon = M alt-iterasyon.
 *
 * Döngü (klinik IR'nin özü):  tahmin → ileri izdüşüm → ölçümle karşılaştır (artık) →
 * artığı geri izdüşür → düzenlileştir → güncelle → tekrar.
 */
import { backproject, projectJoseph, type ProjGeom, type ReconGrid } from './projector';
import { estimateNoise } from './ir';
import { blurRows } from './slice';

export interface IterOptions {
  /** tam iterasyon sayısı */
  iters: number;
  /** sıralı alt küme sayısı (görünüm sayısını bölmeli) */
  subsets: number;
  /** düzenlileştirme oranı (ceza eğriliği / tipik veri eğriliği) */
  beta: number;
  /** Huber eşiği (HU) */
  deltaHU: number;
  /** başlangıç görüntüsü */
  init: 'zero' | 'fbp';
  /** istatistiksel ağırlıklar (PWLS) – false: ağırlıksız en küçük kareler */
  weighted: boolean;
  /** Nesterov ivmesi */
  momentum?: boolean;
}

/** destek eşiği (HU) ve genişletme (mm) */
const SUPPORT_HU = -950;
/** ivme ilk birkaç tam iterasyonda serbest, sonra her iterasyonda sıfırlanır (hızlı başlangıç + kararlılık) */
const MOMENTUM_FREE_ITERS = 4;
const SUPPORT_DIL_MM = 10;

export const DEFAULT_ITER: IterOptions = { iters: 10, subsets: 20, beta: 0.03, deltaHU: 12, init: 'fbp', weighted: true, momentum: false };

export interface IterSnapshot {
  /** toplam alt-iterasyon (güncelleme) sayısı */
  update: number;
  /** tam iterasyon (kesirli olabilir: update / M) */
  iter: number;
  /** görüntü (HU) */
  img: Float32Array;
  /** artık sinogram Ax − y (2× seyreltilmiş: rnv × rnb) */
  residual: Float32Array;
  /** bu anlık görüntüye kadar yapılan son güncelleme (HU, aynı ızgara) */
  update_img: Float32Array;
}

export interface IterCurvePoint {
  iter: number;
  /** ½ Σ w (Ax−y)² / Σw (ağırlıklı ortalama kare artık) */
  data: number;
  /** β·R(x) (aynı normalizasyon) */
  penalty: number;
  /** gürültü σ (HU, homojen yumuşak doku pencereleri) */
  noise: number;
  /** gerçeğe (fantom) uzaklık – RMSE (HU), vücut içinde */
  rmse: number | null;
}

export interface IterResult {
  opts: IterOptions;
  subsets: number;
  snaps: IterSnapshot[];
  curve: IterCurvePoint[];
  rnv: number;
  rnb: number;
  ms: number;
}

/** Alt küme sırası: bit ters çevrilmiş sıra → ardışık alt kümeler açısal olarak uzak. */
function subsetOrder(M: number): number[] {
  const bits = Math.max(1, Math.ceil(Math.log2(M)));
  const rev = (x: number) => {
    let r = 0;
    for (let i = 0; i < bits; i++) if (x & (1 << i)) r |= 1 << (bits - 1 - i);
    return r;
  };
  return Array.from({ length: M }, (_, i) => i).sort((a, b) => rev(a) - rev(b));
}

/** nv'yi bölen ve hedefe en yakın alt küme sayısı. */
export function pickSubsets(nv: number, target: number): number {
  let best = 1;
  for (let d = 1; d <= nv; d++) if (nv % d === 0 && Math.abs(d - target) < Math.abs(best - target)) best = d;
  return best;
}

/**
 * @param y      sinogram (nv×nb)
 * @param w      etkin NEQ (istatistiksel ağırlık) veya null
 * @param geo    sinogram geometrisi
 * @param rg     görüntü ızgarası (izomerkez merkezli: cx = cy = 0)
 * @param muRef  suyun lineer katsayısı (1/cm) – HU dönüşümü
 * @param fbpHU  FBP görüntüsü (init='fbp' için, aynı ızgara)
 * @param truthHU gerçek (fantom) görüntü – RMSE eğrisi için (isteğe bağlı)
 * @param snapAt anlık görüntü alınacak güncelleme sayıları
 */
export function iterativeRecon(
  y: Float32Array,
  w: Float32Array | null,
  geo: ProjGeom,
  rg: ReconGrid,
  muRef: number,
  opts: IterOptions,
  fbpHU: Float32Array | null,
  truthHU: Float32Array | null,
  snapAt?: number[],
  blurBins = 0,
): IterResult {
  const t0 = performance.now();
  const { nv, nb, ds } = geo;
  const m = rg.m, pix = rg.pix, N = m * m;
  const M = pickSubsets(nv, opts.subsets);
  const order = subsetOrder(M);
  const half = (m - 1) / 2;
  const toHU = (mu: number) => (1000 * (mu - muRef)) / muRef;
  const fromHU = (hu: number) => muRef * (1 + hu / 1000);

  // --- destek: görüntü karesinin tamamı; SFOV dairesi içinde FBP'de hava olan bölgeler hariç.
  // Dairenin dışı (masa kenarları gibi yalnızca bazı açılardan görülen kısımlar) serbest bırakılır:
  // aksi hâlde veride bulunan ama modelde temsil edilemeyen zayıflatma tutarsızlık (çizgi) üretir.
  const R = Math.min((m * pix) / 2, (nb * ds) / 2) - pix;
  const inCircle = new Uint8Array(N);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const xx = (i - half) * pix, yy = (j - half) * pix;
      inCircle[j * m + i] = xx * xx + yy * yy <= R * R ? 1 : 0;
    }
  const supp = new Uint8Array(N).fill(1);
  if (fbpHU) {
    let obj = new Uint8Array(N);
    for (let i = 0; i < N; i++) obj[i] = !inCircle[i] || fbpHU[i] > SUPPORT_HU ? 1 : 0;
    const rad = Math.max(2, Math.round(SUPPORT_DIL_MM / pix));
    for (let it = 0; it < rad; it++) {
      const o2 = new Uint8Array(obj);
      for (let j = 1; j < m - 1; j++)
        for (let i = 1; i < m - 1; i++) {
          const k = j * m + i;
          if (!obj[k] && (obj[k - 1] || obj[k + 1] || obj[k - m] || obj[k + m])) o2[k] = 1;
        }
      obj = o2;
    }
    supp.set(obj);
  }
  const bb = { i0: m, i1: -1, j0: m, j1: -1 };
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++)
      if (supp[j * m + i]) {
        if (i < bb.i0) bb.i0 = i;
        if (i > bb.i1) bb.i1 = i;
        if (j < bb.j0) bb.j0 = j;
        if (j > bb.j1) bb.j1 = j;
      }
  bb.i0 = Math.max(0, bb.i0 - 1);
  bb.j0 = Math.max(0, bb.j0 - 1);
  bb.i1 = Math.min(m - 1, bb.i1 + 2);
  bb.j1 = Math.min(m - 1, bb.j1 + 2);

  // --- istatistiksel ağırlıklar (medyana normalize)
  const NR = nv * nb;
  const wn = new Float32Array(NR);
  if (opts.weighted && w) {
    const vals: number[] = [];
    for (let k = 0; k < NR; k += 7) if (y[k] > 0.05) vals.push(w[k]);
    vals.sort((a, b) => a - b);
    const med = vals.length ? vals[vals.length >> 1] : 1;
    for (let k = 0; k < NR; k++) wn[k] = Math.min(20, w[k] / Math.max(1e-9, med));
  } else wn.fill(1);

  // --- Joseph (A) ve piksel güdümlü geri izdüşüm (B ≈ Aᵀ/κ) ölçek eşlemesi
  const kappa = (0.1 * pix * pix * nv) / (ds * Math.PI);
  // sistem modeli: Joseph izdüşümü + dedektör/odak bulanıklığı (simetrik → kendi eşleniği)
  const rowTmp = new Float32Array(nb);
  const blurView = (a: Float32Array, v: number) => {
    if (blurBins < 0.05) return;
    rowTmp.set(a.subarray(v * nb, (v + 1) * nb));
    blurRows(rowTmp, 1, nb, blurBins);
    a.set(rowTmp, v * nb);
  };
  const fwd = (x: Float32Array, out: Float32Array, views: number[] | null) => {
    if (!views) {
      projectJoseph([x], m, pix, bb, geo, [out]);
      if (blurBins >= 0.05) blurRows(out, nv, nb, blurBins);
    } else
      for (const v of views) {
        projectJoseph([x], m, pix, bb, geo, [out], { v0: v, v1: v + 1 });
        blurView(out, v);
      }
  };
  const back = (sg: Float32Array, out: Float32Array, views: number[] | null) => {
    out.fill(0);
    if (!views) backproject(sg, geo, rg, out);
    else for (const v of views) backproject(sg, geo, rg, out, v, v + 1);
    for (let i = 0; i < N; i++) out[i] = supp[i] ? out[i] * kappa : 0;
  };

  // --- SQS paydası: Aᵀ W A 1 (nesne desteği üzerinde)
  const ones = new Float32Array(N);
  for (let i = 0; i < N; i++) ones[i] = supp[i];
  const a1 = new Float32Array(NR);
  fwd(ones, a1, null);
  for (let k = 0; k < NR; k++) a1[k] *= wn[k];
  const dData = new Float32Array(N);
  back(a1, dData, null);
  // ceza eğriliği: 8 komşu, ω = 1 (eksen) / 1/√2 (çapraz); SQS: 2·Σω
  const omegaSum = 4 + 4 / Math.SQRT2;
  const dVals: number[] = [];
  for (let i = 0; i < N; i += 7) if (supp[i] && dData[i] > 0) dVals.push(dData[i]);
  dVals.sort((a, b) => a - b);
  const dTyp = dVals.length ? dVals[dVals.length >> 1] : 1;
  const beta = (opts.beta * dTyp) / (2 * omegaSum);
  const delta = (opts.deltaHU / 1000) * muRef;
  const denom = new Float32Array(N);
  for (let i = 0; i < N; i++) denom[i] = supp[i] ? Math.max(dData[i], 1e-3 * dTyp) + beta * 2 * omegaSum : 1;

  // --- başlangıç
  const x = new Float32Array(N);
  if (opts.init === 'fbp' && fbpHU) for (let i = 0; i < N; i++) x[i] = supp[i] ? Math.max(0, fromHU(fbpHU[i])) : 0;

  const subViews: number[][] = Array.from({ length: M }, (_, sIdx) => {
    const vs: number[] = [];
    for (let v = sIdx; v < nv; v += M) vs.push(v);
    return vs;
  });
  const fx = new Float32Array(NR);
  const rs = new Float32Array(NR);
  const g = new Float32Array(N);
  const gp = new Float32Array(N);

  // Huber ceza gradyanı (yalnızca destek içindeki komşu çiftleri)
  const DIRS: [number, number, number][] = [
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, Math.SQRT1_2],
    [-1, 1, Math.SQRT1_2],
  ];
  const penalty = (xx: Float32Array, grad: Float32Array | null): number => {
    if (grad) grad.fill(0);
    let val = 0;
    for (let q = 0; q < 4; q++) {
      const di = DIRS[q][0], dj = DIRS[q][1], om = DIRS[q][2];
      const off = dj * m + di;
      const iA = Math.max(bb.i0, -di), iB = Math.min(bb.i1, m - 1 - di);
      for (let j = bb.j0; j <= Math.min(bb.j1, m - 1 - dj); j++) {
        const r = j * m;
        for (let i = iA; i <= iB; i++) {
          const a = r + i, b = a + off;
          if (!supp[a] || !supp[b]) continue;
          const t = xx[a] - xx[b];
          if (grad) {
            const d = om * (t > delta ? delta : t < -delta ? -delta : t);
            grad[a] += d;
            grad[b] -= d;
          } else {
            const at = t < 0 ? -t : t;
            val += om * (at <= delta ? 0.5 * t * t : delta * (at - 0.5 * delta));
          }
        }
      }
    }
    return val;
  };

  const R2 = Math.max(1, nv >> 1), B2 = Math.max(1, nb >> 1);
  const snaps: IterSnapshot[] = [];
  const curve: IterCurvePoint[] = [];
  const total = opts.iters * M;
  const snapSet = new Set((snapAt ?? defaultSnaps(M, opts.iters)).filter((u) => u <= total));
  let wsum = 0;
  for (let k = 0; k < NR; k++) wsum += wn[k];
  const huImg = (xx: Float32Array) => {
    const o = new Float32Array(N);
    for (let i = 0; i < N; i++) o[i] = inCircle[i] ? toHU(xx[i]) : -1024;
    return o;
  };
  let prevSnap = huImg(x);
  const metrics = (iterF: number, wantSnap: boolean, upd: number) => {
    fwd(x, fx, null);
    let dsum = 0;
    for (let k = 0; k < NR; k++) {
      const r = fx[k] - y[k];
      rs[k] = r;
      dsum += wn[k] * r * r;
    }
    const img = huImg(x);
    let rm: number | null = null;
    if (truthHU) {
      let sq = 0, c = 0;
      for (let i = 0; i < N; i++)
        if (truthHU[i] > -500 && img[i] > -1024) {
          const d = img[i] - truthHU[i];
          sq += d * d;
          c++;
        }
      rm = c ? Math.sqrt(sq / c) : null;
    }
    curve.push({ iter: iterF, data: (0.5 * dsum) / wsum, penalty: (beta * penalty(x, null)) / wsum, noise: estimateNoise(img, m), rmse: rm });
    if (wantSnap) {
      const res = new Float32Array(R2 * B2);
      for (let v = 0; v < R2; v++)
        for (let b = 0; b < B2; b++) {
          const k0 = 2 * v * nb + 2 * b;
          res[v * B2 + b] = 0.25 * (rs[k0] + rs[k0 + 1] + rs[k0 + nb] + rs[k0 + nb + 1]);
        }
      const di = new Float32Array(N);
      for (let i = 0; i < N; i++) di[i] = img[i] > -1024 ? img[i] - prevSnap[i] : 0;
      snaps.push({ update: upd, iter: upd / M, img, residual: res, update_img: di });
      prevSnap = img;
    }
  };
  metrics(0, true, 0);

  // --- OS-SQS + Nesterov ivmesi (Kim–Ramani–Fessler 2015), gradyan tabanlı yeniden başlatma
  const z = new Float32Array(x);
  const xPrev = new Float32Array(x);
  let tk = 1;
  let upd = 0;
  for (let it = 0; it < opts.iters; it++) {
    // ivme her tam iterasyonda sıfırlanır: OS + Nesterov birikimli kararsızlığını önler
    if (it >= MOMENTUM_FREE_ITERS) {
      tk = 1;
      z.set(x);
    }
    for (const sIdx of order) {
      const views = subViews[sIdx];
      fwd(z, fx, views);
      rs.fill(0);
      for (const v of views) {
        const o = v * nb;
        for (let b = 0; b < nb; b++) rs[o + b] = wn[o + b] * (fx[o + b] - y[o + b]);
      }
      for (const v of views) blurView(rs, v);
      back(rs, g, views);
      penalty(z, gp);
      xPrev.set(x);
      let dot = 0;
      for (let i = 0; i < N; i++) {
        if (!supp[i]) {
          x[i] = 0;
          continue;
        }
        const v = z[i] - (M * g[i] + beta * gp[i]) / denom[i];
        x[i] = v > 0 ? v : 0;
        dot += (z[i] - x[i]) * (x[i] - xPrev[i]);
      }
      if (dot > 0 || opts.momentum === false) {
        // ivme ters yöne itiyor → yeniden başlat (kararlılık)
        tk = 1;
        z.set(x);
      } else {
        const t1 = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2;
        const mom = (tk - 1) / t1;
        for (let i = 0; i < N; i++) z[i] = supp[i] ? Math.max(0, x[i] + mom * (x[i] - xPrev[i])) : 0;
        tk = t1;
      }
      upd++;
      if (snapSet.has(upd) && upd % M !== 0) metrics(upd / M, true, upd);
    }
    metrics(it + 1, snapSet.has(upd), upd);
  }
  return { opts, subsets: M, snaps, curve, rnv: R2, rnb: B2, ms: performance.now() - t0 };
}

/** Varsayılan anlık görüntü noktaları: ilk iterasyonun içinden birkaç alt-iterasyon + iterasyon sonları. */
export function defaultSnaps(M: number, iters: number): number[] {
  const s = new Set<number>([1, 2, Math.max(3, Math.round(M / 4)), Math.max(4, Math.round(M / 2))]);
  for (const k of [1, 2, 3, 5, 8, 12, 16, 20, 30]) if (k <= iters) s.add(k * M);
  s.add(iters * M);
  return [...s].sort((a, b) => a - b);
}
