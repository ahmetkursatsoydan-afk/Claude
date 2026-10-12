# SIM-CT 256 — Fizik tabanlı BT (CT) tarayıcı simülatörü

> **EĞİTİM AMAÇLI SİMÜLASYON.** Bu uygulama gerçek bir BT cihazını kontrol etmez ve X-ışını üretmez.
> Tüm anatomik görüntüler **analitik/prosedürel olarak üretilmiş sentetik bir fantomdan** hesaplanır;
> gerçek hasta verisi kullanılmaz ve görüntüler tanı amaçlı değildir.

Web tabanlı, etkileşimli bir çok kesitli BT simülatörü: hastayı masaya yatırın, lazerlerle hizalayın,
topogram alın, tarama aralığını topogram üzerinde planlayın, parametreleri değiştirin ve helikal taramayı başlatın.
Görüntüler, gerçek bir BT'nin veri toplama ve rekonstrüksiyon zincirinin yaklaşık fiziksel modelleriyle
**kesit kesit hesaplanır** — her kullanıcı girdisi (kVp, mAs, pitch, kalınlık, kernel, algoritma, FOV, matris,
kontrast zamanlaması, kol pozisyonu, metal implant, masa yüksekliği…) sonucu gerçekten değiştirir.

## Hızlı başlangıç

```bash
cd ct-simulator
npm install
npm run dev          # http://localhost:5173
npm test             # fizik birim testleri (Vitest)
npm run build        # dist/ (statik site)
npm run build:single # dist-single/index.html (tek dosya, worker'lar gömülü)
```

Gereksinimler: Node 18+, WebGL2 destekli modern tarayıcı (Chrome/Edge/Firefox/Safari 17+).

## İş akışı (uygulama içinde)

1. **Hasta** – protokol seçimi (beyin, toraks, düşük doz akciğer, abdomen-pelvis, TAP, BT anjiyo, kalça/metal),
   vücut yapısı (zayıf/orta/obez), kol pozisyonu, metal implant. “Hastayı masaya yatır” animasyonu.
2. **Konum** – masa yüksekliği/pozisyonu (basılı tutulan tuşlar veya kaydırıcılar), otomatik izomerkez,
   lazer hizalama, dikey merkezleme hatası göstergesi, gantriye giriş için çarpışma kilidi.
3. **Topogram** – AP veya lateral, kV/mA, uzunluk; masa hareketi ve satır satır oluşan scout görüntüsü.
4. **Plan** – topogram üzerinde sürüklenebilir başlangıç/bitiş çizgileri ve rekon FOV kutusu, ATCM mA eğrisi;
   kVp 70–150, mAs 10–800, rotasyon 0.25–1 s, pitch 0.5–1.5, kolimasyon 64/128/256×0.5 mm, kesit 0.5–10 mm,
   aralık, kernel (yumuşak doku/akciğer/kemik), FBP veya hibrit iteratif (seviye 1–5), MAR, DFOV, matris
   (256–1024), kontrast fazı ve gecikmesi, yön; CTDIvol/DLP/etkin doz/SSDE ve uyarılar.
5. **Tarama** – rotor hızlanması, kontrast geri sayımı, nefes komutu, X-ışını uyarısı, masa ilerlemesi,
   canlı sinogram + dedektör profili + aşamalı geri izdüşüm, gerçek zamanlı kV/mA/z/DLP ve ilerleme.
6. **Rekon / İnceleme** – retrospektif rekonstrüksiyon (aynı ham veri, farklı kernel/kalınlık/algoritma),
   görüntüleyici: W/L sürükleme ve ön ayarlar (beyin, inme, subdural, yumuşak doku, mediasten, karaciğer,
   akciğer, kemik, anjiyo, metal), pan/zoom, tekerlekle kesit kaydırma, sine, mesafe ölçümü, elips ROI
   (ortalama/SD/min/maks/alan), HU sondası, 2×2 MPR (aksiyel/koronal/sagittal + topogram referans çizgisi),
   kalın dilim ortalama/MIP/MinIP.
7. **Fizik & Veri** – spektrum ve sertleşme, μ/ρ(E), kVp'ye göre beklenen HU, veri zinciri
   (fantom → sinogram → filtreli sinogram → görüntü), kernel MTF/NPS, ATCM ve Dw profili, kontrast eğrileri.

## Fiziksel model

| Aşama | Model |
|---|---|
| X-ışını üretimi | Tungsten anot: Kramers bremsstrahlung + W K-çizgileri, 5.5 mm Al + 0.1 mm Cu, papyon (bowtie) filtresi (gövde/baş). 120 kVp: ortalama ≈ 62 keV, HVL ≈ 7 mm Al. |
| Zayıflatma | NIST XCOM μ/ρ tabloları (su, yağ, kas, kortikal kemik, iyot (K-kenarı), Ti, Fe, Al, Cu). Dokular 4 baz kanalına (su, kemik, iyot, metal) ayrıştırılır. |
| Fantom | Baştan ayağa sentetik anatomi (beyin gri/beyaz cevher, sulkuslar, ventriküller, kafa tabanı, sinüsler, dişler; boyun; akciğerler ve prosedürel damar/bronş ağaçları; kalp ve büyük damarlar; karaciğer, dalak, pankreas, böbrekler, barsaklar; omurga, kaburgalar, pelvis, femurlar; masa beşiği ve minder). Ressam algoritmasıyla kenar kaplamalı (düzlem içi kısmi hacim) rasterleştirme. |
| Kısmi hacim (z) | Kesit hassasiyet profili = kutu(kalınlık) ⊛ üçgen(helikal enterpolasyon, pitch'e bağlı); profil boyunca alt örnekleme. |
| İzdüşüm | Fan→paralel yeniden gruplanmış geometri, Joseph projektörü (CPU) veya WebGL2 ışın yürütme (GPU); odak noktası (küçük/büyük, mA'ya bağlı) ve dedektör açıklığı bulanıklığı. |
| Polikromatik sinyal | Enerji-entegre eden dedektör: Tₑ = Σ E·N(E)·e^(−Σμ_c(E)L_c) / Σ E·N(E). Su/kemik ışınlarında 2B tablo, iyot/metalde doğrudan enerji toplamı. |
| Gürültü | Bileşik Poisson: NEQ = (Σ E N e^{−μL})² / Σ E² N e^{−μL}; foton akısı ∝ mAs_eff × kalınlık × tüp çıkışı(kVp) × papyon; + elektronik gürültü. 32 cm su, 120 kVp, 100 eff.mAs, 5 mm, yumuşak kernel → σ ≈ 13 HU (kalibre). |
| ATCM | z-modülasyonu: AP topogramdan su-eşdeğer çap Dw (AAPM 220) → mA(z) = mA_ref·e^{β(Dw−Dref)}; açısal modülasyon: mA(θ) ∝ √(zayıflatma). Jeneratör gücü sınırı (100 kW, 1000 mA). |
| Ön işleme | −ln(I/I₀), su ışın sertleşmesi düzeltmesi (papyon kanalına göre sürekli kalibrasyon), foton açlığı için uyarlamalı 2B filtre. Kemik/iyot için düzeltilmemiş sertleşme kalır → kemikler arası koyu bantlar, kVp'ye bağlı HU. |
| Rekonstrüksiyon | FBP: Kak–Slaney rampa × kernel penceresi (lp/cm cinsinden): yumuşak doku (Hann, ~8 lp/cm), akciğer (+%35 artış), kemik (+%95 artış, kenar aşması). Hibrit IR: izdüşüm alanı istatistiksel filtre + Huber-TV görüntü alanı düzenlileştirme + FBP harmanlama (seviye 1–5). MAR: metal izinin doğrusal enterpolasyonu. |
| Kontrast | Gama-varyat + denge kompartmanları (aort, sağ kalp/PA, portal ven, IVC, karaciğer, dalak, pankreas, böbrek korteks/medulla, ekskresyon, mesane tabakalaşması). Her kesit, masanın o z'ye ulaştığı zamanda örneklenir. |
| Doz | CTDIw/100 mAs (16/32 cm fantom, ~kVp^2.6) → CTDIvol = CTDIw·mAs_eff/100; DLP (aşırı tarama dahil); etkin doz Σ k(z)·CTDIvol·Δz; SSDE = f(Dw)·CTDIvol. |

Gözlemlenebilen etkiler: gürültü–mAs/kalınlık/kVp/kernel/IR ilişkisi, uzaysal çözünürlük–kernel/odak noktası,
kısmi hacim, ışın sertleşmesi (kafa tabanı, pelvis), foton açlığı (kollar yanda, metal), metal artefaktı ve MAR,
yanlış dikey merkezleme, kVp'ye bağlı iyot/kemik kontrastı, kontrast fazı zamanlaması, sonlu görünüm örneklemesi.

**Sınırlamalar / yaklaşımlar:** Koni ışını ve gerçek helikal ağırlıklandırma yerine kesit başına paralel ışın
FBP kullanılır; saçılma, hareket, pencere (windmill) ve tüp ısınması modellenmez; doz değerleri tipik
literatür katsayılarına dayalı yaklaşık değerlerdir; anatomi stilize ve basitleştirilmiştir.

## Mimari

```
src/
  physics/   spectrum.ts, materials.ts (NIST μ/ρ, dokular), kernels.ts (MTF/NPS), contrast.ts, dose.ts
  phantom/   types.ts, primitives.ts (ellipsoid/sweep/tüp/blob kesitleri), raster.ts (kısmi hacimli rasterleştirme)
             anatomy/ head, neck, thorax (+lungTree), abdomen, pelvis, spine, body (gövde/kollar/bacaklar), table, implants
  sim/       poly.ts (polikromatik + BHC), projector.ts (Joseph + geri izdüşüm), gpu.ts (WebGL2), fbp.ts, fft.ts,
             ir.ts, mar.ts, slice.ts (tek kesit uçtan uca), topogram.ts, scan.ts (plan/ATCM/doz), worker.ts, pool.ts
  scene/     Three.js: SceneController, room, gantry (rotor, tüp, dedektör, X-ışını yelpazesi), table, patient, lasers
  app/       machine.ts (masa/rotor/ışın durum makinesi), controller.ts (iş akışı), data.ts (seri/topogram depoları)
  viewer/    SliceRenderer.ts (WebGL2 R16I pencereleme, Canvas2D yedek), mpr.ts
  ui/        React konsol sekmeleri, topogram planlayıcı, görüntüleyici, fizik paneli
tests/       Vitest fizik ve rekonstrüksiyon testleri
scripts/     Kalibrasyon ve görsel doğrulama betikleri (vite-node ile)
```

- Kesit hesapları **web worker havuzunda** paralel yürür; WebGL2 (OffscreenCanvas) varsa izdüşüm/geri
  izdüşüm GPU'da yapılır (açılışta CPU referansına karşı öz-test ve hız karşılaştırması). Worker
  kullanılamazsa hesaplar ana iş parçacığında sırayla yapılır.
- Fantom ve 3B hasta modeli **aynı** anatomik dış hat fonksiyonlarından üretilir; masada yatan hasta ile
  simüle edilen görüntüler geometrik olarak tutarlıdır.
- Genişletme: yeni doku `physics/materials.ts`'e, yeni organ `phantom/anatomy/*`'ye, yeni kernel
  `physics/kernels.ts`'e, yeni protokol `sim/scan.ts`'deki `PROTOCOLS` dizisine eklenir.

## Doğrulama betikleri

```bash
npx vite-node scripts/calib.ts standard     # su fantomu: HU doğruluğu, gürültü, kVp etkileri
npx vite-node scripts/phantomSlices.ts      # fantom kesitlerini PNG olarak (out/)
npx vite-node scripts/topo.ts               # AP + lateral topogram
HEAD=1 WW=80 WL=40 npx vite-node scripts/simSlices.ts 60,85   # tam simülasyonlu kesitler
```
