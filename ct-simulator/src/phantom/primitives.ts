/**
 * 3B ilkel geometriler → verilen z düzlemindeki 2B kesitler.
 *  - Ellipsoid (keyfi yönelimli; kuadrik–düzlem kesişimi analitik)
 *  - Sweep: z anahtar kareleri arasında Catmull-Rom ile değişen (süper)elips
 *  - Tube: yarıçapı değişebilen çoklu doğru (damar, kaburga, bronş, barsak)
 *  - BlobSweep: kutupsal yarıçap profili z boyunca değişen şekil
 */
import type { Ch4, EllShape, HalfPlane, Paint, PaintProps, Shape2D, Structure, Texture } from './types';
import { TISSUES, compositionToChannels, type TissueId } from '../physics/materials';

const chCache = new Map<string, Ch4>();
export function tissueCh(id: TissueId): Ch4 {
  let c = chCache.get(id);
  if (!c) {
    c = new Float32Array(compositionToChannels(TISSUES[id].comp));
    chCache.set(id, c);
  }
  return c;
}

export interface PropOpts {
  comp?: string;
  compScale?: number;
  tex?: Texture;
  maskMaxW?: number;
  maskMinW?: number;
  opacity?: number;
}

export function props(tissue: TissueId, o: PropOpts = {}): PaintProps {
  return { ch: tissueCh(tissue), tissue, ...o };
}

export function ell(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 2): EllShape {
  return { k: 0, cx, cy, rx: Math.max(rx, 0.05), ry: Math.max(ry, 0.05), c: Math.cos(rot), s: Math.sin(rot), n };
}

export function seg(x0: number, y0: number, x1: number, y1: number, r: number): Shape2D {
  return { k: 1, x0, y0, x1, y1, r };
}

/* ------------------------------------------------------------------------ */
/* Yapı fabrikası                                                            */
/* ------------------------------------------------------------------------ */

export function structure(name: string, zMin: number, zMax: number, emit: (z: number, out: Paint[]) => void): Structure {
  return { name, zMin, zMax, emit };
}

/* ------------------------------------------------------------------------ */
/* Ellipsoid                                                                 */
/* ------------------------------------------------------------------------ */

type V3 = [number, number, number];

/** Euler açılarından (derece) dönüş matrisi: önce x (pitch), sonra y (roll), sonra z (yaw). */
function rotMat(ax: number, ay: number, az: number): number[] {
  const d = Math.PI / 180;
  const [cx, sx] = [Math.cos(ax * d), Math.sin(ax * d)];
  const [cy, sy] = [Math.cos(ay * d), Math.sin(ay * d)];
  const [cz, sz] = [Math.cos(az * d), Math.sin(az * d)];
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

export interface EllipsoidDef {
  c: V3;
  r: V3;
  /** derece: [x-ekseni etrafında, y-ekseni, z-ekseni] */
  rot?: V3;
  /** doğrudan dönüş matrisi (sütunlar = yerel eksenler) */
  R?: number[];
}

/** Uzun ekseni `dir` yönünde olan ellipsoid tanımı. r = [uzun, a, b] */
export function axisEllipsoid(c: V3, dir: V3, r: V3, roll = 0): EllipsoidDef {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const e1: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  // e1'e dik bir referans
  const ref: V3 = Math.abs(e1[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e2: V3 = [e1[1] * ref[2] - e1[2] * ref[1], e1[2] * ref[0] - e1[0] * ref[2], e1[0] * ref[1] - e1[1] * ref[0]];
  const l2 = Math.hypot(...e2);
  e2 = [e2[0] / l2, e2[1] / l2, e2[2] / l2];
  let e3: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (roll) {
    const cr = Math.cos((roll * Math.PI) / 180), sr = Math.sin((roll * Math.PI) / 180);
    const n2: V3 = [cr * e2[0] + sr * e3[0], cr * e2[1] + sr * e3[1], cr * e2[2] + sr * e3[2]];
    const n3: V3 = [-sr * e2[0] + cr * e3[0], -sr * e2[1] + cr * e3[1], -sr * e2[2] + cr * e3[2]];
    e2 = n2;
    e3 = n3;
  }
  const R = [e1[0], e2[0], e3[0], e1[1], e2[1], e3[1], e1[2], e2[2], e3[2]];
  return { c, r, R };
}

export function ellipsoidSection(def: EllipsoidDef) {
  const R = def.R ?? rotMat(...(def.rot ?? [0, 0, 0]));
  const inv = def.r.map((v) => 1 / (v * v));
  // A = R diag(inv) R^T
  const A = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += R[i * 3 + k] * inv[k] * R[j * 3 + k];
      A[i * 3 + j] = s;
    }
  const a11 = A[0], a12 = A[1], a22 = A[4], a13 = A[2], a23 = A[5], a33 = A[8];
  const det2 = a11 * a22 - a12 * a12;
  const i11 = a22 / det2, i12 = -a12 / det2, i22 = a11 / det2;
  // z yarı-genişliği
  let zz = 0;
  for (let k = 0; k < 3; k++) zz += R[6 + k] * R[6 + k] * def.r[k] * def.r[k];
  const halfZ = Math.sqrt(zz);
  const t1 = a13 * (i11 * a13 + i12 * a23) + a23 * (i12 * a13 + i22 * a23);
  return {
    zMin: def.c[2] - halfZ,
    zMax: def.c[2] + halfZ,
    at(z: number, scale = 1): EllShape | null {
      const dz = z - def.c[2];
      const qx = -dz * (i11 * a13 + i12 * a23);
      const qy = -dz * (i12 * a13 + i22 * a23);
      const k = scale * scale - a33 * dz * dz + dz * dz * t1;
      if (k <= 1e-9) return null;
      // M = A2/k → özdeğerler
      const m11 = a11 / k, m12 = a12 / k, m22 = a22 / k;
      const tr = m11 + m22;
      const dd = Math.sqrt(Math.max(0, ((m11 - m22) * (m11 - m22)) / 4 + m12 * m12));
      const l1 = tr / 2 - dd; // küçük özdeğer → büyük yarıçap
      const l2 = tr / 2 + dd;
      const ang = Math.abs(m12) < 1e-12 ? (m11 <= m22 ? 0 : Math.PI / 2) : Math.atan2(l1 - m11, m12);
      return ell(def.c[0] + qx, def.c[1] + qy, 1 / Math.sqrt(l1), 1 / Math.sqrt(l2), ang);
    },
  };
}

/** Basit ellipsoid yapı. */
export function ellipsoid(name: string, def: EllipsoidDef, p: PaintProps, clip?: HalfPlane[]): Structure {
  const sec = ellipsoidSection(def);
  return structure(name, sec.zMin, sec.zMax, (z, out) => {
    const s = sec.at(z);
    if (s) out.push({ shape: s, p, clip });
  });
}

/** İç içe kabuklar (ör. kortikal + spongiöz): her katman bir öncekinin içinde, sabit mm kalınlıkla. */
export function shelledEllipsoid(name: string, def: EllipsoidDef, layers: [PaintProps, number][]): Structure {
  // layers: [props, içe doğru kalınlık mm] — ilk katman dış yüzey
  const secs: ReturnType<typeof ellipsoidSection>[] = [];
  let inset = 0;
  for (const [, t] of layers) {
    secs.push(ellipsoidSection({ ...def, r: [def.r[0] - inset, def.r[1] - inset, def.r[2] - inset] }));
    inset += t;
  }
  return structure(name, secs[0].zMin, secs[0].zMax, (z, out) => {
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i].at(z);
      if (s) out.push({ shape: s, p: layers[i][0] });
    }
  });
}

/* ------------------------------------------------------------------------ */
/* Sweep                                                                     */
/* ------------------------------------------------------------------------ */

/** [z, cx, cy, rx, ry, rot(derece)?, n?] */
export type SweepKey = [number, number, number, number, number, number?, number?];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function sweepSampler(keys: SweepKey[]) {
  const ks = keys.map((k) => [k[0], k[1], k[2], k[3], k[4], k[5] ?? 0, k[6] ?? 2]);
  const n = ks.length;
  return {
    zMin: ks[0][0],
    zMax: ks[n - 1][0],
    at(z: number): number[] | null {
      if (z < ks[0][0] || z > ks[n - 1][0]) return null;
      let i = 0;
      while (i < n - 2 && z > ks[i + 1][0]) i++;
      const a = ks[Math.max(0, i - 1)], b = ks[i], c = ks[i + 1], d = ks[Math.min(n - 1, i + 2)];
      const t = (z - b[0]) / Math.max(1e-9, c[0] - b[0]);
      const r: number[] = [];
      for (let j = 1; j < 7; j++) r.push(catmull(a[j], b[j], c[j], d[j], t));
      // Yarıçaplar pozitif kalsın ve uç nokta dışına taşmasın
      r[2] = Math.max(0.05, Math.min(r[2], Math.max(b[3], c[3]) * 1.08 + 0.5));
      r[3] = Math.max(0.05, Math.min(r[3], Math.max(b[4], c[4]) * 1.08 + 0.5));
      return r; // [cx, cy, rx, ry, rotDeg, n]
    },
  };
}

export interface SweepOpts {
  /** dış yüzeyden içe doğru katmanlar: [props, mm] (ilk = en dış) */
  layers?: [PaintProps, number][];
  /** her katman için ön/arka farklı içe çekme (rx,ry ayrı) */
  insetXY?: [number, number][];
  scaleX?: number;
  scaleY?: number;
  dx?: number;
  dy?: number;
  clip?: HalfPlane[];
}

export function sweep(name: string, keys: SweepKey[], p: PaintProps, o: SweepOpts = {}): Structure {
  const s = sweepSampler(keys);
  const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1;
  return structure(name, s.zMin, s.zMax, (z, out) => {
    const r = s.at(z);
    if (!r) return;
    const [cx, cy, rx, ry, rot, n] = r;
    const rr = (rot * Math.PI) / 180;
    out.push({ shape: ell(cx + (o.dx ?? 0), cy + (o.dy ?? 0), rx * sx, ry * sy, rr, n), p, clip: o.clip });
    if (o.layers) {
      let ix = 0, iy = 0;
      o.layers.forEach(([lp, t], li) => {
        const ins = o.insetXY?.[li];
        ix += ins ? ins[0] : t;
        iy += ins ? ins[1] : t;
        if (rx * sx - ix > 0.3 && ry * sy - iy > 0.3)
          out.push({ shape: ell(cx + (o.dx ?? 0), cy + (o.dy ?? 0), rx * sx - ix, ry * sy - iy, rr, n), p: lp, clip: o.clip });
      });
    }
  });
}

/* ------------------------------------------------------------------------ */
/* Tube                                                                      */
/* ------------------------------------------------------------------------ */

/** [x, y, z, r] */
export type TubePt = [number, number, number, number];

export interface TubeOpts {
  /** iç lümen: [props, duvar kalınlığı mm] – önce dış (duvar) sonra lümen çizilir */
  lumen?: [PaintProps, number];
  /** uçlarda yuvarlak kapak (varsayılan true) */
  caps?: boolean;
  maxElong?: number;
}

/** Bir tüpün z düzlemindeki kesitlerini üretir (yarıçap ofseti ile). */
export function tubeSections(pts: TubePt[], z: number, rOffset: number, out: Shape2D[], clips: (HalfPlane[] | undefined)[], caps = true, maxElong = 8): void {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ra = a[3] + rOffset, rb = b[3] + rOffset;
    if (ra <= 0.05 && rb <= 0.05) continue;
    const rmax = Math.max(ra, rb);
    const zlo = Math.min(a[2], b[2]) - rmax, zhi = Math.max(a[2], b[2]) + rmax;
    if (z < zlo || z > zhi) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) continue;
    const hx = dx / L, hy = dy / L, sz = dz / L;
    const hl = Math.hypot(hx, hy);
    const ux = hl > 1e-9 ? hx / hl : 1, uy = hl > 1e-9 ? hy / hl : 0;
    if (Math.abs(sz) > 0.02) {
      const t = (z - a[2]) / dz;
      const r = ra + (rb - ra) * Math.min(1, Math.max(0, t));
      if (r <= 0.05) continue;
      const cx = a[0] + dx * t, cy = a[1] + dy * t;
      const major = Math.min(r / Math.abs(sz), r * maxElong);
      if (hl < 1e-3) {
        if (t < 0 || t > 1) continue;
        out.push(ell(cx, cy, r, r));
        clips.push(undefined);
        continue;
      }
      // Uç kapak düzlemleri (eksene dik) ∩ z düzlemi → ŭ·P ∈ [sA, sB]
      const sA = ux * a[0] + uy * a[1] - ((z - a[2]) * sz) / hl;
      const sB = ux * b[0] + uy * b[1] - ((z - b[2]) * sz) / hl;
      const lo = Math.min(sA, sB), hi = Math.max(sA, sB);
      const sC = ux * cx + uy * cy;
      const e0 = Math.max(lo, sC - major), e1 = Math.min(hi, sC + major);
      if (e1 <= e0) continue;
      const e = ell(cx, cy, major, r, Math.atan2(uy, ux));
      const p0x = cx + ux * (e0 - sC), p0y = cy + uy * (e0 - sC), p1x = cx + ux * (e1 - sC), p1y = cy + uy * (e1 - sC);
      e.bx0 = Math.min(p0x, p1x) - r; e.bx1 = Math.max(p0x, p1x) + r;
      e.by0 = Math.min(p0y, p1y) - r; e.by1 = Math.max(p0y, p1y) + r;
      out.push(e);
      clips.push([
        { nx: -ux, ny: -uy, d: -lo },
        { nx: ux, ny: uy, d: hi },
      ]);
    } else {
      const zm = 0.5 * (a[2] + b[2]);
      const r = 0.5 * (ra + rb);
      const w2 = r * r - (z - zm) * (z - zm);
      if (w2 <= 0.01) continue;
      const w = Math.sqrt(w2);
      const mx = 0.5 * (a[0] + b[0]), my = 0.5 * (a[1] + b[1]);
      const e = ell(mx, my, Math.hypot(dx, dy) / 2 + w, w, Math.atan2(uy, ux));
      e.bx0 = Math.min(a[0], b[0]) - rmax; e.bx1 = Math.max(a[0], b[0]) + rmax;
      e.by0 = Math.min(a[1], b[1]) - rmax; e.by1 = Math.max(a[1], b[1]) + rmax;
      out.push(e);
      clips.push([
        { nx: -ux, ny: -uy, d: -(ux * a[0] + uy * a[1]) },
        { nx: ux, ny: uy, d: ux * b[0] + uy * b[1] },
      ]);
    }
  }
  // Eklem ve uç küreleri
  for (let i = 0; i < n; i++) {
    if (!caps && (i === 0 || i === n - 1)) continue;
    const p = pts[i];
    const r = p[3] + rOffset;
    const dz = z - p[2];
    const w2 = r * r - dz * dz;
    if (w2 > 0.01) {
      out.push(ell(p[0], p[1], Math.sqrt(w2), Math.sqrt(w2)));
      clips.push(undefined);
    }
  }
}

export function tube(name: string, pts: TubePt[], p: PaintProps, o: TubeOpts = {}): Structure {
  let zMin = Infinity, zMax = -Infinity;
  for (const q of pts) {
    zMin = Math.min(zMin, q[2] - q[3]);
    zMax = Math.max(zMax, q[2] + q[3]);
  }
  const shapes: Shape2D[] = [];
  const clips: (HalfPlane[] | undefined)[] = [];
  return structure(name, zMin, zMax, (z, out) => {
    shapes.length = 0;
    clips.length = 0;
    tubeSections(pts, z, 0, shapes, clips, o.caps ?? true, o.maxElong);
    for (let i = 0; i < shapes.length; i++) out.push({ shape: shapes[i], p, clip: clips[i] });
    if (o.lumen) {
      shapes.length = 0;
      clips.length = 0;
      tubeSections(pts, z, -o.lumen[1], shapes, clips, o.caps ?? true, o.maxElong);
      for (let i = 0; i < shapes.length; i++) out.push({ shape: shapes[i], p: o.lumen[0], clip: clips[i] });
    }
  });
}

/** Düz çizgi parçalarını yumuşatılmış eğriye dönüştürür (Catmull-Rom, alt örnekleme). */
export function smoothPath(pts: TubePt[], sub = 4): TubePt[] {
  if (pts.length < 3) return pts;
  const out: TubePt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      out.push([0, 1, 2, 3].map((j) => catmull(p0[j], p1[j], p2[j], p3[j], t)) as TubePt);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* ------------------------------------------------------------------------ */
/* Kutupsal blob                                                             */
/* ------------------------------------------------------------------------ */

const BLOB_N = 72;

/** Kontrol yarıçaplarından (eşit açılı, φ=0: +x (hasta solu), saat yönü tersine… y aşağı) periyodik yumuşak profil. */
export function blobRadii(ctrl: number[]): Float32Array {
  const m = ctrl.length;
  const r = new Float32Array(BLOB_N);
  for (let i = 0; i < BLOB_N; i++) {
    const u = (i / BLOB_N) * m;
    const k = Math.floor(u);
    const t = u - k;
    const p0 = ctrl[(k - 1 + m) % m], p1 = ctrl[k % m], p2 = ctrl[(k + 1) % m], p3 = ctrl[(k + 2) % m];
    r[i] = Math.max(0.1, catmull(p0, p1, p2, p3, t));
  }
  return r;
}

export function blobShape(cx: number, cy: number, radii: Float32Array, rot = 0): Shape2D {
  let rmax = 0;
  for (let i = 0; i < radii.length; i++) rmax = Math.max(rmax, radii[i]);
  return { k: 2, cx, cy, c: Math.cos(rot), s: Math.sin(rot), radii, rmax };
}

/** [z, cx, cy, scale, ...ctrl] anahtarları arasında interpolasyonlu blob. ctrl: aynı uzunlukta. */
export type BlobKey = { z: number; cx: number; cy: number; r: number[] };

export function blobSweep(name: string, keys: BlobKey[], p: PaintProps, o: { insets?: [PaintProps, number][]; clip?: HalfPlane[] } = {}): Structure {
  const n = keys.length;
  const ctrlLen = keys[0].r.length;
  const tmp = new Array(ctrlLen).fill(0);
  return structure(name, keys[0].z, keys[n - 1].z, (z, out) => {
    if (z < keys[0].z || z > keys[n - 1].z) return;
    let i = 0;
    while (i < n - 2 && z > keys[i + 1].z) i++;
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(n - 1, i + 2)];
    const t = (z - b.z) / Math.max(1e-9, c.z - b.z);
    for (let j = 0; j < ctrlLen; j++) tmp[j] = Math.max(0.1, Math.min(Math.max(b.r[j], c.r[j]) * 1.05, catmull(a.r[j], b.r[j], c.r[j], d.r[j], t)));
    const cx = catmull(a.cx, b.cx, c.cx, d.cx, t), cy = catmull(a.cy, b.cy, c.cy, d.cy, t);
    out.push({ shape: blobShape(cx, cy, blobRadii(tmp)), p, clip: o.clip });
    if (o.insets) {
      let ins = 0;
      for (const [lp, th] of o.insets) {
        ins += th;
        out.push({ shape: blobShape(cx, cy, blobRadii(tmp.map((v) => Math.max(0.1, v - ins)))), p: lp, clip: o.clip });
      }
    }
  });
}

/** Ellipsin dış sınırında φ açısındaki nokta (kaburga vb. için). */
export function ellPoint(cx: number, cy: number, rx: number, ry: number, phi: number): [number, number] {
  return [cx + rx * Math.cos(phi), cy + ry * Math.sin(phi)];
}
