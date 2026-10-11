import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { rasterizePaints } from '../src/phantom/raster';
import type { Paint } from '../src/phantom/types';
const model = buildPhantom(DEFAULT_PHANTOM_CONFIG);
const n = 808, dx = 0.62;
const g = { n, dx, x0: -(n - 1) / 2 * dx, y0: -(n - 1) / 2 * dx };
for (const z of [460, 640]) {
  const paints: Paint[] = [];
  model.emitAt(z, paints);
  const buf = [0, 1, 2, 3].map(() => new Float32Array(n * n));
  const stats: Record<string, { ms: number; px: number; cnt: number }> = {};
  for (const p of paints) {
    const t = performance.now();
    const bb = { i0: n, i1: -1, j0: n, j1: -1 };
    rasterizePaints([p], g, buf, z, null, bb);
    const ms = performance.now() - t;
    const key = p.p.tissue + (p.clip ? '+clip' : '') + (p.p.tex ? '+tex' : '') + ':' + p.shape.k;
    const st = (stats[key] ??= { ms: 0, px: 0, cnt: 0 });
    st.ms += ms; st.px += (bb.i1 - bb.i0 + 1) * (bb.j1 - bb.j0 + 1); st.cnt++;
  }
  const arr = Object.entries(stats).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
  console.log('z', z);
  for (const [k, v] of arr) console.log('  ', k.padEnd(36), v.cnt, v.ms.toFixed(1) + 'ms', (v.px / 1e3).toFixed(0) + 'k px', (v.ms * 1e6 / v.px).toFixed(1) + 'ns/px');
}
