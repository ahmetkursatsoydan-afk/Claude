/** Görüntü oluşumu gezgini – Aşama 0: Genel bakış (BT görüntüsü nasıl oluşur?). */
import type { ReactNode } from 'react';
import { useApp } from '../../../state/store';
import type { ChainStep } from '../../../app/artifactAtlas';
import { useFormation, ImageView, Explain, Points, Formula, PipelineMap, NeedData, StatChip, wl } from '../common';
import './StageOverview.css';

/** Aşamaya git (FormationView'deki STAGES sırası; döngüsel içe aktarmayı önlemek için sabit indeks). */
function goStage(i: number) {
  const st = useApp.getState();
  st.set({ formation: { ...st.formation, stage: i } });
  document.querySelector('.fx-main')?.scrollTo({ top: 0 });
}

const CHAIN_TO_STAGE: Record<ChainStep, number> = {
  tube: 2,
  patient: 1,
  detector: 5,
  preproc: 6,
  sampling: 4,
  recon: 9,
  display: 10,
};

/** Aşama listesi (FormationView STAGES ile aynı sıra). */
const STAGE_LIST: { t: string; d: string; star?: boolean }[] = [
  { t: 'Genel bakış', d: 'Bu sayfa: zincirin tamamı ve gezinme.' },
  { t: 'Nesne (μ)', d: 'Taranan kesitin gerçek zayıflatma haritası – rekonstrüksiyonun ulaşmaya çalıştığı hedef.' },
  { t: 'X-ışını demeti', d: 'Polikromatik tüp spektrumu, filtrasyon, papyon (bowtie) filtresi, etkin enerji.' },
  { t: 'Tek projeksiyon', d: 'Bir açıdan ölçülen profil: Beer–Lambert, I = I₀·e^(−∫μ dl).' },
  { t: 'Sinogram', d: 'Tüm açılardaki projeksiyonların yığını; her nokta bir sinüs eğrisi çizer.' },
  { t: 'Sayım ve gürültü', d: 'Dedektöre ulaşan foton sayısı, Poisson (kuantum) gürültüsü, foton açlığı.' },
  { t: 'Log + sertleşme', d: 'Sayımlardan çizgi integraline: −ln(I/I₀) ve ışın sertleşmesi düzeltmesi.' },
  { t: 'Geri izdüşüm', d: 'Filtresiz geri izdüşüm neden bulanık (1/r) görüntü verir?' },
  { t: 'Filtreleme', d: 'Rampa filtresi × rekonstrüksiyon kernel\'i: keskinlik–gürültü dengesi.' },
  { t: 'FBP', d: 'Filtreli geri izdüşüm: görüntü açı açı nasıl oluşur, az açıyla ne olur?' },
  { t: 'HU ve pencere', d: 'Hounsfield ölçeği, pencere genişliği/seviyesi ile gri tonlama.' },
  { t: 'İteratif rekon', d: 'Tahmin et → ileri izdüşür → ölçümle karşılaştır → düzelt; gürültü modeli ve düzenlileştirme.', star: true },
  { t: 'Artefakt atlası', d: 'Işın sertleşmesi, metal, hareket, kısmi hacim, halka, foton açlığı… zincirin hangi halkasında doğar?', star: true },
];

function StripCard({ k, title, desc, stage, children }: { k: string; title: string; desc: ReactNode; stage: number; children: ReactNode }) {
  return (
    <div
      className="fxov-card"
      role="button"
      tabIndex={0}
      title={`Aşama ${stage}'e git`}
      onClick={() => goStage(stage)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goStage(stage);
        }
      }}
    >
      <div className="h">
        <span className="k">{k}</span>
        {title}
      </div>
      {children}
      <div className="d">{desc}</div>
      <div className="go">Aşama {stage} →</div>
    </div>
  );
}

export function StageOverview() {
  const { main, status } = useFormation();

  return (
    <>
      <Explain title="BT ne ölçer, ne hesaplar?">
        <p>
          Bilgisayarlı tomografi (BT) vücudun içini doğrudan “fotoğraflamaz”. Tüp ve dedektör hastanın etrafında dönerken, vücuttan geçen
          <b> çok sayıda ışın çizgisi</b> boyunca X-ışınının ne kadar zayıfladığı <b>yüzlerce farklı açıdan</b> ölçülür. Her ölçüm, o çizgi
          üzerindeki zayıflatma katsayılarının toplamıdır (çizgi integrali).
        </p>
        <p>
          Bilgisayar bu çizgi toplamlarından geriye doğru giderek kesitteki her noktanın <b>lineer zayıflatma katsayısını μ(x, y)</b> hesaplar
          (rekonstrüksiyon) ve sonucu suya göre ölçeklenmiş <b>Hounsfield birimi (HU)</b> olarak gri tonlarla gösterir.
        </p>
      </Explain>

      <Formula note="Her dedektör okuması = bir ışın çizgisi L boyunca μ'nün toplamı. Rekonstrüksiyon, tüm çizgi toplamlarından μ(x, y)'yi geri hesaplar.">
        I = I₀ · e<sup>−∫<sub>L</sub> μ(x, y) dl</sup> &nbsp;⇒&nbsp; p<sub>L</sub> = −ln(I / I₀) = ∫<sub>L</sub> μ dl &nbsp;⇒&nbsp; μ(x, y) &nbsp;⇒&nbsp; HU
      </Formula>

      <h4 className="fxov-sec">Bu kesit için gerçek ara veriler (tıklayın → ilgili aşama)</h4>
      {!main ? (
        <NeedData status={status} />
      ) : (
        <>
          <div className="fxov-strip">
            <StripCard k="1" title="Nesne μ" stage={1} desc="Gerçek (gürültüsüz) zayıflatma haritası · W 400 / L 40">
              <ImageView data={main.truthHU} w={main.m} h={main.m} aspect={1} win={wl(400, 40)} />
            </StripCard>
            <StripCard k="2" title="Sinogram" stage={4} desc="Ölçülen çizgi integralleri p: dikey θ 0→180°, yatay s −250→+250 mm">
              <ImageView data={main.p} w={main.rgeo.nb} h={main.rgeo.nv} aspect={1.4} />
            </StripCard>
            <StripCard k="3" title="Filtrelenmiş sinogram" stage={8} desc="Rampa × kernel filtresi sonrası q (mavi negatif, turuncu pozitif)">
              <ImageView data={main.q} w={main.rgeo.nb} h={main.rgeo.nv} aspect={1.4} cmap="div" />
            </StripCard>
            <StripCard k="4" title="Görüntü" stage={9} desc="FBP ile geri hesaplanan kesit (HU) · W 400 / L 40">
              <ImageView data={main.fbpHU} w={main.m} h={main.m} aspect={1} win={wl(400, 40)} />
            </StripCard>
          </div>
          <div className="fx-stats">
            <StatChip label="Görünüm × kanal" value={`${main.geo.nv} × ${main.geo.nb}`} />
            <StatChip label="Görüntü matrisi" value={`${main.m} × ${main.m}`} />
            <StatChip label="Piksel" value={`${main.pix.toFixed(2)} mm`} />
            <StatChip label="E_ref" value={`${main.eRef.toFixed(0)} keV`} />
            <StatChip label="FBP gürültü σ" value={`${main.fbpNoise.toFixed(1)} HU`} tone="a" />
            <StatChip label="Hata (RMSE)" value={`${main.fbpRmse.toFixed(1)} HU`} tone="b" />
          </div>
          <div className="fx-cap" style={{ textAlign: 'left' }}>
            Sinogramlarda her satır bir görünüm açısı, her sütun bir dedektör kanalıdır; ayrıntılı gösterim ilgili aşamalardadır. Sol baştaki
            “gerçek nesne” ile sağdaki görüntü arasındaki fark (gürültü, bulanıklık, artefakt) tüm zincirin toplam etkisidir.
          </div>
        </>
      )}

      <h4 className="fxov-sec">Görüntü zinciri (bir halkaya tıklayın)</h4>
      <PipelineMap onPick={(s) => goStage(CHAIN_TO_STAGE[s])} />

      <div className="fxov-hl">
        <Explain title="İteratif rekonstrüksiyon nedir? (Aşama 11)">
          <p>
            FBP tek geçişte analitik bir formülle görüntü üretir. İteratif yöntemler ise bir tahminle başlar, bu tahminden “ölçülmesi gereken”
            sinogramı hesaplar, gerçek ölçümle karşılaştırır ve farkı görüntüye geri yansıtarak düzeltir; bunu defalarca tekrarlar. Foton
            istatistiği (gürültü modeli) ve düzenlileştirme sayesinde düşük dozda daha az gürültü elde edilebilir.
          </p>
          <button className="btn sm primary" onClick={() => goStage(11)}>
            İteratif rekonstrüksiyona git →
          </button>
        </Explain>
        <Explain title="Artefaktlar nasıl oluşur? (Aşama 12)">
          <p>
            Artefakt, rekonstrüksiyonun varsayımlarından (tek enerjili ışın, hareketsiz hasta, yeterli foton, kusursuz dedektör…) birinin
            bozulmasıyla görüntüde ortaya çıkan, nesnede olmayan yapıdır. Atlas, her artefaktı zincirin hangi halkasında doğduğuyla birlikte,
            ideal / artefaktlı / düzeltilmiş hâliyle gösterir.
          </p>
          <button className="btn sm primary" onClick={() => goStage(12)}>
            Artefakt atlasına git →
          </button>
        </Explain>
      </div>

      <h4 className="fxov-sec">Tüm aşamalar</h4>
      <div className="fxov-list">
        {STAGE_LIST.map((s, i) => (
          <button key={i} className={'fxov-item' + (s.star ? ' star' : '')} onClick={() => goStage(i)}>
            <span className="n">{i}</span>
            <span className="t">{s.t}</span>
            <span>{s.d}</span>
          </button>
        ))}
      </div>

      <Points
        title="Nasıl kullanılır?"
        items={[
          <>Üst çubuktan kaynak bölgeyi, kVp, etkin mAs, kernel ve kesit kalınlığını değiştirin; tüm aşamalar yeniden hesaplanır.</>,
          <>Her aşama, ana simülatördeki tarama zinciriyle aynı fizik modelini (spektrum, Beer–Lambert, Poisson gürültüsü, sertleşme düzeltmesi, FBP) kullanan gerçek ara verileri gösterir.</>,
          <>Soldaki listeden veya alttaki ileri/geri düğmeleriyle aşamalar arasında gezinin; görüntülerin üzerine gelerek değer okuyabilirsiniz.</>,
          <>Bu, sentetik bir eğitim fantomuyla yapılan basitleştirilmiş bir simülasyondur (tek kesit, 2B paralel ışın geometrisi); klinik veri veya klinik tanı amacı yoktur.</>,
        ]}
      />
    </>
  );
}
