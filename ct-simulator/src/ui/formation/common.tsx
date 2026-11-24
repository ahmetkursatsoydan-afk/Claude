/**
 * Görüntü oluşumu gezgini – ortak arayüz parçaları:
 *  - ImageView: Float32 veri → gri/ıraksak renk haritalı tuval (en-boy korumalı), bindirme
 *    çizimi ve fare olayları (veri piksel koordinatlarında)
 *  - Explain / Points / Formula / Figure / StatChip: açıklama ve yerleşim yardımcıları
 *  - PipelineMap: görüntü zinciri şeması (vurgulu halkalar)
 *  - useFormation: veri + durum kancası
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../state/store';
import { formationData } from '../../app/formation';
import { CHAIN, type ChainStep } from '../../app/artifactAtlas';
import type { FormationResult } from '../../sim/formation';

export { SERIES } from '../physics/LineChart';

/* ------------------------------------------------------------------ */
/* Veri kancası                                                         */
/* ------------------------------------------------------------------ */

/** Gezgin verisi + durum. Bileşen, ilgili sürüm değiştiğinde yeniden çizilir. */
export function useFormation(): {
  main: FormationResult | null;
  iter: FormationResult | null;
  status: 'idle' | 'running' | 'done' | 'error';
  iterStatus: 'idle' | 'running' | 'done' | 'error';
} {
  const status = useApp((s) => s.formation.status);
  const iterStatus = useApp((s) => s.formation.iterStatus);
  useApp((s) => s.formation.ver);
  useApp((s) => s.formation.iterVer);
  return { main: formationData.main, iter: formationData.iter, status, iterStatus };
}

/* ------------------------------------------------------------------ */
/* Sayısal yardımcılar                                                  */
/* ------------------------------------------------------------------ */

/** Yüzdelik tabanlı otomatik pencere (örneklemeli). */
export function autoWindow(data: ArrayLike<number>, pLo = 0.01, pHi = 0.99, skip?: (v: number) => boolean): { lo: number; hi: number } {
  const n = data.length;
  const step = Math.max(1, Math.floor(n / 40000));
  const vals: number[] = [];
  for (let i = 0; i < n; i += step) {
    const v = data[i];
    if (!isFinite(v) || (skip && skip(v))) continue;
    vals.push(v);
  }
  if (!vals.length) return { lo: 0, hi: 1 };
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor(pLo * (vals.length - 1))], hi = vals[Math.floor(pHi * (vals.length - 1))];
  return hi > lo ? { lo, hi } : { lo: lo - 1, hi: lo + 1 };
}

/** W/L → [lo, hi] */
export const wl = (ww: number, l: number) => ({ lo: l - ww / 2, hi: l + ww / 2 });

/** Sinogramın v'inci görünüm satırı. */
export function sinoRow(s: Float32Array, nb: number, v: number): Float32Array {
  const vv = Math.max(0, Math.min(Math.floor(s.length / nb) - 1, Math.round(v)));
  return s.subarray(vv * nb, (vv + 1) * nb);
}

/** Görüntünün j'inci satırı (yatay profil). */
export function imageRow(img: Float32Array, m: number, j: number): Float32Array {
  const jj = Math.max(0, Math.min(m - 1, Math.round(j)));
  return img.subarray(jj * m, (jj + 1) * m);
}

/** Dizi → çizgi grafiği noktaları; x(i) eşlemesi ve isteğe bağlı seyreltme. */
export function toPts(a: ArrayLike<number>, x: (i: number) => number, stride = 1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < a.length; i += stride) out.push([x(i), a[i]]);
  return out;
}

/** Kanal indeksi → izomerkeze uzaklık (mm). */
export const binToMm = (b: number, nb: number, ds: number) => (b - (nb - 1) / 2) * ds;
/** Görüntü pikseli → mm (izomerkez merkezli). */
export const pixToMm = (i: number, m: number, pix: number) => (i - (m - 1) / 2) * pix;

/* ------------------------------------------------------------------ */
/* Renk haritaları                                                      */
/* ------------------------------------------------------------------ */

export type Cmap = 'gray' | 'div' | 'heat';

const DIV_NEG = [57, 135, 229], DIV_POS = [217, 89, 38], DIV_MID = [16, 22, 28];

function cmapRGB(c: Cmap, t: number, out: Uint8ClampedArray, o: number) {
  if (c === 'gray') {
    const v = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
    out[o] = out[o + 1] = out[o + 2] = v;
    return;
  }
  if (c === 'div') {
    // t ∈ [0,1], 0.5 = sıfır: mavi ← koyu → turuncu
    const u = Math.max(-1, Math.min(1, 2 * t - 1));
    const end = u < 0 ? DIV_NEG : DIV_POS;
    const a = Math.abs(u);
    out[o] = DIV_MID[0] + (end[0] - DIV_MID[0]) * a;
    out[o + 1] = DIV_MID[1] + (end[1] - DIV_MID[1]) * a;
    out[o + 2] = DIV_MID[2] + (end[2] - DIV_MID[2]) * a;
    return;
  }
  // heat: siyah → koyu kırmızı → turuncu → açık sarı
  const x = Math.max(0, Math.min(1, t));
  out[o] = Math.min(255, 255 * Math.min(1, x * 1.6));
  out[o + 1] = Math.max(0, Math.min(255, 255 * (x * 1.6 - 0.55)));
  out[o + 2] = Math.max(0, Math.min(255, 255 * (x * 2 - 1.4)));
}

/* ------------------------------------------------------------------ */
/* ImageView                                                            */
/* ------------------------------------------------------------------ */

export interface ImageViewProps {
  data: ArrayLike<number> | null;
  /** veri boyutu (sütun × satır) */
  w: number;
  h: number;
  /** görüntüleme penceresi; 'auto' = %1–99 yüzdelik */
  win?: { lo: number; hi: number } | 'auto';
  cmap?: Cmap;
  /** ıraksak harita için simetrik ölçek (|v| ≤ range) – win yerine */
  divRange?: number;
  /** fiziksel en-boy oranı (genişlik/yükseklik); varsayılan w/h */
  aspect?: number;
  /** sabit yükseklik (px); verilmezse genişliğe göre en-boy oranından */
  height?: number;
  /** üst sol köşe etiketi */
  tag?: ReactNode;
  /** alt yazı */
  caption?: ReactNode;
  /** bindirme: veri pikseli (fx, fy) → ekran (x, y) dönüşümüyle çiz */
  overlay?: (g: CanvasRenderingContext2D, toScreen: (fx: number, fy: number) => [number, number], scale: number) => void;
  /** bindirmeyi yeniden çizmek için anahtar */
  overlayKey?: unknown;
  onHover?: (fx: number, fy: number) => void;
  onLeave?: () => void;
  onDown?: (fx: number, fy: number) => void;
  onDrag?: (fx: number, fy: number) => void;
  cursor?: string;
  /** piksel görünümü (yakın komşu) */
  pixelated?: boolean;
}

export function ImageView(p: ImageViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ov = useRef<HTMLCanvasElement>(null);
  const [W, setW] = useState(300);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const aspect = p.aspect ?? p.w / p.h;
  const H = p.height ?? Math.round(W / aspect);
  const dragging = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(80, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(80, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // veri → ImageData (yalnızca veri/pencere değişince)
  const bitmap = useMemo(() => {
    if (!p.data || p.w <= 0 || p.h <= 0) return null;
    const c = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    const g = c.getContext('2d')!;
    const id = g.createImageData(p.w, p.h);
    const cm = p.cmap ?? 'gray';
    let lo: number, hi: number;
    if (cm === 'div') {
      const r = p.divRange ?? (() => {
        const a = autoWindow(p.data!, 0.02, 0.98);
        return Math.max(Math.abs(a.lo), Math.abs(a.hi)) || 1;
      })();
      lo = -r;
      hi = r;
    } else {
      const wv = p.win === undefined || p.win === 'auto' ? autoWindow(p.data) : p.win;
      lo = wv.lo;
      hi = wv.hi;
    }
    const k = 1 / (hi - lo || 1);
    const d = p.data;
    for (let i = 0, n = p.w * p.h; i < n; i++) {
      cmapRGB(cm, (d[i] - lo) * k, id.data, 4 * i);
      id.data[4 * i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }, [p.data, p.w, p.h, p.cmap, p.divRange, typeof p.win === 'object' ? p.win.lo : p.win, typeof p.win === 'object' ? p.win.hi : 0]);

  // yerleşim: en-boy korumalı sığdırma
  const fit = useMemo(() => {
    // piksel en-boyu (ekranda genişlik/yükseklik): fiziksel en-boy oranını korur
    const pa = (aspect * p.h) / p.w;
    const sy = Math.min(W / (p.w * pa), H / p.h);
    const sx = sy * pa;
    const fw = p.w * sx, fh = p.h * sy;
    return { ox: (W - fw) / 2, oy: (H - fh) / 2, sx, sy };
  }, [W, H, p.w, p.h, aspect]);

  useEffect(() => {
    const c = cv.current, o = ov.current;
    if (!c || !o) return;
    for (const el of [c, o]) {
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (bitmap) {
      g.imageSmoothingEnabled = !p.pixelated;
      g.drawImage(bitmap, fit.ox, fit.oy, p.w * fit.sx, p.h * fit.sy);
    }
    const og = o.getContext('2d')!;
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    og.clearRect(0, 0, W, H);
    if (p.overlay && bitmap) {
      og.save();
      p.overlay(og, (fx, fy) => [fit.ox + (fx + 0.5) * fit.sx, fit.oy + (fy + 0.5) * fit.sy], fit.sx);
      og.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, W, H, dpr, fit, p.overlayKey, p.pixelated]);

  const toData = (e: React.PointerEvent): [number, number] => {
    const r = ov.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return [(x - fit.ox) / fit.sx - 0.5, (y - fit.oy) / fit.sy - 0.5];
  };

  return (
    <div className="fx-img">
      <div ref={box} className="fx-img-box" style={{ height: H }}>
        <canvas ref={cv} style={{ width: W, height: H }} />
        <canvas
          ref={ov}
          style={{ width: W, height: H, cursor: p.cursor ?? (p.onDown ? 'crosshair' : 'default') }}
          onPointerMove={(e) => {
            const [fx, fy] = toData(e);
            p.onHover?.(fx, fy);
            if (dragging.current) p.onDrag?.(fx, fy);
          }}
          onPointerLeave={() => p.onLeave?.()}
          onPointerDown={(e) => {
            const [fx, fy] = toData(e);
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            p.onDown?.(fx, fy);
          }}
          onPointerUp={() => (dragging.current = false)}
        />
        {p.tag && <div className="fx-tag">{p.tag}</div>}
        {!p.data && <div className="fx-empty">veri yok</div>}
      </div>
      {p.caption && <div className="fx-cap">{p.caption}</div>}
    </div>
  );
}

/** Renk çubuğu (ıraksak/gri) – değer aralığı etiketleriyle. */
export function ColorBar({ cmap, lo, hi, unit }: { cmap: Cmap; lo: number; hi: number; unit?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 256;
    c.height = 1;
    const g = c.getContext('2d')!;
    const id = g.createImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      cmapRGB(cmap, i / 255, id.data, 4 * i);
      id.data[4 * i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }, [cmap]);
  const f = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toPrecision(2));
  return (
    <div className="fx-cbar">
      <span>{f(lo)}</span>
      <canvas ref={ref} />
      <span>
        {f(hi)} {unit}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metin ve yerleşim                                                    */
/* ------------------------------------------------------------------ */

/** Açıklama kutusu (başlık + paragraflar). */
export function Explain({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="fx-explain">
      {title && <h4>{title}</h4>}
      {children}
    </div>
  );
}

/** "Dikkat edin" maddeleri. */
export function Points({ title = 'Neye dikkat etmeli?', items }: { title?: string; items: ReactNode[] }) {
  return (
    <div className="fx-points">
      <h4>{title}</h4>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/** Formül satırı (tek satırlık matematik). */
export function Formula({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="fx-formula">
      <div className="f">{children}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

/** Esnek şekil ızgarası (dar ekranda tek sütun). */
export function Figure({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className={`fx-fig c${cols}`}>{children}</div>;
}

export function StatChip({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'a' | 'b' | 'ok' | 'warn' }) {
  return (
    <div className={'fx-stat' + (tone ? ' ' + tone : '')}>
      <span className="l">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

/** Kaydırıcı + oynat düğmesi (anlık görüntü dizileri için). */
export function StepPlayer({ count, index, onChange, label, fps = 2.5 }: { count: number; index: number; onChange: (i: number) => void; label: ReactNode; fps?: number }) {
  const [play, setPlay] = useState(false);
  const idx = useRef(index);
  idx.current = index;
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => {
      const n = idx.current + 1;
      if (n >= count) {
        setPlay(false);
        return;
      }
      onChange(n);
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [play, count, fps, onChange]);
  return (
    <div className="fx-player">
      <button
        className="btn sm"
        onClick={() => {
          if (!play && index >= count - 1) onChange(0);
          setPlay(!play);
        }}
      >
        {play ? '❚❚' : '▶'}
      </button>
      <input type="range" min={0} max={Math.max(0, count - 1)} value={index} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="lbl">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Zincir şeması                                                        */
/* ------------------------------------------------------------------ */

/** Görüntü zinciri: X-ışını tüpü → hasta → dedektör → ön işleme → örnekleme → rekon → görüntü. */
export function PipelineMap({ highlight = [], onPick, compact }: { highlight?: ChainStep[]; onPick?: (s: ChainStep) => void; compact?: boolean }) {
  return (
    <div className={'fx-chain' + (compact ? ' compact' : '')} role="list">
      {CHAIN.map((c, i) => (
        <div key={c.id} className="fx-chain-item" role="listitem">
          <button className={'node' + (highlight.includes(c.id) ? ' hi' : '')} onClick={onPick ? () => onPick(c.id) : undefined} disabled={!onPick} title={c.sub}>
            <span className="n">{i + 1}</span>
            <span className="t">{c.label}</span>
            {!compact && <span className="s">{c.sub}</span>}
          </button>
          {i < CHAIN.length - 1 && <span className="arr">→</span>}
        </div>
      ))}
    </div>
  );
}

/** Hesaplama yoksa/sürüyorsa yer tutucu. */
export function NeedData({ status, what = 'Aşama verisi' }: { status: string; what?: string }) {
  return <div className="fx-need">{status === 'running' ? `${what} hesaplanıyor…` : status === 'error' ? 'Hesaplama hatası – kaynağı değiştirip yeniden deneyin.' : 'Üstteki “Hesapla” düğmesiyle başlatın.'}</div>;
}
