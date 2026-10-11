/**
 * Tek görüntüleme penceresi: WebGL pencereleme, kaydırma (tekerlek), pan/zoom,
 * W/L sürükleme, mesafe ölçümü, elips ROI (ortalama/SD/min/max/alan), HU sondası,
 * MPR çapraz imleç ve referans çizgileri, DICOM benzeri bindirmeler.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type ViewportState } from '../../state/store';
import { seriesStore, topoStore, type SeriesData } from '../../app/data';
import { createRenderer, type AnyRenderer } from '../../viewer/SliceRenderer';
import { axialImage, reformat, type ImageOut } from '../../viewer/mpr';
import { KERNELS } from '../../physics/kernels';

interface Ann {
  kind: 'line' | 'roi';
  a: [number, number];
  b: [number, number];
}
const annStore = new Map<string, Ann[]>();
let annVer = 0;
export function clearAnnotations() {
  annStore.clear();
  annVer++;
}

function nSlicesFor(sd: SeriesData, o: ViewportState['orientation']): number {
  if (o === 'axial') return sd.zs.length;
  return sd.m;
}

export function Viewport({ idx }: { idx: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rend = useRef<AnyRenderer | null>(null);
  const viewer = useApp((s) => s.viewer);
  const vp = viewer.vps[idx];
  const activeId = useApp((s) => s.activeSeries);
  const meta = useApp((s) => s.series.find((x) => x.id === s.activeSeries));
  const setViewport = useApp((s) => s.setViewport);
  const setViewer = useApp((s) => s.setViewer);
  const topoVer = useApp((s) => s.topo.version);
  const sd = activeId ? seriesStore.get(activeId) ?? null : null;
  const [size, setSize] = useState<[number, number]>([10, 10]);
  const [cursor, setCursor] = useState<{ mm: [number, number]; hu: number | null } | null>(null);
  const [ver, setVer] = useState(0);
  const drag = useRef<null | { mode: string; x: number; y: number; vp: ViewportState; ann?: Ann }>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  useEffect(() => {
    if (!canvasRef.current) return;
    rend.current = createRenderer(canvasRef.current);
    const ro = new ResizeObserver(() => {
      const b = boxRef.current!;
      setSize([b.clientWidth, b.clientHeight]);
    });
    ro.observe(boxRef.current!);
    return () => {
      ro.disconnect();
      rend.current?.dispose();
    };
  }, []);

  // görüntü
  const image: ImageOut | null = useMemo(() => {
    if (!sd || vp.orientation === 'scout') return null;
    if (vp.orientation === 'axial') return axialImage(sd, vp.index, viewer.slab, viewer.slabMode);
    return reformat(sd, vp.orientation, vp.index, viewer.slab, viewer.slabMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sd, meta?.version, vp.orientation, vp.index, viewer.slab, viewer.slabMode]);

  // çizim
  useEffect(() => {
    const c = canvasRef.current, r = rend.current, ov = ovRef.current;
    if (!c || !r || !ov) return;
    const W = Math.max(1, Math.round(size[0] * dpr)), H = Math.max(1, Math.round(size[1] * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    ov.width = W;
    ov.height = H;
    const g = ov.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (vp.orientation === 'scout') {
      drawScout(g, W, H, sd, viewer.vps[0].index);
      r.render(vp, 1, 0);
      return;
    }
    if (!image) {
      r.render(vp, vp.ww, vp.wl);
      return;
    }
    r.setImage(image.data, image.w, image.h, image.spacing);
    r.render(vp, vp.ww, vp.wl);
    if (!sd) return;
    // referans çizgileri (MPR)
    if (viewer.layout === 'mpr') {
      g.lineWidth = 1 * dpr;
      const m = sd.m, n = sd.zs.length;
      const toS = (mx: number, my: number) => r.mmToScreen(mx, my, vp);
      const halfW = (image.w * image.spacing[0]) / 2, halfH = (image.h * image.spacing[1]) / 2;
      const lineH = (ymm: number, col: string) => {
        const [x0, y0] = toS(-halfW, ymm), [x1] = toS(halfW, ymm);
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y0);
        g.stroke();
      };
      const lineV = (xmm: number, col: string) => {
        const [x0, y0] = toS(xmm, -halfH), [, y1] = toS(xmm, halfH);
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0, y1);
        g.stroke();
      };
      const cor = viewer.vps.find((v) => v.orientation === 'coronal')?.index ?? 0;
      const sag = viewer.vps.find((v) => v.orientation === 'sagittal')?.index ?? 0;
      const ax = viewer.vps.find((v) => v.orientation === 'axial')?.index ?? 0;
      const colMm = (i: number) => (i - (m - 1) / 2) * sd.pix;
      const zMm = (k: number) => (k - (n - 1) / 2) * sd.params.interval;
      if (vp.orientation === 'axial') {
        lineH(colMm(cor), 'rgba(80,220,120,0.7)');
        lineV(colMm(sag), 'rgba(255,120,80,0.7)');
      } else if (vp.orientation === 'coronal') {
        lineH(zMm(ax), 'rgba(80,170,255,0.7)');
        lineV(colMm(sag), 'rgba(255,120,80,0.7)');
      } else {
        lineH(zMm(ax), 'rgba(80,170,255,0.7)');
        lineV(colMm(cor), 'rgba(80,220,120,0.7)');
      }
    }
    // ölçümler
    const key = `${sd.id}|${vp.orientation}|${vp.index}`;
    const anns = [...(annStore.get(key) ?? [])];
    if (drag.current?.ann) anns.push(drag.current.ann);
    for (const a of anns) drawAnn(g, a, r, vp, image, dpr);
    void ver;
  }, [image, vp, size, viewer.layout, viewer.vps, ver, sd, dpr, topoVer, meta?.version]);

  const n = sd ? nSlicesFor(sd, vp.orientation) : 0;

  const huAt = (mm: [number, number]): number | null => {
    if (!image) return null;
    const ix = Math.round(mm[0] / image.spacing[0] + image.w / 2 - 0.5);
    const iy = Math.round(mm[1] / image.spacing[1] + image.h / 2 - 0.5);
    if (ix < 0 || iy < 0 || ix >= image.w || iy >= image.h) return null;
    return image.data[iy * image.w + ix];
  };

  const local = (e: React.PointerEvent | React.WheelEvent): [number, number] => {
    const rc = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rc.left) * dpr, (e.clientY - rc.top) * dpr];
  };

  const setCross = (mm: [number, number]) => {
    if (!sd || !image) return;
    const m = sd.m, nn = sd.zs.length;
    const col = Math.round(mm[0] / sd.pix + (m - 1) / 2);
    const vps = viewer.vps.map((v) => ({ ...v }));
    const set = (o: string, i: number) => vps.forEach((v) => v.orientation === o && (v.index = i));
    if (vp.orientation === 'axial') {
      set('coronal', Math.round(mm[1] / sd.pix + (m - 1) / 2));
      set('sagittal', col);
    } else {
      const k = Math.round(mm[1] / sd.params.interval + (nn - 1) / 2);
      set('axial', k);
      if (vp.orientation === 'coronal') set('sagittal', col);
      else set('coronal', col);
    }
    setViewer({ vps });
  };

  const key = sd ? `${sd.id}|${vp.orientation}|${vp.index}` : '';
  const zText = sd && vp.orientation === 'axial' ? `z ${sd.zs[Math.min(sd.zs.length - 1, vp.index)]?.toFixed(1)} mm` : sd ? `${vp.orientation === 'coronal' ? 'y' : 'x'} ${((vp.index - (sd.m - 1) / 2) * sd.pix + (vp.orientation === 'coronal' ? sd.cy : sd.cx)).toFixed(1)} mm` : '';
  const st = sd && vp.orientation === 'axial' ? sd.stats[Math.min(sd.stats.length - 1, vp.index)] : null;
  const ps = sd && vp.orientation === 'axial' ? sd.planned.reduce((b, s) => (Math.abs(s.z - sd.zs[vp.index]) < Math.abs(b.z - sd.zs[vp.index]) ? s : b), sd.planned[0]) : null;
  const ori =
    vp.orientation === 'axial' ? ['A', 'P', 'R', 'L'] : vp.orientation === 'coronal' ? ['S', 'I', 'R', 'L'] : vp.orientation === 'sagittal' ? ['S', 'I', 'A', 'P'] : ['S', 'I', 'R', 'L'];

  return (
    <div
      ref={boxRef}
      className={'vp' + (viewer.active === idx ? ' active' : '')}
      onPointerDown={() => viewer.active !== idx && setViewer({ active: idx })}
    >
      <canvas ref={canvasRef} />
      <canvas
        ref={ovRef}
        style={{ cursor: viewer.tool === 'pan' ? 'grab' : viewer.tool === 'measure' || viewer.tool === 'roi' || viewer.tool === 'probe' ? 'crosshair' : 'default' }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          if (!sd || vp.orientation === 'scout') return;
          if (e.ctrlKey) {
            setViewport(idx, { zoom: Math.max(0.3, Math.min(12, vp.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) });
          } else {
            const d = e.deltaY > 0 ? 1 : -1;
            setViewport(idx, { index: Math.max(0, Math.min(n - 1, vp.index + d)) });
          }
        }}
        onPointerDown={(e) => {
          if (vp.orientation === 'scout') return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const p = local(e);
          const mm = rend.current!.screenToMm(p[0], p[1], vp);
          let mode: string = viewer.tool;
          if (e.button === 2) mode = 'wl';
          if (e.button === 1) mode = 'pan';
          if (e.shiftKey) mode = 'probe';
          const d: NonNullable<typeof drag.current> = { mode, x: p[0], y: p[1], vp: { ...vp } };
          if (mode === 'measure') d.ann = { kind: 'line', a: mm, b: mm };
          if (mode === 'roi') d.ann = { kind: 'roi', a: mm, b: mm };
          if (mode === 'probe') setCross(mm);
          drag.current = d;
        }}
        onPointerMove={(e) => {
          if (!rend.current) return;
          const p = local(e);
          const mm = rend.current.screenToMm(p[0], p[1], vp);
          setCursor({ mm, hu: huAt(mm) });
          const d = drag.current;
          if (!d) return;
          const dx = p[0] - d.x, dy = p[1] - d.y;
          if (d.mode === 'wl') setViewport(idx, { ww: Math.max(1, d.vp.ww + dx * 2.5), wl: d.vp.wl + dy * 1.5 });
          else if (d.mode === 'pan') {
            const k = rend.current.scale(vp);
            setViewport(idx, { panX: d.vp.panX + dx / k, panY: d.vp.panY + dy / k });
          } else if (d.mode === 'zoom') setViewport(idx, { zoom: Math.max(0.3, Math.min(12, d.vp.zoom * Math.exp(-dy / 200))) });
          else if (d.mode === 'probe') setCross(mm);
          else if (d.ann) {
            d.ann.b = mm;
            setVer((v) => v + 1);
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          if (d?.ann && key) {
            const len = Math.hypot(d.ann.b[0] - d.ann.a[0], d.ann.b[1] - d.ann.a[1]);
            if (len > 1) annStore.set(key, [...(annStore.get(key) ?? []), d.ann]);
            annVer++;
          }
          drag.current = null;
          setVer((v) => v + 1);
        }}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => setViewer({ layout: viewer.layout === '1x1' ? 'mpr' : '1x1', active: idx, vps: viewer.layout === '1x1' ? viewer.vps : [viewer.vps[idx], ...viewer.vps.filter((_, i) => i !== idx)] })}
      />
      {viewer.showOverlay && sd && meta && vp.orientation !== 'scout' && (
        <>
          <div className="ov tl">
            {`SENTETİK^FANTOM\nID SIM-0001  54Y E\n${meta.name}\n${vp.orientation === 'axial' ? 'Aksiyel' : vp.orientation === 'coronal' ? 'Koronal MPR' : 'Sagittal MPR'}${viewer.slab > 0 ? ` ${viewer.slabMode.toUpperCase()} ${viewer.slab} mm` : ''}\nIm: ${vp.index + 1}/${n}  ${zText}`}
          </div>
          <div className="ov tr">
            {`SIM-CT 256 (eğitim)\n${sd.params.kVp} kV  ${ps ? ps.mAsEff.toFixed(0) : sd.plan.mAsEffNominal.toFixed(0)} eff.mAs${ps ? `  ${ps.mA.toFixed(0)} mA` : ''}\nRot ${sd.params.rotTime}s  Pitch ${sd.params.pitch}\nCTDIvol ${ps ? ps.ctdi.toFixed(1) : sd.plan.ctdiVol.toFixed(1)} mGy${ps?.t != null ? `\nt+${ps.t.toFixed(0)} s kontrast` : ''}`}
          </div>
          <div className="ov bl">
            {`Kesit ${sd.params.thickness} mm / ${sd.params.interval} mm\nKernel ${KERNELS[sd.params.kernel].label}  ${sd.params.recon === 'IR' ? `IR-${sd.params.irLevel}` : 'FBP'}${sd.params.mar ? ' MAR' : ''}\nDFOV ${sd.params.dfov} mm  ${sd.m}×${sd.m}${st ? `\nσ≈${st.noiseSigma.toFixed(1)} HU  NEQ ${st.meanNeq.toFixed(0)}` : ''}`}
          </div>
          <div className="ov br">
            {`W ${vp.ww.toFixed(0)}  L ${vp.wl.toFixed(0)}\nZoom ${(vp.zoom * 100).toFixed(0)}%${cursor ? `\n(${cursor.mm[0].toFixed(1)}, ${cursor.mm[1].toFixed(1)}) mm\nHU ${cursor.hu ?? '—'}` : ''}`}
          </div>
          <div className="ori" style={{ top: '50%', left: 6 }}>{ori[2]}</div>
          <div className="ori" style={{ top: '50%', right: 14 }}>{ori[3]}</div>
          <div className="ori" style={{ top: 4, left: '50%' }}>{ori[0]}</div>
          <div className="ori" style={{ bottom: 18, left: '50%' }}>{ori[1]}</div>
          <div className="edu">EĞİTİM AMAÇLI SİMÜLASYON · SENTETİK GÖRÜNTÜ · TANI AMAÇLI DEĞİLDİR</div>
          <div className="scrollbar">
            <div style={{ top: `${(vp.index / Math.max(1, n - 1)) * 100}%` }} />
          </div>
        </>
      )}
      {!sd && <div className="empty">Seri yok – tarama yapın.</div>}
      {sd && vp.orientation === 'axial' && !image && <div className="empty" style={{ position: 'absolute', inset: 0 }}>Rekonstrüksiyon bekleniyor… ({meta?.nDone}/{meta?.nTotal})</div>}
    </div>
  );
}

function drawAnn(g: CanvasRenderingContext2D, a: Ann, r: AnyRenderer, vp: ViewportState, img: ImageOut, dpr: number) {
  const [x0, y0] = r.mmToScreen(a.a[0], a.a[1], vp);
  const [x1, y1] = r.mmToScreen(a.b[0], a.b[1], vp);
  g.lineWidth = 1.5 * dpr;
  g.font = `${12 * dpr}px monospace`;
  if (a.kind === 'line') {
    g.strokeStyle = '#ffe14d';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      g.beginPath();
      g.arc(x, y, 3 * dpr, 0, Math.PI * 2);
      g.stroke();
    }
    const len = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]);
    g.fillStyle = '#ffe14d';
    g.fillText(`${len.toFixed(1)} mm`, x1 + 6 * dpr, y1 - 4 * dpr);
  } else {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    g.strokeStyle = '#5cf0a0';
    g.beginPath();
    g.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    g.stroke();
    // istatistik
    const mx0 = Math.min(a.a[0], a.b[0]), mx1 = Math.max(a.a[0], a.b[0]), my0 = Math.min(a.a[1], a.b[1]), my1 = Math.max(a.a[1], a.b[1]);
    const ecx = (mx0 + mx1) / 2, ecy = (my0 + my1) / 2, erx = (mx1 - mx0) / 2, ery = (my1 - my0) / 2;
    let s = 0, s2 = 0, n = 0, mn = Infinity, mxv = -Infinity;
    const i0 = Math.max(0, Math.floor(mx0 / img.spacing[0] + img.w / 2)), i1 = Math.min(img.w - 1, Math.ceil(mx1 / img.spacing[0] + img.w / 2));
    const j0 = Math.max(0, Math.floor(my0 / img.spacing[1] + img.h / 2)), j1 = Math.min(img.h - 1, Math.ceil(my1 / img.spacing[1] + img.h / 2));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = (i - img.w / 2 + 0.5) * img.spacing[0], y = (j - img.h / 2 + 0.5) * img.spacing[1];
        if (erx <= 0 || ery <= 0 || ((x - ecx) / erx) ** 2 + ((y - ecy) / ery) ** 2 > 1) continue;
        const v = img.data[j * img.w + i];
        s += v;
        s2 += v * v;
        n++;
        if (v < mn) mn = v;
        if (v > mxv) mxv = v;
      }
    if (n > 0) {
      const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      const area = Math.PI * erx * ery;
      const lines = [`Ort ${mean.toFixed(1)} HU`, `SD ${sd.toFixed(1)}`, `Min/Maks ${mn}/${mxv}`, `Alan ${(area / 100).toFixed(2)} cm²`];
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(cx + rx + 4 * dpr, cy - 8 * dpr, 150 * dpr, 60 * dpr);
      g.fillStyle = '#5cf0a0';
      lines.forEach((l, k) => g.fillText(l, cx + rx + 8 * dpr, cy + 5 * dpr + k * 14 * dpr));
    }
  }
}

function drawScout(g: CanvasRenderingContext2D, W: number, H: number, sd: SeriesData | null, axIdx: number) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const td = topoStore.current;
  if (!td) return;
  const lenMm = td.rows * td.dz, widMm = td.cols * td.dx;
  const s = Math.min(W / widMm, H / lenMm) * 0.95;
  const ox = (W - widMm * s) / 2, oy = (H - lenMm * s) / 2;
  const oc = document.createElement('canvas');
  oc.width = td.cols;
  oc.height = td.rows;
  const og = oc.getContext('2d')!;
  const id = og.createImageData(td.cols, td.rows);
  let hi = 0;
  for (let i = 0; i < td.data.length; i += 7) hi = Math.max(hi, td.data[i]);
  hi *= 0.92;
  for (let i = 0; i < td.data.length; i++) {
    const v = Math.round(255 * Math.pow(Math.min(1, Math.max(0, td.data[i] / hi)), 0.75));
    id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v;
    id.data[4 * i + 3] = 255;
  }
  og.putImageData(id, 0, 0);
  g.drawImage(oc, ox, oy, widMm * s, lenMm * s);
  if (sd) {
    const z0 = sd.zs[0], z1 = sd.zs[sd.zs.length - 1];
    const y = (z: number) => oy + (z - td.z0) * s;
    g.strokeStyle = 'rgba(60,200,255,0.8)';
    g.strokeRect(ox + (widMm / 2 + sd.cx - sd.params.dfov / 2) * s, y(z0), sd.params.dfov * s, (z1 - z0) * s);
    const z = sd.zs[Math.min(sd.zs.length - 1, axIdx)];
    g.strokeStyle = '#ffe14d';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ox, y(z));
    g.lineTo(ox + widMm * s, y(z));
    g.stroke();
    g.fillStyle = '#ffe14d';
    g.font = '12px monospace';
    g.fillText(`z ${z.toFixed(0)} mm`, ox + 4, y(z) - 4);
  }
  g.fillStyle = '#ffd36a';
  g.font = '11px sans-serif';
  g.fillText('Topogram (referans çizgisi) – SENTETİK', 6, 14);
}

export { annVer };
