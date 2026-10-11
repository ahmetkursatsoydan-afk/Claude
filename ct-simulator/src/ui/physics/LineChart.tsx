/**
 * Hafif canvas çizgi grafiği: 2 px çizgiler, saç teli ızgara, lejant + seçici uç etiketleri,
 * fareyle artı imleci ve araç ipucu. Metinler daima metin renginde (seri renginde değil).
 */
import { useEffect, useRef, useState } from 'react';

/** Koyu yüzey (#0a0f14) için doğrulanmış kategorik sıra */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767'];

export interface ChartSeries {
  name: string;
  color: string;
  pts: [number, number][];
  dash?: boolean;
  width?: number;
}

export interface ChartProps {
  series: ChartSeries[];
  height?: number;
  xLabel: string;
  yLabel: string;
  xLog?: boolean;
  yLog?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  vlines?: { x: number; label: string }[];
  fmtX?: (v: number) => string;
  fmtY?: (v: number) => string;
  endLabels?: boolean;
}

const TXT = '#dbe5ee', TXT2 = '#8b9aa8', GRID = '#1d2731', SURF = '#0a0f14';

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  return out;
}

export function LineChart(p: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(400);
  const [hover, setHover] = useState<{ x: number; px: number; py: number } | null>(null);
  const H = p.height ?? 220;
  const pad = { l: 52, r: p.endLabels === false ? 12 : 92, t: 10, b: 34 };

  useEffect(() => {
    const ro = new ResizeObserver(() => wrap.current && setW(wrap.current.clientWidth));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const all = p.series.flatMap((s) => s.pts);
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]).filter((v) => isFinite(v));
  const xMin = p.xMin ?? Math.min(...xs), xMax = p.xMax ?? Math.max(...xs);
  const yMin = p.yMin ?? Math.min(...ys), yMax = p.yMax ?? Math.max(...ys);
  const fx = (v: number) => (p.xLog ? (Math.log(v) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) : (v - xMin) / (xMax - xMin || 1));
  const fy = (v: number) => (p.yLog ? (Math.log(Math.max(v, yMin)) - Math.log(yMin)) / (Math.log(yMax) - Math.log(yMin)) : (v - yMin) / (yMax - yMin || 1));
  const X = (v: number) => pad.l + fx(v) * (w - pad.l - pad.r);
  const Y = (v: number) => H - pad.b - fy(v) * (H - pad.t - pad.b);
  const invX = (px: number) => {
    const t = (px - pad.l) / (w - pad.l - pad.r);
    return p.xLog ? Math.exp(Math.log(xMin) + t * (Math.log(xMax) - Math.log(xMin))) : xMin + t * (xMax - xMin);
  };
  const fmtX = p.fmtX ?? ((v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)));
  const fmtY = p.fmtY ?? ((v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toPrecision(2)));

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = H * dpr;
    c.style.height = H + 'px';
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = SURF;
    g.fillRect(0, 0, w, H);
    g.font = '10.5px Inter, Segoe UI, sans-serif';
    // ızgara
    const xt = p.xLog ? logTicks(xMin, xMax) : niceTicks(xMin, xMax, 6);
    const yt = p.yLog ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, 5);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.fillStyle = TXT2;
    g.textAlign = 'center';
    for (const v of xt) {
      const x = Math.round(X(v)) + 0.5;
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, H - pad.b);
      g.stroke();
      g.fillText(fmtX(v), x, H - pad.b + 13);
    }
    g.textAlign = 'right';
    for (const v of yt) {
      const y = Math.round(Y(v)) + 0.5;
      g.beginPath();
      g.moveTo(pad.l, y);
      g.lineTo(w - pad.r, y);
      g.stroke();
      g.fillText(fmtY(v), pad.l - 5, y + 3);
    }
    g.textAlign = 'center';
    g.fillText(p.xLabel, pad.l + (w - pad.l - pad.r) / 2, H - 4);
    g.save();
    g.translate(11, pad.t + (H - pad.t - pad.b) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(p.yLabel, 0, 0);
    g.restore();
    // dikey işaretler
    for (const v of p.vlines ?? []) {
      if (v.x < xMin || v.x > xMax) continue;
      const x = Math.round(X(v.x)) + 0.5;
      g.strokeStyle = '#4a5866';
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, H - pad.b);
      g.stroke();
      g.fillStyle = TXT2;
      g.textAlign = 'left';
      g.fillText(v.label, x + 3, pad.t + 10);
    }
    // seriler
    g.save();
    g.beginPath();
    g.rect(pad.l, pad.t, w - pad.l - pad.r, H - pad.t - pad.b);
    g.clip();
    for (const s of p.series) {
      g.strokeStyle = s.color;
      g.lineWidth = s.width ?? 2;
      g.lineJoin = g.lineCap = 'round';
      g.setLineDash(s.dash ? [5, 4] : []);
      g.beginPath();
      let started = false;
      for (const [x, y] of s.pts) {
        if (!isFinite(y) || (p.yLog && y <= 0)) {
          started = false;
          continue;
        }
        if (!started) g.moveTo(X(x), Y(y));
        else g.lineTo(X(x), Y(y));
        started = true;
      }
      g.stroke();
    }
    g.restore();
    g.setLineDash([]);
    // uç etiketleri (metin renginde, yanında renkli işaret)
    if (p.endLabels !== false) {
      // uç etiketleri: y'ye göre sırala, çakışmaları çizim alanı içinde çöz
      const items = p.series
        .map((s) => {
          const last = [...s.pts].reverse().find((q) => isFinite(q[1]) && q[0] <= xMax && (!p.yLog || q[1] > 0));
          return last ? { s, y: Math.max(pad.t + 6, Math.min(H - pad.b - 4, Y(last[1]))) } : null;
        })
        .filter((o): o is { s: ChartSeries; y: number } => !!o)
        .sort((a, b) => a.y - b.y);
      const gap = 12, top = pad.t + 5, bot = H - pad.b - 3;
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
      const over = items.length ? items[items.length - 1].y - bot : 0;
      if (over > 0) for (const it of items) it.y -= over;
      for (let i = 0; i < items.length; i++) if (items[i].y < top + i * gap) items[i].y = top + i * gap;
      for (const { s, y } of items) {
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(w - pad.r + 8, y, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = TXT;
        g.textAlign = 'left';
        g.fillText(s.name.length > 13 ? s.name.slice(0, 12) + '…' : s.name, w - pad.r + 15, y + 3.5);
      }
    }
    // artı imleci
    if (hover) {
      const x = Math.round(hover.px) + 0.5;
      g.strokeStyle = '#6b7a88';
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, H - pad.b);
      g.stroke();
      for (const s of p.series) {
        const q = nearest(s.pts, hover.x);
        if (!q || !isFinite(q[1])) continue;
        g.fillStyle = SURF;
        g.beginPath();
        g.arc(X(q[0]), Y(q[1]), 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(X(q[0]), Y(q[1]), 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  });

  const tip = hover
    ? p.series
        .map((s) => ({ s, q: nearest(s.pts, hover.x) }))
        .filter((o) => o.q && isFinite(o.q[1]))
    : [];

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', display: 'block', borderRadius: 4 }}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const px = e.clientX - r.left;
          if (px < pad.l || px > w - pad.r) return setHover(null);
          setHover({ x: invX(px), px, py: e.clientY - r.top });
        }}
        onPointerLeave={() => setHover(null)}
      />
      {hover && tip.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(w - 170, hover.px + 12),
            top: 8,
            background: 'rgba(16,22,29,0.95)',
            border: '1px solid #33424f',
            borderRadius: 5,
            padding: '5px 8px',
            fontSize: 11,
            pointerEvents: 'none',
            minWidth: 140,
          }}
        >
          <div style={{ color: TXT2 }}>
            {p.xLabel}: {fmtX(hover.x)}
          </div>
          {tip.map(({ s, q }) => (
            <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center', color: TXT }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: 'inline-block' }} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <span style={{ fontFamily: 'monospace' }}>{fmtY(q![1])}</span>
            </div>
          ))}
        </div>
      )}
      {p.series.length >= 2 && (
        <div className="legend">
          {p.series.map((s) => (
            <span key={s.name}>
              <i className="sw" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function nearest(pts: [number, number][], x: number): [number, number] | null {
  let best: [number, number] | null = null, bd = Infinity;
  for (const q of pts) {
    const d = Math.abs(q[0] - x);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}
