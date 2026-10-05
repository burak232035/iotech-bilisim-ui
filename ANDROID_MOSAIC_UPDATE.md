# Android Tarafı — Fotoğraf Mozaiği Güncellemesi

Bu belge, sunucu tarafında (`waypointPlanner.service.js`) yapılan bir
değişikliği ve bunun Android uygulamasında kontrol edilmesi/değişmesi
gereken noktalarını özetliyor. Android geliştiriciye doğrudan
iletilebilecek, bağımsız bir belge olması için `ANDROID_AI_PROMPT.md`'den
ayrı tutuldu.

---

## 1. Ne değişti, neden

**Hedef:** Drone'un taradığı alanın fotoğraflarını, Google'ın uydu
görüntüleri gibi haritada **kesintisiz bir mozaik/halı** halinde
göstermek — parça parça, aralıklı fotoğraflar değil.

**Önceki durum:** Waypoint planlayıcı her tarama şeridi (strip) için
sadece **2 waypoint** üretiyordu — şeridin başlangıcı ve bitişi. Bu,
şerit uzunluğu onlarca metre olsa bile sadece 2 fotoğraf demekti; bu
2 fotoğraf arasında kocaman boşluklar kalıyordu.

**Yeni durum:** Planlayıcı artık her şeridi, **fotoğrafın uçuş
yönündeki (ileri) ayak izi kadar** (`footprintHeightM`) aralıklarla
yoğun waypoint'lere bölüyor. Bir waypoint'te çekilen fotoğrafın "ileri"
kenarı, bir sonraki waypoint'te çekilecek fotoğrafın "geri" kenarına
tam denk geliyor — boşluk yok, çakışma yok. Haritada art arda
yerleştirilince kesintisiz bir görüntü halısı oluşuyor.

**Somut fark:** Aynı büyüklükteki bir alan artık **çok daha fazla**
waypoint ve fotoğraf içeriyor. Örnek (gerçek test): ~30x50m'lik küçük
bir alan, 20m irtifa, %70 örtüşme → önceden ~2-4 waypoint, şimdi
**4-8+ waypoint**; büyük alanlarda bu **100'ün üzerine** çıkabilir.

## 1.5 — İKİNCİ GÜNCELLEME: "kenar-kenara" terk edildi, gerçek fotogrametri kuruldu

**Yukarıdaki §1'i geçersiz kılan önemli bir değişiklik:** Gerçek
uçuşlarda GPS/pusula donanım hassasiyeti yüzünden basit "kenar-kenara,
%0 örtüşme" yerleştirmenin **asla** Google Haritalar kalitesinde
dikişsiz görünmeyeceği anlaşıldı (matematik doğru olsa bile birkaç
metre/derece sensör hatası her zaman görünür kayma bırakıyor).

Bunun yerine sunucuya **gerçek fotogrametrik dikişleme** (OpenDroneMap —
komşu fotoğraflardaki ortak görsel özellikleri eşleştirip piksel
düzeyinde hizalıyor) eklendi. Bu, **gerçek örtüşme** gerektirir — artık
waypoint planlayıcının varsayılanları:
- İleri (along-track) örtüşme: **%75** (§1'deki "boşluk yok, çakışma
  yok" — yani %0 — artık geçerli değil)
- Yan (cross-track) örtüşme: **%65**

Bu, §3.1'deki DJI waypoint limiti sorununu **kritik/kesin** hale
getiriyor — aşağıya bakın.

## 2. Neyin DEĞİŞMEDİĞİ

`drone_command` → `waypoint_mission` payload **formatı aynı**:

```json
{
  "command": "waypoint_mission",
  "mission": {
    "altitude": 30,
    "speed": 8,
    "waypoints": [
      { "lat": 38.68152, "lon": 39.21983, "altitude": 30, "speed": 8, "actions": ["shoot_photo"] },
      { "lat": 38.68165, "lon": 39.21997, "altitude": 30, "speed": 8, "actions": ["shoot_photo"] }
    ]
  }
}
```

Sadece `waypoints[]` dizisi çok daha uzun. Mevcut
`handleWaypointMission`, `onWaypointReached`, `aimNadirThenShoot`,
`shootPhotoAndSend` kodunuz **ek kod değişikliği olmadan çalışmalı** —
ama aşağıdaki maddeler yoğunluk artışı yüzünden **kontrol edilmeli**.

---

## 3. Android'de kontrol edilmesi / değişmesi gerekenler

### 3.1 — DJI waypoint mission limiti (ARTIK NEREDEYSE KESİN AŞILACAK — öncelik #1)

**Güncelleme:** Basit "kenar-kenara mozaik" hedefi terk edilip **gerçek
fotogrametrik dikişleme** (OpenDroneMap) kurulduğu için, waypoint
planlayıcının varsayılan örtüşme oranları da değişti:
- İleri (along-track) örtüşme: **%0 → %75**
- Yan (cross-track) örtüşme: **%70 → %65** (aşağı yukarı aynı kaldı,
  ama artık fotogrametri amaçlı, önceki "kenar kenara" mantığından farklı)

Gerçek test: aynı küçük alan (~30x50m) için waypoint sayısı **28'den
371'e** çıktı — bu, DJI'nin waypoint limitini (~65-99) **neredeyse her
zaman** aşacağı anlamına geliyor. Yani bu madde artık "büyük alanlarda
olabilir" değil, **"küçük-orta alanlarda bile kesin karşılaşılacak"**
bir durum.

WPMZ/KMZ görevlerinde DJI'nin bir waypoint sayısı sınırı var (modele/SDK
sürümüne göre genelde ~65-99 civarı). Görev yüklemesi (`uploadMission`)
sessizce ya da açık bir hatayla başarısız olabilir.

**Yapılması gereken:**
1. MSDK 5.17.0 için Mini 4 Pro'nun gerçek waypoint limitini teyit edin.
2. Artık neredeyse her ortomozaik görevinde tetikleneceği için **(b)
   önerilen/gerekli yaklaşım oldu**, (a) sadece geçici bir fallback:
   - **(b) — Önerilen:** Görevi otomatik olarak ardışık alt-görevlere
     bölün (`waypoints[]`'i limit'e göre parçalara ayırıp, birinci grup
     biter → `mission_complete` → ikinci grup otomatik başlar, tüm
     fotoğraflar aynı session'a ait sayılır). Ortomozaik özelliğinin
     pratikte kullanılabilir olması buna bağlı — (a) ile her seferinde
     "reddedildi" almak kullanıcı deneyimini kullanılamaz hale getirir.
   - **(a) — Geçici fallback:** (b) hazır olana kadar, net bir hatayla
     reddedin (`command_response: failed`,
     `error: "Waypoint sayısı limiti aşıyor (N > limit)"`) — sunucu/web
     tarafı bunu zaten gösterebilir hale getirildi.

### 3.2 — Çekim temposu vs. uçuş hızı

Waypoint'ler artık `footprintHeightM` (tipik 15-30 m) aralıklı.
`mesafe / speedMs` = ardışık waypoint'ler arası süre. Mevcut
`shootPhotoAndSend` akışınız yaklaşık:

- gimbal nadire dönüş + bekleme: ~400 ms
- SD karta yazma bekleme: ~1200 ms
- **toplam: ~1.6 sn / çekim**

Bu süre, waypoint'ler arası uçuş süresinden uzunsa çekimler
birikir/kaçar. Kontrol edilmesi gerekenler:
- WPMZ görevinin her waypoint'te fiilen **durup aksiyon bitene kadar
  beklediğini** doğrulayın (DJI'nin "hover and shoot" davranışı olabilir
  — varsa bu madde otomatik çözülür).
- Durmuyorsa: `speedMs`'i çekim temposuna göre sınırlayın (örn.
  `speedMs < footprintHeightM / 2` gibi bir kural).
- Alternatif: sunucu tarafında `/api/mission/plan`'a bir üst hız
  sınırı otomatik hesaplaması eklenebilir — isterseniz bunu biz ekleriz,
  haber verin.

### 3.3 — Gimbal her çekimde kesinlikle nadir (-90°) — 🔴 GERÇEK UÇUŞTA DOĞRULANDI, HÂLÂ BOZUK

**Bu artık teorik bir risk değil, gerçek uçuşta gözlemlendi:** İlk
waypoint'te gimbal dik aşağı bakıp doğru fotoğraf çekiyor, **sonraki
waypoint'lerin hepsinde gimbal düz/ufka bakarken çekim yapılıyor**.
Haritada bu, hem yanlış konumlanmış/çarpık fotoğraflar hem de aradaki
"boşluk" olarak görünüyor — ama boşluk gerçek bir waypoint mesafesi
hatası değil: harita tarafı her fotoğrafın nadir çekildiğini varsayıp
irtifa+HFOV'dan bir dikdörtgen çiziyor, düz-bakış fotoğraflar için bu
dikdörtgen tamamen yanlış oluyor.

**Debug için önerilenler:**
1. `aimNadirThenShoot`'un **gerçekten her** `shoot_photo` waypoint'inde
   çağrıldığını Logcat ile doğrulayın (her çağrıda bir log basın: `"WP
   $wpIndex: nadir komutu gönderiliyor"`). Sadece ilk waypoint'te mi
   basılıyor, yoksa hepsinde basılıp da gimbal fiilen dönmüyor mu —
   bunu ayırt edin.
2. `rotate()`'in `onSuccess` callback'ine güvenmek yerine, çekimden
   hemen önce **gerçek gimbal açısını okuyup** (`KeyGimbalAttitudePitch`)
   loglayın: `Log.i("WaypointPhoto", "WP $wpIndex çekim anı gimbal pitch: $actualPitch")`.
   `rotate()` "başarılı" dönebilir ama gimbal fiilen hedefe
   ulaşmadan çekim tetiklenmiş olabilir (400ms'lik bekleme yetersiz
   kalmış olabilir, sahada artırılması gerekebilir).
3. **Önemli ihtimal:** WPMZ/KMZ görev şablonunuzda, waypoint başına
   gömülü bir gimbal pitch aksiyonu (örn. varsayılan 0°/düz) varsa, bu
   DJI'nin kendi görev motoru tarafından uygulanıp sizin manuel
   `GimbalManager.rotate()` çağrınızı **waypoint'ler arası geçişte
   geçersiz kılıyor olabilir** — KMZ oluşturma kodunuzda her waypoint
   için de açıkça -90° gimbal pitch aksiyonu eklemeyi deneyin (uygulama
   içi manuel komuta ek olarak, ya da onun yerine).

### 3.4 — Toplu yükleme hacmi (§17'deki upload akışı)

Artık bir uçuştan **50-150+ fotoğraf** çıkabilir. Seri (birbirini
bekleyen, tek tek) yükleme çok uzun sürebilir ve kullanıcıyı bekletir.

**Öneri:** Aynı anda birkaç yüklemeyi paralel yapın (örn. 3-4 istek
birden), başarısız olanlar için basit bir retry (2-3 deneme) ekleyin.
Backend idempotent değil — her başarılı istek yeni bir `photos` satırı
oluşturur, o yüzden retry'da "zaten yüklendi mi" kontrolü Android
tarafında (yerel bir "yüklendi" flag'i ile) yapılmalı, yoksa aynı foto
birden fazla kez DB'ye girer.

### 3.5 — Heading tutarlılığı (sadece teyit, değiştirmeyin)

Mozaik mantığı, fotoğrafın "üst" kenarının uçuş yönüne karşılık
geldiğini varsayıyor. Bu, mevcut `headingMode: "auto"` ayarıyla zaten
sağlanıyor olmalı (burun her zaman rota yönüne dönük). Sadece gerçek
uçuşta bunun böyle olduğunu teyit edin — ayar değişikliği gerekmiyor.

### 3.7 — Tam çözünürlük foto yükleme (§17) — ŞİMDİ ÖNCELİK #1, backend doğrulandı

Ortomozaik (§1.5) hiç test edilemiyor çünkü `photos` tablosu (tam
çözünürlüklü yükleme) şu ana kadar **hiç dolmadı** — `ANDROID_AI_PROMPT.md`
§17'deki iniş-sonrası yükleme akışı gerçek bir uçuşta hiç tetiklenmedi.

**Şimdi doğrulanan kısım (sunucu tarafı, sizin yapmanıza gerek yok):**
- `POST /api/photos/upload` endpoint'i gerçek bir session id ve dummy
  bir JPEG ile test edildi — dosya diske yazıldı, `photos` tablosuna
  doğru satır düştü (sonra test verisi temizlendi). Endpoint çalışıyor.
- Ağ yolu zaten kanıtlanmış durumda: telemetri/socket bağlantısı aynı
  RC↔PC WiFi + IP:3001 üzerinden akıyor, foto upload'u da aynı yolu
  kullanacak. **Yeni bir ağ ayarı gerekmiyor.**

**Sizde eksik olan tek parça:** `uploadFlightPhotos()` / `uploadSinglePhoto()`
(§17'de örnek kodu var) fiilen çağrılıyor mu, yoksa henüz sadece
belgede mi kaldı? Kontrol edilmesi gerekenler:
1. `pullOriginalMediaFileFromCamera` (ya da MSDK 5.17.0'daki eşdeğeri)
   ile SD karttan **orijinal** (thumbnail değil) dosya gerçekten
   indiriliyor mu?
2. İniş/`mission_complete` sonrası bu döngü fiilen tetikleniyor mu?
3. `BACKEND_UPLOAD_URL` içindeki `192.168.1.XXX` gerçek PC IP'siyle
   değiştirildi mi?

Bu madde, §3.1 (waypoint limiti) ile birlikte artık **eş-öncelikli** —
ikisi de tamamlanmadan ortomozaik özelliği hiç gerçek veriyle
denenemez.

### 3.6 — Waypoint aralığı sabitlendi (Sunucu Tarafı Tamamlandı) — bilgi amaçlı, kod değişikliği gerekmiyor

Gerçek uçuşta hem çakışma hem boşluk gözlemlenmişti (bkz. §3.3 —
büyük kısmı gimbal sorunundandı). Ama ayrıca sunucu tarafında da gerçek
bir hata bulundu ve düzeltildi: `waypointPlanner.service.js`, her
şeridi **yuvarlanmış bir sayıya eşit parçalara bölerek** yoğunlaştırıyordu
— şerit uzunluğu `footprintHeightM`'in tam katına denk gelmediğinde bu,
adım aralığını hedeften biraz kısa (çakışma) ya da biraz uzun (boşluk)
yapıyordu.

**Düzeltme:** Artık her şerit boyunca **tam olarak `footprintHeightM`**
sabit adımlarla ilerleniyor (kümülatif yol uzunluğu üzerinden, engel
kaçınma köşeleri dahil). Bunun tek pratik sonucu:

> **Bir şeridin son çekimi, artık haritada çizilen alan sınırını birkaç
> metre (en fazla bir `footprintHeightM` kadar, tipik 15-30 m) aşabilir.**
> Bu **kasıtlı** — sınıra tam oturtmak için son adımı sıkıştırmak yerine,
> tam aralığı koruyup alan dışına hafifçe taşmayı tercih ettik (çakışma/
> boşluk bırakmamak için).

**Android'de yapılması gereken bir kod değişikliği yok** — `mission.
waypoints[]` formatı ve mantığı aynı, sadece koordinatlar artık daha
düzenli aralıklı ve son waypoint'ler bazen çizilen poligonun az dışında
olabilir. Tek önemli nokta: **bunu bir hata sanıp** waypoint'leri
poligon sınırına "clip" eden/kırpan bir mantık **eklemeyin** — bu,
düzeltmeyi bozup çakışma/boşluk sorununu geri getirir. Uçuşta drone'un
çizilen alanın az dışına çıktığını görürseniz bu beklenen davranıştır.

---

## 4. Test checklist (bir sonraki uçuşta)

- [ ] Küçük bir alanla test edin, waypoint sayısının beklenen aralıkta
      olduğunu doğrulayın (web'deki "Waypoint" sayacına bakın).
- [ ] Android Logcat'te tüm waypoint'lerde `"WP N fotoğraf çekildi"`
      loglarının **atlanmadan** aktığını kontrol edin.
- [ ] İniş sonrası haritada ardışık fotoğrafların gerçekten kenar kenara
      (boşluksuz) dizildiğini görsel olarak kontrol edin.
- [ ] Daha büyük bir alanla deneyip DJI'nin waypoint limitine
      takılıp takılmadığını görün (§3.1).
- [ ] Drone'un şerit sonlarında çizilen alan sınırının birkaç metre
      dışına çıktığını görürseniz endişelenmeyin — bu artık kasıtlı
      (§3.6), waypoint'leri sınıra kırpmayın.
- [ ] İniş sonrası §17/§3.7 yükleme akışının fiilen tetiklendiğini
      doğrulayın (Logcat: her fotoğraf için "Yüklendi: ..." logu).
      Uçuş bitince sunucu tarafında `photos` tablosunda yeni satırlar
      olup olmadığı kontrol edilecek.
