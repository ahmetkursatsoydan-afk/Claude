/**
 * Görüntü oluşumu gezgini – aşama: Tek projeksiyon (Beer–Lambert).
 * θ açısında paralel ışın demeti gerçek nesneden geçer; her dedektör kanalı tek bir çizgi
 * integralini ölçer. Profiller ana hesaplamanın gerçek sinogram satırlarıdır.
 */
import { useCallback, useMemo, useState } from 'react';
import { LineChart } from '../../physics/LineChart';
import { Seg, Slider } from '../../controls';
import { Explain, Figure, Formula, ImageView, NeedData, Points, SERIES, StatChip, StepPlayer, binToMm, sinoRow, useFormation, wl } from '../common';

const R_MM = 250; // SFOV yarıçapı
const N_RAYS = 13;
const ACCENT = '#3cc8ff';

type WinId = 'soft' | 'wide';
const WINS: Record<WinId, { ww: number; l: number; label: string }> = {
  soft: { ww: 400, l: 40, label: 'Yumuşak doku 400/40' },
  wide: { ww: 2000, l: 300, label: 'Geniş 2000/300' },
};

function fmtCount(v: number): string {
  if (!isFinite(v)) return '–';
  if (v >= 1e4) return v.toExponential(2);
  return v.toFixed(0);
}

export function StageProjection() {
  const { main, status } = useFormation();
  const [v, setV] = useState(0);
  const [sSel, setSSel] = useState(0);
  const [win, setWin] = useState<WinId>('soft');
  const onView = useCallback((i: number) => setV(i), []);

  const nv = main?.geo.nv ?? 1;
  const vv = Math.max(0, Math.min(nv - 1, v));

  // Profiller (yalnızca veri veya görünüm değişince)
  const prof = useMemo(() => {
    if (!main) return null;
    const { nb, ds } = main.geo;
    const mono = sinoRow(main.monoLine, nb, vv);
    const poly = sinoRow(main.polyLine, nb, vv);
    const exp = sinoRow(main.expected, nb, vv);
    const cnt = sinoRow(main.counts, nb, vv);
    const n0 = main.n0;
    const st = 2;
    const pMono: [number, number][] = [], pPoly: [number, number][] = [];
    const tPoly: [number, number][] = [], tMeas: [number, number][] = [];
    const cExp: [number, number][] = [], cMeas: [number, number][] = [];
    let cMin = Infinity, cMax = 0;
    for (let b = 0; b < nb; b += st) {
      const s = binToMm(b, nb, ds);
      pMono.push([s, mono[b]]);
      pPoly.push([s, poly[b]]);
      tPoly.push([s, Math.exp(-poly[b])]);
      tMeas.push([s, n0[b] > 0 ? Math.min(1.2, cnt[b] / n0[b]) : 0]);
      cExp.push([s, exp[b]]);
      cMeas.push([s, Math.max(1, cnt[b])]);
      cMin = Math.min(cMin, Math.max(1, exp[b]), Math.max(1, cnt[b]));
      cMax = Math.max(cMax, exp[b], cnt[b]);
    }
    const lo = Math.pow(10, Math.floor(Math.log10(Math.max(1, cMin))));
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(10, cMax))));
    return { pMono, pPoly, tPoly, tMeas, cExp, cMeas, cLo: lo, cHi: hi };
  }, [main, vv]);

  if (!main || !prof) return <NeedData status={status} />;

  const { nb, ds } = main.geo;
  const { m, pix } = main;
  const half = (m - 1) / 2;
  const th = (vv * Math.PI) / nv;
  const c = Math.cos(th), sn = Math.sin(th);
  const deg = (vv * 180) / nv;
  const sMax = ((nb - 1) / 2) * ds;
  const sClamped = Math.max(-sMax, Math.min(sMax, sSel));
  const bSel = Math.max(0, Math.min(nb - 1, Math.round(sClamped / ds + (nb - 1) / 2)));
  const sBin = binToMm(bSel, nb, ds);
  const k = vv * nb + bSel;
  const monoV = main.monoLine[k], polyV = main.polyLine[k];
  const trans = Math.exp(-polyV);
  const nExp = main.expected[k], nMeas = main.counts[k];
  const pMeas = main.raw[k];
  const waterCm = polyV / main.muRef;
  const chordMm = Math.abs(sBin) < R_MM ? 2 * Math.sqrt(R_MM * R_MM - sBin * sBin) : 0;

  const pickFromImage = (fx: number, fy: number) => {
    const x = (fx - half) * pix, y = (fy - half) * pix;
    const s = x * c + y * sn;
    setSSel(Math.round(Math.max(-sMax, Math.min(sMax, s)) * 10) / 10);
  };

  const overlay = (g: CanvasRenderingContext2D, toScreen: (fx: number, fy: number) => [number, number]) => {
    const P = (x: number, y: number) => toScreen(x / pix + half, y / pix + half);
    // ışın doğrultusu d = (−sinθ, cosθ); normal n = (cosθ, sinθ)
    const dx = -sn, dy = c;
    const ray = (s: number, color: string, w: number, dash?: number[]) => {
      if (Math.abs(s) >= R_MM) return;
      const L = Math.sqrt(R_MM * R_MM - s * s);
      const [x0, y0] = P(s * c - L * dx, s * sn - L * dy);
      const [x1, y1] = P(s * c + L * dx, s * sn + L * dy);
      g.strokeStyle = color;
      g.lineWidth = w;
      g.setLineDash(dash ?? []);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    for (let i = 0; i < N_RAYS; i++) {
      const s = -R_MM + ((i + 0.5) * 2 * R_MM) / N_RAYS;
      ray(s, 'rgba(255, 210, 120, 0.45)', 1);
    }
    // SFOV sınırı
    const [cx, cy] = P(0, 0);
    const [ex] = P(R_MM, 0);
    g.setLineDash([3, 4]);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, Math.abs(ex - cx), 0, 2 * Math.PI);
    g.stroke();
    g.setLineDash([]);
    // seçili ışın
    ray(sBin, ACCENT, 2.5);
    // kaynak ve dedektör: ışınlara dik çizgiler
    const side = (dist: number, halfLen: number, color: string, width: number) => {
      const bx = dist * dx, by = dist * dy;
      const [a0, a1] = P(bx - halfLen * c, by - halfLen * sn);
      const [b0, b1] = P(bx + halfLen * c, by + halfLen * sn);
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(a0, a1);
      g.lineTo(b0, b1);
      g.stroke();
    };
    const DS = 228;
    side(-DS, 150, '#ffb020', 4);
    side(DS, 170, '#7fe0a0', 5);
    // dedektör üzerinde seçili kanal
    const [qx, qy] = P(sBin * c + DS * dx, sBin * sn + DS * dy);
    g.fillStyle = ACCENT;
    g.beginPath();
    g.arc(qx, qy, 4.5, 0, 2 * Math.PI);
    g.fill();
    // yön oku (kaynak → dedektör), seçili ışın üzerinde
    const [ax, ay] = P(sBin * c + 120 * dx, sBin * sn + 120 * dy);
    const [bx2, by2] = P(sBin * c + 90 * dx, sBin * sn + 90 * dy);
    const ang = Math.atan2(ay - by2, ax - bx2);
    g.fillStyle = ACCENT;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax - 9 * Math.cos(ang - 0.45), ay - 9 * Math.sin(ang - 0.45));
    g.lineTo(ax - 9 * Math.cos(ang + 0.45), ay - 9 * Math.sin(ang + 0.45));
    g.closePath();
    g.fill();
    // etiketler
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = (txt: string, dist: number, color: string) => {
      // etiket: çizginin üzerinde, merkezden biraz kaydırılmış (seçili ışınla çakışmasın)
      const off = sBin > 0 ? -95 : 95;
      const [lx, ly] = P(dist * dx + off * c, dist * dy + off * sn);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(txt, lx, ly);
      g.fillStyle = color;
      g.fillText(txt, lx, ly);
    };
    label('kaynak', -DS + 14, '#ffb020');
    label('dedektör', DS - 14, '#7fe0a0');
  };

  const sLines = [{ x: sBin, label: `s=${sBin.toFixed(0)}` }];
  const w = WINS[win];

  return (
    <>
      <Explain title="Bir projeksiyon = ışın demetinin nesneye düşürdüğü “gölge”">
        <p>
          Belirli bir gantri açısında (θ) tüp ve dedektör karşı karşıyadır. Dedektördeki her kanal, kaynaktan kendisine uzanan <b>tek bir ışın</b> boyunca
          dokuların toplam zayıflatmasını ölçer. Tüm kanalların değerleri birlikte o açıdaki <b>projeksiyonu</b> (profil) oluşturur – nesnenin o yönden düşürdüğü
          bir gölge gibidir. Görüntünün üzerine tıklayarak (veya sürükleyerek) bir ışın seçin; θ'yı kaydırarak gantriyi döndürün.
        </p>
      </Explain>

      <div className="fx-ctrl">
        <span className="lab">Gantri açısı θ</span>
        <div style={{ flex: '1 1 260px', minWidth: 200, maxWidth: 400 }}>
          <StepPlayer count={nv} index={vv} onChange={onView} fps={20} label={`θ = ${deg.toFixed(1)}° (görünüm ${vv + 1}/${nv})`} />
        </div>
        <span className="lab">Işın s</span>
        <Slider value={Math.round(sClamped * 10) / 10} min={-Math.floor(sMax)} max={Math.floor(sMax)} step={0.5} unit="mm" onChange={setSSel} />
        <Seg value={win} options={(Object.keys(WINS) as WinId[]).map((id) => ({ v: id, l: WINS[id].label }))} onChange={setWin} />
      </div>

      <Figure cols={2}>
        <div>
          <ImageView
            data={main.truthHU}
            w={m}
            h={m}
            aspect={1}
            win={wl(w.ww, w.l)}
            tag={`Gerçek nesne · θ = ${deg.toFixed(0)}°`}
            overlay={overlay}
            overlayKey={`${vv}|${bSel}`}
            onDown={pickFromImage}
            onDrag={pickFromImage}
            caption={
              <>
                Gerçek nesne (E_ref = {main.eRef.toFixed(0)} keV'deki HU haritası, W/L {w.ww}/{w.l}). İnce çizgiler θ açısındaki paralel ışınların bir kısmını, mavi çizgi
                seçili ışını gösterir. Turuncu: kaynak tarafı, yeşil: dedektör (ışınlara dik). Bir ışın seçmek için tıklayın: s = x·cosθ + y·sinθ. Kesikli daire: 500 mm tarama alanı (SFOV).
              </>
            }
          />
          <div className="fx-stats" style={{ marginTop: 8 }}>
            <StatChip label="Kanal / s" value={`#${bSel} · ${sBin.toFixed(1)} mm`} tone="a" />
            <StatChip label="∫μ dl (mono)" value={monoV.toFixed(3)} />
            <StatChip label="∫μ dl (poli)" value={polyV.toFixed(3)} tone="b" />
            <StatChip label="I / I₀" value={trans >= 0.01 ? trans.toFixed(3) : trans.toExponential(2)} />
            <StatChip label="N beklenen" value={fmtCount(nExp)} />
            <StatChip label="N ölçülen" value={fmtCount(nMeas)} />
            <StatChip label="p ölçülen" value={isFinite(pMeas) ? pMeas.toFixed(3) : '–'} />
            <StatChip label="Su eşdeğeri" value={`≈ ${waterCm.toFixed(1)} cm`} tone="ok" />
          </div>
          <div className="fx-cap">
            Su eşdeğeri kalınlık ≈ ∫μ dl / μ<sub>su</sub>(E_ref) = {polyV.toFixed(2)} / {main.muRef.toFixed(3)} cm⁻¹ (yaklaşık; polienerjetik veride kaba bir ölçüdür).
            Bu ışının SFOV içindeki geometrik yolu {(chordMm / 10).toFixed(1)} cm.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <LineChart
              height={180}
              xLabel="Kanal konumu s (mm)"
              yLabel="Çizgi integrali ∫μ dl"
              xMin={-250}
              xMax={250}
              yMin={0}
              series={[
                { name: 'Mono (ideal)', color: SERIES[0], pts: prof.pMono },
                { name: 'Poli (gürültüsüz)', color: SERIES[1], pts: prof.pPoly, dash: true },
              ]}
              vlines={sLines}
              fmtY={(x) => x.toFixed(1)}
            />
            <div className="fx-cap">(a) Projeksiyon profili: her nokta bir dedektör kanalının ölçtüğü çizgi integrali (birimsiz). Polienerjetik ışında çizgi integrali yol uzunluğuyla doğrusal artmaz; uzun/kemikli yollarda mono eğriden sapar (ışın sertleşmesi).</div>
          </div>
          <div>
            <LineChart
              height={170}
              xLabel="Kanal konumu s (mm)"
              yLabel="Geçirgenlik I/I₀"
              xMin={-250}
              xMax={250}
              yMin={0}
              yMax={1.05}
              series={[
                { name: 'e^(−∫μ dl)', color: SERIES[2], pts: prof.tPoly },
                { name: 'Ölçülen N/N₀', color: SERIES[3], pts: prof.tMeas, width: 1 },
              ]}
              vlines={sLines}
              fmtY={(x) => x.toFixed(1)}
            />
            <div className="fx-cap">(b) Geçen foton oranı: hava yolunda 1, gövde merkezinde çok küçük. Ölçülen oran gürültü ve saçılım içerir.</div>
          </div>
          <div>
            <LineChart
              height={180}
              xLabel="Kanal konumu s (mm)"
              yLabel="Foton sayısı N"
              yLog
              xMin={-250}
              xMax={250}
              yMin={prof.cLo}
              yMax={prof.cHi}
              series={[
                { name: 'Beklenen', color: SERIES[0], pts: prof.cExp },
                { name: 'Ölçülen (Poisson)', color: SERIES[4], pts: prof.cMeas, width: 1 },
              ]}
              vlines={sLines}
              fmtY={(x) => (x >= 1000 ? x.toExponential(0) : x.toFixed(0))}
            />
            <div className="fx-cap">(c) Dedektöre ulaşan foton sayısı (logaritmik eksen). Az foton düşen kanallarda (kalın/kemikli yollar) göreli gürültü büyüktür: σ/N ≈ 1/√N.</div>
          </div>
        </div>
      </Figure>

      <Formula
        note={
          <>
            I₀: hasta yokken kanala gelen foton sayısı (papyon dahil), μ(l): ışın boyunca zayıflatma katsayısı (cm⁻¹). Gerçek tarayıcıda yelpaze (fan-beam) verisi bu paralel
            geometriye yeniden düzenlenir (rebinning); simülasyon 180°'lik paralel-ışın görünümleri kullanır ({nv} görünüm × {nb} kanal, {ds} mm aralık). Basitleştirilmiş eğitsel model.
          </>
        }
      >
        I = I₀ · e<sup>−∫ μ(l) dl</sup> &nbsp;&nbsp;⇒&nbsp;&nbsp; p = −ln(I / I₀) = ∫ μ(l) dl
      </Formula>

      <Explain title="Bilgi burada kaybolur">
        <p>
          Dedektör, ışın boyunca karşılaşılan μ değerlerinin yalnızca <b>toplamını</b> görür; hangi derinlikte ne kadar zayıflama olduğunu bilmez. 10 cm su ile
          5 cm su + biraz kemik aynı çizgi integralini verebilir. Tek bir projeksiyondan nesneyi geri elde etmek bu yüzden imkânsızdır; nesneyi çok sayıda açıdan
          “görmek” (sinogram) ve bu toplamları ters çevirmek – yani <b>rekonstrüksiyon</b> – gerekir.
        </p>
      </Explain>

      <Points
        items={[
          <>Her dedektör kanalı <b>tek bir çizgi integrali</b> ölçer: profilin her noktası, görüntüdeki bir ışının tümüyle ilgilidir.</>,
          <>Uzun yollar (gövdenin merkezi) ve <b>kemik</b> daha fazla zayıflatır: çizgi integrali yükselir, I/I₀ ve foton sayısı düşer.</>,
          <>θ'yı oynatın: profil, nesnenin o yöndeki gölgesi olarak şekil değiştirir. Yan yana duran yapılar bazı açılarda üst üste biner – tek projeksiyonda derinlik bilgisi yoktur.</>,
          <>Mono ve poli eğrileri arasındaki fark ışın sertleşmesidir; yolun uzadığı yerde büyür (Aşama 6'da düzeltilir).</>,
          <>Foton sayısı logaritmik eksende 3–4 dekad değişir: merkez kanallar en gürültülüdür. Bu, sonraki sayım/gürültü aşamasının konusudur.</>,
        ]}
      />
    </>
  );
}
