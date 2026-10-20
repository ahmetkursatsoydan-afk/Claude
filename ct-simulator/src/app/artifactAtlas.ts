/**
 * Artefakt atlası: her artefakt için nedeni (fizik), zincirde nerede oluştuğu, sinogramdaki ve
 * görüntüdeki izi, azaltma yöntemi ve simülasyonla üretilen A (ideal) / B (artefakt) / C (düzeltme)
 * varyantları. Varyantlar ana tarama zinciriyle aynı fizik koduyla hesaplanır.
 */
import type { SliceRequest } from '../sim/protocol';
import type { PhantomConfig } from '../phantom/types';
import type { IterOptions } from '../sim/iterative';
import type { FormationRegion, FormationSource } from './formationSource';

/** Görüntü zincirindeki halkalar (kaynak → görüntü). */
export type ChainStep = 'tube' | 'patient' | 'detector' | 'preproc' | 'sampling' | 'recon' | 'display';

export const CHAIN: { id: ChainStep; label: string; sub: string }[] = [
  { id: 'tube', label: 'X-ışını tüpü', sub: 'polikromatik spektrum, papyon filtresi' },
  { id: 'patient', label: 'Hasta', sub: 'zayıflatma, saçılma, hareket' },
  { id: 'detector', label: 'Dedektör', sub: 'foton sayımı, gürültü, kanal kazancı' },
  { id: 'preproc', label: 'Ön işleme', sub: '−ln(I/I₀), kalibrasyon, sertleşme düzeltmesi' },
  { id: 'sampling', label: 'Örnekleme', sub: 'görünüm/kanal sayısı, tarama alanı, kesit kalınlığı' },
  { id: 'recon', label: 'Rekonstrüksiyon', sub: 'filtre + geri izdüşüm veya iteratif' },
  { id: 'display', label: 'Görüntü', sub: 'HU dönüşümü, pencereleme' },
];

export interface ArtifactVariant {
  label: string;
  role: 'ideal' | 'artifact' | 'fix';
  src?: Partial<FormationSource>;
  req?: Partial<SliceRequest>;
  cfg?: Partial<PhantomConfig>;
  /** bu varyant için tam istatistiksel IR (FBP yerine gösterilir) */
  iterative?: Partial<IterOptions>;
}

export interface ArtifactEntry {
  id: string;
  title: string;
  /** zincirde oluştuğu halka(lar) */
  origin: ChainStep[];
  /** nasıl oluşur (fizik) */
  cause: string;
  /** sinogramdaki iz */
  sinogram: string;
  /** görüntüdeki görünüm */
  image: string;
  /** nasıl azaltılır */
  fix: string;
  base: Partial<FormationSource> & { region: FormationRegion };
  variants: ArtifactVariant[];
  window: { ww: number; wl: number };
  /** yatay profil çizgisi (izomerkeze göre y, mm) */
  profileY: number;
}

export const ARTIFACTS: ArtifactEntry[] = [
  {
    id: 'noise',
    title: 'Kuantum gürültüsü (düşük doz)',
    origin: ['detector'],
    cause:
      'Dedektöre ulaşan foton sayısı Poisson dağılımına uyar: N foton ölçüldüğünde göreli belirsizlik 1/√N’dir. Düşük mAs, kalın hasta veya ince kesit foton sayısını azaltır. FBP’nin rampa filtresi yüksek frekanslı gürültüyü yükseltir.',
    sinogram: 'Sinogram satırlarında rastgele, ışından ışına bağımsız dalgalanma; özellikle uzun (yüksek zayıflatmalı) ışın yollarında.',
    image: 'Görüntüde ince, “taneli” desen; düşük kontrastlı yapılar (karaciğer lezyonu, gri–beyaz cevher) kaybolur. σ ∝ 1/√mAs.',
    fix: 'mAs veya kesit kalınlığını artırmak (doz ↑), yumuşak kernel, iteratif rekonstrüksiyon (istatistiksel ağırlıklı model gürültüyü bastırır).',
    base: { region: 'abdomen', kVp: 120, kernel: 'soft', thickness: 5 },
    variants: [
      { label: '300 mAs', role: 'ideal', src: { mAs: 300 } },
      { label: '25 mAs (FBP)', role: 'artifact', src: { mAs: 25 } },
      { label: '25 mAs + iteratif rekon', role: 'fix', src: { mAs: 25 }, iterative: { init: 'fbp', iters: 6, beta: 0.04 } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: -20,
  },
  {
    id: 'starvation',
    title: 'Foton açlığı çizgileri',
    origin: ['patient', 'detector'],
    cause:
      'Bazı ışınlar çok uzun ve yoğun bir yoldan geçer (kollar gövdenin yanındayken yatay ışınlar, omuzlar, pelvis). Bu ışınlarda dedektöre çok az foton ulaşır; −ln(I/I₀) dönüşümü düşük sayımlarda gürültüyü aşırı büyütür ve sapma üretir.',
    sinogram: 'Belirli açılarda (yatay görünümler) yüksek zayıflatmalı bant; bu bölgede sayımlar çok düşük ve aşırı gürültülü.',
    image: 'Uzun eksen boyunca (sağ–sol) uzanan koyu/parlak çizgiler ve yönlü gürültü.',
    fix: 'Kolları kaldırmak, açısal mA modülasyonu (ATCM), uyarlamalı sinogram filtresi, istatistiksel ağırlıklı iteratif rekonstrüksiyon (az fotonlu ışınlara düşük güven).',
    base: { region: 'abdomen', kVp: 120, mAs: 60, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Kollar yukarıda', role: 'ideal', cfg: { arms: 'up' } },
      { label: 'Kollar yanlarda (FBP)', role: 'artifact', cfg: { arms: 'down' } },
      { label: 'Kollar yanlarda + PWLS iteratif', role: 'fix', cfg: { arms: 'down' }, iterative: { init: 'fbp', iters: 6, beta: 0.04 } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: -40,
  },
  {
    id: 'beamhard',
    title: 'Işın sertleşmesi',
    origin: ['tube', 'patient', 'preproc'],
    cause:
      'Tüp tek enerjili değil, geniş bir spektrum üretir. Düşük enerjili fotonlar daha kolay soğurulduğundan ışın ilerledikçe ortalama enerjisi artar (sertleşir) ve etkin μ azalır: ölçülen −ln(I/I₀), kalınlıkla doğrusal artmaz. Su için kalibrasyon (BHC) bunu düzeltir; kemik ise farklı bir enerji bağımlılığına sahip olduğundan kalıntı kalır.',
    sinogram: 'Uzun ışın yollarında ve kemikten geçen ışınlarda ölçülen değer ideal (monoenerjetik) değerin altında kalır.',
    image: 'BHC olmadan HU konuma göre kayar (kupa); BHC ile su düzelir fakat iki yoğun kemik arasında koyu bant (“Hounsfield çubuğu”, kafa tabanında petröz kemikler arası) kalır.',
    fix: 'Tüp filtrasyonu ve papyon filtresi, su BHC kalibrasyonu, kemik için iteratif/çift enerjili düzeltme, daha yüksek kVp.',
    base: { region: 'skullbase', kVp: 100, mAs: 300, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Monoenerjetik (ideal)', role: 'ideal', req: { mono: true } },
      { label: 'Polikromatik, BHC yok', role: 'artifact', req: { bhcOff: true } },
      { label: 'Su BHC (klinik)', role: 'fix' },
    ],
    window: { ww: 100, wl: 40 },
    profileY: 10,
  },
  {
    id: 'metal',
    title: 'Metal artefaktı',
    origin: ['patient', 'detector', 'preproc'],
    cause:
      'Metal (çelik, CoCr, amalgam) X-ışınını neredeyse tamamen soğurur: metalden geçen ışınlarda foton açlığı, aşırı ışın sertleşmesi ve doğrusal olmayan kısmi hacim aynı anda oluşur. Bu ışınlar tutarsız (yanlış) olduğu için FBP hatayı tüm görüntüye çizgi olarak yayar.',
    sinogram: 'Metalin sinüzoidal izi: çok yüksek, gürültülü ve sapmalı değerler.',
    image: 'Metalden yayılan parlak ve koyu çizgiler; iki metal arasında koyu bant.',
    fix: 'Metal artefakt azaltma (MAR: metal izini sinogramda enterpolasyonla doldurma), yüksek kVp, iteratif rekonstrüksiyon, çift enerji (monoenerjetik görüntü).',
    base: { region: 'qa', kVp: 120, mAs: 200, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Metal yok', role: 'ideal' },
      { label: 'İki çelik çubuk (FBP)', role: 'artifact', cfg: { test: 'qaMetal' } },
      { label: 'Çelik çubuk + MAR', role: 'fix', cfg: { test: 'qaMetal' }, req: { mar: true } },
    ],
    window: { ww: 500, wl: 40 },
    profileY: -30,
  },
  {
    id: 'motion',
    title: 'Hareket (solunum) artefaktı',
    origin: ['patient', 'sampling'],
    cause:
      'Bir kesitin verisi ~0.6 rotasyon süresince farklı açılardan toplanır. Bu sırada organ yer değiştirirse, farklı açılardan gelen ölçümler farklı bir nesneyi görür: sinogram tutarsızlaşır. Özellikle ilk ve son görünüm (aynı ışın hattı) uyuşmaz.',
    sinogram: 'Hareketli kenarların sinüzoidal izlerinde kırılma/kayma; ilk ve son görünüm arasında süreksizlik.',
    image: 'Çift kontur, bulanıklık ve hareketli kenarlardan yayılan çizgiler (başlangıç açısı yönünde).',
    fix: 'Nefes tutma, daha kısa rotasyon süresi, yüksek pitch/geniş dedektör (kısa tarama), EKG/solunum tetikleme.',
    base: { region: 'abdomen', kVp: 120, mAs: 150, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Nefes tutuyor', role: 'ideal', src: { region: 'abdomen' }, req: { z: 530 } },
      { label: 'Derin solunum, 1 s rotasyon', role: 'artifact', req: { z: 530, breathAmp: 25, breathPeriod: 4, rotTime: 1, tAcq: 0 } },
      { label: 'Derin solunum, 0.28 s rotasyon', role: 'fix', req: { z: 530, breathAmp: 25, breathPeriod: 4, rotTime: 0.28, tAcq: 0 } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: -40,
  },
  {
    id: 'scatter',
    title: 'Saçılma',
    origin: ['patient', 'detector'],
    cause:
      'Hastada Compton saçılmasına uğrayan fotonların bir kısmı yön değiştirerek dedektöre ulaşır. Dedektör bunları birincil ışından ayıramaz; ölçülen yoğunluk olduğundan yüksek, zayıflatma olduğundan düşük görünür. Geniş kolimasyonda (çok kesitli/geniş dedektör) saçılan foton oranı artar.',
    sinogram: 'Tüm görünümlere eklenen yavaş değişen arka plan; en çok yüksek zayıflatmalı ışınlarda göreli etki (SPR yüksek).',
    image: 'HU değerlerinde düşme, görüntü merkezinde koyulaşma (kupa), iki yoğun yapı (kemik) arasında koyu bantlar.',
    fix: 'Saçılma önleyici ızgara (anti-scatter grid), dar kolimasyon, model tabanlı saçılma düzeltmesi.',
    base: { region: 'pelvis', kVp: 120, mAs: 200, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Saçılma yok', role: 'ideal', cfg: { implant: 'none' } },
      { label: '128 mm kolimasyon, düzeltme yok', role: 'artifact', cfg: { implant: 'none' }, req: { collimation: 128, scatterCorr: false } },
      { label: '128 mm, saçılma düzeltmesi', role: 'fix', cfg: { implant: 'none' }, req: { collimation: 128, scatterCorr: true } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: 0,
  },
  {
    id: 'ring',
    title: 'Halka artefaktı',
    origin: ['detector', 'preproc'],
    cause:
      'Bir dedektör kanalının kazancı diğerlerinden farklıysa (kalibrasyon kayması, arızalı eleman), o kanal her açıda aynı hatayı yapar. Bu kanal izomerkeze sabit uzaklıktaki ışınları ölçtüğünden hata geri izdüşümde o yarıçapta bir halkaya toplanır.',
    sinogram: 'Tüm görünümler boyunca sabit kanal konumunda dikey çizgi.',
    image: 'İzomerkez merkezli eş merkezli halkalar (çember veya yarım çember).',
    fix: 'Düzenli hava/su kalibrasyonu, arızalı kanalın komşularla enterpolasyonu, halka giderme filtreleri.',
    base: { region: 'qa', kVp: 120, mAs: 150, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Kalibre dedektör', role: 'ideal' },
      { label: 'Beş kanalda %4 kazanç hatası', role: 'artifact', req: { ringFault: 0.04 } },
    ],
    window: { ww: 200, wl: 0 },
    profileY: 0,
  },
  {
    id: 'aliasing',
    title: 'Az görünüm (örnekleme) çizgileri',
    origin: ['sampling', 'recon'],
    cause:
      'Geri izdüşüm, her açıdaki ölçümü görüntüye “sıvar”. Açılar seyrekse (az görünüm) bu sıvamalar birbirini tam olarak sönümleyemez: yüksek kontrastlı yapılardan uzaklaştıkça açılar arası boşluklar ince çizgiler olarak görünür.',
    sinogram: 'Satır (görünüm) sayısı az: sinogram açı yönünde seyrek örneklenmiş.',
    image: 'Nesneden uzakta ince, ışınsal çizgiler (“yıldız/vantilatör” deseni); kenarlardan uzaklaştıkça belirginleşir.',
    fix: 'Rotasyon başına yeterli görünüm sayısı (modern BT’de ~1000–2000), uçan odak noktası, iteratif rekonstrüksiyon.',
    base: { region: 'qa', kVp: 120, mAs: 150, kernel: 'soft', thickness: 5 },
    variants: [
      { label: '360 görünüm / 180°', role: 'ideal' },
      { label: '30 görünüm', role: 'artifact', req: { viewDecimate: 12 } },
      { label: '90 görünüm', role: 'fix', req: { viewDecimate: 4 } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: -130,
  },
  {
    id: 'truncation',
    title: 'Kesilme (tarama alanı dışı)',
    origin: ['sampling'],
    cause:
      'Dedektör yalnızca 50 cm’lik tarama alanını (SFOV) görür. Vücudun bu dairenin dışında kalan kısımları bazı açılarda ışın yoluna girer ama ölçülemez; veri “kesik” olur ve rekonstrüksiyon bu eksikliği kenar bölgelerine yanlış dağıtır.',
    sinogram: 'Sinogramın kenarlarında sıfıra inmeyen (kesik) profiller.',
    image: 'SFOV sınırında parlak halka/bant, kenar bölgelerinde HU kayması; dışarıdaki doku görünmez.',
    fix: 'Kolları kaldırmak, hastayı ortalamak, genişletilmiş FOV rekonstrüksiyonu (kesik veriyi tahmin ederek tamamlama).',
    base: { region: 'abdomen', kVp: 120, mAs: 250, kernel: 'soft', thickness: 5 },
    variants: [
      { label: 'Obez hasta, kollar yukarıda', role: 'ideal', cfg: { habitus: 'large', arms: 'up' } },
      { label: 'Obez hasta, kollar yanlarda', role: 'artifact', cfg: { habitus: 'large', arms: 'down' } },
    ],
    window: { ww: 400, wl: 40 },
    profileY: -30,
  },
  {
    id: 'partial',
    title: 'Kısmi hacim',
    origin: ['sampling'],
    cause:
      'Her voksel, kesit kalınlığı boyunca içindeki dokuların ortalamasını gösterir. Kalın kesitte küçük veya eğik seyirli yapılar (damar, nodül, kemik kenarı) çevre dokuyla ortalanır; kontrastları ve kenar keskinlikleri azalır.',
    sinogram: 'Çizgi integralleri kesit profili boyunca ortalanmış nesneden alınır (sinogram tek başına bunu göstermez).',
    image: 'Küçük yapılar silikleşir, kenarlar yumuşar; eğik yapılarda sahte gölgeler/“basamaklar”.',
    fix: 'İnce kesit (gürültü artışı pahasına), izotropik veri + MPR; kalın kesitler gerekiyorsa ince kesitlerden üretmek.',
    base: { region: 'thorax', kVp: 120, mAs: 150, kernel: 'lung', thickness: 1 },
    variants: [
      { label: '1 mm kesit', role: 'ideal', src: { thickness: 1 } },
      { label: '10 mm kesit', role: 'artifact', src: { thickness: 10 } },
    ],
    window: { ww: 1500, wl: -600 },
    profileY: -40,
  },
];
