import { useApp } from '../../state/store';
import { machine } from '../../app/machine';
import { autoCenter, isBusy, moveToLandmark, patientCenterY } from '../../app/controller';
import { PROTOCOLS } from '../../sim/scan';
import { isoYp, TABLE_MAX_H, TABLE_MIN_H, TABLE_SCAN_MIN_H, T_LOAD, T_MAX, T_MIN } from '../../scene/dims';
import { Row, Section, Slider, Toggle } from '../controls';

export function PositionTab() {
  const { hw, patient, params, set } = useApp();
  const busy = isBusy();
  const off = patientCenterY() - isoYp(hw.tableH);
  const pr = PROTOCOLS.find((p) => p.id === params.protocolId);
  const good = Math.abs(off) < 8;
  return (
    <>
      <Section title="Masa">
        <Row label="Yükseklik">
          <Slider value={Math.round(hw.tableH * 1000)} min={TABLE_MIN_H * 1000} max={TABLE_MAX_H * 1000} step={1} unit="mm" disabled={busy} onChange={(v) => (machine.targetH = v / 1000)} />
        </Row>
        <Row label="Yatay pozisyon">
          <Slider value={Math.round(hw.tableT)} min={T_MIN} max={T_MAX} step={1} unit="mm" disabled={busy} onChange={(v) => (machine.targetT = v)} />
        </Row>
        <div className="hint">Masa pozisyonu = tarama düzlemindeki hasta z koordinatı (verteksten mm). Gantriye girmek için masa ≥ {TABLE_SCAN_MIN_H * 1000} mm olmalı (çarpışma kilidi).</div>
        <div className="btn-row">
          <button className="btn primary" disabled={busy || !patient.onTable} onClick={autoCenter}>
            ⇕ İzomerkeze yükselt
          </button>
          <button className="btn" disabled={busy || !patient.onTable} onClick={moveToLandmark}>
            ⇢ Referans: {pr?.landmark}
          </button>
          <button className="btn" disabled={busy} onClick={() => ((machine.targetT = T_LOAD), (machine.targetH = 0.52))}>
            ⇠ Yükleme pozisyonu
          </button>
        </div>
      </Section>
      <Section title="Hizalama (lazer)">
        <Row label="Lazerler">
          <Toggle value={hw.lasers} onChange={(v) => (machine.lasers = v)} label={hw.lasers ? 'Açık' : 'Kapalı'} />
        </Row>
        <div className="kv">
          <span>İzomerkezdeki hasta y</span>
          <span>{isoYp(hw.tableH).toFixed(0)} mm</span>
          <span>Hasta merkezi (bölge)</span>
          <span>{patientCenterY().toFixed(0)} mm</span>
          <span>Dikey merkezleme hatası</span>
          <span style={{ color: good ? 'var(--ok)' : 'var(--warn)' }}>
            {off > 0 ? '+' : ''}
            {off.toFixed(0)} mm
          </span>
        </div>
        <div className="hint">
          Koronal lazer hastanın yan yüzünde orta aksiller hattan geçmelidir. Hatalı dikey merkezleme papyon (bowtie) filtresi ile uyumsuzluğa yol açar: periferde gürültü artar,
          topogramda büyütme değişir ve yüzey dozu yükselir. Bu simülasyonda merkezleme hatası görüntüde hastanın kaymasına ve kenar gürültüsüne gerçekten yansır.
        </div>
        {!good && patient.onTable && <div className="warn">Hasta izomerkezde değil. “İzomerkeze yükselt” ile düzeltin veya bilinçli olarak etkisini inceleyin.</div>}
      </Section>
      <div className="btn-row">
        <button className="btn primary" disabled={!patient.onTable} onClick={() => set({ tab: 'topogram', step: 'topogram' })}>
          Sonraki: Topogram →
        </button>
      </div>
    </>
  );
}
