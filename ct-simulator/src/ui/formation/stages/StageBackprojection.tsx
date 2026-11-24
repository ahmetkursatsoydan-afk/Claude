/**
 * Görüntü oluşumu gezgini – Aşama: Basit (filtresiz) geri izdüşüm.
 *  - k eşit aralıklı görünümle filtresiz geri izdüşüm (StepPlayer)
 *  - gerçek nesneyle karşılaştırma ve normalize yatay profil
 *  - nokta kaynağın geri izdüşümü (yıldız → 1/r halesi), yerel analitik hesap
 */
import { useCallback, useMemo, useState } from 'react';
import { LineChart } from '../../physics/LineChart';
import { Slider, Toggle } from '../../controls';
import { useFormation, NeedData, ImageView, Explain, Points, Formula, Figure, StatChip, StepPlayer, autoWindow, imageRow, pixToMm, SERIES } from '../common';

/** Dizinin min–maks ile [0,1]'e ölçeklenmiş noktaları. */
function normPts(a: ArrayLike<number>, x: (i: number) => number): [number, number][] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  const out: [number, number][] = [];
  for (let i = 0; i < a.length; i++) out.push([x(i), (a[i] - lo) * k]);
  return out;
}

/** Merkezdeki nokta kaynağın k eşit aralıklı görünümle filtresiz geri izdüşümü (görünüm başına ortalama). */
function pointBp(k: number, n: number): Float32Array {
  const out = new Float32Array(n * n);
  const h = (n - 1) / 2;
  for (let v = 0; v < k; v++) {
    const th = (v * Math.PI) / k;
    const c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < n; j++) {
      const y = j - h;
      const o = j * n;
      for (let i = 0; i < n; i++) {
        // ışın: x·cosθ + y·sinθ = 0; piksel genişliğinde üçgen ağırlık
        const d = Math.abs((i - h) * c + y * s);
        if (d < 1) out[o + i] += 1 - d;
      }
    }
  }
  const inv = 1 / k;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

const PSF_N = 129;

export function StageBackprojection() {
  const { main, status } = useFormation();
  const set = main?.even?.unfiltered ?? null;
  const [idx, setIdx] = useState(0);
  const [finalWin, setFinalWin] = useState(false);
  const [showRays, setShowRays] = useState(true);
  const [row, setRow] = useState<number | null>(null);

  // her kare için yüzdelik pencere (dış SFOV = 0 hariç)
  const wins = useMemo(() => (set ? set.imgs.map((im) => autoWindow(im, 0.01, 0.995, (v) => v === 0)) : []), [set]);
  const truthWin = useMemo(() => (main ? autoWindow(main.truthHU, 0.01, 0.99, (v) => v <= -1000) : { lo: -200, hi: 200 }), [main]);

  const n = set ? set.k.length : 0;
  const i = Math.max(0, Math.min(n - 1, idx));
  const k = set ? set.k[i] : 1;
  const psf = useMemo(() => pointBp(k, PSF_N), [k]);

  const m = main?.m ?? 320;
  const j = row ?? Math.floor(m / 2);
  const img = set ? set.imgs[i] : null;

  const prof = useMemo(() => {
    if (!main || !img) return [];
    const x = (ii: number) => pixToMm(ii, main.m, main.pix);
    return [
      { name: 'gerçek nesne (HU)', color: SERIES[0], pts: normPts(imageRow(main.truthHU, main.m, j), x) },
      { name: `filtresiz GİZ (${k} görünüm)`, color: SERIES[1], pts: normPts(imageRow(img, main.m, j), x) },
      { name: 'FBP (sonraki aşamalar)', color: SERIES[2], pts: normPts(imageRow(main.fbpHU, main.m, j), x), dash: true, width: 1 },
    ];
  }, [main, img, j, k]);

  const onPick = useCallback((_fx: number, fy: number) => setRow(Math.max(0, Math.min(m - 1, Math.round(fy)))), [m]);

  if (!main) return <NeedData status={status} />;
  if (!set || !img) return <div className="fx-need">Aşamalı geri izdüşüm verisi bu hesaplamada yok – üstteki “Hesapla” ile yeniden hesaplayın.</div>;

  const win = finalWin ? wins[n - 1] : wins[i];
  const yMm = pixToMm(j, m, main.pix);

  const rowOverlay = (g: CanvasRenderingContext2D, ts: (fx: number, fy: number) => [number, number]) => {
    const [x0, y] = ts(-0.5, j);
    const [x1] = ts(m - 0.5, j);
    g.strokeStyle = 'rgba(255,214,90,0.8)';
    g.setLineDash([5, 4]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
  };
  const bpOverlay = (g: CanvasRenderingContext2D, ts: (fx: number, fy: number) => [number, number]) => {
    rowOverlay(g, ts);
    if (!showRays || k > 16) return;
    // kullanılan görünümlerin ışın yönleri: (−sinθ, cosθ); görüntüde y aşağı doğru artar
    const h = (m - 1) / 2, r = 0.47 * m;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(80,200,255,0.9)';
    g.lineWidth = 1.5;
    for (let v = 0; v < k; v++) {
      const th = (v * Math.PI) / k;
      const dx = -Math.sin(th), dy = Math.cos(th);
      for (const sg of [-1, 1]) {
        const [ax, ay] = ts(h + sg * dx * r, h + sg * dy * r);
        const [bx, by] = ts(h + sg * dx * (r - 0.06 * m), h + sg * dy * (r - 0.06 * m));
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
    }
  };

  return (
    <>
      <Explain title="Fikir: ölçümü geldiği ışın boyunca geri yaymak">
        <p>
          Her projeksiyon değeri p(θ, s) yalnızca bir ışın boyunca toplam zayıflatmayı söyler; bu toplamın ışının hangi noktasından geldiğini bilmeyiz. En basit tahmin, değeri o ışının geçtiği <b>tüm piksellere eşit olarak</b>{' '}
          “sıvamaktır” (geri izdüşüm). Tüm açılar için bu yapılıp toplandığında, gerçekten yoğun olan noktalar pek çok açıdan katkı aldığı için belirginleşir; ancak her katkı ışının tamamına yayıldığından görüntü <b>bulanık</b> kalır.
        </p>
      </Explain>
      <Formula note="Görünüm başına ortalama (π/k ağırlığı); filtre yok. (x, y) noktası her açıda s = x cosθ + y sinθ konumundaki ışından değer alır.">
        b(x, y) = (π/k) · Σ<sub>θ</sub> p(θ, x cosθ + y sinθ)
      </Formula>

      <StepPlayer count={n} index={i} onChange={setIdx} label={`${k} görünüm (Δθ = ${(180 / k).toFixed(k >= 60 ? 2 : 1)}°)`} fps={1.5} />
      <div className="fx-ctrl">
        <Toggle value={finalWin} onChange={setFinalWin} label="Son karenin (tüm görünümler) penceresini kullan" />
        <Toggle value={showRays} onChange={setShowRays} label="Işın yönlerini göster (k ≤ 16)" />
      </div>

      <Figure cols={2}>
        <ImageView
          data={img}
          w={m}
          h={m}
          win={win}
          aspect={1}
          tag={`filtresiz geri izdüşüm · ${k} görünüm`}
          overlay={bpOverlay}
          overlayKey={`${j}-${k}-${showRays}`}
          onDown={onPick}
          onDrag={onPick}
          caption={
            <>
              {finalWin ? 'Sabit pencere (tüm görünümlerin görüntüsüne göre): az görünümde değerler kısmen tek ışınlardan geldiği için desen farklı parlaklıkta görünür.' : 'Pencere her karede kendi %1–99,5 yüzdeliklerinden otomatik ayarlanır.'}{' '}
              Mavi çentikler kullanılan ışın yönlerini gösterir. Tıklayarak profil satırını seçin.
            </>
          }
        />
        <ImageView
          data={main.truthHU}
          w={m}
          h={m}
          win={truthWin}
          aspect={1}
          tag="gerçek nesne (HU)"
          overlay={rowOverlay}
          overlayKey={j}
          onDown={onPick}
          onDrag={onPick}
          caption={`Karşılaştırma: fantomun E_ref = ${main.eRef.toFixed(0)} keV'deki gerçek HU haritası (pencere ${truthWin.lo.toFixed(0)} … ${truthWin.hi.toFixed(0)} HU).`}
        />
      </Figure>

      <div className="fx-ctrl">
        <span className="lab">Profil satırı: y = {yMm.toFixed(1)} mm</span>
        <div style={{ flex: '1 1 200px', maxWidth: 380 }}>
          <Slider value={j} min={0} max={m - 1} step={1} onChange={(x) => setRow(Math.round(x))} />
        </div>
      </div>
      <LineChart series={prof} xLabel="x (mm, izomerkezden)" yLabel="Normalize değer (min–maks → 0–1)" yMin={-0.05} yMax={1.05} fmtY={(v) => v.toFixed(1)} height={250} />
      <div className="fx-cap">
        Her eğri kendi satırındaki minimum ve maksimuma göre 0–1 aralığına ölçeklenmiştir (birimleri farklı olduğu için yalnızca şekil karşılaştırılır). Filtresiz geri izdüşümde keskin kenarlar yuvarlanır, nesne dışına doğru uzanan
        “etek” (hale) oluşur ve küçük yapılar kaybolur. Kesikli yeşil eğri, rampa filtresi eklenince (FBP) kenarların geri geldiğini gösterir.
      </div>

      <Figure cols={2}>
        <ImageView
          data={psf}
          w={PSF_N}
          h={PSF_N}
          win={{ lo: 0, hi: 0.25 }}
          aspect={1}
          pixelated
          tag={`nokta kaynak · ${k} görünüm`}
          caption="Tek bir noktanın filtresiz geri izdüşümü (nokta yayılım fonksiyonu, analitik hesap). Az görünümde her ışın bir çizgi olarak görülür (yıldız); görünüm arttıkça çizgiler birleşip merkezden uzaklaştıkça 1/r ile azalan bir hale oluşturur."
        />
        <div>
          <div className="fx-stats">
            <StatChip label="görünüm sayısı k" value={k} tone="a" />
            <StatChip label="açı aralığı Δθ" value={`${(180 / k).toFixed(2)}°`} />
            <StatChip label="toplam görünüm" value={main.rgeo.nv} />
          </div>
          <Explain title="Neden bulanık? (Fourier dilim teoremi)">
            <p>
              Her projeksiyonun 1B Fourier dönüşümü, nesnenin 2B Fourier uzayından o açıda merkezden geçen bir <b>dilimdir</b> (merkezi dilim teoremi). Projeksiyonlar ışınsal (radyal) dilimler olarak örneklendiğinden merkez — yani
              düşük uzaysal frekanslar — çok sık, kenarlar seyrek örneklenir: örnek yoğunluğu ~1/|f| ile azalır.
            </p>
            <p>
              Sonuç: düşük frekanslar fazla ağırlıklandırılır ve elde edilen görüntü, gerçek görüntünün <b>1/r çekirdeğiyle konvolüsyonudur</b>. Çözüm, geri izdüşümden önce her projeksiyonu frekans uzayında |f| ile ağırlıklandırmaktır
              (<b>rampa filtresi</b>) → sonraki aşama: filtreli geri izdüşüm.
            </p>
          </Explain>
          <Formula note="F: Fourier dönüşümü; * : 2B konvolüsyon">b = f * (1/r) ⇔ B(u, v) = F(u, v) / |f|</Formula>
        </div>
      </Figure>

      <Points
        items={[
          <>
            <b>1 görünüm:</b> görüntü tek yönde uzanan şeritlerden oluşur – nesnenin o açıdan “gölgesi” ışın boyunca uzatılmıştır.
          </>,
          <>
            <b>2–8 görünüm:</b> şeritler kesişir; yoğun yapılardan çıkan <b>yıldız</b> deseni görülür. Nesnenin konumu belirmeye başlar ama şekli belirsizdir.
          </>,
          <>
            <b>Tüm görünümler:</b> nesne eksiksiz ama belirgin şekilde bulanıktır; nesne dışında yavaşça azalan bir hale vardır, kontrast azalır.
          </>,
          <>Keskin kenarlar ve küçük detaylar (yüksek frekanslar) kaybolur; görünüm sayısı artırmak bunu düzeltmez – eksik olan örnekleme değil, frekans ağırlıklandırmasıdır.</>,
          <>Gerçek tarayıcılar filtresiz geri izdüşüm görüntüsü üretmez; bu aşama, filtrelemenin neden gerekli olduğunu göstermek için ayrıca hesaplanmıştır (basitleştirilmiş eğitim simülasyonu, paralel ışın geometrisi).</>,
        ]}
      />
    </>
  );
}
