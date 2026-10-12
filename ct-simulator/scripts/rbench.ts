import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { rasterizeSlab } from '../src/phantom/raster';
const model = buildPhantom(DEFAULT_PHANTOM_CONFIG);
const n = 808, dx = 0.62;
const g = { n, dx, x0: -(n - 1) / 2 * dx, y0: 8 - (n - 1) / 2 * dx };
for (const z of [100, 420, 640]) {
  const zs = [0, 1, 2, 3, 4, 5, 6].map((k) => z - 3 + k);
  const ws = zs.map(() => 1 / 7);
  rasterizeSlab(model, zs, ws, g, null);
  const t = performance.now();
  rasterizeSlab(model, zs, ws, g, null);
  console.log('z', z, 'slab(7) ms', (performance.now() - t).toFixed(0));
}
