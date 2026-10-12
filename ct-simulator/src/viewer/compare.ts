/** 1×2 seri karşılaştırma yardımcıları (UI'dan bağımsız; deney çalıştırıcısı da kullanır). */
import { useApp, type ViewportState } from '../state/store';
import { seriesStore, type SeriesData } from '../app/data';

/** Pencerede gösterilecek seri: 1×2 karşılaştırmada pencereye özgü seri, diğer düzenlerde etkin seri. */
export function viewportSeriesId(s: { viewer: { layout: string; vps: ViewportState[] }; activeSeries: string | null }, idx: number): string | null {
  if (s.viewer.layout === '1x2') return s.viewer.vps[idx]?.seriesId ?? s.activeSeries;
  return s.activeSeries;
}

/** Bir serideki kesit indeksini (aynı mm konumu) başka bir seriye eşle. */
export function mapIndex(from: SeriesData, to: SeriesData, o: ViewportState['orientation'], index: number): number {
  if (o === 'scout') return index;
  if (o === 'axial') {
    const z = from.zs[Math.max(0, Math.min(from.zs.length - 1, index))];
    let best = 0, bd = Infinity;
    for (let k = 0; k < to.zs.length; k++) {
      const d = Math.abs(to.zs[k] - z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
  const c0 = o === 'coronal' ? from.cy : from.cx, c1 = o === 'coronal' ? to.cy : to.cx;
  const mm = (index - (from.m - 1) / 2) * from.pix + c0;
  return Math.max(0, Math.min(to.m - 1, Math.round((mm - c1) / to.pix + (to.m - 1) / 2)));
}


/** İki seriyi 1×2 karşılaştırma düzeninde aç (aynı z konumu, aynı pencere). */
export function openCompare(a: string | null, b: string | null, ww: number, wl: number, note: { title: string; points: string[] } | null = null, orientation: 'axial' | 'coronal' | 'sagittal' = 'axial', z?: number) {
  const st = useApp.getState();
  const sa = a ? seriesStore.get(a) : null;
  const sb = b ? seriesStore.get(b) : null;
  let ia = 0;
  if (sa) {
    if (orientation === 'axial') {
      const zt = z ?? sa.zs[Math.floor(sa.zs.length / 2)];
      let bd = Infinity;
      sa.zs.forEach((zz, k) => {
        if (Math.abs(zz - zt) < bd) {
          bd = Math.abs(zz - zt);
          ia = k;
        }
      });
    } else ia = Math.floor(sa.m / 2);
  }
  const ib = sa && sb ? mapIndex(sa, sb, orientation, ia) : ia;
  const vps = st.viewer.vps.slice();
  vps[0] = { ...vps[0], orientation, index: ia, ww, wl, zoom: 1, panX: 0, panY: 0, seriesId: a };
  vps[1] = { ...vps[1], orientation, index: ib, ww, wl, zoom: 1, panX: 0, panY: 0, seriesId: b };
  st.setViewer({ layout: '1x2', vps, active: 0, note: note ?? st.viewer.note, sync: true });
}
