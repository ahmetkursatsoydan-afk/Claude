import { useApp } from '../../state/store';
import { acquireTopogram, isBusy } from '../../app/controller';
import { Progress, Row, Section, Seg, Slider } from '../controls';
import { TopogramPlanner } from './TopogramPlanner';
import { machine } from '../../app/machine';

export function TopogramTab() {
  const { topo, set, patient, hw } = useApp();
  const busy = isBusy();
  const up = (p: Partial<typeof topo>) => set({ topo: { ...topo, ...p } });
  const prog = topo.status === 'acquiring' ? Math.max(0, Math.min(1, (hw.tableT - topo.z0 + 20) / (topo.z1 - topo.z0 + 30))) : topo.status === 'done' ? 1 : 0;
  return (
    <>
      <Section title="Topogram (scout / surview)">
        <Row label="Projeksiyon">
          <Seg value={topo.view} disabled={busy} onChange={(v) => up({ view: v })} options={[{ v: 'AP', l: 'AP (0°)' }, { v: 'LAT', l: 'Lateral (90°)' }]} />
        </Row>
        <Row label="Başlangıç (z)">
          <Slider value={topo.z0} min={-300} max={1200} step={10} unit="mm" disabled={busy} onChange={(v) => up({ z0: Math.min(v, topo.z1 - 100) })} />
        </Row>
        <Row label="Bitiş (z)">
          <Slider value={topo.z1} min={-200} max={1700} step={10} unit="mm" disabled={busy} onChange={(v) => up({ z1: Math.max(v, topo.z0 + 100) })} />
        </Row>
        <Row label="Tüp gerilimi">
          <Seg value={topo.kVp} disabled={busy} onChange={(v) => up({ kVp: v })} options={[80, 100, 120, 140].map((v) => ({ v, l: `${v} kV` }))} />
        </Row>
        <Row label="Tüp akımı">
          <Slider value={topo.mA} min={10} max={100} step={5} unit="mA" disabled={busy} onChange={(v) => up({ mA: v })} />
        </Row>
        <div className="kv">
          <span>Uzunluk</span>
          <span>{(topo.z1 - topo.z0).toFixed(0)} mm</span>
          <span>Masa hızı</span>
          <span>150 mm/s</span>
          <span>Süre</span>
          <span>{((topo.z1 - topo.z0) / 150).toFixed(1)} s</span>
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn go big" disabled={busy || !patient.onTable || hw.tableH < 0.7} onClick={() => void acquireTopogram()}>
            ▶ Topogramı başlat
          </button>
        </div>
        {!patient.onTable && <div className="warn">Hasta masada değil.</div>}
        {patient.onTable && hw.tableH < 0.7 && <div className="warn">Masa çok alçak – “Konum” sekmesinden izomerkeze yükseltin.</div>}
        {topo.status !== 'none' && (
          <div style={{ marginTop: 6 }}>
            <Progress value={prog} xray={topo.status === 'acquiring'} />
          </div>
        )}
        <div className="hint">
          Topogramda tüp sabit durur (AP: 12 yönü), masa sabit hızla ilerler. Sinyal polikromatik geçirgenlik + Poisson gürültüsü + su sertleşme düzeltmesi ile hesaplanır.
          AP topogramdan her z için su-eşdeğer çap (Dw) çıkarılır ve otomatik tüp akımı modülasyonunda (ATCM) kullanılır.
        </div>
        {busy && topo.status === 'acquiring' && (
          <button className="btn danger" onClick={() => ((machine.driveSpeed = null), (machine.beam = 'off'))}>
            Durdur
          </button>
        )}
      </Section>
      {topo.status !== 'none' && (
        <Section title="Önizleme">
          <TopogramPlanner height={360} interactive={false} />
        </Section>
      )}
      {topo.status === 'done' && (
        <button className="btn primary" onClick={() => set({ tab: 'plan' })}>
          Sonraki: Tarama planı →
        </button>
      )}
    </>
  );
}
