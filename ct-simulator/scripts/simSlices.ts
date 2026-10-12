import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { computeSlice } from '../src/sim/slice';
import type { SliceRequest } from '../src/sim/protocol';
import { writeGray, windowed } from './png';
const OUT = (process.env.OUT ?? 'out/');
const cfg = { ...DEFAULT_PHANTOM_CONFIG, arms: (process.env.ARMS as any) ?? 'up', implant: (process.env.IMPLANT as any) ?? 'none', habitus: (process.env.HABITUS as any) ?? 'medium' };
const model = buildPhantom(cfg);
const zs = (process.argv[2] ?? '420,640').split(',').map(Number);
const head = process.env.HEAD === '1';
const req: SliceRequest = { z: 0, thickness: Number(process.env.TH ?? 5), pitch: 1, rowWidth: 0.5, kVp: Number(process.env.KV ?? 120), mAsEff: Number(process.env.MAS ?? 150), angularMod: process.env.ANG === '1', kernel: (process.env.KERNEL as any) ?? 'soft', recon: (process.env.RECON as any) ?? 'FBP', irLevel: 3, mar: process.env.MAR === '1', dfov: Number(process.env.DFOV ?? (head ? 240 : 380)), matrix: 512, reconCx: 0, reconCy: head ? 18 : 10, isoXp: 0, isoYp: head ? 18 : 8, quality: (process.env.Q as any) ?? 'standard', bowtie: head ? 'head' : 'body', focalLarge: false, timeS: process.env.T ? Number(process.env.T) : null, seed: 3,
  breathAmp: Number(process.env.BREATH ?? 0), breathPeriod: 4, tAcq: Number(process.env.TACQ ?? 0), rotTime: Number(process.env.ROT ?? 0.5),
  collimation: Number(process.env.COLL ?? 0), scatterCorr: process.env.SCORR !== '0' };
const ww = Number(process.env.WW ?? 400), wl = Number(process.env.WL ?? 40);
for (const z of zs) {
  const r = computeSlice(model, { ...req, z });
  console.log('z', z, 'ms', r.stats.ms.toFixed(0), 'sigma', r.stats.noiseSigma.toFixed(1), 'starved', (r.stats.starvedFrac * 100).toFixed(2) + '%', 'minNeq', r.stats.minNeq.toFixed(1), 'spr', r.stats.spr.toFixed(3), 'motion', r.stats.motionMm.toFixed(1), JSON.stringify(Object.fromEntries(Object.entries(r.stats.timing).map(([k, v]) => [k, Math.round(v)]))));
  writeGray(OUT + `sim_z${z}${process.env.TAG ?? ''}.png`, r.m, r.m, windowed(r.hu, r.m * r.m, ww, wl));
}
