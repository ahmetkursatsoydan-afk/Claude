/**
 * Görüntü oluşumu gezgini – aşama 4: Sinogram.
 * Tüm açılardan alınan projeksiyonların üst üste dizilmesi; nesnedeki her noktanın sinogramda
 * çizdiği sinüs eğrisi (Radon dönüşümü). Görüntüye tıklayınca noktanın eğrisi, sinogram üzerinde
 * gezinince ilgili ışın görüntüye çizilir.
 */
import { useMemo, useState } from 'react';
import { Seg } from '../../controls';
import { useFormation, ImageView, Explain, Points, Formula, Figure, StatChip, NeedData, autoWindow, wl, binToMm, pixToMm, ColorBar } from '../common';

type Mode = 'mono' | 'poly' | 'meas';

const MODES: { v: Mode; l: string; title: string }[] = [
  { v: 'mono', l: 'İdeal (mono)', title: 'Tek enerjili (E_ref) ideal çizgi integralleri – gürültüsüz, ışın sertleşmesiz' },
  { v: 'poly', l: 'Polikromatik', title: 'Gerçek spektrumla −ln(I/I₀) – gürültüsüz, ışın sertleşmesi var' },
  { v: 'meas', l: 'Ölçülen (gürültülü, düzeltilmiş)', title: 'Foton gürültülü ölçüm; log + sertleşme düzeltmesi sonrası rekonstrüksiyon girdisi' },
];

const MARK = '#ffd54a';
const RAY = '#3fd0ff';

export function StageSinogram() {
  const { main, status } = useFormation();
  const [mode, setMode] = useState<Mode>('meas');
  const [pick, setPick] = useState<{ i: number; j: number } | null>(null);
  const [hover, setHover] = useState<{ v: number; b: number } | null>(null);

  // varsayılan nokta: SFOV içinde (merkezden biraz uzakta) en yüksek HU'lu piksel
  const defPt = useMemo(() => {
    if (!main) return null;
    const { m, pix, truthHU } = main;
    let best = -Infinity, bi = Math.floor(m / 2), bj = Math.floor(m / 2);
    for (const rMin of [25, 0]) {
      for (let j = 0; j < m; j++)
        for (let i = 0; i < m; i++) {
          const x = pixToMm(i, m, pix), y = pixToMm(j, m, pix);
          const r = Math.hypot(x, y);
          if (r < rMin || r > 240) continue;
          const v = truthHU[j * m + i];
          if (v > best) {
            best = v;
            bi = i;
            bj = j;
          }
        }
      if (best > 300) break;
    }
    return { i: bi, j: bj };
  }, [main]);

  // tüm modlar için ortak pencere (ideal sinogram) → modlar arası farklar görünür kalır
  const win = useMemo(() => {
    if (!main) return { lo: 0, hi: 1 };
    const a = autoWindow(main.monoLine, 0.01, 0.995);
    return { lo: 0, hi: Math.max(0.5, a.hi) };
  }, [main]);

  if (!main) return <NeedData status={status} />;

  const { m, pix, truthHU, geo, rgeo } = main;
  const sg = mode === 'meas' ? rgeo : geo;
  const data = mode === 'mono' ? main.monoLine : mode === 'poly' ? main.polyLine : main.p;
  const { nv, nb, ds } = sg;
  const half = (m - 1) / 2;
  const cb = (nb - 1) / 2;
  const pt = pick ?? defPt ?? { i: Math.round(half), j: Math.round(half) };
  const px = pixToMm(pt.i, m, pix), py = pixToMm(pt.j, m, pix);
  const r = Math.hypot(px, py);
  const phi = (Math.atan2(py, px) * 180) / Math.PI;
  const ptHU = truthHU[pt.j * m + pt.i];

  // gezinilen ışın (θ, s)
  const hv = hover && hover.v >= 0 && hover.v < nv && hover.b >= 0 && hover.b < nb ? hover : null;
  const hTheta = hv ? (hv.v * Math.PI) / nv : 0;
  const hS = hv ? binToMm(hv.b, nb, ds) : 0;
  const hP = hv ? data[hv.v * nb + hv.b] : 0;

  const imgOverlay = (g: CanvasRenderingContext2D, T: (fx: number, fy: number) => [number, number], sc: number) => {
    const toPix = (x: number, y: number) => T(x / pix + half, y / pix + half);
    if (hv) {
      // ışın: x·cosθ + y·sinθ = s, yön (−sinθ, cosθ)
      const c = Math.cos(hTheta), s = Math.sin(hTheta);
      const x0 = hS * c, y0 = hS * s;
      const L = 260;
      const [ax, ay] = toPix(x0 - L * -s, y0 - L * c);
      const [bx, by] = toPix(x0 + L * -s, y0 + L * c);
      g.strokeStyle = RAY;
      g.lineWidth = 1.5;
      g.setLineDash([5, 3]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
      // dedektör yönü (s ekseni) – izomerkezden ışına dik
      const [ox, oy] = toPix(0, 0);
      const [fx, fy] = toPix(x0, y0);
      g.strokeStyle = 'rgba(63,208,255,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(fx, fy);
      g.stroke();
    }
    const [mx, my] = toPix(px, py);
    const rr = Math.max(5, 3 * sc);
    g.strokeStyle = MARK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx, my, rr, 0, 2 * Math.PI);
    g.stroke();
    // izomerkez
    const [cx, cy] = toPix(0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - 5, cy);
    g.lineTo(cx + 5, cy);
    g.moveTo(cx, cy - 5);
    g.lineTo(cx, cy + 5);
    g.stroke();
  };

  const sinoOverlay = (g: CanvasRenderingContext2D, T: (fx: number, fy: number) => [number, number]) => {
    // seçili noktanın sinüs eğrisi s(θ) = x cosθ + y sinθ
    g.strokeStyle = MARK;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.9;
    g.beginPath();
    for (let v = 0; v < nv; v++) {
      const th = (v * Math.PI) / nv;
      const b = (px * Math.cos(th) + py * Math.sin(th)) / ds + cb;
      const [X, Y] = T(b, v);
      if (v === 0) g.moveTo(X, Y);
      else g.lineTo(X, Y);
    }
    g.stroke();
    g.globalAlpha = 1;
    if (hv) {
      const [x0, y0] = T(-0.5, hv.v);
      const [x1] = T(nb - 0.5, hv.v);
      g.strokeStyle = 'rgba(63,208,255,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y0);
      g.stroke();
      const [hx, hy] = T(hv.b, hv.v);
      g.fillStyle = RAY;
      g.beginPath();
      g.arc(hx, hy, 3.5, 0, 2 * Math.PI);
      g.fill();
    }
  };

  const decim = rgeo.nv !== geo.nv;
  const sAt = (thDeg: number) => px * Math.cos((thDeg * Math.PI) / 180) + py * Math.sin((thDeg * Math.PI) / 180);

  return (
    <>
      <Explain title="Projeksiyonları üst üste dizmek">
        <p>
          Önceki aşamada tek bir açıdan alınan projeksiyonu (bir dedektör satırı boyunca çizgi integralleri p(s)) gördük. Gantri dönerken her açıda (θ) bir projeksiyon daha
          kaydedilir. Bu projeksiyonları alt alta dizdiğimizde oluşan 2B veri tablosuna <b>sinogram</b> denir: her satır bir görünüm (θ), her sütun bir dedektör kanalı (s).
        </p>
        <p>
          Nesnedeki tek bir nokta, gantri dönerken dedektör üzerinde ileri-geri gider ve sinogramda bir <b>sinüs eğrisi</b> çizer: s(θ) = x·cosθ + y·sinθ = r·cos(θ − φ). Eğrinin{' '}
          <b>genliği</b> noktanın izomerkeze uzaklığı (r), <b>fazı</b> ise noktanın açısıdır (φ) – adı buradan gelir. İzomerkezdeki bir nokta (r = 0) dikey düz bir çizgi verir.
        </p>
      </Explain>

      <div className="fx-ctrl">
        <span className="lab">Gösterilen sinogram</span>
        <Seg value={mode} options={MODES} onChange={setMode} />
      </div>

      <Figure cols={2}>
        <ImageView
          data={truthHU}
          w={m}
          h={m}
          aspect={1}
          win={wl(1600, 200)}
          tag="Nesne (gerçek HU) – tıklayın"
          caption={
            <>
              Sarı halka: seçili nokta (bir piksele tıklayarak değiştirin). Mavi kesikli çizgi: sinogram üzerinde gezinilen ışın (x·cosθ + y·sinθ = s). Pencere W 1600 / L 200.
            </>
          }
          overlay={imgOverlay}
          overlayKey={`${pt.i},${pt.j},${hv ? hv.v + ':' + hv.b : ''},${mode}`}
          onDown={(fx, fy) => {
            const i = Math.round(fx), j = Math.round(fy);
            if (i < 0 || j < 0 || i >= m || j >= m) return;
            if (Math.hypot(pixToMm(i, m, pix), pixToMm(j, m, pix)) > 250) return;
            setPick({ i, j });
          }}
        />
        <ImageView
          data={data}
          w={nb}
          h={nv}
          aspect={1.4}
          win={win}
          tag={MODES.find((o) => o.v === mode)!.l}
          caption={
            <>
              Dikey eksen: görünüm açısı θ, yukarıdan aşağı 0° → 180° ({nv} görünüm). Yatay eksen: kanal konumu s, soldan sağa −250 → +250 mm ({nb} kanal × {ds} mm). Parlak = yüksek
              çizgi integrali (çok zayıflatma). Sarı eğri: seçili noktanın s(θ) izi.
            </>
          }
          overlay={sinoOverlay}
          overlayKey={`${pt.i},${pt.j},${hv ? hv.v + ':' + hv.b : ''},${mode}`}
          onHover={(fx, fy) => {
            const b = Math.round(fx), v = Math.round(fy);
            if (b < 0 || v < 0 || b >= nb || v >= nv) setHover(null);
            else if (!hover || hover.b !== b || hover.v !== v) setHover({ v, b });
          }}
          onLeave={() => setHover(null)}
          cursor="crosshair"
        />
      </Figure>

      <div className="fx-stats">
        <StatChip label="Nokta (x, y)" value={`${px.toFixed(0)}, ${py.toFixed(0)} mm`} tone="a" />
        <StatChip label="Genlik r" value={`${r.toFixed(1)} mm`} />
        <StatChip label="Faz φ" value={`${phi.toFixed(0)}°`} />
        <StatChip label="Noktada HU" value={ptHU.toFixed(0)} />
        <StatChip label="s(0°) / s(90°)" value={`${sAt(0).toFixed(0)} / ${sAt(90).toFixed(0)} mm`} />
        {hv ? (
          <>
            <StatChip label="Işın θ" value={`${((hv.v * 180) / nv).toFixed(1)}°`} tone="b" />
            <StatChip label="Işın s" value={`${hS.toFixed(1)} mm`} tone="b" />
            <StatChip label="p (çizgi integrali)" value={`${hP.toFixed(2)}  (e^−p = ${Math.exp(-hP) >= 0.01 ? (100 * Math.exp(-hP)).toFixed(1) + ' %' : Math.exp(-hP).toExponential(1)})`} tone="b" />
          </>
        ) : (
          <StatChip label="Işın" value="sinogramın üzerinde gezinin" />
        )}
      </div>
      <ColorBar cmap="gray" lo={win.lo} hi={win.hi} unit="p (boyutsuz)" />

      <Formula note="Radon dönüşümü: nesne μ(x, y) → sinogram p(θ, s). δ: yalnızca ışın doğrusu üzerindeki noktaları seçer. Rekonstrüksiyon = bu dönüşümün tersini almak.">
        p(θ, s) = ∬ μ(x, y) · δ(x·cosθ + y·sinθ − s) dx dy &nbsp;;&nbsp; nokta (r, φ) → s(θ) = r·cos(θ − φ)
      </Formula>

      <Explain title="Neden 180° yeterli?">
        <p>
          Bu gezginde veriler paralel ışın geometrisine yeniden gruplanmıştır (gerçek tarayıcılar yelpaze (fan) ışınıyla ölçer; “rebinning” ile paralele çevrilir). Paralel
          geometride θ ve θ + 180° açılarındaki görünümler aynı doğruları ters yönden ölçer: p(θ + 180°, s) = p(θ, −s). Dolayısıyla 0–180° arası tüm doğruları bir kez kapsar; sinogramın
          alt satırı, üst satırın soldan sağa aynalanmış hâlidir. (Yelpaze ışınında tam veri için 180° + yelpaze açısı gerekir.)
        </p>
        <p>
          Rekonstrüksiyon problemi: elimizde yalnızca bu sinogram var; ondan μ(x, y) haritasını geri bulmak (Radon dönüşümünü tersine çevirmek) gerekir. Sonraki aşamalar bunun önce
          sayım/gürültü, sonra ön işleme ve geri izdüşüm adımlarını gösterir.
          {decim && (
            <>
              {' '}
              Not: görünüm seyreltmesi açık – ölçülen sinogram yalnızca {rgeo.nv} görünüm içerir (ideal/polikromatik: {geo.nv}).
            </>
          )}
        </p>
      </Explain>

      <Points
        items={[
          <>
            <b>Parlaklık</b> = o ışın boyunca toplam zayıflatma (p = ∫μ dl). Kemik ve kalın vücut kısımlarından geçen ışınlar parlak, yalnız havadan geçenler siyahtır.
          </>,
          <>
            Sinogramdaki <b>parlak bandın genişliği</b>, nesnenin o açıdaki genişliğidir: oval bir gövdede yan (lateral) projeksiyonda bant hem daha dar hem daha parlaktır (ışın daha
            uzun yol kat eder).
          </>,
          <>
            Her yapı kendi sinüs eğrisini çizer; küçük yoğun noktalar (kemik noktaları, metal) ince parlak sinüsler olarak açıkça seçilir. Anatomik kaynaklarda (ör. üst batın) hasta masası da
            gövdenin altında ayrı, soluk bir eğri/bant olarak sinograma girer – rekonstrüksiyon için o da “nesnenin” parçasıdır.
          </>,
          <>
            Merkeze yakın bir noktaya tıklayın: eğri neredeyse dikey çizgiye döner. Kenara yakın bir noktada genlik ±r kadar büyür.
          </>,
          <>
            Modları karşılaştırın (aynı pencere): <b>polikromatik</b> sinogram kalın yollarda ideal olandan daha soluktur (ışın sertleşmesi – düşük enerjiler önce emilir, etkin μ
            düşer); <b>ölçülen</b> sinogram foton gürültüsü taşır ve sertleşme düzeltmesinden geçmiştir.
          </>,
        ]}
      />
      <p className="fx-cap" style={{ textAlign: 'left' }}>
        Basitleştirilmiş eğitim simülasyonudur: tek kesit, paralel geometri, {geo.nv} görünüm / 180°, {nb} kanal × {ds} mm.
      </p>
    </>
  );
}
