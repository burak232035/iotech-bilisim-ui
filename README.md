# Akıllı Kampüs Drone Sistemi

Fırat Üniversitesi kampüsünde **DJI Mini 4 Pro** drone ile otonom alan taraması
yapan, toplanan görüntülerden çöp tespiti, yeşil alan/beton analizi ve
ortomozaik harita üreten bir sistem.

## Özellikler

- **Canlı takip** — drone telemetrisi (konum, irtifa, batarya, yön) Socket.IO
  üzerinden gerçek zamanlı olarak haritada izlenir.
- **Alan tanımlama** — Leaflet haritası üzerinde poligon çizip tarama alanı
  kaydetme/silme.
- **Waypoint görev planlama** — seçilen alan için boustrophedon (serpantin)
  tarama rotası; home konumuna göre rota yönlendirme, fotogrametri için
  %75 ileri / %65 yan örtüşme.
- **Fotoğraf yükleme** — uçuş sonrası tam çözünürlüklü fotoğraflar backend'e
  yüklenir ve uçuş oturumuna bağlanır.
- **Çöp tespiti (YOLO)** — 6 kategori (kağıt, cam, metal, plastik, geri
  dönüştürülemez, organik); tespitler GPS koordinatına çevrilip haritada
  gösterilir.
- **Yeşil alan / beton analizi (YOLOv8-seg)** — fotoğrafların yüzde kaçının
  bitki örtüsü, yüzde kaçının sert zemin olduğunu hesaplar.
- **Ortomozaik** — fotoğraflar tek bir hava görüntüsünde birleştirilip haritaya
  katman olarak eklenir. Varsayılan motor Docker'sız bir OpenCV servisidir
  (GPS ile yerleştirme + görüntü eşleştirmeyle hizalama); istenirse Docker'daki
  OpenDroneMap kullanılabilir.
- **Çoklu drone** — birden fazla drone aynı anda bağlanır; komutlar ve görevler
  seçili drone'a gider (bkz. `MULTI_DRONE_PROTOCOL.md`).
- **PDF rapor** — uçuş, tespit ve analiz sonuçlarını içeren otomatik rapor.

## Mimari

```
DJI RC (Android köprü uygulaması, DJI MSDK v5)
        │  Socket.IO
        ▼
Backend — Node.js / Express / Socket.IO  (port 3001) ── PostgreSQL (drone_tracking)
        │                     │                    │
        │ HTTP                │ HTTP               │ HTTP
        ▼                     ▼                    ▼
Çöp tespiti servisi    Yeşil/beton servisi    Ortomozaik servisi (OpenCV)
FastAPI (port 8000)    FastAPI (port 8001)    FastAPI (port 8002)
        ▲
        │ REST + Socket.IO
Web Dashboard — React 19 / Vite / Leaflet  (port 3000)
```

| Klasör | İçerik |
| --- | --- |
| `backend/` | Express API, Socket.IO sunucusu, veritabanı şeması, rapor şablonları |
| `drone-frontend-react/` | Web dashboard (React + Vite + Leaflet) |
| `waste-detection-service/` | Çöp tespiti servisi (FastAPI + YOLO) ve Colab eğitim notebook'u |
| `green-concrete-service/` | Yeşil alan/beton segmentasyon servisi (FastAPI + YOLOv8-seg) ve Colab eğitim notebook'u |
| `orthomosaic-service/` | Docker'sız ortomozaik servisi (FastAPI + OpenCV) |
| `frontend/` | Eski düz HTML prototip — **kullanılmıyor** |

Android köprü uygulamasının kodu bu repoda değildir; ona ait spesifikasyonlar
aşağıdaki dokümanlarda yer alır.

## Kurulum

### Gereksinimler

- Node.js 18+
- PostgreSQL
- Python 3.10+ (analiz servisleri için)
- Docker Desktop yalnızca `ORTHOMOSAIC_ENGINE=odm` seçilirse gerekir

### 1. Veritabanı ve backend

```bash
npm install
```

`backend/.env` dosyası oluşturun (değerler verilmezse aşağıdaki varsayılanlar kullanılır):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=drone_tracking
DB_USER=postgres
DB_PASSWORD=postgres
```

Veritabanını ve tabloları oluşturun:

```bash
node backend/setup-database.js
```

Backend'i başlatın (port 3001):

```bash
node backend/app.js
```

### 2. Web dashboard

```bash
cd drone-frontend-react
npm install
npm run dev
```

Dashboard `http://localhost:3000` adresinde açılır. Demo giriş: `admin` / `admin123`.

### 3. Analiz servisleri (isteğe bağlı)

Her iki servis de aynı şekilde kurulur; eğitilmiş model `model/best.pt`
konumuna konmalıdır. Model yoksa servis çökmeden açılır ama analiz yapamaz.
Modeller servis klasörlerindeki Colab notebook'larıyla eğitilir.

```bash
cd waste-detection-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Yeşil/beton servisi için aynı adımları `green-concrete-service` klasöründe
`--port 8001` ile uygulayın. Ayrıntılar her servisin kendi README dosyasında.

### 4. Ortomozaik

Varsayılan motor Docker gerektirmez. Servisi başlatın (Python, OpenCV, FastAPI gerekir):

```bash
pip install -r orthomosaic-service/requirements.txt
python -m uvicorn --app-dir orthomosaic-service app:app --host 127.0.0.1 --port 8002
```

İyi sonuç için görevler **ileri örtüşme %60+** ile uçurulmalı. Gerçek
fotogrametri isteniyorsa `ORTHOMOSAIC_ENGINE=odm` ile Docker'daki OpenDroneMap
kullanılır (Docker Desktop açık olmalı).

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `localhost`, `5432`, `drone_tracking`, `postgres`, `postgres` | PostgreSQL bağlantısı |
| `WASTE_DETECTION_URL` | `http://127.0.0.1:8000` | Çöp tespiti servisi |
| `LANDCOVER_SERVICE_URL` | `http://127.0.0.1:8001` | Yeşil/beton servisi |
| `ORTHOMOSAIC_ENGINE` | `opencv` | `opencv` (Docker'sız servis) veya `odm` (Docker) |
| `ORTHOMOSAIC_SERVICE_URL` | `http://127.0.0.1:8002` | Docker'sız ortomozaik servisi |
| `ODM_DOCKER_IMAGE` | `opendronemap/odm` | `odm` motorunda Docker imajı |

## API özeti

Tam liste için backend çalışırken `http://localhost:3001/` adresine bakın.

| Grup | Örnek uç noktalar |
| --- | --- |
| Fotoğraf / çöp tespiti | `POST /api/photos/upload`, `POST /api/photos/sessions/:id/classify`, `GET /api/photos/sessions/:id/detections` |
| Ortomozaik | `POST /api/orthomosaic/sessions/:id/generate`, `GET /api/orthomosaic/status/:id` |
| Yeşil/beton | `POST /api/landcover/sessions/:id/analyze`, `GET /api/landcover/sessions/:id` |

Alan, oturum, görev, telemetri ve rapor uç noktaları da `backend/routes/` altında yer alır.

## Dokümanlar

- [`ANDROID_AI_PROMPT.md`](ANDROID_AI_PROMPT.md) — Android köprü uygulaması ana spesifikasyonu
- [`ANDROID_MOSAIC_UPDATE.md`](ANDROID_MOSAIC_UPDATE.md) — ortomozaik değişikliklerinin Android'e etkisi
- [`ANDROID_DRONE_COMMAND_GUIDE.md`](ANDROID_DRONE_COMMAND_GUIDE.md) — drone komut rehberi
- [`DRONE_WEBSOCKET_API.md`](DRONE_WEBSOCKET_API.md) — WebSocket olayları
- [`MULTI_DRONE_PROTOCOL.md`](MULTI_DRONE_PROTOCOL.md) — iki drone'u eş zamanlı yönetme protokolü (taslak)
- [`WAYPOINT_TEST_CHECKLIST.md`](WAYPOINT_TEST_CHECKLIST.md) — canlı uçuş test listesi
- [`PROJECT_HANDOFF_PROMPT.md`](PROJECT_HANDOFF_PROMPT.md) — proje durumu ve geçmişi

## Bilinen eksikler

- Android'in iniş sonrası toplu fotoğraf yükleme akışı henüz gerçek uçuşta test edilmedi.
- Ortomozaik görevlerinde waypoint sayısı DJI limitini (~65–99) aşıyor; Android tarafında görev bölme gerekiyor.
- Çöp tespiti ve yeşil/beton modellerinin eğitilmiş ağırlıkları (`best.pt`) repoda yer almıyor.
