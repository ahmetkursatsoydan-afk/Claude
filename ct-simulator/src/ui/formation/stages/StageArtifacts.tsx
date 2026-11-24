/**
 * Görüntü oluşumu gezgini – Aşama 12: artefakt atlası.
 * Her artefakt için: zincirdeki kaynağı, nedeni, sinogram/görüntü izi, azaltma yöntemi ve aynı fizik
 * motoruyla hesaplanan A (ideal) / B (artefakt) / C (düzeltme) varyantları; hata haritaları (her varyant
 * kendi gerçeğine göre), sinogramlar, fark sinogramı ve yatay HU profili.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../state/store';
import { formationData, runAtlasEntry, REGIONS } from '../../../app/formation';
import { DEFAULT_SOURCE } from '../../../app/formationSource';
import { ARTIFACTS, CHAIN, type ArtifactEntry, type ArtifactVariant } from '../../../app/artifactAtlas';
import type { FormationResult } from '../../../sim/formation';
import { KERNELS } from '../../../physics/kernels';
import { LineChart, type ChartSeries } from '../../physics/LineChart';
import { Seg } from '../../controls';
import { ImageView, ColorBar, Explain, Points, Figure, StatChip, PipelineMap, autoWindow, wl, pixToMm } from '../common';
import './StageArtifacts.css';

/* ------------------------------------------------------------------ */
/* Sabitler                                                             */
/* ------------------------------------------------------------------ */

const ROLE: Record<ArtifactVariant['role'], { tag: string; letter: string; color: string }> = {
  ideal: { tag: 'A · İdeal', letter: 'A', color: '#199e70' },
  artifact: { tag: 'B · Artefakt', letter: 'B', color: '#d95926' },
  fix: { tag: 'C · Düzeltme', letter: 'C', color: '#3987e5' },
};
const TRUTH_COLOR = '#c98500';
const TRUTH_COLOR2 = '#d55181';

/** Girdiye özgü "neye bakmalı?" ipuçları. */
const HINTS: Record<string, string[]> = {
  noise: [
    'B’nin hata haritası ince taneli ve rastgeledir: desen nesnenin yapısını izlemez. Bu, artefakttan çok “gürültü”dür ama düşük dozda tanıyı aynı şekilde bozar.',
    'mAs 300 → 25 (12 kat az foton): σ yaklaşık √12 ≈ 3.5 kat artmalı. σ çiplerini karşılaştırın.',
    'C’de iteratif rekonstrüksiyon σ’yı düşürür; ancak gürültü dokusu değişir (daha “düz/mumsu” görünüm) ve çok küçük düşük kontrastlı ayrıntılar da yumuşayabilir.',
    'Fark sinogramında (B − A) dalgalanma en çok uzun ışın yollarında (sinogramın orta kanalları) büyüktür: orada foton sayısı en azdır.',
  ],
  starvation: [
    'Çizgiler sağ–sol (yatay) yönde uzanır: kolların da ışın yolunda olduğu yatay görünümlerde zayıflatma en yüksektir.',
    'A ile B’nin nesnesi farklıdır (kolların yeri), bu yüzden fark sinogramı gösterilmez; hata haritaları her varyantın kendi gerçeğine göredir.',
    'C’de PWLS (istatistiksel ağırlıklı) iteratif rekon, az fotonlu ışınlara düşük güven verir; çizgiler belirgin şekilde azalır.',
  ],
  beamhard: [
    'B’de (BHC yok) yumuşak doku HU’su konuma göre kayar ve petröz kemikler arasında koyu bantlar oluşur; dar pencere (WW 100) bunları belirginleştirir.',
    'C’de su BHC kalibrasyonu çanak/kupa etkisini büyük ölçüde giderir; ancak kemiğin enerji bağımlılığı sudan farklı olduğu için kemikler arası koyu bant azalarak kalır.',
    'Fark sinogramında (B − A) özellikle uzun ve kemikten geçen ışın yollarında polikromatik ölçüm ideal (monoenerjetik) değerden sapar.',
  ],
  metal: [
    'A’nın gerçeğinde metal yok, B ve C’ninkinde var: her varyantın hata haritası KENDİ gerçeğine göre olduğu için yalnızca artefakt (+ gürültü) görünür.',
    'B’de çizgiler metalden yayılır; iki çubuğu birleştiren doğrultuda koyu bant (bu ışınlar iki metalden birden geçer: en büyük foton açlığı ve sertleşme).',
    'MAR (C) metal izini sinogramda komşu ölçümlerden enterpolasyonla doldurur; çizgiler azalır ama metalin hemen çevresinde ayrıntı kaybı/bulanıklık kalabilir. Metal pikselleri sonradan geri konur.',
  ],
  motion: [
    'Hareket sırasında nesne her an farklıdır; “gerçek” görüntü tek bir an için tanımlanır. Bu yüzden hata haritası hem çizgileri hem de konum/kontur farkını içerir.',
    'Hareket çipi, kesit boyunca diyaframın yer değiştirme aralığını gösterir: aynı solunumda daha kısa rotasyon (C) daha az yer değiştirme demektir.',
    'Fark sinogramında hareketli kenarların (diyafram, karaciğer kubbesi) sinüzoidal izleri boyunca bantlar görülür; ilk ve son görünüm uyuşmaz.',
  ],
  scatter: [
    'SPR: merkez ışında saçılan/birincil foton oranı. Saçılan fotonlar ölçülen yoğunluğu artırır → zayıflatma olduğundan düşük → HU düşer.',
    'Fark sinogramında (B − A) değerler çoğunlukla negatiftir; göreli etki en çok yüksek zayıflatmalı (yanal, kemikten geçen) ışınlarda büyüktür.',
    'Model tabanlı düzeltme (C) tahmini saçılmayı çıkarır; HU kaymasını giderir ama saçılmanın getirdiği ek kuantum gürültüsü kalır (σ hafif yüksek olabilir).',
  ],
  ring: [
    'Fark sinogramında (B − A) birkaç sabit kanalda, tüm açılar boyunca dikey çizgiler: kanal hatası açıdan bağımsızdır.',
    'Kanal izomerkezden |s| uzaklıktaki ışınları ölçer; bu ışınların zarfı r = |s| yarıçaplı bir çemberdir. Bu simülasyondaki paralel-ışın 180° verisinde tek bir kanal yarım çember çizer.',
    'Dar pencere (WW 200) küçük HU sapmalarını görünür kılar; halkalar profilde simetrik sivri tepeler olarak görülür.',
  ],
  aliasing: [
    '30 görünümde ardışık açılar arası 6°’dir: geri izdüşüm “sıvamaları” birbirini sönümleyemez; çizgiler yüksek kontrastlı kenarlardan uzaklaştıkça belirginleşir.',
    'Kaba kural (paralel ışın): gereken görünüm sayısı ≈ (π/2) × kanal sayısı. 556 kanal için bu ≈ 870 görünüm demektir.',
    'Geometri farklı (görünüm sayısı) olduğu için fark sinogramı gösterilmez; B’nin sinogramındaki seyrek satırlara dikkat edin.',
  ],
  truncation: [
    'Kollar yanlardayken iri hastanın bir kısmı 50 cm SFOV dışına taşar; o doku bazı açılarda ışın yolundadır ama dedektör kenarının dışında kalır.',
    'Sinogramın kenarlarında (s ≈ ±250 mm) profil sıfıra inmez: veri kesiktir.',
    'Görüntüde SFOV sınırına yakın parlak bant ve kenarlarda HU kayması; profilin uç bölgelerine bakın. Nesne farklı olduğu için fark sinogramı gösterilmez.',
  ],
  partial: [
    'Bu simülasyonda “gerçek” de kesit kalınlığı boyunca ortalanmıştır: hata haritası kısmi hacmi göstermez! Kısmi hacmin kendisi A ve B’nin GERÇEK profilleri (kesikli çizgiler) arasındaki farktır.',
    'Akciğer penceresinde küçük damarlar ve nodüller 10 mm’de silikleşir, kontrastları düşer.',
    'Ödünleşim: kalın kesitte daha çok foton → σ düşer. σ çiplerini karşılaştırın.',
  ],
};

/* ------------------------------------------------------------------ */
/* Türetilmiş veriler                                                   */
/* ------------------------------------------------------------------ */

interface VarData {
  r: FormationResult;
  img: Float32Array;
  err: Float32Array;
  isIR: boolean;
  noise: number;
  rmse: number;
  iters: number;
}

function derive(r: FormationResult, v: ArtifactVariant): VarData {
  const ir = v.iterative && r.iter && r.iter.snaps.length > 0 ? r.iter : null;
  const img = ir ? ir.snaps[ir.snaps.length - 1].img : r.fbpHU;
  const m = r.m, pix = r.pix, half = (m - 1) / 2, R = (m * pix) / 2;
  const err = new Float32Array(m * m);
  let se = 0, cnt = 0;
  for (let j = 0; j < m; j++) {
    const y = (j - half) * pix;
    for (let i = 0; i < m; i++) {
      const x = (i - half) * pix;
      const k = j * m + i;
      if (x * x + y * y > R * R) continue;
      const d = img[k] - r.truthHU[k];
      err[k] = d;
      if (r.truthHU[k] > -500) {
        se += d * d;
        cnt++;
      }
    }
  }
  let noise = r.fbpNoise, rmse = r.fbpRmse, iters = 0;
  if (ir) {
    const last = ir.curve[ir.curve.length - 1];
    if (last) noise = last.noise;
    rmse = cnt ? Math.sqrt(se / cnt) : 0;
    iters = ir.snaps[ir.snaps.length - 1].iter;
  }
  return { r, img, err, isIR: !!ir, noise, rmse, iters };
}

/** İki varyant aynı nesne + aynı rekon geometrisi mi? (fark sinogramı anlamlı mı) */
function comparable(e: ArtifactEntry, a: number, b: number, res: (FormationResult | null)[]): boolean {
  const ra = res[a], rb = res[b];
  if (!ra || !rb) return false;
  const va = e.variants[a], vb = e.variants[b];
  if (JSON.stringify(va.cfg ?? {}) !== JSON.stringify(vb.cfg ?? {})) return false;
  if ((va.src?.region ?? e.base.region) !== (vb.src?.region ?? e.base.region)) return false;
  return ra.rgeo.nv === rb.rgeo.nv && ra.rgeo.nb === rb.rgeo.nb && ra.p.length === rb.p.length;
}

const f1 = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

/* ------------------------------------------------------------------ */
/* Bileşen                                                              */
/* ------------------------------------------------------------------ */

export function StageArtifacts() {
  const sel = useApp((s) => s.formation.atlasSel);
  const atlasState = useApp((s) => s.formation.atlas);
  const atlasVer = useApp((s) => s.formation.atlasVer);
  const entry = ARTIFACTS.find((a) => a.id === sel) ?? ARTIFACTS[0];
  const st = atlasState[entry.id];
  const has = formationData.atlas.has(entry.id);

  useEffect(() => {
    if (!formationData.atlas.has(entry.id) && st !== 'running' && st !== 'error') void runAtlasEntry(entry.id);
  }, [entry.id, st]);

  const pick = (id: string) => {
    const f = useApp.getState().formation;
    if (f.atlasSel !== id) useApp.getState().set({ formation: { ...f, atlasSel: id } });
  };

  return (
    <>
      <Explain title="Artefakt nedir?">
        <p>
          <b>Artefakt</b>, görüntü ile gerçek nesne arasındaki <b>sistematik</b> (tekrarlanabilir, yapıya veya geometriye bağlı) farktır; rastgele kuantum gürültüsünden ayrıdır.
          Her artefakt görüntü zincirinin bir halkasında doğar: tüp (spektrum), hasta (zayıflatma, saçılma, hareket), dedektör (foton sayımı, kanal kazancı), ön işleme
          (log, kalibrasyon), örnekleme (görünüm sayısı, tarama alanı, kesit kalınlığı) veya rekonstrüksiyon.
        </p>
        <p>
          Aşağıdaki her örnek, ana simülatörle <b>aynı fizik motoruyla</b> ayrı ayrı hesaplanır: <b style={{ color: 'var(--ok)' }}>A</b> = ideal / referans,{' '}
          <b style={{ color: '#f08a5d' }}>B</b> = neden mevcut, <b style={{ color: '#6fa8ee' }}>C</b> = bir düzeltme yöntemi. Eğitim amaçlı basitleştirilmiş bir simülasyondur
          (paralel ışın geometrisi, tek kesit); büyüklükler gerçek tarayıcılardan farklı olabilir ama mekanizmalar aynıdır.
        </p>
      </Explain>

      <div className="fxa-chooser" role="tablist" aria-label="Artefakt seçimi">
        {ARTIFACTS.map((a) => {
          const s = atlasState[a.id];
          return (
            <button key={a.id} role="tab" aria-selected={a.id === entry.id} className={'fxa-chip' + (a.id === entry.id ? ' on' : '')} onClick={() => pick(a.id)}>
              <span>
                {a.title}
                <span className={'d' + (s ? ' ' + s : '')} title={s === 'done' ? 'hesaplandı' : s === 'running' ? 'hesaplanıyor' : s === 'error' ? 'hata' : 'henüz hesaplanmadı'} />
              </span>
              <span className="o">{a.origin.map((o) => CHAIN.find((c) => c.id === o)?.label ?? o).join(' · ')}</span>
            </button>
          );
        })}
      </div>

      <EntryHeader entry={entry} st={st} />

      {st === 'running' && !has && (
        <div className="fxa-wait">
          <span className="fxa-spin" />
          Hesaplanıyor… (~3–10 s) · {entry.variants.length} varyant paralel hesaplanıyor
        </div>
      )}
      {st === 'error' && !has && (
        <div className="fxa-wait err">
          Hesaplama hatası.{' '}
          <button className="btn sm" onClick={() => void runAtlasEntry(entry.id)}>
            Yeniden dene
          </button>
        </div>
      )}
      {has && <EntryBody key={entry.id + ':' + atlasVer} entry={entry} res={formationData.atlas.get(entry.id)!} st={st} />}
    </>
  );
}

function EntryHeader({ entry, st }: { entry: ArtifactEntry; st: string | undefined }) {
  const b = { ...DEFAULT_SOURCE, ...entry.base };
  return (
    <section className="fxa-head">
      <div className="top">
        <h3>{entry.title}</h3>
        <span className="meta">
          {REGIONS[b.region].label} · {b.kVp} kVp · {b.mAs} mAs · {KERNELS[b.kernel]?.label ?? b.kernel} · {b.thickness} mm · W {entry.window.ww} / L {entry.window.wl}
        </span>
        <span className="sp" />
        <button className="btn sm" disabled={st === 'running'} onClick={() => void runAtlasEntry(entry.id)}>
          {st === 'running' ? 'Hesaplanıyor…' : '⟳ Yeniden hesapla'}
        </button>
      </div>
      <PipelineMap highlight={entry.origin} compact />
      <div className="fxa-blocks">
        <div className="fxa-block">
          <h5>Nasıl oluşur?</h5>
          {entry.cause}
        </div>
        <div className="fxa-block">
          <h5>Sinogramda</h5>
          {entry.sinogram}
        </div>
        <div className="fxa-block">
          <h5>Görüntüde</h5>
          {entry.image}
        </div>
        <div className="fxa-block fix">
          <h5>Nasıl azaltılır?</h5>
          {entry.fix}
        </div>
      </div>
    </section>
  );
}

function EntryBody({ entry, res, st }: { entry: ArtifactEntry; res: (FormationResult | null)[]; st: string | undefined }) {
  const vars = useMemo(() => res.map((r, i) => (r ? derive(r, entry.variants[i]) : null)), [res, entry]);
  const first = vars.find((v) => v) ?? null;
  const m = first?.r.m ?? 320;
  const pix = first?.r.pix ?? 500 / 320;
  const defRow = Math.max(0, Math.min(m - 1, Math.round(entry.profileY / pix + (m - 1) / 2)));
  const [row, setRow] = useState(defRow);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const [yMode, setYMode] = useState<'win' | 'full'>('win');
  const W = wl(entry.window.ww, entry.window.wl);
  const errR = entry.window.ww / 2;
  const nV = entry.variants.length;
  const cols = Math.max(1, Math.min(4, nV)) as 1 | 2 | 3 | 4;

  // fark sinogramı çiftleri (A ile karşılaştırma)
  const idxA = entry.variants.findIndex((v) => v.role === 'ideal');
  const pairs = useMemo(() => {
    const out: { b: number; label: string }[] = [];
    if (idxA < 0) return out;
    entry.variants.forEach((v, i) => {
      if (i !== idxA && comparable(entry, idxA, i, res)) out.push({ b: i, label: `${ROLE[v.role].letter} − A` });
    });
    return out;
  }, [entry, res, idxA]);
  const [pairB, setPairB] = useState<number>(pairs[0]?.b ?? -1);
  const pb = pairs.some((p) => p.b === pairB) ? pairB : pairs[0]?.b ?? -1;
  const diff = useMemo(() => {
    if (pb < 0 || idxA < 0) return null;
    const a = res[idxA]!, b = res[pb]!;
    const d = new Float32Array(a.p.length);
    for (let i = 0; i < d.length; i++) d[i] = b.p[i] - a.p[i];
    const aw = autoWindow(d, 0.005, 0.995);
    const r = Math.max(Math.abs(aw.lo), Math.abs(aw.hi)) || 1e-3;
    return { d, r, nv: a.rgeo.nv, nb: a.rgeo.nb, ds: a.rgeo.ds };
  }, [res, idxA, pb]);

  // sinogram pencereleri (her varyant kendi otomatik penceresi)
  const sinoWins = useMemo(() => res.map((r) => (r ? autoWindow(r.p, 0.01, 0.995) : null)), [res]);

  // profil
  const truthDiffers = useMemo(() => {
    if (nV > 2 || !vars[0] || !vars[1]) return false;
    const a = vars[0].r.truthHU, b = vars[1].r.truthHU;
    if (a.length !== b.length) return false;
    let s = 0;
    for (let i = 0; i < a.length; i += 7) s += Math.abs(a[i] - b[i]);
    return s / (a.length / 7) > 0.5;
  }, [vars, nV]);

  const chart = useMemo(() => {
    const series: ChartSeries[] = [];
    if (!first) return null;
    const x = (i: number) => pixToMm(i, m, pix);
    // gövde kapsamı (ilk varyantın gerçeği)
    const tA = first.r.truthHU;
    let lo = m, hi = -1;
    for (let i = 0; i < m; i++)
      if (tA[row * m + i] > -900) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
    if (hi < 0) {
      lo = 0;
      hi = m - 1;
    }
    const i0 = Math.max(0, lo - 10), i1 = Math.min(m - 1, hi + 10);
    const pts = (a: Float32Array) => {
      const o: [number, number][] = [];
      for (let i = i0; i <= i1; i++) o.push([x(i), a[row * m + i]]);
      return o;
    };
    vars.forEach((v, k) => {
      if (!v) return;
      const vr = entry.variants[k];
      series.push({ name: `${ROLE[vr.role].letter}${v.isIR ? ' (IR)' : ''}`, color: ROLE[vr.role].color, pts: pts(v.img), width: 1.6 });
    });
    series.push({ name: truthDiffers ? 'Gerçek A' : 'Gerçek', color: TRUTH_COLOR, pts: pts(tA), dash: true, width: 1.5 });
    if (truthDiffers && vars[1]) series.push({ name: 'Gerçek B', color: TRUTH_COLOR2, pts: pts(vars[1].r.truthHU), dash: true, width: 1.5 });
    return { series: series.slice(0, 4), xMin: x(i0), xMax: x(i1) };
  }, [vars, first, m, pix, row, entry, truthDiffers]);

  const yr = yMode === 'win' ? { yMin: W.lo - entry.window.ww * 0.35, yMax: W.hi + entry.window.ww * 0.35 } : {};

  const overlayKey = `${row}|${hover ? hover.i + ',' + hover.j : ''}`;
  const overlay = (g: CanvasRenderingContext2D, toS: (fx: number, fy: number) => [number, number]) => {
    const [x0, y0] = toS(-0.5, row);
    const [x1] = toS(m - 0.5, row);
    g.strokeStyle = 'rgba(201,133,0,0.9)';
    g.lineWidth = 1;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y0);
    g.stroke();
    if (hover) {
      const [hx, hy] = toS(hover.i, hover.j);
      g.setLineDash([]);
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(hx - 7, hy);
      g.lineTo(hx - 2, hy);
      g.moveTo(hx + 2, hy);
      g.lineTo(hx + 7, hy);
      g.moveTo(hx, hy - 7);
      g.lineTo(hx, hy - 2);
      g.moveTo(hx, hy + 2);
      g.lineTo(hx, hy + 7);
      g.stroke();
    }
  };
  const onHover = (fx: number, fy: number) => {
    const i = Math.round(fx), j = Math.round(fy);
    if (i < 0 || j < 0 || i >= m || j >= m) {
      setHover((h) => (h ? null : h));
      return;
    }
    setHover((h) => (h && h.i === i && h.j === j ? h : { i, j }));
  };
  const onLeave = () => setHover(null);
  const onPick = (_fx: number, fy: number) => {
    const j = Math.max(0, Math.min(m - 1, Math.round(fy)));
    setRow(j);
  };
  const imgEvents = { overlay, overlayKey, onHover, onLeave, onDown: onPick, onDrag: onPick };

  const hints = HINTS[entry.id] ?? [];

  return (
    <>
      {st === 'running' && (
        <div className="fxa-read">
          <span className="fxa-spin" /> Yeniden hesaplanıyor… (~3–10 s) – aşağıdaki sonuçlar önceki hesaplamadır.
        </div>
      )}
      {st === 'error' && <div className="fxa-read" style={{ color: 'var(--danger)' }}>Bazı varyantlar hesaplanamadı; “Yeniden hesapla” ile tekrar deneyin.</div>}

      <Figure cols={cols}>
        {entry.variants.map((v, k) => {
          const d = vars[k];
          const R = ROLE[v.role];
          return (
            <div key={k} className="fxa-var">
              <div className="fxa-vhead">
                <span className={'fxa-role ' + v.role}>{R.tag}</span>
                <span className="fxa-vlabel">{v.label}</span>
              </div>
              {!d ? (
                <div className="fxa-wait err">Bu varyant hesaplanamadı.</div>
              ) : (
                <>
                  <ImageView
                    data={d.img}
                    w={m}
                    h={m}
                    aspect={1}
                    win={W}
                    tag={d.isIR ? `${R.letter} · IR ${d.iters} it.` : `${R.letter} · FBP`}
                    caption={d.isIR ? `PWLS iteratif rekon (${d.iters} iterasyon, FBP ile başlatıldı)` : 'Filtreli geri izdüşüm (FBP)'}
                    {...imgEvents}
                  />
                  <div className="fxa-sub">Hata haritası: görüntü − kendi gerçeği</div>
                  <ImageView data={d.err} w={m} h={m} aspect={1} cmap="div" divRange={errR} tag={`${R.letter} · hata`} {...imgEvents} />
                  <div className="fxa-sub">Sinogram p (θ ↓ 0→180°, s → −250…+250 mm)</div>
                  <ImageView
                    data={d.r.p}
                    w={d.r.rgeo.nb}
                    h={d.r.rgeo.nv}
                    aspect={1.4}
                    win={sinoWins[k] ?? 'auto'}
                    pixelated={d.r.rgeo.nv < 120}
                    tag={`${d.r.rgeo.nv} × ${d.r.rgeo.nb}`}
                  />
                  <div className="fx-stats">
                    <StatChip label="σ gürültü" value={`${f1(d.noise)} HU`} />
                    <StatChip label="RMSE" value={`${f1(d.rmse)} HU`} />
                    {entry.id === 'scatter' && <StatChip label="SPR" value={d.r.stats.spr.toFixed(2)} />}
                    {(entry.id === 'motion' || d.r.stats.motionMm > 0) && <StatChip label="Hareket" value={`${d.r.stats.motionMm.toFixed(1)} mm`} />}
                    {(entry.id === 'aliasing' || d.r.rgeo.nv !== d.r.geo.nv) && <StatChip label="Görünüm" value={d.r.rgeo.nv} />}
                    {(entry.id === 'starvation' || entry.id === 'metal' || entry.id === 'noise') && (
                      <StatChip label="Aç ışın" value={`${(d.r.stats.starvedFrac * 100).toFixed(2)} %`} />
                    )}
                    {entry.id === 'partial' && <StatChip label="Kesit" value={`${v.src?.thickness ?? entry.base.thickness ?? DEFAULT_SOURCE.thickness} mm`} />}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </Figure>

      <div className="fxa-legend">
        <span>
          Görüntü: W {entry.window.ww} / L {entry.window.wl} HU
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Hata: <ColorBar cmap="div" lo={-errR} hi={errR} unit="HU" />
        </span>
        <span>Sinogram: −ln(I/I₀), otomatik pencere</span>
      </div>

      <div className="fxa-read">
        {hover && first ? (
          <>
            <span>
              x {pixToMm(hover.i, m, pix).toFixed(0)} mm, y {pixToMm(hover.j, m, pix).toFixed(0)} mm
            </span>
            {vars.map((v, k) =>
              v ? (
                <span key={k}>
                  {ROLE[entry.variants[k].role].letter}: <b>{f1(v.img[hover.j * m + hover.i])}</b> HU (gerçek {f1(v.r.truthHU[hover.j * m + hover.i])}, hata{' '}
                  {f1(v.err[hover.j * m + hover.i])})
                </span>
              ) : null,
            )}
          </>
        ) : (
          <span>Görüntülerin üzerinde gezinin: tüm varyantlarda aynı noktanın HU değeri. Tıklayın/sürükleyin: profil satırını seçin (kesikli çizgi).</span>
        )}
      </div>

      <Explain title="Hata haritası nasıl okunur?">
        <p>
          Her varyantın hata haritası <b>kendi</b> gerçek nesnesine göre hesaplanır (görüntü − gerçek; mavi: görüntü daha düşük HU, turuncu: daha yüksek HU, ±{errR} HU’da
          doyar). Varyantlar arasında nesnenin kendisi değişebilir (ör. metal var/yok, kollar yukarıda/yanlarda); bu yöntem nesne farkını çıkarır ve yalnızca{' '}
          <b>artefaktı (+ gürültüyü)</b> yalıtır. A’da da hata sıfır değildir: gürültü ve kenarlardaki ince çizgiler (sonlu uzaysal çözünürlük, kernel bulanıklığı) her
          görüntüde vardır. Artefakt, B’de A’ya göre <b>fazladan</b> görülen yapılı desendir.
        </p>
      </Explain>

      {chart && (
        <div>
          <div className="fx-ctrl" style={{ marginBottom: 6 }}>
            <span className="lab">
              Yatay HU profili · y = {pixToMm(row, m, pix).toFixed(0)} mm (satır {row})
            </span>
            <Seg
              value={yMode}
              options={[
                { v: 'win', l: 'Pencere ölçeği' },
                { v: 'full', l: 'Tam ölçek' },
              ]}
              onChange={setYMode}
            />
            {row !== defRow && (
              <button className="btn sm" onClick={() => setRow(defRow)}>
                Varsayılan satır
              </button>
            )}
          </div>
          <LineChart series={chart.series} xLabel="x (mm)" yLabel="HU" xMin={chart.xMin} xMax={chart.xMax} {...yr} fmtX={(v) => v.toFixed(0)} fmtY={(v) => v.toFixed(0)} height={240} />
          <div className="fx-cap">
            Renkli çizgiler: varyant görüntüleri; kesikli: gerçek nesne{truthDiffers ? ' (A ve B’nin nesnesi farklı)' : ' (ilk varyantın)'}. Görüntünün sağı hastanın solu.
          </div>
        </div>
      )}

      {diff ? (
        <Figure cols={2}>
          <div>
            <div className="fx-ctrl" style={{ marginBottom: 6 }}>
              <span className="lab">Fark sinogramı</span>
              {pairs.length > 1 && <Seg value={pb} options={pairs.map((p) => ({ v: p.b, l: p.label }))} onChange={setPairB} />}
            </div>
            <ImageView
              data={diff.d}
              w={diff.nb}
              h={diff.nv}
              aspect={1.4}
              cmap="div"
              divRange={diff.r}
              pixelated={diff.nv < 120}
              tag={pairs.find((p) => p.b === pb)?.label}
              caption={
                <>
                  Dikey: θ 0→180° ({diff.nv} görünüm) · yatay: s −250…+250 mm ({diff.nb} kanal)
                  <br />
                  <ColorBar cmap="div" lo={-diff.r} hi={diff.r} unit="(birimsiz)" />
                </>
              }
            />
          </div>
          <Explain title="Fark sinogramı: artefakt ham veride nerede?">
            <p>
              Aynı nesne ve aynı geometriyle ölçülen iki sinogramın farkı, nedenin <b>ham veriye</b> eklediği hatayı doğrudan gösterir (mavi: ölçülen çizgi integrali
              azalmış, turuncu: artmış). Sinogramda bir nokta sinüzoid çizer; tek bir kanaldaki hata dikey çizgi, tek bir görünümdeki hata yatay çizgi olur.
            </p>
            <p>
              Rekonstrüksiyon bu hatayı görüntüye geri izdüşürür: sinogramda yerel olan bir tutarsızlık, görüntüde ışın doğrultusu boyunca <b>çizgi</b> ya da (sabit
              kanalda) <b>halka</b> olarak yayılır.
            </p>
          </Explain>
        </Figure>
      ) : (
        <div className="fx-cap" style={{ textAlign: 'left' }}>
          Fark sinogramı bu girdi için gösterilmiyor: varyantlar arasında nesne veya rekonstrüksiyon geometrisi (görünüm sayısı) farklı, çıkarma anlamlı olmaz.
        </div>
      )}

      {hints.length > 0 && <Points items={hints} />}
    </>
  );
}
