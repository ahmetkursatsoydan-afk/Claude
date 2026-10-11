/**
 * Topogram üzerinde tarama planlama: tarama başlangıç/bitiş çizgileri (sürüklenebilir),
 * rekonstrüksiyon FOV kutusu, z cetveli, ATCM mA eğrisi ve tarama yönü.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { topoStore } from '../../app/data';
import { currentPlan } from '../../app/controller';

type Drag = null | { kind: 'start' | 'end' | 'box' | 'fovL' | 'fovR' | 'fovMove'; z0: number; x0: number; p0: { s: number; e: number; cx: number; dfov: number } };

export function TopogramPlanner({ height = 520, interactive = true }: { height?: number; interactive?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { topo, params, setParams, hw } = useApp();
  const [w, setW] = useState(440);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<string | null>(null);
  const img = useRef<{ c: HTMLCanvasElement; ver: string } | null>(null);
  const plan = useMemo(() => (topo.status === 'done' ? currentPlan() : null), [params, topo.status, topo.version]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(() => setW(wrap.current!.clientWidth));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const td = topoStore.current;
  // geometri
  const geom = useMemo(() => {
    if (!td) return null;
    const lenMm = td.rows * td.dz, widMm = td.cols * td.dx;
    const s = Math.min((w - 40) / widMm, (height - 10) / lenMm);
    const ox = 34 + ((w - 40) - widMm * s) / 2;
    const oy = 5 + ((height - 10) - lenMm * s) / 2;
    return {
      s,
      ox,
      oy,
      lenMm,
      widMm,
      zToY: (z: number) => oy + (z - td.z0) * s,
      yToZ: (y: number) => td.z0 + (y - oy) / s,
      xToX: (x: number) => ox + (x + widMm / 2) * s, // hasta x (izo) → piksel
      pxToX: (p: number) => (p - ox) / s - widMm / 2,
    };
  }, [td, w, height, topo.version]);

  // çizim
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    c.style.height = height + 'px';
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, height);
    if (!td || !geom) {
      g.fillStyle = '#667';
      g.font = '12px sans-serif';
      g.fillText('Topogram yok', 12, 20);
      return;
    }
    // görüntü (satır hazır ve masa geçtiyse)
    const ver = `${topo.version}|${topo.status}|${Math.floor(hw.tableT / 6)}`;
    if (!img.current || img.current.ver !== ver) {
      const oc = img.current?.c ?? document.createElement('canvas');
      oc.width = td.cols;
      oc.height = td.rows;
      const og = oc.getContext('2d')!;
      const id = og.createImageData(td.cols, td.rows);
      // otomatik pencere
      let hi = 0;
      for (let i = 0; i < td.data.length; i += 7) hi = Math.max(hi, td.data[i]);
      hi = Math.max(2, hi * 0.92);
      for (let r = 0; r < td.rows; r++) {
        const zr = td.z0 + (r + 0.5) * td.dz;
        const visible = td.rowsReady[r] && (topo.status === 'done' || zr < hw.tableT);
        for (let col = 0; col < td.cols; col++) {
          const k = r * td.cols + col;
          const v = visible ? Math.pow(Math.min(1, Math.max(0, td.data[k] / hi)), 0.75) : 0;
          const p = 4 * k;
          id.data[p] = id.data[p + 1] = id.data[p + 2] = Math.round(v * 255);
          id.data[p + 3] = 255;
        }
      }
      og.putImageData(id, 0, 0);
      img.current = { c: oc, ver };
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(img.current.c, geom.ox, geom.oy, geom.widMm * geom.s, geom.lenMm * geom.s);
    // z cetveli
    g.fillStyle = '#8b9aa8';
    g.strokeStyle = '#3a4754';
    g.font = '10px monospace';
    g.textAlign = 'right';
    const step = geom.lenMm > 900 ? 100 : 50;
    for (let z = Math.ceil(td.z0 / step) * step; z <= td.z0 + geom.lenMm; z += step) {
      const y = geom.zToY(z);
      g.beginPath();
      g.moveTo(geom.ox - 6, y);
      g.lineTo(geom.ox - 1, y);
      g.stroke();
      g.fillText(String(z), geom.ox - 8, y + 3);
    }
    g.textAlign = 'left';
    // masa pozisyonu (tarama düzlemi)
    if (topo.status === 'acquiring' || hw.beam !== 'off') {
      const y = geom.zToY(hw.tableT);
      g.strokeStyle = '#ffcc33';
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(geom.ox, y);
      g.lineTo(geom.ox + geom.widMm * geom.s, y);
      g.stroke();
      g.setLineDash([]);
    }
    if (topo.status !== 'done') return;
    // tarama aralığı
    const z0 = Math.min(params.scanStart, params.scanEnd), z1 = Math.max(params.scanStart, params.scanEnd);
    const y0 = geom.zToY(z0), y1 = geom.zToY(z1);
    const isAP = td.view === 'AP';
    const fx0 = isAP ? geom.xToX(params.reconCx - params.dfov / 2) : geom.xToX(-params.dfov / 2);
    const fx1 = isAP ? geom.xToX(params.reconCx + params.dfov / 2) : geom.xToX(params.dfov / 2);
    g.fillStyle = 'rgba(60,200,255,0.10)';
    g.fillRect(fx0, y0, fx1 - fx0, y1 - y0);
    g.strokeStyle = '#3cc8ff';
    g.lineWidth = 1.5;
    g.strokeRect(fx0, y0, fx1 - fx0, y1 - y0);
    // kesit çizgileri (seyrek)
    const n = Math.floor((z1 - z0) / params.interval) + 1;
    const every = Math.max(1, Math.ceil(n / 40));
    g.strokeStyle = 'rgba(60,200,255,0.22)';
    g.lineWidth = 1;
    for (let k = 0; k < n; k += every) {
      const y = geom.zToY(z0 + k * params.interval);
      g.beginPath();
      g.moveTo(fx0, y);
      g.lineTo(fx1, y);
      g.stroke();
    }
    // başlangıç / bitiş çizgileri
    const startZ = params.direction === 'cc' ? z0 : z1;
    for (const [z, lab, col] of [
      [z0, 'z0', hover === 'start' || drag?.kind === 'start' ? '#ffffff' : '#3cc8ff'],
      [z1, 'z1', hover === 'end' || drag?.kind === 'end' ? '#ffffff' : '#3cc8ff'],
    ] as const) {
      const y = geom.zToY(z);
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(geom.ox, y);
      g.lineTo(geom.ox + geom.widMm * geom.s, y);
      g.stroke();
      g.fillStyle = col;
      g.font = '11px monospace';
      g.fillText(`${lab === 'z0' ? 'Baş.' : 'Son'} ${z.toFixed(0)}`, geom.ox + geom.widMm * geom.s - 74, y + (lab === 'z0' ? -4 : 12));
    }
    // yön oku
    const ay = geom.zToY(startZ);
    const dir = params.direction === 'cc' ? 1 : -1;
    g.fillStyle = '#ffcc33';
    g.beginPath();
    g.moveTo(fx0 - 12, ay + dir * 20);
    g.lineTo(fx0 - 18, ay + dir * 6);
    g.lineTo(fx0 - 6, ay + dir * 6);
    g.closePath();
    g.fill();
    g.strokeStyle = '#ffcc33';
    g.beginPath();
    g.moveTo(fx0 - 12, ay);
    g.lineTo(fx0 - 12, ay + dir * 8);
    g.stroke();
    // ATCM mA eğrisi
    if (plan && params.atcm) {
      const maxmA = Math.max(...plan.mACurve.map((m) => m.mA), 1);
      const base = geom.ox + geom.widMm * geom.s - 6;
      const wid = 46;
      g.strokeStyle = '#ffb020';
      g.lineWidth = 1.5;
      g.beginPath();
      plan.mACurve
        .slice()
        .sort((a, b) => a.z - b.z)
        .forEach((m, i) => {
          const x = base - (m.mA / maxmA) * wid;
          const y = geom.zToY(m.z);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
      g.stroke();
      g.fillStyle = '#ffb020';
      g.font = '10px monospace';
      g.fillText(`mA (maks ${maxmA.toFixed(0)})`, base - wid - 30, geom.oy + 12);
    }
    g.fillStyle = '#ffd36a';
    g.font = '10px sans-serif';
    g.fillText(`${td.view} · ${td.kVp} kV · ${td.mA} mA · SENTETİK`, geom.ox + 4, geom.oy + geom.lenMm * geom.s - 6);
    g.fillStyle = '#9fb';
    g.fillText(isAP ? 'S' : 'A', geom.ox + 4, geom.oy + 14);
    g.fillText(isAP ? 'L' : 'P', geom.ox + geom.widMm * geom.s - 12, geom.oy + 14);
  }, [w, height, td, geom, topo.version, topo.status, hw.tableT, hw.beam, params, plan, hover, drag]);

  const hit = (x: number, y: number): NonNullable<Drag>['kind'] | null => {
    if (!geom || !td || topo.status !== 'done') return null;
    const z0 = Math.min(params.scanStart, params.scanEnd), z1 = Math.max(params.scanStart, params.scanEnd);
    const y0 = geom.zToY(z0), y1 = geom.zToY(z1);
    if (Math.abs(y - y0) < 6) return 'start';
    if (Math.abs(y - y1) < 6) return 'end';
    const isAP = td.view === 'AP';
    const fx0 = isAP ? geom.xToX(params.reconCx - params.dfov / 2) : geom.xToX(-params.dfov / 2);
    const fx1 = isAP ? geom.xToX(params.reconCx + params.dfov / 2) : geom.xToX(params.dfov / 2);
    if (y > y0 && y < y1) {
      if (Math.abs(x - fx0) < 6) return 'fovL';
      if (Math.abs(x - fx1) < 6) return 'fovR';
      if (x > fx0 && x < fx1) return isAP ? 'box' : 'box';
    }
    return null;
  };

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={wrap}>
      <div className="planner" style={{ height }}>
        <canvas
          ref={cv}
          style={{ cursor: hover === 'start' || hover === 'end' ? 'ns-resize' : hover === 'fovL' || hover === 'fovR' ? 'ew-resize' : hover === 'box' ? 'move' : 'default' }}
          onPointerDown={(e) => {
            if (!interactive) return;
            const p = pos(e);
            const k = hit(p.x, p.y);
            if (!k || !geom) return;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({ kind: k, z0: geom.yToZ(p.y), x0: geom.pxToX(p.x), p0: { s: Math.min(params.scanStart, params.scanEnd), e: Math.max(params.scanStart, params.scanEnd), cx: params.reconCx, dfov: params.dfov } });
          }}
          onPointerMove={(e) => {
            if (!interactive || !geom || !td) return;
            const p = pos(e);
            if (!drag) {
              setHover(hit(p.x, p.y));
              return;
            }
            const z = geom.yToZ(p.y);
            const x = geom.pxToX(p.x);
            const dz = z - drag.z0;
            const r5 = (v: number) => Math.round(v / 1) * 1;
            const zmin = td.z0, zmax = td.z0 + td.rows * td.dz;
            const keepDir = (s: number, en: number) => (params.direction === 'cc' ? { scanStart: s, scanEnd: en } : { scanStart: en, scanEnd: s });
            if (drag.kind === 'start') setParams(keepDir(r5(Math.max(zmin, Math.min(drag.p0.e - 10, drag.p0.s + dz))), drag.p0.e));
            else if (drag.kind === 'end') setParams(keepDir(drag.p0.s, r5(Math.min(zmax, Math.max(drag.p0.s + 10, drag.p0.e + dz)))));
            else if (drag.kind === 'box') {
              const d = Math.max(zmin - drag.p0.s, Math.min(zmax - drag.p0.e, dz));
              const o: Record<string, number> = keepDir(r5(drag.p0.s + d), r5(drag.p0.e + d)) as unknown as Record<string, number>;
              if (td.view === 'AP') o.reconCx = Math.round(Math.max(-150, Math.min(150, drag.p0.cx + (x - drag.x0))));
              setParams(o);
            } else if (drag.kind === 'fovL' || drag.kind === 'fovR') {
              const half = Math.abs(x - (td.view === 'AP' ? drag.p0.cx : 0));
              setParams({ dfov: Math.round(Math.max(100, Math.min(500, half * 2)) / 5) * 5 });
            }
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => !drag && setHover(null)}
        />
      </div>
      {interactive && (
        <div className="planner-legend">
          <span>
            <i className="sw" style={{ background: '#3cc8ff' }} />
            Tarama aralığı / rekon FOV (çizgileri ve kenarları sürükleyin)
          </span>
          <span>
            <i className="sw" style={{ background: '#ffb020' }} />
            ATCM mA
          </span>
          <span>
            <i className="sw" style={{ background: '#ffcc33' }} />
            Yön
          </span>
        </div>
      )}
    </div>
  );
}
