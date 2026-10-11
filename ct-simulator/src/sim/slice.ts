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
import { rasterizeSlab, type Grid, type PhantomModel } from '../phantom/raster';
import { buildPolyModel, applyBhc, LUT_B_MAX, LUT_B_MIN, LUT_NB, LUT_NW, LUT_W_MAX, type PolyModel } from './poly';
import { projectJoseph, backproject, type ProjGeom, type ReconGrid } from './projector';
import { filterSinogram } from './fbp';
import { adaptiveSinoFilter, estimateNoise, irImageDomain } from './ir';
import { inpaintTrace, metalTrace } from './mar';
import { Rng, hashSeed } from './rng';
import { QUALITY, SFOV_MM, SOURCE_DET_MM, SOURCE_ISO_MM, type SliceRequest, type SliceResult } from './protocol';

const LW_SCALE = (LUT_NW - 1) / LUT_W_MAX;
const LB_SCALE = (LUT_NB - 1) / (LUT_B_MAX - LUT_B_MIN);

/** Gürültü kalibrasyon sabiti: ışın başına NEQ = K · mAs_eff · T(mm) · ds(mm) / nv · neq0(grup) */
export const NOISE_K = 5.2e6;
/** Elektronik gürültü (kuanta eşdeğeri) */
export const ELECTRONIC_SIGMA = 3.0;

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
export function sspSamples(thickness: number, rowWidth: number, pitch: number, dz: number): { offs: number[]; ws: number[]; fwhm: number } {
  const h = rowWidth * (0.45 + 0.45 * pitch); // üçgen yarı tabanı (= FWHM)
  const a = thickness / 2;
  const span = thickness + 2 * h;
  const n = Math.max(2, Math.min(7, Math.ceil(span / dz)));
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

export function computeSlice(model: PhantomModel, req: SliceRequest): SliceResult {
  const t0 = performance.now();
  const Q = QUALITY[req.quality];
  // --- fantom ızgarası (SFOV'u kapsar, izomerkez merkezli)
  let n = Math.ceil(SFOV_MM / Q.dx);
  if (n % 2) n++;
  const dx = Q.dx;
  const grid: Grid = { n, dx, x0: req.isoXp - ((n - 1) / 2) * dx, y0: req.isoYp - ((n - 1) / 2) * dx };
  let nb = Math.ceil(SFOV_MM / Q.ds);
  if (nb % 2) nb++;
  const geo: ProjGeom = { nv: Q.nv, nb, ds: Q.ds };
  const NR = geo.nv * geo.nb;

  // --- kısmi hacim: kesit profili boyunca alt örnekleme
  const ssp = sspSamples(req.thickness, req.rowWidth, req.pitch, Q.dz);
  const zs = ssp.offs.map((o) => req.z + o);
  const conc = makeConcFn(req.timeS);
  const w = getWork(n);
  const ras = rasterizeSlab(model, zs, ssp.ws, grid, conc ? () => conc : null, w);

  // --- kanal başına çizgi integralleri (g/cm²)
  const L = [0, 1, 2, 3].map(() => new Float32Array(NR));
  projectJoseph([ras.buf[0], ras.buf[1]], n, dx, ras.bb, geo, [L[0], L[1]]);
  if (ras.hasI || ras.hasM) projectJoseph([ras.buf[2], ras.buf[3]], n, dx, ras.bb, geo, [L[2], L[3]]);

  // --- odak noktası + dedektör açıklığı bulanıklığı
  const mag = (SOURCE_DET_MM - SOURCE_ISO_MM) / SOURCE_DET_MM;
  const focalIso = (req.focalLarge ? 1.2 : 0.7) * mag;
  const fwhm = Math.sqrt(focalIso * focalIso + 0.25 * Q.ds * Q.ds);
  const sigB = fwhm / 2.355 / Q.ds;
  for (let c = 0; c < 4; c++) if (c < 2 || ras.hasI || ras.hasM) blurRows(L[c], geo.nv, geo.nb, sigB);

  // --- polikromatik geçirgenlik
  const poly = getPoly(req.kVp, req.bowtie, nb, Q.ds);
  const nE = poly.nE;
  const te = new Float32Array(NR);
  const neqRel = new Float32Array(NR);
  const useIM = ras.hasI || ras.hasM;
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
      const g = poly.groups[poly.groupOfBin[b]];
      if (li === 0 && lm === 0 && lw >= 0 && lb > LUT_B_MIN && lw < LUT_W_MAX && lb < LUT_B_MAX) {
        const uw = lw * LW_SCALE, ub = (lb - LUT_B_MIN) * LB_SCALE;
        const iw = uw | 0, ib = ub | 0;
        const fw = uw - iw, fb = ub - ib;
        const lut = g.lut;
        const o00 = 2 * (ib * LUT_NW + iw), o01 = o00 + 2, o10 = o00 + 2 * LUT_NW, o11 = o10 + 2;
        const pA = (lut[o00] * (1 - fw) + lut[o01] * fw) * (1 - fb) + (lut[o10] * (1 - fw) + lut[o11] * fw) * fb;
        const pB = (lut[o00 + 1] * (1 - fw) + lut[o01 + 1] * fw) * (1 - fb) + (lut[o10 + 1] * (1 - fw) + lut[o11 + 1] * fw) * fb;
        te[k] = Math.exp(-pA);
        neqRel[k] = Math.exp(-pB);
        continue;
      }
      const mu = g.mu, wE = g.wE, w2 = g.w2;
      let s1 = 0, s2 = 0;
      for (let e = 0; e < nE; e++) {
        const x = lw * mu[e] + lb * mu[nE + e] + li * mu[2 * nE + e] + lm * mu[3 * nE + e];
        const ex = Math.exp(-x);
        s1 += wE[e] * ex;
        s2 += w2[e] * ex;
      }
      te[k] = s1;
      neqRel[k] = s2 > 0 ? (s1 * s1) / s2 : 0;
    }
  }

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
  for (let v = 0; v < geo.nv; v++) {
    const o = v * nb;
    const mv = vmod[v];
    for (let b = 0; b < nb; b++) {
      const k = o + b;
      const g = poly.groups[poly.groupOfBin[b]];
      const n0 = base * mv * (g.neq0 / g0neq);
      if (v === 0) fluxProfile[b] = g.neq0 / g0neq;
      const neq = n0 * neqRel[k];
      let meas: number;
      if (neq < 25) meas = rng.poisson(neq) + es * rng.gauss();
      else meas = neq + Math.sqrt(neq + es * es) * rng.gauss();
      if (meas < 0.35) meas = 0.35;
      const signal = te[k] * (meas / Math.max(neq, 1e-9));
      let pv = -Math.log(Math.max(signal, 1e-12));
      if (!isFinite(pv)) pv = 30;
      p[k] = applyBhc(g, pv);
      neqAbs[k] = neq;
      if (v === midV) countsView[b] = meas;
      if (te[k] < 0.999) {
        sumNeq += neq;
        cnt++;
        if (neq < minNeq) minNeq = neq;
        if (neq < 20) starved++;
      }
    }
  }

  // --- rekonstrüksiyon
  const kernel = KERNELS[req.kernel];
  if (req.recon === 'IR') adaptiveSinoFilter(p, neqAbs, geo.nv, nb, 0.3 + 0.12 * req.irLevel);
  const m = req.matrix;
  const rg: ReconGrid = { m, pix: req.dfov / m, cx: req.reconCx, cy: req.reconCy };
  let q = filterSinogram(p, geo, kernel);
  let mu = new Float32Array(m * m);
  backproject(q, geo, rg, mu);
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
      backproject(q, geo, rg, mu);
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
      ms: performance.now() - t0,
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
