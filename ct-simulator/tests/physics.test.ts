import { describe, expect, it } from 'vitest';
import { hvlAl, meanEnergy, tubeSpectrum } from '../src/physics/spectrum';
import { compositionToChannels, monoHU, TISSUES } from '../src/physics/materials';
import { compartmentConc } from '../src/physics/contrast';
import { ctdiwPer100, ssdeFactor } from '../src/physics/dose';
import { KERNELS, mtfAt } from '../src/physics/kernels';

describe('X-ışını spektrumu', () => {
  it('120 kVp için ortalama enerji ve HVL klinik aralıkta', () => {
    const s = tubeSpectrum(120);
    expect(meanEnergy(s)).toBeGreaterThan(55);
    expect(meanEnergy(s)).toBeLessThan(70);
    const h = hvlAl(s);
    expect(h).toBeGreaterThan(5.5);
    expect(h).toBeLessThan(9.5);
  });
  it('kVp arttıkça ortalama enerji ve HVL artar', () => {
    const a = tubeSpectrum(80), b = tubeSpectrum(140);
    expect(meanEnergy(b)).toBeGreaterThan(meanEnergy(a));
    expect(hvlAl(b)).toBeGreaterThan(hvlAl(a));
  });
});

describe('Malzemeler ve HU', () => {
  const hu = (id: keyof typeof TISSUES, e: number) => monoHU(compositionToChannels(TISSUES[id].comp), e);
  it('su 0 HU, hava −1000 HU', () => {
    expect(Math.abs(hu('water', 70))).toBeLessThan(0.5);
    expect(hu('air', 70)).toBeLessThan(-995);
  });
  it('doku sıralaması fizyolojik', () => {
    expect(hu('fat', 70)).toBeLessThan(-70);
    expect(hu('liver', 70)).toBeGreaterThan(hu('muscle', 70) - 15);
    expect(hu('corticalBone', 70)).toBeGreaterThan(1000);
    expect(hu('grayMatter', 70)).toBeGreaterThan(hu('whiteMatter', 70));
  });
  it('kemik ve iyot kontrastı düşük enerjide artar', () => {
    expect(hu('corticalBone', 50)).toBeGreaterThan(hu('corticalBone', 80));
    const iod = (e: number) => monoHU([1.05, 0.007, 0.01, 0], e);
    expect(iod(50)).toBeGreaterThan(iod(80) * 1.4);
  });
});

describe('Kernel MTF', () => {
  it('kemik kerneli yumuşak dokudan keskin', () => {
    expect(mtfAt(KERNELS.bone, 0.5, 0.62, 0.32)).toBeGreaterThan(mtfAt(KERNELS.soft, 0.5, 0.62, 0.32));
    expect(mtfAt(KERNELS.lung, 0.1, 0.62, 0.32)).toBeGreaterThan(mtfAt(KERNELS.soft, 0.1, 0.62, 0.32));
  });
});

describe('Kontrast ve doz', () => {
  it('aort tepe değeri arteriyel fazda', () => {
    let best = 0, bt = 0;
    for (let t = 0; t < 120; t++) {
      const c = compartmentConc('aorta', t);
      if (c > best) {
        best = c;
        bt = t;
      }
    }
    expect(bt).toBeGreaterThan(18);
    expect(bt).toBeLessThan(40);
    expect(best * 25).toBeGreaterThan(250);
  });
  it('karaciğer portal fazda arteriyel fazdan daha fazla tutulur', () => {
    expect(compartmentConc('liver', 70)).toBeGreaterThan(compartmentConc('liver', 30) * 2);
  });
  it('CTDIw kVp ile artar, SSDE faktörü büyük hastada küçülür', () => {
    expect(ctdiwPer100(140, 'body32')).toBeGreaterThan(ctdiwPer100(80, 'body32') * 2);
    expect(ssdeFactor(20, 'body32')).toBeGreaterThan(ssdeFactor(35, 'body32'));
  });
});
