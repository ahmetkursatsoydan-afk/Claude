import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { rasterizeSlab, rasterizePaints } from '../src/phantom/raster';
import type { Paint } from '../src/phantom/types';
const model = buildPhantom(DEFAULT_PHANTOM_CONFIG);
const n = 808, dx = 0.62;
const g = { n, dx, x0: -(n - 1) / 2 * dx, y0: -(n - 1) / 2 * dx };
for (const z of [140, 460, 640]) {
  const paints: Paint[] = [];
  let t = performance.now();
  for (let k = 0; k < 10; k++) model.emitAt(z, paints);
  const tEmit = (performance.now() - t) / 10;
  const buf = [0, 1, 2, 3].map(() => new Float32Array(n * n));
  t = performance.now();
  rasterizePaints(paints, g, buf, z, null, { i0: n, i1: -1, j0: n, j1: -1 });
  const tR = performance.now() - t;
  const noTex = paints.map((p) => ({ ...p, p: { ...p.p, tex: undefined } }));
  t = performance.now();
  rasterizePaints(noTex, g, buf, z, null, { i0: n, i1: -1, j0: n, j1: -1 });
  const tR2 = performance.now() - t;
  // area sum
  let area = 0; const counts: Record<string, number> = {};
  for (const p of paints) { const s = p.shape as any; const a = s.k === 0 ? Math.PI * s.rx * s.ry : s.k === 1 ? 2 * s.r * (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) + 2 * s.r) : Math.PI * s.rmax * s.rmax; area += a; counts[p.p.tissue] = (counts[p.p.tissue] ?? 0) + 1; }
  console.log('z', z, 'paints', paints.length, 'emit', tEmit.toFixed(1), 'raster', tR.toFixed(0), 'noTex', tR2.toFixed(0), 'area px', (area / dx / dx / 1e6).toFixed(2) + 'M');
}
