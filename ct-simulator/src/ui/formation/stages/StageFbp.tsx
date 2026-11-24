/**
 * Görüntü oluşumu gezgini – aşama 9: Filtreli geri izdüşüm (FBP).
 * Görüntü, filtrelenmiş projeksiyonların açı açı geri izdüşümüyle oluşur: eşit aralıklı seyrek
 * açılar (çizgi artefaktı / alt örnekleme) veya gantri dönerken ardışık açılar (sınırlı açı).
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../../../state/store';
import { Seg } from '../../controls';
import { useFormation, NeedData, ImageView, ColorBar, Explain, Points, Formula, Figure, StatChip, StepPlayer, wl, pixToMm } from '../common';

type Mode = 'even' | 'seq';
type WinId = 'soft' | 'wide' | 'bone' | 'lung';
type ErrTarget = 'final' | 'current';

const WINDOWS: Record<WinId, { l: string; ww: number; wl: number }> = {
  soft: { l: 'Yumuşak 400/40', ww: 400, wl: 40 },
  wide: { l: 'Geniş 1000/0', ww: 1000, wl: 0 },
  bone: { l: 'Kemik 2000/500', ww: 2000, wl: 500 },
  lung: { l: 'Akciğer 1500/−600', ww: 1500, wl: -600 },
};

const ERR_RANGE = 100;

/** Başka bir aşamaya geçiş bağlantısı. */
function StageLink({ i, children }: { i: number; children: ReactNode }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        const st = useApp.getState();
        st.set({ formation: { ...st.formation, stage: i } });
      }}
    >
      {children}
    </a>
  );
}

function diffImg(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

/** RMSE (HU), yalnız SFOV içinde ve gerçek > −500 HU (hava/dış ortam hariç) – motorun fbpRmse tanımıyla aynı. */
function rmse(img: Float32Array, truth: Float32Array): number {
  let se = 0, n = 0;
  for (let i = 0; i < img.length; i++) {
    const t = truth[i];
    if (t > -500) {
      const d = img[i] - t;
      se += d * d;
      n++;
    }
  }
  return n ? Math.sqrt(se / n) : 0;
}

export function StageFbp() {
  const { main, status } = useFormation();
  const [mode, setMode] = useState<Mode>('even');
  const [idxEven, setIdxEven] = useState(-1); // −1 = son (tüm görünümler)
  const [idxSeq, setIdxSeq] = useState(-1);
  const [win, setWin] = useState<WinId>('soft');
  const [errT, setErrT] = useState<ErrTarget>('final');
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const set = mode === 'even' ? main?.even?.filtered : main?.sequential;
  const count = set?.k.length ?? 0;
  const rawIdx = mode === 'even' ? idxEven : idxSeq;
  const idx = count ? (rawIdx < 0 || rawIdx >= count ? count - 1 : rawIdx) : 0;
  const setIdx = useCallback((i: number) => (mode === 'even' ? setIdxEven(i) : setIdxSeq(i)), [mode]);

  const cur = set ? set.imgs[idx] : null;
  const k = set ? set.k[idx] : 0;

  const finalErr = useMemo(() => (main ? diffImg(main.fbpHU, main.truthHU) : null), [main]);
  const curErr = useMemo(() => (main && cur && errT === 'current' ? diffImg(cur, main.truthHU) : null), [main, cur, errT]);
  const curRmse = useMemo(() => (main && cur ? rmse(cur, main.truthHU) : 0), [main, cur]);

  if (!main) return <NeedData status={status} />;
  const { m, pix } = main;
  const nvR = main.rgeo.nv;
  const W = WINDOWS[win];
  const win2 = wl(W.ww, W.wl);
  const errData = errT === 'final' ? finalErr : curErr;

  const stepDeg = nvR > 0 ? 180 / nvR : 0;
  const label =
    !set
      ? '—'
      : mode === 'even'
        ? `${k} görünüm (her ≈ ${(180 / k).toFixed(k >= 60 ? 1 : 0)}°)`
        : `${k} görünüm (≈ 0–${(k * stepDeg).toFixed(0)}°)`;

  const hv = (() => {
    if (!hover) return null;
    const { i, j } = hover;
    if (i < 0 || j < 0 || i >= m || j >= m) return null;
    const q = j * m + i;
    return {
      x: pixToMm(i, m, pix),
      y: pixToMm(j, m, pix),
      cur: cur ? cur[q] : NaN,
      fin: main.fbpHU[q],
      tru: main.truthHU[q],
    };
  })();
  const onHover = (fx: number, fy: number) => {
    const i = Math.round(fx), j = Math.round(fy);
    if (!hover || hover.i !== i || hover.j !== j) setHover({ i, j });
  };
  const onLeave = () => setHover(null);
  const cross = (g: CanvasRenderingContext2D, toS: (fx: number, fy: number) => [number, number]) => {
    if (!hover) return;
    const [x, y] = toS(hover.i, hover.j);
    g.strokeStyle = '#ffe08a';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.stroke();
  };
  const hk = hover ? hover.i * 10000 + hover.j : -1;

  return (
    <>
      <Explain title="Filtreli geri izdüşüm: aynı geri izdüşüm, bu kez filtrelenmiş projeksiyonlarla">
        <p>
          Geri izdüşüm işlemi, filtresiz aşamadakiyle aynıdır: her açının projeksiyonu, ışın yönü boyunca görüntüye yayılır ve tüm açılar
          toplanır. Fark, artık yayılan şeyin <b>filtrelenmiş</b> projeksiyon q olmasıdır. q’daki negatif yan loblar, komşu açılardan gelen
          “hale”yi iptal eder; yeterli sayıda açı toplandığında bulanıklık kaybolur ve keskin, doğru HU değerli bir görüntü kalır.
        </p>
        <p>
          <b>Az sayıda görünüm</b> varsa iptal tamamlanmaz: her açının izi, yoğun cisimlerden yayılan ince <b>çizgiler (streak)</b> olarak
          görünür – açısal alt örnekleme (aliasing). <b>Açıların yalnızca bir kısmı</b> (ör. ilk 90°) toplanmışsa bazı yönlerden hiç bilgi
          yoktur: kenarlar eksik yönde bulanık ve çizgili kalır (sınırlı açı). Paralel ışın geometrisinde 0–180° tam veri için yeterlidir
          (180–360° aynı ışınları ters yönden tekrarlar).
        </p>
        <p>
          FBP hızlıdır ve gürültüsüz, eksiksiz ideal veride matematiksel olarak tamdır. Ancak her ışını eşit ağırlıkla kullanır; foton
          sayısının az olduğu (gürültülü) ışınları ayırt etmez. Bu yüzden kuantum gürültüsü ve tutarsız veriden doğan çizgiler doğrudan
          görüntüye taşınır – iteratif rekonstrüksiyon (<StageLink i={11}>aşama 11</StageLink>) bunu istatistiksel bir modelle ele alır; artefaktların kökeni için artefakt
          atlasına (<StageLink i={12}>aşama 12</StageLink>) bakın.
        </p>
      </Explain>

      <Formula note="q_θ = p_θ ∗ h (filtrelenmiş projeksiyon); toplam, eşit aralıklı K açı üzerinden alınır. Simülasyonda paralel ışın geometrisi kullanılır.">
        μ(x, y) ≈ (π / K) · Σ<sub>k=1…K</sub> q<sub>θk</sub>(x cos θ<sub>k</sub> + y sin θ<sub>k</sub>)
      </Formula>

      <div className="fx-ctrl">
        <Seg
          value={mode}
          options={[
            { v: 'even' as Mode, l: 'Eşit aralıklı açılar', title: 'K görünüm, 180° boyunca eşit aralıklarla' },
            { v: 'seq' as Mode, l: 'Gantri dönerken (ardışık açılar)', title: '0°’den başlayıp ardışık görünümler eklenir' },
          ]}
          onChange={setMode}
        />
        <span className="lab">Pencere</span>
        <Seg value={win} options={(Object.keys(WINDOWS) as WinId[]).map((w) => ({ v: w, l: WINDOWS[w].l }))} onChange={setWin} />
      </div>

      {set ? (
        <StepPlayer count={count} index={idx} onChange={setIdx} label={label} />
      ) : (
        <div className="fx-need">Aşamalı geri izdüşüm verisi bu hesaplamada yok – “Hesapla” ile yeniden deneyin.</div>
      )}

      <div className="fx-stats">
        <StatChip label="Gürültü σ (son FBP)" value={`${main.fbpNoise.toFixed(1)} HU`} tone="a" />
        <StatChip label="RMSE vs gerçek (son FBP)" value={`${main.fbpRmse.toFixed(1)} HU`} tone="b" />
        <StatChip label="Görünüm sayısı" value={`${nvR} / 180°`} />
        {set && <StatChip label="Bu adımda RMSE" value={`${curRmse.toFixed(0)} HU`} tone={curRmse > main.fbpRmse * 1.5 ? 'warn' : 'ok'} />}
      </div>

      <Figure cols={3}>
        <ImageView
          data={cur}
          w={m}
          h={m}
          aspect={1}
          win={win2}
          tag={set ? `FBP · ${label}` : 'FBP'}
          overlay={cross}
          overlayKey={hk}
          onHover={onHover}
          onLeave={onLeave}
          caption={
            mode === 'even'
              ? 'Kısmi FBP: 180°’ye eşit dağılmış K filtrelenmiş projeksiyon. Az görünümde yoğun yapılardan yayılan ince çizgilere dikkat.'
              : 'Kısmi FBP: 0°’den itibaren ardışık açılar (eksik açılar, toplanan kısmın ağırlığıyla yeniden ölçeklenmiştir). Eksik yönlerde kenarlar bulanık/çizgili.'
          }
        />
        <ImageView
          data={main.truthHU}
          w={m}
          h={m}
          aspect={1}
          win={win2}
          tag="gerçek nesne (HU)"
          overlay={cross}
          overlayKey={hk}
          onHover={onHover}
          onLeave={onLeave}
          caption={`Gerçek nesne: fantomun ${main.eRef.toFixed(0)} keV’deki HU haritası (karşılaştırma referansı).`}
        />
        <div>
          <ImageView
            data={errData}
            w={m}
            h={m}
            aspect={1}
            cmap="div"
            divRange={ERR_RANGE}
            tag={errT === 'final' ? 'hata: son FBP − gerçek' : 'hata: bu adım − gerçek'}
            overlay={cross}
            overlayKey={hk}
            onHover={onHover}
            onLeave={onLeave}
            caption="Hata haritası (±100 HU): turuncu = FBP gerçekten yüksek, mavi = düşük. Gürültü, kalan artefaktlar ve kenar (çözünürlük) farkları görünür."
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <ColorBar cmap="div" lo={-ERR_RANGE} hi={ERR_RANGE} unit="HU" />
            <Seg
              value={errT}
              options={[
                { v: 'final' as ErrTarget, l: 'Son FBP' },
                { v: 'current' as ErrTarget, l: 'Bu adım', title: 'Kaydırıcıdaki kısmi görüntünün hatası' },
              ]}
              onChange={setErrT}
            />
          </div>
        </div>
      </Figure>

      <div className="fx-cap" style={{ textAlign: 'left', minHeight: '1.4em' }}>
        {hv
          ? `x = ${hv.x.toFixed(0)} mm, y = ${hv.y.toFixed(0)} mm · bu adım: ${isFinite(hv.cur) ? hv.cur.toFixed(0) : '—'} HU · son FBP: ${hv.fin.toFixed(0)} HU · gerçek: ${hv.tru.toFixed(0)} HU · hata (son): ${(hv.fin - hv.tru).toFixed(0)} HU`
          : 'Değerleri okumak için imleci görüntülerden birinin üzerinde gezdirin.'}
      </div>

      <Points
        items={[
          <>Eşit aralıklı modda 1–8 görünümle başlayın: her açının izi tek tek seçilir. Görünüm arttıkça çizgiler incelir ve birbirini iptal eder; ~{Math.min(nvR, 120)} görünümde görüntü neredeyse son hâline ulaşır.</>,
          <>Ardışık modda ilk adımlarda (≈ 11–45°) görüntü yalnızca bazı yönlerde keskindir; 180°’ye ulaşıldığında eksik yön kalmaz. (Gerçek tarayıcılar yelpaze ışınla 180° + yelpaze açısı kadar veri toplar.)</>,
          <>Hata haritasında üç bileşen görürsünüz: rastgele gürültü (benekli doku), kalan artefaktlar (çizgiler, sertleşme gölgeleri) ve kenarlarda çözünürlük farkı (bulanıklık nedeniyle kenar boyunca pozitif–negatif çift).</>,
          <>Bu hata haritası yalnızca simülasyonda mümkündür: gerçek hastada “gerçek” görüntü bilinmez. RMSE, hava dışındaki (gerçek &gt; −500 HU) pikseller üzerinden hesaplanır.</>,
          <>Kernel’i (üst çubuk) kemik yapın: σ artar, kenar hataları azalır – çözünürlük/gürültü dengesi.</>,
        ]}
      />
    </>
  );
}
