/** Görüntü oluşumu gezgini verilerini üretip PNG olarak yazar (doğrulama/ayar). */
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { eduPhantom } from '../src/phantom/testPhantoms';
import { computeFormation } from '../src/sim/formation';
import { DEFAULT_ITER } from '../src/sim/iterative';
import type { SliceRequest } from '../src/sim/protocol';
import { writeGray, windowed } from './png';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'out/';
mkdirSync(OUT, { recursive: true });
const qa = process.env.QA;
const model = qa ? eduPhantom(qa === 'metal') : buildPhantom({ ...DEFAULT_PHANTOM_CONFIG, arms: 'up', implant: (process.env.IMPLANT as any) ?? 'none' });
const z = Number(process.env.Z ?? (qa ? 0 : 600));
const req: SliceRequest = {
  z, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: Number(process.env.KV ?? 120), mAsEff: Number(process.env.MAS ?? 100), angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false,
  dfov: 400, matrix: 512, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: qa ? 0 : 8, quality: 'fast', bowtie: 'body', focalLarge: false, timeS: null, seed: 3,
  mono: process.env.MONO === '1', bhcOff: process.env.BHCOFF === '1', ringFault: Number(process.env.RING ?? 0), viewDecimate: Number(process.env.DEC ?? 1),
};
const iter = process.env.IR === '0' ? null : { ...DEFAULT_ITER, beta: Number(process.env.BETA ?? DEFAULT_ITER.beta), iters: Number(process.env.ITERS ?? DEFAULT_ITER.iters), init: (process.env.INIT as any) ?? DEFAULT_ITER.init, weighted: process.env.W !== '0', subsets: Number(process.env.SUB ?? DEFAULT_ITER.subsets), momentum: process.env.MOM !== '0' };
const t = performance.now();
const r = computeFormation(model, { req, m: 320, progressive: true, iterative: iter });
const tag = process.env.TAG ?? '';
console.log('ms', (performance.now() - t).toFixed(0), 'geo', r.geo, 'rgeo', r.rgeo.nv, 'eRef', r.eRef.toFixed(1), 'fbpNoise', r.fbpNoise.toFixed(1), 'fbpRmse', r.fbpRmse.toFixed(1), 'irMs', r.iter?.ms.toFixed(0));
const m = r.m, W = Number(process.env.WW ?? 400), L = Number(process.env.WL ?? 40);
writeGray(OUT + `f${tag}_truth.png`, m, m, windowed(r.truthHU, m * m, W, L));
writeGray(OUT + `f${tag}_fbp.png`, m, m, windowed(r.fbpHU, m * m, W, L));
let mx = 0; for (const v of r.bpRaw) mx = Math.max(mx, v);
writeGray(OUT + `f${tag}_bp.png`, m, m, windowed(r.bpRaw, m * m, mx, mx / 2));
r.even!.filtered.imgs.forEach((im, i) => writeGray(OUT + `f${tag}_even${r.even!.filtered.k[i]}.png`, m, m, windowed(im, m * m, W, L)));
if (r.iter) {
  for (const c of r.iter.curve) console.log('iter', c.iter.toFixed(2), 'data', c.data.toExponential(3), 'pen', c.penalty.toExponential(3), 'noise', c.noise.toFixed(1), 'rmse', c.rmse?.toFixed(1));
  for (const s of r.iter.snaps) writeGray(OUT + `f${tag}_ir_u${s.update}.png`, m, m, windowed(s.img, m * m, W, L));
}
const nv = r.geo.nv, nb = r.geo.nb;
let pm = 0; for (const v of r.p) pm = Math.max(pm, v);
writeGray(OUT + `f${tag}_sino.png`, nb, nv, windowed(r.p, nv * nb, pm, pm / 2));
if (r.iter) {
  const last = r.iter.snaps[r.iter.snaps.length - 1].img;
  const err = new Float32Array(m * m), errF = new Float32Array(m * m);
  for (let i = 0; i < m * m; i++) { err[i] = last[i] - r.truthHU[i]; errF[i] = r.fbpHU[i] - r.truthHU[i]; }
  writeGray(OUT + `f${tag}_err_ir.png`, m, m, windowed(err, m * m, 400, 0));
  writeGray(OUT + `f${tag}_err_fbp.png`, m, m, windowed(errF, m * m, 400, 0));
  writeGray(OUT + `f${tag}_ir_last.png`, m, m, windowed(last, m * m, W, L));
}
if (r.iter) {
  const s = r.iter.snaps[r.iter.snaps.length - 1];
  let mx = 0; for (const v of s.residual) mx = Math.max(mx, Math.abs(v));
  writeGray(OUT + `f${tag}_resid.png`, r.iter.rnb, r.iter.rnv, windowed(s.residual, s.residual.length, 0.1, 0));
  console.log('resid max', mx.toFixed(3));
}
