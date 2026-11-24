/**
 * Görüntü oluşumu gezgini – aşama 5: Foton sayımı ve kuantum gürültüsü.
 * Sayım sinogramı (log10), seçili görünümde beklenen/ölçülen/zayıflatmasız sayım profilleri,
 * log sinyalinin göreli gürültüsü σ_p ≈ 1/√N (kuramsal ve ölçülen) ve özet istatistikler.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../../../state/store';
import { Slider } from '../../controls';
import { LineChart } from '../../physics/LineChart';
import { useFormation, ImageView, ColorBar, Explain, Points, Formula, Figure, StatChip, NeedData, SERIES, autoWindow, sinoRow, binToMm } from '../common';

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Sayı → okunaklı biçim (büyük değerler a,b×10ⁿ). */
function fmtN(v: number): string {
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a < 1e4 && (a >= 0.01 || a === 0)) return v.toFixed(a < 10 ? 1 : 0);
  const e = Math.floor(Math.log10(a));
  const mnt = (v / Math.pow(10, e)).toFixed(1).replace('.', ',');
  return `${mnt}×10${String(e)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('')}`;
}

const fmtLogAxis = (v: number) => (v >= 1e4 || v < 0.01 ? fmtN(v).replace(',0×', '×') : String(+v.toPrecision(3)));

export function StageCounts() {
  const { main, status } = useFormation();
  const src = useApp((s) => s.formation.src);
  const [thDeg, setThDeg] = useState(90);

  // log10(sayım) sinogramı
  const logC = useMemo(() => {
    if (!main) return null;
    const c = main.counts;
    const out = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = Math.log10(Math.max(1, c[i]));
    return out;
  }, [main]);

  const win = useMemo(() => {
    if (!logC) return { lo: 0, hi: 1 };
    const a = autoWindow(logC, 0.001, 0.999);
    const lo = Math.floor(a.lo), hi = Math.ceil(a.hi);
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [logC]);

  // nesneden geçen ışınlarda en düşük ölçülen/beklenen sayım
  const minStats = useMemo(() => {
    if (!main) return null;
    const { counts, expected, polyLine } = main;
    let minC = Infinity, minE = Infinity;
    for (let k = 0; k < counts.length; k++) {
      if (polyLine[k] < 0.02) continue;
      if (counts[k] < minC) minC = counts[k];
      if (expected[k] < minE) minE = expected[k];
    }
    return { minC, minE };
  }, [main]);

  if (!main || !logC) return <NeedData status={status} />;

  const { geo } = main;
  const { nv, nb, ds } = geo;
  const v = Math.max(0, Math.min(nv - 1, Math.round((thDeg * nv) / 180)));
  return <CountsBody {...{ main, logC, win, v, thDeg, setThDeg, nv, nb, ds, minStats, mAs: src.mAs, thick: src.thickness }} />;
}

/** Görünüme bağlı grafik verileri ayrı bileşende (sinogram tuvali yeniden oluşturulmadan). */
function CountsBody(p: {
  main: NonNullable<ReturnType<typeof useFormation>['main']>;
  logC: Float32Array;
  win: { lo: number; hi: number };
  v: number;
  thDeg: number;
  setThDeg: (d: number) => void;
  nv: number;
  nb: number;
  ds: number;
  minStats: { minC: number; minE: number } | null;
  mAs: number;
  thick: number;
}) {
  const { main, logC, win, v, setThDeg, nv, nb, ds, minStats, mAs, thick } = p;
  const sx = (b: number) => binToMm(b, nb, ds);

  const charts = useMemo(() => {
    const exp = sinoRow(main.expected, nb, v);
    const cnt = sinoRow(main.counts, nb, v);
    const raw = sinoRow(main.raw, nb, v);
    const pl = sinoRow(main.polyLine, nb, v);
    const n0 = main.n0;
    const stride = 2;
    const cl = (x: number) => Math.max(1, x);
    const sExp: [number, number][] = [], sCnt: [number, number][] = [], sN0: [number, number][] = [];
    const sTh: [number, number][] = [], sEmp: [number, number][] = [];
    // ölçülen gürültü: (ölçülen − gürültüsüz) log sinyalinin ±H kanal penceresindeki std sapması
    const H = 6;
    const d = new Float32Array(nb);
    for (let b = 0; b < nb; b++) d[b] = raw[b] - pl[b];
    for (let b = 0; b < nb; b += stride) {
      const s = sx(b);
      sExp.push([s, cl(exp[b])]);
      sCnt.push([s, cl(cnt[b])]);
      sN0.push([s, cl(n0[b])]);
      sTh.push([s, 1 / Math.sqrt(cl(exp[b]))]);
      let m1 = 0, m2 = 0, k = 0;
      for (let q = Math.max(0, b - H); q <= Math.min(nb - 1, b + H); q++) {
        m1 += d[q];
        m2 += d[q] * d[q];
        k++;
      }
      const varr = m2 / k - (m1 / k) * (m1 / k);
      sEmp.push([s, Math.max(1e-5, Math.sqrt(Math.max(0, varr)))]);
    }
    // bu görünümdeki en az foton alan ışın
    let bMin = 0;
    for (let b = 1; b < nb; b++) if (exp[b] < exp[bMin]) bMin = b;
    return { sExp, sCnt, sN0, sTh, sEmp, bMin, nMin: exp[bMin] };
  }, [main, v, nb]);

  const sigma = main.fbpNoise;
  const starvedPct = 100 * main.stats.starvedFrac;
  const minC = minStats ? minStats.minC : NaN;

  const overlay = (g: CanvasRenderingContext2D, T: (fx: number, fy: number) => [number, number]) => {
    const [x0, y] = T(-0.5, v);
    const [x1] = T(nb - 0.5, v);
    g.strokeStyle = '#3fd0ff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    const [mx, my] = T(charts.bMin, v);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(mx, my, 5, 0, 2 * Math.PI);
    g.stroke();
  };

  const step = 180 / nv;
  return (
    <>
      <Explain title="Dedektör fotonları sayar – ve sayım rastgeledir">
        <p>
          Her ışın için dedektöre ulaşan foton sayısı N, Beer–Lambert yasasının öngördüğü <b>ortalama</b> değer (N̄ = N₀·e^−p) etrafında rastgele dalgalanır. Fotonların gelişi
          bağımsız olaylardır → <b>Poisson dağılımı</b>: standart sapma σ_N = √N̄. Bağıl gürültü σ_N / N̄ = 1/√N̄ olduğundan, az foton alan ışınlar bağıl olarak çok daha gürültülüdür.
        </p>
        <p>
          Klinik BT dedektörleri fotonları tek tek saymaz, enerjilerini <b>toplar</b> (enerji-integre eden dedektör): yüksek enerjili fotonun katkısı daha büyüktür. Bu “bileşik
          Poisson” istatistiğinde gürültü, eşdeğer bir Poisson sayımıyla ifade edilir: <b>NEQ</b> (gürültü-eşdeğer kuanta). Burada gösterilen “sayım”lar NEQ ölçeğindedir. Ayrıca her
          kanalda sabit bir <b>elektronik gürültü</b> tabanı vardır (burada σ ≈ 2 sayım); çok düşük sayımlarda baskın hâle gelir.
        </p>
      </Explain>

      <div className="fx-ctrl">
        <span className="lab">Görünüm açısı θ</span>
        <div style={{ flex: '1 1 220px', maxWidth: 380, minWidth: 0 }}>
          <Slider value={+(v * step).toFixed(2)} min={0} max={+(180 - step).toFixed(2)} step={step} unit="°" onChange={setThDeg} />
        </div>
        <span className="lab">
          görünüm {v + 1}/{nv}
        </span>
      </div>

      <Figure cols={2}>
        <div>
          <ImageView
            data={logC}
            w={nb}
            h={nv}
            aspect={1.4}
            cmap="heat"
            win={win}
            tag="log₁₀ (ölçülen sayım)"
            caption={
              <>
                Dikey eksen θ: 0° → 180° (yukarıdan aşağı), yatay eksen s: −250 → +250 mm. Parlak (sarı) = çok foton (hava, papyon kenarı); koyu = az foton (kalın/yoğun yollar). Bir
                satıra tıklayarak görünümü seçin; beyaz halka o görünümde en az foton alan ışındır.
              </>
            }
            overlay={overlay}
            overlayKey={`${v},${charts.bMin}`}
            onDown={(_fx, fy) => {
              const vv = Math.round(fy);
              if (vv >= 0 && vv < nv) setThDeg(vv * step);
            }}
            onDrag={(_fx, fy) => {
              const vv = Math.round(fy);
              if (vv >= 0 && vv < nv) setThDeg(vv * step);
            }}
          />
          <ColorBar cmap="heat" lo={win.lo} hi={win.hi} unit="log₁₀ N" />
          <div className="fx-cap">
            Renk ölçeği on katlık (dekad) basamaklardır: {fmtN(Math.pow(10, win.lo))} … {fmtN(Math.pow(10, win.hi))} foton/ışın.
          </div>
        </div>
        <div>
          <LineChart
            series={[
              { name: 'N₀ (zayıflatmasız)', color: SERIES[2], pts: charts.sN0, dash: true },
              { name: 'Beklenen N̄', color: SERIES[0], pts: charts.sExp },
              { name: 'Ölçülen N', color: SERIES[1], pts: charts.sCnt, width: 1 },
            ]}
            xLabel="s (mm)"
            yLabel="foton sayımı / ışın"
            yLog
            fmtY={fmtLogAxis}
            fmtX={(x) => x.toFixed(0)}
            vlines={[{ x: sx(charts.bMin), label: 'en az' }]}
            height={230}
          />
          <div className="fx-cap">
            θ = {(v * step).toFixed(1)}° görünümünde sayım profili (logaritmik eksen). N₀ eğrisi papyon filtresi nedeniyle kenarlara doğru düşer. En az foton: {fmtN(charts.nMin)} (s ={' '}
            {sx(charts.bMin).toFixed(0)} mm).
          </div>
        </div>
      </Figure>

      <Figure cols={2}>
        <div>
          <LineChart
            series={[
              { name: 'Kuramsal 1/√N̄', color: SERIES[0], pts: charts.sTh },
              { name: 'Ölçülen (yerel std)', color: SERIES[3], pts: charts.sEmp, width: 1 },
            ]}
            xLabel="s (mm)"
            yLabel="σ_p (log sinyali gürültüsü)"
            yLog
            fmtY={fmtLogAxis}
            fmtX={(x) => x.toFixed(0)}
            height={230}
          />
          <div className="fx-cap">
            −ln dönüşümünden sonra her ışının gürültüsü σ_p ≈ 1/√N̄. “Ölçülen” eğri: gürültülü log sinyali ile gürültüsüz değer arasındaki farkın ±6 kanallık penceredeki standart sapması.
          </div>
        </div>
        <Explain title="Log dönüşümünden sonra gürültü">
          <p>
            Rekonstrüksiyon sayımları değil çizgi integralini kullanır: p = −ln(N / N₀). Küçük dalgalanmalar için dp = −dN / N, dolayısıyla σ_p ≈ σ_N / N̄ = 1/√N̄. Yani bir ışının
            gürültüsü yalnızca o ışının foton sayısına bağlıdır.
          </p>
          <p>
            Kalın ya da yoğun bölgelerden (omuzlar, pelvis, kemik, metal) geçen ışınlar az foton alır → bu ışınlar en gürültülüdür. Geri izdüşüm bu gürültüyü ışın boyunca yayar; bu
            yüzden gürültü görüntüde yönlü çizgiler şeklinde (en çok zayıflatan yönde) görünebilir.
          </p>
        </Explain>
      </Figure>

      <div className="fx-stats">
        <StatChip label="En düşük sayım (nesne ışınları)" value={fmtN(minC)} tone={minC < 20 ? 'warn' : undefined} />
        <StatChip label="Ortalama NEQ / ışın" value={fmtN(main.stats.meanNeq)} />
        <StatChip label="Foton açlığı oranı" value={`${starvedPct < 0.01 && starvedPct > 0 ? '<0,01' : starvedPct.toFixed(2).replace('.', ',')} %`} tone={starvedPct > 0.1 ? 'warn' : 'ok'} />
        <StatChip label="Görüntü gürültüsü σ" value={`${sigma.toFixed(1)} HU`} tone="a" />
        <StatChip label="Etkin mAs" value={`${mAs}`} />
        <StatChip label="Kesit kalınlığı" value={`${thick} mm`} />
      </div>
      <div className="fx-stats">
        <StatChip label="Tahmin: mAs ×½" value={`σ ≈ ${(sigma * Math.SQRT2).toFixed(1)} HU · doz ×½`} />
        <StatChip label="Tahmin: mAs ×2" value={`σ ≈ ${(sigma / Math.SQRT2).toFixed(1)} HU · doz ×2`} />
        <StatChip label="Tahmin: mAs ×4" value={`σ ≈ ${(sigma / 2).toFixed(1)} HU · doz ×4`} />
      </div>

      <Formula note="Poisson: varyans = ortalama. Görüntü gürültüsü, toplanan foton sayısının kareköküyle ters orantılıdır (kernel, kVp, hasta boyutu ve rekonstrüksiyon yöntemi sabitken).">
        σ_N = √N̄ &nbsp;;&nbsp; σ_p ≈ 1/√N̄ &nbsp;;&nbsp; σ_görüntü ∝ 1/√(mAs · kesit kalınlığı)
      </Formula>

      <Explain title="Foton açlığı ve mAs–doz dengesi">
        <p>
          Bir ışının sayımı çok küçüldüğünde (birkaç–birkaç on foton) Poisson gürültüsü ve elektronik gürültü sinyale yaklaşır; hatta ölçülen değer sıfır ya da negatif olabilir ve
          logaritması alınamaz. Buna <b>foton açlığı</b> denir. Sistemler bu ışınları komşularıyla ortalayarak (uyarlamalı filtre) düzeltir, ancak sonuçta çizgisel artefaktlar kalabilir
          (metal ve omuz düzeyindeki koyu/parlak çizgiler – artefakt atlasında örneği vardır). Bu simülasyonda NEQ &lt; 20 olan ışınlar “aç” sayılır.
        </p>
        <p>
          Foton sayısı mAs ile (ve kesit kalınlığıyla) doğru orantılıdır. mAs'ı iki katına çıkarmak gürültüyü yalnızca √2 kat (≈ %29) azaltır, ama hasta dozunu iki katına çıkarır.
          Gürültüyü yarıya indirmek için 4 kat doz gerekir. Bu yüzden doz optimizasyonu, tanı için “yeterli” gürültü düzeyini hedefler.
        </p>
      </Explain>

      <Points
        items={[
          <>
            Üst çubuktan <b>mAs</b>'ı değiştirin (ör. 150 → 600): σ yaklaşık yarıya iner; sayım profilleri log eksende ≈ 0,6 dekad (×4) yukarı kayar.
          </>,
          <>
            <b>Kesit kalınlığını</b> 5 mm → 1 mm yapın: fotonlar 5 kat azalır, σ ≈ √5 ≈ 2,2 kat artar (mAs sabitken).
          </>,
          <>
            Ölçülen sayım (turuncu) beklenen ortalama etrafında dalgalanır; dalgalanma logaritmik eksende <b>az fotonlu</b> bölgelerde belirgin biçimde büyür.
          </>,
          <>
            Kuramsal ve ölçülen σ_p eğrileri büyük ölçüde örtüşür: gürültü gerçekten 1/√N kuralını izler. Nesne kenarlarında yerel std, keskin geçişler nedeniyle biraz sapabilir.
          </>,
          <>
            Açıyı değiştirin: yan (lateral) projeksiyonlarda yol daha uzun olduğundan en düşük sayım genellikle ön-arka projeksiyondakinden belirgin biçimde azdır.
          </>,
        ]}
      />
      <p className="fx-cap" style={{ textAlign: 'left' }}>
        Basitleştirilmiş eğitim simülasyonudur: sayım ölçeği gerçek tarayıcıların mutlak değerlerini değil, oranlarını ve istatistiğini yansıtacak şekilde ayarlanmıştır. Saçılma
        açıksa beklenen sayım saçılan fotonları da içerir.
      </p>
    </>
  );
}
