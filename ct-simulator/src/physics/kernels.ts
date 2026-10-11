/**
 * Rekonstrüksiyon kernelleri: rampa filtresi |f| × apodizasyon penceresi W(f).
 * f mutlak uzaysal frekans (lp/cm) cinsindendir; böylece kernel davranışı dedektör
 * örnekleme aralığından bağımsızdır (dedektör Nyquist'i yine de üst sınırdır).
 *
 *  Yumuşak doku : Hann penceresi, kesim ~8 lp/cm → MTF50 ≈ 3.5–4 lp/cm, düşük gürültü
 *  Akciğer      : orta frekans artışı (+%35), kesim ~13 lp/cm → keskin, kenar vurgulu
 *  Kemik        : güçlü artış (+%90), kesim ~15 lp/cm → en keskin, en gürültülü, kenar aşması
 */
export type KernelId = 'soft' | 'lung' | 'bone';

export interface KernelDef {
  id: KernelId;
  label: string;
  vendorLike: string;
  boost: number;
  fPeak: number;
  fTaper: number;
  fCut: number;
}

export const KERNELS: Record<KernelId, KernelDef> = {
  soft: { id: 'soft', label: 'Yumuşak doku', vendorLike: 'B30f / STANDARD benzeri', boost: 0, fPeak: 5, fTaper: 0, fCut: 8.2 },
  lung: { id: 'lung', label: 'Akciğer', vendorLike: 'B60f / LUNG benzeri', boost: 0.35, fPeak: 6.5, fTaper: 8.5, fCut: 13.5 },
  bone: { id: 'bone', label: 'Kemik', vendorLike: 'B70f / BONE benzeri', boost: 0.95, fPeak: 7.5, fTaper: 9.5, fCut: 16 },
};

/** Apodizasyon penceresi (kernel MTF'i) – f lp/cm */
export function kernelWindow(k: KernelDef, f: number): number {
  const af = Math.abs(f);
  if (af >= k.fCut) return 0;
  let taper: number;
  if (af <= k.fTaper) taper = 1;
  else {
    const t = (af - k.fTaper) / (k.fCut - k.fTaper);
    taper = 0.5 * (1 + Math.cos(Math.PI * t));
  }
  const x = af / k.fPeak;
  const boost = 1 + k.boost * x * x * Math.exp(1 - x * x);
  return taper * boost;
}

/** Sistem MTF tahmini: kernel × dedektör açıklığı (sinc) × odak noktası (Gauss). */
export function systemMtf(k: KernelDef, f: number, detMm: number, focalMm: number): number {
  const fmm = f / 10;
  const x = Math.PI * detMm * fmm;
  const sinc = x === 0 ? 1 : Math.abs(Math.sin(x) / x);
  const sig = focalMm / 2.355;
  const g = Math.exp(-2 * Math.PI * Math.PI * sig * sig * fmm * fmm);
  // Joseph enterpolasyonu (~üçgen, genişlik ≈ piksel)
  const lin = sinc * sinc;
  return Math.max(0, kernelWindow(k, f) * sinc * g * Math.sqrt(lin));
}

/** Gürültü güç spektrumu biçimi (rampa × W² × sistem). */
export function nps(k: KernelDef, f: number, detMm: number, focalMm: number): number {
  const m = systemMtf(k, f, detMm, focalMm);
  return Math.abs(f) * m * m;
}

export function mtfAt(k: KernelDef, level: number, detMm: number, focalMm: number): number {
  let prev = 1;
  for (let f = 0; f < 30; f += 0.01) {
    const m = systemMtf(k, f, detMm, focalMm);
    if (m <= level && prev > level) return f;
    prev = m;
  }
  return 30;
}
