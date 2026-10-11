import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
// Fantom kesitlerini doğrudan (fizik simülasyonu olmadan) monoenerjetik HU olarak PNG'ye yazar.
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { rasterizeSlab } from '../src/phantom/raster';
import { monoHU } from '../src/physics/materials';
import { makeConcFn } from '../src/physics/contrast';
import { writeGray, windowed } from './png';
const OUT = (process.env.OUT ?? 'out/');
const cfg = { ...DEFAULT_PHANTOM_CONFIG, arms: (process.env.ARMS as any) ?? 'up', implant: (process.env.IMPLANT as any) ?? 'none' };
let t = performance.now();
const model = buildPhantom(cfg);
console.log('build ms', (performance.now() - t).toFixed(0), 'structures', model.structures.length, 'z', model.zMin.toFixed(0), model.zMax.toFixed(0));
const zs = (process.argv[2] ?? '60,90,120,140,200,260,300,340,380,420,460,520,560,600,640,700,760,820,870,900,1000').split(',').map(Number);
const ww = Number(process.env.WW ?? 400), wl = Number(process.env.WL ?? 40);
const tc = process.env.T ? Number(process.env.T) : null;
const n = 512, dx = 500 / n;
for (const z of zs) {
  t = performance.now();
  const conc = makeConcFn(tc);
  const r = rasterizeSlab(model, [z], [1], { n, dx, x0: -(n - 1) / 2 * dx, y0: -(n - 1) / 2 * dx }, conc ? () => conc : null);
  const hu = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) hu[i] = monoHU([r.buf[0][i], r.buf[1][i], r.buf[2][i], r.buf[3][i]], 70);
  writeGray(OUT + `ph_z${z}${process.env.TAG ?? ''}.png`, n, n, windowed(hu, n * n, ww, wl));
  console.log('z', z, 'ms', (performance.now() - t).toFixed(0));
}
