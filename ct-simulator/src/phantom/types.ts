/**
 * Sentetik antropomorfik fantom veri tipleri.
 *
 * Koordinat sistemi (hasta / DICOM LPS benzeri, mm):
 *   x : + hastanın SOLU      (aksiyel görüntüde ekranın sağı)
 *   y : + POSTERİOR          (aksiyel görüntüde ekranın altı)
 *   z : verteksten itibaren KAUDAL yön (+ ayaklara doğru)
 * Hasta sırtüstü (supine) yatar; masa üst yüzeyi y = TABLE_TOP_Y düzlemidir.
 */

export type Ch4 = Float32Array; // [W, B, I, M] kısmi yoğunluk (g/cm³)

/** 2B şekiller (aksiyel düzlemde) */
export interface EllShape {
  k: 0;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  c: number; // cos(rot)
  s: number; // sin(rot)
  n: number; // süper-elips üssü (2 = elips)
  /** isteğe bağlı sınırlayıcı kutu (mm) – kırpılmış tüp kesitleri için */
  bx0?: number;
  bx1?: number;
  by0?: number;
  by1?: number;
}
export interface SegShape {
  k: 1;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}
export interface BlobShape {
  k: 2;
  cx: number;
  cy: number;
  c: number;
  s: number;
  radii: Float32Array; // r(φ), φ ∈ [0, 2π) eşit aralıklı
  rmax: number;
}
export type Shape2D = EllShape | SegShape | BlobShape;

export type TextureKind = 'noise' | 'trab' | 'lung' | 'mottle' | 'gyri';
export interface Texture {
  kind: TextureKind;
  amp: number;
  scale: number; // mm
  seed: number;
  /** lung: ön-arka yoğunluk gradyanı (y başına göreli değişim, 1/mm) */
  grad?: number;
  /** mottle: gaz eşiği */
  thr?: number;
}

export interface HalfPlane {
  nx: number;
  ny: number;
  d: number; // nx·x + ny·y ≤ d olan bölge çizilir
}

/** Boyama özellikleri (dokuya ait, şekilden bağımsız). */
export interface PaintProps {
  ch: Ch4;
  tissue: string;
  /** kontrast kompartmanı (iyot konsantrasyonu eğrisi) */
  comp?: string;
  /** kompartman konsantrasyonunun çarpanı */
  compScale?: number;
  tex?: Texture;
  /** yalnızca mevcut su-kanalı değeri bu eşiğin altındaysa (ör. akciğer) boya */
  maskMaxW?: number;
  /** yalnızca mevcut su-kanalı değeri bu eşiğin üstündeyse boya */
  maskMinW?: number;
  opacity?: number;
}

export interface Paint {
  shape: Shape2D;
  p: PaintProps;
  clip?: HalfPlane[];
  /** yalnızca bu (süper)elipsin içinde çiz */
  within?: EllShape;
}

export interface Structure {
  name: string;
  zMin: number;
  zMax: number;
  emit(z: number, out: Paint[]): void;
  /** solunumla kranio-kaudal yer değiştirme katsayısı (0 = sabit, 1 = diyafram) */
  motion?: number;
}

export interface PhantomConfig {
  habitus: 'small' | 'medium' | 'large';
  arms: 'up' | 'down';
  implant: 'none' | 'hipRight' | 'hipBilateral' | 'dental' | 'spine';
  seed: number;
}

export const DEFAULT_PHANTOM_CONFIG: PhantomConfig = {
  habitus: 'medium',
  arms: 'up',
  implant: 'none',
  seed: 7,
};

/** Masa minderinin üst yüzeyi (hastanın sırtı) */
export const TABLE_TOP_Y = 124;
/** Minder kalınlığı (mm) */
export const MATTRESS_MM = 40;
/** Karbon fiber beşik üst yüzeyi */
export const CRADLE_TOP_Y = TABLE_TOP_Y + MATTRESS_MM;
