import { useMemo } from 'react';
import { useApp } from '../../state/store';
import { abortScan, currentPlan, isBusy, skipContrastWait, startScan } from '../../app/controller';
import { Progress, Section, Stat } from '../controls';
import { LiveDataPanel } from './LiveDataPanel';
import { liveStore } from '../../app/data';
import { getPool } from '../../sim/pool';

export function ScanTab() {
  const { scan, params: p, topo, set, log, series } = useApp();
  const busy = isBusy();
  const plan = useMemo(() => currentPlan(), [p, topo.version, topo.status]);
  const scanning = scan.status === 'scanning';
  const active = series.find((s) => s.id === scan.reconSeriesId);
  return (
    <>
      <Section title="Tarama kontrolü" right={scanning ? <span style={{ color: 'var(--xray)' }}>● X-IŞINI</span> : null}>
        {!busy ? (
          <button className="btn go big" disabled={topo.status !== 'done'} onClick={() => void startScan()}>
            ☢ TARAMAYI BAŞLAT
          </button>
        ) : (
          <button className="btn danger big" onClick={abortScan}>
            ■ ACİL DURDURMA
          </button>
        )}
        {topo.status !== 'done' && <div className="warn">Topogram ve plan gerekli.</div>}
        <div style={{ margin: '8px 0 4px', fontWeight: 600 }}>{scan.message || 'Hazır'}</div>
        {scan.status === 'waiting' && (
          <div className="btn-row">
            <button className="btn sm" onClick={skipContrastWait}>
              ⏭ Gecikmeyi atla (zaman sıkıştırma)
            </button>
            <span className="hint">Simülasyonda kontrast zamanlaması nominal gecikmeye göre hesaplanır.</span>
          </div>
        )}
        <div className="hint">Veri toplama</div>
        <Progress value={scan.progress} xray={scanning} />
        <div className="hint" style={{ marginTop: 6 }}>
          Rekonstrüksiyon {scan.reconDone}/{scan.reconTotal} {scan.slicesPerSec > 0 ? `· ${scan.slicesPerSec.toFixed(1)} görüntü/s` : ''}
        </div>
        <Progress value={scan.reconTotal ? scan.reconDone / scan.reconTotal : 0} />
        <div className="hint">
          Hesaplama: {getPool().usingWorkers ? `${getPool().size} web worker` : 'ana iş parçacığı'} · {liveStore.stats?.accel ?? '—'}
        </div>
        <div className="stat-grid" style={{ marginTop: 8 }}>
          <Stat label="kV" value={p.kVp} />
          <Stat label="mA (anlık)" value={scanning ? scan.currentmA.toFixed(0) : plan.mAnominal.toFixed(0)} />
          <Stat label="Rotasyon" value={p.rotTime} unit="s" />
          <Stat label="Masa z" value={scan.currentZ.toFixed(0)} unit="mm" />
          <Stat label="Süre" value={scan.t.toFixed(1)} unit={`/ ${plan.scanTime.toFixed(1)} s`} />
          <Stat label="DLP" value={scan.dlpAccum.toFixed(0)} unit="mGy·cm" />
        </div>
        {(scan.status === 'done' || (active && active.nDone > 0)) && (
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => set({ view: 'viewer' })}>
            🖼 Görüntüleri incele →
          </button>
        )}
      </Section>
      <Section title="Canlı veri akışı (X-ışını → zayıflama → dedektör → rekonstrüksiyon)">
        <LiveDataPanel />
      </Section>
      <Section title="Olay kaydı">
        <div className="log">
          {log
            .slice()
            .reverse()
            .map((l, i) => (
              <div key={i} className={l.level}>
                {new Date(l.t).toLocaleTimeString('tr-TR')} {l.text}
              </div>
            ))}
        </div>
      </Section>
    </>
  );
}
