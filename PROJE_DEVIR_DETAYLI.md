# Akıllı Kampüs Drone Sistemi — Detaylı Devir Dosyası

> Bu dosya projenin tüm mimarisini, geçmişini, çoklu drone protokolünü, Android
> tarafıyla yürütülen yazışmaları ve yapılan tüm analizleri başka bir yapay zekaya
> eksiksiz aktarmak için hazırlanmıştır. Tarih: 20.10.2026.

---

## 0. Bir bakışta durum

- **Ne yapıyor:** Fırat Üniversitesi kampüsünde **iki DJI Mini 4 Pro** drone ile
  otonom alan taraması; toplanan fotoğraflardan **ortomozaik harita**, **çöp
  tespiti** ve **yeşil alan/beton analizi** üretir; sonuçları bir **web
  dashboard**'da haritada gösterir ve **PDF rapor** çıkarır.
- **Çoklu drone:** İki drone aynı anda, farklı Android cihazlardan, tek bir
  backend'e bağlanıp eş zamanlı uçar. Protokol v2 (bkz. §4).
- **Olgunluk:** Tek drone ve iki drone uçuşları, ortomozaik, çöp taraması ve
  analizler **gerçek saha uçuşlarıyla test edildi ve çalışıyor.**
- **En büyük açık mimari eksik:** **Aktif çarpışma önleme yok** (bkz. §9).
- **Repo:** `https://github.com/burak232035/iotech-bilisim-ui` (branch: main).
  Son commit: `ced13f6`.

---

## 1. Bileşenler ve portlar

| Bileşen | Teknoloji | Canlı port | Test port | Not |
| --- | --- | --- | --- | --- |
| Backend | Node.js + Express + Socket.IO + PostgreSQL | 3001 | 3002 | `backend/` |
| Web Dashboard | React 19 + Vite + Leaflet | 3000 | 3010 | `drone-frontend-react/` |
| Çöp tespiti servisi | Python FastAPI + YOLOv8 (detect) | 8000 | 8000 | `waste-detection-service/` |
| Yeşil/beton servisi | Python FastAPI + YOLOv8-seg | 8001 | 8001 | `green-concrete-service/` |
| Ortomozaik servisi | Python FastAPI + OpenCV | 8002 | 8002 | `orthomosaic-service/` (Docker'sız) |
| Android köprü uygulaması | Kotlin + DJI MSDK v5 | — | — | **Kodu bu repoda değil** |

- **Veritabanı:** Canlı `drone_tracking`, test `drone_tracking_test`.
- **Demo giriş:** `admin` / `admin123`.
- **Test sunucusu adresi (Android'e verilen):** `http://172.20.10.4:3002`
  (bilgisayarın hotspot IP'si; ağ değişince güncellenir).

### Servisleri başlatma (test ortamı)

Hepsi **uygulamadan/terminalden bağımsız** çalışmalı (aksi halde kapanır).
`test-baslat.bat` beşini birden açar. Komutlar:

```bash
npm run start:test                                 # backend 3002, DB drone_tracking_test
npm --prefix drone-frontend-react run dev:test     # dashboard 3010
python -m uvicorn --app-dir orthomosaic-service app:app --host 127.0.0.1 --port 8002
python -m uvicorn app:app --host 127.0.0.1 --port 8000   # (waste-detection-service klasöründe)
python -m uvicorn app:app --host 127.0.0.1 --port 8001   # (green-concrete-service klasöründe)
```

Canlı ortam: `npm start` (3001) + `npm --prefix drone-frontend-react run dev` (3000).

---

## 2. Mimari ve veri akışı

```
Drone 1 ── RC-N2 ──kablo── Tablet  (droneId: drone-1) ─┐
Drone 2 ── RC-N3 ──kablo── Redmi telefon (droneId: drone-2) ─┤
                                                             │ Socket.IO (Wi-Fi/hotspot)
                                                             ▼
                        Backend (Node, 3002) ── PostgreSQL (drone_tracking_test)
                         │          │                  │          │
                         │ HTTP     │ HTTP             │ HTTP     │ Socket.IO
                         ▼          ▼                  ▼          ▼
                   Çöp(8000)   Yeşil/beton(8001)  Ortomozaik(8002)  Web Dashboard (3010)
```

- **Telemetri:** Android → backend (~10 Hz), backend → dashboard'a drone başına
  1 Hz'e düşürülerek yayılır.
- **Komutlar:** Dashboard → backend → yalnızca **hedef drone**. Asla broadcast değil.
- **Fotoğraflar:** İniş sonrası tam çözünürlüklü fotoğraflar HTTP ile yüklenir
  (`POST /api/photos/upload`), oturuma bağlanır, analiz/ortomozaik için kullanılır.
- **Canlı önizlemeler:** Uçuş sırasında drone küçük JPEG önizlemeleri gönderir
  (`drone_photo`); haritaya basılır ve `uploads/live/<GG.AA>/` altında saklanır.

### Backend dosya yapısı

- `backend/socket.io.js` — **çoklu drone merkezi.** Drone kaydı (registry),
  oturum yaşam döngüsü, hedefli komut yönlendirme, görev ilerlemesi, canlı
  önizleme kaydı. Projenin en kritik dosyası.
- `backend/routes/`: `mission` (görev gönderme/durdurma + RTH hesabı),
  `photo` (yükleme + canlı önizleme + sınıflandırma job), `orthomosaic`,
  `landcover`, `area`, `session`, `telemetry`, `scan`, `report`.
- `backend/services/`: `wasteDetection`, `landcoverAnalysis`, `orthomosaic`,
  `geoProjection` (bbox→lat/lon projeksiyon), `djiMetadata` (fotoğraf XMP okuma),
  `livePhoto`, `waypointPlanner` (boustrophedon rota), `telemetry`, `pdf`,
  `reportData`.
- `backend/db/init.sql` (şema), `backend/db/migrate.js` (açılışta idempotent
  ALTER TABLE'lar — mevcut DB'leri günceller).
- `backend/test-env.js` — `node -r ./backend/test-env.js ...` ile preload edilir;
  `PORT=3002`, `DB_NAME=drone_tracking_test` ayarlar.

### Veritabanı tabloları

`areas`, `flight_sessions`, `telemetry_buffer`, `telemetry_data`, `reports`,
`scan_routes`, `obstacles`, `photos`, `waste_detections`, `orthomosaics`,
`landcover_analyses`, `live_photos`.

**Çoklu drone / yeni sütunlar** (migrate.js ile eklenir):
- `flight_sessions`: `drone_id`, `drone_serial`, `purpose` ('mapping'|'waste_scan')
- `photos`: `drone_id`
- `orthomosaics`: `on_map` (haritada sabit mi)
- `live_photos`: tüm tablo (session_id, drone_id, day_folder, file_path, lat, lon,
  altitude, heading, captured_at).

---

## 3. Donanım ve kimlikler

| droneId | Cihaz | Kumanda | DJI seri no (20.10 itibarıyla) |
| --- | --- | --- | --- |
| `drone-1` | Android **tablet** | **RC-N2** | `1581F6Z9C25A8003KGNV` |
| `drone-2` | **Xiaomi Redmi Note 10 Pro Max** | **RC-N3** | `1581F6Z9C24AJ00341AR` |

> **Dikkat:** `droneId` **cihaza** bağlıdır, fiziksel drone'a değil. 17.10 akşamından
> sonra fiziksel drone'lar yer değiştirdi; bu yüzden drone-1'in seri numarası artık
> eski drone-2'ninki. Dashboard'daki "Drone 1" = tabletin o an uçurduğu drone.

**MSDK uyumluluğu:** Mini 4 Pro, DJI Mobile SDK v5'te desteklenir. RC-N3 desteği
**MSDK 5.17.0** (4 Kasım 2025) ile geldi; RC-N2 daha önce (5.13.0, Mart 2025).
Uygulama MSDK 5.17.0 kullanıyor. Her iki kumanda da sahada çalıştı.

**İkinci Android cihaz gereksinimleri:** 64-bit (arm64-v8a) Android — MSDK v5 başka
mimariyi desteklemez. Redmi Note 10 Pro Max uygun. Xiaomi'de pil tasarrufunu
"Kısıtlama yok" yapın, otomatik başlatmayı açın, uygulamayı son uygulamalarda
kilitleyin, ekran zaman aşımını uzatın; yoksa arka planda bağlantı kopar.

---

## 4. Çoklu drone protokolü (v2) — özet

Tam metin: `MULTI_DRONE_PROTOCOL.md`. Android ile 3+ tur soru-cevapla
kararlaştırıldı, backend+dashboard+Android uygulandı ve sahada test edildi.

### 4.1 Bağlantı ve kimlik
- Android `register` gönderir:
  `{ role:"drone", protocol:2, droneId:"drone-2", serial:"<DJI>", lastSessionId?, appVersion? }`
- `protocol` göndermeyen istemci **v1** sayılır ve `drone-1` kabul edilir (eski
  tablet sürümü böylece çalışmaya devam eder).
- Backend `droneId → socket.id` eşlemesi tutar; socket'i `drone:<droneId>` odasına
  alır. Kimliğin esas kaynağı **socket eşlemesidir**; payload'daki `droneId` sadece
  doğrulama içindir.
- **Aynı droneId ile ikinci bağlantı:** Seri no aynıysa (aynı cihaz yeniden
  bağlanıyor) yeni bağlantı geçerli olur, eskisi sessizce kapatılır. Seri no
  farklıysa (ayar hatası) **yeni bağlantı reddedilir** (`register_rejected`,
  `socket.disconnect(true)`), eski korunur — uçan drone'un bağlantısı kopmasın diye.
- App drone'dan önce bağlanıp seri no'suz register ederse socket **beklemeye**
  alınır; komut almaz, seri no gelince kurallar uygulanır.

### 4.2 Komutlar (hepsi `drone_command` olayı içinde)
- `droneId` en üst seviyede, `command` ile yan yana. Komut yalnızca hedef drone'un
  odasına gider.
- Hedefsiz komut: tek drone bağlıysa ona gider; **birden fazla drone bağlıysa
  reddedilir** (web'e `command_response status:"failed"`).
- `droneId:"all"` yalnızca `emergency_land`, `returnHome`, `hover`, `stop_mission`
  için; backend bunu her drone'a **kendi droneId'siyle** ayrı ayrı dağıtır.

### 4.3 Görev komutu (`waypoint_mission`)
```json
{ "command":"waypoint_mission", "droneId":"drone-2",
  "mission": { "areaId":14, "areaName":"alan-2", "altitude":40, "speed":8,
               "rthHeight":65, "purpose":"waste_scan", "livePreview":false,
               "finishAction":"go_home", "headingMode":"auto",
               "waypoints":[ {"index":0,"lat":..,"lon":..,"altitude":40,"speed":8,"actions":["shoot_photo"]} ] },
  "savedRouteId":null, "timestamp":0 }
```
- `mission.rthHeight` **backend'de hesaplanır**: en yüksek görev irtifası +
  drone başına ofset (drone-1 +10 m, drone-2 +25 m), üst sınır 120 m. RTH'ler
  birbirine 10 m'den yakınsa görev **reddedilir** (çarpışma ayrımı korunamıyor).
  Geçerli aralık 20–120 m. Android RTH'yi drone'a yazıp doğrular; başarılıysa
  `command_response status:"started"`.
- `mission.finishAction` ve `headingMode` Android'de **okunmaz**; drone her zaman
  eve döner.
- `mission.purpose`: `"mapping"` (ortomozaik fotoğrafları + canlı önizleme) veya
  `"waste_scan"` (sadece foto; `livePreview:false` → haritaya önizleme basılmaz,
  yüklenen fotoğraflar otomatik çöp tespitinden geçer).

### 4.4 Oturumlar
- **Her drone'un ayrı oturumu** var. Bir drone'un kopması diğerinin oturumunu
  bitirmez.
- `register`'da `lastSessionId` gelir ve o oturum **hâlâ açıksa** aynı oturum devam
  eder (kopma süresinden bağımsız — DJI görevi drone üzerinde sürdüğü için).
- Oturum kapanma koşulları: (1) `isFlying` true→false olup `mission_complete`
  sonrası 60 sn yerde; (2) `isFlying` yoksa `agl < 1.5 m` 60 sn; (3) 30 dk kopuk.
  `mission_stopped` (emergency_land/stop) de görev sonu sayılır.
- Oturum kapandıktan sonra drone bağlı kalır ve tekrar kalkarsa (ya da yeni görev
  gelirse) **yeni oturum** açılır ve yeni `session_started` gönderilir. İniş sonrası
  yükleme hâlâ o uçuşun `sessionId`'siyle yapılmalı (backend kapalı oturuma yüklemeyi
  kabul eder).
- **6 saatten eski "active" oturumlar** açılışta/registerda sürdürülmez, kapatılır
  (eski bir oturumun sonraki günün uçuşunu yutması engellendi).

### 4.5 Telemetri (v2 alanları)
Mevcut: `battery`, `gimbal{pitch,roll,yaw}`, `altitude{agl,amsl}`, `gps`, `lat`,
`lon`, `timestamp`. Eklenenler: `droneId`, `heading` (pusula yönü), `speed` (m/s),
`flightMode` (DJI enum adı: GPS_NORMAL, WAYPOINT, GO_HOME, AUTO_LANDING…),
`isFlying`, `home{lat,lon,alt}`.
`home.lat/lon` = `FlightControllerKey.KeyHomeLocation`,
`home.alt` = `FlightControllerKey.KeyTakeoffLocationAltitude`.

### 4.6 İniş sonrası davranış / kurtarma komutları
- Android inişten **10 sn sonra** yüklemeyi dener; drone dosya erişimini reddederse
  5 sn arayla 3 kez daha dener. Olmazsa `photo_upload_status` ile hata bildirir.
- `retry_photo_upload` komutu SD karttaki fotoğrafları sonradan yükler:
  ```json
  { "command":"retry_photo_upload", "droneId":"drone-1", "sessionId":11, "areaId":5,
    "from":<ms>, "to":<ms>, "waypoints":[] }
  ```
  Yalnızca `{command, droneId}` gönderilirse son görevin yarım yüklemesini sürdürür.

### 4.7 Çalışma sırasında komut davranışı (Android)
| Komut | Görev sürerken | Görev yokken |
| --- | --- | --- |
| `hover` | Görevi **duraklatır** | Manuel modu kapatır, hover |
| `resume_mission` | Duraklatılmış görevi sürdürür | `failed` |
| `emergency_land` | Önce görevi durdurur (`mission_stopped reason:"emergency_land"`), sonra iner | Hemen iner |

---

## 5. Analizler

### 5.1 Çöp tespiti (`waste-detection-service`, port 8000)
- **Model:** `model/best.pt` — YOLOv8s **detect**, 640px, 50 epoch, **14 ham sınıf**:
  Glass, Metal, cardboard, cardbord, glass, metal, not recyclable, other,
  other_trash, paper, plastic, trash, trash bin, wood.
- **6 rapor kategorisi:** kağıt, cam, metal, plastik, geri dönüştürülemez, organik.
  Eşleştirme `class_map.py`'de. **Önemli: modelde "organik" sınıfı YOK**, bu kategori
  hiç tespit edilmez.
- **Akış:** Backend her fotoğrafı 8000'e gönderir → bbox'ları alır →
  `geoProjection.service.js` ile fotoğrafın GPS/irtifa/yönünden gerçek lat/lon'a
  çevirir → `waste_detections` tablosuna yazar → haritada renkli nokta.
- **Filtreler (backend/services/wasteDetection.service.js):**
  - **Çift sayım engeli:** Aynı kategorideki, 2 m içindeki tespitler tek nokta
    sayılır (örtüşen fotoğraflar).
  - **Boyut filtresi:** Yerde 6 m'den büyük kutular elenir (park etmiş araba,
    iskele gibi yanlış pozitifler).
- **Kalite (gerçek uçuş, oturum 20):** 13 fotoğrafta ilk aşamada 6 tespit → boyut
  filtresiyle 4 tespit, 3'ü gerçek atık 1'i yanlış (beton bordür). Moloz alanlarında
  çok sayıda küçük parça kaçırılıyor — bu kod değil, **model eğitimi** sorunu
  (daha fazla etiketli veri gerekir).
- **Konum hassasiyeti:** Aynı çöp iki farklı uçuşta ~7 m farklı konumlandı. GPS
  hatası + fotoğraf kenarındaki nesnelerin projeksiyonu. Alan içinde yeri bulmaya
  yeter, nokta atışı değil. Sahada birkaç çöpün gerçek konumu ölçülürse kalibre
  edilebilir.

### 5.2 Yeşil alan / beton (`green-concrete-service`, port 8001)
- **Model:** `model/best.pt` — YOLOv8s-**seg**, 640px, 100 epoch, **2 sınıf**:
  `concrete`, `green`.
- **Çıktı:** Fotoğrafların yüzde kaçı yeşil/beton/diğer. Gerçek uçuş (oturum 20):
  **yeşil %63, beton %3, diğer %34**.
- `landcover_analyses` tablosu (foto başına green_pct/concrete_pct/other_pct).

### 5.3 Ortomozaik (`orthomosaic-service`, port 8002) — Docker'sız
- **Neden yeni servis:** OpenDroneMap (Docker) Docker Desktop gerektiriyor ve
  kullanıcı Docker istemedi. Bu servis **OpenCV** ile çalışır.
- **Yöntem:** Her fotoğraf önce GPS/irtifa/yön ile yerleştirilir, sonra komşu
  fotoğraflarla **SIFT özellik eşleştirmesi** yapılıp hizalanır. Eşleşme GPS'ten
  çok saparsa reddedilir (hatalı eşleşme fotoğrafı yanlış yere taşıyamaz). Çıktı:
  kuzeye hizalı PNG + WGS84 sınır kutusu, Leaflet'e overlay olarak basılır.
- **Motor seçimi:** `ORTHOMOSAIC_ENGINE=opencv` (varsayılan) veya `odm` (Docker).
- **İYİ SONUÇ İÇİN GÖREV İLERİ ÖRTÜŞMESİ %60+ OLMALI.** %20'de ardışık fotoğraflar
  eşleşmiyor, sadece GPS'e göre yerleşiyor (dağınık görünüm).
- **Gerçek uçuşlar:** Oturum 15 (37 foto, 21 eşleştirme/16 GPS, 10 sn), oturum 16
  (24 foto, 11/13, 8 sn). İkisi de haritaya başarıyla oturdu.
- **Haritada kalıcılık:** Ortomozaikler `orthomosaics.on_map` ile sabitlenir;
  **sayfa yenilense de kullanıcı "Kaldır" diyene dek haritada kalır.** Aynı alanın
  yeni ortomozaiği eskisini değiştirir. Ortomozaik kartında liste + "Kaldır" butonu.

### 5.4 Çöp taraması görevi (waste_scan) — tam akış
1. Dashboard'da görev tipi "Çöp taraması" seçilir, alan seçilip görev gönderilir.
2. Uçuş sırasında **haritaya önizleme basılmaz** (sadece foto çekilir).
3. İniş sonrası her tam çözünürlüklü foto yüklendikçe backend otomatik çöp
   tespiti yapar, noktalar `waste_detections` olayı ile dashboard'a canlı gelir ve
   **o alanın ortomozaiği üzerinde** nokta olarak belirir.
4. "Alanın Çöp Haritasını Göster" butonu: seçili alanın son ortomozaiği + o
   alandaki tüm uçuşların tespitleri.
- Gerçek tarama (oturum 22, drone-2, 6 foto): 2 gerçek atık noktası bulundu.

### 5.5 PDF rapor
- `POST /api/reports/generate` iş numarası döndürür, PDF arka planda üretilir,
  `wait-and-download` ile indirilir (Puppeteer + HTML şablonu).
- Rapor **seçili alanın son uçuşunu** kullanır. Kategori tablosu, tespit sayıları,
  uçuş süresi, teknik bilgiler içerir.
- **Açık:** Rapor tek uçuşu kapsar (alan bazında toplama yok). Başlangıç/bitiş
  koordinatları "N/A" (uçuş kayıtlarına yazılmıyor).

---

## 6. Dashboard özeti (drone-frontend-react)

- **DroneSelector** (harita üstü): her drone kartı — bağlantı, batarya, uçuş modu,
  görevdeyse RTH, v1 uyarısı. Seçili drone komut/görev/telemetri hedefidir. Seçili
  drone kopsa **otomatik başka drone'a geçmez** (komut yanlış drone'a gitmesin diye).
- **"Tümü" acil butonları:** Acil İniş, Duraklat (hover), Eve Dön, Görevi Durdur.
- **Harita (LeafletMap):** her drone kendi renginde marker + yön oku + "H" kalkış
  noktası; çöp noktaları; ortomozaik overlay'leri (ayrı pane, markerların altında);
  alan çizimleri; canlı foto önizlemeleri.
- **MissionPlanner:** görev tipi (mapping/waste_scan), alan seç, rota hesapla,
  irtifa seç & gönder; drone-2 varsayılan +10 m; irtifa ayrım uyarısı; RTH gösterimi;
  Duraklat/Devam Et; Görevi Durdur.
- **Telemetri kartları:** Drone Bataryası; **Tarama Oranı** (seçili drone'un görev
  ilerlemesi: % + "WP x/N" + durum + görev tipi + alan); Seçili Alan; Bağlantı.
- **"Yeni Atık" kartı:** haritadaki en son tespiti gösterir (tür, güven, koordinat +
  Google Maps linki, zaman).
- **Paneller:** Çöp Sınıflandırma, Yeşil/Beton, Ortomozaik, Rapor.
- **Context'ler:** `SocketContext` (bağlantı + drone listesi + seçili drone +
  komut gönderme), `TelemetryContext` (drone başına telemetri), `MapContext`
  (alanlar, çöp noktaları, ortomozaik listesi).

---

## 7. Android tarafıyla yazışma geçmişi (kronolojik özet)

Android kodu ayrı geliştiricide; kullanıcı mesajları aracı olarak iletti.

1. **Protokol v2 tasarımı:** 3 tur soru-cevap. droneId, hedefli komut, drone başına
   oturum, rthHeight, telemetri alanları, register_rejected, home key'leri
   netleştirildi.
2. **Android v2'yi tamamladı (drone-2/Redmi):** register v2, tüm giden olaylarda
   droneId, droneId uyuşmayan komutları reddetme, register_rejected işleme,
   session_started tekrar dayanıklılığı, yeni telemetri alanları, rthHeight yazma,
   foto yüklemeye droneId, test sunucusu için build ayarı.
3. **İlk testte serial null geldi** → Android düzeltti (seri no drone bağlanınca
   geliyor, register tekrar gönderiliyor). Sonraki testte seri no geldi.
4. **Yeni komutlar:** hover görevi duraklatıyor, emergency_land görevi durdurup
   iniyor, `resume_mission` eklendi. Backend "all"→hover'ı geri açtı, dashboard'a
   Duraklat/Devam Et eklendi.
5. **virtual_stick güvenlik sorunu:** Dashboard joystick kullanılmazken de saniyede
   10 kez {0,0} gönderiyordu → görev başında joystick modunu açıyordu. Dashboard
   düzeltildi (yalnızca çubuk oynatılırken gönderir, bırakınca tek sıfır paketi).
6. **drone-1 (tablet) foto yükleme sorunu — 3 test boyunca:** Oturum 6, 11'de tam
   çözünürlüklü yükleme `POST /api/photos/upload` hiç gelmedi (sadece canlı
   önizlemeler geldi). **Kök neden Android'deydi (zamanlama):** drone inişten hemen
   sonra birkaç saniye dosya erişimine izin vermiyor, istek reddediliyordu. Android
   10 sn bekleme + 3 tekrar ekledi. **17.10 18:45 testinde çözüldü: iki drone'da da
   yükleme tam çalıştı** (drone-1 37/37, drone-2 24/24).
7. **Port 5000 YOLO servisi:** Android'de `DroneFrameSender` canlı FPV karelerini
   `<ip>:5000/detect`'e gönderiyordu; bu servis projede yok, sahibi bilinmiyor.
   Android'de `ENABLE_FRAME_SENDER=false` ile kapatıldı.
8. **mission_complete:** DJI'ın görev bitti bildirimi bazı testlerde gelmedi;
   Android uçuş modu değişiminden algılıyor (`detectedBy:"flightMode:WAYPOINT→GO_HOME"`).
9. **Heading/XMP:** 17.10'da 95 fotoğrafın 15'inde Android'in gönderdiği `heading`
   gerçek kamera yönünden 20°+ farklıydı (dönüşte çekilen kareler) → ortomozaikte
   "yamuk baskı". **Çözüm backend'de:** yükleme artık konumu/irtifayı/yönü
   fotoğrafın **DJI XMP'sinden** okuyor (GpsLatitude/Longitude, RelativeAltitude,
   GimbalYawDegree); form değerleri sadece yedek. `lat/lon` artık isteğe bağlı →
   görev noktaları kaybolmuş eski uçuşlar da kurtarılabilir.

### Android'e verilen güncel açık istek
- `retry_photo_upload`'ın **`waypoints:[]` (boş) ile** çalışması (backend konumu
  XMP'den okuyor, görev noktalarına gerek yok). Oturum 10 (drone-2) ve 11 (drone-1)
  fotoğrafları SD kartlarında; bu destekle kurtarılacak.

### Takip notları (Android'den)
- Sunucu bağlantısı bir testte uzun süre koptu (17.10 16:00–17:56). Sunucu
  bilgisayarının uykuya geçmemesi ve hotspot'un sabit kalması gerekiyor.

---

## 8. Gerçek uçuş testleri (oturum tablosu — test DB)

| Oturum | Drone | Alan | Tip | Foto | Ortomozaik | Not |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | drone-2 | — | mapping | 0 | — | Foto yüklenmedi (eski sorun); SD kartta |
| 11 | drone-1 | — | mapping | 0 | — | 70 WP; foto SD kartta (kurtarılacak) |
| 14 | drone-2 | — | mapping | 15 | — | |
| 15 | drone-1 | 13 | mapping | 37 | ✅ | İlk başarılı iki-drone ortomozaiği |
| 16 | drone-2 | 12 | mapping | 24 | ✅ | |
| 18 | drone-1 | 13 | mapping | 14 | ✅ | |
| 20 | drone-2 | 14 | mapping | 13 | ✅ | Çöp 4, yeşil %63/beton %3 |
| 22 | drone-2 | 14 | waste_scan | 6 | — | Canlı çöp taraması, 2 nokta |

İki drone **aynı anda, farklı irtifalarda** uçtu (drone-1 30 m/RTH 40, drone-2
40 m/RTH 65 — Android loglarıyla doğrulandı). Komut hedefleme, ayrı oturumlar,
Duraklat/Devam, iniş sonrası yükleme ve ortomozaik sahada çalıştı.

---

## 9. Bilinen eksikler ve riskler

1. **AKTİF ÇARPIŞMA ÖNLEME YOK.** Drone'lar birbirini görmüyor; yaklaşınca duran
   mekanizma yok. Sadece pasif ayrım var: farklı görev irtifası (varsayılan, aynı
   seçilirse sadece uyarı), farklı RTH (10 m'den az ayrım görevi reddeder), kalkış
   rakımı farkı (sadece uyarı). Alan çakışması kontrol edilmiyor. En riskli anlar:
   kalkış, iniş, eve dönüş (irtifa ayrımı inişte kaybolur). DJI engel sensörlerinin
   waypoint görevinde açık olup olmadığı bilinmiyor; küçük drone'u algılaması
   beklenmez, karanlıkta görüş sensörleri çalışmaz.
   **Önerilen (yapılmadı):** (a) canlı yakınlık alarmı + düşük öncelikli drone'u
   otomatik hover; (b) görev rotaları yakınsa görev reddi; (c) irtifa farkını
   zorunlu kurala çevirmek.
2. **Çöp modeli "organik" sınıfı içermiyor;** moloz alanlarında çok sayıda parça
   kaçırılıyor (model eğitimi gerekir).
3. **Çöp konum hassasiyeti ~7 m** (GPS + kenar projeksiyonu). Kalibrasyon ölçümü
   gerekir.
4. **Ortomozaik gece/düşük ışıkta** eşleştirmede zorlanıyor; görevler ileri
   örtüşme %60+ ile uçurulmalı.
5. **Rapor tek uçuşu kapsar;** başlangıç/bitiş koordinatları N/A.
6. **Model dosyaları git'te değil** (`.gitignore`); her ortamda `model/best.pt`
   elle konmalı.
7. **DJI waypoint limiti (~65–99):** büyük/yoğun örtüşmeli alanlarda aşılabilir;
   Android'de görev bölme gerekebilir.
8. **Eski tablet (v1) ile iki drone görevi reddedilir** (RTH yazamaz); tablet v2'ye
   geçti, bu artık geçerli değil ama v1 koruması kodda duruyor.

---

## 10. Çalışma kuralları / tuzaklar (yeni geliştiriciye)

- **Servisleri uygulamadan/terminalden bağımsız başlat** (PowerShell `Start-Process`
  ya da `test-baslat.bat`); IDE/preview'a bağlı başlatılırsa oturum yenilenince
  kapanır ve kullanıcı bunu "backend çöktü" diye bildirir.
- **Backend'i yeniden başlatmadan önce `isFlying` kontrol et** (uçan drone'u kesme).
- **Test DB'yi TRUNCATE etme** — gerçek Android uçuş verisi siliniyor. Sadece kendi
  simülasyon drone'unun (`drone-9` gibi) satırlarını sil.
- **Bilgisayar IP'si** hotspot'a bağlı (`172.20.10.4`); değişirse Android sunucu
  adresi güncellenmeli. `ipconfig` ile kontrol.
- **Windows Güvenlik Duvarı** port 3002'yi engelleyebilir:
  `netsh advfirewall firewall add rule name="Drone Backend Test 3002" dir=in action=allow protocol=TCP localport=3002`
- **Canlı önizlemeler** yalnızca açık dashboard sayfasının hafızasında + artık
  `uploads/live/<GG.AA>/`'de. Eski bir sayfadaki önizlemeleri kurtarmak için
  `POST /api/photos/live/import` (tarayıcı konsolundan).

---

## 11. Önerilen sıradaki adımlar

1. **Çarpışma önleme** (en kritik): en azından canlı yakınlık alarmı + opsiyonel
   otomatik hover.
2. **Android `retry_photo_upload` waypoints:[]** desteği → oturum 10/11 kurtarma.
3. **Çöp modelini yeniden eğit** (daha fazla veri, "organik" dahil); konum kalibrasyonu.
4. **Rapor:** alan bazında tüm uçuşları toplama, başlangıç/bitiş koordinatı doldurma.
5. Gündüz, yüksek örtüşmeli bir referans uçuşuyla ortomozaik kalitesini doğrulama.

---

## 12. Önemli dosyalar (hızlı referans)

- `MULTI_DRONE_PROTOCOL.md` — çoklu drone protokolünün tam ve güncel metni.
- `ANDROID_AI_PROMPT.md` — Android köprü uygulaması ana spesifikasyonu.
- `ANDROID_MOSAIC_UPDATE.md`, `ANDROID_DRONE_COMMAND_GUIDE.md`,
  `DRONE_WEBSOCKET_API.md` — Android/WebSocket detayları.
- `PROJECT_HANDOFF_PROMPT.md` — daha eski (çoklu drone öncesi) devir dosyası.
- `README.md` — kurulum ve genel bakış.
- `backend/socket.io.js` — çoklu drone merkezi (en kritik kod).
- `backend/services/djiMetadata.service.js` — fotoğraf XMP okuma.
- `backend/services/wasteDetection.service.js` — tespit + dedupe + boyut filtresi.
- `orthomosaic-service/stitcher.py` — Docker'sız ortomozaik algoritması.
- `test-baslat.bat` — beş servisi birden başlatır.

---

*Bu dosya 20.10.2026 itibarıyla günceldir. Git geçmişi (son 20 commit) projenin
adım adım nasıl geliştiğini gösterir; `git log` ile incelenebilir.*
