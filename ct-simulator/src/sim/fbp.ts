/**
 * Filtreli geri izdüşüm (FBP): Kak–Slaney ayrık rampa filtresi (DC ofsetsiz)
 * × kernel apodizasyon penceresi, sıfır dolgulu FFT ile görünüm başına konvolüsyon.
 */
import { FFT, nextPow2 } from './fft';
import { kernelWindow, type KernelDef } from '../physics/kernels';
import { backproject, type ProjGeom, type ReconGrid } from './projector';

const filterCache = new Map<string, { fft: FFT; H: Float64Array; L: number }>();

export function rampFilter(nb: number, dsMm: number, kernel: KernelDef) {
  const key = `${nb}|${dsMm}|${kernel.id}`;
  const hit = filterCache.get(key);
  if (hit) return hit;
  const L = nextPow2(2 * nb);
  const fft = new FFT(L);
  const ds = dsMm / 10; // cm
  const re = new Float64Array(L), im = new Float64Array(L);
  // uzaysal rampa çekirdeği
  re[0] = 1 / (4 * ds * ds);
  for (let k = 1; k < L / 2; k++) {
    if (k % 2 === 1) {
      const v = -1 / (k * k * Math.PI * Math.PI * ds * ds);
      re[k] = v;
      re[L - k] = v;
    }
  }
  fft.transform(re, im);
  const H = new Float64Array(L);
  for (let k = 0; k < L; k++) {
    const kk = k <= L / 2 ? k : L - k;
    const fLpCm = (kk / (L * dsMm)) * 10;
    H[k] = re[k] * ds * kernelWindow(kernel, fLpCm);
  }
  const r = { fft, H, L };
  filterCache.set(key, r);
  return r;
}

/** Sinogramı (nv×nb) kernel ile filtreler; iki görünüm tek karmaşık FFT'de işlenir. */
export function filterSinogram(p: Float32Array, geo: ProjGeom, kernel: KernelDef, out?: Float32Array): Float32Array {
  const { nv, nb, ds } = geo;
  const { fft, H, L } = rampFilter(nb, ds, kernel);
  const q = out ?? new Float32Array(nv * nb);
  const re = new Float64Array(L), im = new Float64Array(L);
  for (let v = 0; v < nv; v += 2) {
    re.fill(0);
    im.fill(0);
    const r0 = v * nb;
    const has2 = v + 1 < nv;
    const r1 = (v + 1) * nb;
    for (let b = 0; b < nb; b++) {
      re[b] = p[r0 + b];
      if (has2) im[b] = p[r1 + b];
    }
    fft.transform(re, im);
    for (let k = 0; k < L; k++) {
      re[k] *= H[k];
      im[k] *= H[k];
    }
    fft.transform(re, im, true);
    for (let b = 0; b < nb; b++) {
      q[r0 + b] = re[b];
      if (has2) q[r1 + b] = im[b];
    }
  }
  return q;
}

export function fbp(p: Float32Array, geo: ProjGeom, kernel: KernelDef, rg: ReconGrid): Float32Array {
  const q = filterSinogram(p, geo, kernel);
  const img = new Float32Array(rg.m * rg.m);
  backproject(q, geo, rg, img);
  return img;
}
