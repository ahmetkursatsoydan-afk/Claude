/**
 * Hibrit iteratif rekonstrüksiyon (ASiR / iDose / SAFIRE benzeri, eğitim amaçlı model).
 *
 * 1) İzdüşüm alanı: düşük foton sayılı ışınlara (yüksek varyans) istatistiksel
 *    ağırlıklı uyarlamalı yumuşatma → foton açlığı çizgilerini azaltır.
 * 2) Görüntü alanı: FBP görüntüsünden başlayarak kenar koruyucu (Huber) düzenlileştirme
 *    ile birkaç gradyan inişi iterasyonu:  min ½‖x−x₀‖² + λ Σ φ_δ(∇x)
 * 3) Seviyeye bağlı FBP ile harmanlama (%).
 * Yüksek seviyelerde gürültü azalır fakat gürültü dokusu "plastik/yamalı" görünür —
 * klinikte de gözlenen davranış.
 */

export interface IrLevelParams {
  lambda: number;
  blend: number;
  iters: number;
  sinoStrength: number;
}

export function irParams(level: number): IrLevelParams {
  const L = Math.max(1, Math.min(5, level));
  return {
    lambda: [0.6, 0.9, 1.3, 1.8, 2.4][L - 1],
    blend: [0.3, 0.45, 0.6, 0.75, 0.9][L - 1],
    iters: [8, 10, 12, 14, 16][L - 1],
    sinoStrength: [0.3, 0.45, 0.6, 0.75, 0.9][L - 1],
  };
}

/**
 * İzdüşüm alanı uyarlamalı filtre. neq: ışın başına gürültü eşdeğeri kuanta.
 * Düşük NEQ'li ışınlar komşu dedektör kanallarıyla ağırlıklı ortalanır.
 */
export function adaptiveSinoFilter(p: Float32Array, neq: Float32Array, nv: number, nb: number, strength: number): void {
  const row = new Float32Array(nb);
  const thr = 400;
  for (let v = 0; v < nv; v++) {
    const o = v * nb;
    for (let b = 0; b < nb; b++) row[b] = p[o + b];
    for (let b = 2; b < nb - 2; b++) {
      const n = neq[o + b];
      if (n >= thr) continue;
      // varyans ∝ 1/NEQ → yumuşatma ağırlığı
      const a = Math.min(1, strength * Math.sqrt(thr / Math.max(n, 0.5)) * 0.35);
      const w2 = Math.min(1, a * 0.6);
      const sm = (row[b - 2] * w2 + row[b - 1] + row[b] + row[b + 1] + row[b + 2] * w2) / (3 + 2 * w2);
      p[o + b] = row[b] * (1 - a) + sm * a;
    }
  }
}

/** Görüntü alanı Huber-TV düzenlileştirme. img: HU (float), mask: işlenecek pikseller. */
export function irImageDomain(img: Float32Array, m: number, level: number, sigma: number): Float32Array {
  const P = irParams(level);
  const x0 = img;
  const x = new Float32Array(x0);
  const gx = new Float32Array(m * m), gy = new Float32Array(m * m);
  const delta = Math.max(4, 1.6 * sigma);
  const lam = P.lambda;
  const tau = 1 / (1 + 8 * lam);
  for (let it = 0; it < P.iters; it++) {
    // ∇x ve Huber türevi (kırpma)
    for (let j = 0; j < m; j++) {
      const r = j * m;
      for (let i = 0; i < m; i++) {
        const k = r + i;
        const dxv = i < m - 1 ? x[k + 1] - x[k] : 0;
        const dyv = j < m - 1 ? x[k + m] - x[k] : 0;
        gx[k] = dxv > delta ? delta : dxv < -delta ? -delta : dxv;
        gy[k] = dyv > delta ? delta : dyv < -delta ? -delta : dyv;
      }
    }
    // x ← x − τ[(x − x0) − λ div(g)]
    for (let j = 0; j < m; j++) {
      const r = j * m;
      for (let i = 0; i < m; i++) {
        const k = r + i;
        const div = gx[k] - (i > 0 ? gx[k - 1] : 0) + gy[k] - (j > 0 ? gy[k - m] : 0);
        x[k] -= tau * (x[k] - x0[k] - lam * div);
      }
    }
  }
  const out = new Float32Array(m * m);
  const b = P.blend;
  for (let k = 0; k < m * m; k++) out[k] = (1 - b) * x0[k] + b * x[k];
  return out;
}

/**
 * Gürültü (σ, HU) kestirimi: yumuşak doku aralığındaki birçok 7×7 pencerenin yerel standart
 * sapmalarının alt yüzdelik dilimi (homojen bölgeler). Korelasyonlu (kernel ile süzülmüş)
 * gürültüde de doğru çalışır.
 */
export function estimateNoise(img: Float32Array, m: number): number {
  const sds: number[] = [];
  const step = Math.max(4, Math.floor(m / 48));
  const h = 3;
  for (let j = h; j < m - h; j += step) {
    for (let i = h; i < m - h; i += step) {
      let s = 0, s2 = 0, n = 0, ok = true;
      for (let dj = -h; dj <= h && ok; dj++) {
        const r = (j + dj) * m;
        for (let di = -h; di <= h; di++) {
          const v = img[r + i + di];
          if (v < -150 || v > 250) {
            ok = false;
            break;
          }
          s += v;
          s2 += v * v;
          n++;
        }
      }
      if (!ok) continue;
      const mean = s / n;
      sds.push(Math.sqrt(Math.max(0, s2 / n - mean * mean)));
    }
  }
  if (sds.length < 8) return 10;
  sds.sort((a, b) => a - b);
  return sds[Math.floor(sds.length * 0.25)];
}
