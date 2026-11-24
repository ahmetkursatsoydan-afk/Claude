/** Görüntü oluşumu gezgini – Aşama 1: Nesne (zayıflatma katsayısı haritası μ(x, y)). */
import { useMemo, useState } from 'react';
import { useFormation, ImageView, Explain, Points, Formula, Figure, NeedData, StatChip, wl, pixToMm } from '../common';
import { Seg } from '../../controls';
import { TISSUES, tissueChannels, channelsLinearAtten, monoHU, type TissueId } from '../../../physics/materials';
import './StageObject.css';

type Preset = 'soft' | 'bone' | 'lung' | 'wide';
const PRESETS: Record<Preset, { l: string; ww: number; wl: number }> = {
  soft: { l: 'Yumuşak doku', ww: 400, wl: 40 },
  bone: { l: 'Kemik', ww: 2000, wl: 500 },
  lung: { l: 'Akciğer', ww: 1500, wl: -600 },
  wide: { l: 'Geniş', ww: 3000, wl: 500 },
};

const TABLE_IDS: TissueId[] = ['air', 'lung', 'fat', 'water', 'blood', 'muscle', 'liver', 'trabecularBone', 'corticalBone'];

export function StageObject() {
  const { main, status } = useFormation();
  const [preset, setPreset] = useState<Preset>('soft');
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const eRef = main?.eRef ?? 0;
  const rows = useMemo(() => {
    if (!main) return [];
    return TABLE_IDS.filter((id) => id in TISSUES).map((id) => {
      const ch = tissueChannels(id);
      return { id, label: TISSUES[id].label, mu: channelsLinearAtten(ch, eRef), hu: monoHU(ch, eRef) };
    });
  }, [main, eRef]);

  const range = useMemo(() => {
    if (!main) return null;
    let lo = Infinity, hi = -Infinity;
    const d = main.truthHU;
    for (let k = 0; k < d.length; k++) {
      const v = d[k];
      if (v <= -1000) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return isFinite(lo) ? { lo, hi } : null;
  }, [main]);

  if (!main) return <NeedData status={status} />;

  const { m, pix, muRef } = main;
  const P = PRESETS[preset];
  const win = wl(P.ww, P.wl);

  let read: JSX.Element;
  if (hover) {
    const { i, j } = hover;
    const hu = main.truthHU[j * m + i];
    const x = pixToMm(i, m, pix), y = pixToMm(j, m, pix);
    const outside = Math.hypot(x, y) > 250;
    const mu = muRef * (1 + hu / 1000);
    read = (
      <div className="fxob-read">
        <span>
          <span className="l">x </span>
          {x.toFixed(1)} mm
        </span>
        <span>
          <span className="l">y </span>
          {y.toFixed(1)} mm
        </span>
        {outside ? (
          <span className="l">tarama alanı (SFOV, Ø 500 mm) dışında</span>
        ) : (
          <>
            <span>
              <span className="l">HU </span>
              {hu.toFixed(0)}
            </span>
            <span>
              <span className="l">μ </span>
              {Math.max(0, mu).toFixed(3)} cm⁻¹
            </span>
          </>
        )}
      </div>
    );
  } else {
    read = <div className="fxob-read idle">Değer okumak için imleci görüntünün üzerinde gezdirin.</div>;
  }

  return (
    <>
      <Figure cols={2}>
        <div>
          <div className="fx-ctrl fxob-ctrl">
            <span className="lab">Pencere</span>
            <Seg value={preset} options={(Object.keys(PRESETS) as Preset[]).map((k) => ({ v: k, l: PRESETS[k].l, title: `W ${PRESETS[k].ww} / L ${PRESETS[k].wl}` }))} onChange={setPreset} />
          </div>
          <ImageView
            data={main.truthHU}
            w={m}
            h={m}
            aspect={1}
            win={win}
            tag={`Gerçek nesne · W ${P.ww} / L ${P.wl}`}
            cursor="crosshair"
            onHover={(fx, fy) => {
              const i = Math.round(fx), j = Math.round(fy);
              if (i < 0 || j < 0 || i >= m || j >= m) {
                if (hover) setHover(null);
                return;
              }
              if (!hover || hover.i !== i || hover.j !== j) setHover({ i, j });
            }}
            onLeave={() => setHover(null)}
            overlayKey={hover ? hover.i * 100000 + hover.j : -1}
            overlay={(g, toS) => {
              if (!hover) return;
              const [sx, sy] = toS(hover.i, hover.j);
              g.strokeStyle = 'rgba(60,200,255,0.8)';
              g.lineWidth = 1;
              g.beginPath();
              g.moveTo(sx - 9, sy);
              g.lineTo(sx - 3, sy);
              g.moveTo(sx + 3, sy);
              g.lineTo(sx + 9, sy);
              g.moveTo(sx, sy - 9);
              g.lineTo(sx, sy - 3);
              g.moveTo(sx, sy + 3);
              g.lineTo(sx, sy + 9);
              g.stroke();
            }}
            caption={
              <>
                {m}×{m} matris, piksel {pix.toFixed(2)} mm, 500 mm alan. Üst = anterior, görüntünün sağı = hastanın solu. x sağa, y aşağıya
                (posteriora) doğru artar; orijin izomerkez.
              </>
            }
          />
          {read}
        </div>
        <div className="fxob-side">
          <Explain title="BT'nin ölçmeye çalıştığı şey: μ(x, y)">
            <p>
              Lineer zayıflatma katsayısı μ, X-ışını fotonlarının bir dokuda birim yol başına ne olasılıkla soğurulduğunu veya saçıldığını
              gösterir (birimi cm⁻¹). μ; dokunun <b>yoğunluğuna</b> (g/cm³), <b>atom bileşimine</b> (etkin atom numarası: kalsiyum, iyot,
              metal fotoelektrik etkiyi güçlendirir) ve <b>foton enerjisine</b> bağlıdır – enerji arttıkça μ genellikle azalır.
            </p>
            <p>
              Bir ışın bu haritayı kat ederken şiddeti Beer–Lambert yasasına göre azalır: I = I₀·e<sup>−∫μ dl</sup>. Sonraki aşamalarda
              tarayıcı yalnızca bu çizgi integrallerini ölçecek ve haritayı ölçümlerden geri hesaplamaya çalışacaktır.
            </p>
            <p>
              Burada görülen <b>“gerçek nesne”</b>, sentetik fantomun gürültüsüz referansıdır: kesit kalınlığı boyunca (z ekseni)
              ortalanmıştır (dolayısıyla kısmi hacim etkisi zaten içindedir) ve etkin enerji E<sub>ref</sub> = {main.eRef.toFixed(0)} keV'de
              hesaplanmıştır. Gerçek bir hastada bu harita bilinmez; burada rekonstrüksiyonun başarısını ölçmek için elimizde var.
            </p>
          </Explain>
          <Formula
            note={
              <>
                μ<sub>su</sub> = {muRef.toFixed(3)} cm⁻¹ (E<sub>ref</sub> = {main.eRef.toFixed(0)} keV'de su). Tersine: μ = μ<sub>su</sub>·(1 + HU/1000).
              </>
            }
          >
            HU = 1000 · (μ − μ<sub>su</sub>) / μ<sub>su</sub>
          </Formula>
          <div className="fx-stats">
            <StatChip label="E_ref" value={`${main.eRef.toFixed(0)} keV`} />
            <StatChip label="μ su" value={`${muRef.toFixed(3)} cm⁻¹`} tone="a" />
            {range && <StatChip label="HU aralığı (alan içi)" value={`${range.lo.toFixed(0)} … ${range.hi.toFixed(0)}`} />}
          </div>
        </div>
      </Figure>

      <div style={{ maxWidth: '80ch' }}>
        <div className="fxob-tblwrap">
          <table className="fxob-tbl">
            <thead>
              <tr>
                <th>Doku</th>
                <th className="num">μ (cm⁻¹)</th>
                <th className="num">HU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = Math.max(0, Math.min(1, (r.hu - win.lo) / (win.hi - win.lo)));
                const g = Math.round(t * 255);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="sw" style={{ background: `rgb(${g},${g},${g})` }} />
                      {r.label}
                    </td>
                    <td className="num">{r.mu.toFixed(3)}</td>
                    <td className="num">{r.hu.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="fxob-tblcap">
          Simülatörün doku tanımlarından E<sub>ref</sub> = {main.eRef.toFixed(0)} keV'de tek enerjili hesaplanan değerler. Renk kutusu,
          seçili penceredeki ({P.l}) gri tonunu gösterir. Gerçek taramada ölçülen HU; spektrum, ışın sertleşmesi ve rekonstrüksiyona bağlı
          olarak bunlardan biraz sapabilir.
        </div>
      </div>

      <Points
        items={[
          <>Hava −1000 HU, su 0 HU'dur – bu iki nokta HU ölçeğini tanım gereği sabitler.</>,
          <>Yağ, sudan daha az yoğun olduğu için negatiftir (yaklaşık −100 HU); akciğer parankimi havanın çokluğundan dolayı çok negatiftir.</>,
          <>Kemik, yüksek yoğunluk ve kalsiyumun yüksek atom numarası nedeniyle belirgin pozitiftir (trabeküler kemik yüz ila birkaç yüz, kortikal kemik 1000+ HU).</>,
          <>
            Yumuşak dokular arasındaki farklar yalnızca birkaç on HU'dur (ör. kas ≈ karaciğer ≈ kan). Bu küçük kontrastları seçebilmek için
            görüntü gürültüsünün düşük olması gerekir – doz, kernel ve rekonstrüksiyon seçimlerinin önemi buradan gelir.
          </>,
          <>Kemik veya akciğer penceresine geçerek aynı μ haritasının farklı aralıklarını görün: pencereleme veriyi değiştirmez, yalnızca gösterimi değiştirir.</>,
        ]}
      />
    </>
  );
}
