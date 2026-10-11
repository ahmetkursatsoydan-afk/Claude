/**
 * Paralel ışın (fan→paralel yeniden gruplanmış) geometrisinde Joseph ileri izdüşümü
 * ve piksel güdümlü doğrusal enterpolasyonlu geri izdüşüm.
 *
 * Görüntü ızgarası izomerkez merkezlidir: piksel (i,j) → x=(i−c)·dx, y=(j−c)·dx.
 * Görünüm açısı θ_v = v·π/nv; ışın: x·cosθ + y·sinθ = s.
 */
import type { BBox } from '../phantom/raster';

export interface ProjGeom {
  nv: number;
  nb: number;
  ds: number; // mm
}

export function viewAngles(nv: number): { cos: Float64Array; sin: Float64Array } {
  const cos = new Float64Array(nv), sin = new Float64Array(nv);
  for (let v = 0; v < nv; v++) {
    const t = (v * Math.PI) / nv;
    cos[v] = Math.cos(t);
    sin[v] = Math.sin(t);
  }
  return { cos, sin };
}

/**
 * Bir veya iki kanalı aynı anda izdüşürür. Çıktı birimi: kanal değeri × cm.
 * @param n ızgara boyutu, dx mm/piksel
 */
export function projectJoseph(
  imgs: Float32Array[],
  n: number,
  dx: number,
  bb: BBox,
  geo: ProjGeom,
  outs: Float32Array[],
  views?: { v0: number; v1: number },
): void {
  const { nv, nb, ds } = geo;
  const A = imgs[0], B = imgs.length > 1 ? imgs[1] : null;
  const oA = outs[0], oB = outs.length > 1 ? outs[1] : null;
  const c0 = (n - 1) / 2;
  const cb = (nb - 1) / 2;
  const { cos, sin } = viewAngles(nv);
  const i0 = Math.max(0, bb.i0), i1 = Math.min(n - 2, bb.i1);
  const j0 = Math.max(0, bb.j0), j1 = Math.min(n - 2, bb.j1);
  if (i1 < i0 || j1 < j0) {
    for (const o of outs) o.fill(0);
    return;
  }
  // sınır kutusu köşeleri (mm)
  const xa = (i0 - c0) * dx, xb = (i1 + 1 - c0) * dx, ya = (j0 - c0) * dx, yb = (j1 + 1 - c0) * dx;
  const va = views?.v0 ?? 0, vb = views?.v1 ?? nv;
  for (let v = va; v < vb; v++) {
    const c = cos[v], s = sin[v];
    const row = v * nb;
    // bu görünümde kutunun s aralığı
    const s1 = xa * c + ya * s, s2 = xb * c + ya * s, s3 = xa * c + yb * s, s4 = xb * c + yb * s;
    const smin = Math.min(s1, s2, s3, s4) - dx, smax = Math.max(s1, s2, s3, s4) + dx;
    const b0 = Math.max(0, Math.floor(smin / ds + cb)), b1 = Math.min(nb - 1, Math.ceil(smax / ds + cb));
    for (let b = 0; b < b0; b++) {
      oA[row + b] = 0;
      if (oB) oB[row + b] = 0;
    }
    for (let b = b1 + 1; b < nb; b++) {
      oA[row + b] = 0;
      if (oB) oB[row + b] = 0;
    }
    if (Math.abs(c) >= Math.abs(s)) {
      // satır boyunca ilerle: x = (s_b − y·sinθ)/cosθ
      const tan = s / c;
      const dl = (dx / Math.abs(c)) * 0.1; // cm
      for (let b = b0; b <= b1; b++) {
        const sb = (b - cb) * ds;
        // j için u(j) = (sb/c − (j−c0)·dx·tan)/dx + c0
        const uj0 = sb / c / dx + c0 + c0 * tan; // u(j) = uj0 − j·tan
        // u ∈ [i0, i1] olan j aralığı
        let ja = j0, jb = j1;
        if (Math.abs(tan) > 1e-12) {
          const jA = (uj0 - i0) / tan, jB = (uj0 - i1) / tan;
          const lo = Math.min(jA, jB), hi = Math.max(jA, jB);
          ja = Math.max(j0, Math.ceil(lo));
          jb = Math.min(j1, Math.floor(hi));
        } else if (uj0 < i0 || uj0 > i1) {
          ja = 1;
          jb = 0;
        }
        let accA = 0, accB = 0;
        let u = uj0 - ja * tan;
        if (B) {
          for (let j = ja; j <= jb; j++) {
            const iu = u | 0;
            const f = u - iu;
            const idx = j * n + iu;
            accA += A[idx] + (A[idx + 1] - A[idx]) * f;
            accB += B[idx] + (B[idx + 1] - B[idx]) * f;
            u -= tan;
          }
          oB![row + b] = accB * dl;
        } else {
          for (let j = ja; j <= jb; j++) {
            const iu = u | 0;
            const f = u - iu;
            const idx = j * n + iu;
            accA += A[idx] + (A[idx + 1] - A[idx]) * f;
            u -= tan;
          }
        }
        oA[row + b] = accA * dl;
      }
    } else {
      // sütun boyunca ilerle: y = (s_b − x·cosθ)/sinθ
      const cot = c / s;
      const dl = (dx / Math.abs(s)) * 0.1;
      for (let b = b0; b <= b1; b++) {
        const sb = (b - cb) * ds;
        const wi0 = sb / s / dx + c0 + c0 * cot; // w(i) = wi0 − i·cot
        let ia = i0, ib = i1;
        if (Math.abs(cot) > 1e-12) {
          const iA = (wi0 - j0) / cot, iB = (wi0 - j1) / cot;
          const lo = Math.min(iA, iB), hi = Math.max(iA, iB);
          ia = Math.max(i0, Math.ceil(lo));
          ib = Math.min(i1, Math.floor(hi));
        } else if (wi0 < j0 || wi0 > j1) {
          ia = 1;
          ib = 0;
        }
        let accA = 0, accB = 0;
        let w = wi0 - ia * cot;
        if (B) {
          for (let i = ia; i <= ib; i++) {
            const jw = w | 0;
            const f = w - jw;
            const idx = jw * n + i;
            accA += A[idx] + (A[idx + n] - A[idx]) * f;
            accB += B[idx] + (B[idx + n] - B[idx]) * f;
            w -= cot;
          }
          oB![row + b] = accB * dl;
        } else {
          for (let i = ia; i <= ib; i++) {
            const jw = w | 0;
            const f = w - jw;
            const idx = jw * n + i;
            accA += A[idx] + (A[idx + n] - A[idx]) * f;
            w -= cot;
          }
        }
        oA[row + b] = accA * dl;
      }
    }
  }
}

export interface ReconGrid {
  m: number; // matris
  pix: number; // mm
  cx: number; // rekon merkezi (izomerkez koordinatı, mm)
  cy: number;
}

/**
 * Filtrelenmiş sinogramın geri izdüşümü. out += (π/nv)·Σ q.
 * Yalnızca [v0, v1) görünümleri (aşamalı görselleştirme için).
 * Sinogram iki yandan sıfır dolgulanır; böylece iç döngü sınır kontrolü içermez
 * ve dört görünüm aynı anda işlenir (bellek trafiği azalır).
 */
export function backproject(q: Float32Array, geo: ProjGeom, rg: ReconGrid, out: Float32Array, v0 = 0, v1 = geo.nv): void {
  const { nv, nb, ds } = geo;
  const { m, pix, cx, cy } = rg;
  const { cos, sin } = viewAngles(nv);
  const half = (m - 1) / 2;
  const scale = Math.PI / nv;
  const maxS = Math.SQRT2 * (m * pix) / 2 + Math.hypot(cx, cy) + 2 * pix;
  const P = Math.max(2, Math.ceil(maxS / ds - (nb - 1) / 2) + 3);
  const nbp = nb + 2 * P;
  const cb = (nbp - 1) / 2;
  const nvv = v1 - v0;
  const qp = new Float32Array(nvv * nbp + 4);
  for (let v = 0; v < nvv; v++) qp.set(q.subarray((v0 + v) * nb, (v0 + v + 1) * nb), v * nbp + P);
  const xStart = cx - half * pix;
  let v = 0;
  for (; v + 3 < nvv; v += 4) {
    const va = v0 + v;
    const c0 = cos[va], c1 = cos[va + 1], c2 = cos[va + 2], c3 = cos[va + 3];
    const s0 = sin[va], s1 = sin[va + 1], s2 = sin[va + 2], s3 = sin[va + 3];
    const r0 = v * nbp, r1 = r0 + nbp, r2 = r1 + nbp, r3 = r2 + nbp;
    const d0 = (pix * c0) / ds, d1 = (pix * c1) / ds, d2 = (pix * c2) / ds, d3 = (pix * c3) / ds;
    for (let r = 0; r < m; r++) {
      const y = cy + (r - half) * pix;
      let t0 = (xStart * c0 + y * s0) / ds + cb;
      let t1 = (xStart * c1 + y * s1) / ds + cb;
      let t2 = (xStart * c2 + y * s2) / ds + cb;
      let t3 = (xStart * c3 + y * s3) / ds + cb;
      const o = r * m;
      for (let col = 0; col < m; col++) {
        let i = t0 | 0, f = t0 - i, k = r0 + i;
        let acc = qp[k] + (qp[k + 1] - qp[k]) * f;
        i = t1 | 0; f = t1 - i; k = r1 + i;
        acc += qp[k] + (qp[k + 1] - qp[k]) * f;
        i = t2 | 0; f = t2 - i; k = r2 + i;
        acc += qp[k] + (qp[k + 1] - qp[k]) * f;
        i = t3 | 0; f = t3 - i; k = r3 + i;
        acc += qp[k] + (qp[k + 1] - qp[k]) * f;
        out[o + col] += acc * scale;
        t0 += d0; t1 += d1; t2 += d2; t3 += d3;
      }
    }
  }
  for (; v < nvv; v++) {
    const va = v0 + v;
    const c = cos[va], s = sin[va];
    const row = v * nbp;
    const dt = (pix * c) / ds;
    for (let r = 0; r < m; r++) {
      const y = cy + (r - half) * pix;
      let t = (xStart * c + y * s) / ds + cb;
      const o = r * m;
      for (let col = 0; col < m; col++) {
        const it = t | 0;
        const f = t - it;
        const k = row + it;
        out[o + col] += (qp[k] + (qp[k + 1] - qp[k]) * f) * scale;
        t += dt;
      }
    }
  }
}
