/**
 * Canlı veri akışı: sinogramın görünüm görünüm dolması, mevcut görünümün dedektör profili
 * (gürültülü sayımlar + gürültüsüz geçirgenlik) ve filtreli geri izdüşümün aşamalı birikimi.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../../state/store';
import { liveStore } from '../../app/data';
import { backproject } from '../../sim/projector';

export function LiveDataPanel({ cycleSec = 4 }: { cycleSec?: number }) {
  const sinoRef = useRef<HTMLCanvasElement>(null);
  const profRef = useRef<HTMLCanvasElement>(null);
  const bpRef = useRef<HTMLCanvasElement>(null);
  const liveVer = useApp((s) => s.scan.liveVer);
  const status = useApp((s) => s.scan.status);

  useEffect(() => {
    const d = liveStore.debug;
    if (!d) return;
    const { nv, nb } = d;
    // sinogram görüntüsü (önceden)
    const sc = document.createElement('canvas');
    sc.width = nb;
    sc.height = nv;
    const sg = sc.getContext('2d')!;
    const id = sg.createImageData(nb, nv);
    let mx = 0;
    for (let i = 0; i < d.sino.length; i += 5) mx = Math.max(mx, d.sino[i]);
    for (let i = 0; i < nb * nv; i++) {
      const v = Math.round(255 * Math.pow(Math.max(0, d.sino[i]) / (mx || 1), 0.7));
      id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v;
      id.data[4 * i + 3] = 255;
    }
    sg.putImageData(id, 0, 0);
    const M = 200;
    const rg = { m: M, pix: d.rg.pix * (d.rg.m / M), cx: d.rg.cx, cy: d.rg.cy };
    const acc = new Float32Array(M * M);
    let done = 0;
    let raf = 0;
    const t0 = performance.now();
    const bpImg = document.createElement('canvas');
    bpImg.width = bpImg.height = M;
    const bg = bpImg.getContext('2d')!;
    const bid = bg.createImageData(M, M);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ph = ((performance.now() - t0) / 1000 / cycleSec) % 1.15;
      const vNow = Math.min(nv, Math.floor(Math.min(1, ph) * nv));
      if (vNow < done) {
        acc.fill(0);
        done = 0;
      }
      if (vNow > done) {
        backproject(d.filtered, { nv, nb, ds: d.ds }, rg, acc, done, vNow);
        done = vNow;
      }
      // sinogram
      const c1 = sinoRef.current;
      if (c1) {
        const g = c1.getContext('2d')!;
        const W = (c1.width = c1.clientWidth * 1), H = (c1.height = 150);
        g.fillStyle = '#05080b';
        g.fillRect(0, 0, W, H);
        const hv = Math.max(1, Math.round((vNow / nv) * H));
        g.drawImage(sc, 0, 0, nb, Math.max(1, vNow), 0, 0, W, hv);
        g.strokeStyle = '#ffcc33';
        g.beginPath();
        g.moveTo(0, hv);
        g.lineTo(W, hv);
        g.stroke();
        g.fillStyle = '#9fb';
        g.font = '10px monospace';
        g.fillText(`sinogram  θ = ${((vNow / nv) * 180).toFixed(0)}°  (${vNow}/${nv} görünüm × ${nb} kanal)`, 6, 12);
      }
      // profil
      const c2 = profRef.current;
      if (c2) {
        const g = c2.getContext('2d')!;
        const W = (c2.width = c2.clientWidth), H = (c2.height = 120);
        g.fillStyle = '#05080b';
        g.fillRect(0, 0, W, H);
        const v = Math.min(nv - 1, vNow);
        // gürültülü geçirgenlik exp(-p)
        g.strokeStyle = '#3cc8ff';
        g.beginPath();
        for (let b = 0; b < nb; b++) {
          const tr = Math.exp(-d.sino[v * nb + b]);
          const x = (b / nb) * W, y = H - 12 - tr * (H - 24);
          if (b) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
        // papyon akısı
        g.strokeStyle = '#ffb020';
        g.setLineDash([3, 3]);
        g.beginPath();
        for (let b = 0; b < nb; b++) {
          const x = (b / nb) * W, y = H - 12 - d.fluxProfile[b] * (H - 24);
          if (b) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#9fb';
        g.font = '10px monospace';
        g.fillText('dedektör: I/I₀ (mavi) · papyon sonrası akı (turuncu)', 6, 12);
      }
      // geri izdüşüm
      const c3 = bpRef.current;
      if (c3) {
        let mn = Infinity, mxv = -Infinity;
        for (let i = 0; i < acc.length; i += 3) {
          if (acc[i] < mn) mn = acc[i];
          if (acc[i] > mxv) mxv = acc[i];
        }
        const lo = 0.12, hi = 0.28; // μ (1/cm) ~ −400…+400 HU
        for (let i = 0; i < M * M; i++) {
          const vv = Math.max(0, Math.min(255, ((acc[i] - lo) / (hi - lo)) * 255));
          bid.data[4 * i] = bid.data[4 * i + 1] = bid.data[4 * i + 2] = vv;
          bid.data[4 * i + 3] = 255;
        }
        bg.putImageData(bid, 0, 0);
        const g = c3.getContext('2d')!;
        const S = (c3.width = c3.height = 180);
        g.drawImage(bpImg, 0, 0, S, S);
        g.fillStyle = '#9fb';
        g.font = '10px monospace';
        g.fillText(`FBP: ${((done / nv) * 100).toFixed(0)}%`, 4, 12);
        void mn;
        void mxv;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [liveVer, cycleSec]);

  if (!liveStore.debug)
    return <div className="hint">{status === 'idle' ? 'Tarama başladığında burada sinogram, dedektör profili ve aşamalı geri izdüşüm canlı gösterilir.' : 'Veri toplanıyor…'}</div>;
  return (
    <div>
      <canvas ref={sinoRef} style={{ width: '100%', height: 150, display: 'block', borderRadius: 4 }} />
      <canvas ref={profRef} style={{ width: '100%', height: 120, display: 'block', marginTop: 6, borderRadius: 4 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <canvas ref={bpRef} style={{ width: 180, height: 180, borderRadius: 4 }} />
        <div className="hint">
          z = {liveStore.z.toFixed(0)} mm · ortalama NEQ {liveStore.stats?.meanNeq.toFixed(0)} · foton açlığı %{((liveStore.stats?.starvedFrac ?? 0) * 100).toFixed(2)}
          <br />
          Her görünümde filtrelenmiş projeksiyon görüntüye “geri yayılır”; 180° tamamlandığında kesit oluşur. (Hızlı önizleme kalitesi)
        </div>
      </div>
    </div>
  );
}
