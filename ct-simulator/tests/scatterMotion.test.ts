import { describe, expect, it } from 'vitest';
import { waterCylinder } from '../src/phantom/testPhantoms';
import { computeSlice } from '../src/sim/slice';
import type { SliceRequest } from '../src/sim/protocol';
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { BREATHING, planScan, PROTOCOLS } from '../src/sim/scan';

const base: SliceRequest = {
  z: 0, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: 120, mAsEff: 300, angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false,
  dfov: 360, matrix: 128, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: 0, quality: 'fast', bowtie: 'body', focalLarge: false, timeS: null, seed: 5,
};

function meanIn(hu: Int16Array, m: number, pix: number, r: number) {
  let s = 0, n = 0;
  const h = (m - 1) / 2;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const x = (i - h) * pix, y = (j - h) * pix;
      if (x * x + y * y < r * r) {
        s += hu[j * m + i];
        n++;
      }
    }
  return s / n;
}

describe('saçılma', () => {
  const model = waterCylinder(320, false);
  it('SPR kolimasyonla artar; düzeltme kapalıyken su HU’su düşer (kupa)', () => {
    const narrow = computeSlice(model, { ...base, collimation: 32 });
    const wide = computeSlice(model, { ...base, collimation: 128 });
    const off = computeSlice(model, { ...base, collimation: 128, scatterCorr: false });
    expect(narrow.stats.spr).toBeGreaterThan(0.05);
    expect(wide.stats.spr).toBeGreaterThan(narrow.stats.spr * 1.8);
    const pix = base.dfov / base.matrix;
    const mOn = meanIn(wide.hu, wide.m, pix, 25), mOff = meanIn(off.hu, off.m, pix, 25);
    expect(Math.abs(mOn)).toBeLessThan(12);
    expect(mOff).toBeLessThan(mOn - 20);
  });
});

describe('solunum hareketi', () => {
  const model = buildPhantom({ ...DEFAULT_PHANTOM_CONFIG, arms: 'up' });
  const req: SliceRequest = { ...base, z: 540, dfov: 400, isoYp: 8, mAsEff: 150, rotTime: 1, breathPeriod: 4 };
  it('nefes tutan hastada hareket yok, derin solunumda diyafram bölgesinde var', () => {
    const hold = computeSlice(model, { ...req, breathAmp: BREATHING.hold.amp, breathStartS: BREATHING.hold.start, tAcq: 2 });
    const deep = computeSlice(model, { ...req, breathAmp: BREATHING.deep.amp, breathStartS: 0, tAcq: 0 });
    expect(hold.stats.motionMm).toBe(0);
    expect(deep.stats.motionMm).toBeGreaterThan(3);
    // görüntü farklı olmalı (çift kontur/çizgi)
    let d = 0;
    for (let i = 0; i < hold.hu.length; i++) d += Math.abs(hold.hu[i] - deep.hu[i]);
    expect(d / hold.hu.length).toBeGreaterThan(5);
  });
  it('kafa bölgesi solunumdan etkilenmez', () => {
    const r = computeSlice(model, { ...req, z: 80, bowtie: 'head', dfov: 240, isoYp: 18, breathAmp: 25, breathStartS: 0 });
    expect(r.stats.motionMm).toBe(0);
  });
  it('uzun taramada nefes tutma süresi aşılınca uyarı verilir', () => {
    const pr = PROTOCOLS.find((p) => p.id === 'tap')!;
    const plan = planScan({ protocolId: pr.id, ...pr.params, pitch: 0.5, rotTime: 1 }, null);
    expect(plan.scanTime).toBeGreaterThan(20);
    expect(plan.warnings.some((w) => w.includes('nefes tutma'))).toBe(true);
  });
});
