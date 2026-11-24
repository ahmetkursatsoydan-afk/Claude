/**
 * Görüntü oluşumu gezgini – aşama 10: Hounsfield birimi ve pencereleme.
 *  - FBP görüntüsü üzerinde etkileşimli W/L (kaydırıcı, hazır ayar, fareyle sürükleme)
 *  - SFOV içi HU histogramı (log sayım) + pencere sınırları
 *  - gri düzey aktarım fonksiyonu (HU → 0…255)
 *  - aynı görüntü dört farklı klinik pencerede
 */
import { useMemo, useRef, useState } from 'react';
import { LineChart } from '../../physics/LineChart';
import { Seg, Slider } from '../../controls';
import { Explain, Figure, Formula, ImageView, NeedData, Points, SERIES, StatChip, useFormation, wl } from '../common';
import './StageDisplay.css';

interface Preset {
  id: string;
  name: string;
  w: number;
  l: number;
}

const PRESETS: Preset[] = [
  { id: 'brain', name: 'Beyin', w: 80, l: 40 },
  { id: 'soft', name: 'Yumuşak doku', w: 400, l: 40 },
  { id: 'liver', name: 'Karaciğer', w: 160, l: 60 },
  { id: 'lung', name: 'Akciğer', w: 1500, l: -600 },
  { id: 'bone', name: 'Kemik', w: 2000, l: 500 },
];

const SMALL: Preset[] = [PRESETS[0], PRESETS[1], PRESETS[3], PRESETS[4]];

const H_LO = -1100, H_HI = 2000, H_BIN = 10;
const W_MIN = 1, W_MAX = 4000, L_MIN = -1000, L_MAX = 1000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** HU → ekran gri düzeyi (0…255) – klasik doğrusal pencere. */
const grayOf = (hu: number, w: number, l: number) => {
  const t = (hu - (l - w / 2)) / Math.max(1e-6, w);
  return t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
};

export function StageDisplay() {
  const { main, status } = useFormation();
  const [W, setW] = useState(400);
  const [L, setL] = useState(40);
  const [hover, setHover] = useState<{ i: number; j: number; hu: number } | null>(null);
  const drag = useRef<{ x: number; y: number; w: number; l: number } | null>(null);

  // SFOV içi maske + histogram (veri değişince bir kez)
  const derived = useMemo(() => {
    if (!main) return null;
    const { m, pix, fbpHU } = main;
    const half = (m - 1) / 2;
    const R = 250 - pix;
    const nb = Math.round((H_HI - H_LO) / H_BIN);
    const hist = new Float64Array(nb);
    const inside: number[] = [];
    for (let j = 0; j < m; j++)
      for (let i = 0; i < m; i++) {
        const x = (i - half) * pix, y = (j - half) * pix;
        if (x * x + y * y > R * R) continue;
        const k = j * m + i;
        inside.push(k);
        const b = Math.floor((fbpHU[k] - H_LO) / H_BIN);
        if (b >= 0 && b < nb) hist[b]++;
      }
    const pts: [number, number][] = [];
    for (let b = 0; b < nb; b++) pts.push([H_LO + (b + 0.5) * H_BIN, hist[b] > 0 ? hist[b] : NaN]);
    let hmax = 1;
    for (let b = 0; b < nb; b++) hmax = Math.max(hmax, hist[b]);
    return { inside: Int32Array.from(inside), pts, hmax };
  }, [main]);

  // pencere dışında kalan (siyaha / beyaza kırpılan) piksel oranı
  const clip = useMemo(() => {
    if (!main || !derived) return { lo: 0, hi: 0 };
    const lo = L - W / 2, hi = L + W / 2;
    let a = 0, b = 0;
    const d = main.fbpHU;
    for (const k of derived.inside) {
      const v = d[k];
      if (v < lo) a++;
      else if (v > hi) b++;
    }
    const n = Math.max(1, derived.inside.length);
    return { lo: a / n, hi: b / n };
  }, [main, derived, W, L]);

  if (!main || !derived) return <NeedData status={status} />;

  const { m, pix, fbpHU, kVp, fbpNoise } = main;
  const preset = PRESETS.find((p) => p.w === W && p.l === L)?.id ?? 'custom';
  const lo = L - W / 2, hi = L + W / 2;
  const noiseGray = (fbpNoise * 255) / W;
  const half = (m - 1) / 2;

  const tf: [number, number][] = [];
  const a = clamp(lo, H_LO, H_HI), b = clamp(hi, H_LO, H_HI);
  tf.push([H_LO, grayOf(H_LO, W, L)], [a, grayOf(a, W, L)], [b, grayOf(b, W, L)], [H_HI, grayOf(H_HI, W, L)]);

  const fmtPct = (f: number) => (f * 100).toFixed(f < 0.1 ? 1 : 0) + ' %';

  return (
    <>
      <Explain title="Ekranda gördüğümüz: sayı değil, gri tonu">
        <p>
          Rekonstrüksiyon her piksel için bir zayıflatma katsayısı μ (cm⁻¹) üretir. Bu sayı, suya göre bağıl bir ölçeğe çevrilir: <b>Hounsfield birimi (HU)</b>. Tanım gereği su 0 HU, hava −1000 HU'dur; yağ yaklaşık −100, yumuşak doku +30…+60, kontrastlı damar +150…+300, kortikal kemik +700…+1500 HU civarındadır.
        </p>
        <p>
          BT verisi genellikle 12 bit veya daha geniş tamsayılar olarak saklanır (−1024…+3071 HU ve ötesi; 4096'dan fazla farklı değer). Monitör ise tipik olarak yalnızca <b>256 gri düzey</b> gösterir ve insan gözü bunlardan bile çok daha azını (birkaç on düzey) ayırt edebilir. Tüm HU aralığını doğrudan griye eşlesek karaciğer ile dalak arasındaki 10–20 HU'luk farklar tek bir gri tonunda kaybolurdu.
        </p>
        <p>
          <b>Pencereleme</b> bu sorunu çözer: seçilen bir HU aralığı (merkez L, genişlik W) tüm gri skalaya yayılır. Pencerenin altındaki değerler siyah, üstündekiler beyaz olarak <b>kırpılır</b>. Dar pencere kontrastı artırır, ama aynı oranda gürültüyü de görünür kılar.
        </p>
      </Explain>

      <Formula note="μ_su: aynı etkin enerjide suyun lineer zayıflatma katsayısı. Gri = 0 (L − W/2 altı) … 255 (L + W/2 üstü).">
        HU = 1000 · (μ − μ<sub>su</sub>) / μ<sub>su</sub> &nbsp;&nbsp;·&nbsp;&nbsp; gri = 255 · [HU − (L − W/2)] / W
      </Formula>

      <div className="sd-ctl">
        <div className="sd-g wide">
          <span className="sd-lab">Hazır pencere</span>
          <Seg
            value={preset}
            options={PRESETS.map((p) => ({ v: p.id, l: p.name, title: `W ${p.w} / L ${p.l}` }))}
            onChange={(id) => {
              const p = PRESETS.find((q) => q.id === id)!;
              setW(p.w);
              setL(p.l);
            }}
          />
        </div>
        <div className="sd-g">
          <span className="sd-lab">Genişlik W</span>
          <Slider value={W} min={W_MIN} max={W_MAX} step={1} unit="HU" log onChange={setW} />
        </div>
        <div className="sd-g">
          <span className="sd-lab">Merkez L</span>
          <Slider value={L} min={L_MIN} max={L_MAX} step={1} unit="HU" onChange={setL} />
        </div>
      </div>

      <Figure cols={2}>
        <ImageView
          data={fbpHU}
          w={m}
          h={m}
          aspect={1}
          win={wl(W, L)}
          tag={`W ${W} / L ${L}`}
          cursor="move"
          caption="Fareyle sürükleyin: yatay → pencere genişliği (W), dikey → pencere merkezi (L; aşağı = daha yüksek L, görüntü koyulaşır)."
          onDown={(fx, fy) => (drag.current = { x: fx, y: fy, w: W, l: L })}
          onDrag={(fx, fy) => {
            const d = drag.current;
            if (!d) return;
            const s = 320 / m;
            setW(Math.round(clamp(d.w * Math.exp(((fx - d.x) * s) / 120), W_MIN, W_MAX)));
            setL(Math.round(clamp(d.l + (fy - d.y) * s * 4, L_MIN, L_MAX)));
          }}
          onHover={(fx, fy) => {
            const i = Math.round(fx), j = Math.round(fy);
            if (i < 0 || j < 0 || i >= m || j >= m) return setHover(null);
            setHover({ i, j, hu: fbpHU[j * m + i] });
          }}
          onLeave={() => setHover(null)}
        />
        <div className="sd-col">
          <LineChart
            height={200}
            series={[{ name: 'Piksel sayısı', color: SERIES[0], pts: derived.pts }]}
            xLabel="HU"
            yLabel="piksel sayısı (log)"
            yLog
            yMin={0.8}
            yMax={derived.hmax * 1.5}
            xMin={H_LO}
            xMax={H_HI}
            vlines={[
              { x: lo, label: 'L−W/2' },
              { x: hi, label: 'L+W/2' },
              ...(hover ? [{ x: hover.hu, label: 'imleç' }] : []),
            ]}
            fmtY={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0))}
            endLabels={false}
          />
          <LineChart
            height={170}
            series={[{ name: 'Gri düzey', color: SERIES[2], pts: tf }]}
            xLabel="HU"
            yLabel="gri düzey (0–255)"
            xMin={H_LO}
            xMax={H_HI}
            yMin={0}
            yMax={255}
            vlines={hover ? [{ x: hover.hu, label: `${grayOf(hover.hu, W, L)}` }] : []}
            endLabels={false}
          />
          <div className="fx-stats">
            <StatChip label="İmleç HU" value={hover ? hover.hu.toFixed(0) : '—'} tone="a" />
            <StatChip label="Ekran gri" value={hover ? grayOf(hover.hu, W, L) : '—'} />
            <StatChip label="Konum (mm)" value={hover ? `${((hover.i - half) * pix).toFixed(0)}, ${((hover.j - half) * pix).toFixed(0)}` : '—'} />
            <StatChip label="Siyaha kırpılan" value={fmtPct(clip.lo)} />
            <StatChip label="Beyaza kırpılan" value={fmtPct(clip.hi)} />
            <StatChip label="1 gri düzey" value={`${(W / 256).toFixed(W < 256 ? 2 : 1)} HU`} />
            <StatChip label="Gürültü σ ekranda" value={`≈ ${noiseGray.toFixed(noiseGray < 10 ? 1 : 0)} gri`} tone={noiseGray > 20 ? 'warn' : undefined} />
          </div>
        </div>
      </Figure>

      <div className="sd-note">
        Üst grafik: SFOV (500 mm) içindeki piksellerin HU histogramı (10 HU'luk kutular, logaritmik sayım). Hava (−1000), yağ (≈ −100) ve yumuşak doku (≈ +40) tepelerine dikkat edin; dikey çizgiler pencere sınırlarıdır. Alt grafik: pencerenin aktarım fonksiyonu – yalnızca iki çizgi arasındaki HU'lar farklı gri tonlarına ayrılır.
      </div>

      <Figure cols={4}>
        {SMALL.map((p) => (
          <ImageView
            key={p.id}
            data={fbpHU}
            w={m}
            h={m}
            aspect={1}
            win={wl(p.w, p.l)}
            tag={p.name}
            caption={`W ${p.w} / L ${p.l} HU`}
            cursor="pointer"
            onDown={() => {
              setW(p.w);
              setL(p.l);
            }}
          />
        ))}
      </Figure>
      <div className="sd-note">Aynı veri, dört farklı pencere: veri değişmedi, yalnızca HU → gri eşlemesi değişti. Bir küçük görüntüye tıklayarak o pencereyi büyük görüntüye uygulayabilirsiniz.</div>

      <Points
        items={[
          <>
            <b>Dar pencere (ör. beyin 80/40)</b>: 1 gri düzey ≈ 0,3 HU olur; birkaç HU'luk doku farkı görünür hâle gelir, ama gürültü de aynı oranda büyütülür. Şu anki pencerede σ ≈ {fbpNoise.toFixed(1)} HU gürültü ekranda ≈ {noiseGray.toFixed(1)} gri düzeye karşılık geliyor.
          </>,
          <>
            <b>Geniş pencere (ör. kemik 2000/500)</b>: kemik iç yapısı ve kortikal sınırlar seçilir, yumuşak dokular tek bir gri tonuna erir; gürültü neredeyse görünmez.
          </>,
          <>
            <b>Kırpma</b>: pencere dışındaki tüm değerler aynı siyah veya beyaz tonda görünür. Akciğer penceresinde kemik ve yumuşak doku ayrıntısı, yumuşak doku penceresinde akciğer parankimi kaybolur – bu yüzden aynı seri birden fazla pencerede değerlendirilir.
          </>,
          <>
            <b>HU tamamen mutlak değildir</b>: μ enerjiye bağlıdır; HU kVp'ye ({kVp} kVp kullanılıyor), filtrelemeye, ışın sertleşmesine (kemik arkasında, büyük hastada), saçılmaya ve rekonstrüksiyon ayarlarına göre birkaç–onlarca HU kayabilir. Su kalibrasyonu yalnızca suyu 0 HU'ya sabitler.
          </>,
          <>Pencereleme yalnızca görüntülemedir: ölçüm (HU değerleri) değişmez. Bir ROI ölçümü pencereden bağımsızdır.</>,
        ]}
      />
    </>
  );
}
