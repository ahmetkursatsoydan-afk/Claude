import { useState } from 'react';
import { useApp } from '../../state/store';
import { retroRecon } from '../../app/controller';
import { KERNELS, type KernelId } from '../../physics/kernels';
import { Row, Section, Seg, Slider, Toggle } from '../controls';
import { seriesStore } from '../../app/data';

export function ReconTab() {
  const { activeSeries, series, set } = useApp();
  const src = activeSeries ? seriesStore.get(activeSeries) : null;
  const [o, setO] = useState({ thickness: 1, interval: 1, kernel: 'bone' as KernelId, recon: 'FBP' as 'FBP' | 'IR', irLevel: 3, mar: false, dfov: 360, matrix: 512 });
  const up = (p: Partial<typeof o>) => setO({ ...o, ...p });
  return (
    <>
      <Section title="Retrospektif rekonstrüksiyon">
        {!src ? (
          <div className="warn">Önce bir tarama yapın.</div>
        ) : (
          <>
            <div className="hint">
              Kaynak seri: <b>{series.find((s) => s.id === activeSeries)?.name}</b>. Aynı ham veri (aynı foton gürültüsü tohumu ve tarama planı) farklı kalınlık / kernel /
              algoritma ile yeniden yapılandırılır – gerçek konsollardaki gibi hastayı yeniden ışınlamadan.
            </div>
            <Row label="Kesit kalınlığı">
              <Slider value={o.thickness} min={0.5} max={10} step={0.5} unit="mm" onChange={(v) => up({ thickness: v, interval: v })} />
            </Row>
            <Row label="Aralık">
              <Slider value={o.interval} min={0.5} max={10} step={0.5} unit="mm" onChange={(v) => up({ interval: v })} />
            </Row>
            <Row label="Kernel">
              <Seg value={o.kernel} onChange={(v) => up({ kernel: v })} options={Object.values(KERNELS).map((k) => ({ v: k.id, l: k.label }))} />
            </Row>
            <Row label="Algoritma">
              <Seg value={o.recon} onChange={(v) => up({ recon: v })} options={[{ v: 'FBP', l: 'FBP' }, { v: 'IR', l: 'İteratif' }]} />
            </Row>
            {o.recon === 'IR' && (
              <Row label="IR seviyesi">
                <Slider value={o.irLevel} min={1} max={5} step={1} onChange={(v) => up({ irLevel: v })} />
              </Row>
            )}
            <Row label="MAR">
              <Toggle value={o.mar} onChange={(v) => up({ mar: v })} label={o.mar ? 'Açık' : 'Kapalı'} />
            </Row>
            <Row label="DFOV">
              <Slider value={o.dfov} min={100} max={500} step={5} unit="mm" onChange={(v) => up({ dfov: v })} />
            </Row>
            <Row label="Matris">
              <Seg value={o.matrix} onChange={(v) => up({ matrix: v })} options={[256, 512, 768, 1024].map((m) => ({ v: m, l: String(m) }))} />
            </Row>
            <div className="btn-row">
              <button className="btn primary" onClick={() => retroRecon(o)}>
                ⟳ Yeni seri oluştur
              </button>
              <button className="btn" onClick={() => setO({ ...o, thickness: src.params.thickness, interval: src.params.interval, kernel: src.params.kernel, recon: src.params.recon, irLevel: src.params.irLevel, mar: src.params.mar, dfov: src.params.dfov, matrix: src.params.matrix })}>
                Kaynaktan kopyala
              </button>
            </div>
          </>
        )}
      </Section>
      <Section title="Seriler">
        {series.length === 0 && <div className="hint">Henüz seri yok.</div>}
        {series.map((s) => (
          <div key={s.id} className={'series-item' + (s.id === activeSeries ? ' active' : '')} onClick={() => set({ activeSeries: s.id })}>
            <div className="t">{s.name}</div>
            <div className="d">
              {s.desc} · {s.nDone}/{s.nTotal}
            </div>
          </div>
        ))}
        {series.length > 0 && (
          <button className="btn primary" onClick={() => set({ view: 'viewer' })}>
            Görüntüleyicide aç →
          </button>
        )}
      </Section>
    </>
  );
}
