# Waypoint Görevi — Canlı Test Checklist

Bu liste, Android + drone bağlandığında (bu oturumda test edilemeyen) değişiklikleri
doğrulamak için hazırlandı. İki ayrı sorun düzeltildi:

1. **Payload uyumsuzluğu** — eski `frontend/harita/harita.js` sayfası `mission{}` sarmalaması
   olmadan komut gönderiyordu, Android sessizce çöküyordu. **Çözüm: artık sadece React
   panelini (`drone-frontend-react`) kullanın, eski `harita.html` sayfasını test etmeyin.**
2. **Home-aware rota yönlendirme** — drone her zaman hesaplanan rotanın ilk waypoint'inde
   olacak diye bir garanti yok. Planlayıcı artık drone'un bilinen son konumuna göre rotayı
   (gerekirse ters çevirerek) en yakın uçtan başlatıyor ve ilk waypoint'e olan mesafeyi
   (`homeDistanceM`) gösteriyor.

Değişen dosyalar: [waypointPlanner.service.js](backend/services/waypointPlanner.service.js),
[mission.routes.js](backend/routes/mission.routes.js), [socket.io.js](backend/socket.io.js),
[MissionPlanner.jsx](drone-frontend-react/src/components/dashboard/MissionPlanner.jsx),
[TelemetryContext.jsx](drone-frontend-react/src/contexts/TelemetryContext.jsx).

---

## 0. Ön koşul: Android'e `lat`/`lon` eklendi mi?

Home-aware yönlendirme, drone'un konumunu **telemetriden** (öncelikli) ya da
**`drone_photo`**'dan (henüz uygulanmadı) öğrenir. `ANDROID_AI_PROMPT.md` §4'e artık
`getGpsCoordinates()` + `lat`/`lon` alanları eklenmesi gerektiğine dair bir uyarı ve örnek
kod eklendi.

- [ ] Android tarafı `drone_telemetry` payload'ına `lat`/`lon` eklemiş mi? (Eklenmediyse
      aşağıdaki 3. ve 4. adımlar "drone konumu bilinmiyor" uyarısıyla sonuçlanacaktır —
      bu **hata değil**, sadece konum bilgisi yoksa sistemin fallback davranışıdır.)

---

## 1. Bağlantı testi

- [ ] Android uygulamasını başlat, backend'e bağlan.
- [ ] Backend konsolunda `📱 Drone registered: <socket_id>` görünüyor mu?
- [ ] Tarayıcıda `http://<backend-ip>:3001/api/debug/connections` aç →
      `droneCount: 1`, `droneSocketIds` dolu mu?
- [ ] Aynı endpoint'te `lastKnownPosition` alanı var mı, `null` mı? (0. adıma bağlı)
- [ ] React dashboard'da (`/dashboard`) sağ üstte "● Drone Bağlı" rozeti yeşile dönüyor mu?

## 2. Eski sayfa artık kullanılmıyor mu?

- [ ] `frontend/harita/harita.html` sayfasını **açmayın** — sadece React
      dashboard'daki Mission Planner kartını kullanın. (Eski sayfa hâlâ `start_area_scan` +
      yanlış payload gönderiyor, düzeltilmedi.)

## 3. Rota hesaplama (`Adım 3 — Rota Hesapla`)

- [ ] Haritada drone'un **gerçekte bulunduğu yere yakın** bir alan çizin (500 m güvenlik
      limiti var).
- [ ] "Rota Hesapla"ya basın. Backend konsolunda şu satırı arayın:
      `✅ Mission planned: ... home→WP0 X m` (X = ilk waypoint'e mesafe)
      veya `... home konumu bilinmiyor` (henüz konum verisi yoksa).
- [ ] React panelindeki özet kartlarında **"İlk WP'ye Mesafe"** değeri görünüyor mu?
  - 450 m altındaysa yeşil/mavi, üzerindeyse kırmızı ve durum mesajında uyarı çıkmalı.
- [ ] Haritadaki rota çizgisinin **"Başlangıç"** noktası (yeşil daire), drone'un bulunduğu
      köşeye yakın mı? (Uzak köşeden değil.)

### Yön testi (asıl talep edilen düzeltme)

- [ ] Aynı alanı, drone'u **poligonun bir köşesine** koyup bir kez, sonra (mümkünse)
      **karşı köşesine** koyup bir daha planlayın. İki durumda da "Başlangıç" işaretinin
      drone'a yakın köşede çıktığını doğrulayın — yani rota drone'un konumuna göre kendini
      ters çeviriyor, siz drone'u manuel olarak ilk waypoint'e hizalamak zorunda değilsiniz.

## 4. Görevi gönderme (`Adım 4 — Görevi Drone'a Gönder`)

- [ ] İrtifa seçip gönderin. Backend konsolunda `🚁 Waypoint mission gönderildi: 1 drone, N WP`.
- [ ] Android Logcat'te `"Komut alındı: waypoint_mission"` ve ardından
      `"Görev alındı: ..."` görünüyor mu?
- [ ] Drone kalkıp waypoint'leri geziyor mu, `mission_progress` ilerleme çubuğunu
      güncelliyor mu?

### Hata görünürlüğü testi (yeni eklenen düzeltme)

- [ ] **Kasıtlı olarak** 500 m'den uzak bir alan seçip göndermeyi deneyin (ya da drone'u
      alandan uzağa koyun). Android'in reddetmesi beklenir. React panelinde artık
      **"❌ Görev reddedildi: GÜVENLİK: ..."** mesajının göründüğünü doğrulayın — önceden bu
      tamamen sessizdi.

## 5. Görevi durdurma

- [ ] "Görevi Durdur (RTH)" butonuna basın → drone eve dönüyor mu, `mission_stopped`
      event'i geliyor mu?

---

## Bilinen sınırlamalar (bu turda düzeltilmedi)

- `drone_photo` Android'de henüz gönderilmiyor → fotoğraf tabanlı konum güncellemesi
  çalışmayacak, sadece telemetriye `lat`/`lon` eklenirse home-aware yönlendirme aktif olur.
- `gimbal_pitch` Android'de stub, her zaman `failed` döner (ilgisiz, ayrı konu).
- Eski `frontend/harita.html` sayfası düzeltilmedi (kullanılmaması kararlaştırıldı).
