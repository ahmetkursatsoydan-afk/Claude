/**
 * Görüntü oluşumu gezgini – aşama 11: iteratif rekonstrüksiyon (tahmin et – karşılaştır – düzelt).
 * Veri: formationData.iter.iter (PWLS, OS-SQS; src/sim/iterative.ts). Seçenekler mağazadaki
 * iterOpts'a bağlıdır; hesaplama yalnızca "Yeniden hesapla" düğmesiyle başlar.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../../state/store';
import { runIterative } from '../../../app/formation';
import type { IterOptions } from '../../../sim/iterative';
import { LineChart, type ChartSeries } from '../../physics/LineChart';
import { Seg, Slider, Toggle } from '../../controls';
import { Explain, Figure, Formula, ImageView, NeedData, Points, SERIES, StatChip, StepPlayer, autoWindow, useFormation, wl } from '../common';
import './StageIterative.css';

/* ------------------------------------------------------------------ */
/* yardımcılar                                                          */
/* ------------------------------------------------------------------ */

/** Görüntünün merkez kırpması (m/2 × m/2) → 2× yakınlaştırma. */
function centerCrop(img: Float32Array, m: number): { d: Float32Array; n: number } {
  const n = Math.floor(m / 2), o = Math.floor((m - n) / 2);
  const d = new Float32Array(n * n);
  for (let j = 0; j < n; j++) d.set(img.subarray((j + o) * m + o, (j + o) * m + o + n), j * n);
  return { d, n };
}

/** |v| dağılımının yüzdeliği (örneklemeli). */
function absPct(a: Float32Array, p: number): number {
  const step = Math.max(1, Math.floor(a.length / 30000));
  const v: number[] = [];
  for (let i = 0; i < a.length; i += step) if (isFinite(a[i])) v.push(Math.abs(a[i]));
  if (!v.length) return 1;
  v.sort((x, y) => x - y);
  return v[Math.floor(p * (v.length - 1))] || 1e-6;
}

const fmtIt = (k: number) => (Math.abs(k - Math.round(k)) < 1e-6 ? String(Math.round(k)) : k.toFixed(2));
const sameOpts = (a: IterOptions, b: IterOptions) => a.init === b.init && a.iters === b.iters && Math.abs(a.beta - b.beta) < 1e-9 && a.deltaHU === b.deltaHU && a.weighted === b.weighted;

/* ------------------------------------------------------------------ */
/* döngü şeması                                                         */
/* ------------------------------------------------------------------ */

interface LoopStep {
  n: number;
  t: ReactNode;
  s: ReactNode;
  d: ReactNode;
}

const LOOP: LoopStep[] = [
  {
    n: 1,
    t: <>Tahmin x⁽ᵏ⁾</>,
    s: 'şu anki görüntü',
    d: <>Elimizdeki en iyi görüntü tahmini (μ haritası). Başlangıçta x⁽⁰⁾ ya FBP görüntüsüdür (klinik uygulama) ya da boş (sıfır) görüntü. Aşağıda panel (a).</>,
  },
  {
    n: 2,
    t: <>İleri izdüşüm A·x</>,
    s: 'sanal tarama',
    d: <>Tahmin edilen görüntü, tarayıcının matematiksel modeliyle (geometri, ışın izleme, dedektör/odak bulanıklığı) “sanal olarak taranır”: bu görüntü gerçek nesne olsaydı hangi sinogram ölçülürdü?</>,
  },
  {
    n: 3,
    t: <>Ölçümle karşılaştır</>,
    s: 'r = A·x − y',
    d: <>Sanal sinogram, gerçekten ölçülen (log dönüştürülmüş) sinogram y ile karşılaştırılır. Fark r = A·x − y <b>artık</b> (residual) sinogramdır: tahminin ölçümle nerede tutarsız olduğunu gösterir. Panel (b).</>,
  },
  {
    n: 4,
    t: <>Ağırlıklı geri izdüşüm</>,
    s: 'Aᵀ·W·r',
    d: <>Artık, istatistiksel ağırlıklarla (W ≈ ışının foton sayısı) çarpılıp görüntü uzayına geri izdüşürülür. Az foton almış, gürültülü ışınların “şikâyeti” daha az dikkate alınır. Bu, veri teriminin gradyanıdır.</>,
  },
  {
    n: 5,
    t: <>Düzenlileştirme</>,
    s: 'gürültü cezası β·∇R',
    d: <>Komşu pikseller arasındaki farklara ceza uygulanır (Huber): küçük farklar (gürültü) yumuşatılır, büyük farklar (gerçek kenarlar) korunur. Gücü β belirler. Grafikteki “ceza” eğrisi bu terimdir.</>,
  },
  {
    n: 6,
    t: <>Güncelle x⁽ᵏ⁺¹⁾</>,
    s: 'düzeltmeyi uygula',
    d: <>İki gradyan birleştirilip piksel başına adım boyuyla (SQS) görüntüye eklenir; negatif μ sıfırlanır. Yeni görüntü bir sonraki turun tahmini olur. Panel (c) bu adımda yapılan düzeltmeyi gösterir.</>,
  },
];

/** Izgara yerleşimi (geniş ekran): 1 → 2 → 3 / ↓ / 6 ← 5 ← 4, 6 ↑ 1. */
const POS: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 3], 3: [1, 5], 4: [3, 5], 5: [3, 3], 6: [3, 1] };
const ARROWS: { r: number; c: number; g: string; o: number; lab?: string }[] = [
  { r: 1, c: 2, g: '→', o: 1 },
  { r: 1, c: 4, g: '→', o: 2 },
  { r: 2, c: 5, g: '↓', o: 3 },
  { r: 3, c: 4, g: '←', o: 4 },
  { r: 3, c: 2, g: '←', o: 5 },
  { r: 2, c: 1, g: '↑', o: 6, lab: 'k ← k+1' },
];

function LoopDiagram({ sel, onSel }: { sel: number; onSel: (n: number) => void }) {
  const cur = LOOP.find((s) => s.n === sel) ?? LOOP[0];
  return (
    <div className="sit-loopwrap">
      <div className="sit-loop" role="list" aria-label="İteratif rekonstrüksiyon döngüsü">
        {LOOP.map((s) => (
          <button
            key={s.n}
            role="listitem"
            className={'sit-box' + (s.n === sel ? ' on' : '')}
            style={{ gridRow: POS[s.n][0], gridColumn: POS[s.n][1], order: 2 * s.n - 1 }}
            onClick={() => onSel(s.n)}
          >
            <span className="sit-n">{s.n}</span>
            <span className="sit-t">{s.t}</span>
            <span className="sit-s">{s.s}</span>
          </button>
        ))}
        {ARROWS.map((a, i) => (
          <span key={i} className={'sit-arr' + (a.lab ? ' back' : '')} style={{ gridRow: a.r, gridColumn: a.c, order: 2 * a.o }} aria-hidden>
            <span className="wide">{a.g}</span>
            <span className="narrow">{a.lab ? '↺ 1' : '↓'}</span>
            {a.lab && <span className="lab">{a.lab}</span>}
          </span>
        ))}
      </div>
      <div className="sit-detail">
        <b>
          {cur.n} · {cur.t}
        </b>{' '}
        — {cur.d}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* aşama                                                                */
/* ------------------------------------------------------------------ */

export function StageIterative() {
  const { main, iter, status, iterStatus } = useFormation();
  const storeOpts = useApp((s) => s.formation.iterOpts);
  const [draft, setDraft] = useState<IterOptions>(storeOpts);
  useEffect(() => setDraft(storeOpts), [storeOpts]);

  const ir = iter?.iter ?? null;
  const [idx, setIdx] = useState(0);
  const [autoOverride, setAutoOverride] = useState<boolean | null>(null);
  const [fixedRes, setFixedRes] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [cmpWin, setCmpWin] = useState<'soft' | 'narrow'>('soft');
  const [loopSel, setLoopSel] = useState(1);

  // yeni sonuç gelince oynatıcıyı başa al
  useEffect(() => {
    setIdx(0);
    setAutoOverride(null);
  }, [ir]);

  const running = iterStatus === 'running';
  const start = (o: IterOptions = draft) => void runIterative({ ...o });

  // artık için kareler boyunca sabit simetrik ölçek (ilk güncelleme karesinden)
  const resRange = useMemo(() => {
    if (!ir || !ir.snaps.length) return 1;
    const ref = ir.snaps[Math.min(1, ir.snaps.length - 1)];
    return absPct(ref.residual, 0.98);
  }, [ir]);

  // son karşılaştırma görüntüleri
  const final = useMemo(() => {
    if (!iter || !ir || !ir.snaps.length) return null;
    const last = ir.snaps[ir.snaps.length - 1].img;
    const diff = new Float32Array(last.length);
    for (let i = 0; i < last.length; i++) diff[i] = last[i] > -1024 && iter.fbpHU[i] > -1024 ? last[i] - iter.fbpHU[i] : 0;
    return { last, diff };
  }, [iter, ir]);

  const crops = useMemo(() => {
    if (!iter || !final || !zoom) return null;
    const m = iter.m;
    return { fbp: centerCrop(iter.fbpHU, m), ir: centerCrop(final.last, m), truth: centerCrop(iter.truthHU, m), diff: centerCrop(final.diff, m) };
  }, [iter, final, zoom]);

  const charts = useMemo(() => {
    if (!ir || !iter) return null;
    const c = ir.curve;
    const xMax = Math.max(1, ...c.map((p) => p.iter));
    const dataPts: [number, number][] = c.map((p) => [p.iter, p.data > 0 ? p.data : NaN]);
    const penPts: [number, number][] = c.map((p) => [p.iter, p.penalty > 0 ? p.penalty : NaN]);
    const noisePts: [number, number][] = c.map((p) => [p.iter, p.noise]);
    const rmsePts: [number, number][] = c.map((p) => [p.iter, p.rmse ?? NaN]);
    return { xMax, dataPts, penPts, noisePts, rmsePts };
  }, [ir, iter]);

  const autoDefault = useMemo(() => {
    if (!ir) return false;
    const s = ir.snaps[Math.min(idx, ir.snaps.length - 1)];
    return ir.opts.init === 'zero' && (s?.iter ?? 0) < 2;
  }, [ir, idx]);

  if (!main) return <NeedData status={status} />;

  /* --- kontroller --- */
  const dirty = ir ? !sameOpts(draft, ir.opts) : true;
  const controls = (
    <div className="sit-ctl">
      <div className="sit-g wide">
        <span className="sit-lab">Başlangıç</span>
        <Seg
          value={draft.init}
          options={[
            { v: 'fbp', l: "FBP'den (klinik)", title: 'x⁽⁰⁾ = FBP görüntüsü' },
            { v: 'zero', l: 'Boş görüntüden (oluşumu izle)', title: 'x⁽⁰⁾ = 0' },
          ]}
          onChange={(v) => setDraft({ ...draft, init: v })}
        />
      </div>
      <div className="sit-g">
        <span className="sit-lab">İterasyon sayısı</span>
        <Slider value={draft.iters} min={3} max={20} step={1} onChange={(v) => setDraft({ ...draft, iters: v })} />
      </div>
      <div className="sit-g">
        <span className="sit-lab">Düzenlileştirme β</span>
        <Slider value={draft.beta} min={0.003} max={0.3} step={0.001} log onChange={(v) => setDraft({ ...draft, beta: v })} />
      </div>
      <div className="sit-g">
        <span className="sit-lab">Huber δ</span>
        <Slider value={draft.deltaHU} min={3} max={60} step={1} unit="HU" onChange={(v) => setDraft({ ...draft, deltaHU: v })} />
      </div>
      <div className="sit-g">
        <span className="sit-lab">İstatistiksel ağırlık</span>
        <Toggle value={draft.weighted} onChange={(v) => setDraft({ ...draft, weighted: v })} label={draft.weighted ? 'PWLS (W ≈ foton sayısı)' : 'ağırlıksız LS (W = 1)'} />
      </div>
      <div className="sit-run">
        <button className={'btn ' + (dirty && !running ? 'primary' : '')} disabled={running} onClick={() => start()}>
          Yeniden hesapla
        </button>
        <span className={'sit-status' + (running ? ' running' : iterStatus === 'error' ? ' error' : '')}>
          {running
            ? 'Hesaplanıyor (~10 s)…'
            : iterStatus === 'error'
              ? 'Hesaplama hatası – yeniden deneyin.'
              : ir
                ? dirty
                  ? 'Ayarlar değişti – sonuçları görmek için yeniden hesaplayın.'
                  : `Hazır · ${ir.opts.iters} iterasyon × ${ir.subsets} alt küme · ${(ir.ms / 1000).toFixed(1)} s`
                : ''}
        </span>
      </div>
    </div>
  );

  const intro = (
    <Explain title="FBP tek seferde çözer, IR tekrar tekrar düzeltir">
      <p>
        <b>FBP</b> analitik ve tek adımlıdır: verinin ideal (gürültüsüz, eksiksiz, ince kalem ışınlı) olduğunu varsayar ve sinogramı rampa filtresi + geri izdüşümle bir kerede tersine çevirir. Hızlıdır, ama her ışına eşit güvenir ve tarayıcının gerçek fiziğini (dedektör bulanıklığı, foton istatistiği) bilmez.
      </p>
      <p>
        <b>İteratif rekonstrüksiyon (IR)</b> ise bir tahminle başlar ve şu döngüyü tekrarlar: tahmini tarayıcı modeliyle <i>sanal olarak tara</i>, sonucu <i>ölçümle karşılaştır</i>, farkı görüntüye <i>geri izdüşür</i> ve tahmini <i>düzelt</i>. Böylece ölçüm gürültüsü ve sistem özellikleri hesaba katılabilir. Kutulara tıklayarak her adımın açıklamasını görün.
      </p>
    </Explain>
  );

  if (!ir || !iter || !charts || !final) {
    return (
      <>
        {intro}
        <LoopDiagram sel={loopSel} onSel={setLoopSel} />
        {controls}
        <div className="fx-need">
          {running ? (
            'İteratif rekonstrüksiyon hesaplanıyor (~10 s)… Ana aşamalar hazır; bu hesap arka planda sürüyor.'
          ) : (
            <>
              {iterStatus === 'error' ? 'İteratif hesaplama başarısız oldu.' : 'İteratif rekonstrüksiyon henüz hesaplanmadı.'}{' '}
              <button className="btn primary sm" onClick={() => start()}>
                Hesapla
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  const { m } = iter;
  const M = ir.subsets;
  const si = Math.min(idx, ir.snaps.length - 1);
  const snap = ir.snaps[si];
  const auto = autoOverride ?? autoDefault;
  const lastCurve = ir.curve[ir.curve.length - 1];
  const irNoise = lastCurve?.noise ?? NaN;
  const irRmse = lastCurve?.rmse ?? null;
  const vl = [{ x: snap.iter, label: 'seçili' }];
  const snapRange = fixedRes ? resRange : absPct(snap.residual, 0.98);
  const imgWin = auto ? autoWindow(snap.img, 0.01, 0.99, (v) => v <= -1024) : wl(400, 40);
  const cmp = cmpWin === 'soft' ? { w: 400, l: 40 } : { w: 150, l: 40 };
  const cmpW = wl(cmp.w, cmp.l);
  const fbpSig = iter.fbpNoise, fbpRm = iter.fbpRmse;
  const sigRed = isFinite(irNoise) && fbpSig > 0 ? 1 - irNoise / fbpSig : NaN;
  const flat = (y: number): [number, number][] => [
    [0, y],
    [charts.xMax, y],
  ];
  const noiseSeries: ChartSeries[] = [
    { name: 'IR σ', color: SERIES[0], pts: charts.noisePts },
    { name: 'FBP σ', color: SERIES[1], pts: flat(fbpSig), dash: true, width: 1.5 },
  ];
  const rmseSeries: ChartSeries[] = [
    { name: 'IR RMSE', color: SERIES[2], pts: charts.rmsePts },
    { name: 'FBP RMSE', color: SERIES[1], pts: flat(fbpRm), dash: true, width: 1.5 },
  ];
  const curAt = ir.curve.reduce((b, p) => (Math.abs(p.iter - snap.iter) < Math.abs(b.iter - snap.iter) ? p : b), ir.curve[0]);

  const cv = (full: Float32Array, key: 'fbp' | 'ir' | 'truth' | 'diff') => (crops ? crops[key] : { d: full, n: m });
  const vFbp = cv(iter.fbpHU, 'fbp'), vIr = cv(final.last, 'ir'), vTr = cv(iter.truthHU, 'truth'), vDf = cv(final.diff, 'diff');

  return (
    <>
      {intro}
      <LoopDiagram sel={loopSel} onSel={setLoopSel} />
      {controls}

      <div className="sit-player">
        <StepPlayer
          count={ir.snaps.length}
          index={si}
          onChange={setIdx}
          fps={2}
          label={
            <>
              güncelleme {snap.update} · iterasyon {fmtIt(snap.iter)} ({snap.update}/{M})
            </>
          }
        />
        <div className="sit-player-opts">
          <Toggle value={auto} onChange={setAutoOverride} label="otomatik pencere (a)" />
          <Toggle value={fixedRes} onChange={setFixedRes} label="artık için sabit ölçek (b)" />
        </div>
      </div>

      <Figure cols={4}>
        <ImageView
          data={snap.img}
          w={m}
          h={m}
          aspect={1}
          win={imgWin}
          tag={<>(a) 1 · x⁽ᵏ⁾</>}
          caption={<>Şu anki tahmin x⁽ᵏ⁾ ({auto ? 'otomatik pencere' : 'W 400 / L 40'})</>}
        />
        <ImageView
          data={snap.residual}
          w={ir.rnb}
          h={ir.rnv}
          aspect={1.4}
          cmap="div"
          divRange={snapRange}
          tag={<>(b) 3 · r = A·x − y</>}
          caption={
            <>
              Artık sinogram (yatay: s −250 → +250 mm, dikey: θ 0° → 180°; mavi: tahmin az, turuncu: fazla). Ölçek ±{snapRange.toPrecision(2)}. Artık, ölçümle tutarsızlıktır; iterasyonlar ilerledikçe yapısını kaybedip gürültüye dönüşür.
            </>
          }
        />
        <ImageView
          data={snap.update_img}
          w={m}
          h={m}
          aspect={1}
          cmap="div"
          divRange={50}
          tag={<>(c) 6 · Δx</>}
          caption={si === 0 ? 'Başlangıç: henüz düzeltme yok.' : 'Bu adımda yapılan düzeltme (önceki kareye göre, ±50 HU).'}
        />
        <ImageView data={iter.truthHU} w={m} h={m} aspect={1} win={imgWin} tag="(d) gerçek nesne" caption="Referans: fantomun gerçek HU haritası (aynı pencere)." />
      </Figure>

      <div className="fx-stats">
        <StatChip label="Veri terimi" value={curAt.data.toExponential(2)} tone="a" />
        <StatChip label="Ceza β·R" value={curAt.penalty > 0 ? curAt.penalty.toExponential(2) : '0'} />
        <StatChip label="Gürültü σ" value={`${curAt.noise.toFixed(1)} HU`} />
        <StatChip label="RMSE (gerçeğe)" value={curAt.rmse != null ? `${curAt.rmse.toFixed(1)} HU` : '—'} />
      </div>

      <Figure cols={3}>
        <div>
          <LineChart
            height={200}
            series={[
              { name: 'Veri terimi', color: SERIES[0], pts: charts.dataPts },
              { name: 'Ceza β·R', color: SERIES[3], pts: charts.penPts },
            ]}
            xLabel="iterasyon"
            yLabel="amaç terimleri (log)"
            yLog
            xMin={0}
            xMax={charts.xMax}
            vlines={vl}
            fmtY={(v) => v.toExponential(0)}
          />
          <div className="fx-cap">Veri terimi ½Σw(Ax−y)² hızla düşer; ceza, görüntü düzgünleştikçe dengeye gelir.</div>
        </div>
        <div>
          <LineChart height={200} series={noiseSeries} xLabel="iterasyon" yLabel="gürültü σ (HU)" xMin={0} xMax={charts.xMax} yMin={0} vlines={vl} />
          <div className="fx-cap">Homojen yumuşak doku bölgelerinde ölçülen σ; kesikli çizgi: FBP.</div>
        </div>
        <div>
          <LineChart height={200} series={rmseSeries} xLabel="iterasyon" yLabel="RMSE (HU)" xMin={0} xMax={charts.xMax} yMin={0} vlines={vl} />
          <div className="fx-cap">Gerçek nesneye uzaklık (vücut içi); kesikli çizgi: FBP. Bu ölçü yalnızca simülasyonda bilinebilir.</div>
        </div>
      </Figure>

      <Explain title="Sonuç: FBP ve IR yan yana">
        <p>
          Aynı ham veriden FBP ve {ir.opts.iters} iterasyonluk {ir.opts.weighted ? 'PWLS' : 'ağırlıksız'} IR (β = {ir.opts.beta.toPrecision(2)}, δ = {ir.opts.deltaHU} HU). Gürültü dokusunu görmek için dar pencereyi ve 2× yakınlaştırmayı deneyin.
        </p>
      </Explain>
      <div className="sit-player-opts">
        <Seg
          value={cmpWin}
          options={[
            { v: 'soft', l: 'W 400 / L 40' },
            { v: 'narrow', l: 'W 150 / L 40 (dar)' },
          ]}
          onChange={setCmpWin}
        />
        <Toggle value={zoom} onChange={setZoom} label="merkez 2× yakınlaştır" />
      </div>
      <Figure cols={4}>
        <ImageView data={vFbp.d} w={vFbp.n} h={vFbp.n} aspect={1} win={cmpW} tag="FBP" caption={`σ ${fbpSig.toFixed(1)} HU · RMSE ${fbpRm.toFixed(1)} HU`} />
        <ImageView data={vIr.d} w={vIr.n} h={vIr.n} aspect={1} win={cmpW} tag="IR (son)" caption={`σ ${isFinite(irNoise) ? irNoise.toFixed(1) : '—'} HU · RMSE ${irRmse != null ? irRmse.toFixed(1) : '—'} HU`} />
        <ImageView data={vTr.d} w={vTr.n} h={vTr.n} aspect={1} win={cmpW} tag="Gerçek" caption="Gürültüsüz referans" />
        <ImageView data={vDf.d} w={vDf.n} h={vDf.n} aspect={1} cmap="div" divRange={50} tag="IR − FBP" caption="IR'nin FBP'den farkı (±50 HU): çoğunlukla kaldırılan gürültü ve çizgiler; kenarlarda yapı görülüyorsa çözünürlük de değişmiştir." />
      </Figure>
      <div className="fx-stats">
        <StatChip label="FBP σ" value={`${fbpSig.toFixed(1)} HU`} tone="b" />
        <StatChip label="IR σ" value={`${isFinite(irNoise) ? irNoise.toFixed(1) : '—'} HU`} tone="a" />
        <StatChip label="σ azalması" value={isFinite(sigRed) ? `${(sigRed * 100).toFixed(0)} %` : '—'} tone={sigRed > 0 ? 'ok' : 'warn'} />
        <StatChip label="FBP RMSE" value={`${fbpRm.toFixed(1)} HU`} tone="b" />
        <StatChip label="IR RMSE" value={irRmse != null ? `${irRmse.toFixed(1)} HU` : '—'} tone="a" />
        <StatChip label="FBP σ’sı için IR dozu (σ ∝ 1/√doz)" value={isFinite(sigRed) && irNoise > 0 ? `≈ %${Math.round(100 * (irNoise / fbpSig) ** 2)}` : '—'} />
        <StatChip label="Hesap süresi" value={`${(ir.ms / 1000).toFixed(1)} s`} />
      </div>

      <Explain title="Amaç fonksiyonu: veriye uy, ama gürültüye uyma">
        <p>
          IR, aşağıdaki amaç fonksiyonunu en küçük yapan görüntüyü arar. İlk terim (<b>veri terimi</b>) sanal taramanın ölçüme ne kadar uyduğunu ölçer; her ışının hatası istatistiksel ağırlığı wᵢ ile çarpılır. wᵢ ≈ o ışında algılanan foton sayısı (≈ 1/varyans) olduğundan, az foton almış ve dolayısıyla gürültülü ışınlara (omuzlar, metal, kalın yol) daha az güvenilir: FBP'deki çizgi artefaktları ve gürültü azalır.
        </p>
        <p>
          İkinci terim (<b>düzenlileştirme / ön bilgi</b>, R) “gerçek görüntüler parça parça düzgündür” varsayımını kodlar. Huber cezası komşu farkı δ'dan küçükse karesel (güçlü yumuşatma: gürültü), büyükse doğrusal (zayıf ceza: kenarlar korunur) davranır. β bu ikisi arasındaki dengeyi ayarlar.
        </p>
      </Explain>
      <Formula note="A: sistem matrisi (ileri izdüşüm), y: ölçülen log sinogram, wᵢ: istatistiksel ağırlık, ψ_δ: Huber fonksiyonu, j~k: komşu pikseller.">
        Φ(x) = ½ Σ<sub>i</sub> w<sub>i</sub> ([Ax]<sub>i</sub> − y<sub>i</sub>)² + β · Σ<sub>j~k</sub> ψ<sub>δ</sub>(x<sub>j</sub> − x<sub>k</sub>)
      </Formula>
      <Explain title="Hız, sınırlar ve klinik karşılıkları">
        <p>
          <b>Sıralı alt kümeler (OS)</b>: her güncellemede açıların yalnızca bir alt kümesi (burada {M} alt küme, her biri görünümlerin 1/{M}'i) kullanılır; bir tam iterasyon = {M} güncelleme. Bu, yakınsamayı kabaca alt küme sayısı kadar hızlandırır. Güncellemeyi piksel başına adım boyuyla yapan yöntemin adı ayrılabilir karesel vekildir (SQS).
        </p>
        <p>
          <b>Kazanç ve bedel</b>: daha düşük gürültü, aynı görüntü kalitesinde doz azaltmaya izin verir (klinik çalışmalarda sıklıkla %30–60). Ancak yüksek güçte gürültü dokusu “plastik / yağlı boya” görünümü alır, düşük kontrastlı küçük lezyonların saptanabilirliği σ'daki düşüşün düşündürdüğü kadar iyileşmez (gürültü kaba taneli hâle gelir) ve hesaplama süresi FBP'den belirgin olarak uzundur.
        </p>
        <p>
          <b>Klinik aileler</b>: <i>hibrit IR</i> (ör. ASiR, iDose, SAFIRE, AIDR 3D) iterasyonları çoğunlukla sinogram ve/veya görüntü uzayında, tam ileri-geri izdüşüm döngüsü olmadan ya da az sayıda döngüyle yapar ve hızlıdır. <i>Model tabanlı IR</i> (ör. Veo, ADMIRE, FIRST) burada gösterildiği gibi tam sistem modeliyle ileri/geri izdüşüm döngüsü kurar.
        </p>
        <p className="sit-honest">
          Not: Bu gösterim, küçültülmüş bir ızgarada ({m}², {iter.pix.toFixed(2)} mm piksel) tam istatistiksel bir IR'dir (PWLS, OS-SQS, Huber ceza). Eğitim amaçlı basitleştirilmiş bir simülasyondur; ticari algoritmaların ayrıntıları farklıdır. Ana simülatördeki “İteratif (hibrit)” seçeneği ise daha hızlı bir hibrit yaklaşım kullanır.
        </p>
      </Explain>

      <Points
        items={[
          <>
            <b>“Boş görüntüden” başlatıp oynatın</b>: önce genel şekil ve kaba yoğunluklar (düşük frekanslar) belirir, kenarlar ve ince ayrıntılar (yüksek frekanslar) çok daha sonra oturur. Bu yavaş yakınsama, klinik IR'nin neden FBP görüntüsüyle başladığını açıklar.
            {ir.opts.init === 'zero' ? '' : ' (Şu an FBP başlangıcı gösteriliyor.)'}{' '}
            {ir.opts.init !== 'zero' && (
              <button className="btn sm" disabled={running} onClick={() => start({ ...draft, init: 'zero' })}>
                Boş görüntüden hesapla
              </button>
            )}
          </>,
          <>
            <b>Artık sinogramı (b) izleyin</b>: başta nesnenin izleri (sinüzoidal yapılar) görülür; tahmin iyileştikçe artık küçülür ve yapısız, rastgele gürültüye dönüşür. Gürültüye tam uymak istenmez – bu yüzden düzenlileştirme vardır.
          </>,
          <>
            <b>İstatistiksel ağırlığı kapatın</b> (ağırlıksız LS): az foton alan ışınlar diğerleriyle eşit güvenildiğinden, foton açlığı çeken bölgelerde (omuz, kalça, metal) daha fazla çizgi ve gürültü görebilirsiniz.
          </>,
          <>
            <b>β'yı artırın</b>: gürültü σ azalır, ama küçük, düşük kontrastlı yapılar bulanıklaşır ve doku “plastik” görünür; β'yı azaltınca görüntü FBP'ye benzer gürültülü hâle döner. δ küçüldükçe kenar koruması daha fazla küçük farka uzanır (daha “lekeli” görünüm).
          </>,
          <>Gürültü σ ile RMSE aynı şey değildir: σ yalnızca homojen bölgelerdeki dalgalanmayı, RMSE ise kenar bulanıklığı dahil gerçeğe toplam uzaklığı ölçer. Aşırı düzenlileştirme σ'yı düşürürken RMSE'yi artırabilir.</>,
        ]}
      />
    </>
  );
}
