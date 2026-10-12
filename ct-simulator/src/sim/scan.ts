/**
 * Tarama planlama: protokol parametrelerinden türetilen değerler (mA, odak noktası,
 * masa hızı, tarama süresi, aşırı tarama), ATCM (topogramdan Dw ile z-modülasyonu),
 * kesit listesi ve her kesitin kontrast zamanlaması, doz göstergeleri.
 */
import type { KernelId } from '../physics/kernels';
import { ctdiwPer100, kFactor, regionName, ssdeFactor, type DosePhantom } from '../physics/dose';
import { CONTRAST_PHASES } from '../physics/contrast';
import type { Quality, ReconAlg } from './protocol';

export const ROW_WIDTH = 0.5;
export const DETECTOR_CONFIGS = [64, 128, 256] as const;
export type DetRows = (typeof DETECTOR_CONFIGS)[number];
export const MAX_POWER_KW = 100;
export const MAX_MA = 1000;

/** Hastanın solunum durumu (nefes tutma uyumu) */
export type Breathing = 'hold' | 'shallow' | 'deep';
/** Tipik nefes tutma süresi (s) – aşılırsa hasta nefes almaya başlar */
export const BREATH_HOLD_S = 20;
export const BREATHING: Record<Breathing, { label: string; title: string; amp: number; start: number }> = {
  hold: { label: 'Nefes tutuyor', title: `Komutlara uyumlu; ~${BREATH_HOLD_S} s nefes tutabilir, sonra yüzeysel solunum başlar`, amp: 8, start: BREATH_HOLD_S },
  shallow: { label: 'Yüzeysel solunum', title: 'Nefes tutamıyor: serbest yüzeysel solunum, diyafram ~10 mm', amp: 10, start: 0 },
  deep: { label: 'Derin solunum', title: 'Uyumsuz/dispneik: derin solunum, diyafram ~25 mm', amp: 25, start: 0 },
};
/** Merkez ışında yaklaşık saçılma/birincil oranı (32 cm gövde, 2B ızgaralı dedektör) */
export function scatterSprEstimate(collimationMm: number): number {
  const f = (c: number) => c / (1 + c / 150);
  return (0.1 * f(collimationMm)) / f(32);
}

export interface ScanParams {
  protocolId: string;
  kVp: number;
  /** rotasyon başına mAs (ATCM açıksa kalite referansı) */
  mAs: number;
  atcm: boolean;
  rotTime: number;
  pitch: number;
  rows: DetRows;
  thickness: number;
  interval: number;
  kernel: KernelId;
  recon: ReconAlg;
  irLevel: number;
  mar: boolean;
  /** model tabanlı saçılma düzeltmesi */
  scatterCorr: boolean;
  dfov: number;
  matrix: number;
  reconCx: number;
  /** hasta z koordinatı (mm, verteksten) */
  scanStart: number;
  scanEnd: number;
  direction: 'cc' | 'caudocranial';
  contrast: boolean;
  phaseId: string;
  delay: number;
  quality: Quality;
}

export interface Protocol {
  id: string;
  label: string;
  description: string;
  arms: 'up' | 'down';
  landmark: string;
  topoRange: [number, number];
  params: Omit<ScanParams, 'protocolId'>;
}

const base: Omit<ScanParams, 'protocolId'> = {
  kVp: 120,
  mAs: 110,
  atcm: true,
  rotTime: 0.5,
  pitch: 1.0,
  rows: 128,
  thickness: 5,
  interval: 5,
  kernel: 'soft',
  recon: 'IR',
  irLevel: 3,
  mar: false,
  scatterCorr: true,
  dfov: 360,
  matrix: 512,
  reconCx: 0,
  scanStart: 290,
  scanEnd: 600,
  direction: 'cc',
  contrast: false,
  phaseId: 'portal',
  delay: 70,
  quality: 'standard',
};

export const PROTOCOLS: Protocol[] = [
  {
    id: 'head',
    label: 'Rutin Beyin (kontrastsız)',
    description: 'Helikal kafa, 120 kVp, düşük pitch, beyin penceresi. Kollar aşağıda.',
    arms: 'down',
    landmark: 'Orbitomeatal hat',
    topoRange: [-30, 320],
    params: { ...base, kVp: 120, mAs: 180, atcm: false, rotTime: 1.0, pitch: 0.55, rows: 64, thickness: 5, interval: 5, kernel: 'soft', recon: 'IR', irLevel: 2, dfov: 230, scanStart: 2, scanEnd: 172, direction: 'caudocranial' },
  },
  {
    id: 'thorax',
    label: 'Toraks (kontrastsız)',
    description: 'Akciğer apeksinden adrenallere, ATCM, akciğer + yumuşak doku kerneli.',
    arms: 'up',
    landmark: 'Juguler çentik',
    topoRange: [200, 720],
    params: { ...base, kVp: 120, mAs: 110, scanStart: 285, scanEnd: 600, kernel: 'lung', thickness: 2, interval: 2, dfov: 380 },
  },
  {
    id: 'lowdose',
    label: 'Düşük doz akciğer (tarama)',
    description: '100 kVp, düşük mAs, yüksek pitch, IR — akciğer kanseri taraması tarzı.',
    arms: 'up',
    landmark: 'Juguler çentik',
    topoRange: [200, 720],
    params: { ...base, kVp: 100, mAs: 30, pitch: 1.3, scanStart: 285, scanEnd: 600, kernel: 'lung', thickness: 1, interval: 1, recon: 'IR', irLevel: 4, dfov: 380 },
  },
  {
    id: 'abdomen',
    label: 'Abdomen-Pelvis (portal venöz)',
    description: 'İV kontrast, 70 s gecikme, ATCM, yumuşak doku kerneli.',
    arms: 'up',
    landmark: 'Ksifoid',
    topoRange: [400, 1000],
    params: { ...base, kVp: 120, mAs: 170, pitch: 0.9, scanStart: 490, scanEnd: 915, contrast: true, phaseId: 'portal', delay: 70, dfov: 400 },
  },
  {
    id: 'tap',
    label: 'Toraks-Abdomen-Pelvis (kontrastlı)',
    description: 'Tek geçiş, portal venöz faz, geniş tarama aralığı.',
    arms: 'up',
    landmark: 'Juguler çentik',
    topoRange: [200, 1000],
    params: { ...base, kVp: 120, mAs: 150, pitch: 1.0, rows: 128, scanStart: 285, scanEnd: 915, contrast: true, phaseId: 'portal', delay: 70, dfov: 420, thickness: 5, interval: 5 },
  },
  {
    id: 'cta',
    label: 'BT Anjiyo (aorta)',
    description: '100 kVp, bolus zamanlaması, ince kesit, hızlı rotasyon.',
    arms: 'up',
    landmark: 'Juguler çentik',
    topoRange: [200, 1000],
    params: { ...base, kVp: 100, mAs: 140, rotTime: 0.33, pitch: 1.2, rows: 256, scanStart: 300, scanEnd: 760, contrast: true, phaseId: 'cta', delay: 24, thickness: 1, interval: 1, dfov: 380 },
  },
  {
    id: 'pelvis',
    label: 'Pelvis / Kalça (metal artefakt demosu)',
    description: 'Kalça protezi ile pelvis; MAR açıp kapatarak karşılaştırın.',
    arms: 'up',
    landmark: 'İliak krista',
    topoRange: [600, 1100],
    params: { ...base, kVp: 140, mAs: 200, pitch: 0.8, scanStart: 780, scanEnd: 960, kernel: 'soft', mar: true, dfov: 400 },
  },
];

export interface DwProfile {
  z0: number;
  dz: number;
  dw: Float32Array;
}

export interface PlannedSlice {
  z: number;
  /** enjeksiyondan beri saniye (kontrastsızsa null) */
  t: number | null;
  /** tarama başlangıcından itibaren edinim zamanı (s) */
  tAcq: number;
  mAsEff: number;
  mA: number;
  ctdi: number;
}

export interface ScanPlan {
  collimation: number;
  feed: number;
  tableSpeed: number;
  scanLength: number;
  overrange: number;
  scanTime: number;
  mAnominal: number;
  mAmax: number;
  focalLarge: boolean;
  bowtie: 'head' | 'body';
  dosePhantom: DosePhantom;
  mAsEffNominal: number;
  slices: PlannedSlice[];
  ctdiVol: number;
  dlp: number;
  effDose: number;
  ssde: number;
  dwMean: number;
  region: string;
  warnings: string[];
  /** z → mA eğrisi (topogram üzerinde gösterim) */
  mACurve: { z: number; mA: number }[];
  voxels: number;
}

export function dwAt(p: DwProfile | null, z: number, fallback: number): number {
  if (!p) return fallback;
  const i = (z - p.z0) / p.dz - 0.5;
  const i0 = Math.max(0, Math.min(p.dw.length - 1, Math.floor(i)));
  const i1 = Math.min(p.dw.length - 1, i0 + 1);
  const f = Math.max(0, Math.min(1, i - i0));
  const v = p.dw[i0] * (1 - f) + p.dw[i1] * f;
  return v > 1 ? v : fallback;
}

export function planScan(sp: ScanParams, dw: DwProfile | null): ScanPlan {
  const warnings: string[] = [];
  const z0 = Math.min(sp.scanStart, sp.scanEnd), z1 = Math.max(sp.scanStart, sp.scanEnd);
  const isHead = z1 <= 240;
  const bowtie = isHead ? 'head' : 'body';
  const dosePhantom: DosePhantom = isHead ? 'head16' : 'body32';
  const collimation = sp.rows * ROW_WIDTH;
  const feed = sp.pitch * collimation;
  const tableSpeed = feed / sp.rotTime;
  const scanLength = z1 - z0;
  const overrange = feed * 0.9 + collimation * 0.25;
  const scanTime = (scanLength + overrange) / tableSpeed;
  const mAmax = Math.min(MAX_MA, (MAX_POWER_KW * 1000) / sp.kVp);
  const mAnominal = sp.mAs / sp.rotTime;
  if (sp.thickness < ROW_WIDTH) warnings.push(`Kesit kalınlığı dedektör satır genişliğinden (${ROW_WIDTH} mm) ince olamaz.`);
  if (sp.interval > sp.thickness * 1.5) warnings.push('Rekonstrüksiyon aralığı kesit kalınlığından büyük: z yönünde boşluklar (MPR kalitesi düşer).');
  const dRef = isHead ? 17 : 30;
  const beta = isHead ? 0.06 : 0.085;
  const nominalEff = sp.mAs / sp.pitch;
  const slices: PlannedSlice[] = [];
  const n = Math.max(1, Math.floor(scanLength / sp.interval + 1e-6) + 1);
  const phase = CONTRAST_PHASES.find((p) => p.id === sp.phaseId);
  const delay = sp.contrast ? sp.delay ?? phase?.delay ?? 70 : 0;
  const zFirst = sp.direction === 'cc' ? z0 : z1;
  let clamped = false;
  let dwSum = 0;
  for (let k = 0; k < n; k++) {
    const z = z0 + k * sp.interval;
    const d = dwAt(dw, z, isHead ? 17 : 28);
    dwSum += d;
    let mod = 1;
    if (sp.atcm) mod = Math.min(3, Math.max(0.3, Math.exp(beta * (d - dRef))));
    let mA = mAnominal * mod;
    if (mA > mAmax) {
      mA = mAmax;
      clamped = true;
    }
    const eff = (mA * sp.rotTime) / sp.pitch;
    const tAcq = Math.abs(z - zFirst) / tableSpeed;
    slices.push({ z, t: sp.contrast ? delay + tAcq : null, tAcq, mAsEff: eff, mA, ctdi: (ctdiwPer100(sp.kVp, dosePhantom) * eff) / 100 });
  }
  if (sp.direction === 'caudocranial') slices.reverse();
  if (clamped) warnings.push(`İstenen tüp akımı jeneratör sınırını (${mAmax.toFixed(0)} mA @ ${sp.kVp} kVp, ${MAX_POWER_KW} kW) aşıyor; mA sınırlandı → gürültü artar. Rotasyon süresini uzatın veya pitch'i düşürün.`);
  if (mAnominal < 20) warnings.push('Çok düşük tüp akımı: foton açlığı çizgileri ve yüksek gürültü beklenir.');
  // Doz
  let dlp = 0, eff = 0, ctdiSum = 0;
  const dzc = sp.interval / 10;
  for (const s of slices) {
    dlp += s.ctdi * dzc;
    eff += s.ctdi * dzc * kFactor(s.z);
    ctdiSum += s.ctdi;
  }
  const ctdiVol = ctdiSum / slices.length;
  // aşırı tarama katkısı
  dlp += (ctdiVol * overrange) / 10;
  eff += ((ctdiVol * overrange) / 10) * kFactor((z0 + z1) / 2);
  const dwMean = dwSum / n;
  const ssde = ctdiVol * ssdeFactor(dwMean, dosePhantom);
  const focalLarge = mAnominal > 450 || (sp.kVp * mAnominal) / 1000 > 55;
  const mACurve: { z: number; mA: number }[] = slices.map((s) => ({ z: s.z, mA: s.mA }));
  const voxels = n * sp.matrix * sp.matrix;
  if (voxels > 140e6) warnings.push(`Seri çok büyük (${n} görüntü × ${sp.matrix}²). Aralığı artırın, matrisi küçültün veya tarama uzunluğunu kısaltın.`);
  if (scanTime > BREATH_HOLD_S && z1 > 300 && z0 < 800) warnings.push(`Tarama süresi (${scanTime.toFixed(1)} s) tipik nefes tutma süresini (~${BREATH_HOLD_S} s) aşıyor – taramanın sonunda solunum hareketi artefaktı riski. Pitch'i artırın, rotasyonu hızlandırın veya kolimasyonu genişletin.`);
  if (!sp.scatterCorr) warnings.push(`Saçılma düzeltmesi kapalı: HU değerleri düşer, görüntü ortasında kupa (cupping) ve yoğun yapılar arasında koyu bantlar (SPR ≈ ${scatterSprEstimate(collimation).toFixed(2)}).`);
  return {
    collimation,
    feed,
    tableSpeed,
    scanLength,
    overrange,
    scanTime,
    mAnominal,
    mAmax,
    focalLarge,
    bowtie,
    dosePhantom,
    mAsEffNominal: nominalEff,
    slices,
    ctdiVol,
    dlp,
    effDose: eff,
    ssde,
    dwMean,
    region: regionName((z0 + z1) / 2),
    warnings,
    mACurve,
    voxels,
  };
}
