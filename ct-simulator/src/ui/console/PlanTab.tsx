import { useMemo } from 'react';
import { useApp } from '../../state/store';
import { currentPlan, isBusy, startScan } from '../../app/controller';
import { DETECTOR_CONFIGS, ROW_WIDTH, scatterSprEstimate } from '../../sim/scan';
import { KERNELS, mtfAt } from '../../physics/kernels';
import { CONTRAST_PHASES } from '../../physics/contrast';
import { QUALITY } from '../../sim/protocol';
import { Row, Section, Seg, Select, Slider, Stat, Toggle } from '../controls';
import { TopogramPlanner } from './TopogramPlanner';

export function PlanTab() {
  const { params: p, setParams, topo, set } = useApp();
  const busy = isBusy();
  const plan = useMemo(() => currentPlan(), [p, topo.version, topo.status]);
  const k = KERNELS[p.kernel];
  return (
    <>
      <Section title="Topogram üzerinde planlama">
        {topo.status === 'done' ? <TopogramPlanner height={430} /> : <div className="warn">Önce topogram alın (3. sekme).</div>}
        <div className="row" style={{ marginTop: 6 }}>
          <label>Tarama aralığı</label>
          <div className="grow kv" style={{ gridTemplateColumns: 'auto auto auto auto' }}>
            <span>z başl.</span>
            <span>{Math.min(p.scanStart, p.scanEnd)} mm</span>
            <span>z son</span>
            <span>{Math.max(p.scanStart, p.scanEnd)} mm</span>
          </div>
        </div>
        <Row label="Tarama yönü">
          <Seg
            value={p.direction}
            disabled={busy}
            onChange={(v) => setParams({ direction: v })}
            options={[
              { v: 'cc', l: 'Kraniokaudal ↓' },
              { v: 'caudocranial', l: 'Kaudokranial ↑' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Veri toplama (akuizisyon)">
        <Row label="Tüp gerilimi" title="kVp: spektrumun maksimum enerjisi. Düşük kVp → iyot/kemik kontrastı ↑, gürültü ↑, doz ↓">
          <Slider value={p.kVp} min={70} max={150} step={10} unit="kVp" disabled={busy} onChange={(v) => setParams({ kVp: v })} />
        </Row>
        <Row label={p.atcm ? 'Ref. mAs (rot.)' : 'mAs (rotasyon)'} title="Rotasyon başına tüp akımı × süre. Etkin mAs = mAs / pitch">
          <Slider value={p.mAs} min={10} max={800} step={5} unit="mAs" log disabled={busy} onChange={(v) => setParams({ mAs: v })} />
        </Row>
        <Row label="ATCM" title="Otomatik tüp akımı modülasyonu: topogramdan z yönünde, projeksiyonlardan açısal">
          <Toggle value={p.atcm} disabled={busy} onChange={(v) => setParams({ atcm: v })} label={p.atcm ? 'Açık (z + açısal)' : 'Kapalı (sabit mA)'} />
        </Row>
        <Row label="Rotasyon süresi">
          <Slider value={p.rotTime} min={0.25} max={1} step={0.01} unit="s" disabled={busy} onChange={(v) => setParams({ rotTime: v })} />
        </Row>
        <Row label="Pitch">
          <Slider value={p.pitch} min={0.5} max={1.5} step={0.01} disabled={busy} onChange={(v) => setParams({ pitch: v })} />
        </Row>
        <Row label="Kolimasyon">
          <Seg value={p.rows} disabled={busy} onChange={(v) => setParams({ rows: v })} options={DETECTOR_CONFIGS.map((r) => ({ v: r, l: `${r}×${ROW_WIDTH}` }))} />
        </Row>
        <Row label="Saçılma düzeltmesi" title="Geniş kolimasyonda saçılan fotonlar dedektöre ulaşır: HU düşmesi, kupa ve koyu bantlar. Model tabanlı düzeltme saçılma tahminini çıkarır (gürültü biraz artar).">
          <Toggle value={p.scatterCorr} disabled={busy} onChange={(v) => setParams({ scatterCorr: v })} label={`${p.scatterCorr ? 'Açık' : 'Kapalı'} · SPR ≈ ${scatterSprEstimate(plan.collimation).toFixed(2)}`} />
        </Row>
      </Section>

      <Section title="Rekonstrüksiyon">
        <Row label="Kesit kalınlığı">
          <Slider value={p.thickness} min={0.5} max={10} step={0.5} unit="mm" disabled={busy} onChange={(v) => setParams({ thickness: v, interval: v })} />
        </Row>
        <Row label="Aralık (increment)">
          <Slider value={p.interval} min={0.5} max={10} step={0.5} unit="mm" disabled={busy} onChange={(v) => setParams({ interval: v })} />
        </Row>
        <Row label="Kernel">
          <Seg value={p.kernel} disabled={busy} onChange={(v) => setParams({ kernel: v })} options={Object.values(KERNELS).map((kk) => ({ v: kk.id, l: kk.label, title: kk.vendorLike }))} />
        </Row>
        <Row label="Algoritma">
          <Seg value={p.recon} disabled={busy} onChange={(v) => setParams({ recon: v })} options={[{ v: 'FBP', l: 'FBP' }, { v: 'IR', l: 'İteratif (hibrit)' }]} />
        </Row>
        {p.recon === 'IR' && (
          <Row label="IR seviyesi">
            <Slider value={p.irLevel} min={1} max={5} step={1} disabled={busy} onChange={(v) => setParams({ irLevel: v })} />
          </Row>
        )}
        <Row label="Metal artefakt azaltma">
          <Toggle value={p.mar} disabled={busy} onChange={(v) => setParams({ mar: v })} label={p.mar ? 'MAR açık (LI)' : 'Kapalı'} />
        </Row>
        <Row label="Rekon FOV (DFOV)">
          <Slider value={p.dfov} min={100} max={500} step={5} unit="mm" disabled={busy} onChange={(v) => setParams({ dfov: v })} />
        </Row>
        <Row label="Matris">
          <Seg value={p.matrix} disabled={busy} onChange={(v) => setParams({ matrix: v })} options={[256, 512, 768, 1024].map((m) => ({ v: m, l: String(m) }))} />
        </Row>
        <Row label="Simülasyon kalitesi" title="Fantom ızgarası, dedektör kanal aralığı ve görünüm sayısı. Yüksek kalite daha yavaştır.">
          <Seg value={p.quality} disabled={busy} onChange={(v) => setParams({ quality: v })} options={(Object.keys(QUALITY) as (keyof typeof QUALITY)[]).map((q) => ({ v: q, l: QUALITY[q].label }))} />
        </Row>
        <div className="hint">
          Piksel {(p.dfov / p.matrix).toFixed(2)} mm · kernel MTF50 ≈ {mtfAt(k, 0.5, QUALITY[p.quality].ds, plan.focalLarge ? 0.54 : 0.32).toFixed(1)} lp/cm · MTF10 ≈ {mtfAt(k, 0.1, QUALITY[p.quality].ds, plan.focalLarge ? 0.54 : 0.32).toFixed(1)} lp/cm
        </div>
      </Section>

      <Section title="Kontrast madde">
        <Row label="İV kontrast">
          <Toggle value={p.contrast} disabled={busy} onChange={(v) => setParams({ contrast: v })} label={p.contrast ? 'Kontrastlı' : 'Kontrastsız'} />
        </Row>
        {p.contrast && (
          <>
            <Row label="Faz">
              <Select value={p.phaseId} disabled={busy} options={CONTRAST_PHASES.map((ph) => ({ v: ph.id, l: ph.label }))} onChange={(v) => setParams({ phaseId: v, delay: CONTRAST_PHASES.find((x) => x.id === v)!.delay })} />
            </Row>
            <Row label="Tarama gecikmesi">
              <Slider value={p.delay} min={10} max={400} step={1} unit="s" disabled={busy} onChange={(v) => setParams({ delay: v })} />
            </Row>
            <div className="hint">Her kesit, masanın o z'ye ulaştığı gerçek zamanda örneklenir: tarama süresi ve yönü kontrast fazını etkiler. 100 mL · 350 mgI/mL · 4 mL/s.</div>
          </>
        )}
      </Section>

      <Section title="Plan özeti ve doz tahmini">
        <div className="stat-grid">
          <Stat label="CTDIvol" value={plan.ctdiVol.toFixed(1)} unit="mGy" />
          <Stat label="DLP" value={plan.dlp.toFixed(0)} unit="mGy·cm" />
          <Stat label="Etkin doz" value={plan.effDose.toFixed(2)} unit="mSv" />
          <Stat label="SSDE" value={plan.ssde.toFixed(1)} unit="mGy" />
          <Stat label="Süre" value={plan.scanTime.toFixed(1)} unit="s" />
          <Stat label="Görüntü" value={plan.slices.length} />
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span>Bölge / CTDI fantomu</span>
          <span>
            {plan.region} / {plan.dosePhantom === 'head16' ? '16 cm' : '32 cm'}
          </span>
          <span>Tüp akımı (nominal)</span>
          <span>
            {plan.mAnominal.toFixed(0)} mA (maks {plan.mAmax.toFixed(0)})
          </span>
          <span>Etkin mAs</span>
          <span>{plan.mAsEffNominal.toFixed(0)}</span>
          <span>Odak noktası</span>
          <span>{plan.focalLarge ? 'Büyük (1.2 mm)' : 'Küçük (0.7 mm)'}</span>
          <span>Kolimasyon / masa beslemesi</span>
          <span>
            {plan.collimation.toFixed(0)} mm / {plan.feed.toFixed(1)} mm/rot
          </span>
          <span>Masa hızı</span>
          <span>{plan.tableSpeed.toFixed(0)} mm/s</span>
          <span>Aşırı tarama (z-overscan)</span>
          <span>{plan.overrange.toFixed(0)} mm</span>
          <span>Papyon filtresi</span>
          <span>{plan.bowtie === 'head' ? 'Baş' : 'Gövde'}</span>
          <span>Ortalama Dw</span>
          <span>{plan.dwMean.toFixed(1)} cm</span>
        </div>
        {plan.warnings.map((w, i) => (
          <div className="warn" key={i}>
            {w}
          </div>
        ))}
      </Section>
      <button className="btn go big" disabled={busy || topo.status !== 'done'} onClick={() => (set({ tab: 'scan' }), void startScan())}>
        ☢ TARAMAYI BAŞLAT
      </button>
    </>
  );
}
