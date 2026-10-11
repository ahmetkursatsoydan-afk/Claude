/**
 * 3B değer gürültüsü (doku dokusu için; kesitler arasında tutarlı). Çıktı ∈ [0,1).
 * Hız için önceden hesaplanmış periyodik 64³ kafes + trilineer (smoothstep) enterpolasyon.
 */
const S = 64;
const M = S - 1;
const LAT = (() => {
  const a = new Float32Array(S * S * S);
  let s = 0x2545f491;
  for (let i = 0; i < a.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    a[i] = (s >>> 0) / 4294967296;
  }
  return a;
})();

export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  x += seed * 17.317;
  y += seed * 7.913;
  z += seed * 3.771;
  const xf0 = Math.floor(x), yf0 = Math.floor(y), zf0 = Math.floor(z);
  let fx = x - xf0, fy = y - yf0, fz = z - zf0;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const xi = xf0 & M, yi = yf0 & M, zi = zf0 & M;
  const xj = (xi + 1) & M, yj = (yi + 1) & M, zj = (zi + 1) & M;
  const a0 = (xi * S + yi) * S, a1 = (xj * S + yi) * S, a2 = (xi * S + yj) * S, a3 = (xj * S + yj) * S;
  const c000 = LAT[a0 + zi], c100 = LAT[a1 + zi], c010 = LAT[a2 + zi], c110 = LAT[a3 + zi];
  const c001 = LAT[a0 + zj], c101 = LAT[a1 + zj], c011 = LAT[a2 + zj], c111 = LAT[a3 + zj];
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

/** İki oktavlı fraktal gürültü. */
export function fbm3(x: number, y: number, z: number, seed: number): number {
  return 0.65 * valueNoise3(x, y, z, seed) + 0.35 * valueNoise3(x * 2.13 + 17.1, y * 2.13 + 3.7, z * 2.13 + 9.2, seed + 7);
}
