/**
 * İyotlu kontrast madde zaman–konsantrasyon modeli (eğitim amaçlı yaklaşık).
 * Standart enjeksiyon: ~100 mL, 350 mgI/mL, 4 mL/s antekübital ven (≈25 s).
 * Kompartman konsantrasyonları mg I / mL (120 kVp'de 1 mg/mL ≈ 25–27 HU).
 *
 * Gama-varyat ilk geçiş eğrileri + yavaş yükselen denge (ekstraselüler) bileşeni
 * + böbrek atılımı (ekskresyon). Taramanın kendisi zaman aldığından her kesit
 * farklı bir zamanda örneklenir (tarama yönü ve hızı kontrast fazını etkiler).
 */

function gammaVariate(t: number, t0: number, tp: number, alpha: number): number {
  if (t <= t0) return 0;
  const x = (t - t0) / (tp - t0);
  return Math.pow(x, alpha) * Math.exp(alpha * (1 - x));
}

function smoothStep(t: number, t0: number, tau: number): number {
  return t <= t0 ? 0 : 1 - Math.exp(-(t - t0) / tau);
}

const INJ_END = 26;

/** Parankimal sigmoid: başlangıç a0, plato a1, orta zaman tm, genişlik w, geç yıkanma τ. */
function sig(t: number, a0: number, a1: number, tm: number, w: number, tau = 500): number {
  if (t < 8) return 0;
  const on = Math.min(1, (t - 8) / 8);
  const v = a0 * on + (a1 - a0) / (1 + Math.exp(-(t - tm) / w));
  return v * (t > 90 ? Math.exp(-(t - 90) / tau) : 1);
}

/** Temel eğriler (mg/mL) */
export function baseCurves(t: number) {
  // Sistemik denge: yavaş yükselir, yavaşça yıkanır
  const eq = 6.3 * smoothStep(t, 24, 24) * Math.exp(-Math.max(0, t - 70) / 700);
  // Enjeksiyon tarafı venöz giriş (SVC, brakiyosefalik): enjeksiyon süresince çok yoğun
  const svc = t > 3 && t < INJ_END + 12 ? 38 * smoothStep(t, 3, 2.5) * (t > INJ_END ? Math.exp(-(t - INJ_END) / 2.5) : 1) : 0;
  const rightHeart = 16 * gammaVariate(t, 6, 16, 2.2) + 0.9 * eq;
  const arterial = 12.5 * gammaVariate(t, 11, 27, 2.6) + eq;
  const portal = 6.0 * gammaVariate(t, 24, 48, 2.4) + 1.05 * eq;
  const venousLate = 3.0 * gammaVariate(t, 30, 62, 2.2) + 1.0 * eq;
  // Böbrek atılımı (toplayıcı sistem)
  const excretory = 70 * smoothStep(t, 150, 220);
  return { eq, svc, rightHeart, arterial, portal, venousLate, excretory };
}

export type CompartmentId =
  | 'svc' | 'rightHeart' | 'pulmArtery' | 'pulmVein' | 'leftHeart' | 'aorta' | 'artery'
  | 'portal' | 'hepaticVein' | 'ivcSupra' | 'ivcInfra' | 'vein' | 'venousSinus'
  | 'liver' | 'spleen' | 'pancreas' | 'kidneyCortex' | 'kidneyMedulla' | 'collecting'
  | 'myocardium' | 'muscle' | 'bowelWall' | 'stomachWall' | 'brain' | 'choroid' | 'thyroid'
  | 'lung' | 'adrenal' | 'lymph' | 'prostate' | 'marrow' | 'skin' | 'gland' | 'bladderLayer';

/** Kompartman konsantrasyonu (mg/mL). t: enjeksiyondan beri saniye. */
export function compartmentConc(id: string, t: number): number {
  const c = baseCurves(t);
  switch (id) {
    case 'svc': return c.svc + c.venousLate * 0.6 + c.eq * 0.4;
    case 'rightHeart': return c.rightHeart + 0.25 * c.svc;
    case 'pulmArtery': return c.rightHeart;
    case 'pulmVein':
    case 'leftHeart':
    case 'aorta':
    case 'artery': return c.arterial;
    case 'portal': return c.portal;
    case 'hepaticVein': return 0.6 * c.venousLate + 0.35 * c.portal;
    case 'ivcSupra': return 0.5 * c.arterial * smoothStep(t, 20, 8) + 0.5 * c.venousLate;
    case 'ivcInfra': return c.venousLate * smoothStep(t, 35, 15);
    case 'vein': return c.venousLate;
    case 'venousSinus': return 0.8 * c.venousLate + 0.25 * c.arterial;
    case 'liver': return sig(t, 0.4, 2.3, 48, 7, 420);
    case 'spleen': return sig(t, 3.4, 2.8, 50, 8, 380);
    case 'pancreas': return sig(t, 3.6, 2.4, 55, 9, 350) * Math.min(1, (t - 8) / 22);
    case 'kidneyCortex': return sig(t, 6.2, 5.6, 60, 10, 260);
    case 'kidneyMedulla': return sig(t, 0.8, 6.2, 75, 10, 600) + 0.05 * c.excretory;
    case 'collecting': return c.excretory;
    case 'bladderLayer': return 0.6 * c.excretory * smoothStep(t, 180, 200);
    case 'myocardium': return sig(t, 3.5, 2.4, 50, 8, 400);
    case 'muscle': return sig(t, 0.15, 0.45, 60, 15, 900);
    case 'bowelWall': return sig(t, 2.2, 1.9, 50, 10, 500);
    case 'stomachWall': return sig(t, 2.4, 2.1, 50, 10, 500);
    case 'brain': return 0.025 * c.arterial;
    case 'choroid': return 0.3 * c.arterial + 0.2 * c.eq;
    case 'thyroid': return sig(t, 5.0, 3.6, 45, 10, 400);
    case 'lung': return 0.08 * c.rightHeart + 0.04 * c.eq;
    case 'adrenal': return sig(t, 2.5, 2.0, 50, 10, 400);
    case 'lymph': return sig(t, 0.6, 1.2, 60, 12, 600);
    case 'prostate': return sig(t, 0.8, 1.3, 60, 12, 600);
    case 'marrow': return sig(t, 0.6, 0.9, 50, 10, 600);
    case 'skin': return sig(t, 0.3, 0.6, 60, 12, 600);
    case 'gland': return sig(t, 1.2, 1.4, 55, 10, 600);
    default: return 0;
  }
}

export interface ContrastPhase {
  id: string;
  label: string;
  delay: number;
}

export const CONTRAST_PHASES: ContrastPhase[] = [
  { id: 'cta', label: 'BT anjiyografi (≈24 s, bolus takibi)', delay: 24 },
  { id: 'arterial', label: 'Geç arteriyel (≈35 s)', delay: 35 },
  { id: 'portal', label: 'Portal venöz (≈70 s)', delay: 70 },
  { id: 'nephro', label: 'Nefrografik (≈100 s)', delay: 100 },
  { id: 'delayed', label: 'Geç / ekskresyon (≈300 s)', delay: 300 },
];

export function makeConcFn(t: number | null): ((comp: string) => number) | null {
  if (t === null) return null;
  const cache = new Map<string, number>();
  return (comp: string) => {
    let v = cache.get(comp);
    if (v === undefined) {
      v = compartmentConc(comp, t);
      cache.set(comp, v);
    }
    return v;
  };
}
