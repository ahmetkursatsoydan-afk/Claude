/**
 * Doz göstergeleri (yaklaşık, eğitim amaçlı):
 *  CTDIw/100 mAs (kVp ve fantom boyutuna bağlı) → CTDIvol = CTDIw · mAs_eff/100
 *  DLP = Σ CTDIvol(z)·Δz  (+ helikal aşırı tarama)
 *  Etkin doz E ≈ Σ k(z)·CTDIvol(z)·Δz  (AAPM Rapor 96 / ICRP k faktörleri)
 *  SSDE = f(Dw)·CTDIvol  (AAPM Rapor 204/220/293)
 */
export type DosePhantom = 'head16' | 'body32';

/** 100 mAs başına CTDIw (mGy) – 120 kVp: kafa ≈ 17, gövde ≈ 7.5; ~kVp^2.6 */
export function ctdiwPer100(kVp: number, ph: DosePhantom): number {
  const base = ph === 'head16' ? 17 : 7.5;
  return base * Math.pow(kVp / 120, 2.6);
}

/** Bölgeye göre k faktörü (mSv / mGy·cm), z hasta koordinatı (mm, verteksten). */
export function kFactor(z: number): number {
  if (z < 230) return 0.0021;
  if (z < 300) return 0.0059;
  if (z < 560) return 0.014;
  if (z < 950) return 0.015;
  return 0.0008;
}

export function regionName(z: number): string {
  if (z < 230) return 'Baş';
  if (z < 300) return 'Boyun';
  if (z < 560) return 'Toraks';
  if (z < 770) return 'Abdomen';
  if (z < 950) return 'Pelvis';
  return 'Alt ekstremite';
}

export function ssdeFactor(dwCm: number, ph: DosePhantom): number {
  if (!(dwCm > 0)) return 1;
  return ph === 'head16' ? 1.9852 * Math.exp(-0.0486 * dwCm) : 3.704369 * Math.exp(-0.03671937 * dwCm);
}
