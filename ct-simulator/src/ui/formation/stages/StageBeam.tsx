/**
 * Görüntü oluşumu gezgini – aşama: X-ışını demeti (spektrum + papyon filtresi).
 * Spektrum eğrileri fizik modülünden (tubeSpectrum / filterSpectrum) anlık hesaplanır;
 * papyon akı profili ana hesaplamadaki gerçek n0 dizisidir.
 */
import { useMemo } from 'react';
import { useApp } from '../../../state/store';
import { LineChart } from '../../physics/LineChart';
import { bowtieAlMm, effectiveEnergyFromHvl, filterSpectrum, hvlAl, meanEnergy, tubeSpectrum, type Spectrum } from '../../../physics/spectrum';
import { Explain, Figure, Formula, Points, SERIES, StatChip, binToMm, useFormation } from '../common';

function specPts(s: Spectrum): [number, number][] {
  let mx = 0;
  for (let i = 0; i < s.photons.length; i++) mx = Math.max(mx, s.photons[i]);
  const k = mx > 0 ? 1 / mx : 1;
  return Array.from(s.energies, (e, i) => [e, s.photons[i] * k] as [number, number]);
}

const EDGE_S = 200; // mm – papyon kenarı örneği

export function StageBeam() {
  const kVp = useApp((s) => s.formation.src.kVp);
  const mAs = useApp((s) => s.formation.src.mAs);
  const { main } = useFormation();

  const spec = useMemo(() => {
    const s = tubeSpectrum(kVp);
    const water = filterSpectrum(s, 'water', 200);
    const edgeAl = bowtieAlMm('body', EDGE_S);
    const edge = filterSpectrum(s, 'aluminum', edgeAl);
    const hvl = hvlAl(s);
    return {
      pts: specPts(s),
      ptsW: specPts(water),
      ptsE: specPts(edge),
      mean: meanEnergy(s),
      meanW: meanEnergy(water),
      meanE: meanEnergy(edge),
      hvl,
      eEff: effectiveEnergyFromHvl(hvl),
      edgeAl,
    };
  }, [kVp]);

  const bowtie = useMemo(() => {
    if (!main) return null;
    const { nb, ds } = main.geo;
    const n0 = main.n0;
    let mx = 0;
    for (let b = 0; b < n0.length; b++) mx = Math.max(mx, n0[b]);
    const pts: [number, number][] = [];
    const step = Math.max(1, Math.floor(nb / 280));
    for (let b = 0; b < n0.length; b += step) pts.push([binToMm(b, nb, ds), n0[b] / (mx || 1)]);
    let mn = Infinity;
    for (let b = 0; b < n0.length; b++) mn = Math.min(mn, n0[b]);
    return { pts, ratio: mx / Math.max(1e-9, mn), max: mx };
  }, [main]);

  const alPts = useMemo(() => {
    const body: [number, number][] = [], head: [number, number][] = [];
    for (let s = -250; s <= 250; s += 2.5) {
      body.push([s, bowtieAlMm('body', s)]);
      head.push([s, bowtieAlMm('head', s)]);
    }
    return { body, head };
  }, []);

  return (
    <>
      <Explain title="X-ışını tüpü ne üretir?">
        <p>
          Katottan hızlandırılan elektronlar tungsten anoda çarpar. Elektronların çekirdek yakınında yavaşlamasıyla oluşan <b>frenleme ışınımı (bremsstrahlung)</b>,
          0'dan tüp gerilimine (kVp) kadar uzanan <b>sürekli</b> bir spektrum verir. Bunun üzerine tungstenin <b>karakteristik K çizgileri</b> (Kα ≈ 59 keV, Kβ ≈ 67 keV)
          dar tepeler olarak biner. Tüp çıkışındaki <b>doğal + ek filtrasyon</b> (bu simülasyonda 5.5 mm Al + 0.1 mm Cu) görüntüye katkı vermeden yalnızca cilt dozunu
          artıracak düşük enerjili fotonları süzer.
        </p>
      </Explain>

      <div className="fx-stats">
        <StatChip label="Tüp gerilimi" value={`${kVp} kVp`} tone="a" />
        <StatChip label="Ortalama enerji" value={`${spec.mean.toFixed(1)} keV`} />
        <StatChip label="HVL" value={`${spec.hvl.toFixed(2)} mm Al`} />
        <StatChip label="HVL'den etkin enerji" value={`${spec.eEff.toFixed(1)} keV`} />
        <StatChip label="20 cm su sonrası ort." value={`${spec.meanW.toFixed(1)} keV`} tone="b" />
        {main && <StatChip label="Referans enerji E_ref" value={`${main.eRef.toFixed(1)} keV`} tone="ok" />}
      </div>

      <Figure cols={1}>
        <div>
          <LineChart
            xLabel="Foton enerjisi (keV)"
            yLabel="Göreli foton sayısı"
            xMin={10}
            xMax={150}
            yMin={0}
            yMax={1.05}
            series={[
              { name: 'Tüp çıkışı', color: SERIES[0], pts: spec.pts },
              { name: '20 cm su sonrası', color: SERIES[1], pts: spec.ptsW },
              { name: `Papyon kenarı (s=${EDGE_S} mm)`, color: SERIES[2], pts: spec.ptsE, dash: true },
            ]}
            vlines={[
              { x: spec.mean, label: `ort. ${spec.mean.toFixed(0)}` },
              { x: spec.meanW, label: `su sonrası ${spec.meanW.toFixed(0)}` },
            ]}
            fmtY={(v) => v.toFixed(1)}
          />
          <div className="fx-cap">
            {kVp} kVp spektrumu. Her eğri <b>kendi maksimumuna normalize</b> edilmiştir (mutlak foton sayısı değil, spektrumun <i>şekli</i> karşılaştırılıyor).
            20 cm su ya da papyonun {spec.edgeAl.toFixed(1)} mm Al kalınlığı düşük enerjileri tercihli olarak soğurur: ortalama enerji {spec.mean.toFixed(1)} →{' '}
            {spec.meanW.toFixed(1)} keV (su) ve {spec.meanE.toFixed(1)} keV (papyon kenarı). Bu, <b>ışın sertleşmesidir</b>.
          </div>
        </div>
      </Figure>

      <Explain title="kVp ve mAs: neyi değiştirir?">
        <p>
          <b>kVp</b> en yüksek foton enerjisini ve spektrumun şeklini belirler: kVp arttıkça ortalama enerji ve penetrasyon artar, doku kontrastı (özellikle iyot ve kemik) azalır.
          Aynı mAs'ta tüp çıkışı da yaklaşık kVp<sup>2.5–3</sup> ile artar. <b>mAs</b> ise spektrumun şeklini değiştirmez, yalnızca foton <b>sayısını</b> orantılı olarak
          artırır. Foton sayımı Poisson istatistiğine uyduğundan görüntü gürültüsü yaklaşık 1/√mAs ile azalır (şu an {mAs} mAs; 4 katı mAs → gürültü yarıya iner, doz 4 katına çıkar).
        </p>
        <p>
          Önemli olan: CT demeti <b>polienerjetiktir</b> (çok enerjili). Zayıflatma katsayısı μ enerjiye bağlı olduğundan, ışın hastadan geçerken “sertleşir” ve
          ölçülen zayıflatma, yol uzunluğuyla doğrusal artmaz. Bu, <b>ışın sertleşmesi</b> artefaktlarının (çanaklaşma, kemikler arası koyu bantlar) kaynağıdır; ön işleme
          aşamasında (Aşama 6) bir düzeltme (BHC) uygulanır. Görüntüdeki HU değerleri tek bir <b>referans/etkin enerjiye</b> (E_ref) göre ifade edilir.
        </p>
      </Explain>

      <Formula note="Basitleştirilmiş: σ_gürültü yalnızca foton sayısına (kuantum gürültüsü) bağlı kabul edilmiştir; elektronik gürültü düşük dozda ek katkı yapar.">
        N<sub>foton</sub> ∝ mAs · f(kVp) &nbsp;&nbsp;⇒&nbsp;&nbsp; σ<sub>gürültü</sub> ∝ 1/√N ∝ 1/√mAs
      </Formula>

      <Explain title="Papyon (bowtie) filtresi">
        <p>
          Hasta kesiti kabaca elips şeklindedir: merkezden geçen ışınlar uzun, kenardan geçenler kısa yol kat eder. Tüp önündeki <b>papyon filtresi</b> ortada ince,
          kenarlarda kalın bir alüminyum/teflon blok olup çevredeki ışınların akısını azaltır. Böylece (1) gereksiz cilt/periferik doz düşer, (2) dedektörün gördüğü sinyal
          aralığı (dinamik aralık) dengelenir ve kenar kanallarda doygunluk önlenir. Yan etkisi: kenardaki ışın daha fazla filtrelendiği için <b>daha sert</b> bir spektruma sahiptir
          (yukarıdaki kesikli eğri) – bu nedenle ışın sertleşmesi düzeltmesi kanal kanal yapılmalıdır.
        </p>
      </Explain>

      <Figure cols={2}>
        <div>
          {bowtie ? (
            <LineChart
              xLabel="Kanal konumu s (mm)"
              yLabel="Göreli akı I₀ / I₀,maks"
              xMin={-250}
              xMax={250}
              yMin={0}
              yMax={1.05}
              endLabels={false}
              series={[{ name: 'Zayıflatmasız akı (n₀)', color: SERIES[0], pts: bowtie.pts }]}
              fmtY={(v) => v.toFixed(1)}
            />
          ) : (
            <div className="fx-need">Akı profili için üstten “Hesapla” ile tarayın.</div>
          )}
          <div className="fx-cap">
            Papyon filtresi kenarlarda akıyı azaltır: hasta yokken her dedektör kanalına ulaşan foton sayısı (n₀), en yüksek değerine normalize.
            {bowtie && <> Merkez/kenar oranı ≈ {bowtie.ratio.toFixed(0)}×; merkez kanalda ~{bowtie.max.toExponential(1)} foton (görünüm başına).</>}
          </div>
        </div>
        <div>
          <LineChart
            xLabel="Kanal konumu s (mm)"
            yLabel="Papyon kalınlığı (mm Al eşd.)"
            xMin={-250}
            xMax={250}
            yMin={0}
            series={[
              { name: 'Gövde papyonu', color: SERIES[1], pts: alPts.body },
              { name: 'Baş papyonu', color: SERIES[2], pts: alPts.head, dash: true },
            ]}
          />
          <div className="fx-cap">Model papyon kalınlığı: silindirik su fantomundaki yol farkını kısmen telafi edecek biçimde merkezden kenara kalınlaşır (basitleştirilmiş eğitsel model).</div>
        </div>
      </Figure>

      <Points
        title="Deneyin"
        items={[
          <>Üst çubuktan <b>kVp</b>'yi 80 → 140 değiştirin: spektrumun sağ ucu (maksimum enerji) ve ortalama enerji kayar. Karakteristik K çizgileri (59/67 keV) her kVp'de aynı enerjide kalır (anot malzemesine özgüdür); yalnızca kVp tungstenin K-kabuk bağlanma enerjisini (69.5 keV) aştığında oluşurlar.</>,
          <>20 cm su sonrası eğrinin tepesinin sağa kaydığına dikkat edin: düşük enerjili fotonlar ilk santimetrelerde tükenir – ışın sertleşmesi.</>,
          <><b>mAs</b> bu grafiklerde hiçbir şeyi değiştirmez (eğriler normalize); etkisini sonraki “sayımlar” ve FBP aşamalarındaki gürültüde görürsünüz.</>,
          <>Papyonun yalnızca dozu değil, ışının <b>enerjisini</b> de konuma bağlı hâle getirdiğini unutmayın.</>,
        ]}
      />
    </>
  );
}
