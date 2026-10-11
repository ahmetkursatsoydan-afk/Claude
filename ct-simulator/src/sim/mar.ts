/**
 * Metal artefakt azaltma (doğrusal enterpolasyon tabanlı, LI-MAR).
 * 1) FBP görüntüsünde metal eşiklenir, 2) metal maskesi ileri izdüşürülerek
 * sinogramdaki "metal izi" bulunur, 3) iz boyunca veriler dedektör yönünde
 * doğrusal enterpolasyonla değiştirilir, 4) yeniden FBP, 5) metal geri eklenir.
 */
import { projectJoseph, type ProjGeom, type ReconGrid } from './projector';

export function metalTrace(maskImg: Float32Array, rg: ReconGrid, geo: ProjGeom): Float32Array {
  // Maske rekon ızgarasında; projektör izomerkez merkezli kare ızgara bekler →
  // rekon merkezi ofsetini kapsayacak biçimde kaydırılmış ızgaraya kopyala.
  const pix = rg.pix;
  const n = Math.ceil((2 * (Math.max(Math.abs(rg.cx), Math.abs(rg.cy)) + (rg.m * pix) / 2)) / pix) + 4;
  const nn = n + (n % 2 === rg.m % 2 ? 0 : 1);
  const big = new Float32Array(nn * nn);
  const c0 = (nn - 1) / 2;
  const h = (rg.m - 1) / 2;
  let i0 = nn, i1 = -1, j0 = nn, j1 = -1;
  for (let r = 0; r < rg.m; r++) {
    for (let c = 0; c < rg.m; c++) {
      const v = maskImg[r * rg.m + c];
      if (v <= 0) continue;
      const x = rg.cx + (c - h) * pix, y = rg.cy + (r - h) * pix;
      const bi = Math.round(x / pix + c0), bj = Math.round(y / pix + c0);
      if (bi < 1 || bj < 1 || bi >= nn - 2 || bj >= nn - 2) continue;
      big[bj * nn + bi] = 1;
      i0 = Math.min(i0, bi - 1); i1 = Math.max(i1, bi + 1); j0 = Math.min(j0, bj - 1); j1 = Math.max(j1, bj + 1);
    }
  }
  const out = new Float32Array(geo.nv * geo.nb);
  if (i1 < 0) return out;
  projectJoseph([big], nn, pix, { i0, i1, j0, j1 }, geo, [out]);
  return out;
}

export function inpaintTrace(p: Float32Array, trace: Float32Array, geo: ProjGeom): void {
  const { nv, nb } = geo;
  for (let v = 0; v < nv; v++) {
    const o = v * nb;
    let b = 0;
    while (b < nb) {
      if (trace[o + b] > 0.005) {
        const start = b;
        while (b < nb && trace[o + b] > 0.005) b++;
        const a0 = Math.max(0, start - 2), a1 = Math.min(nb - 1, b + 1);
        const pa = p[o + a0], pb = p[o + a1];
        for (let k = start; k < b; k++) {
          const t = (k - a0) / Math.max(1, a1 - a0);
          p[o + k] = pa + (pb - pa) * t;
        }
      } else b++;
    }
  }
}
