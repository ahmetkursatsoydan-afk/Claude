/**
 * Aksiyel yığından çok düzlemli yeniden biçimlendirme (MPR): koronal, sagittal ve
 * isteğe bağlı kalın dilim (ortalama / MIP / MinIP). Rekonstrüksiyonu henüz bitmemiş
 * kesitler −1024 HU (boş) olarak doldurulur.
 */
import type { SeriesData } from '../app/data';

export type Orientation = 'axial' | 'coronal' | 'sagittal';
export type SlabMode = 'avg' | 'mip' | 'minip';

export interface ImageOut {
  data: Int16Array;
  w: number;
  h: number;
  spacing: [number, number];
}

export function axialImage(sd: SeriesData, idx: number, slabMm: number, mode: SlabMode): ImageOut | null {
  const m = sd.m;
  const n = sd.zs.length;
  const i = Math.max(0, Math.min(n - 1, idx));
  const half = Math.floor(slabMm / (2 * sd.params.interval));
  if (half <= 0) {
    const s = sd.slices[i];
    if (!s) return null;
    return { data: s, w: m, h: m, spacing: [sd.pix, sd.pix] };
  }
  const out = new Int16Array(m * m);
  const acc = new Float32Array(m * m).fill(mode === 'mip' ? -1e9 : mode === 'minip' ? 1e9 : 0);
  let cnt = 0;
  for (let k = i - half; k <= i + half; k++) {
    const s = sd.slices[k];
    if (!s) continue;
    cnt++;
    for (let p = 0; p < m * m; p++) {
      const v = s[p];
      if (mode === 'mip') acc[p] = v > acc[p] ? v : acc[p];
      else if (mode === 'minip') acc[p] = v < acc[p] ? v : acc[p];
      else acc[p] += v;
    }
  }
  if (!cnt) return null;
  for (let p = 0; p < m * m; p++) out[p] = mode === 'avg' ? Math.round(acc[p] / cnt) : acc[p];
  return { data: out, w: m, h: m, spacing: [sd.pix, sd.pix] };
}

/**
 * Koronal (sabit satır = y) veya sagittal (sabit sütun = x) yeniden biçimlendirme.
 * pos: satır/sütun indeksi. Çıktı: genişlik = m, yükseklik = kesit sayısı, üstte kranial.
 */
export function reformat(sd: SeriesData, o: 'coronal' | 'sagittal', pos: number, slabMm: number, mode: SlabMode): ImageOut {
  const m = sd.m, n = sd.zs.length;
  const out = new Int16Array(m * n);
  const half = Math.max(0, Math.floor(slabMm / (2 * sd.pix)));
  const p0 = Math.max(0, Math.min(m - 1, pos));
  for (let k = 0; k < n; k++) {
    const s = sd.slices[k];
    const row = k * m;
    if (!s) {
      out.fill(-1024, row, row + m);
      continue;
    }
    for (let u = 0; u < m; u++) {
      let acc = mode === 'mip' ? -1e9 : mode === 'minip' ? 1e9 : 0;
      let c = 0;
      for (let d = -half; d <= half; d++) {
        const q = p0 + d;
        if (q < 0 || q >= m) continue;
        const v = o === 'coronal' ? s[q * m + u] : s[u * m + q];
        if (mode === 'mip') acc = v > acc ? v : acc;
        else if (mode === 'minip') acc = v < acc ? v : acc;
        else acc += v;
        c++;
      }
      out[row + u] = mode === 'avg' ? Math.round(acc / Math.max(1, c)) : acc;
    }
  }
  return { data: out, w: m, h: n, spacing: [sd.pix, sd.params.interval] };
}
