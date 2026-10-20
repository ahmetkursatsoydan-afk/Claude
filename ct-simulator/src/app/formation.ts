/**
 * "Görüntü Oluşumu" gezgini – kaynak seçimi, hesaplama eylemleri ve büyük veri deposu.
 * Büyük diziler React durumunda değil burada tutulur; arayüz `formation.ver` ile güncellenir.
 */
import { useApp } from '../state/store';
import { getPool } from '../sim/pool';
import type { FormationRequest, FormationResult } from '../sim/formation';
import type { SliceRequest } from '../sim/protocol';
import type { PhantomConfig } from '../phantom/types';
import { DEFAULT_ITER, type IterOptions } from '../sim/iterative';
import { torsoAt } from '../phantom/anatomy/common';
import { ARTIFACTS } from './artifactAtlas';

export { REGIONS, DEFAULT_SOURCE, type FormationRegion, type FormationSource } from './formationSource';
import { REGIONS, DEFAULT_SOURCE, type FormationSource } from './formationSource';

/** Büyük veri deposu (React dışı). */
export const formationData: {
  main: FormationResult | null;
  iter: FormationResult | null;
  atlas: Map<string, (FormationResult | null)[]>;
} = { main: null, iter: null, atlas: new Map() };

const S = () => useApp.getState();
const setF = (p: Partial<ReturnType<typeof S>['formation']>) => S().set({ formation: { ...S().formation, ...p } });

/** Kaynak + değişiklikler → fantom yapılandırması ve kesit isteği. */
export function buildRequest(src: FormationSource, over: Partial<SliceRequest> = {}, cfgOver: Partial<PhantomConfig> = {}): { cfg: PhantomConfig; req: SliceRequest } {
  const R = REGIONS[src.region];
  const pcfg = S().patient.cfg;
  const cfg: PhantomConfig = R.test
    ? { habitus: 'medium', arms: 'up', implant: 'none', seed: 1, test: R.test }
    : { ...pcfg, test: undefined, arms: R.head ? 'down' : 'up', ...cfgOver };
  if (R.test) Object.assign(cfg, cfgOver);
  const isoYp = R.test ? 0 : R.head ? 18 : torsoAt(Math.min(900, Math.max(260, R.z)), 1)?.skin.cy ?? 10;
  const req: SliceRequest = {
    z: R.z,
    thickness: src.thickness,
    pitch: 1,
    rowWidth: 0.5,
    kVp: src.kVp,
    mAsEff: src.mAs,
    angularMod: false,
    kernel: src.kernel,
    recon: 'FBP',
    irLevel: 3,
    mar: false,
    dfov: 500,
    matrix: 256,
    reconCx: 0,
    reconCy: 0,
    isoXp: 0,
    isoYp,
    quality: 'fast',
    bowtie: R.head ? 'head' : 'body',
    focalLarge: false,
    timeS: null,
    seed: 11,
    ...over,
  };
  return { cfg, req };
}

let mainGen = 0;

/** Ana aşama verilerini hesapla; ardından iteratif rekonstrüksiyonu arka planda başlat. */
export async function runFormation(src: FormationSource = S().formation.src): Promise<void> {
  const gen = ++mainGen;
  setF({ src, status: 'running', msg: 'Fantom → sinogram → rekonstrüksiyon hesaplanıyor…' });
  const { cfg, req } = buildRequest(src);
  const fr: FormationRequest = { req, m: 320, progressive: true, iterative: null };
  try {
    const r = await getPool().run<FormationResult>({ type: 'formation', cfg, req: fr }, -20);
    if (gen !== mainGen) return;
    formationData.main = r;
    formationData.iter = null;
    setF({ status: 'done', msg: `Hesaplandı (${(r.ms / 1000).toFixed(1)} s) · ${r.geo.nv} görünüm × ${r.geo.nb} kanal`, ver: S().formation.ver + 1, iterStatus: 'idle' });
    void runIterative(S().formation.iterOpts);
  } catch (e) {
    if (gen !== mainGen) return;
    setF({ status: 'error', msg: 'Hesaplama hatası: ' + String(e).slice(0, 160) });
  }
}

let iterGen = 0;

/** Tam istatistiksel iteratif rekonstrüksiyon (aynı ham veri: aynı tohum ve parametreler). */
export async function runIterative(opts: IterOptions = S().formation.iterOpts): Promise<void> {
  const gen = ++iterGen;
  const src = S().formation.src;
  setF({ iterOpts: opts, iterStatus: 'running' });
  const { cfg, req } = buildRequest(src);
  const fr: FormationRequest = { req, m: 320, progressive: false, iterative: { ...opts, momentum: opts.momentum ?? opts.init === 'zero' } };
  try {
    const r = await getPool().run<FormationResult>({ type: 'formation', cfg, req: fr }, -15);
    if (gen !== iterGen) return;
    formationData.iter = r;
    setF({ iterStatus: 'done', iterVer: S().formation.iterVer + 1 });
  } catch (e) {
    if (gen !== iterGen) return;
    setF({ iterStatus: 'error' });
    console.error(e);
  }
}

/** Artefakt atlası girdisinin varyantlarını hesapla (paralel). */
export async function runAtlasEntry(id: string): Promise<void> {
  const a = ARTIFACTS.find((x) => x.id === id);
  if (!a) return;
  const st = S().formation;
  if (st.atlas[id] === 'running') return;
  setF({ atlas: { ...st.atlas, [id]: 'running' } });
  const src: FormationSource = { ...DEFAULT_SOURCE, ...a.base };
  try {
    const res = await Promise.all(
      a.variants.map((v) => {
        const { cfg, req } = buildRequest({ ...src, ...v.src }, v.req ?? {}, v.cfg ?? {});
        const fr: FormationRequest = { req, m: 320, progressive: false, iterative: v.iterative ? { ...DEFAULT_ITER, iters: 6, ...v.iterative } : null };
        return getPool()
          .run<FormationResult>({ type: 'formation', cfg, req: fr }, -12)
          .catch((e) => {
            console.error(e);
            return null;
          });
      }),
    );
    formationData.atlas.set(id, res);
    const cur = S().formation;
    setF({ atlas: { ...cur.atlas, [id]: res.some((r) => !r) ? 'error' : 'done' }, atlasVer: cur.atlasVer + 1 });
  } catch (e) {
    const cur = S().formation;
    setF({ atlas: { ...cur.atlas, [id]: 'error' } });
    console.error(e);
  }
}

export { DEFAULT_ITER };
