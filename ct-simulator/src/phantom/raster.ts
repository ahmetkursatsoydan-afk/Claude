/**
 * Ressam (painter) algoritmasıyla kısmi hacim (anti-aliased) rasterleştirme.
 * Her şekil, kenarlarda piksel kaplama oranıyla (coverage) karıştırılır; böylece
 * düzlem içi kısmi hacim etkisi, z yönünde alt örnekleme ile de kesit kalınlığı
 * boyunca kısmi hacim etkisi modellenir.
 */
import { fbm3, valueNoise3 } from '../sim/noise3';
import type { BlobShape, EllShape, Paint, SegShape, Structure } from './types';

export interface Grid {
  n: number;
  dx: number; // mm/piksel
  x0: number; // (0,0) piksel merkezi x (hasta koordinatı)
  y0: number;
}

export interface BBox {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

export type ConcFn = (comp: string) => number;

const tmpV = new Float32Array(4);

export class PhantomModel {
  readonly structures: Structure[];
  private buckets: number[][] = [];
  private zBase: number;
  private bucketMm = 10;
  readonly zMin: number;
  readonly zMax: number;

  constructor(structures: Structure[]) {
    this.structures = structures;
    let zMin = Infinity, zMax = -Infinity;
    for (const s of structures) {
      zMin = Math.min(zMin, s.zMin);
      zMax = Math.max(zMax, s.zMax);
    }
    this.zMin = zMin;
    this.zMax = zMax;
    this.zBase = Math.floor(zMin / this.bucketMm) - 1;
    const nb = Math.ceil(zMax / this.bucketMm) - this.zBase + 2;
    for (let i = 0; i < nb; i++) this.buckets.push([]);
    structures.forEach((s, idx) => {
      const b0 = Math.floor(s.zMin / this.bucketMm) - this.zBase;
      const b1 = Math.floor(s.zMax / this.bucketMm) - this.zBase;
      for (let b = Math.max(0, b0); b <= Math.min(nb - 1, b1); b++) this.buckets[b].push(idx);
    });
  }

  emitAt(z: number, out: Paint[]): void {
    out.length = 0;
    const b = Math.floor(z / this.bucketMm) - this.zBase;
    if (b < 0 || b >= this.buckets.length) return;
    for (const idx of this.buckets[b]) {
      const s = this.structures[idx];
      if (z >= s.zMin && z <= s.zMax) s.emit(z, out);
    }
  }
}

let covBuf = new Float32Array(1 << 16);

function ensureCov(n: number): Float32Array {
  if (covBuf.length < n) covBuf = new Float32Array(n);
  return covBuf;
}

/** Süper-elips kaplama haritası (bw×bh, satır öncelikli) */
function covEll(sh: EllShape, cov: Float32Array, i0: number, i1: number, j0: number, j1: number, g: Grid): void {
  const dx = g.dx, inv = 1 / dx, x0 = g.x0, y0 = g.y0;
  const bw = i1 - i0 + 1;
  const cx = sh.cx, cy = sh.cy, c = sh.c, s = sh.s, irx = 1 / sh.rx, iry = 1 / sh.ry, nn = sh.n;
  const rmin = Math.min(sh.rx, sh.ry);
  const h = (0.5 * dx) / rmin;
  let qIn = Math.max(0, 1 - h);
  qIn *= qIn;
  const qOut = (1 + h) * (1 + h);
  const isE = nn === 2;
  const inn = 1 / nn;
  let k = 0;
  for (let j = j0; j <= j1; j++) {
    const py = y0 + j * dx - cy;
    for (let i = i0; i <= i1; i++, k++) {
      const px = x0 + i * dx - cx;
      const u = (px * c + py * s) * irx;
      const v = (-px * s + py * c) * iry;
      let rho: number;
      const q = u * u + v * v;
      if (isE) {
        if (q >= qOut) { cov[k] = 0; continue; }
        if (q <= qIn) { cov[k] = 1; continue; }
        rho = Math.sqrt(q);
      } else {
        // n>2 süper-elips: iç elipsin içi kesin dolu, dış kutunun dışı kesin boş
        if (q <= qIn) { cov[k] = 1; continue; }
        const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
        if (au * au >= qOut || av * av >= qOut) { cov[k] = 0; continue; }
        rho = Math.exp(inn * Math.log(Math.exp(nn * Math.log(au + 1e-12)) + Math.exp(nn * Math.log(av + 1e-12))));
        if (rho <= 1e-9) { cov[k] = 1; continue; }
      }
      const d = Math.sqrt(px * px + py * py) * (1 - 1 / rho);
      const a = 0.5 - d * inv;
      cov[k] = a <= 0 ? 0 : a >= 1 ? 1 : a;
    }
  }
  void bw;
}

function covSeg(sh: SegShape, cov: Float32Array, i0: number, i1: number, j0: number, j1: number, g: Grid): void {
  const dx = g.dx, inv = 1 / dx, x0 = g.x0, y0 = g.y0;
  const sdx = sh.x1 - sh.x0, sdy = sh.y1 - sh.y0;
  const L2 = sdx * sdx + sdy * sdy;
  const iL2 = L2 > 0 ? 1 / L2 : 0;
  const r = sh.r;
  let k = 0;
  for (let j = j0; j <= j1; j++) {
    const py = y0 + j * dx - sh.y0;
    for (let i = i0; i <= i1; i++, k++) {
      const px = x0 + i * dx - sh.x0;
      let t = (px * sdx + py * sdy) * iL2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * sdx, ey = py - t * sdy;
      const a = 0.5 - (Math.sqrt(ex * ex + ey * ey) - r) * inv;
      cov[k] = a <= 0 ? 0 : a >= 1 ? 1 : a;
    }
  }
}

function covBlob(sh: BlobShape, cov: Float32Array, i0: number, i1: number, j0: number, j1: number, g: Grid): void {
  const dx = g.dx, inv = 1 / dx, x0 = g.x0, y0 = g.y0;
  const N = sh.radii.length;
  const kk = N / (2 * Math.PI);
  let k = 0;
  for (let j = j0; j <= j1; j++) {
    const py = y0 + j * dx - sh.cy;
    for (let i = i0; i <= i1; i++, k++) {
      const px = x0 + i * dx - sh.cx;
      const lx = px * sh.c + py * sh.s, ly = -px * sh.s + py * sh.c;
      const rr = Math.sqrt(lx * lx + ly * ly);
      if (rr > sh.rmax + dx) { cov[k] = 0; continue; }
      let ph = Math.atan2(ly, lx);
      if (ph < 0) ph += 2 * Math.PI;
      const u = ph * kk;
      const k0 = Math.floor(u) % N;
      const f = u - Math.floor(u);
      const rb = sh.radii[k0] * (1 - f) + sh.radii[(k0 + 1) % N] * f;
      const a = 0.5 - (rr - rb) * inv;
      cov[k] = a <= 0 ? 0 : a >= 1 ? 1 : a;
    }
  }
}

/**
 * Boyaları kanal tamponlarına (W,B,I,M) karıştırarak çizer.
 * Önce şekle özgü sıkı döngüde kaplama haritası hesaplanır, sonra ortak karıştırma.
 */
export function rasterizePaints(paints: Paint[], g: Grid, buf: Float32Array[], z: number, conc: ConcFn | null, bb: BBox): void {
  const n = g.n, dx = g.dx, x0 = g.x0, y0 = g.y0;
  const inv = 1 / dx;
  const bW = buf[0], bB = buf[1], bI = buf[2], bM = buf[3];
  for (let pi = 0; pi < paints.length; pi++) {
    const P = paints[pi];
    const sh = P.shape;
    const pp = P.p;
    tmpV[0] = pp.ch[0];
    tmpV[1] = pp.ch[1];
    tmpV[2] = pp.ch[2];
    tmpV[3] = pp.ch[3];
    if (pp.comp && conc) tmpV[2] += (conc(pp.comp) * (pp.compScale ?? 1)) / 1000;
    const vW = tmpV[0], vB = tmpV[1], vI = tmpV[2], vM = tmpV[3];

    let xmin: number, xmax: number, ymin: number, ymax: number;
    if (sh.k === 0) {
      let ex: number, ey: number;
      if (sh.n === 2) {
        ex = Math.sqrt(sh.rx * sh.rx * sh.c * sh.c + sh.ry * sh.ry * sh.s * sh.s);
        ey = Math.sqrt(sh.rx * sh.rx * sh.s * sh.s + sh.ry * sh.ry * sh.c * sh.c);
      } else {
        ex = sh.rx * Math.abs(sh.c) + sh.ry * Math.abs(sh.s);
        ey = sh.rx * Math.abs(sh.s) + sh.ry * Math.abs(sh.c);
      }
      xmin = sh.cx - ex; xmax = sh.cx + ex; ymin = sh.cy - ey; ymax = sh.cy + ey;
    } else if (sh.k === 1) {
      xmin = Math.min(sh.x0, sh.x1) - sh.r; xmax = Math.max(sh.x0, sh.x1) + sh.r;
      ymin = Math.min(sh.y0, sh.y1) - sh.r; ymax = Math.max(sh.y0, sh.y1) + sh.r;
    } else {
      xmin = sh.cx - sh.rmax; xmax = sh.cx + sh.rmax; ymin = sh.cy - sh.rmax; ymax = sh.cy + sh.rmax;
    }
    if (sh.k === 0 && sh.bx0 !== undefined) {
      xmin = Math.max(xmin, sh.bx0); xmax = Math.min(xmax, sh.bx1!);
      ymin = Math.max(ymin, sh.by0!); ymax = Math.min(ymax, sh.by1!);
    }
    const i0 = Math.max(0, Math.floor((xmin - x0) * inv) - 1);
    const i1 = Math.min(n - 1, Math.ceil((xmax - x0) * inv) + 1);
    const j0 = Math.max(0, Math.floor((ymin - y0) * inv) - 1);
    const j1 = Math.min(n - 1, Math.ceil((ymax - y0) * inv) + 1);
    if (i0 > i1 || j0 > j1) continue;
    if (i0 < bb.i0) bb.i0 = i0;
    if (i1 > bb.i1) bb.i1 = i1;
    if (j0 < bb.j0) bb.j0 = j0;
    if (j1 > bb.j1) bb.j1 = j1;
    const bw = i1 - i0 + 1;
    const cov = ensureCov(bw * (j1 - j0 + 1));
    if (sh.k === 0) covEll(sh, cov, i0, i1, j0, j1, g);
    else if (sh.k === 1) covSeg(sh, cov, i0, i1, j0, j1, g);
    else covBlob(sh, cov, i0, i1, j0, j1, g);

    const clip = P.clip;
    const within = P.within;
    const tex = pp.tex;
    const opacity = pp.opacity ?? 1;
    const hasMask = pp.maskMaxW !== undefined || pp.maskMinW !== undefined;
    const maskMax = pp.maskMaxW ?? Infinity;
    const maskMin = pp.maskMinW ?? -Infinity;
    const simple = !clip && !within && !tex && !hasMask && opacity === 1;
    if (simple) {
      let k = 0;
      for (let j = j0; j <= j1; j++) {
        const row = j * n;
        for (let i = i0; i <= i1; i++, k++) {
          const a = cov[k];
          if (a <= 0) continue;
          const idx = row + i;
          if (a >= 1) {
            bW[idx] = vW; bB[idx] = vB; bI[idx] = vI; bM[idx] = vM;
          } else {
            const ia = 1 - a;
            bW[idx] = bW[idx] * ia + vW * a;
            bB[idx] = bB[idx] * ia + vB * a;
            bI[idx] = bI[idx] * ia + vI * a;
            bM[idx] = bM[idx] * ia + vM * a;
          }
        }
      }
      continue;
    }
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      const y = y0 + j * dx;
      const row = j * n;
      for (let i = i0; i <= i1; i++, k++) {
        let a = cov[k];
        if (a <= 0) continue;
        const x = x0 + i * dx;
        if (clip) {
          for (let c = 0; c < clip.length; c++) {
            const hp = clip[c];
            const ca = 0.5 - (hp.nx * x + hp.ny * y - hp.d) * inv;
            if (ca <= 0) { a = 0; break; }
            if (ca < 1) a *= ca;
          }
          if (a <= 0) continue;
        }
        if (within) {
          const px = x - within.cx, py = y - within.cy;
          const u = Math.abs((px * within.c + py * within.s) / within.rx);
          const v = Math.abs((-px * within.s + py * within.c) / within.ry);
          const rho = within.n === 2 ? Math.sqrt(u * u + v * v) : Math.pow(Math.pow(u, within.n) + Math.pow(v, within.n), 1 / within.n);
          const d = Math.sqrt(px * px + py * py) * (1 - 1 / Math.max(rho, 1e-9));
          const wa = 0.5 - d * inv;
          if (wa <= 0) continue;
          if (wa < 1) a *= wa;
        }
        const idx = row + i;
        const cur = bW[idx];
        if (hasMask && (cur > maskMax || cur < maskMin)) continue;
        a *= opacity;
        let w = vW, b = vB, io = vI, m = vM;
        if (tex) {
          const sc = 1 / tex.scale;
          const nv = (tex.kind === 'noise' ? valueNoise3(x * sc, y * sc, z * sc, tex.seed) : fbm3(x * sc, y * sc, z * sc, tex.seed)) * 2 - 1;
          if (tex.kind === 'noise') {
            const f = 1 + tex.amp * nv;
            w *= f; b *= f; io *= f;
          } else if (tex.kind === 'trab') {
            b *= 1 + tex.amp * nv;
            w *= 1 - 0.25 * tex.amp * nv;
          } else if (tex.kind === 'lung') {
            const f = 1 + (tex.grad ?? 0) * y + tex.amp * nv;
            w *= f; b *= f; io *= f;
          } else if (tex.kind === 'mottle') {
            if (nv > (tex.thr ?? 0.3)) { w = 0.0012; b = 0; io = 0; m = 0; }
            else { const f = 1 + 0.08 * nv; w *= f; }
          } else if (tex.kind === 'gyri') {
            w *= 1 + tex.amp * nv;
          }
        }
        if (a >= 1) {
          bW[idx] = w; bB[idx] = b; bI[idx] = io; bM[idx] = m;
        } else {
          const ia = 1 - a;
          bW[idx] = cur * ia + w * a;
          bB[idx] = bB[idx] * ia + b * a;
          bI[idx] = bI[idx] * ia + io * a;
          bM[idx] = bM[idx] * ia + m * a;
        }
      }
    }
  }
}

export interface SliceRaster {
  buf: Float32Array[]; // 4 kanal, n*n
  bb: BBox;
  hasI: boolean;
  hasM: boolean;
}

/**
 * Kesit hassasiyet profili boyunca (zs, ağırlıklar) alt örneklenmiş fantom kesiti.
 * Doğrusal kısmi hacim: μ ortalaması = ağırlıklı kesit ortalaması.
 */
export function rasterizeSlab(
  model: PhantomModel,
  zs: number[],
  ws: number[],
  g: Grid,
  concAt: ((z: number) => ConcFn) | null,
  work?: { tmp: Float32Array[]; out: Float32Array[] },
): SliceRaster {
  const N = g.n * g.n;
  const tmp = work?.tmp ?? [0, 1, 2, 3].map(() => new Float32Array(N));
  const out = work?.out ?? [0, 1, 2, 3].map(() => new Float32Array(N));
  for (let c = 0; c < 4; c++) out[c].fill(0);
  const total: BBox = { i0: g.n, i1: -1, j0: g.n, j1: -1 };
  const paints: Paint[] = [];
  let prev: BBox | null = null;
  for (let k = 0; k < zs.length; k++) {
    // önceki kutuyu temizle
    if (prev && prev.i1 >= prev.i0) {
      for (let c = 0; c < 4; c++) {
        const t = tmp[c];
        for (let j = prev.j0; j <= prev.j1; j++) t.fill(0, j * g.n + prev.i0, j * g.n + prev.i1 + 1);
      }
    } else if (k === 0) {
      for (let c = 0; c < 4; c++) tmp[c].fill(0);
    }
    const bb: BBox = { i0: g.n, i1: -1, j0: g.n, j1: -1 };
    model.emitAt(zs[k], paints);
    rasterizePaints(paints, g, tmp, zs[k], concAt ? concAt(zs[k]) : null, bb);
    const w = ws[k];
    if (bb.i1 >= bb.i0) {
      for (let c = 0; c < 4; c++) {
        const t = tmp[c], o = out[c];
        for (let j = bb.j0; j <= bb.j1; j++) {
          const r = j * g.n;
          for (let i = bb.i0; i <= bb.i1; i++) o[r + i] += w * t[r + i];
        }
      }
      total.i0 = Math.min(total.i0, bb.i0);
      total.i1 = Math.max(total.i1, bb.i1);
      total.j0 = Math.min(total.j0, bb.j0);
      total.j1 = Math.max(total.j1, bb.j1);
    }
    prev = bb;
  }
  let hasI = false, hasM = false;
  if (total.i1 >= total.i0) {
    for (let j = total.j0; j <= total.j1 && !(hasI && hasM); j++) {
      const r = j * g.n;
      for (let i = total.i0; i <= total.i1; i++) {
        if (out[2][r + i] > 1e-7) hasI = true;
        if (out[3][r + i] > 1e-7) hasM = true;
      }
    }
  }
  return { buf: out, bb: total, hasI, hasM };
}
