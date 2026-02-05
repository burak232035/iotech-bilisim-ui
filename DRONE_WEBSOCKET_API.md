# Drone WebSocket API - Sunucu Tarafı Entegrasyon Kılavuzu

Bu dokümantasyon, drone uygulamasından gerçek zamanlı telemetri verilerini almak için WebSocket sunucusu kurulumunu açıklar.

## Genel Bakış

Drone uygulaması, **Socket.IO** protokolü kullanarak WebSocket üzerinden gerçek zamanlı telemetri verisi gönderir. Sunucunuz bu verileri alabilir ve talep üzerine belirli verileri sorgulayabilir.

## Sunucu Yapılandırması

### URL ve Port
Varsayılan sunucu adresi: `http://192.168.1.105:3000`

**Not:** MainActivity.kt dosyasında `serverUrl` değişkenini değiştirerek sunucu adresini özelleştirebilirsiniz (42. satır).

```kotlin
private val serverUrl = "http://192.168.1.105:3000"
```

## Veri Akışı Mimarisi

### 1. Otomatik Telemetri Yayını (10 Hz)
Drone uygulaması, her 100ms'de bir (10 Hz) otomatik olarak telemetri verisi gönderir.

**Event:** `drone_telemetry`

**Veri Formatı:**
```json
{
  "battery": 85,
  "gimbal": {
    "pitch": -45.5,
    "roll": 0.2,
    "yaw": 180.0
  },
  "altitude": {
    "agl": 50.5,
    "amsl": 150.2
  },
  "gps": {
    "signalLevel": "STRONG",
    "satelliteCount": 15
  },
  "timestamp": 1704451200000
}
```

### 2. Talep Üzerine Veri Sorgulama
Sunucunuz, belirli verileri talep edebilir ve drone uygulaması bu isteklere cevap verir.

**İstek Event:** `data_request`

**İstek Formatı:**
```json
{
  "type": "battery"  // veya "gimbal", "altitude", "gps", "all"
}
```

**Cevap Event:** `data_response`

**Cevap Formatı:**
```json
{
  "type": "battery",
  "data": {
    "battery": 85
  },
  "timestamp": 1704451200000
}
```

## Desteklenen Veri Tipleri

### 1. Battery (Batarya)
```json
{
  "type": "battery",
  "data": {
    "battery": 85
  }
}
```
- **battery**: Batarya yüzdesi (0-100)

### 2. Gimbal (Kamera Açıları)
```json
{
  "type": "gimbal",
  "data": {
    "gimbal": {
      "pitch": -45.5,
      "roll": 0.2,
      "yaw": 180.0
    }
  }
}
```
- **pitch**: Kamera yukarı/aşağı açısı (derece, -90 ile +30 arası)
- **roll**: Kamera yan yatış açısı (derece)
- **yaw**: Kamera sağa/sola dönüş açısı (derece, 0-360)

### 3. Altitude (Yükseklik)
```json
{
  "type": "altitude",
  "data": {
    "altitude": {
      "agl": 50.5,
      "amsl": 150.2
    }
  }
}
```
- **agl**: Above Ground Level - Yerden yükseklik (metre)
- **amsl**: Above Mean Sea Level - Deniz seviyesinden yükseklik (metre)

### 4. GPS
```json
{
  "type": "gps",
  "data": {
    "gps": {
      "signalLevel": "STRONG",
      "satelliteCount": 15
    }
  }
}
```
- **signalLevel**: GPS sinyal kalitesi ("WEAK", "MEDIUM", "STRONG")
- **satelliteCount**: Bağlı uydu sayısı (0-20+)

### 5. All (Tüm Veriler)
```json
{
  "type": "all",
  "data": {
    "battery": 85,
    "gimbal": {
      "pitch": -45.5,
      "roll": 0.2,
      "yaw": 180.0
    },
    "altitude": {
      "agl": 50.5,
      "amsl": 150.2
    },
    "gps": {
      "signalLevel": "STRONG",
      "satelliteCount": 15
    },
    "timestamp": 1704451200000
  }
}
```

## Sunucu Implementasyonu Örnekleri

### Node.js (Socket.IO)

```javascript
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Bağlantı kuruldu
io.on('connection', (socket) => {
  console.log('✅ Drone bağlandı:', socket.id);

  // Otomatik telemetri verisi (10 Hz)
  socket.on('drone_telemetry', (data) => {
    console.log('📊 Telemetri:', data);

    // Veritabanına kaydet, dashboard'a gönder, vb.
    // saveTelemetry(data);
    // broadcastToClients(data);
  });

  // Veri cevabı (talep edilen veri)
  socket.on('data_response', (response) => {
    console.log('📥 Veri cevabı:', response.type, response.data);
  });

  // Bağlantı koptu
  socket.on('disconnect', () => {
    console.log('❌ Drone bağlantısı kesildi:', socket.id);
  });
});

// Veri talep etme fonksiyonu (örnek)
function requestDroneData(socket, dataType) {
  socket.emit('data_request', { type: dataType });
}

// Örnek: 5 saniyede bir batarya sorgusu
setInterval(() => {
  io.emit('data_request', { type: 'battery' });
}, 5000);

server.listen(3000, () => {
  console.log('🚀 Sunucu başlatıldı: http://0.0.0.0:3000');
});
```

### Python (python-socketio)

```python
import socketio
import eventlet

sio = socketio.Server(cors_allowed_origins='*')
app = socketio.WSGIApp(sio)

@sio.event
def connect(sid, environ):
    print(f'✅ Drone bağlandı: {sid}')

@sio.event
def disconnect(sid):
    print(f'❌ Drone bağlantısı kesildi: {sid}')

@sio.event
def drone_telemetry(sid, data):
    print(f'📊 Telemetri: {data}')
    # Veritabanına kaydet, dashboard'a gönder, vb.

@sio.event
def data_response(sid, response):
    print(f'📥 Veri cevabı: {response["type"]} - {response["data"]}')

# Veri talep etme fonksiyonu
def request_drone_data(data_type):
    sio.emit('data_request', {'type': data_type})

if __name__ == '__main__':
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', 3000)), app)
```

## Bağlantı Özellikleri

### Otomatik Yeniden Bağlanma
Drone uygulaması, bağlantı kopması durumunda otomatik olarak yeniden bağlanır:
- **Yeniden bağlanma denemesi:** Sınırsız
- **Deneme aralığı:** 2 saniye
- **Bağlantı timeout:** 10 saniye

### Veri Gönderim Hızı
- **Telemetri frekansı:** 10 Hz (100ms aralıklarla)
- **UI güncelleme:** 10 Hz throttling uygulanmış

## Test ve Debug

### WebSocket Bağlantı Testi
1. Sunucunuzu başlatın
2. Drone uygulamasını çalıştırın
3. Sunucu loglarında şu mesajları göreceksiniz:
   - `✅ Drone bağlandı: [socket_id]`
   - `📊 Telemetri: {...}` (her 100ms'de bir)

### Veri Talep Testi
Sunucunuzdan şu komutu göndererek test edebilirsiniz:
```javascript
socket.emit('data_request', { type: 'all' });
```

Cevap olarak `data_response` eventi alacaksınız.

## Güvenlik Notları

1. **Yerel Ağ:** Şu anda sunucu yerel ağda çalışıyor (192.168.x.x)
2. **CORS:** Gerekirse CORS ayarlarını yapılandırın
3. **Kimlik Doğrulama:** Üretim ortamında token tabanlı kimlik doğrulama ekleyin
4. **SSL/TLS:** Üretim ortamında WSS (WebSocket Secure) kullanın

## Sorun Giderme

### Bağlantı Kurulamıyor
1. Sunucu IP adresini kontrol edin (MainActivity.kt:42)
2. Firewall ayarlarını kontrol edin
3. Drone ve sunucu aynı ağda olmalı

### Veri Gelmiyor
1. Drone SDK'nın başarıyla başlatıldığından emin olun
2. Drone'un bağlı olduğunu kontrol edin
3. Sunucu loglarını inceleyin

### Yavaş Veri Akışı
1. Ağ gecikmesini kontrol edin
2. 10 Hz throttling doğru çalışıyor mu kontrol edin

## İletişim ve Destek

Herhangi bir sorun veya soru için projeyi geliştiren ekiple iletişime geçin.

---

**Son Güncelleme:** 2026-01-05
**API Versiyonu:** 1.0
**Socket.IO Versiyonu:** 2.x+
