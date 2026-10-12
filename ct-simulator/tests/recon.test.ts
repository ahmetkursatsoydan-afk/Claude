import { describe, expect, it } from 'vitest';
import { waterCylinder } from '../src/phantom/testPhantoms';
import { computeSlice } from '../src/sim/slice';
import type { SliceRequest } from '../src/sim/protocol';
import { planScan, PROTOCOLS } from '../src/sim/scan';
import { buildPhantom, DEFAULT_PHANTOM_CONFIG } from '../src/phantom';
import { computeTopogramChunk } from '../src/sim/topogram';

const base: SliceRequest = {
  z: 0, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: 120, mAsEff: 100, angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false,
  dfov: 360, matrix: 256, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: 0, quality: 'fast', bowtie: 'body', focalLarge: false, timeS: null, seed: 5,
};

function roi(hu: Int16Array, m: number, pix: number, x: number, y: number, r: number) {
  let s = 0, s2 = 0, n = 0;
  const h = (m - 1) / 2;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const xx = (i - h) * pix, yy = (j - h) * pix;
      if ((xx - x) ** 2 + (yy - y) ** 2 < r * r) {
        const v = hu[j * m + i];
        s += v;
        s2 += v * v;
        n++;
      }
    }
  const mean = s / n;
  return { mean, sd: Math.sqrt(s2 / n - mean * mean) };
}

describe('FBP – su fantomu (32 cm)', () => {
  const model = waterCylinder(320, true);
  const pix = 360 / 256;
  const r100 = computeSlice(model, base);
  const r400 = computeSlice(model, { ...base, mAsEff: 400 });
  it('su ≈ 0 HU (su BHC kalibrasyonu)', () => {
    expect(Math.abs(roi(r100.hu, 256, pix, 0, 0, 30).mean)).toBeLessThan(4);
  });
  it('gürültü ∝ 1/√mAs', () => {
    const a = roi(r100.hu, 256, pix, 0, 0, 30).sd, b = roi(r400.hu, 256, pix, 0, 0, 30).sd;
    expect(a / b).toBeGreaterThan(1.6);
    expect(a / b).toBeLessThan(2.4);
  });
  it('iyot eki 80 kVp’de 140 kVp’den daha parlak', () => {
    const lo = computeSlice(model, { ...base, kVp: 80, mAsEff: 400 });
    const hi = computeSlice(model, { ...base, kVp: 140, mAsEff: 400 });
    const R = 160;
    const iLo = roi(lo.hu, 256, pix, R * 0.39, R * 0.39, 6).mean, iHi = roi(hi.hu, 256, pix, R * 0.39, R * 0.39, 6).mean;
    expect(iLo).toBeGreaterThan(iHi * 1.5);
  });
  it('iteratif rekonstrüksiyon gürültüyü azaltır', () => {
    const ir = computeSlice(model, { ...base, recon: 'IR', irLevel: 4 });
    expect(roi(ir.hu, 256, pix, 0, 0, 30).sd).toBeLessThan(roi(r100.hu, 256, pix, 0, 0, 30).sd * 0.8);
  });
});

describe('Tarama planı', () => {
  const p = { ...PROTOCOLS[1].params, protocolId: 'thorax', atcm: false };
  it('CTDIvol mAs/pitch ile orantılı', () => {
    const a = planScan({ ...p, mAs: 100, pitch: 1 }, null), b = planScan({ ...p, mAs: 200, pitch: 1 }, null), c = planScan({ ...p, mAs: 200, pitch: 2 * 0.75 }, null);
    expect(b.ctdiVol / a.ctdiVol).toBeCloseTo(2, 1);
    expect(c.ctdiVol).toBeLessThan(b.ctdiVol);
  });
  it('jeneratör sınırı aşılınca uyarı verir', () => {
    const r = planScan({ ...p, mAs: 800, rotTime: 0.25, kVp: 140 }, null);
    expect(r.warnings.some((w) => w.includes('jeneratör'))).toBe(true);
  });
});

describe('Topogram ve fantom', () => {
  it('su-eşdeğer çap gövdede 20–35 cm', () => {
    const m = buildPhantom(DEFAULT_PHANTOM_CONFIG);
    const c = computeTopogramChunk(m, { view: 'AP', z0: 600, z1: 620, dz: 4, dx: 2, width: 500, kVp: 120, mA: 50, isoXp: 0, isoYp: 8, seed: 1 });
    for (const d of c.dw) {
      expect(d).toBeGreaterThan(20);
      expect(d).toBeLessThan(35);
    }
  });
});
