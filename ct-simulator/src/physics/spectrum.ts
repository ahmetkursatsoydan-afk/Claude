/**
 * X-ışını tüpü spektrum modeli (tungsten anot).
 *
 *  - Bremsstrahlung: Kramers yasası (foton sayısı ∝ (E0 − E)/E), anot öz-soğurması
 *    ve tüp çıkış penceresi eşdeğer Al filtrasyonu ile.
 *  - Karakteristik çizgiler: W Kα1 59.32, Kα2 57.98, Kβ1 67.24, Kβ2 69.10 keV
 *    (yalnızca E0 > 69.5 keV, şiddet ∝ (E0/69.5 − 1)^1.63).
 *  - Ek filtrasyon (Al + Cu) ve papyon (bowtie) filtresi.
 *
 * Mutlak foton akısı, simülasyonda gürültü kalibrasyon sabitiyle ölçeklenir;
 * kVp'ye bağlı göreli akı ve enerji dağılımı ise bu modelden gelir.
 */
import { airMuEn, massAtten, DENSITY, type BaseMaterial } from './materials';

export interface Filtration {
  /** Toplam Al eşdeğeri (mm) — doğal + ek filtrasyon */
  alMm: number;
  /** Ek bakır (mm) */
  cuMm: number;
}

export const DEFAULT_FILTRATION: Filtration = { alMm: 5.5, cuMm: 0.1 };

export interface Spectrum {
  kVp: number;
  /** keV bin merkezleri (1 keV aralık) */
  energies: Float64Array;
  /** göreli foton sayısı / mAs / birim alan (izomerkezde) */
  photons: Float64Array;
}

export const E_MIN = 10;

export function rawSpectrum(kVp: number): Spectrum {
  const n = Math.max(1, Math.floor(kVp) - E_MIN);
  const energies = new Float64Array(n);
  const photons = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const e = E_MIN + i + 0.5;
    energies[i] = e;
    // Kramers (foton sayısı). Ölçek: 120 kVp çıkışını ~1'e yakın tutmak için.
    photons[i] = Math.max(0, (kVp - e) / e) * 1e-2;
  }
  // Karakteristik çizgiler
  if (kVp > 69.5) {
    const f = Math.pow(kVp / 69.5 - 1, 1.63);
    const ref = photons[Math.min(n - 1, 59 - E_MIN)];
    const lines: [number, number][] = [
      [59.32, 1.0],
      [57.98, 0.58],
      [67.24, 0.21],
      [69.1, 0.07],
    ];
    for (const [le, rel] of lines) {
      const idx = Math.floor(le) - E_MIN;
      if (idx >= 0 && idx < n && le < kVp) photons[idx] += 3.2 * f * ref * rel;
    }
  }
  // Anot öz-soğurması (topuk etkisi) — W L-kabuğu bölgesini bastıran yaklaşık terim
  for (let i = 0; i < n; i++) {
    const e = energies[i];
    photons[i] *= Math.exp(-Math.pow(12 / e, 3) * 1.2);
  }
  return { kVp, energies, photons };
}

export function filterSpectrum(s: Spectrum, m: BaseMaterial, thicknessMm: number): Spectrum {
  if (thicknessMm <= 0) return s;
  const out = new Float64Array(s.photons.length);
  const rho = DENSITY[m];
  for (let i = 0; i < out.length; i++) {
    out[i] = s.photons[i] * Math.exp(-massAtten(m, s.energies[i]) * rho * thicknessMm * 0.1);
  }
  return { kVp: s.kVp, energies: s.energies, photons: out };
}

export function tubeSpectrum(kVp: number, filt: Filtration = DEFAULT_FILTRATION): Spectrum {
  let s = rawSpectrum(kVp);
  s = filterSpectrum(s, 'aluminum', filt.alMm);
  s = filterSpectrum(s, 'copper', filt.cuMm);
  return s;
}

export function totalPhotons(s: Spectrum): number {
  let t = 0;
  for (let i = 0; i < s.photons.length; i++) t += s.photons[i];
  return t;
}

export function meanEnergy(s: Spectrum): number {
  let a = 0, b = 0;
  for (let i = 0; i < s.photons.length; i++) {
    a += s.photons[i] * s.energies[i];
    b += s.photons[i];
  }
  return a / b;
}

/** Hava kerması (göreli). */
export function airKerma(s: Spectrum): number {
  let k = 0;
  for (let i = 0; i < s.photons.length; i++) k += s.photons[i] * s.energies[i] * airMuEn(s.energies[i]);
  return k;
}

/** Yarı değer kalınlığı (mm Al) — ikiye bölme ile. */
export function hvlAl(s: Spectrum): number {
  const k0 = airKerma(s);
  let lo = 0, hi = 40;
  for (let it = 0; it < 40; it++) {
    const mid = 0.5 * (lo + hi);
    const k = airKerma(filterSpectrum(s, 'aluminum', mid));
    if (k > 0.5 * k0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Etkin enerji: aynı HVL'yi veren monoenerjetik ışın. */
export function effectiveEnergyFromHvl(hvlMm: number): number {
  const target = Math.LN2 / (hvlMm * 0.1 * DENSITY.aluminum);
  let lo = 15, hi = 150;
  for (let it = 0; it < 50; it++) {
    const mid = 0.5 * (lo + hi);
    if (massAtten('aluminum', mid) > target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/* ------------------------------------------------------------------------ */
/* Papyon (bowtie) filtresi                                                   */
/* ------------------------------------------------------------------------ */

export type BowtieType = 'body' | 'head';

/**
 * İzomerkezden s (mm) uzaklıktaki ışın için papyon filtresi Al kalınlığı (mm).
 * Silindirik su fantomundaki yol farkını kısmen telafi edecek biçimde tasarlanmıştır.
 */
export function bowtieAlMm(type: BowtieType, sMm: number): number {
  const R = type === 'body' ? 175 : 105;
  const frac = type === 'body' ? 0.5 : 0.45;
  const a = Math.min(Math.abs(sMm), R);
  const waterEq = frac * (2 * R - 2 * Math.sqrt(R * R - a * a));
  const extra = Math.abs(sMm) > R ? (Math.abs(sMm) - R) * 0.15 : 0;
  // su→Al eşdeğerliği (~60 keV): μAl·ρAl / μw ≈ 3.6
  return waterEq / 3.6 + extra + 0.5;
}
