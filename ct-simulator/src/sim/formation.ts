/**
 * Görüntü oluşumu gezgini için aşama verileri: gerçek nesne (μ haritası) → çizgi integralleri →
 * sayımlar → log/BHC → filtreleme → aşamalı geri izdüşüm → FBP → (isteğe bağlı) iteratif rekon.
 * Ana tarama zinciriyle AYNI fizik kodu (computeSlice) kullanılır; ara diziler yakalanır.
 */
import type { PhantomModel } from '../phantom/raster';
import { computeSlice, type Accel, type SliceCapture } from './slice';
import { backproject, type ProjGeom, type ReconGrid } from './projector';
import { estimateNoise } from './ir';
import { applyBhc, transmissionE } from './poly';
import { channelMassAtten } from '../physics/materials';
import { SFOV_MM, type SliceRequest, type SliceStats } from './protocol';
import { iterativeRecon, type IterOptions, type IterResult } from './iterative';

export interface FormationRequest {
  req: SliceRequest;
  /** gezgin görüntü ızgarası (SFOV = 500 mm'yi kaplar, izomerkez merkezli) */
  m?: number;
  /** aşamalı (görünüm görünüm) geri izdüşüm anlık görüntüleri */
  progressive?: boolean;
  /** tam istatistiksel iteratif rekonstrüksiyon */
  iterative?: IterOptions | null;
}

export interface ProgressiveSet {
  /** her anlık görüntüdeki görünüm sayısı */
  k: number[];
  /** görüntüler (filtreli: HU; filtresiz: ham geri izdüşüm değeri) */
  imgs: Float32Array[];
}

export interface FormationResult {
  /** sinogram (veri toplama) geometrisi; rgeo: rekonstrüksiyonda kullanılan (seyreltilmiş olabilir) */
  geo: ProjGeom;
  rgeo: ProjGeom;
  /** gezgin görüntü ızgarası: m×m, piksel pix mm, izomerkez merkezli */
  m: number;
  pix: number;
  kVp: number;
  eRef: number;
  muRef: number;
  /** gerçek nesne: fantomun E_ref'teki HU haritası (kesit kalınlığı boyunca ortalanmış) */
  truthHU: Float32Array;
  /** sinogramlar (nv×nb, görünüm satırları) */
  monoLine: Float32Array;
  polyLine: Float32Array;
  expected: Float32Array;
  counts: Float32Array;
  raw: Float32Array;
  /** rekon girdisi (rgeo) ve filtrelenmiş hâli */
  p: Float32Array;
  q: Float32Array;
  /** zayıflatmasız sayım profili (papyon dahil) */
  n0: Float32Array;
  /** FBP (HU) ve filtresiz geri izdüşüm (ham) */
  fbpHU: Float32Array;
  bpRaw: Float32Array;
  /** aşamalı geri izdüşüm */
  even?: { filtered: ProgressiveSet; unfiltered: ProgressiveSet };
  sequential?: ProgressiveSet;
  /** ışın sertleşmesi eğrileri (merkez papyon grubu) */
  bhc: { lw: number[]; poly: number[]; ideal: number[]; boneLb: number[]; boneIdeal: number[]; boneCorrected: number[] };
  stats: SliceStats;
  fbpNoise: number;
  fbpRmse: number;
  iter?: IterResult;
  ms: number;
}

/** nv'yi bölen ve hedeflere yakın görünüm sayıları (eşit aralıklı alt kümeler için). */
function divisorSteps(nv: number, targets: number[]): number[] {
  const divs: number[] = [];
  for (let d = 1; d <= nv; d++) if (nv % d === 0) divs.push(d);
  const out = new Set<number>();
  for (const t of targets) {
    let best = divs[0];
    for (const d of divs) if (Math.abs(Math.log(d / t)) < Math.abs(Math.log(best / t))) best = d;
    out.add(best);
  }
  out.add(nv);
  return [...out].sort((a, b) => a - b);
}

/** k eşit aralıklı görünümün geri izdüşümü (açılar orijinal görünümlerle birebir). */
function bpEven(s: Float32Array, geo: ProjGeom, k: number, rg: ReconGrid, out: Float32Array) {
  const stride = geo.nv / k;
  const sub = new Float32Array(k * geo.nb);
  for (let i = 0; i < k; i++) sub.set(s.subarray(i * stride * geo.nb, (i * stride + 1) * geo.nb), i * geo.nb);
  out.fill(0);
  backproject(sub, { nv: k, nb: geo.nb, ds: geo.ds }, rg, out);
}

export function computeFormation(model: PhantomModel, fr: FormationRequest, accel?: Accel | null): FormationResult {
  const t0 = performance.now();
  const cap: SliceCapture = {};
  // ana zincir (FBP, kernel isteğe göre); gezgin görüntüleri kendi ızgarasında yeniden kurar
  const sres = computeSlice(model, { ...fr.req, recon: 'FBP', debug: false, matrix: 256, dfov: SFOV_MM, reconCx: 0, reconCy: 0 }, accel, cap);
  const geo = cap.geo!, rgeo = cap.rgeo!, poly = cap.poly!, grid = cap.grid!;
  const m = fr.m ?? 320;
  const pix = SFOV_MM / m;
  const rg: ReconGrid = { m, pix, cx: 0, cy: 0 };
  const N = m * m;
  const half = (m - 1) / 2;
  const R = SFOV_MM / 2;
  const inS = new Uint8Array(N);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const x = (i - half) * pix, y = (j - half) * pix;
      inS[j * m + i] = x * x + y * y <= R * R ? 1 : 0;
    }
  const muRef = poly.muRef;
  const toHU = (mu: number) => (1000 * (mu - muRef)) / muRef;

  // --- gerçek nesne: μ(E_ref) haritası, gezgin ızgarasına alan ortalamalı yeniden örnekleme
  const mc = [0, 1, 2, 3].map((c) => channelMassAtten(c, poly.eRef));
  const chan = cap.chan!;
  const n = grid.n, dx = grid.dx, gc = (n - 1) / 2;
  const muAt = (gi: number, gj: number) => {
    if (gi < 0 || gj < 0 || gi >= n - 1 || gj >= n - 1) return 0;
    const i0 = Math.floor(gi), j0 = Math.floor(gj), fi = gi - i0, fj = gj - j0;
    let v = 0;
    for (let c = 0; c < 4; c++) {
      const a = chan[c];
      if (!a) continue;
      const k = j0 * n + i0;
      const s = (a[k] * (1 - fi) + a[k + 1] * fi) * (1 - fj) + (a[k + n] * (1 - fi) + a[k + n + 1] * fi) * fj;
      v += s * mc[c];
    }
    return v;
  };
  const truthHU = new Float32Array(N);
  const SS = 3;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const k = j * m + i;
      if (!inS[k]) {
        truthHU[k] = -1024;
        continue;
      }
      let s = 0;
      for (let a = 0; a < SS; a++)
        for (let b = 0; b < SS; b++) {
          const x = (i - half + (a + 0.5) / SS - 0.5) * pix, y = (j - half + (b + 0.5) / SS - 0.5) * pix;
          s += muAt(x / dx + gc, y / dx + gc);
        }
      truthHU[k] = toHU(s / (SS * SS));
    }

  // --- FBP ve filtresiz geri izdüşüm (gezgin ızgarasında)
  const mask = (img: Float32Array) => {
    for (let i = 0; i < N; i++) if (!inS[i]) img[i] = -1024;
    return img;
  };
  const muImg = new Float32Array(N);
  if (accel) accel.backproject(cap.q!, rgeo, rg, muImg);
  else backproject(cap.q!, rgeo, rg, muImg);
  const fbpHU = new Float32Array(N);
  for (let i = 0; i < N; i++) fbpHU[i] = toHU(muImg[i]);
  if (cap.q0) {
    // MAR: metal pikselleri MAR öncesi görüntüden geri konur (klinik uygulama gibi)
    const mu0 = new Float32Array(N);
    backproject(cap.q0, rgeo, rg, mu0);
    for (let i = 0; i < N; i++) {
      const h0 = toHU(mu0[i]);
      if (h0 > 2600) fbpHU[i] = h0;
    }
  }
  mask(fbpHU);
  const bpRaw = new Float32Array(N);
  backproject(cap.p!, rgeo, rg, bpRaw);
  for (let i = 0; i < N; i++) if (!inS[i]) bpRaw[i] = 0;

  const fbpNoise = estimateNoise(fbpHU, m);
  let se = 0, cnt = 0;
  for (let i = 0; i < N; i++)
    if (inS[i] && truthHU[i] > -500) {
      const d = fbpHU[i] - truthHU[i];
      se += d * d;
      cnt++;
    }
  const fbpRmse = cnt ? Math.sqrt(se / cnt) : 0;

  // --- ışın sertleşmesi eğrileri (merkez grup)
  const g0 = poly.groups[0];
  const bhc = { lw: [] as number[], poly: [] as number[], ideal: [] as number[], boneLb: [] as number[], boneIdeal: [] as number[], boneCorrected: [] as number[] };
  for (let lw = 0; lw <= 45; lw += 1.5) {
    bhc.lw.push(lw);
    bhc.poly.push(-Math.log(transmissionE(g0, poly.nE, lw, 0, 0, 0)));
    bhc.ideal.push(muRef * lw);
  }
  const muB = channelMassAtten(1, poly.eRef);
  for (let lb = 0; lb <= 8; lb += 0.4) {
    // 20 cm su + lb g/cm² kortikal kemik (kafa tabanı/pelvis benzeri)
    bhc.boneLb.push(lb);
    bhc.boneIdeal.push(muRef * 20 + muB * lb);
    bhc.boneCorrected.push(applyBhc(g0, -Math.log(transmissionE(g0, poly.nE, 20, lb, 0, 0))));
  }

  const out: FormationResult = {
    geo,
    rgeo,
    m,
    pix,
    kVp: fr.req.kVp,
    eRef: poly.eRef,
    muRef,
    truthHU,
    monoLine: cap.monoLine!,
    polyLine: cap.polyLine!,
    expected: cap.expected!,
    counts: cap.counts!,
    raw: cap.raw!,
    p: cap.p!,
    q: cap.q!,
    n0: cap.n0!,
    fbpHU,
    bpRaw,
    bhc,
    stats: sres.stats,
    fbpNoise,
    fbpRmse,
    ms: 0,
  };

  // --- aşamalı geri izdüşüm
  if (fr.progressive) {
    const ks = divisorSteps(rgeo.nv, [1, 2, 4, 8, 16, 32, 64, 128, 256]);
    const filtered: Float32Array[] = [], unfiltered: Float32Array[] = [];
    for (const k of ks) {
      const a = new Float32Array(N);
      bpEven(cap.q!, rgeo, k, rg, a);
      for (let i = 0; i < N; i++) a[i] = toHU(a[i]);
      filtered.push(mask(a));
      const b = new Float32Array(N);
      bpEven(cap.p!, rgeo, k, rg, b);
      for (let i = 0; i < N; i++) if (!inS[i]) b[i] = 0;
      unfiltered.push(b);
    }
    out.even = { filtered: { k: ks, imgs: filtered }, unfiltered: { k: ks, imgs: unfiltered } };
    // gantri dönerken: ardışık açı aralığı [0, k) – kümülatif
    const fr2 = [1 / 16, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 7 / 8, 1];
    const kk = [...new Set(fr2.map((f) => Math.max(1, Math.round(f * rgeo.nv))))];
    const acc = new Float32Array(N);
    const seq: Float32Array[] = [];
    let prev = 0;
    for (const k of kk) {
      backproject(cap.q!, rgeo, rg, acc, prev, k);
      prev = k;
      const img = new Float32Array(N);
      const sc = rgeo.nv / k;
      for (let i = 0; i < N; i++) img[i] = toHU(acc[i] * sc);
      seq.push(mask(img));
    }
    out.sequential = { k: kk, imgs: seq };
  }

  // --- tam istatistiksel iteratif rekonstrüksiyon
  if (fr.iterative) {
    out.iter = iterativeRecon(cap.p!, cap.w!, rgeo, rg, muRef, fr.iterative, fbpHU, truthHU, undefined, cap.blurBins ?? 0);
  }
  out.ms = performance.now() - t0;
  return out;
}

/** postMessage için aktarılabilir tamponlar. */
export function formationTransfer(r: FormationResult): Transferable[] {
  const arrs: Float32Array[] = [r.truthHU, r.monoLine, r.polyLine, r.expected, r.counts, r.raw, r.p, r.q, r.n0, r.fbpHU, r.bpRaw];
  if (r.even) arrs.push(...r.even.filtered.imgs, ...r.even.unfiltered.imgs);
  if (r.sequential) arrs.push(...r.sequential.imgs);
  if (r.iter) for (const s of r.iter.snaps) arrs.push(s.img, s.residual, s.update_img);
  const seen = new Set<ArrayBuffer>();
  const out: Transferable[] = [];
  for (const a of arrs) {
    const b = a.buffer as ArrayBuffer;
    if (!seen.has(b)) {
      seen.add(b);
      out.push(b);
    }
  }
  return out;
}
