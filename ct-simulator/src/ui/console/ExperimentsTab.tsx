import { useApp } from '../../state/store';
import { EXPERIMENTS, cancelExperiment, experimentSeriesAvailable, runExperiment } from '../../app/experiments';
import { isBusy } from '../../app/controller';
import { openCompare } from '../../viewer/compare';
import { Section } from '../controls';

export function ExperimentsTab() {
  const exp = useApp((s) => s.exp);
  useApp((s) => s.scan.status);
  useApp((s) => s.topo.status);
  const set = useApp((s) => s.set);
  const busy = isBusy() || exp.status === 'running';
  const running = exp.status === 'running' ? EXPERIMENTS.find((e) => e.id === exp.id) : null;
  return (
    <>
      <Section title="Rehberli fizik deneyleri">
        <div className="hint" style={{ marginTop: 0 }}>
          Her deney yalnızca <b>bir</b> parametreyi değiştirerek iki seri (A/B) üretir ve görüntüleyicide senkron yan yana karşılaştırma açar. Hasta hazırlığı, topogram,
          taramalar ve rekonstrüksiyon otomatik yürür; 3B odada izleyebilirsiniz. Yalnızca rekonstrüksiyonu değişen deneylerde B serisi aynı ham veriden üretilir (ek doz yok).
        </div>
        {running && (
          <div className="exp-run">
            <div className="t">🧪 {running.title}</div>
            <div className="s">{exp.step}</div>
            <button className="btn danger sm" onClick={cancelExperiment}>
              Deneyi iptal et
            </button>
          </div>
        )}
        {exp.status === 'error' && <div className="warn">{exp.step}</div>}
      </Section>
      {EXPERIMENTS.map((e) => {
        const done = exp.id === e.id && exp.status === 'done' && experimentSeriesAvailable(exp.series);
        return (
          <div key={e.id} className={'exp-card' + (exp.id === e.id && exp.status === 'running' ? ' running' : '')}>
            <div className="h">
              <span className="title">{e.title}</span>
              <span className="var">{e.variable}</span>
            </div>
            <div className="goal">{e.goal}</div>
            <div className="ab">
              <span className="a">A</span> {e.variants[0].label}
              <span className="b">B</span> {e.variants[1].label}
            </div>
            <div className="btn-row">
              <button className="btn primary sm" disabled={busy} onClick={() => void runExperiment(e.id)}>
                ▶ Çalıştır
              </button>
              {done && (
                <button
                  className="btn sm"
                  onClick={() => {
                    set({ view: 'viewer' });
                    openCompare(exp.series[0], exp.series[1], e.window.ww, e.window.wl, { title: e.title, points: e.observe }, e.orientation ?? 'axial', e.focusZ);
                  }}
                >
                  ◫ Karşılaştırmayı aç
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="hint">
        Kendi serilerinizi karşılaştırmak için: Görüntüleyici → ◫ Karşılaştır, ardından seri listesinden etkin pencereye seri seçin. “⛓ Senkron” açıkken kesit konumu, W/L,
        yakınlaştırma ve ROI/ölçümler iki pencerede eşlenir.
      </div>
    </>
  );
}
