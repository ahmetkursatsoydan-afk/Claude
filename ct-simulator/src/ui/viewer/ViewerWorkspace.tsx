import { useEffect, useRef } from 'react';
import { useApp, type Layout, type Tool } from '../../state/store';
import { seriesStore } from '../../app/data';
import { Viewport, clearAnnotations } from './Viewport';

export const WINDOW_PRESETS: { id: string; l: string; ww: number; wl: number }[] = [
  { id: 'brain', l: 'Beyin', ww: 80, wl: 40 },
  { id: 'stroke', l: 'İnme', ww: 40, wl: 38 },
  { id: 'subdural', l: 'Subdural', ww: 200, wl: 75 },
  { id: 'soft', l: 'Yumuşak doku', ww: 400, wl: 40 },
  { id: 'mediast', l: 'Mediasten', ww: 350, wl: 50 },
  { id: 'liver', l: 'Karaciğer', ww: 160, wl: 60 },
  { id: 'lung', l: 'Akciğer', ww: 1500, wl: -600 },
  { id: 'bone', l: 'Kemik', ww: 2000, wl: 500 },
  { id: 'angio', l: 'Anjiyo', ww: 700, wl: 200 },
  { id: 'metal', l: 'Metal', ww: 4000, wl: 1000 },
];

const TOOLS: { id: Tool; l: string; t: string }[] = [
  { id: 'wl', l: '◐ W/L', t: 'Sol sürükle: pencere genişliği (yatay) / seviyesi (dikey). Sağ tuş her zaman W/L.' },
  { id: 'pan', l: '✥ Kaydır', t: 'Görüntüyü kaydır (orta tuş her zaman)' },
  { id: 'zoom', l: '⊕ Yakınlaştır', t: 'Dikey sürükle; Ctrl+tekerlek' },
  { id: 'measure', l: '📏 Mesafe', t: 'Mesafe ölçümü (mm)' },
  { id: 'roi', l: '◯ ROI', t: 'Elips ROI: ortalama HU, SD, min/maks, alan' },
  { id: 'probe', l: '✛ Konum/MPR', t: 'Tıklayınca çapraz imleç diğer düzlemleri günceller (Shift+tık)' },
];

function Thumb({ id, ver }: { id: string; ver: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sd = seriesStore.get(id);
    const c = ref.current;
    if (!sd || !c) return;
    const mid = Math.floor(sd.zs.length / 2);
    let k = mid;
    for (let d = 0; d < sd.zs.length; d++) {
      if (sd.slices[mid + d]) {
        k = mid + d;
        break;
      }
      if (sd.slices[mid - d]) {
        k = mid - d;
        break;
      }
    }
    const s = sd.slices[k];
    const m = sd.m;
    c.width = 96;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 96, 96);
    if (!s) return;
    const id2 = g.createImageData(96, 96);
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const v = s[Math.floor((y / 96) * m) * m + Math.floor((x / 96) * m)];
        const gv = Math.max(0, Math.min(255, ((v + 160) / 400) * 255));
        const p = 4 * (y * 96 + x);
        id2.data[p] = id2.data[p + 1] = id2.data[p + 2] = gv;
        id2.data[p + 3] = 255;
      }
    g.putImageData(id2, 0, 0);
  }, [id, ver]);
  return <canvas ref={ref} />;
}

export function ViewerWorkspace() {
  const { series, activeSeries, set, viewer, setViewer, setViewport } = useApp();
  const meta = series.find((s) => s.id === activeSeries);
  const sd = activeSeries ? seriesStore.get(activeSeries) : null;
  const av = viewer.vps[viewer.active];

  // yeni seri seçilince indeksleri ortala
  useEffect(() => {
    if (!sd) return;
    const vps = viewer.vps.map((v) => {
      if (v.orientation === 'axial') return { ...v, index: Math.floor(sd.zs.length / 2) };
      if (v.orientation === 'coronal' || v.orientation === 'sagittal') return { ...v, index: Math.floor(sd.m / 2) };
      return v;
    });
    // kernel'e göre önerilen pencere
    const preset = sd.params.kernel === 'lung' ? WINDOW_PRESETS[6] : sd.params.kernel === 'bone' ? WINDOW_PRESETS[7] : sd.zs[sd.zs.length - 1] < 240 ? WINDOW_PRESETS[0] : WINDOW_PRESETS[3];
    setViewer({ vps: vps.map((v) => ({ ...v, ww: preset.ww, wl: preset.wl, zoom: 1, panX: 0, panY: 0 })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeries]);

  // sine
  useEffect(() => {
    if (!viewer.cine || !sd) return;
    const t = setInterval(() => {
      const st = useApp.getState();
      const v = st.viewer.vps[st.viewer.active];
      const n = v.orientation === 'axial' ? sd.zs.length : sd.m;
      st.setViewport(st.viewer.active, { index: (v.index + 1) % n });
    }, 1000 / viewer.cineFps);
    return () => clearInterval(t);
  }, [viewer.cine, viewer.cineFps, sd]);

  // klavye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const st = useApp.getState();
      const v = st.viewer.vps[st.viewer.active];
      if (!sd) return;
      const n = v.orientation === 'axial' ? sd.zs.length : sd.m;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') st.setViewport(st.viewer.active, { index: Math.max(0, v.index - 1) });
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') st.setViewport(st.viewer.active, { index: Math.min(n - 1, v.index + 1) });
      if (e.key === 'PageUp') st.setViewport(st.viewer.active, { index: Math.max(0, v.index - 10) });
      if (e.key === 'PageDown') st.setViewport(st.viewer.active, { index: Math.min(n - 1, v.index + 10) });
      if (e.key === ' ') {
        e.preventDefault();
        st.setViewer({ cine: !st.viewer.cine });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sd]);

  const setLayout = (l: Layout) => {
    const vps = viewer.vps.slice();
    if (l === 'mpr') {
      const order = ['axial', 'coronal', 'sagittal', 'scout'] as const;
      setViewer({ layout: l, vps: order.map((o) => ({ ...(vps.find((v) => v.orientation === o) ?? vps[0]), orientation: o })) });
    } else setViewer({ layout: l });
  };
  const count = viewer.layout === '1x1' ? 1 : viewer.layout === '1x2' ? 2 : 4;
  const applyPreset = (ww: number, wl: number, all = false) => {
    if (all) setViewer({ vps: viewer.vps.map((v) => ({ ...v, ww, wl })) });
    else setViewport(viewer.active, { ww, wl });
  };

  return (
    <div className="viewer">
      <div className="series-list">
        <div className="hint" style={{ marginTop: 0 }}>
          SERİLER
        </div>
        {series.length === 0 && <div className="hint">Henüz seri yok. Tarama odasından tarama yapın.</div>}
        {series.map((s) => (
          <div key={s.id} className={'series-item' + (s.id === activeSeries ? ' active' : '')} onClick={() => set({ activeSeries: s.id })}>
            <div className="t">{s.name}</div>
            <div className="d">{s.desc}</div>
            <div className="d">
              {s.nDone}/{s.nTotal} görüntü · {s.m}² · DFOV {s.dfov}
            </div>
            <Thumb id={s.id} ver={s.version} />
          </div>
        ))}
        <button className="btn sm" style={{ width: '100%' }} onClick={() => set({ view: 'room', tab: 'recon' })}>
          ⟳ Retrospektif rekonstrüksiyon
        </button>
      </div>
      <div className="vwork">
        <div className="toolbar">
          {TOOLS.map((t) => (
            <button key={t.id} className={'tbtn' + (viewer.tool === t.id ? ' on' : '')} title={t.t} onClick={() => setViewer({ tool: t.id })}>
              {t.l}
            </button>
          ))}
          <button className="tbtn" title="Ölçümleri sil" onClick={() => (clearAnnotations(), setViewer({ ...viewer }))}>
            ✕ Ölçümleri sil
          </button>
          <div className="sep" />
          {WINDOW_PRESETS.map((p) => (
            <button key={p.id} className={'tbtn' + (av && av.ww === p.ww && av.wl === p.wl ? ' on' : '')} title={`W ${p.ww} / L ${p.wl} (Shift: tüm pencereler)`} onClick={(e) => applyPreset(p.ww, p.wl, e.shiftKey)}>
              {p.l}
            </button>
          ))}
          <div className="sep" />
          <button className={'tbtn' + (viewer.layout === '1x1' ? ' on' : '')} onClick={() => setLayout('1x1')}>
            ▣ 1×1
          </button>
          <button className={'tbtn' + (viewer.layout === 'mpr' ? ' on' : '')} onClick={() => setLayout('mpr')}>
            ▦ MPR 2×2
          </button>
          <select
            className="tbtn"
            value={av?.orientation}
            onChange={(e) => setViewport(viewer.active, { orientation: e.target.value as 'axial' })}
            title="Etkin pencerenin düzlemi"
          >
            <option value="axial">Aksiyel</option>
            <option value="coronal">Koronal</option>
            <option value="sagittal">Sagittal</option>
            <option value="scout">Topogram</option>
          </select>
          <div className="sep" />
          <span className="hint" style={{ margin: 0 }}>
            Kalın dilim
          </span>
          <select className="tbtn" value={viewer.slab} onChange={(e) => setViewer({ slab: Number(e.target.value) })}>
            {[0, 3, 5, 10, 20, 40].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'kapalı' : `${v} mm`}
              </option>
            ))}
          </select>
          <select className="tbtn" value={viewer.slabMode} onChange={(e) => setViewer({ slabMode: e.target.value as 'avg' })}>
            <option value="avg">Ortalama</option>
            <option value="mip">MIP</option>
            <option value="minip">MinIP</option>
          </select>
          <div className="sep" />
          <button className={'tbtn' + (viewer.cine ? ' on' : '')} onClick={() => setViewer({ cine: !viewer.cine })} title="Boşluk tuşu">
            {viewer.cine ? '❚❚ Sine' : '▶ Sine'}
          </button>
          <input type="range" min={2} max={30} value={viewer.cineFps} onChange={(e) => setViewer({ cineFps: Number(e.target.value) })} style={{ width: 70 }} title="kare/s" />
          <span className="hint" style={{ margin: 0 }}>
            {viewer.cineFps} fps
          </span>
          <button className="tbtn" onClick={() => setViewport(viewer.active, { zoom: 1, panX: 0, panY: 0 })}>
            ⟲ Sıfırla
          </button>
          <button className={'tbtn' + (viewer.showOverlay ? ' on' : '')} onClick={() => setViewer({ showOverlay: !viewer.showOverlay })}>
            Bilgi
          </button>
        </div>
        {meta && sd ? (
          <div className={'vgrid l' + viewer.layout}>
            {Array.from({ length: count }, (_, i) => (
              <Viewport key={i} idx={i} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <div>Görüntülenecek seri yok.</div>
            <button className="btn primary" onClick={() => set({ view: 'room' })}>
              Tarama odasına git
            </button>
          </div>
        )}
        <div className="statusbar" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="msg">
            Tekerlek: kesit · Ctrl+tekerlek: yakınlaştır · Sağ sürükle: W/L · Orta sürükle: kaydır · Shift+tık: MPR konumu · Çift tık: 1×1/MPR · ↑↓ PgUp/PgDn · Boşluk: sine
          </span>
        </div>
      </div>
    </div>
  );
}
