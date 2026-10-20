import { describe, expect, it } from 'vitest';
import { eduPhantom } from '../src/phantom/testPhantoms';
import { computeFormation } from '../src/sim/formation';
import { DEFAULT_ITER } from '../src/sim/iterative';
import type { SliceRequest } from '../src/sim/protocol';

const req: SliceRequest = {
  z: 0, thickness: 5, pitch: 1, rowWidth: 0.5, kVp: 120, mAsEff: 80, angularMod: false, kernel: 'soft', recon: 'FBP', irLevel: 3, mar: false,
  dfov: 500, matrix: 256, reconCx: 0, reconCy: 0, isoXp: 0, isoYp: 0, quality: 'fast', bowtie: 'body', focalLarge: false, timeS: null, seed: 4,
};
const model = eduPhantom(false);

function roiMean(img: Float32Array, m: number, pix: number, x: number, y: number, r: number) {
  let s = 0, c = 0;
  const h = (m - 1) / 2;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const xx = (i - h) * pix, yy = (j - h) * pix;
      if ((xx - x) ** 2 + (yy - y) ** 2 < r * r) {
        s += img[j * m + i];
        c++;
      }
    }
  return s / c;
}

describe('görüntü oluşumu verileri', () => {
  const r = computeFormation(model, { req, m: 200, progressive: true, iterative: null });
  it('gerçek nesne ve FBP tutarlı (su ≈ 0 HU, kemik eki yüksek)', () => {
    expect(Math.abs(roiMean(r.truthHU, r.m, r.pix, 0, 0, 20))).toBeLessThan(3);
    expect(Math.abs(roiMean(r.fbpHU, r.m, r.pix, 0, 0, 20))).toBeLessThan(8);
    expect(roiMean(r.fbpHU, r.m, r.pix, 0, -95, 8)).toBeGreaterThan(900);
    expect(r.fbpRmse).toBeLessThan(60);
  });
  it('tüm görünümlerle aşamalı FBP son görüntüye eşit; az görünümde hata büyük', () => {
    const ks = r.even!.filtered.k;
    expect(ks[ks.length - 1]).toBe(r.rgeo.nv);
    const full = r.even!.filtered.imgs[ks.length - 1];
    let d = 0;
    for (let i = 0; i < full.length; i++) d = Math.max(d, Math.abs(full[i] - r.fbpHU[i]));
    expect(d).toBeLessThan(1);
    const few = r.even!.filtered.imgs[2];
    let e = 0, c = 0;
    for (let i = 0; i < few.length; i++)
      if (r.truthHU[i] > -500) {
        e += (few[i] - r.truthHU[i]) ** 2;
        c++;
      }
    expect(Math.sqrt(e / c)).toBeGreaterThan(3 * r.fbpRmse);
  });
  it('ışın sertleşmesi: polikromatik çizgi integrali ideal monoenerjetikten küçük', () => {
    let mono = 0, poly = 0;
    for (let k = 0; k < r.monoLine.length; k++) {
      mono += r.monoLine[k];
      poly += r.polyLine[k];
    }
    expect(poly).toBeLessThan(mono);
    expect(r.bhc.poly[r.bhc.poly.length - 1]).toBeLessThan(r.bhc.ideal[r.bhc.ideal.length - 1]);
  });
});

describe('eğitim düğmeleri', () => {
  it('halka hatası ve görünüm seyreltmesi', () => {
    const base = computeFormation(model, { req, m: 200 });
    const ring = computeFormation(model, { req: { ...req, ringFault: 0.04 }, m: 200 });
    const dec = computeFormation(model, { req: { ...req, viewDecimate: 12 }, m: 200 });
    expect(dec.rgeo.nv).toBe(30);
    expect(dec.fbpRmse).toBeGreaterThan(2 * base.fbpRmse);
    // 17 mm yarıçaplı halka: o yarıçaptaki piksellerde sistematik fark
    let d = 0, c = 0;
    const h = (base.m - 1) / 2;
    for (let j = 0; j < base.m; j++)
      for (let i = 0; i < base.m; i++) {
        const rr = Math.hypot((i - h) * base.pix, (j - h) * base.pix);
        if (Math.abs(rr - 17) < 1) {
          d += ring.fbpHU[j * base.m + i] - base.fbpHU[j * base.m + i];
          c++;
        }
      }
    expect(Math.abs(d / c)).toBeGreaterThan(5);
  });
  it('monoenerjetik ışında su düzgün; BHC kapalıyken HU konuma göre kayar', () => {
    const mono = computeFormation(model, { req: { ...req, mono: true, mAsEff: 300 }, m: 200 });
    const off = computeFormation(model, { req: { ...req, bhcOff: true, mAsEff: 300 }, m: 200 });
    const spread = (r: typeof mono) => Math.abs(roiMean(r.fbpHU, r.m, r.pix, 0, 0, 15) - roiMean(r.fbpHU, r.m, r.pix, 140, 0, 8));
    expect(spread(mono)).toBeLessThan(6);
    expect(spread(off)).toBeGreaterThan(20);
  });
});

describe('istatistiksel iteratif rekonstrüksiyon', () => {
  it('FBP başlangıcıyla gürültüyü azaltır, veri terimi azalır', () => {
    const r = computeFormation(model, { req, m: 160, iterative: { ...DEFAULT_ITER, iters: 4, subsets: 12 } });
    const ir = r.iter!;
    expect(ir.snaps.length).toBeGreaterThan(2);
    const c = ir.curve;
    expect(c[c.length - 1].data).toBeLessThan(c[0].data);
    expect(c[c.length - 1].noise).toBeLessThan(0.8 * r.fbpNoise);
    expect(c[c.length - 1].rmse!).toBeLessThan(2 * r.fbpRmse + 10);
  });
  it('boş görüntüden başlayınca görüntü oluşur', () => {
    const r = computeFormation(model, { req, m: 160, iterative: { ...DEFAULT_ITER, init: 'zero', momentum: true, iters: 4, subsets: 12 } });
    const c = r.iter!.curve;
    expect(c[0].rmse!).toBeGreaterThan(500);
    expect(c[c.length - 1].rmse!).toBeLessThan(150);
  });
});
