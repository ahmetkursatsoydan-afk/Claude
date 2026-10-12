/**
 * Rehberli fizik deneyleri: tek bir parametresi değiştirilmiş iki seri (A/B) otomatik olarak
 * taranır veya aynı ham veriden yeniden rekonstrükte edilir, ardından görüntüleyicide senkron
 * 1×2 karşılaştırma açılır. Her deney neyin gözlemleneceğini ve beklenen fiziksel sonucu açıklar.
 */
import { useApp } from '../state/store';
import { machine, waitFor } from './machine';
import { seriesStore } from './data';
import { abortScan, abortTopogram, acquireTopogram, applyProtocol, isBusy, loadPatient, log, patientCenterY, retroRecon, setAutoSkipWait, startScan, unloadPatient } from './controller';
import { heightForCenter, isoYp } from '../scene/dims';
import { openCompare } from '../viewer/compare';
import type { Breathing, ScanParams } from '../sim/scan';
import type { PhantomConfig } from '../phantom/types';

export interface ExperimentVariant {
  label: string;
  /** veri toplama parametreleri (değişirse yeni tarama gerekir) */
  acq?: Partial<ScanParams>;
  /** yalnızca rekonstrüksiyon/ön işleme (aynı ham veriden retrospektif) */
  recon?: Partial<ScanParams>;
  /** hasta durumu (kollar, solunum) – değişirse yeni tarama */
  patient?: { arms?: PhantomConfig['arms']; breathing?: Breathing };
  /** masa yüksekliği ofseti (mm, otomatik izomerkeze göre; negatif = alçak) */
  tableOffsetMm?: number;
}

export interface Experiment {
  id: string;
  /** kısa ad (seri adı öneki) */
  short: string;
  title: string;
  /** neyi gösterir (tek cümle) */
  goal: string;
  /** değişen parametre (rozet) */
  variable: string;
  protocol: string;
  /** deney için hasta yapılandırması (vücut yapısı/implant: hasta masadan inip yeniden yatırılır) */
  cfg?: Partial<PhantomConfig>;
  breathing?: Breathing;
  /** her iki varyant için ortak parametreler */
  params: Partial<ScanParams>;
  range: [number, number];
  variants: [ExperimentVariant, ExperimentVariant];
  window: { ww: number; wl: number };
  orientation?: 'axial' | 'coronal' | 'sagittal';
  focusZ?: number;
  observe: string[];
}

const FBP_SOFT: Partial<ScanParams> = { recon: 'FBP', kernel: 'soft', contrast: false, quality: 'standard' };

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'mas',
    short: 'mAs',
    title: 'Tüp akımı (mAs) ve görüntü gürültüsü',
    goal: 'Foton sayısı mAs ile doğru orantılıdır; kuantum gürültüsü σ ∝ 1/√mAs.',
    variable: 'mAs 50 ↔ 200',
    protocol: 'abdomen',
    params: { ...FBP_SOFT, atcm: false, thickness: 5, interval: 5, dfov: 400 },
    range: [590, 630],
    variants: [
      { label: '50 mAs', acq: { mAs: 50 } },
      { label: '200 mAs', acq: { mAs: 200 } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 610,
    observe: [
      'Karaciğere bir ROI çizin (◯ ROI aracı). Senkron açıkken aynı ROI diğer pencereye de kopyalanır.',
      'Beklenen: SD(A) ≈ 2 × SD(B), çünkü mAs 4 kat → foton sayısı 4 kat → σ ∝ 1/√4. (Karaciğerin kendi doku heterojenliği oranı biraz düşürür; homojen bölge seçin.)',
      'Ortalama HU değişmez (gürültü yansızdır); düşük kontrastlı ayrıntılar A’da kaybolur.',
      'Sağ üst bilgi: CTDIvol de 4 kat farklıdır — doz ile gürültü arasındaki temel ödünleşim.',
    ],
  },
  {
    id: 'thickness',
    short: 'Kalınlık',
    title: 'Kesit kalınlığı: gürültü ve kısmi hacim',
    goal: 'İnce kesit z çözünürlüğünü artırır ama daha az foton kullanır; kalın kesit gürültüyü azaltır ama küçük yapıları ortalar.',
    variable: '1 mm ↔ 5 mm (aynı ham veri)',
    protocol: 'thorax',
    params: { ...FBP_SOFT, kernel: 'lung', atcm: false, mAs: 120, dfov: 360 },
    range: [410, 430],
    variants: [
      { label: '1 mm', recon: { thickness: 1, interval: 1 } },
      { label: '5 mm', recon: { thickness: 5, interval: 5 } },
    ],
    window: { ww: 1500, wl: -600 },
    focusZ: 420,
    observe: [
      'Akciğer penceresinde küçük damar ve bronşlar 1 mm’de keskin, 5 mm’de kısmi hacim nedeniyle silik/kalın görünür.',
      'Mediastende (W400/L40) ROI ile gürültü: σ(1 mm) ≈ √5 × σ(5 mm) ≈ 2.2 kat.',
      'İki seri aynı ham veriden üretilmiştir (retrospektif rekonstrüksiyon) – ek doz yoktur.',
    ],
  },
  {
    id: 'kernel',
    short: 'Kernel',
    title: 'Rekonstrüksiyon kerneli: keskinlik ve gürültü',
    goal: 'Keskin kernel yüksek uzaysal frekansları yükseltir: çözünürlük artar, gürültü de artar.',
    variable: 'yumuşak doku ↔ kemik kerneli',
    protocol: 'thorax',
    params: { ...FBP_SOFT, atcm: false, mAs: 120, thickness: 1, interval: 1, dfov: 360 },
    range: [410, 426],
    variants: [
      { label: 'Yumuşak doku kerneli', recon: { kernel: 'soft' } },
      { label: 'Kemik kerneli', recon: { kernel: 'bone' } },
    ],
    window: { ww: 1500, wl: -600 },
    focusZ: 418,
    observe: [
      'Bronş duvarları, fissürler ve kaburga korteksi kemik kernelinde belirgin şekilde daha keskin.',
      'Kemik kernelinde kenar aşması (parlak/koyu halo) ve “taneli” gürültü dokusu (NPS yüksek frekansa kayar).',
      'Yumuşak doku penceresinde (W400/L40) ROI SD’si kemik kernelinde ~2–3 kat yüksektir.',
      'Fizik görünümünde (⚛) kernel MTF/NPS eğrilerini inceleyin.',
    ],
  },
  {
    id: 'kvp-iodine',
    short: 'kVp',
    title: 'Tüp gerilimi (kVp) ve iyot kontrastı',
    goal: 'Düşük kVp’de spektrum iyodun K-kenarına (33 keV) yaklaşır → iyotlu damarların HU’su belirgin artar.',
    variable: '80 kVp ↔ 120 kVp (eşit CTDIvol)',
    protocol: 'cta',
    params: { recon: 'FBP', kernel: 'soft', atcm: false, rotTime: 0.5, pitch: 1.0, rows: 128, thickness: 2, interval: 2, contrast: true, phaseId: 'cta', delay: 24, dfov: 360 },
    range: [430, 446],
    variants: [
      { label: '80 kVp', acq: { kVp: 80, mAs: 300 } },
      { label: '120 kVp', acq: { kVp: 120, mAs: 105 } },
    ],
    window: { ww: 700, wl: 200 },
    focusZ: 438,
    observe: [
      'Aorta lümenine ROI çizin: 80 kVp’de iyot HU’su 120 kVp’ye göre ~%50–70 daha yüksektir.',
      'Kemik HU’su da artar; su/yumuşak doku kalibrasyon gereği ~sabit kalır.',
      'CTDIvol yaklaşık eşit tutuldu: 80 kVp’de gürültü biraz yüksek, ancak kontrast-gürültü oranı (CNR) daha iyi.',
      'Fizik görünümünde “kVp’ye göre beklenen HU” grafiği aynı etkiyi gösterir.',
    ],
  },
  {
    id: 'beam-hardening',
    short: 'Sertleşme',
    title: 'Işın sertleşmesi: kafa tabanı artefaktı',
    goal: 'Polikromatik ışın kalın kemikte sertleşir; su düzeltmesi kemiği düzeltmez → petröz kemikler arasında koyu bant.',
    variable: '80 kVp ↔ 140 kVp',
    protocol: 'head',
    cfg: { arms: 'down' },
    params: { recon: 'FBP', kernel: 'soft', atcm: false, rotTime: 1.0, pitch: 0.55, rows: 64, thickness: 5, interval: 5, contrast: false, dfov: 230 },
    range: [126, 146],
    variants: [
      { label: '80 kVp', acq: { kVp: 80, mAs: 520 } },
      { label: '140 kVp', acq: { kVp: 140, mAs: 120 } },
    ],
    window: { ww: 80, wl: 40 },
    focusZ: 136,
    observe: [
      'Arka çukurda petröz kemikler arasında koyu bant (“Hounsfield çubuğu”) ve beyin sapında koyu çizgiler.',
      '80 kVp’de belirgin, 140 kVp’de (daha sert spektrum) azalır.',
      'Beyin parankiminde ROI: düşük kVp’de kafatası yakınında hafif HU kayması (kupa).',
    ],
  },
  {
    id: 'metal',
    short: 'MAR',
    title: 'Metal artefaktı ve metal artefakt azaltma (MAR)',
    goal: 'Metal protez foton açlığı ve aşırı sertleşme ile çizgilere neden olur; MAR metal izini sinogramda enterpole eder.',
    variable: 'MAR kapalı ↔ açık (aynı ham veri)',
    protocol: 'pelvis',
    cfg: { implant: 'hipRight' },
    params: { recon: 'FBP', kernel: 'soft', atcm: false, kVp: 140, mAs: 220, thickness: 3, interval: 3, contrast: false, dfov: 400 },
    range: [856, 880],
    variants: [
      { label: 'MAR kapalı', recon: { mar: false } },
      { label: 'MAR açık (LI)', recon: { mar: true } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 868,
    observe: [
      'A: protez başından yayılan parlak ve koyu çizgiler; mesane ve kaslarda HU bozulması.',
      'B: çizgiler belirgin azalır; metale yakın dokuda ayrıntı kaybı ve hafif bulanıklık kalabilir (enterpolasyon).',
      'Metal penceresi (W4000/L1000) ile protez sınırlarını karşılaştırın — metal piksellerin kendisi korunur.',
    ],
  },
  {
    id: 'arms',
    short: 'Kollar',
    title: 'Kol pozisyonu: foton açlığı çizgileri',
    goal: 'Kollar gövdenin yanındayken yatay ışınlar çok uzun yol kat eder → çok az foton → yatay çizgiler ve gürültü.',
    variable: 'kollar yukarıda ↔ yanlarda',
    protocol: 'abdomen',
    params: { ...FBP_SOFT, atcm: false, mAs: 150, thickness: 5, interval: 5, dfov: 450 },
    range: [600, 630],
    variants: [
      { label: 'Kollar yukarıda', patient: { arms: 'up' } },
      { label: 'Kollar yanlarda', patient: { arms: 'down' } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 615,
    observe: [
      'B: yatay (sağ–sol) koyu/parlak çizgiler ve karaciğerde artan gürültü — foton açlığı.',
      'Karaciğerde ROI SD’sini karşılaştırın; ATCM açık olsaydı mA (ve doz) artırılırdı.',
      'Gövde taramalarında kolların baş üstüne alınmasının nedeni budur.',
    ],
  },
  {
    id: 'pitch',
    short: 'Pitch',
    title: 'Pitch: etkin mAs, doz ve gürültü',
    goal: 'Rotasyon başına mAs sabitken pitch artınca birim uzunluğa düşen foton azalır: eff. mAs = mAs / pitch.',
    variable: 'pitch 0.6 ↔ 1.4',
    protocol: 'thorax',
    params: { ...FBP_SOFT, atcm: false, mAs: 100, thickness: 2, interval: 2, dfov: 360 },
    range: [410, 430],
    variants: [
      { label: 'Pitch 0.6', acq: { pitch: 0.6 } },
      { label: 'Pitch 1.4', acq: { pitch: 1.4 } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 420,
    observe: [
      'Etkin mAs: 167 ↔ 71 → CTDIvol ~2.3 kat farklı (sağ üst bilgi), gürültü ~√2.3 ≈ 1.5 kat farklı.',
      'Yüksek pitch’te kesit hassasiyet profili hafif genişler ve tarama süresi kısalır (hareket riski azalır).',
      'Mediastende ROI SD’lerini karşılaştırın.',
    ],
  },
  {
    id: 'breathing',
    short: 'Solunum',
    title: 'Solunum hareketi artefaktı',
    goal: 'Bir kesitin verisi ≈0.6 rotasyon boyunca toplanır; diyafram bu sırada hareket ederse görünümler tutarsızlaşır.',
    variable: 'nefes tutuyor ↔ derin solunum',
    protocol: 'abdomen',
    params: { ...FBP_SOFT, atcm: false, mAs: 150, rotTime: 1.0, pitch: 0.8, thickness: 5, interval: 5, dfov: 400 },
    range: [500, 560],
    variants: [
      { label: 'Nefes tutuyor', patient: { breathing: 'hold' } },
      { label: 'Derin solunum', patient: { breathing: 'deep' } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 530,
    observe: [
      'B: karaciğer kubbesi ve kalp sınırında çift kontur ve bulanıklık; hareketli kenarlardan tüpün başlangıç açısı yönünde çizgiler.',
      'Pencere düzlemini “Koronal” yapın: her kesit farklı solunum fazında alındığından diyafram kenarı basamaklanır.',
      'Klinik çözüm: nefes tutma komutu, daha kısa rotasyon, yüksek pitch / geniş dedektör ile kısa tarama süresi.',
    ],
  },
  {
    id: 'scatter',
    short: 'Saçılma',
    title: 'Saçılma: geniş kolimasyon ve saçılma düzeltmesi',
    goal: 'Geniş ışında saçılan fotonlar dedektöre ulaşır; ölçülen zayıflama düşer → HU düşmesi, kupa, koyu bantlar.',
    variable: 'düzeltme açık ↔ kapalı (aynı ham veri)',
    protocol: 'pelvis',
    params: { ...FBP_SOFT, atcm: false, kVp: 120, mAs: 200, rows: 256, thickness: 5, interval: 5, mar: false, dfov: 420 },
    range: [870, 900],
    variants: [
      { label: 'Saçılma düzeltmesi açık', recon: { scatterCorr: true } },
      { label: 'Saçılma düzeltmesi kapalı', recon: { scatterCorr: false } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 885,
    observe: [
      '256×0.5 mm (128 mm) kolimasyonda merkez ışında saçılma/birincil oranı (SPR) ≈ 0.25–0.3.',
      'B: görüntü merkezi koyulaşır (kupa), kas/yağ ROI’lerinde HU düşer, kalça kemikleri arasında koyu bantlar.',
      'A: önyargı büyük ölçüde giderilir ama saçılan fotonların eklediği gürültü kalır (σ biraz yüksek).',
    ],
  },
  {
    id: 'centering',
    short: 'Merkezleme',
    title: 'Dikey merkezleme hatası',
    goal: 'Papyon (bowtie) filtresi izomerkezdeki hastaya göre tasarlanır; hasta alçakta kalırsa akı dağılımı uyumsuzlaşır.',
    variable: 'izomerkez ↔ 50 mm alçak',
    protocol: 'abdomen',
    params: { ...FBP_SOFT, atcm: false, mAs: 150, thickness: 5, interval: 5, dfov: 450 },
    range: [600, 625],
    variants: [
      { label: 'İzomerkezde', tableOffsetMm: 0 },
      { label: '50 mm alçak', tableOffsetMm: -50 },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 612,
    observe: [
      'B: hasta görüntüde yukarı/aşağı kayar; ön ve arka bölgelerde gürültü farklılaşır (papyon kenarından geçen ışınlar).',
      'Karaciğer ön ve arka kısmına ROI çizerek SD’leri karşılaştırın.',
      'Klinikte yanlış merkezleme hem gürültüyü hem yüzeyel dozu artırır; topogramda büyütme değişir → ATCM yanılabilir.',
    ],
  },
  {
    id: 'truncation',
    short: 'SFOV',
    title: 'Tarama alanı dışı: kesilme (truncation) artefaktı',
    goal: '50 cm tarama alanını (SFOV) aşan vücut kısımları dedektörde ölçülmez → kenarda parlak bant ve HU kayması.',
    variable: 'kollar yukarıda ↔ yanlarda (obez hasta)',
    protocol: 'abdomen',
    cfg: { habitus: 'large' },
    params: { ...FBP_SOFT, atcm: false, mAs: 250, thickness: 5, interval: 5, dfov: 500 },
    range: [600, 625],
    variants: [
      { label: 'Kollar yukarıda', patient: { arms: 'up' } },
      { label: 'Kollar yanlarda', patient: { arms: 'down' } },
    ],
    window: { ww: 400, wl: 40 },
    focusZ: 612,
    observe: [
      'B: kollar ve yan gövde 50 cm SFOV dışına taşar; SFOV sınırında parlak halka/bant ve içeride HU kayması.',
      'SFOV dışındaki doku görüntüde hiç yer almaz (dairesel kesim).',
      'Klinik çözüm: kolları kaldırmak, hastayı ortalamak; bazı cihazlarda genişletilmiş FOV rekonstrüksiyonu.',
    ],
  },
];

const S = () => useApp.getState();
let cancel = false;

export function cancelExperiment() {
  cancel = true;
  const st = S();
  if (st.topo.status === 'acquiring') abortTopogram();
  if (st.scan.status === 'scanning' || st.scan.status === 'preparing' || st.scan.status === 'waiting' || st.scan.status === 'breath') abortScan();
}

function setStep(id: string, step: string) {
  S().set({ exp: { ...S().exp, id, status: 'running', step } });
}

async function centerTable(offsetMm: number) {
  machine.targetH = heightForCenter(patientCenterY()) + offsetMm / 1000;
  await waitFor(() => Math.abs(machine.tableH - machine.targetH) < 0.0015, 20000);
}

/** Bir deneyi baştan sona çalıştır: hazırlık → (topogram) → A/B taramaları → karşılaştırma. */
export async function runExperiment(id: string): Promise<void> {
  const exp = EXPERIMENTS.find((e) => e.id === id);
  if (!exp) return;
  if (isBusy() || S().exp.status === 'running') {
    log('Başka bir işlem sürüyor – deney başlatılamadı.', 'warn');
    return;
  }
  cancel = false;
  S().set({ exp: { id, status: 'running', step: 'Hazırlanıyor…', series: [] }, view: 'room' });
  log(`Deney başlıyor: ${exp.title}`, 'ok');
  try {
    applyProtocol(exp.protocol);
    // hasta yapılandırması (vücut yapısı / implant değişikliği için hasta yeniden yatırılır)
    const cur = S().patient.cfg;
    const want: Partial<PhantomConfig> = { habitus: 'medium', implant: 'none', ...exp.cfg };
    const needReload = (want.habitus !== undefined && want.habitus !== cur.habitus) || (want.implant !== undefined && want.implant !== cur.implant);
    let reloaded = false;
    if (needReload && S().patient.onTable) {
      setStep(id, 'Hasta masadan indiriliyor (hasta yapılandırması değişiyor)…');
      await unloadPatient();
    }
    S().setPatientCfg({ ...want, arms: exp.cfg?.arms ?? exp.variants[0].patient?.arms ?? S().patient.cfg.arms });
    S().set({ patient: { ...S().patient, breathing: exp.breathing ?? 'hold' } });
    if (!S().patient.onTable) {
      setStep(id, 'Hasta masaya yatırılıyor…');
      await loadPatient();
      reloaded = true;
    }
    if (cancel) throw new Error('iptal');
    const common: Partial<ScanParams> = { ...exp.params, scanStart: exp.range[0], scanEnd: exp.range[1], direction: 'cc', reconCx: 0 };
    S().setParams(common);
    setStep(id, 'Masa izomerkeze yükseltiliyor…');
    await centerTable(0);
    // topogram: yoksa, hasta yeniden yatırıldıysa veya aralığı kapsamıyorsa yeniden al
    const tp = S().topo;
    if (reloaded || tp.status !== 'done' || tp.z0 > exp.range[0] - 15 || tp.z1 < exp.range[1] + 15 || Math.abs(tp.isoYp - isoYp(machine.tableH)) > 3) {
      setStep(id, 'Topogram alınıyor…');
      await acquireTopogram();
      if (S().topo.status !== 'done') throw new Error('Topogram tamamlanamadı');
    }
    S().setParams(common);
    const ids: string[] = [];
    let lastScan: string | null = null;
    let lastKey = '';
    for (let k = 0; k < 2; k++) {
      if (cancel) throw new Error('iptal');
      const v = exp.variants[k];
      const letter = k === 0 ? 'A' : 'B';
      if (v.patient?.arms) S().setPatientCfg({ arms: v.patient.arms });
      if (v.patient?.breathing) S().set({ patient: { ...S().patient, breathing: v.patient.breathing } });
      const key = JSON.stringify([v.acq ?? {}, v.patient ?? {}, v.tableOffsetMm ?? 0]);
      let sid: string | null;
      if (!lastScan || key !== lastKey) {
        S().setParams({ ...common, ...v.acq, ...v.recon });
        if (v.tableOffsetMm !== undefined) {
          setStep(id, `${letter}: masa yüksekliği ayarlanıyor…`);
          await centerTable(v.tableOffsetMm);
        }
        setStep(id, `${letter}: tarama – ${v.label}`);
        setAutoSkipWait(true);
        try {
          await startScan();
        } finally {
          setAutoSkipWait(false);
        }
        if (S().scan.status !== 'done') throw new Error('Tarama tamamlanamadı');
        sid = S().activeSeries;
        lastScan = sid;
        lastKey = key;
      } else {
        setStep(id, `${letter}: retrospektif rekonstrüksiyon – ${v.label}`);
        S().set({ activeSeries: lastScan });
        retroRecon({ ...v.recon });
        sid = S().activeSeries;
      }
      if (!sid) throw new Error('Seri oluşturulamadı');
      S().updateSeries(sid, { name: `${exp.short} ${letter}: ${v.label}` });
      ids.push(sid);
    }
    // masa yüksekliğini geri al
    if (exp.variants.some((v) => v.tableOffsetMm)) void centerTable(0);
    S().set({ exp: { id, status: 'done', step: 'Tamamlandı – karşılaştırma açıldı.', series: ids }, view: 'viewer' });
    openCompare(ids[0], ids[1], exp.window.ww, exp.window.wl, { title: exp.title, points: exp.observe }, exp.orientation ?? 'axial', exp.focusZ);
    log(`Deney tamamlandı: ${exp.title}. Görüntüleyicide A/B karşılaştırması açıldı (rekonstrüksiyon arka planda sürebilir).`, 'ok');
  } catch (e) {
    setAutoSkipWait(false);
    const msg = String((e as Error)?.message ?? e);
    S().set({ exp: { ...S().exp, status: msg === 'iptal' ? 'idle' : 'error', step: msg === 'iptal' ? 'İptal edildi.' : `Hata: ${msg}` } });
    log(msg === 'iptal' ? 'Deney iptal edildi.' : `Deney durdu: ${msg}`, 'warn');
  }
}

/** Seri hâlâ bellekte mi (deney sonuçlarını yeniden açmak için) */
export function experimentSeriesAvailable(ids: string[]): boolean {
  return ids.length === 2 && ids.every((i) => seriesStore.has(i));
}
