/**
 * Görüntü oluşumu gezgini – Aşama: Ön işleme (log dönüşümü + ışın sertleşmesi düzeltmesi).
 *  - p = −ln(I/I₀) ile Beer–Lambert doğrusallaştırması
 *  - su eğrisi (polikromatik ölçüm vs ideal μ_ref·L) ve etkin μ'nün derinlikle düşüşü
 *  - kemik için kalan sertleşme açığı (su BHC'sinden sonra)
 *  - sinogram farkları: sertleşme kaybı (mono − poli) ve uygulanan düzeltme (p − ham)
 */
import { useMemo, useState } from 'react';
import { LineChart } from '../../physics/LineChart';
import { Slider } from '../../controls';
import { useFormation, NeedData, ImageView, ColorBar, Explain, Points, Formula, Figure, StatChip, autoWindow, sinoRow, toPts, binToMm, SERIES } from '../common';

/** a − b (aynı boy) */
function diff(a: Float32Array, b: Float32Array): Float32Array {
  const n = Math.min(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] - b[i];
  return out;
}

/** ıraksak harita için simetrik aralık (%2–98 yüzdelik) */
function symRange(d: Float32Array): number {
  const w = autoWindow(d, 0.02, 0.98);
  return Math.max(Math.abs(w.lo), Math.abs(w.hi)) || 1e-3;
}

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);

export function StagePreprocess() {
  const { main, status } = useFormation();
  const [view, setView] = useState<number | null>(null);
  const [hover, setHover] = useState<{ v: number; b: number; which: 0 | 1 } | null>(null);

  // --- türetilmiş diziler (veri nesnesine bağlı)
  const d = useMemo(() => {
    if (!main) return null;
    const { geo, rgeo } = main;
    const hard = diff(main.monoLine, main.polyLine);
    const sameViews = rgeo.nv === geo.nv && rgeo.nb === geo.nb;
    const corr = sameViews ? diff(main.p, main.raw) : null;
    const bh = main.bhc;
    // su: ölçülen p ve ideal μL; etkin μ = p/L
    const water = {
      ideal: bh.lw.map((l, i) => [l, bh.ideal[i]] as [number, number]),
      poly: bh.lw.map((l, i) => [l, bh.poly[i]] as [number, number]),
      muEffPoly: bh.lw.map((l, i) => [l, l > 0 ? bh.poly[i] / l : NaN] as [number, number]).filter((p) => isFinite(p[1])),
      muRef: bh.lw.filter((l) => l > 0).map((l) => [l, main.muRef] as [number, number]),
    };
    const bone = {
      ideal: bh.boneLb.map((l, i) => [l, bh.boneIdeal[i]] as [number, number]),
      corr: bh.boneLb.map((l, i) => [l, bh.boneCorrected[i]] as [number, number]),
      // açık su eşdeğeri cm olarak (ideal − düzeltilmiş) / μ_su
      gapCm: bh.boneLb.map((l, i) => [l, (bh.boneIdeal[i] - bh.boneCorrected[i]) / main.muRef] as [number, number]),
    };
    // istatistikler
    const iw = bh.lw.reduce((bi, l, i) => (Math.abs(l - 30) < Math.abs(bh.lw[bi] - 30) ? i : bi), 0);
    const w30 = { L: bh.lw[iw], poly: bh.poly[iw], ideal: bh.ideal[iw] };
    const ib = bh.boneLb.length - 1;
    const b8 = { lb: bh.boneLb[ib], ideal: bh.boneIdeal[ib], corr: bh.boneCorrected[ib] };
    return {
      hard,
      hardR: symRange(hard),
      corr,
      corrR: corr ? symRange(corr) : 1,
      sameViews,
      water,
      bone,
      w30,
      b8,
    };
  }, [main]);

  // seçili görünüm profili (p, rgeo'da en yakın görünüm)
  const prof = useMemo(() => {
    if (!main) return [];
    const { geo, rgeo } = main;
    const nb = geo.nb;
    const vv = view ?? Math.floor(geo.nv / 4);
    const vr = Math.max(0, Math.min(rgeo.nv - 1, Math.round((vv * rgeo.nv) / geo.nv)));
    const xMm = (b: number) => binToMm(b, nb, geo.ds);
    return [
      { name: 'mono (E_ref, ideal)', color: SERIES[0], pts: toPts(sinoRow(main.monoLine, nb, vv), xMm, 2) },
      { name: 'poli (gürültüsüz)', color: SERIES[1], pts: toPts(sinoRow(main.polyLine, nb, vv), xMm, 2) },
      { name: 'ham −ln(I/I₀)', color: SERIES[3], pts: toPts(sinoRow(main.raw, nb, vv), xMm, 2), width: 1 },
      { name: 'düzeltilmiş p', color: SERIES[2], pts: toPts(sinoRow(main.p, rgeo.nb, vr), (b) => binToMm(b, rgeo.nb, rgeo.ds), 2), width: 1 },
    ];
  }, [main, view]);

  if (!main || !d) return <NeedData status={status} />;
  const { geo, rgeo } = main;
  const nv = geo.nv, nb = geo.nb;
  const v = view ?? Math.floor(nv / 4);
  const thetaOf = (vv: number, n = nv) => (vv * 180) / n;
  const sMax = ((nb - 1) / 2) * geo.ds;
  const sinoAspect = 1.45;
  const xMm = (b: number) => binToMm(b, nb, geo.ds);

  const overlay = (g: CanvasRenderingContext2D, ts: (fx: number, fy: number) => [number, number]) => {
    const [x0, y] = ts(-0.5, v);
    const [x1] = ts(nb - 0.5, v);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.setLineDash([4, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
  };
  const pick = (which: 0 | 1) => ({
    onHover: (fx: number, fy: number) => {
      const b = Math.round(fx), vv = Math.round(fy);
      if (b < 0 || b >= nb || vv < 0 || vv >= nv) setHover(null);
      else setHover({ v: vv, b, which });
    },
    onLeave: () => setHover(null),
    onDown: (_fx: number, fy: number) => setView(Math.max(0, Math.min(nv - 1, Math.round(fy)))),
    onDrag: (_fx: number, fy: number) => setView(Math.max(0, Math.min(nv - 1, Math.round(fy)))),
  });
  const hoverTxt = (which: 0 | 1) => {
    if (!hover || hover.which !== which) return 'Fareyle üzerine gelin; tıklayınca o görünümün profili aşağıda çizilir.';
    const k = hover.v * nb + hover.b;
    const val = which === 0 ? d.hard[k] : d.corr ? d.corr[k] : NaN;
    return `θ = ${thetaOf(hover.v).toFixed(1)}°, s = ${xMm(hover.b).toFixed(1)} mm → Δp = ${val.toFixed(4)}`;
  };

  const { w30, b8 } = d;
  const hardPct = (100 * (w30.ideal - w30.poly)) / Math.max(1e-9, w30.ideal);
  const boneGap = b8.ideal - b8.corr;

  return (
    <>
      <Explain title="Ölçülen sayımdan çizgi integraline">
        <p>
          Dedektör, her ışın için kaç fotonun ulaştığını (I) ölçer. Rekonstrüksiyon ise ışın boyunca zayıflatma katsayılarının <b>toplamını</b> (çizgi integralini) ister. Beer–Lambert yasasına göre I = I₀·exp(−∫μ dl) olduğundan, ölçümün
          zayıflatmasız referansa (I₀) oranının negatif logaritması bu toplamı verir. I₀, hasta yokken yapılan <b>hava kalibrasyonundan</b> ve tüp çıkışındaki anlık dalgalanmaları izleyen <b>referans dedektörlerden</b> gelir; papyon filtresi
          nedeniyle her kanal için farklıdır.
        </p>
      </Explain>
      <Formula note="I₀: hava kalibrasyonu × referans dedektör; p boyutsuzdur (μ [cm⁻¹] × uzunluk [cm]).">p = −ln(I / I₀) = ∫ μ(x, y) dl</Formula>
      <Formula note="f_BHC: her papyon (bowtie) konumu için su fantomuyla kalibre edilmiş eğri – polikromatik ölçümü, E_ref'teki ideal monokromatik değere taşır.">
        p_düz = f_BHC(p) ≈ μ_su(E_ref) · L_su
      </Formula>

      <div className="fx-stats">
        <StatChip label="E_ref (etkin enerji)" value={`${main.eRef.toFixed(1)} keV`} />
        <StatChip label="μ_su(E_ref)" value={`${main.muRef.toFixed(3)} cm⁻¹`} />
        <StatChip label={`${w30.L.toFixed(0)} cm su: ideal / ölçülen`} value={`${f2(w30.ideal)} / ${f2(w30.poly)}`} tone="a" />
        <StatChip label="sertleşme kaybı (su)" value={`%${hardPct.toFixed(1)}`} tone="warn" />
        <StatChip label={`${b8.lb.toFixed(0)} g/cm² kemikte kalan açık`} value={`${f3(boneGap)} (≈${(boneGap / main.muRef).toFixed(2)} cm su)`} tone="b" />
      </div>

      <Figure cols={2}>
        <div>
          <LineChart
            series={[
              { name: 'ideal μ_ref·L', color: SERIES[0], pts: d.water.ideal },
              { name: 'ölçülen (polikromatik) p', color: SERIES[1], pts: d.water.poly },
            ]}
            xLabel="Su kalınlığı L (cm)"
            yLabel="Çizgi integrali p"
            xMin={0}
            yMin={0}
            fmtY={f2}
            height={230}
          />
          <div className="fx-cap">
            Su için ölçülen p kalınlıkla doğrusal değil, <b>giderek yavaşlayarak</b> artar. İki eğri arasındaki açık ışın sertleşmesidir. Su BHC eğrisi, ölçülen her p değerini (turuncu) aynı kalınlıktaki ideal değere (mavi) eşler.
          </div>
        </div>
        <div>
          <LineChart
            series={[
              { name: 'μ_su(E_ref)', color: SERIES[0], pts: d.water.muRef, dash: true },
              { name: 'etkin μ = p / L', color: SERIES[1], pts: d.water.muEffPoly },
            ]}
            xLabel="Su kalınlığı L (cm)"
            yLabel="μ (cm⁻¹)"
            xMin={0}
            fmtY={f3}
            height={230}
          />
          <div className="fx-cap">
            Polikromatik ışında suyun <b>etkin</b> zayıflatma katsayısı derinlikle azalır: düşük enerjili fotonlar ilk santimetrelerde soğurulur, kalan ışının ortalama enerjisi yükselir (ışın “sertleşir”).
          </div>
        </div>
      </Figure>

      <Figure cols={2}>
        <div>
          <LineChart
            series={[
              { name: 'ideal (mono)', color: SERIES[0], pts: d.bone.ideal },
              { name: 'su BHC sonrası', color: SERIES[1], pts: d.bone.corr },
            ]}
            xLabel="Kortikal kemik (g/cm², 20 cm su üzerine)"
            yLabel="Çizgi integrali p"
            fmtY={f2}
            height={230}
          />
          <div className="fx-cap">20 cm su + artan kemik. Su eğrisiyle düzeltme kemiği “su gibi” varsayar; kemik ışını sudan daha fazla sertleştirdiği için düzeltilmiş değer idealin altında kalır.</div>
        </div>
        <div>
          <LineChart
            series={[{ name: 'kalan açık (su eşdeğeri)', color: SERIES[3], pts: d.bone.gapCm }]}
            xLabel="Kortikal kemik (g/cm²)"
            yLabel="İdeal − düzeltilmiş (cm su eşd.)"
            yMin={0}
            fmtY={f2}
            height={230}
          />
          <div className="fx-cap">
            Kalan açık kemik miktarıyla büyür. İki yoğun kemik arasından geçen ışınlar (petröz kemikler, omuz, pelvis) birlikte “eksik” ölçülür → aralarında <b>koyu bant/çizgi</b> (Hounsfield bandı) kalır. Bunu gidermek için ikinci geçişli
            (kemik/iyot) BHC algoritmaları kullanılır.
          </div>
        </div>
      </Figure>

      <Figure cols={2}>
        <ImageView
          data={d.hard}
          w={nb}
          h={nv}
          cmap="div"
          divRange={d.hardR}
          aspect={sinoAspect}
          tag="mono − poli"
          overlay={overlay}
          overlayKey={v}
          {...pick(0)}
          caption={
            <>
              <b>Işın sertleşmesi kaybı</b> (gürültüsüz): ideal monokromatik çizgi integrali eksi polikromatik ölçüm. Turuncu = pozitif (poli ışın zayıflatmayı <i>az</i> ölçmüş), mavi = negatif. Dikey eksen θ (üst 0° → alt 180°), yatay eksen s
              (−{sMax.toFixed(0)} → +{sMax.toFixed(0)} mm). Kayıp kalın ve kemikli ışınlarda en büyüktür.
              <ColorBar cmap="div" lo={-d.hardR} hi={d.hardR} />
              <span>{hoverTxt(0)}</span>
            </>
          }
        />
        {d.corr ? (
          <ImageView
            data={d.corr}
            w={nb}
            h={nv}
            cmap="div"
            divRange={d.corrR}
            aspect={sinoAspect}
            tag="p − ham"
            overlay={overlay}
            overlayKey={v}
            {...pick(1)}
            caption={
              <>
                <b>Uygulanan düzeltme</b>: rekonstrüksiyona giden p eksi ham −ln(I/I₀). Turuncu = değer artırılmış (BHC, kalın ışınlarda), mavi = azaltılmış. Düşük sinyalli ışınlardaki tanecikli desen, foton açlığı için uygulanan uyarlamalı
                filtrenin gürültüyü yumuşatmasıdır. Eksenler soldaki gibi.
                <ColorBar cmap="div" lo={-d.corrR} hi={d.corrR} />
                <span>{hoverTxt(1)}</span>
              </>
            }
          />
        ) : (
          <div className="fx-need">
            Görünüm seyreltmesi açık (rekonstrüksiyon {rgeo.nv} görünüm, ölçüm {geo.nv} görünüm): uygulanan düzeltme farkı yalnızca iki sinogram aynı görünüm sayısına sahipken gösterilir.
          </div>
        )}
      </Figure>

      <div className="fx-ctrl">
        <span className="lab">Profil görünümü (θ = {thetaOf(v).toFixed(1)}°)</span>
        <div style={{ flex: '1 1 200px', maxWidth: 380 }}>
          <Slider value={v} min={0} max={nv - 1} step={1} onChange={(x) => setView(Math.round(x))} />
        </div>
      </div>
      <LineChart series={prof} xLabel="s (mm, izomerkeze uzaklık)" yLabel="Çizgi integrali p" fmtY={f2} height={250} />
      <div className="fx-cap">
        Tek bir görünümün profili: mono (ideal) ile poli arasındaki fark sertleşme kaybıdır; ham ölçüm bunun gürültülü hâlidir; BHC sonrası p yeniden ideal eğriye yaklaşır (kemik içeren ışınlarda küçük bir açık kalır).
        {rgeo.nv !== nv && ` Not: düzeltilmiş p seyreltilmiş ${rgeo.nv} görünümlü sinogramdan, en yakın görünümle çizilmiştir.`}
      </div>

      <Explain title="Neden logaritma?">
        <p>
          Sayımlar çarpımsal olarak azalır (her doku katmanı ışını bir oranla zayıflatır). Logaritma bu çarpımı <b>toplama</b> çevirir: p, ışın boyunca geçilen tüm piksellerin μ değerlerinin toplamıdır. Filtreli geri izdüşüm ve iteratif
          yöntemler bu doğrusal ilişkiye (p = A·μ) dayanır; log almadan rekonstrüksiyon yapılamaz.
        </p>
        <p>
          Bu simülasyonda doğrusallık yalnızca tek enerjide tam geçerlidir. Gerçek tüp ise geniş bir spektrum (ör. 120 kVp'de ~30–120 keV) üretir. Düşük enerjili fotonlar daha kolay soğurulduğundan ışın derinlere ilerledikçe sertleşir ve
          ölçülen p, ideal değerin altında kalır. Düzeltilmezse görüntünün ortası dış kısmından koyu görünür (<b>kupa/çanak artefaktı</b>, “cupping”).
        </p>
      </Explain>

      <Points
        items={[
          <>
            <b>Log dönüşümü</b> Beer–Lambert yasasını doğrusallaştırır: ışın boyunca zayıflatmalar toplanabilir hâle gelir.
          </>,
          <>
            <b>Işın sertleşmesi:</b> düşük enerjiler önce soğurulur → ortalama enerji derinlikle artar → etkin μ azalır → p kalınlıkla doğrusal artmaz.
          </>,
          <>
            <b>Su BHC'si</b> her papyon konumu (kanal grubu) için ayrı kalibre edilir: papyon filtresi kenar kanallarda spektrumu zaten sertleştirdiğinden tek bir eğri kullanılsaydı kanallar arası tutarsızlık <b>halka artefaktlarına</b> yol
            açardı.
          </>,
          <>
            <b>Kemik ve iyot</b> sudan daha fazla sertleştirir; su eğrisi bunu tam düzeltemez → yoğun yapılar arasında koyu bantlar, kontrastlı damar yakınında çizgiler. Gerçek sistemler ikinci geçişli (görüntü tabanlı) düzeltme kullanır.
          </>,
          <>
            <b>Foton açlığı:</b> çok az fotonun ulaştığı ışınlarda (omuz, metal) −ln(I/I₀) çok gürültülüdür ve I sıfıra yaklaştıkça tanımsızlaşır. Sayım tabanı ve uyarlamalı (kanal × görünüm) yumuşatma bu ışınları komşularıyla ortalar;
            ince çizgi artefaktlarını azaltır ama sapmayı tamamen gideremez.
          </>,
          <>
            Gerçek tarayıcılardaki diğer düzeltmeler (burada basitleştirildi ya da kısmen modellendi): hava kalibrasyonu, dedektör kazanç/ofset (karanlık akım) düzeltmesi, sintilatör ard ışıması (afterglow), saçılma tahmini ve
            çıkarımı, odak noktası kayması ve kanal doğrusallığı düzeltmeleri.
          </>,
        ]}
      />
    </>
  );
}
