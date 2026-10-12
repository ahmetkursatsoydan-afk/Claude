/**
 * Tek aksiyel kesit için uçtan uca BT veri toplama + rekonstrüksiyon simülasyonu:
 *
 *  fantom (kesit hassasiyet profili boyunca kısmi hacim) → kanal başına çizgi integralleri
 *  → odak noktası/dedektör bulanıklığı → polikromatik geçirgenlik (papyon filtresi dahil)
 *  → foton istatistiği (Poisson + elektronik gürültü, açısal mA modülasyonu)
 *  → log dönüşümü → su ışın sertleşmesi düzeltmesi → [IR: izdüşüm alanı filtre]
 *  → FBP (kernel) → [MAR] → [IR: görüntü alanı] → HU
 */
import { KERNELS } from '../physics/kernels';
import { makeConcFn } from '../physics/contrast';
import { breathWeight, rasterizeSlab, type Grid, type PhantomModel } from '../phantom/raster';
import { buildPolyModel, applyBhc, polyEval, type PolyModel } from './poly';
import { projectJoseph, backproject, type ProjGeom, type ReconGrid } from './projector';
import { filterSinogram } from './fbp';
import { adaptiveSinoFilter, estimateNoise, irImageDomain } from './ir';
import { inpaintTrace, metalTrace } from './mar';
import { Rng, hashSeed } from './rng';
import { PHANTOM_GRID_MM, QUALITY, SFOV_MM, SOURCE_DET_MM, SOURCE_ISO_MM, type SliceRequest, type SliceResult } from './protocol';

/** Gürültü kalibrasyon sabiti: ışın başına NEQ = K · mAs_eff · T(mm) · ds(mm) / nv · neq0(grup) */
export const NOISE_K = 5.2e6;
/** Elektronik gürültü (kuanta eşdeğeri) */
export const ELECTRONIC_SIGMA = 2.0;
/** Saçılma genliği (kolimasyon başına) ve çekirdek genişliği (izomerkezde, mm) */
export const SCATTER_K = 4.3e-4;
export const SCATTER_SIGMA_MM = 55;

/** Üç kez kutu bulanıklığı ≈ Gauss (σ ≈ r). Kenarlar sıfır dolgulu. */
function boxBlur3(a: Float32Array, tmp: Float32Array, n: number, r: number): void {
  const w = 2 * Math.round(r * 1.0) + 1;
  const h = (w - 1) >> 1;
  for (let pass = 0; pass < 3; pass++) {
    let acc = 0;
    for (let i = 0; i <= h && i < n; i++) acc += a[i];
    for (let i = 0; i < n; i++) {
      tmp[i] = acc / w;
      const add = i + h + 1, sub = i - h;
      if (add < n) acc += a[add];
      if (sub >= 0) acc -= a[sub];
    }
    a.set(tmp);
  }
}

const polyCache = new Map<string, PolyModel>();
export function getPoly(kVp: number, bowtie: 'body' | 'head', nb: number, ds: number): PolyModel {
  const key = `${kVp}|${bowtie}|${nb}|${ds}`;
  let p = polyCache.get(key);
  if (!p) {
    p = buildPolyModel(kVp, bowtie, nb, ds);
    polyCache.set(key, p);
    if (polyCache.size > 12) polyCache.delete(polyCache.keys().next().value as string);
  }
  return p;
}

/** Kutu (nominal kalınlık) ⊛ üçgen (helikal enterpolasyon) kesit hassasiyet profili. */
export function sspSamples(thickness: number, rowWidth: number, pitch: number, dz: number, maxN = 6): { offs: number[]; ws: number[]; fwhm: number } {
  const h = rowWidth * (0.45 + 0.45 * pitch); // üçgen yarı tabanı (= FWHM)
  const a = thickness / 2;
  const span = thickness + 2 * h;
  const n = Math.max(2, Math.min(maxN, Math.ceil(span / dz)));
  const offs: number[] = [], ws: number[] = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const z = -span / 2 + ((k + 0.5) / n) * span;
    let w = 0;
    const M = 24;
    for (let q = 0; q < M; q++) {
      const u = -h + ((q + 0.5) / M) * 2 * h;
      if (Math.abs(z - u) <= a) w += 1 - Math.abs(u) / h;
    }
    offs.push(z);
    ws.push(w);
    sum += w;
  }
  for (let k = 0; k < n; k++) ws[k] /= sum;
  // FWHM ≈ max(T, h) yaklaşık
  const fwhm = thickness >= h ? thickness + (h * h) / (3 * thickness) : h + (thickness * thickness) / (3 * h);
  return { offs, ws, fwhm };
}

interface Work {
  n: number;
  tmp: Float32Array[];
  out: Float32Array[];
}
let work: Work | null = null;
function getWork(n: number): Work {
  if (!work || work.n !== n) {
    work = {
      n,
      tmp: [0, 1, 2, 3].map(() => new Float32Array(n * n)),
      out: [0, 1, 2, 3].map(() => new Float32Array(n * n)),
    };
  }
  return work;
}

function starvationCorrection(p: Float32Array, neq: Float32Array, nv: number, nb: number): void {
  const THR = 25;
  let any = false;
  for (let i = 0; i < neq.length; i++) if (neq[i] < THR) { any = true; break; }
  if (!any) return;
  const src = new Float32Array(p);
  for (let v = 0; v < nv; v++) {
    for (let b = 0; b < nb; b++) {
      const k = v * nb + b;
      const n = neq[k];
      if (n >= THR) continue;
      const r = THR / Math.max(n, 0.02);
      const hw = Math.min(12, 1 + Math.round(2.2 * Math.log2(r + 1)));
      const hv = n < 0.5 ? 2 : n < 4 ? 1 : 0;
      let s = 0, c = 0;
      for (let dv = -hv; dv <= hv; dv++) {
        const vv = (v + dv + nv) % nv;
        for (let db = -hw; db <= hw; db++) {
          const bb = b + db;
          if (bb < 0 || bb >= nb) continue;
          s += src[vv * nb + bb];
          c++;
        }
      }
      const a = Math.min(0.97, 0.4 * Math.sqrt(r));
      p[k] = src[k] * (1 - a) + (s / c) * a;
    }
  }
}

function blurRows(a: Float32Array, nv: number, nb: number, sigmaBins: number): void {
  if (sigmaBins < 0.05) return;
  const k1 = Math.exp(-1 / (2 * sigmaBins * sigmaBins));
  const k2 = Math.exp(-4 / (2 * sigmaBins * sigmaBins));
  const s = 1 + 2 * k1 + 2 * k2;
  const w0 = 1 / s, w1 = k1 / s, w2 = k2 / s;
  const row = new Float32Array(nb);
  for (let v = 0; v < nv; v++) {
    const o = v * nb;
    for (let b = 0; b < nb; b++) row[b] = a[o + b];
    for (let b = 2; b < nb - 2; b++) a[o + b] = w0 * row[b] + w1 * (row[b - 1] + row[b + 1]) + w2 * (row[b - 2] + row[b + 2]);
  }
}

/** İsteğe bağlı hızlandırıcı (WebGL2). */
export interface Accel {
  name: string;
  forward(chs: Float32Array[], n: number, dx: number, bb: import('../phantom/raster').BBox, geo: ProjGeom, outs: Float32Array[]): void;
  backproject(q: Float32Array, geo: ProjGeom, rg: ReconGrid, out: Float32Array): void;
}

export function computeSlice(model: PhantomModel, req: SliceRequest, accel?: Accel | null): SliceResult {
  const t0 = performance.now();
  const tm: Record<string, number> = {};
  let tl = t0;
  const lap = (k: string) => {
    const t = performance.now();
    tm[k] = (tm[k] ?? 0) + (t - tl);
    tl = t;
  };
  const Q = QUALITY[req.quality];
  // --- fantom ızgarası (SFOV'u kapsar, izomerkez merkezli)
  // Fantom ızgarası SFOV'dan geniştir (700 mm): 50 cm tarama alanını aşan vücut kısımları
  // (obez hasta, yanlarda kollar) dedektörün dışında kalır → kesilme (truncation) artefaktı.
  let n = Math.ceil(PHANTOM_GRID_MM / Q.dx);
  if (n % 2) n++;
  const dx = Q.dx;
  const grid: Grid = { n, dx, x0: req.isoXp - ((n - 1) / 2) * dx, y0: req.isoYp - ((n - 1) / 2) * dx };
  let nb = Math.ceil(SFOV_MM / Q.ds);
  if (nb % 2) nb++;
  const geo: ProjGeom = { nv: Q.nv, nb, ds: Q.ds };
  const NR = geo.nv * geo.nb;

  // --- solunum hareketi: kesitin verisi ≈ 0.62·rotasyon süresince toplanır (yarım tarama + yelpaze).
  // Bu süre boyunca diyafram/karın organları hareket ederse farklı görünümler farklı anatomiyi
  // görür → tutarsız sinogram → çift kontur, çizgi ve bulanıklık. Ayrıca her kesit farklı anda
  // alındığından MPR'de diyafram kenarı basamaklı/kopuk görünür.
  const period = Math.max(1, req.breathPeriod ?? 4);
  const tAcq = req.tAcq ?? 0;
  const bStart = req.breathStartS ?? 0;
  const amp = (req.breathAmp ?? 0) * (bStart > 0 ? Math.max(0, Math.min(1, (tAcq - bStart) / 3)) : 1);
  const tSpan = 0.62 * (req.rotTime ?? 0.5);
  const dispAt = (t: number) => amp > 0 ? 0.5 * amp * Math.sin((2 * Math.PI * t) / period + (req.breathPhase ?? 0)) : 0;
  const moving = amp > 0 && breathWeight(req.z) > 0.02;
  // Hareket varsa K anahtar an (zaman) için fantom rasterleştirilir; her görünümün izdüşümü komşu
  // iki anahtar anın izdüşümleri arasında doğrusal harmanlanır → görünüm açısıyla sürekli değişen anatomi.
  const K = moving ? (req.quality === 'fast' ? 3 : 4) : 1;

  // --- kısmi hacim: kesit profili boyunca alt örnekleme
  const ssp = sspSamples(req.thickness, req.rowWidth, req.pitch, Q.dz, moving ? 4 : 6);
  const zs = ssp.offs.map((o) => req.z + o);
  const conc = makeConcFn(req.timeS);
  const w = getWork(n);
  const L = [0, 1, 2, 3].map(() => new Float32Array(NR));
  const tmpL = K > 1 ? [0, 1, 2, 3].map(() => new Float32Array(NR)) : null;
  const segV = (sIdx: number) => Math.floor((sIdx * geo.nv) / Math.max(1, K - 1));
  let hasI = false, hasM = false;
  let ras: ReturnType<typeof rasterizeSlab> | null = null;
  let dMin = Infinity, dMax = -Infinity;
  for (let k = 0; k < K; k++) {
    const disp = moving ? dispAt(tAcq + (k / (K - 1) - 0.5) * tSpan) : 0;
    dMin = Math.min(dMin, disp);
    dMax = Math.max(dMax, disp);
    ras = rasterizeSlab(model, zs, ssp.ws, grid, conc ? () => conc : null, w, disp);
    hasI ||= ras.hasI;
    hasM ||= ras.hasM;
    lap('raster');
    // --- kanal başına çizgi integralleri (g/cm²)
    if (K === 1) {
      if (accel) accel.forward(ras.buf, n, dx, ras.bb, geo, L);
      else {
        projectJoseph([ras.buf[0], ras.buf[1]], n, dx, ras.bb, geo, [L[0], L[1]]);
        if (ras.hasI || ras.hasM) projectJoseph([ras.buf[2], ras.buf[3]], n, dx, ras.bb, geo, [L[2], L[3]]);
      }
    } else {
      // bu anahtar anın etkilediği görünümler: önceki ve sonraki segment
      const lo = segV(Math.max(0, k - 1)), hi = segV(Math.min(K - 1, k + 1));
      const im = ras.hasI || ras.hasM;
      if (accel) accel.forward(ras.buf, n, dx, ras.bb, geo, tmpL!);
      else {
        projectJoseph([ras.buf[0], ras.buf[1]], n, dx, ras.bb, geo, [tmpL![0], tmpL![1]], { v0: lo, v1: hi });
        if (im) projectJoseph([ras.buf[2], ras.buf[3]], n, dx, ras.bb, geo, [tmpL![2], tmpL![3]], { v0: lo, v1: hi });
      }
      for (let v = lo; v < hi; v++) {
        const sIdx = v < segV(k) ? k - 1 : k; // görünümün segmenti
        const va = segV(sIdx), vb = segV(sIdx + 1);
        const f = (v - va) / Math.max(1, vb - va);
        const wk = sIdx === k ? 1 - f : f;
        const o = v * nb;
        for (let c = 0; c < (im ? 4 : 2); c++) {
          const src = tmpL![c], dst = L[c];
          for (let bb = 0; bb < nb; bb++) dst[o + bb] += wk * src[o + bb];
        }
      }
    }
    lap('proj');
  }
  ras = { ...ras!, hasI, hasM };
  const motionMm = moving ? (dMax - dMin) * breathWeight(req.z) : 0;
  // --- odak noktası + dedektör açıklığı bulanıklığı
  const mag = (SOURCE_DET_MM - SOURCE_ISO_MM) / SOURCE_DET_MM;
  const focalIso = (req.focalLarge ? 1.2 : 0.7) * mag;
  // dedektör açıklığı (kutu, genişlik ≈ kanal aralığı → σ² = ds²/12) + odak noktası (Gauss)
  const fwhm = Math.sqrt(focalIso * focalIso + (2.355 * 2.355 * Q.ds * Q.ds) / 12);
  const sigB = fwhm / 2.355 / Q.ds;
  for (let c = 0; c < 4; c++) if (c < 2 || ras.hasI || ras.hasM) blurRows(L[c], geo.nv, geo.nb, sigB);

  // --- polikromatik geçirgenlik
  const poly = getPoly(req.kVp, req.bowtie, nb, Q.ds);
  const nE = poly.nE;
  const te = new Float32Array(NR);
  const neqRel = new Float32Array(NR);
  const useIM = ras.hasI || ras.hasM;
  const pa = new Float64Array(2), pb = new Float64Array(2);
  for (let v = 0; v < geo.nv; v++) {
    const o = v * nb;
    for (let b = 0; b < nb; b++) {
      const k = o + b;
      const lw = L[0][k], lb = L[1][k];
      const li = useIM ? L[2][k] : 0, lm = useIM ? L[3][k] : 0;
      if (lw === 0 && lb === 0 && li === 0 && lm === 0) {
        te[k] = 1;
        neqRel[k] = 1;
        continue;
      }
      const f = poly.groupF[b];
      polyEval(poly.groups[poly.groupA[b]], nE, lw, lb, li, lm, pa);
      if (f > 0.001) {
        polyEval(poly.groups[poly.groupB[b]], nE, lw, lb, li, lm, pb);
        te[k] = pa[0] + (pb[0] - pa[0]) * f;
        neqRel[k] = pa[1] + (pb[1] - pa[1]) * f;
      } else {
        te[k] = pa[0];
        neqRel[k] = pa[1];
      }
    }
  }

  lap('poly');
  // --- açısal mA modülasyonu (ATCM)
  const vmod = new Float32Array(geo.nv).fill(1);
  if (req.angularMod) {
    let mean = 0;
    for (let v = 0; v < geo.nv; v++) {
      let mx = 0;
      const o = v * nb;
      for (let b = 0; b < nb; b++) {
        const pp = -Math.log(Math.max(1e-30, te[o + b]));
        if (pp > mx) mx = pp;
      }
      vmod[v] = Math.exp(0.5 * mx);
      mean += vmod[v];
    }
    mean /= geo.nv;
    let m2 = 0;
    for (let v = 0; v < geo.nv; v++) {
      vmod[v] = Math.min(2.5, Math.max(0.35, vmod[v] / mean));
      m2 += vmod[v];
    }
    m2 /= geo.nv;
    for (let v = 0; v < geo.nv; v++) vmod[v] /= m2;
  }

  // --- foton istatistiği
  const rng = new Rng(hashSeed(req.seed, req.z, req.thickness, req.kVp));
  const base = (NOISE_K * req.mAsEff * req.thickness * Q.ds) / geo.nv;
  // mutlak referans: 120 kVp merkez ışını (kVp'ye bağlı tüp çıkışı korunur)
  const g0neq = getPoly(120, 'body', nb, Q.ds).groups[0].neq0;
  const p = new Float32Array(NR);
  const neqAbs = new Float32Array(NR);
  let sumNeq = 0, minNeq = Infinity, starved = 0, cnt = 0;
  const midV = Math.floor(geo.nv / 2);
  const countsView = new Float32Array(nb);
  const fluxProfile = new Float32Array(nb);
  const es = ELECTRONIC_SIGMA;
  const sig = new Float32Array(NR); // ölçülen göreli sinyal I/I0
  const n0row = new Float32Array(nb);
  // --- saçılma: birincil akı × −ln(T) (saçılma olasılığı) → geniş çekirdekle dedektöre yayılır.
  // Genlik toplam kolimasyonla artar (geniş ışın → daha çok saçılan hacim; 2B ızgara ile sınırlı).
  const coll = req.collimation ?? 0;
  const kScat = coll > 0 ? SCATTER_K * (coll / (1 + coll / 150)) : 0;
  const eta = req.scatterCorr === false ? 0 : 0.9;
  const scat = new Float32Array(nb);
  const sTmp = new Float32Array(nb);
  const sRad = Math.max(1, Math.round(SCATTER_SIGMA_MM / Q.ds));
  const cbin = Math.floor(nb / 2);
  let sprSum = 0;
  for (let v = 0; v < geo.nv; v++) {
    const o = v * nb;
    const mv = vmod[v];
    for (let b = 0; b < nb; b++) {
      const gA = poly.groups[poly.groupA[b]], gB = poly.groups[poly.groupB[b]], gf = poly.groupF[b];
      const neq0 = gA.neq0 + (gB.neq0 - gA.neq0) * gf;
      n0row[b] = base * mv * (neq0 / g0neq);
      if (v === 0) fluxProfile[b] = neq0 / g0neq;
    }
    if (kScat > 0) {
      for (let b = 0; b < nb; b++) {
        const t = te[o + b];
        scat[b] = t < 0.999 ? n0row[b] * t * -Math.log(t) : 0;
      }
      boxBlur3(scat, sTmp, nb, sRad);
      for (let b = 0; b < nb; b++) scat[b] *= kScat;
    }
    for (let b = 0; b < nb; b++) {
      const k = o + b;
      const n0 = n0row[b];
      const neq = n0 * neqRel[k];
      const sc = kScat > 0 ? scat[b] : 0;
      const tot = neq + sc;
      let meas: number;
      if (tot < 25) meas = rng.poisson(tot) + es * rng.gauss();
      else meas = tot + Math.sqrt(tot + es * es) * rng.gauss();
      // dedektör toplam (birincil + saçılan) sayar; düzeltme saçılma tahminini çıkarır
      sig[k] = te[k] * ((meas - eta * sc) / Math.max(neq, 1e-9));
      neqAbs[k] = (neq * neq) / Math.max(tot, 1e-9); // etkin NEQ: saçılma sinyal katmadan gürültü ekler
      if (b === cbin) sprSum += sc / Math.max(neq, 1e-9);
      if (v === midV) countsView[b] = meas;
      if (te[k] < 0.999) {
        sumNeq += neq;
        cnt++;
        if (neq < minNeq) minNeq = neq;
        if (neq < 20) starved++;
      }
    }
    for (let b = 0; b < nb; b++) {
      const k = o + b;
      const floor = 1.0 / Math.max(1, n0row[b]);
      if (sig[k] < floor) sig[k] = floor;
      let pv = -Math.log(sig[k]);
      if (!isFinite(pv)) pv = 30;
      const gA = poly.groups[poly.groupA[b]], gB = poly.groups[poly.groupB[b]], gf = poly.groupF[b];
      p[k] = gf > 0.001 ? applyBhc(gA, pv) * (1 - gf) + applyBhc(gB, pv) * gf : applyBhc(gA, pv);
    }
  }

  // --- Düşük sinyal (foton açlığı) düzeltmesi: tüm ticari sistemlerde rekonstrüksiyondan önce
  // uygulanan uyarlamalı 2B (kanal × görünüm) filtre. Çok düşük sayımlı ışınlar, sayım azaldıkça
  // büyüyen bir pencerede komşularıyla ortalanır; sapma (metal izinde düşük tahmin) kalır →
  // klasik koyu/parlak metal çizgileri, ancak tuz-biber gürültüsü bastırılır.
  starvationCorrection(p, neqAbs, geo.nv, nb);

  lap('noise');
  // --- rekonstrüksiyon
  const kernel = KERNELS[req.kernel];
  if (req.recon === 'IR') adaptiveSinoFilter(p, neqAbs, geo.nv, nb, 0.3 + 0.12 * req.irLevel);
  const m = req.matrix;
  const rg: ReconGrid = { m, pix: req.dfov / m, cx: req.reconCx, cy: req.reconCy };
  let q = filterSinogram(p, geo, kernel);
  const bpFn = (qq: Float32Array, out: Float32Array) => (accel ? accel.backproject(qq, geo, rg, out) : backproject(qq, geo, rg, out));
  let mu = new Float32Array(m * m);
  bpFn(q, mu);
  const muRef = poly.muRef;
  const toHU = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = (1000 * (arr[i] - muRef)) / muRef;
    return out;
  };
  let hu = toHU(mu);

  if (req.mar && ras.hasM) {
    const mask = new Float32Array(m * m);
    let any = false;
    for (let i = 0; i < m * m; i++)
      if (hu[i] > 2600) {
        mask[i] = 1;
        any = true;
      }
    if (any) {
      const tr = metalTrace(mask, rg, geo);
      const p2 = new Float32Array(p);
      inpaintTrace(p2, tr, geo);
      q = filterSinogram(p2, geo, kernel);
      mu = new Float32Array(m * m);
      bpFn(q, mu);
      const hu2 = toHU(mu);
      for (let i = 0; i < m * m; i++) if (mask[i]) hu2[i] = hu[i];
      hu = hu2;
    }
  }

  const sigma = estimateNoise(hu, m);
  if (req.recon === 'IR') hu = irImageDomain(hu, m, req.irLevel, sigma);

  // SFOV dışı
  const half = (m - 1) / 2;
  const R2 = (SFOV_MM / 2) * (SFOV_MM / 2);
  const out = new Int16Array(m * m);
  for (let r = 0; r < m; r++) {
    const y = rg.cy + (r - half) * rg.pix;
    for (let c = 0; c < m; c++) {
      const x = rg.cx + (c - half) * rg.pix;
      const k = r * m + c;
      if (x * x + y * y > R2) {
        out[k] = -1024;
        continue;
      }
      const v = Math.round(hu[k]);
      out[k] = v < -1024 ? -1024 : v > 32000 ? 32000 : v;
    }
  }

  const res: SliceResult = {
    hu: out,
    m,
    stats: {
      meanNeq: cnt ? sumNeq / cnt : 0,
      minNeq: isFinite(minNeq) ? minNeq : 0,
      starvedFrac: cnt ? starved / cnt : 0,
      noiseSigma: req.recon === 'IR' ? estimateNoise(hu, m) : sigma,
      hasMetal: ras.hasM,
      hasIodine: ras.hasI,
      eRef: poly.eRef,
      ms: (lap('recon'), performance.now() - t0),
      timing: tm,
      accel: accel ? accel.name : 'CPU',
      spr: sprSum / geo.nv,
      motionMm,
    },
  };

  if (req.debug) {
    const pn = 256;
    const prev = new Float32Array(pn * pn);
    const step = n / pn;
    for (let j = 0; j < pn; j++)
      for (let i = 0; i < pn; i++) {
        const si = Math.floor((i + 0.5) * step), sj = Math.floor((j + 0.5) * step);
        const k = sj * n + si;
        prev[j * pn + i] = ras.buf[0][k] + 2 * ras.buf[1][k] + 20 * ras.buf[2][k] + 4 * ras.buf[3][k];
      }
    const tv = new Float32Array(nb);
    for (let b = 0; b < nb; b++) tv[b] = te[midV * nb + b];
    res.debug = {
      nv: geo.nv,
      nb,
      ds: Q.ds,
      sino: p,
      filtered: q,
      transmissionView: tv,
      countsView,
      fluxProfile,
      phantomPreview: prev,
      phantomN: pn,
      phantomDx: (n * dx) / pn,
      rg: { ...rg },
    };
  }
  return res;
}
