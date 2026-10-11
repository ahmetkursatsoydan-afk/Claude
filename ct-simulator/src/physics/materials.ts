/**
 * Kütle zayıflatma katsayıları (μ/ρ, cm²/g) ve doku tanımları.
 *
 * Tablolar NIST XCOM / Hubbell–Seltzer "X-Ray Mass Attenuation Coefficients"
 * verilerinden (koherent saçılma dahil toplam) alınmış değerlerdir. Ara enerjiler
 * log–log interpolasyonla, iyotun K-kenarı (33.17 keV) ise ayrık olarak ele alınır.
 *
 * Simülasyon, her dokuyu 4 bazlı bir "kanal" uzayında temsil eder:
 *   W  – su bazı           (g/cm³ su eşdeğeri)
 *   B  – kortikal kemik bazı (g/cm³ kemik eşdeğeri)
 *   I  – iyot              (g/cm³ iyot)
 *   M  – metal (demir bazı) (g/cm³ demir eşdeğeri)
 * K-kenarı içermeyen düşük-Z malzemeler (yağ, kas, kan, beyin…) foto-elektrik +
 * Compton etkileşimi nedeniyle su/kemik bazlarının doğrusal birleşimi olarak çok iyi
 * temsil edilir (çift enerjili BT malzeme ayrıştırmasının temeli).
 */

export type BaseMaterial =
  | 'water'
  | 'adipose'
  | 'muscle'
  | 'bone'
  | 'iodine'
  | 'titanium'
  | 'iron'
  | 'aluminum'
  | 'copper';

const E_TAB = [10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200];

const MU_RHO: Record<Exclude<BaseMaterial, 'iodine'>, number[]> = {
  water: [5.329, 1.673, 0.8096, 0.3756, 0.2683, 0.2269, 0.2059, 0.1837, 0.1707, 0.1505, 0.137],
  adipose: [3.268, 1.09, 0.5844, 0.3091, 0.2399, 0.212, 0.1975, 0.1797, 0.1677, 0.1484, 0.1354],
  muscle: [5.356, 1.693, 0.8205, 0.3783, 0.2685, 0.2262, 0.2048, 0.1823, 0.1693, 0.1492, 0.1358],
  bone: [28.51, 9.032, 4.001, 1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855, 0.148, 0.1309],
  titanium: [110.7, 35.87, 15.85, 4.972, 2.214, 1.213, 0.7661, 0.4052, 0.2721, 0.1649, 0.1314],
  iron: [170.6, 57.08, 25.68, 8.176, 3.629, 1.958, 1.205, 0.5952, 0.3717, 0.1964, 0.146],
  aluminum: [26.23, 7.955, 3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1378, 0.1223],
  copper: [215.9, 74.05, 33.79, 10.92, 4.862, 2.613, 1.593, 0.763, 0.4584, 0.2217, 0.1559],
};

/** İyot: K-kenarı 33.1694 keV. Kenarın altı ve üstü ayrı tablolar. */
const IODINE_K_EDGE = 33.1694;
const IODINE_LOW_E = [10, 15, 20, 30, IODINE_K_EDGE];
const IODINE_LOW = [162.6, 55.34, 25.86, 8.692, 6.551];
const IODINE_HIGH_E = [IODINE_K_EDGE, 40, 50, 60, 80, 100, 150, 200];
const IODINE_HIGH = [35.82, 22.14, 12.32, 7.579, 3.51, 1.942, 0.6978, 0.3663];

/** Havada kütle enerji soğurma katsayısı (μen/ρ) – kerma/HVL hesabı için. */
const AIR_MUEN = [4.742, 1.334, 0.5389, 0.1537, 0.06833, 0.04098, 0.03041, 0.02407, 0.02325, 0.02496, 0.02672];

export const DENSITY: Record<BaseMaterial, number> = {
  water: 1.0,
  adipose: 0.95,
  muscle: 1.05,
  bone: 1.92,
  iodine: 4.93,
  titanium: 4.506,
  iron: 7.874,
  aluminum: 2.699,
  copper: 8.96,
};

function logInterp(es: number[], vs: number[], e: number): number {
  if (e <= es[0]) {
    const s = Math.log(vs[1] / vs[0]) / Math.log(es[1] / es[0]);
    return vs[0] * Math.pow(e / es[0], s);
  }
  const n = es.length;
  if (e >= es[n - 1]) {
    const s = Math.log(vs[n - 1] / vs[n - 2]) / Math.log(es[n - 1] / es[n - 2]);
    return vs[n - 1] * Math.pow(e / es[n - 1], s);
  }
  let i = 0;
  while (e > es[i + 1]) i++;
  const t = Math.log(e / es[i]) / Math.log(es[i + 1] / es[i]);
  return Math.exp(Math.log(vs[i]) + t * (Math.log(vs[i + 1]) - Math.log(vs[i])));
}

/** μ/ρ (cm²/g) – E keV. */
export function massAtten(m: BaseMaterial, e: number): number {
  if (m === 'iodine') {
    return e < IODINE_K_EDGE ? logInterp(IODINE_LOW_E, IODINE_LOW, e) : logInterp(IODINE_HIGH_E, IODINE_HIGH, e);
  }
  return logInterp(E_TAB, MU_RHO[m], e);
}

export function airMuEn(e: number): number {
  return logInterp(E_TAB, AIR_MUEN, e);
}

export const IODINE_K_EDGE_KEV = IODINE_K_EDGE;

/* ------------------------------------------------------------------------ */
/* Kanal (baz) uzayı                                                         */
/* ------------------------------------------------------------------------ */

export const NCH = 4;
export const CH_W = 0;
export const CH_B = 1;
export const CH_I = 2;
export const CH_M = 3;
export const CHANNEL_BASIS: BaseMaterial[] = ['water', 'bone', 'iodine', 'iron'];

/** Kanal c'nin E enerjisindeki kütle zayıflatma katsayısı. */
export function channelMassAtten(c: number, e: number): number {
  return massAtten(CHANNEL_BASIS[c], e);
}

export type Composition = Partial<Record<BaseMaterial, number>>; // kısmi yoğunluklar g/cm³
export type Channels = [number, number, number, number];

const FIT_E: number[] = [];
for (let e = 35; e <= 130; e += 5) FIT_E.push(e);

/** a·μ1(E)+b·μ2(E) ≈ μm(E) en küçük kareler (40–130 keV, göreli ağırlıklı). */
function fit2(m: BaseMaterial, b1: BaseMaterial, b2: BaseMaterial): [number, number] {
  let s11 = 0, s12 = 0, s22 = 0, y1 = 0, y2 = 0;
  for (const e of FIT_E) {
    const t = massAtten(m, e);
    const w = 1 / (t * t); // göreli hata minimizasyonu
    const a = massAtten(b1, e);
    const b = massAtten(b2, e);
    s11 += w * a * a;
    s12 += w * a * b;
    s22 += w * b * b;
    y1 += w * a * t;
    y2 += w * b * t;
  }
  const det = s11 * s22 - s12 * s12;
  return [(y1 * s22 - y2 * s12) / det, (s11 * y2 - s12 * y1) / det];
}

const basisCache = new Map<BaseMaterial, Channels>();

/** 1 g/cm³ baz malzemenin kanal karşılığı. */
export function baseToChannels(m: BaseMaterial): Channels {
  const hit = basisCache.get(m);
  if (hit) return hit;
  let r: Channels;
  switch (m) {
    case 'water':
      r = [1, 0, 0, 0];
      break;
    case 'bone':
      r = [0, 1, 0, 0];
      break;
    case 'iodine':
      r = [0, 0, 1, 0];
      break;
    case 'iron':
      r = [0, 0, 0, 1];
      break;
    case 'titanium':
    case 'copper': {
      const [a, b] = fit2(m, 'iron', 'water');
      r = [b, 0, 0, a];
      break;
    }
    default: {
      const [a, b] = fit2(m, 'water', 'bone');
      r = [a, b, 0, 0];
    }
  }
  basisCache.set(m, r);
  return r;
}

export function compositionToChannels(c: Composition): Channels {
  const out: Channels = [0, 0, 0, 0];
  for (const k of Object.keys(c) as BaseMaterial[]) {
    const rho = c[k] ?? 0;
    const b = baseToChannels(k);
    for (let i = 0; i < 4; i++) out[i] += rho * b[i];
  }
  return out;
}

/** Bileşimin E enerjisindeki doğrusal zayıflatma katsayısı (1/cm), doğrudan tablodan. */
export function linearAtten(c: Composition, e: number): number {
  let mu = 0;
  for (const k of Object.keys(c) as BaseMaterial[]) mu += (c[k] ?? 0) * massAtten(k, e);
  return mu;
}

export function channelsLinearAtten(ch: ArrayLike<number>, e: number): number {
  let mu = 0;
  for (let c = 0; c < NCH; c++) if (ch[c] !== 0) mu += ch[c] * channelMassAtten(c, e);
  return mu;
}

/** Monoenerjetik HU (referans E keV). */
export function monoHU(ch: ArrayLike<number>, e: number): number {
  const muw = massAtten('water', e);
  return (1000 * (channelsLinearAtten(ch, e) - muw)) / muw;
}

/* ------------------------------------------------------------------------ */
/* Dokular                                                                    */
/* ------------------------------------------------------------------------ */

export interface TissueDef {
  id: string;
  label: string;
  comp: Composition;
}

const T = (id: string, label: string, comp: Composition): TissueDef => ({ id, label, comp });

/**
 * Doku tanımları. Yoğunluklar, 120 kVp'de literatürdeki tipik kontrastsız HU
 * değerlerini verecek biçimde seçilmiştir (yağ ≈ −100, karaciğer ≈ 55, kemik ≈ 1000+).
 * Gerçek HU değerleri spektrum, sertleşme ve yeniden yapılandırmadan sonra simülasyonda
 * ortaya çıkar; kVp değiştikçe kemik/iyot/yağ kontrastı fiziksel olarak değişir.
 */
export const TISSUES = {
  air: T('air', 'Hava', { water: 0.0012 }),
  bowelGas: T('bowelGas', 'Barsak gazı', { water: 0.0012 }),
  lung: T('lung', 'Akciğer parankimi', { muscle: 0.165 }),
  fat: T('fat', 'Yağ', { adipose: 0.93 }),
  fatDirty: T('fatDirty', 'Mezenterik yağ', { adipose: 0.86, muscle: 0.1 }),
  marrowFat: T('marrowFat', 'Sarı ilik', { adipose: 0.92, muscle: 0.06 }),
  water: T('water', 'Su', { water: 1.0 }),
  csf: T('csf', 'BOS', { water: 1.007 }),
  bile: T('bile', 'Safra', { water: 1.012 }),
  urine: T('urine', 'İdrar', { water: 1.01 }),
  bowelFluid: T('bowelFluid', 'Barsak içeriği (sıvı)', { water: 1.02 }),
  feces: T('feces', 'Fekal içerik', { water: 0.55, adipose: 0.3, muscle: 0.07 }),
  softTissue: T('softTissue', 'Yumuşak doku', { muscle: 1.035 }),
  muscle: T('muscle', 'Kas', { muscle: 1.052 }),
  blood: T('blood', 'Kan', { muscle: 1.05 }),
  myocardium: T('myocardium', 'Miyokard', { muscle: 1.053 }),
  liver: T('liver', 'Karaciğer', { muscle: 1.064 }),
  spleen: T('spleen', 'Dalak', { muscle: 1.056 }),
  pancreas: T('pancreas', 'Pankreas', { muscle: 1.046 }),
  kidney: T('kidney', 'Böbrek korteksi', { muscle: 1.04 }),
  kidneyMedulla: T('kidneyMedulla', 'Böbrek medullası', { muscle: 1.035 }),
  adrenal: T('adrenal', 'Adrenal', { muscle: 1.03 }),
  bowelWall: T('bowelWall', 'Barsak duvarı', { muscle: 1.04 }),
  stomachWall: T('stomachWall', 'Mide duvarı', { muscle: 1.042 }),
  prostate: T('prostate', 'Prostat', { muscle: 1.04 }),
  lymph: T('lymph', 'Lenf nodu', { muscle: 1.035 }),
  thyroid: T('thyroid', 'Tiroid', { muscle: 1.05, iodine: 0.0011 }),
  grayMatter: T('grayMatter', 'Gri cevher', { water: 0.6, muscle: 0.442 }),
  whiteMatter: T('whiteMatter', 'Beyaz cevher', { water: 0.5, muscle: 0.475, adipose: 0.055 }),
  basalGanglia: T('basalGanglia', 'Bazal ganglion', { water: 0.6, muscle: 0.444 }),
  dura: T('dura', 'Dura/falks', { muscle: 1.06, bone: 0.012 }),
  choroidCalc: T('choroidCalc', 'Koroid pleksus kalsifikasyonu', { muscle: 1.0, bone: 0.25 }),
  pinealCalc: T('pinealCalc', 'Pineal kalsifikasyon', { muscle: 0.9, bone: 0.45 }),
  vitreous: T('vitreous', 'Vitreus', { water: 1.01 }),
  lens: T('lens', 'Lens', { muscle: 1.08 }),
  cartilage: T('cartilage', 'Kıkırdak', { muscle: 1.08, bone: 0.025 }),
  cartilageCalc: T('cartilageCalc', 'Kalsifiye kıkırdak', { muscle: 0.95, bone: 0.2 }),
  disc: T('disc', 'İntervertebral disk', { muscle: 1.07 }),
  tendon: T('tendon', 'Tendon/ligament', { muscle: 1.07 }),
  skin: T('skin', 'Deri', { muscle: 1.06 }),
  breast: T('breast', 'Meme glandüler', { muscle: 0.6, adipose: 0.4 }),
  corticalBone: T('corticalBone', 'Kortikal kemik', { bone: 1.85 }),
  denseBone: T('denseBone', 'Petröz/yoğun kemik', { bone: 1.95 }),
  trabecularBone: T('trabecularBone', 'Trabeküler kemik', { muscle: 0.88, bone: 0.2 }),
  trabecularDense: T('trabecularDense', 'Yoğun trabeküler kemik', { muscle: 0.8, bone: 0.4 }),
  diploe: T('diploe', 'Diploe', { muscle: 0.75, bone: 0.65 }),
  enamel: T('enamel', 'Diş minesi', { bone: 2.6 }),
  dentin: T('dentin', 'Dentin', { bone: 1.75 }),
  // Metaller / implantlar
  titanium: T('titanium', 'Titanyum implant', { titanium: 4.5 }),
  cocr: T('cocr', 'CoCr protez başı', { iron: 8.3 }),
  steel: T('steel', 'Paslanmaz çelik', { iron: 7.9 }),
  amalgam: T('amalgam', 'Amalgam dolgu', { copper: 3.5, iron: 4.5 }),
  // Masa ve aksesuarlar
  carbonFiber: T('carbonFiber', 'Karbon fiber masa', { adipose: 0.55, bone: 0.08, muscle: 0.6 }),
  foam: T('foam', 'Masa minderi', { adipose: 0.06 }),
  plastic: T('plastic', 'Plastik', { adipose: 0.8, muscle: 0.25 }),
} as const;

export type TissueId = keyof typeof TISSUES;
export const TISSUE_IDS = Object.keys(TISSUES) as TissueId[];
export const TISSUE_INDEX: Record<string, number> = Object.fromEntries(TISSUE_IDS.map((k, i) => [k, i]));

export function tissueChannels(id: TissueId): Channels {
  return compositionToChannels(TISSUES[id].comp);
}

/** İyot (mg/mL) eklenmiş kanal vektörü. */
export function withIodine(ch: Channels, mgPerMl: number): Channels {
  return [ch[0], ch[1], ch[2] + mgPerMl / 1000, ch[3]];
}
