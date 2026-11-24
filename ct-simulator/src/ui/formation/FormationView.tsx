/**
 * "Görüntü Oluşumu" gezgini: bir BT kesitinin X-ışınından görüntüye nasıl oluştuğunu adım adım
 * gösterir (aynı fizik motoruyla hesaplanan gerçek ara veriler), iteratif rekonstrüksiyonu ve
 * artefaktların nasıl oluştuğunu açıklar.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../../state/store';
import { REGIONS, runFormation, formationData, type FormationRegion, type FormationSource } from '../../app/formation';
import type { ChainStep } from '../../app/artifactAtlas';
import { KERNELS, type KernelId } from '../../physics/kernels';
import { Seg, Select, Slider } from '../controls';
import { PipelineMap } from './common';
import { StageOverview } from './stages/StageOverview';
import { StageObject } from './stages/StageObject';
import { StageBeam } from './stages/StageBeam';
import { StageProjection } from './stages/StageProjection';
import { StageSinogram } from './stages/StageSinogram';
import { StageCounts } from './stages/StageCounts';
import { StagePreprocess } from './stages/StagePreprocess';
import { StageBackprojection } from './stages/StageBackprojection';
import { StageFilter } from './stages/StageFilter';
import { StageFbp } from './stages/StageFbp';
import { StageDisplay } from './stages/StageDisplay';
import { StageIterative } from './stages/StageIterative';
import { StageArtifacts } from './stages/StageArtifacts';
import './formation.css';

export interface StageDef {
  id: string;
  title: string;
  short: string;
  chain: ChainStep[];
  Comp: () => JSX.Element;
}

export const STAGES: StageDef[] = [
  { id: 'overview', title: 'Genel bakış: BT görüntüsü nasıl oluşur?', short: 'Genel bakış', chain: [], Comp: StageOverview },
  { id: 'object', title: 'Nesne: zayıflatma katsayısı haritası μ(x, y)', short: 'Nesne (μ)', chain: ['patient'], Comp: StageObject },
  { id: 'beam', title: 'X-ışını demeti: spektrum ve papyon filtresi', short: 'X-ışını demeti', chain: ['tube'], Comp: StageBeam },
  { id: 'projection', title: 'Tek projeksiyon: Beer–Lambert yasası', short: 'Tek projeksiyon', chain: ['patient', 'detector'], Comp: StageProjection },
  { id: 'sinogram', title: 'Sinogram: tüm açılardan projeksiyonlar', short: 'Sinogram', chain: ['sampling'], Comp: StageSinogram },
  { id: 'counts', title: 'Foton sayımı ve kuantum gürültüsü', short: 'Sayım ve gürültü', chain: ['detector'], Comp: StageCounts },
  { id: 'preproc', title: 'Ön işleme: log dönüşümü ve ışın sertleşmesi düzeltmesi', short: 'Log + sertleşme', chain: ['preproc'], Comp: StagePreprocess },
  { id: 'backproj', title: 'Basit (filtresiz) geri izdüşüm', short: 'Geri izdüşüm', chain: ['recon'], Comp: StageBackprojection },
  { id: 'filter', title: 'Filtreleme: rampa filtresi × kernel', short: 'Filtreleme', chain: ['recon'], Comp: StageFilter },
  { id: 'fbp', title: 'Filtreli geri izdüşüm (FBP): görüntü açı açı oluşur', short: 'FBP', chain: ['recon'], Comp: StageFbp },
  { id: 'display', title: 'Hounsfield birimi ve pencereleme', short: 'HU ve pencere', chain: ['display'], Comp: StageDisplay },
  { id: 'iterative', title: 'İteratif rekonstrüksiyon: tahmin et – karşılaştır – düzelt', short: 'İteratif rekon', chain: ['recon'], Comp: StageIterative },
  { id: 'artifacts', title: 'Artefaktlar nasıl oluşur?', short: 'Artefakt atlası', chain: [], Comp: StageArtifacts },
];

function SourceBar() {
  const src = useApp((s) => s.formation.src);
  const status = useApp((s) => s.formation.status);
  const msg = useApp((s) => s.formation.msg);
  const iterStatus = useApp((s) => s.formation.iterStatus);
  const timer = useRef<number | null>(null);
  const change = (p: Partial<FormationSource>) => {
    const next = { ...src, ...p };
    if (p.region) {
      const R = REGIONS[p.region];
      if (R.head && src.mAs < 200) next.mAs = 300;
      if (!R.head && !REGIONS[src.region].head) next.mAs = src.mAs;
      if (!R.head && REGIONS[src.region].head) next.mAs = 150;
    }
    useApp.getState().set({ formation: { ...useApp.getState().formation, src: next } });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runFormation(next), 450);
  };
  return (
    <div className="fx-src">
      <div className="g">
        <label>Kaynak</label>
        <Select value={src.region} options={(Object.keys(REGIONS) as FormationRegion[]).map((k) => ({ v: k, l: REGIONS[k].label }))} onChange={(v) => change({ region: v })} />
      </div>
      <div className="g">
        <label>kVp</label>
        <Seg value={src.kVp} options={[80, 100, 120, 140].map((v) => ({ v, l: String(v) }))} onChange={(v) => change({ kVp: v })} />
      </div>
      <div className="g wide">
        <label>Etkin mAs</label>
        <Slider value={src.mAs} min={10} max={600} step={5} log onChange={(v) => change({ mAs: v })} />
      </div>
      <div className="g">
        <label>Kernel</label>
        <Seg value={src.kernel} options={(Object.keys(KERNELS) as KernelId[]).map((k) => ({ v: k, l: KERNELS[k].label }))} onChange={(v) => change({ kernel: v })} />
      </div>
      <div className="g">
        <label>Kesit</label>
        <Seg value={src.thickness} options={[1, 2.5, 5, 10].map((v) => ({ v, l: `${v} mm` }))} onChange={(v) => change({ thickness: v })} />
      </div>
      <button className="btn primary sm" disabled={status === 'running'} onClick={() => void runFormation(src)}>
        {status === 'running' ? 'Hesaplanıyor…' : '⟳ Hesapla'}
      </button>
      <span className={'fx-status ' + status}>
        {msg}
        {iterStatus === 'running' && ' · iteratif rekon arka planda hesaplanıyor…'}
      </span>
    </div>
  );
}

export function FormationView() {
  const stage = useApp((s) => s.formation.stage);
  const status = useApp((s) => s.formation.status);
  const set = useApp((s) => s.set);
  const main = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    const st = useApp.getState();
    set({ formation: { ...st.formation, stage: Math.max(0, Math.min(STAGES.length - 1, i)) } });
    main.current?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!formationData.main && status === 'idle') void runFormation();
  }, [status]);
  const S = STAGES[stage] ?? STAGES[0];
  const Comp = S.Comp;
  return (
    <div className="fx">
      <SourceBar />
      <div className="fx-body">
        <nav className="fx-steps" aria-label="Aşamalar">
          {STAGES.map((s, i) => (
            <button key={s.id} className={'fx-step' + (i === stage ? ' on' : '')} onClick={() => go(i)} title={s.title}>
              <span className="n">{i}</span>
              <span className="t">{s.short}</span>
            </button>
          ))}
          <div className="fx-steps-note">Eğitim amaçlı simülasyon · sentetik nesne · ana tarama zinciriyle aynı fizik modeli</div>
        </nav>
        <main className="fx-main" ref={main}>
          <header className="fx-head">
            <div className="crumb">
              Aşama {stage} / {STAGES.length - 1}
            </div>
            <h2>{S.title}</h2>
            {S.chain.length > 0 && <PipelineMap highlight={S.chain} compact />}
          </header>
          <div className="fx-content" key={S.id}>
            <Comp />
          </div>
          <footer className="fx-nav">
            <button className="btn" disabled={stage === 0} onClick={() => go(stage - 1)}>
              ← {stage > 0 ? STAGES[stage - 1].short : ''}
            </button>
            <button className="btn primary" disabled={stage === STAGES.length - 1} onClick={() => go(stage + 1)}>
              {stage < STAGES.length - 1 ? STAGES[stage + 1].short : ''} →
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
