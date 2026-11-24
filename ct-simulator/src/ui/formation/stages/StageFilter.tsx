/**
 * Görüntü oluşumu gezgini – aşama 8: Filtreleme (rampa filtresi × kernel apodizasyon penceresi).
 * Frekans yanıtları, uzaysal Ram-Lak çekirdeği, tek projeksiyonun filtre öncesi/sonrası ve
 * filtrelenmiş sinogramın tamamı (motorun gerçek q verisi).
 */
import { useMemo, useState } from 'react';
import { useApp } from '../../../state/store';
import { KERNELS, kernelWindow, type KernelId } from '../../../physics/kernels';
import { LineChart, type ChartSeries } from '../../physics/LineChart';
import { Slider } from '../../controls';
import { useFormation, NeedData, ImageView, ColorBar, Explain, Points, Formula, Figure, StatChip, SERIES, autoWindow, sinoRow, toPts, binToMm } from '../common';

const KIDS: KernelId[] = ['soft', 'lung', 'bone'];
const KCOL: Record<KernelId, string> = { soft: SERIES[2], lung: SERIES[3], bone: SERIES[1] };

export function StageFilter() {
  const { main, status } = useFormation();
  const kernel = useApp((s) => s.formation.src.kernel);
  const [view, setView] = useState(0);

  // --- frekans yanıtları (0 … Nyquist) + kaba gürültü indeksi
  const freq = useMemo(() => {
    if (!main) return null;
    const ds = main.rgeo.ds;
    const fN = 10 / (2 * ds); // lp/cm
    const N = 160;
    const ramp: [number, number][] = [];
    const kern: Record<KernelId, [number, number][]> = { soft: [], lung: [], bone: [] };
    // gürültü varyansı ∝ ∫ |f|·(|f|W)² ... 2B: NPS(f) ∝ |f|·W²(f), varyans ∝ ∫ NPS·2πf df ∝ ∫ f²W² df
    const noiseInt: Record<KernelId, number> = { soft: 0, lung: 0, bone: 0 };
    const area: Record<KernelId, number> = { soft: 0, lung: 0, bone: 0 };
    for (let i = 0; i <= N; i++) {
      const f = (i / N) * fN;
      ramp.push([f, f / fN]);
      for (const k of KIDS) {
        const w = kernelWindow(KERNELS[k], f);
        kern[k].push([f, (f / fN) * w]);
        const wt = i === 0 || i === N ? 0.5 : 1;
        noiseInt[k] += wt * f * f * w * w;
        area[k] += wt * (f / fN) * w;
      }
    }
    const rel: Record<KernelId, number> = { soft: 1, lung: 1, bone: 1 };
    for (const k of KIDS) rel[k] = Math.sqrt(noiseInt[k] / noiseInt.soft);
    for (const k of KIDS) area[k] /= N; // ∫₀¹ (f/f_N)·W df/f_N  (ideal rampa = 0.5)
    return { fN, ramp, kern, rel, area };
  }, [main]);

  // --- uzaysal Ram-Lak çekirdeği h(n)·ds²
  const ramLak = useMemo(() => {
    const pts: [number, number][] = [];
    for (let n = -8; n <= 8; n++) {
      const v = n === 0 ? 0.25 : n % 2 !== 0 ? -1 / (n * n * Math.PI * Math.PI) : 0;
      pts.push([n, v]);
    }
    return pts;
  }, []);

  // --- filtrelenmiş sinogram: simetrik görüntüleme aralığı
  const qRange = useMemo(() => {
    if (!main) return 1;
    const a = autoWindow(main.q, 0.01, 0.99);
    return Math.max(Math.abs(a.lo), Math.abs(a.hi)) || 1;
  }, [main]);

  // --- seçilen görünümün profilleri
  const rows = useMemo(() => {
    if (!main) return null;
    const { nv, nb, ds } = main.rgeo;
    const v = Math.max(0, Math.min(nv - 1, view));
    const p = sinoRow(main.p, nb, v);
    const q = sinoRow(main.q, nb, v);
    const x = (b: number) => binToMm(b, nb, ds);
    let pMax = 0, qMax = 0, qMin = 0;
    for (let b = 0; b < nb; b++) {
      pMax = Math.max(pMax, p[b]);
      qMax = Math.max(qMax, q[b]);
      qMin = Math.min(qMin, q[b]);
    }
    const sc = pMax > 0 ? qMax / pMax : 1;
    const pScaled: [number, number][] = [];
    for (let b = 0; b < nb; b++) pScaled.push([x(b), p[b] * sc]);
    return { v, theta: (v * 180) / nv, p: toPts(p, x), q: toPts(q, x), pScaled, qMin, qMax };
  }, [main, view]);

  if (!main || !freq || !rows) return <NeedData status={status} />;
  const { nv, nb, ds } = main.rgeo;
  const K = KERNELS[kernel];

  const fSeries: ChartSeries[] = [
    { name: 'İdeal rampa |f|', color: SERIES[0], pts: freq.ramp, dash: true, width: 1.5 },
    ...KIDS.map((k) => ({ name: `|f|·W(f) – ${KERNELS[k].label}`, color: KCOL[k], pts: freq.kern[k], width: k === kernel ? 3.5 : 1.5 })),
  ];

  return (
    <>
      <Explain title="Neden filtre? Basit geri izdüşümün bulanıklığını geri almak">
        <p>
          Önceki aşamada (filtresiz geri izdüşüm) her projeksiyonu geldiği yön boyunca görüntüye “sürdük”. Bu işlem merkezdeki düşük
          frekansları fazla, ince ayrıntıları (yüksek frekansları) az ağırlıklandırır: sonuç, her noktanın etrafına 1/r biçimli bir hale
          yayılmış bulanık bir görüntüdür (frekans uzayında 1/|f| ağırlık). Geri izdüşümden <b>önce</b> her projeksiyon |f| ile çarpılırsa
          (rampa filtresi) bu fazla ağırlık tam olarak dengelenir.
        </p>
        <p>
          Saf rampa, gürültünün yoğun olduğu yüksek frekansları da en çok yükseltir. Bu yüzden rampa bir <b>apodizasyon penceresi</b> W(f)
          ile çarpılır – klinikte “kernel” ya da “filtre” denen şey budur. Yumuşak doku kernelinde W yüksek frekansları bastırır (daha
          düzgün, az gürültülü görüntü); kemik/akciğer kernelleri ise orta-yüksek frekansları bir miktar <i>yükseltir</i> (keskin kenar,
          fazla gürültü). Kernel seçimi, rekonstrüksiyonda uzaysal çözünürlük ile gürültü arasındaki temel ayar düğmesidir (bkz. Fizik &amp;
          Veri: MTF ve NPS).
        </p>
      </Explain>

      <Formula note="P_θ(f): θ açısındaki projeksiyonun 1B Fourier dönüşümü; |f|: rampa; W(f): kernel penceresi; Q_θ: filtrelenmiş projeksiyon. Uzaysal tanımda: q_θ(s) = p_θ(s) ∗ h(s).">
        Q<sub>θ</sub>(f) = P<sub>θ</sub>(f) · |f| · W(f)
      </Formula>

      <div className="fx-stats">
        <StatChip label="Dedektör Nyquist f_N" value={`${freq.fN.toFixed(2)} lp/cm`} />
        <StatChip label="Kanal aralığı ds" value={`${ds.toFixed(2)} mm`} />
        <StatChip label="Seçili kernel" value={K.label} tone="a" />
        {KIDS.map((k) => (
          <StatChip key={k} label={`Göreli gürültü – ${KERNELS[k].label}`} value={`×${freq.rel[k].toFixed(2)}`} tone={k === kernel ? 'b' : undefined} />
        ))}
      </div>

      <Figure cols={2}>
        <div>
          <LineChart
            series={fSeries}
            xLabel="uzaysal frekans f (lp/cm)"
            yLabel="filtre kazancı (|f|/f_N ölçekli)"
            xMin={0}
            xMax={freq.fN * 1.12}
            yMin={0}
            vlines={[{ x: freq.fN, label: 'Nyquist f_N' }]}
            fmtX={(v) => v.toFixed(1)}
            fmtY={(v) => v.toFixed(2)}
            height={240}
          />
          <div className="fx-cap">
            Frekans yanıtları: kesikli mavi = ideal rampa; diğerleri rampa × kernel penceresi. Kalın çizgi = üst çubukta seçili kernel. Eğriler
            dedektör Nyquist frekansında biter: daha ince ayrıntı örneklenmemiştir. Normalleştirilmiş eğri altındaki alan (ideal rampa = 0.50):{' '}
            {KIDS.map((k) => `${KERNELS[k].label} ${freq.area[k].toFixed(2)}`).join(' · ')}.
          </div>
        </div>
        <div>
          <LineChart
            series={[{ name: 'h(n)·ds² (Ram-Lak)', color: SERIES[0], pts: ramLak }]}
            xLabel="kanal farkı n (× ds)"
            yLabel="h(n)·ds²"
            xMin={-8}
            xMax={8}
            fmtX={(v) => v.toFixed(0)}
            fmtY={(v) => v.toFixed(2)}
            height={240}
          />
          <div className="fx-cap">
            Aynı rampanın uzaysal karşılığı (Ram-Lak çekirdeği): h(0) = 1/(4ds²), tek n için h(n) = −1/(n²π²ds²), çift n için 0. Merkez pozitif,
            komşular <b>negatif</b>: her ölçümden komşularının bir kısmı çıkarılır. Geri izdüşümde bu negatif yan loblar, basit geri izdüşümün
            “hale”sini tam olarak iptal eder.
          </div>
        </div>
      </Figure>

      <div className="fx-ctrl">
        <span className="lab">Projeksiyon açısı θ (görünüm {rows.v + 1}/{nv})</span>
        <div style={{ flex: 1, minWidth: 180, maxWidth: 400 }}>
          <Slider value={Math.round(rows.theta * 10) / 10} min={0} max={(180 * (nv - 1)) / nv} step={180 / nv} unit="°" onChange={(t) => setView(Math.round((t * nv) / 180))} />
        </div>
        <span className="lab">Sinogram üzerine tıklayarak/sürükleyerek de seçebilirsiniz.</span>
      </div>

      <Figure cols={2}>
        <div>
          <LineChart
            series={[{ name: `p (θ = ${rows.theta.toFixed(1)}°)`, color: SERIES[0], pts: rows.p }]}
            xLabel="ışının izomerkeze uzaklığı s (mm)"
            yLabel="çizgi integrali p = ∫μ dl"
            xMin={-250}
            xMax={250}
            yMin={0}
            fmtX={(v) => v.toFixed(0)}
            fmtY={(v) => v.toFixed(1)}
            height={210}
          />
          <div className="fx-cap">Filtre öncesi: log dönüşümlü, düzeltilmiş projeksiyon p(s) – her yerde pozitif, yuvarlak “tepe” biçimli.</div>
        </div>
        <div>
          <LineChart
            series={[
              { name: 'q = filtrelenmiş (cm⁻¹)', color: SERIES[1], pts: rows.q, width: 2 },
              { name: 'p (ölçekli, yalnız şekil için)', color: SERIES[0], pts: rows.pScaled, dash: true, width: 1.2 },
            ]}
            xLabel="ışının izomerkeze uzaklığı s (mm)"
            yLabel="q (cm⁻¹)"
            xMin={-250}
            xMax={250}
            fmtX={(v) => v.toFixed(0)}
            fmtY={(v) => v.toPrecision(2)}
            height={210}
          />
          <div className="fx-cap">
            Filtre sonrası q(s) ({K.label} kerneli; aralık {rows.qMin.toFixed(2)} … {rows.qMax.toFixed(2)} cm⁻¹). Düz bölgeler ≈ 0’a iner, kenarlarda
            aşma (overshoot) ve cismin hemen dışında <b>negatif</b> loblar oluşur: filtre kenarları vurgular. Kesikli eğri, p’nin q’nun
            tepesine ölçeklenmiş hâlidir (iki eğrinin birimleri farklıdır).
          </div>
        </div>
      </Figure>

      <Figure cols={1}>
        <div style={{ maxWidth: 400, width: '100%', justifySelf: 'center' }}>
          <ImageView
            data={main.q}
            w={nb}
            h={nv}
            cmap="div"
            divRange={qRange}
            aspect={1.4}
            tag={`filtrelenmiş sinogram q · ${K.label}`}
            overlay={(g, toS) => {
              const [x0, y] = toS(-0.5, rows.v);
              const [x1] = toS(nb - 0.5, rows.v);
              g.strokeStyle = '#ffe08a';
              g.lineWidth = 1.5;
              g.setLineDash([5, 4]);
              g.beginPath();
              g.moveTo(x0, y);
              g.lineTo(x1, y);
              g.stroke();
            }}
            overlayKey={rows.v}
            onDown={(_, fy) => setView(Math.max(0, Math.min(nv - 1, Math.round(fy))))}
            onDrag={(_, fy) => setView(Math.max(0, Math.min(nv - 1, Math.round(fy))))}
            cursor="row-resize"
            caption={
              <>
                Tüm filtrelenmiş sinogram: dikey eksen θ (yukarıda 0° → aşağıda 180°, {nv} görünüm), yatay eksen s (−250 → +250 mm, {nb} kanal).
                Turuncu = pozitif, mavi = negatif, koyu = 0. Sarı kesikli çizgi seçili görünümdür. Filtresiz sinogramın düzgün “bantları” burada
                yalnızca kenar çizgilerine dönüşmüştür.
              </>
            }
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <ColorBar cmap="div" lo={-qRange} hi={qRange} unit="cm⁻¹" />
          </div>
        </div>
      </Figure>

      <Points
        items={[
          <>Üst çubuktan <b>kernel</b>’i değiştirin (yeniden hesaplanır): q profilindeki kenar aşmaları ve sinogramdaki ince “karıncalanma” kemik kernelinde belirgin şekilde artar.</>,
          <>
            Gürültü, |f|·W(f) eğrisinin altındaki alanla (özellikle yüksek frekans kısmıyla) büyür. Yukarıdaki “göreli gürültü” değerleri, 2B
            gürültü varyansı ∝ ∫ f²·W²(f) df yaklaşımıyla yumuşak doku kerneline göre kabaca hesaplanmış oranlardır (sistem MTF’i ihmal).
          </>,
          <>Yumuşak doku kerneli Nyquist’e varmadan yüksek frekansları kısar → düzgün görüntü, biraz bulanık kenar. Kemik kerneli rampanın bile üstüne çıkar → kenar vurgusu (“halo”) ve daha fazla gürültü.</>,
          <>Bu basitleştirilmiş eğitim simülasyonunda kernel pencereleri satıcıdan bağımsız, temsilî eğrilerdir; gerçek cihazlarda adlar ve biçimler farklıdır.</>,
        ]}
      />
    </>
  );
}
