/**
 * Fizik ve veri akışı görünümü: spektrum, zayıflatma, polikromatik etkiler, veri toplama
 * zinciri (fantom → sinogram → filtreli sinogram → görüntü), kernel MTF/NPS, ATCM/doz,
 * kontrast zaman eğrileri.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../state/store';
import { bowtieAlMm, effectiveEnergyFromHvl, filterSpectrum, hvlAl, meanEnergy, tubeSpectrum, type Spectrum } from '../../physics/spectrum';
import { massAtten, TISSUES, compositionToChannels, monoHU, type TissueId } from '../../physics/materials';
import { KERNELS, nps, systemMtf } from '../../physics/kernels';
import { compartmentConc } from '../../physics/contrast';
import { liveStore, seriesStore } from '../../app/data';
import { currentPlan, dwProfile } from '../../app/controller';
import { getPoly } from '../../sim/slice';
import { QUALITY } from '../../sim/protocol';
import { LineChart, SERIES } from './LineChart';

function specPts(s: Spectrum, norm: number): [number, number][] {
  return Array.from(s.energies, (e, i) => [e, s.photons[i] / norm] as [number, number]);
}

function GrayCanvas({ data, w, h, lo, hi, gamma = 1, height = 200, label }: { data: ArrayLike<number> | null; w: number; h: number; lo: number; hi: number; gamma?: number; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data) return;
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const id = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.round(255 * Math.pow(Math.max(0, Math.min(1, (data[i] - lo) / (hi - lo))), gamma));
      id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v;
      id.data[4 * i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }, [data, w, h, lo, hi, gamma]);
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <canvas ref={ref} style={{ width: '100%', height, imageRendering: 'auto', objectFit: 'contain' }} />
      <div className="hint" style={{ textAlign: 'center' }}>
        {label}
      </div>
    </div>
  );
}

export function PhysicsView() {
  const { params, activeSeries, series, topo, scan } = useApp();
  const meta = series.find((s) => s.id === activeSeries);
  const sd = activeSeries ? seriesStore.get(activeSeries) : null;
  const kVp = params.kVp;

  const spec = useMemo(() => {
    const s = tubeSpectrum(kVp);
    const water = filterSpectrum(s, 'water', 200);
    const edge = filterSpectrum(s, 'aluminum', bowtieAlMm('body', 200));
    const hvl = hvlAl(s);
    const max = Math.max(...s.photons);
    const cmp = [80, 100, 120, 140].map((k) => tubeSpectrum(k));
    const cmax = Math.max(...cmp[3].photons);
    return { s, water, edge, hvl, eEff: effectiveEnergyFromHvl(hvl), mean: meanEnergy(s), meanW: meanEnergy(water), max, cmp, cmax };
  }, [kVp]);

  const poly = useMemo(() => getPoly(kVp, 'body', 806, 0.62), [kVp]);
  const tissueRows: TissueId[] = ['fat', 'water', 'liver', 'muscle', 'grayMatter', 'whiteMatter', 'trabecularBone', 'corticalBone', 'lung'];

  const dbg = sd?.debug ?? liveStore.debug;
  const dbgHu = sd && sd.debugZ !== null ? sd.slices[sd.zs.indexOf(sd.debugZ)] : liveStore.hu;
  const dbgM = sd?.debug ? sd.m : liveStore.m;
  const plan = useMemo(() => currentPlan(), [params, topo.version, topo.status]);
  const dw = dwProfile();
  const det = QUALITY[params.quality].ds;

  return (
    <div className="physics">
      <div className="pcard">
        <h3>1 · X-ışını üretimi: tüp spektrumu ({kVp} kVp)</h3>
        <div className="sub">
          Kramers bremsstrahlung + W karakteristik çizgileri, 5.5 mm Al + 0.1 mm Cu filtrasyon. Ortalama enerji {spec.mean.toFixed(1)} keV · HVL {spec.hvl.toFixed(2)} mm Al · etkin enerji {spec.eEff.toFixed(1)} keV · 20 cm su sonrası ortalama {spec.meanW.toFixed(1)} keV (ışın sertleşmesi).
        </div>
        <LineChart
          xLabel="Enerji (keV)"
          yLabel="Göreli foton sayısı"
          xMin={10}
          xMax={150}
          yMin={0}
          series={[
            { name: 'Tüp çıkışı', color: SERIES[0], pts: specPts(spec.s, spec.max) },
            { name: '20 cm su sonrası', color: SERIES[1], pts: specPts(spec.water, Math.max(...spec.water.photons)) },
            { name: 'Papyon kenarı', color: SERIES[2], pts: specPts(spec.edge, Math.max(...spec.edge.photons)), dash: true },
          ]}
          vlines={[{ x: spec.mean, label: 'ort.' }]}
        />
        <div className="hint">Eğriler kendi maksimumlarına normalize edilmiştir: zayıflatıcı içinden geçen ışının ortalama enerjisi artar (sertleşme).</div>
      </div>

      <div className="pcard">
        <h3>kVp'nin tüp çıkışına etkisi</h3>
        <div className="sub">Aynı mAs'ta göreli foton akısı (filtrasyon sonrası). Çıkış ≈ kVp^2.5–3 ile artar; 80 kVp'de 120 kVp'ye göre ~3 kat az foton.</div>
        <LineChart
          xLabel="Enerji (keV)"
          yLabel="Foton / mAs (göreli)"
          xMin={10}
          xMax={150}
          yMin={0}
          series={spec.cmp.map((s, i) => ({ name: `${[80, 100, 120, 140][i]} kVp`, color: SERIES[i], pts: specPts(s, spec.cmax) }))}
        />
      </div>

      <div className="pcard">
        <h3>2 · Zayıflatma: kütle zayıflatma katsayıları μ/ρ(E)</h3>
        <div className="sub">NIST XCOM verileri. İyotun 33.2 keV K-kenarı, düşük kVp'de iyot kontrastının neden arttığını açıklar. Su-eşdeğer referans enerji (BHC sonrası) {poly.eRef.toFixed(1)} keV.</div>
        <LineChart
          xLabel="Enerji (keV)"
          yLabel="μ/ρ (cm²/g)"
          xLog
          yLog
          xMin={20}
          xMax={150}
          yMin={0.1}
          yMax={60}
          fmtY={(v) => (v >= 1 ? v.toFixed(0) : v.toFixed(1))}
          series={(['water', 'adipose', 'bone', 'iodine', 'titanium'] as const).map((m, i) => ({
            name: { water: 'Su', adipose: 'Yağ', bone: 'Kortikal kemik', iodine: 'İyot', titanium: 'Titanyum' }[m],
            color: SERIES[i],
            pts: Array.from({ length: 140 }, (_, k) => {
              const e = 20 + k;
              return [e, massAtten(m, e)] as [number, number];
            }),
          }))}
          vlines={[{ x: spec.mean, label: `ort. ${spec.mean.toFixed(0)} keV` }]}
        />
      </div>

      <div className="pcard">
        <h3>Bu kVp'de beklenen HU (monoenerjetik eşdeğer)</h3>
        <div className="sub">Etkin enerji {poly.eRef.toFixed(1)} keV'de doku HU değerleri. Gerçek görüntü değerleri ayrıca sertleşme, kısmi hacim ve gürültüden etkilenir.</div>
        <div className="kv" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
          <span style={{ color: 'var(--muted)' }}>Doku</span>
          <span>80 kVp</span>
          <span>{kVp} kVp</span>
          <span>140 kVp</span>
          {tissueRows.map((t) => {
            const ch = compositionToChannels(TISSUES[t].comp);
            const e80 = getPoly(80, 'body', 806, 0.62).eRef, e140 = getPoly(140, 'body', 806, 0.62).eRef;
            return [
              <span key={t + 'n'}>{TISSUES[t].label}</span>,
              <span key={t + 'a'}>{monoHU(ch, e80).toFixed(0)}</span>,
              <span key={t + 'b'} style={{ color: '#fff' }}>
                {monoHU(ch, poly.eRef).toFixed(0)}
              </span>,
              <span key={t + 'c'}>{monoHU(ch, e140).toFixed(0)}</span>,
            ];
          })}
          <span>İyot 10 mg/mL (kan)</span>
          <span>{monoHU([1.05, 0.007, 0.01, 0], getPoly(80, 'body', 806, 0.62).eRef).toFixed(0)}</span>
          <span style={{ color: '#fff' }}>{monoHU([1.05, 0.007, 0.01, 0], poly.eRef).toFixed(0)}</span>
          <span>{monoHU([1.05, 0.007, 0.01, 0], getPoly(140, 'body', 806, 0.62).eRef).toFixed(0)}</span>
        </div>
      </div>

      <div className="pcard wide">
        <h3>3 · Veri toplama ve rekonstrüksiyon zinciri {dbg ? `(z = ${(sd?.debugZ ?? liveStore.z).toFixed(0)} mm, ${meta?.name ?? 'canlı önizleme'})` : ''}</h3>
        <div className="sub">
          Sentetik fantom kesiti (kesit profili boyunca kısmi hacim) → paralel ışın izdüşümleri (Joseph) → polikromatik geçirgenlik + Poisson/elektronik gürültü → −ln(I/I₀) → su BHC → rampa×kernel filtresi → geri izdüşüm → HU.
        </div>
        {!dbg ? (
          <div className="empty" style={{ height: 120 }}>
            Bir tarama yapıldığında burada ara veri adımları gösterilir.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <GrayCanvas data={dbg.phantomPreview} w={dbg.phantomN} h={dbg.phantomN} lo={0} hi={2.4} gamma={0.8} label="Fantom (yoğunluk, 500 mm SFOV)" />
              <GrayCanvas data={dbg.sino} w={dbg.nb} h={dbg.nv} lo={0} hi={Math.max(1, maxOf(dbg.sino) * 0.95)} gamma={0.8} label={`Sinogram p = −ln(I/I₀)  (${dbg.nv} görünüm × ${dbg.nb} kanal)`} />
              <GrayCanvas data={dbg.filtered} w={dbg.nb} h={dbg.nv} lo={-0.15} hi={0.15} label={`Filtreli sinogram (${KERNELS[params.kernel].label})`} />
              <GrayCanvas data={dbgHu} w={dbgM} h={dbgM} lo={-160} hi={240} label="Rekonstrüksiyon (W400/L40)" />
            </div>
            <LineChart
              height={180}
              xLabel="Dedektör kanalı (s, mm)"
              yLabel="I / I₀"
              yMin={0}
              yMax={1.05}
              series={[
                { name: 'Gürültüsüz geçirgenlik', color: SERIES[0], pts: Array.from(dbg.transmissionView, (v, i) => [(i - (dbg.nb - 1) / 2) * dbg.ds, v] as [number, number]) },
                { name: 'Ölçülen (gürültülü)', color: SERIES[1], width: 1, pts: Array.from(dbg.sino.subarray(Math.floor(dbg.nv / 2) * dbg.nb, Math.floor(dbg.nv / 2 + 1) * dbg.nb), (v, i) => [(i - (dbg.nb - 1) / 2) * dbg.ds, Math.exp(-v)] as [number, number]) },
                { name: 'Papyon sonrası akı', color: SERIES[2], dash: true, pts: Array.from(dbg.fluxProfile, (v, i) => [(i - (dbg.nb - 1) / 2) * dbg.ds, v] as [number, number]) },
              ]}
            />
          </>
        )}
      </div>

      <div className="pcard">
        <h3>4 · Kernel: modülasyon transfer fonksiyonu (MTF)</h3>
        <div className="sub">Kernel penceresi × dedektör açıklığı × odak noktası (dedektör aralığı {det} mm). Keskin kernel uzaysal çözünürlüğü artırır, kenar aşması (overshoot) oluşturur.</div>
        <LineChart
          xLabel="Uzaysal frekans (lp/cm)"
          yLabel="MTF"
          xMin={0}
          xMax={16}
          yMin={0}
          series={Object.values(KERNELS).map((k, i) => ({
            name: k.label,
            color: SERIES[i],
            width: k.id === params.kernel ? 3 : 2,
            pts: Array.from({ length: 161 }, (_, j) => [j / 10, systemMtf(k, j / 10, det, 0.32)] as [number, number]),
          }))}
        />
      </div>

      <div className="pcard">
        <h3>Gürültü güç spektrumu (NPS) biçimi</h3>
        <div className="sub">NPS ∝ |f|·MTF². Yumuşak kernel gürültüyü düşük frekansa sıkıştırır (pürüzsüz doku), kemik kerneli yüksek frekanslı ince gren üretir. Toplam gürültü ∝ NPS altındaki alan.</div>
        <LineChart
          xLabel="Uzaysal frekans (lp/cm)"
          yLabel="NPS (göreli)"
          xMin={0}
          xMax={16}
          yMin={0}
          series={Object.values(KERNELS).map((k, i) => ({
            name: k.label,
            color: SERIES[i],
            pts: Array.from({ length: 161 }, (_, j) => [j / 10, nps(k, j / 10, det, 0.32)] as [number, number]),
          }))}
        />
      </div>

      <div className="pcard">
        <h3>5 · ATCM: tüp akımı z-modülasyonu</h3>
        <div className="sub">
          AP topogramdan su-eşdeğer çap (Dw) → mA(z) = mA_ref·e^(β(Dw−Dref)). {params.atcm ? 'ATCM açık.' : 'ATCM kapalı (sabit mA).'} CTDIvol {plan.ctdiVol.toFixed(1)} mGy · DLP {plan.dlp.toFixed(0)} mGy·cm · E ≈ {plan.effDose.toFixed(2)} mSv · SSDE {plan.ssde.toFixed(1)} mGy
        </div>
        {topo.status === 'done' ? (
          <LineChart xLabel="z (mm, verteksten)" yLabel="mA" yMin={0} series={[{ name: 'mA', color: SERIES[3], pts: plan.mACurve.slice().sort((a, b) => a.z - b.z).map((m) => [m.z, m.mA]) }]} endLabels={false} />
        ) : (
          <div className="empty" style={{ height: 120 }}>
            Topogram alındığında gösterilir.
          </div>
        )}
      </div>

      <div className="pcard">
        <h3>Su-eşdeğer çap (Dw) profili</h3>
        <div className="sub">AAPM Rapor 220 yöntemi: topogram satırı başına su-eşdeğer alan → çap. SSDE dönüşüm faktörünü ve ATCM'yi belirler.</div>
        {dw ? (
          <LineChart xLabel="z (mm)" yLabel="Dw (cm)" yMin={0} series={[{ name: 'Dw', color: SERIES[0], pts: Array.from(dw.dw, (v, i) => [dw.z0 + (i + 0.5) * dw.dz, v] as [number, number]) }]} endLabels={false} />
        ) : (
          <div className="empty" style={{ height: 120 }}>
            Topogram yok.
          </div>
        )}
      </div>

      <div className="pcard">
        <h3>6 · Kontrast zaman–yoğunlaşma eğrileri</h3>
        <div className="sub">
          120 kVp'de yaklaşık artış (1 mg I/mL ≈ 25 HU). {params.contrast ? `Plan: ${params.delay} s gecikme, tarama ${plan.scanTime.toFixed(1)} s.` : 'Kontrastsız plan.'}
        </div>
        <LineChart
          xLabel="Enjeksiyondan sonra süre (s)"
          yLabel="Artış (HU)"
          xMin={0}
          xMax={320}
          yMin={0}
          series={(
            [
              ['aorta', 'Aorta'],
              ['portal', 'Portal ven'],
              ['liver', 'Karaciğer'],
              ['kidneyCortex', 'Böbrek korteks'],
              ['kidneyMedulla', 'Böbrek medulla'],
              ['spleen', 'Dalak'],
            ] as const
          ).map(([c, l], i) => ({ name: l, color: SERIES[i], pts: Array.from({ length: 161 }, (_, k) => [k * 2, compartmentConc(c, k * 2) * 25] as [number, number]) }))}
          vlines={params.contrast ? [{ x: params.delay, label: 'tarama' }] : []}
        />
      </div>

      <div className="pcard">
        <h3>Modellenen artefaktlar ve fiziksel etkiler</h3>
        <div className="kv" style={{ gridTemplateColumns: '150px 1fr' }}>
          <span>Kuantum gürültüsü</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Işın başına Poisson (bileşik, enerji ağırlıklı NEQ) + elektronik gürültü; σ ∝ 1/√(mAs·kalınlık)</span>
          <span>Işın sertleşmesi</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Polikromatik spektrum; yalnız su düzeltmesi → kemikler arası koyu bantlar, kemik HU'su kVp'ye bağlı</span>
          <span>Kısmi hacim</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Düzlem içi kenar kaplaması + kesit profili boyunca z alt örnekleme</span>
          <span>Metal / foton açlığı</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Fe/Ti zayıflatması, düşük sayımlarda log kırpma → çizgiler; MAR (LI) seçeneği</span>
          <span>Kollar aşağıda</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Lateral yol uzar → foton açlığı çizgileri, ATCM ile mA ↑</span>
          <span>Kernel / IR</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Keskinlik–gürültü dengesi, kenar aşması; IR'de gürültü ↓ ama “plastik” doku</span>
          <span>Pitch / kalınlık</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Etkin mAs = mAs/pitch; SSP genişlemesi (yüksek pitch)</span>
          <span>Görünüm örneklemesi</span>
          <span style={{ textAlign: 'left', fontFamily: 'inherit' }}>Sonlu görünüm/kanal sayısı → periferik aliasing (“Hızlı” kalitede belirgin)</span>
        </div>
        <div className="hint">Not: {scan.status === 'idle' ? 'Henüz tarama yapılmadı.' : `Son seri: ${meta?.name ?? '-'}`}</div>
      </div>
    </div>
  );
}

function maxOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 3) if (a[i] > m) m = a[i];
  return m;
}
