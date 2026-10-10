# Çoklu Drone Protokolü (Socket.IO, protokol v2)

> **Durum (Ekim 2026):** Android (drone-2 / Redmi) protokol v2'yi tamamladı.
> **Backend ve dashboard uygulandı**, test sunucusunda (port 3002) iki
> simüle drone ile doğrulandı. Sahada henüz iki drone birlikte uçurulmadı.
> Tablet (drone-1) v2'ye geçene kadar iki drone'a birlikte görev verilemez (§6.3).

Bu doküman, iki (veya daha fazla) DJI Mini 4 Pro'nun aynı anda, her biri ayrı
bir Android cihaz + kumanda üzerinden tek bir backend'e bağlanması için
Android ↔ backend arasındaki sözleşmedir. Var olan tek-drone protokolü
(`ANDROID_AI_PROMPT.md`) geçerliliğini korur; burada yalnızca değişen ve
eklenen kısımlar yer alır.

## 1. Genel ilkeler

- **Tek kod tabanı, tek APK.** Her iki cihaz aynı uygulamayı çalıştırır;
  fark yalnızca `droneId` ayarıdır. `applicationId` değiştirilmez (DJI app
  key paket adına bağlıdır).
- **Tek backend, tek veritabanı, tek dashboard.** Hangi komutun hangi drone'a
  gideceğine ve alanın nasıl bölüneceğine backend karar verir.
- **Geriye uyumluluk.** `protocol` alanı göndermeyen istemci eski sürüm (v1)
  sayılır ve `drone-1` kabul edilir. Geçiş boyunca eski tablet sürümü
  çalışmaya devam eder.
- **Kimliğin esas kaynağı socket eşlemesidir.** Payload'daki `droneId` ek
  doğrulama içindir; uyuşmazsa uyarı log'lanır, socket eşlemesi geçerli sayılır.

## 2. Bağlantı ve kimlik

### 2.1 `register` (Android → backend)

```json
{
  "role": "drone",
  "protocol": 2,
  "droneId": "drone-2",
  "serial": "<DJI seri no>",
  "lastSessionId": 42
}
```

| Alan | Zorunlu | Açıklama |
| --- | --- | --- |
| `role` | Evet | `"drone"` |
| `protocol` | v2'de evet | Yoksa istemci v1 sayılır |
| `droneId` | v2'de evet | `drone-1`, `drone-2`, … Yoksa `drone-1` |
| `serial` | v2'de evet | DJI seri numarası |
| `lastSessionId` | Hayır | Android'in bildiği son oturum (bkz. §4) |

Backend `droneId → socket.id` eşlemesini tutar ve socket'i `drone:<droneId>`
odasına alır. Android her (yeniden) bağlantıda `register`'ı tekrar gönderir.

### 2.2 Aynı `droneId` ile ikinci bağlantı

| Durum | Davranış |
| --- | --- |
| Seri numarası **aynı** (aynı cihaz yeniden bağlanıyor) | Yeni bağlantı geçerli olur; eski socket sunucu tarafından sessizce kapatılır. |
| Seri numarası **farklı** (ayar hatası) | **Eski bağlantı korunur, yeni bağlantı reddedilir.** |
| Seri numarası yok (v1 istemci) | Aynı cihaz sayılır. |
| Seri numarası yok (v2 istemci, uygulama drone'dan önce bağlandı) | Socket **beklemeye** alınır: komut almaz, oturum açılmaz, kimseyi düşürmez. Aynı socket'ten seri numaralı `register` gelince yukarıdaki kurallar uygulanır. |

Aynı socket'ten gelen ikinci `register` (ör. önce seri numarasız, drone
bağlanınca seri numaralı) bir güncellemedir: aynı oturum devam eder, seri
numarası oturuma işlenir, `session_started` aynı `sessionId` ile tekrar gönderilir.

Reddedilen socket'e gönderilir, ardından sunucu `socket.disconnect(true)` çağırır:

```json
// event: "register_rejected"
{ "reason": "droneId_in_use", "droneId": "drone-1", "activeSerial": "<seri>" }
```

Sunucu tarafından kesilen bağlantıda Socket.IO istemcisi kendiliğinden yeniden
bağlanmaz. Android elle yeniden bağlanmamalı ve ekranda belirgin bir uyarı
göstermelidir ("Bu droneId başka bir cihazda kullanılıyor").

Bu kural, yanlış ayarlanmış bir cihazın uçmakta olan bir drone'un backend
bağlantısını koparmasını önlemek için seçilmiştir.

## 3. Backend → Android komutları

### 3.1 Yapı

Tüm komutlar **`drone_command` olayı içinde** gelir; yeni olay eklenmez.
`droneId` en üst seviyede, `command` ile yan yanadır:

```json
{ "command": "takeoff", "droneId": "drone-2", "timestamp": 1760000000000 }
```

- Backend komutu yalnızca hedef drone'un odasına gönderir.
- Android, kendi kimliğiyle eşleşmeyen `droneId` taşıyan komutu **reddeder**
  ve log'lar.
- `data_request` için de aynı kurallar geçerlidir.

### 3.2 Hedefsiz komutlar (geçiş dönemi)

Web'den `droneId` olmadan bir komut gelirse:
- Tek drone bağlıysa o drone'a gider (bugünkü davranış).
- Birden fazla drone bağlıysa **komut reddedilir**, web'e hata döner.
  Komut asla tüm drone'lara birden gönderilmez.

### 3.3 "Tüm drone'lar" hedefi

Web `droneId: "all"` gönderebilir, **yalnızca** şu komutlar için:
`emergency_land`, `returnHome`, `hover`, `stop_mission`. Diğer komutlarda
`"all"` reddedilir.

### 3.3.1 Görev sırasında komut davranışı (Android)

| Komut | Görev sürerken | Görev yokken |
| --- | --- | --- |
| `hover` | Görevi **duraklatır**, drone havada bekler | Manuel joystick modunu kapatır, drone bekler |
| `resume_mission` | Duraklatılmış görevi kaldığı yerden sürdürür | `failed` döner |
| `emergency_land` | Önce görevi durdurur (`mission_stopped`, `reason: "emergency_land"`), sonra iner | Hemen iner |

`resume_mission` yalnızca tek bir drone'a gönderilebilir; `"all"` ile kabul
edilmez (iki drone'un aynı anda yeniden hareketlenmesi bilinçli bir seçim olmalı).

```json
{ "command": "resume_mission", "droneId": "drone-2", "timestamp": 1760000000000 }
```

Backend `"all"` değerini Android'e iletmez; komutu her drone'a **o drone'un
kendi `droneId`'si ile** ayrı ayrı gönderir. Böylece §3.1'deki eşleşme
kontrolü bu komutlarda da çalışır.

### 3.4 `waypoint_mission`

Mevcut format korunur; `droneId` ve iki yeni alan eklenir:

```json
{
  "command": "waypoint_mission",
  "droneId": "drone-2",
  "mission": {
    "areaId": 7,
    "areaName": "Teknokent",
    "altitude": 60,
    "speed": 8,
    "rthHeight": 85,
    "finishAction": "go_home",
    "headingMode": "auto",
    "waypoints": [
      { "index": 0, "lat": 38.6815, "lon": 39.2205, "altitude": 60, "speed": 8, "actions": ["shoot_photo"] }
    ]
  },
  "savedRouteId": null,
  "timestamp": 1760000000000
}
```

- `mission.areaId` görev için esas kaynaktır (ayrıca bkz. §4.2).
- Android önce RTH irtifasını yazıp doğrular, sonra görevi başlatır.
  Başarılıysa `command_response` `status: "started"` döner; RTH yazılamazsa
  `status: "failed"` ve hata mesajı döner.
- `mission.finishAction` ve `mission.headingMode` Android'de okunmaz; görev
  sonunda drone her zaman eve döner.
- `mission.rthHeight`: Android bunu görev başlamadan önce drone'a yazar.
  **Çoklu drone görevinde `rthHeight` yoksa Android görevi başlatmamalı ve
  hata dönmelidir** (sabit varsayılan değer kullanılmaz; bkz. §6.2).

`stop_mission` de aynı şekilde `drone_command` içinde, `droneId` ile gelir.

## 4. Oturumlar

### 4.1 Her drone'un ayrı oturumu

Her drone'un kendi uçuş oturumu (`flight_sessions` kaydı) vardır. Bir
drone'un kopması diğerinin oturumunu etkilemez. Aynı alanı bölüşen iki drone
aynı `areaId`'yi, farklı `sessionId`'leri taşır.

### 4.2 `session_started` (backend → Android)

Yalnızca ilgili drone'un odasına, iki durumda gönderilir:

| Ne zaman | Payload |
| --- | --- |
| Register sırasında | `{ sessionId, droneId, startTime, areaId }` |
| Görev başlarken, `waypoint_mission`'dan **hemen önce** | `{ sessionId, droneId, startTime, areaId }` — aynı `sessionId` |

- Register sırasında, kaldığı yerden devam eden bir oturumda görev zaten
  başlamışsa gerçek `areaId` gönderilir; henüz görev yoksa `areaId: null`.
- Android'in `session_started` işleyicisi olayı birden fazla kez almaya
  dayanıklı olmalıdır (değerleri yalnızca günceller).
- Geçiş döneminde `areaId` hem `session_started` hem `mission.areaId` içinde
  gönderilir.

### 4.3 Oturumun devam etmesi

Register'da `lastSessionId` gelirse ve o oturum hâlâ açıksa ve aynı drone'a
aitse, **kopma süresi ne olursa olsun aynı oturum devam eder.** DJI görevi
bağlantı kopsa da drone üzerinde devam ettiği için bu gereklidir.

### 4.4 Oturumun kapanması

Oturum bağlantı koptuğu anda **kapanmaz.** Görevin bittiği, `mission_complete`
**veya** `mission_stopped` (ör. `stop_mission`, `emergency_land`) ile bildirilir.
Kapanma koşulları, öncelik sırasıyla:

1. `isFlying` varsa: görev bittikten sonra `isFlying` `false` olur ve 60 sn
   boyunca `false` kalır.
2. `isFlying` yoksa (v1 istemci): görev bittikten sonra `altitude.agl`
   60 sn boyunca 1,5 m'nin altında kalır.
3. Son çare: drone 30 dakika boyunca bağlanmaz.

Fotoğraf yükleme **kapalı oturumlara da kabul edilir**; iniş sonrası toplu
yükleme (durdurulmuş görevlerde de) oturum kapanmış olsa bile doğru oturuma gider.

`mission_complete` payload'ında Android `detectedBy` alanını gönderir:
`"FINISHED"` (DJI bildirimi) ya da `"flightMode:WAYPOINT→GO_HOME"` (DJI
bildirimi gelmediğinde uçuş modu geçişinden algılandı). Backend bu alanı
olduğu gibi dashboard'a iletir.

### 4.5 Uçuşlar arası: yeni oturum

Oturum kapandıktan sonra drone bağlı kalırsa, sıradaki uçuş için backend
**otomatik yeni oturum açar** ve drone'a yeni `session_started` gönderir:
- yeni bir `waypoint_mission` gönderilirken, ya da
- telemetride `isFlying: true` geldiğinde (elle kalkış).

`register` `lastSessionId` taşıyorsa ve o oturum kapanmışsa (ör. iniş sonrası
uygulama yeniden bağlandı), backend **boş bir oturum açmaz** ve
`session_started` göndermez; yeni oturum yukarıdaki gibi kalkışta ya da görevde
açılır. `lastSessionId` olmadan ilk bağlantıda oturum eskisi gibi hemen açılır.
Oturum yokken telemetri dashboard'a iletilir ama kaydedilmez.

Dashboard'un analiz panelleri (ortomozaik, çöp, yeşil/beton, rapor), açık
oturum yoksa drone'un **en son oturumunu** kullanır (`drones_state.lastSessionId`).

Android iniş sonrası yüklemede, o uçuşun `sessionId`'sini kullanmaya devam
etmelidir (yeni `session_started` gelse bile, önceki uçuşun fotoğrafları
önceki oturuma).

## 5. Android → backend olayları

### 5.1 Tüm olaylara `droneId`

Şu olayların payload'ına `droneId` eklenir:
`drone_telemetry`, `data_response`, `command_response`, `mission_progress`,
`mission_complete`, `mission_stopped`, `drone_photo`, `photo_upload_status`.

### 5.2 Telemetri (v2 ek alanları)

Mevcut alanlar (`battery`, `gimbal`, `altitude`, `gps`, `lat`, `lon`,
`timestamp`) aynen kalır. Eklenenler:

| Alan | Tip | Kaynak / açıklama |
| --- | --- | --- |
| `droneId` | string | |
| `heading` | number, derece | Drone'un pusula yönü (gimbal yaw değil) |
| `speed` | number, m/s | Yer hızı |
| `flightMode` | string | DJI enum adı olduğu gibi: `GPS_NORMAL`, `WAYPOINT`, `GO_HOME`, `AUTO_LANDING`, … |
| `isFlying` | boolean | |
| `home.lat`, `home.lon` | number, derece | `FlightControllerKey.KeyHomeLocation` |
| `home.alt` | number, m | `FlightControllerKey.KeyTakeoffLocationAltitude` — her kalkışta yenilenir |

Dashboard tüm v2 alanlarını **isteğe bağlı** kabul eder; v1 istemciden
gelmemeleri hata üretmez:
- `heading` yoksa drone yön oku olmadan gösterilir.
- `speed` yoksa "—" gösterilir.
- `home` yoksa kalkış noktası işaretlenmez; kalkış rakımı kontrolü yapılamaz,
  "kalkış rakımı bilinmiyor" uyarısı gösterilir, görev engellenmez.
- `flightMode` yoksa mod gösterilmez; tanınmayan değer ham haliyle gösterilir.

### 5.3 Fotoğraf yükleme (HTTP)

`POST /api/photos/upload` multipart formuna `droneId` alanı eklenir.
Oturum zaten drone'a özel olduğu için zorunlu değildir; doğrulama için kullanılır.

Ortomozaik **alan bazında birleşik** oluşturulur: aynı alanı tarayan iki
drone'un fotoğrafları tek haritada birleştirilir. Oturum bazında üretim de
mümkün olmaya devam eder.

## 6. Uçuş güvenliği

Ana güvenlik önlemi **iki drone'un ayrı alanları taramasıdır.** İrtifa ve RTH
ayrımı, özellikle kalkış, iniş ve alana gidiş-dönüş sırasındaki çakışmalara
karşı ek önlemdir.

### 6.1 Görev irtifası

- Waypoint irtifaları **kalkış noktasına göredir** (göreceli).
- Varsayılan olarak `drone-2`, `drone-1`'den **10 m yukarıda** uçar (ayarlanabilir).
- Fotoğraf örtüşmesi ve waypoint aralığı her drone için kendi irtifasına göre
  ayrı hesaplanır.
- **Operasyon kuralı:** iki drone aynı seviyeden kalkar.
- **Kontrol:** backend iki drone'un `home.alt` değerlerini karşılaştırır; fark
  eşiği aşarsa dashboard görev başlatılmadan önce uyarı gösterir. Eşik
  ayarlanabilir; varsayılan **3 m**, saha ölçümünden sonra güncellenecek
  (GPS dikey hatası birkaç metreyi bulabilir).

### 6.2 RTH irtifası

Backend her drone için `mission.rthHeight` hesaplar:

- `drone-1`: iki görevin en yüksek irtifası + 10 m
- `drone-2`: iki görevin en yüksek irtifası + 25 m
- Üst sınır 120 m.

Örnek: görevler 50 m ve 60 m → RTH 70 m ve 85 m.

RTH değerleri 120 m sınırına takılıp aradaki fark 10 m'nin altına düşerse
**görev planlama aşamasında reddedilir** ("Görev irtifası çok yüksek, RTH
ayrımı sağlanamıyor; görev irtifasını düşürün"). Mevcut formülle bu, en yüksek
görev irtifasının en fazla 95 m olabileceği anlamına gelir.

Sabit RTH değerleri (ör. 40 / 55 m) kullanılmaz: drone, RTH irtifasından
yüksekte uçuyorsa eve bulunduğu irtifada döner ve ayrım kaybolur.

### 6.3 Eski (v1) istemci

Eski tablet sürümü (v1) `mission.rthHeight`'ı uygulamaz; RTH irtifası
kontrolsüz kalır. Bu yüzden backend, **bağlı ya da görevi süren başka bir
drone varken** taraflardan biri v1 ise görevi reddeder (HTTP 409, "eski
uygulama sürümünde … tableti v2 sürümüne güncelleyin"). Tek başına bağlı bir
v1 drone bugünkü gibi görev alabilir. Kalıcı çözüm: tablet de v2'ye geçecek.

## 7. Alan bölme

| Aşama | Davranış |
| --- | --- |
| 1 | Her drone'a dashboard'dan ayrı alan seçilir, ayrı görev gönderilir. |
| 2 | Tek alan backend tarafından otomatik olarak şeritlere bölünür; her drone kendi şeridini tarar. |

Her iki aşamada da her drone kendi `waypoint_mission` komutunu kendi
waypoint listesiyle alır. Eski arayüzün `start_area_scan` komutu kullanılmaz.

## 8. Dashboard

- **Drone seçici** (haritanın üstünde): her drone bir kart; bağlantı, batarya,
  uçuş modu, görevdeyse RTH irtifası ve eski sürüm (v1) uyarısı görünür.
  Seçili drone; komutların, görevlerin ve telemetri kartlarının hedefidir.
  Seçili drone bağlantıyı kaybederse seçim **otomatik değişmez** (komutlar
  sessizce başka drone'a gitmesin diye); komutlar backend'de reddedilir.
- **"Tümü" butonları:** Acil İniş, Duraklat (`hover`), Eve Dön, Görevi Durdur (§3.3).
- **Görev planlayıcıda Duraklat / Devam Et:** seçili drone görevdeyken
  `hover` ve `resume_mission` gönderir.
- **Harita:** her drone kendi renginde, adı, yön oku (`heading`) ve "H"
  kalkış noktası (`home`) ile.
- **Görev planlayıcı:** görev seçili drone'a gider; varsayılan planlama
  irtifası drone-1 30 m, drone-2 40 m (+10 m); irtifa seçiminde başka bir
  drone'un görev irtifasına 10 m'den yakınsa uyarı; backend'in RTH değeri ve
  uyarıları ekranda gösterilir; "Görevi Durdur" seçili drone'un görevini durdurur.
- **Elle kontrol paneli:** hedef, panel açıldığı anda sabitlenir; panel
  açıkken başka drone seçilse de joystick komutları ilk drone'a gider.
  `virtual_stick` **yalnızca çubuk hareket ettirilirken** gönderilir;
  bırakılınca tek bir sıfır paketi gönderilip akış durur. (Önceden panel
  açıkken boşta da saniyede 10 kez sıfır gönderiliyordu; bu, Android'de
  görev başlangıcında ve acil inişte joystick modunu yeniden açıyordu.)

## 9. Test ortamı

| | Canlı | Test |
| --- | --- | --- |
| Port | 3001 | 3002 |
| Veritabanı | `drone_tracking` | `drone_tracking_test` |

Android'de sunucu adresi bir build ayarından gelir; test sürümü 3002'ye bağlanır.

```bash
npm run setup-db:test                       # test veritabanını bir kez oluşturur
npm run start:test                          # backend → http://<bilgisayar-ip>:3002
npm --prefix drone-frontend-react run dev:test   # dashboard → http://localhost:3010 (test sunucusuna bağlı)
```

## 10. Açık maddeler

- [x] **Port 5000 YOLO servisi:** Android'deki `DroneFrameSender` canlı FPV
      karelerini `<sunucu-ip>:5000/detect` adresine gönderiyordu; servis bu
      projede yok. Android'de `ENABLE_FRAME_SENDER=false` build ayarıyla kapatıldı.
- [x] **Android `hover` / `emergency_land` görev sırasında:** düzeltildi;
      `hover` görevi duraklatıyor, `resume_mission` eklendi (§3.3.1).
- [ ] **Tablet v2'ye geçecek** (§6.3).
- [ ] **Kalkış rakımı eşiği:** iki drone yan yana konup sahada ölçülecek,
      gerçekçi eşik değeri backend'e iletilecek (§6.1).

## 11. Yapılacaklar

### Android

- [x] `register`'a `protocol`, `droneId`, `serial`, `lastSessionId` (+ `appVersion`)
- [x] Gelen komutlarda `droneId` kontrolü (uyuşmazsa `command_response` `status: "rejected"`)
- [x] `register_rejected` işleme (yeniden bağlanmama + uyarı)
- [x] `session_started`'ın tekrar alınmasına dayanıklılık
- [x] Giden tüm olaylara `droneId` (§5.1)
- [x] Telemetriye `heading`, `speed`, `flightMode`, `isFlying`, `home`
- [x] `mission.rthHeight`'ı görev öncesi drone'a yazma; yoksa görevi başlatmama (geçerli aralık 20–120 m)
- [x] Foto yüklemeye `droneId`
- [x] Sunucu adresi için build ayarı (canlı / test)
- [x] Port 5000 gönderimini kapatan build ayarı (`ENABLE_FRAME_SENDER=false`)
- [x] `hover`'ın çalışan görevi duraklatması, `resume_mission`, görev sırasında `emergency_land` (§3.3.1)
- [ ] Tablet (drone-1) sürümünün v2'ye geçmesi (§6.3)

### Backend

- [x] Port 3002 + `drone_tracking_test` test kurulumu (`npm run setup-db:test`, `npm run start:test`)
- [x] `droneId` eşlemesi, odalar, §2.2 kuralları
- [x] Komutları hedefli gönderme (`socket.io.js`, `mission.routes.js` `/start` ve `/stop`)
- [x] `"all"` hedefinin drone başına dağıtılması
- [x] Drone başına oturum, `lastSessionId` ile devam, §4.4 kapanma kuralları
- [x] `session_started`'a `droneId` ve `areaId`; görev öncesi tekrar gönderim
- [x] Veritabanı: `flight_sessions.drone_id`, `flight_sessions.drone_serial`, `photos.drone_id` (başlangıçta otomatik migration)
- [x] RTH hesaplama, 120 m kontrolü, kalkış rakımı uyarısı (eşik: `HOME_ALT_WARN_DIFF_M`, varsayılan 3)
- [x] Başka drone varken v1 istemciye/istemciyle görevin reddi (§6.3)
- [x] `"all" → hover` yeniden açık (Android düzeltmesinden sonra, §3.3)
- [x] `drone-2` için varsayılan +10 m görev irtifası (dashboard'da)
- [ ] Alan bazında birleşik ortomozaik

### Dashboard

- [x] Drone seçici, "Tümü" acil butonları
- [x] Çoklu drone harita gösterimi, isteğe bağlı v2 alanları
- [x] Görev planlamada drone seçimi, irtifa/RTH uyarıları
- [x] Elle kontrol panelinde hedef kilidi
