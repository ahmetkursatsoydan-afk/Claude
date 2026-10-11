/**
 * Polikromatik ışın modeli: papyon (bowtie) grubu başına enerji gruplarına sıkıştırılmış
 * spektrum ağırlıkları, kanal zayıflatma tabloları, NEQ (gürültü eşdeğeri kuanta)
 * ağırlıkları ve su ışın sertleşmesi düzeltmesi (BHC) tabloları.
 *
 * Enerji-entegre eden dedektör: sinyal S = Σ E·N(E)·e^{−μ(E)L},
 * varyans Var(S) = Σ E²·N(E)·e^{−μ(E)L} (bileşik Poisson) → NEQ = S²/Var(S).
 */
import { channelMassAtten, massAtten, NCH, IODINE_K_EDGE_KEV } from '../physics/materials';
import { bowtieAlMm, filterSpectrum, tubeSpectrum, type BowtieType, type Spectrum } from '../physics/spectrum';

export interface PolyGroup {
  /** normalize enerji-ağırlıklı spektrum (Σ=1) */
  wE: Float64Array;
  /** normalize E²-ağırlıklı (Σ=1) */
  w2: Float64Array;
  /** mu[c*nE + k] kütle zayıflatma (cm²/g) */
  mu: Float64Array;
  /** zayıflatmasız göreli NEQ (merkez grup = 1 olacak şekilde ölçekli değil; mutlak göreli) */
  neq0: number;
  /** BHC: p → μref·Lsu  (eşit aralıklı p tablosu) */
  bhc: Float32Array;
  bhcDp: number;
  bhcSlopeEnd: number;
  /** (Lw, Lb) → [−ln Te, −ln NEQrel] 2B tablo (yalnızca su+kemik ışınları için; Lb negatif olabilir: yağ) */
  lut: Float32Array;
}

export const LUT_W_MAX = 72;
export const LUT_B_MAX = 24;
export const LUT_B_MIN = -4;
export const LUT_NW = 289;
export const LUT_NB = 113;

export interface PolyModel {
  kVp: number;
  bowtie: BowtieType;
  nE: number;
  eCenters: number[];
  groups: PolyGroup[];
  /** bin → grup */
  groupOfBin: Uint16Array;
  /** referans (etkin) enerji ve suyun lineer katsayısı (1/cm) */
  eRef: number;
  muRef: number;
  /** merkez spektrum */
  centerSpectrum: Spectrum;
}

/** Enerji grup sınırları (keV) — iyot K-kenarı bir sınırdır. */
function energyEdges(kVp: number): number[] {
  const base = [15, 25, 30, IODINE_K_EDGE_KEV, 37, 41, 45, 50, 55, 60, 65, 70, 76, 82, 90, 100, 112, 125, 140, 151];
  const e = base.filter((x) => x < kVp);
  e.push(kVp);
  return e;
}

const N_BOWTIE_GROUPS = 24;
const S_MAX = 260;

function groupS(g: number): number {
  return (g / (N_BOWTIE_GROUPS - 1)) * S_MAX;
}

export function buildPolyModel(kVp: number, bowtie: BowtieType, nb: number, ds: number): PolyModel {
  const base = tubeSpectrum(kVp);
  const edges = energyEdges(kVp);
  const nE = edges.length - 1;
  const eCenters: number[] = [];
  for (let k = 0; k < nE; k++) eCenters.push(0.5 * (edges[k] + edges[k + 1]));
  const groups: PolyGroup[] = [];

  for (let g = 0; g < N_BOWTIE_GROUPS; g++) {
    const spec = filterSpectrum(base, 'aluminum', bowtieAlMm(bowtie, groupS(g)));
    const wE = new Float64Array(nE);
    const w2 = new Float64Array(nE);
    const mu = new Float64Array(NCH * nE);
    let sE = 0, sE2 = 0;
    for (let i = 0; i < spec.energies.length; i++) {
      const e = spec.energies[i];
      const n = spec.photons[i];
      let k = 0;
      while (k < nE - 1 && e >= edges[k + 1]) k++;
      if (e < edges[0]) continue;
      const we = e * n;
      wE[k] += we;
      w2[k] += e * e * n;
      sE += we;
      sE2 += e * e * n;
      for (let c = 0; c < NCH; c++) mu[c * nE + k] += we * channelMassAtten(c, e);
    }
    for (let k = 0; k < nE; k++) {
      for (let c = 0; c < NCH; c++) mu[c * nE + k] = wE[k] > 0 ? mu[c * nE + k] / wE[k] : channelMassAtten(c, eCenters[k]);
    }
    for (let k = 0; k < nE; k++) {
      wE[k] /= sE;
      w2[k] /= sE2;
    }
    groups.push({ wE, w2, mu, neq0: (sE * sE) / sE2, bhc: new Float32Array(0), bhcDp: 1, bhcSlopeEnd: 0, lut: new Float32Array(0) });
  }

  // Referans enerji: merkez gruptan 20 cm su arkasındaki etkin enerji
  const g0 = groups[0];
  const pw20 = -Math.log(transmissionE(g0, nE, 20, 0, 0, 0));
  const muEff = pw20 / 20;
  let lo = 20, hi = 150;
  for (let it = 0; it < 50; it++) {
    const m = 0.5 * (lo + hi);
    if (massAtten('water', m) > muEff) lo = m;
    else hi = m;
  }
  const eRef = 0.5 * (lo + hi);
  const muRef = massAtten('water', eRef);

  // BHC tabloları
  for (const g of groups) {
    const Lmax = 90; // cm su
    const steps = 1800;
    const ps = new Float64Array(steps + 1);
    for (let i = 0; i <= steps; i++) ps[i] = -Math.log(transmissionE(g, nE, (i / steps) * Lmax, 0, 0, 0));
    const pMax = ps[steps];
    const M = 4096;
    const lut = new Float32Array(M + 1);
    const dp = pMax / M;
    let j = 0;
    for (let m = 0; m <= M; m++) {
      const p = m * dp;
      while (j < steps - 1 && ps[j + 1] < p) j++;
      const f = (p - ps[j]) / Math.max(1e-12, ps[j + 1] - ps[j]);
      const L = ((j + Math.min(1, Math.max(0, f))) / steps) * Lmax;
      lut[m] = muRef * L;
    }
    g.bhc = lut;
    g.bhcDp = dp;
    g.bhcSlopeEnd = (lut[M] - lut[M - 16]) / (16 * dp);
  }

  // Su/kemik LUT
  for (const g of groups) {
    const lut = new Float32Array(LUT_NW * LUT_NB * 2);
    for (let ib = 0; ib < LUT_NB; ib++) {
      const lb = LUT_B_MIN + (ib / (LUT_NB - 1)) * (LUT_B_MAX - LUT_B_MIN);
      for (let iw = 0; iw < LUT_NW; iw++) {
        const lw = (iw / (LUT_NW - 1)) * LUT_W_MAX;
        let s1 = 0, s2 = 0;
        for (let k = 0; k < nE; k++) {
          const ex = Math.exp(-(lw * g.mu[k] + lb * g.mu[nE + k]));
          s1 += g.wE[k] * ex;
          s2 += g.w2[k] * ex;
        }
        const o = 2 * (ib * LUT_NW + iw);
        lut[o] = -Math.log(Math.max(1e-300, s1));
        lut[o + 1] = -Math.log(Math.max(1e-300, (s1 * s1) / s2));
      }
    }
    g.lut = lut;
  }

  const groupOfBin = new Uint16Array(nb);
  const cb = (nb - 1) / 2;
  for (let b = 0; b < nb; b++) {
    const s = Math.abs((b - cb) * ds);
    groupOfBin[b] = Math.min(N_BOWTIE_GROUPS - 1, Math.round((s / S_MAX) * (N_BOWTIE_GROUPS - 1)));
  }

  return { kVp, bowtie, nE, eCenters, groups, groupOfBin, eRef, muRef, centerSpectrum: base };
}

/** Enerji-ağırlıklı geçirgenlik (L: g/cm² kanal yoğunluk-yol çarpımı). */
export function transmissionE(g: PolyGroup, nE: number, lw: number, lb: number, li: number, lm: number): number {
  let te = 0;
  const mu = g.mu;
  for (let k = 0; k < nE; k++) {
    const x = lw * mu[k] + lb * mu[nE + k] + li * mu[2 * nE + k] + lm * mu[3 * nE + k];
    te += g.wE[k] * Math.exp(-x);
  }
  return te;
}

export function applyBhc(g: PolyGroup, p: number): number {
  if (p <= 0) return p * g.bhc[1] / g.bhcDp;
  const u = p / g.bhcDp;
  const M = g.bhc.length - 1;
  if (u >= M) return g.bhc[M] + (p - M * g.bhcDp) * g.bhcSlopeEnd;
  const i = Math.floor(u);
  const f = u - i;
  return g.bhc[i] * (1 - f) + g.bhc[i + 1] * f;
}
