/** Saçılma modeli kalibrasyonu: 32 cm su fantomunda merkez SPR ve kupa (cupping) etkisi. */
import { waterCylinder } from '../src/phantom/testPhantoms';
import { computeSlice } from '../src/sim/slice';
import type { SliceRequest } from '../src/sim/protocol';
import { writeGray, windowed } from './png';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'out/';
mkdirSync(OUT, { recursive: true });
const model = waterCylinder(Number(process.env.D ?? 320), false);
const base: SliceRequest = { z: 0, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: 120, mAsEff: 300, angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false, dfov: 400, matrix: 256, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: 0, quality: 'fast', bowtie: 'body', focalLarge: false, timeS: null, seed: 1 };
function roi(hu: Int16Array, m: number, pix: number, x: number, y: number, r: number) { let s = 0, s2 = 0, n = 0; const h = (m - 1) / 2; for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const xx = (i - h) * pix, yy = (j - h) * pix; if ((xx - x) ** 2 + (yy - y) ** 2 < r * r) { const v = hu[j * m + i]; s += v; s2 += v * v; n++; } } const mean = s / n; return { mean: +mean.toFixed(1), sd: +Math.sqrt(s2 / n - mean * mean).toFixed(1) }; }
for (const r of [{ collimation: 0 }, { collimation: 32 }, { collimation: 64 }, { collimation: 128 }, { collimation: 128, scatterCorr: false }, { collimation: 32, scatterCorr: false }] as Partial<SliceRequest>[]) {
  const req = { ...base, ...r };
  const res = computeSlice(model, req);
  const pix = req.dfov / req.matrix;
  const c = roi(res.hu, res.m, pix, 0, 0, 20), e = roi(res.hu, res.m, pix, 120, 0, 12);
  console.log(JSON.stringify(r), 'SPR', res.stats.spr.toFixed(3), 'center', c, 'edge', e, 'cup', (e.mean - c.mean).toFixed(1));
  writeGray(OUT + `scatter_${r.collimation}_${r.scatterCorr === false ? 'off' : 'on'}.png`, res.m, res.m, windowed(res.hu, res.m * res.m, 200, 0));
}
