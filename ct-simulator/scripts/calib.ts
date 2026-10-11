import { waterCylinder } from '../src/phantom/testPhantoms';
import { computeSlice } from '../src/sim/slice';
import type { SliceRequest } from '../src/sim/protocol';
import { writeGray, windowed } from './png';
import { mkdirSync } from 'node:fs';
mkdirSync(process.env.OUT ?? 'out/', { recursive: true });
const OUT = (process.env.OUT ?? 'out/');
const model = waterCylinder(320, true);
const base: SliceRequest = { z: 0, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: 120, mAsEff: 100, angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false, dfov: 360, matrix: 512, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: 0, quality: (process.argv[2] as any) ?? 'standard', bowtie: 'body', focalLarge: false, timeS: null, seed: 1 };
function roi(hu: Int16Array, m: number, pix: number, x: number, y: number, r: number) { let s = 0, s2 = 0, n = 0; const h = (m - 1) / 2; for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const xx = (i - h) * pix, yy = (j - h) * pix; if ((xx - x) ** 2 + (yy - y) ** 2 < r * r) { const v = hu[j * m + i]; s += v; s2 += v * v; n++; } } const mean = s / n; return { mean: mean.toFixed(1), sd: Math.sqrt(s2 / n - mean * mean).toFixed(1) }; }
const runs: Partial<SliceRequest>[] = [
  {}, { kVp: 80 }, { kVp: 140 }, { mAsEff: 400 }, { thickness: 1 }, { kernel: 'bone' }, { kernel: 'lung' }, { recon: 'IR', irLevel: 3 }, { recon: 'IR', irLevel: 5 },
];
for (const r of runs) {
  const req = { ...base, ...r };
  const res = computeSlice(model, req);
  const pix = req.dfov / req.matrix;
  const R = 160;
  console.log(JSON.stringify(r), 'ms', res.stats.ms.toFixed(0), 'center', roi(res.hu, res.m, pix, 0, 0, 25), 'periph', roi(res.hu, res.m, pix, 80, -80, 15), 'bone', roi(res.hu, res.m, pix, 0, -R * 0.55, 7).mean, 'fat', roi(res.hu, res.m, pix, R * 0.55, 0, 7).mean, 'trab', roi(res.hu, res.m, pix, 0, R*0.55, 7).mean, 'lung', roi(res.hu, res.m, pix, -R*0.55, 0, 7).mean, 'iod10', roi(res.hu, res.m, pix, R*0.39, R*0.39, 6).mean, 'neq', res.stats.meanNeq.toFixed(0), 'Eref', res.stats.eRef.toFixed(1));
  writeGray(OUT + `water_${Object.entries(r).map(e=>e.join('')).join('_') || 'base'}.png`, res.m, res.m, windowed(res.hu, res.m * res.m, 400, 40));
}
