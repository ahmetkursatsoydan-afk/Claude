/** Tohumlanabilir hızlı PRNG (mulberry32) ve Gauss örnekleyici. */
export class Rng {
  private s: number;
  private spare = 0;
  private hasSpare = false;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Standart normal dağılım (Marsaglia polar). */
  gauss(): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    this.hasSpare = true;
    return u * m;
  }
  /** Poisson örnekleme: küçük λ için Knuth, büyük λ için normal yaklaşım. */
  poisson(lambda: number): number {
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do {
        k++;
        p *= this.next();
      } while (p > L);
      return k - 1;
    }
    return Math.max(0, lambda + Math.sqrt(lambda) * this.gauss());
  }
}

export function hashSeed(...xs: number[]): number {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const v = Math.floor(x * 1000) | 0;
    h ^= v;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
