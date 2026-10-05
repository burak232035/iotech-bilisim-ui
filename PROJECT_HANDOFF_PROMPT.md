# Proje Aktarım Prompt'u — Akıllı Kampüs Drone Sistemi

Bu dosya, bu konuşmanın tamamını başka bir yere (yeni bir sohbet/oturum)
taşımak için hazırlandı. Yeni oturumun başında bu metni olduğu gibi
yapıştırın — proje geçmişini, mimariyi ve şu anki durumu eksiksiz aktarır.

---

## Proje nedir

Fırat Üniversitesi kampüsünde **DJI Mini 4 Pro** drone ile otonom alan
taraması yapan bir sistem. Bileşenler:

- **Backend**: `Kampusprojesiwebsitesi/backend/` — Node.js/Express +
  Socket.IO + PostgreSQL (`drone_tracking` veritabanı), port **3001**.
- **Web Dashboard**: `Kampusprojesiwebsitesi/drone-frontend-react/` —
  React 19 + Vite + Leaflet, port **3000** (vite.config.js'de sabit,
  5173 değil). Demo giriş: `admin` / `admin123`.
- **Android köprü uygulaması**: DJI RC üzerinde çalışıyor, Socket.IO ile
  backend'e bağlanıp DJI MSDK v5 ile drone'u kontrol ediyor. **Bu
  konuşmada kodu yok, sadece spesifikasyon dosyaları var** — gerçek
  Android geliştirme ayrı bir yerde yapılıyor, bu proje o tarafa
  dokümantasyon/spesifikasyon sağlıyor.
- **Çöp sınıflandırma servisi**: `waste-detection-service/` — Python
  FastAPI + YOLO, port **8000**.
- **Yeşil alan/beton analiz servisi**: backend/frontend iskeleti var
  (`landcover.routes.js`, `GreenConcretePanel.jsx`), port **8001**
  bekleniyor ama **Python servisi henüz yazılmadı** (sadece Node/React
  tarafı hazır).
- **Ortomozaik**: OpenDroneMap (`opendronemap/odm` Docker imajı) ile
  gerçek fotogrametrik dikişleme.

Eski `frontend/` (düz HTML/CSS/JS) klasörü **kullanılmıyor**, terk
edilmiş bir prototip — Live Server ile yanlışlıkla açılmaması için
üstüne uyarı banner'ı eklendi.

## Kritik dokümanlar (mutlaka okuyun)

- **`ANDROID_AI_PROMPT.md`** — Android'e verilen ana spesifikasyon
  (bağlantı, komutlar, waypoint mission, fotoğraf çekimi §6.9, toplu
  yükleme §17).
- **`ANDROID_MOSAIC_UPDATE.md`** — fotoğraf mozaiği/ortomozaik
  değişikliklerinin Android'e etkisi, **kritik açık madde**: DJI
  waypoint limiti artık neredeyse kesin aşılıyor.
- **`WAYPOINT_TEST_CHECKLIST.md`** — canlı uçuş test checklist'i.
- **`.claude/plans/`** altında geçmiş planlar (waste detection,
  orthomosaic) — detaylı mimari kararlar orada.

## Bu konuşmada yapılanların özeti (kronolojik)

1. Proje incelendi, mimari anlaşıldı.
2. Waypoint mission, virtual stick, alan (area) CRUD gibi bir dizi canlı
   uçuş hatası bulunup düzeltildi (payload format uyumsuzlukları, gimbal
   nadir sorunu, home-aware rota yönlendirme, alan kaydetme/silme
   hataları vb.) — hepsi çözüldü ve gerçek uçuşlarda doğrulandı.
3. **Çöp sınıflandırma (YOLO)** özelliği uçtan uca kuruldu: fotoğraf
   yükleme (`photos` tablosu), Python YOLO servisi, tespitleri GPS'e
   projekte eden `geoProjection.service.js`, harita marker'ları, PDF
   rapor entegrasyonu. **6 kategori**: kağıt, cam, metal, plastik, geri
   dönüştürülemez, organik (`waste-detection-service/class_map.py`).
   Model eğitimi `train_waste_detection_colab.ipynb` ile Google Colab'da
   yapılıyor, veri seti Google Drive'da.
4. **Fotoğraf mozaiği** denemesi: önce "kenar-kenara, %0 örtüşme" ile
   waypoint yoğunlaştırma yapıldı (Google Haritalar gibi görünsün diye),
   sonra gerçek uçuşta bunun **GPS/pusula donanım hatası yüzünden asla
   piksel-mükemmel olamayacağı** anlaşıldı (heading/altitude verisinin
   doğru geldiği bizzat doğrulandı, sorun sensör hassasiyetiydi).
5. Bu yüzden **gerçek fotogrametriye (OpenDroneMap)** geçildi:
   waypoint planlayıcı artık %75 ileri / %65 yan örtüşme kullanıyor
   (fotoğraflar arası gerçek görsel eşleştirme için), backend Docker'da
   `opendronemap/odm --fast-orthophoto` çalıştırıp GeoTIFF→PNG+sınır
   kutusu üretiyor, haritada düz overlay olarak gösteriliyor.
6. Paralel olarak (bu konuşma dışında/başka bir oturumda) **yeşil
   alan/beton segmentasyonu** özelliğinin backend+frontend iskeleti de
   kuruldu (aynı iş/job deseniyle) — Python tarafı henüz yok.

## Şu anki durum / bilinen eksikler

- **Docker/ODM altyapısı doğrulandı çalışıyor** (imaj indirildi,
  `--fast-orthophoto`/`--skip-3dmodel`/`--orthophoto-resolution`
  bayrakları teyit edildi) ama **Docker Desktop genelde kapalı
  duruyor**, kullanmadan önce açılması gerekiyor.
- **`photos` tablosu (tam çözünürlük foto yükleme) hâlâ boş** —
  Android'in §17'deki iniş-sonrası toplu yükleme akışı **hiç
  tetiklenmedi/test edilmedi**. Bu, hem ortomozaik hem yeşil/beton
  analizi için en büyük blocker.
- **DJI waypoint limiti (~65-99)** artık neredeyse her ortomozaik
  görevinde aşılacak (test: aynı küçük alan için 28→371 waypoint).
  Android'in otomatik görev bölme yapması gerekiyor
  (`ANDROID_MOSAIC_UPDATE.md` §3.1).
- **Gimbal'in her çekimde gerçekten nadir (-90°) olduğu** kesin
  doğrulanmadı — gerçek uçuşta "ilk waypoint doğru, sonrakiler düz
  bakıyor" gözlemlendi, Logcat ile teyit isteniyor (§3.3).
- **Yeşil/beton analiz Python servisi henüz yazılmadı** (port 8001
  bekleniyor, `waste-detection-service`'e benzer bir servis gerekiyor).
- **Çöp/yeşil-beton modelleri eğitilmiş mi?** Colab notebook var ama
  `model/best.pt` dosyasının gerçekten üretilip yerleştirildiği bu
  konuşmada doğrulanmadı.

## Önerilen sıradaki adımlar

1. Android'de §17'yi (tam çözünürlük yükleme) gerçekten tetikleyip
   `photos` tablosuna veri düşürün — her şeyin önündeki blocker bu.
2. Docker Desktop'ı açıp backend'i başlatın, küçük bir uçuşla
   "Ortomozaik Oluştur" ve "Fotoğrafları Analiz Et" butonlarını gerçek
   veriyle test edin.
3. Yeşil/beton için `waste-detection-service`'e benzer bir Python
   servisi (`landcover-detection-service/`, port 8001) oluşturun.
4. Android'de DJI waypoint limiti ve gimbal-nadir doğrulamasını
   tamamlayın.
