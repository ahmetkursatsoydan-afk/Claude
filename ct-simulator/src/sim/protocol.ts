/** Tarama/rekonstrüksiyon parametre tipleri ve kalite ön ayarları. */
import type { KernelId } from '../physics/kernels';
import type { BowtieType } from '../physics/spectrum';

export type Quality = 'fast' | 'standard' | 'high';

export interface QualityPreset {
  label: string;
  /** fantom raster ızgara aralığı (mm) */
  dx: number;
  /** dedektör kanal aralığı izomerkezde (mm) */
  ds: number;
  /** 180° üzerindeki görünüm sayısı (yeniden gruplanmış paralel veri) */
  nv: number;
  /** z alt örnekleme aralığı (mm) */
  dz: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  fast: { label: 'Hızlı', dx: 0.9, ds: 0.9, nv: 360, dz: 0.9 },
  standard: { label: 'Standart', dx: 0.62, ds: 0.62, nv: 540, dz: 0.6 },
  high: { label: 'Yüksek', dx: 0.45, ds: 0.45, nv: 760, dz: 0.45 },
};

/** Tarama alanı (SFOV) çapı, mm */
export const SFOV_MM = 500;
/** Kaynak–izomerkez ve kaynak–dedektör mesafesi (mm) */
export const SOURCE_ISO_MM = 570;
export const SOURCE_DET_MM = 1040;

export type ReconAlg = 'FBP' | 'IR';

export interface SliceRequest {
  z: number;
  thickness: number;
  pitch: number;
  rowWidth: number;
  kVp: number;
  /** bu kesit için etkin mAs (mA·s/pitch, ATCM z-modülasyonu uygulanmış) */
  mAsEff: number;
  angularMod: boolean;
  kernel: KernelId;
  recon: ReconAlg;
  irLevel: number;
  mar: boolean;
  dfov: number;
  matrix: number;
  /** rekon merkezi (izomerkez koordinatında, mm) */
  reconCx: number;
  reconCy: number;
  /** izomerkezdeki hasta koordinatı (masa yüksekliği/yanal ofset) */
  isoXp: number;
  isoYp: number;
  quality: Quality;
  bowtie: BowtieType;
  focalLarge: boolean;
  /** enjeksiyondan beri geçen süre (s) – null: kontrastsız */
  timeS: number | null;
  /** helikal pencere (windmill) modellemesi için kesit içindeki z kayması genliği (mm) */
  seed: number;
  debug?: boolean;
}

export interface SliceStats {
  meanNeq: number;
  minNeq: number;
  starvedFrac: number;
  noiseSigma: number;
  hasMetal: boolean;
  hasIodine: boolean;
  eRef: number;
  ms: number;
  accel: string;
}

export interface SliceDebug {
  nv: number;
  nb: number;
  ds: number;
  /** log-dönüştürülmüş, BHC uygulanmış sinogram */
  sino: Float32Array;
  /** filtrelenmiş sinogram */
  filtered: Float32Array;
  /** gürültüsüz enerji-ağırlıklı geçirgenlik (ortadaki görünüm) */
  transmissionView: Float32Array;
  /** sayımlar (gürültülü) – ortadaki görünüm */
  countsView: Float32Array;
  /** papyon sonrası ışın akısı (göreli) */
  fluxProfile: Float32Array;
  /** fantom kanal görüntüsü (W) – düşük çözünürlüklü önizleme */
  phantomPreview: Float32Array;
  phantomN: number;
  phantomDx: number;
  /** rekon ızgarası bilgisi */
  rg: { m: number; pix: number; cx: number; cy: number };
}

export interface SliceResult {
  hu: Int16Array;
  m: number;
  stats: SliceStats;
  debug?: SliceDebug;
}
