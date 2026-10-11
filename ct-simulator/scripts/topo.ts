import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { computeTopogramChunk } from '../src/sim/topogram';
import { writeGray } from './png';
const OUT = (process.env.OUT ?? 'out/');
for (const view of ['AP', 'LAT'] as const) {
  const model = buildPhantom({ ...DEFAULT_PHANTOM_CONFIG, arms: 'up', implant: 'hipRight' });
  const t = performance.now();
  const req = { view, z0: -300, z1: 1100, dz: 2, dx: 1.6, width: 500, kVp: 120, mA: 50, isoXp: 0, isoYp: 8, seed: 1 };
  const c = computeTopogramChunk(model, req);
  console.log(view, 'ms', (performance.now() - t).toFixed(0), 'rows', c.dw.length, 'cols', c.cols);
  if (view === 'AP') { const s: string[] = []; for (let r = 0; r < c.dw.length; r += 25) s.push(`${(-300 + r * 2)}:${c.dw[r].toFixed(1)}`); console.log(s.join(' ')); }
  const px = new Uint8Array(c.data.length);
  let mx = 0; for (const v of c.data) mx = Math.max(mx, v);
  for (let i = 0; i < px.length; i++) px[i] = Math.min(255, Math.round(255 * Math.pow(c.data[i] / 7, 0.8)));
  writeGray(OUT + `topo_${view}.png`, c.cols, c.dw.length, px);
}
