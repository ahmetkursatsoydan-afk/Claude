/** Büyük veri dizileri (topogram, seriler) – reaktif olmayan depolar. */
import type { SliceDebug, SliceRequest, SliceStats } from '../sim/protocol';
import type { PlannedSlice, ScanPlan, ScanParams } from '../sim/scan';

export interface TopogramData {
  view: 'AP' | 'LAT';
  z0: number;
  dz: number;
  dx: number;
  rows: number;
  cols: number;
  data: Float32Array;
  dw: Float32Array;
  rowsReady: Uint8Array;
  muRef: number;
  kVp: number;
  mA: number;
  isoXp: number;
}

export const topoStore: { current: TopogramData | null } = { current: null };

export interface SeriesData {
  id: string;
  base: SliceRequest;
  params: ScanParams;
  plan: ScanPlan;
  /** artan z sırasında kesit konumları */
  zs: number[];
  planned: PlannedSlice[];
  m: number;
  pix: number;
  cx: number;
  cy: number;
  slices: (Int16Array | null)[];
  stats: (SliceStats | null)[];
  debug: SliceDebug | null;
  debugZ: number | null;
  seed: number;
  version: number;
}

export const seriesStore = new Map<string, SeriesData>();

/** Canlı veri akışı paneli için düşük çözünürlüklü tanılama kesiti */
export const liveStore: { debug: SliceDebug | null; z: number; stats: SliceStats | null; hu: Int16Array | null; m: number } = { debug: null, z: 0, stats: null, hu: null, m: 0 };
