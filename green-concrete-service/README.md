# Green/Concrete Segmentation Service

Küçük bir FastAPI servisi: bir fotoğraf alır, eğitilmiş YOLOv8-**seg**
modeliyle piksel bazlı arazi kaplama segmentasyonu yapar, fotoğrafın
yüzde kaçının bitki örtüsü (`yesil`) ve yüzde kaçının beton/sert zemin
(`beton`) olduğunu döner. Sadece Node backend'den çağrılır
(`127.0.0.1:8001`), dışa açılmaz.

`waste-detection-service` ile aynı iskelet ve felsefeyi paylaşır (tek
model, tek endpoint, model yoksa çökmez) — ayrı bir süreç/port olarak
çalışır çünkü farklı bir model tipi (segmentasyon, tespit değil) kullanır.

**Model eğitimi bu servisin kapsamında değil.** `train_green_concrete_colab.ipynb`
notebook'unu Google Colab'da çalıştırıp çıkan `best.pt` dosyasını
`model/best.pt` konumuna koyup servisi başlatmanız yeterli. Etiketli veri
seti Drive'da `Benimle Paylaşılanlar / Drone-proje / dataset /
goruntuler_yesil-beton` konumunda (Roboflow export — `data.yaml` +
`train/`, `valid/`, `test/`) — `dataset` klasörü `Drive'ım` köküne
kısayol olarak eklendiyse notebook `data.yaml`'ı otomatik bulur.

## Kurulum

```bash
cd green-concrete-service
python -m venv .venv
.venv\Scripts\activate        # Windows

pip install -r requirements.txt
```

GPU (CUDA) kullanmak için `ultralytics`'in kurduğu varsayılan `torch`
yerine CUDA destekli sürümü kurun, bkz. https://pytorch.org/get-started/locally/

## Model

Eğitilmiş ağırlığı şuraya koyun:

```
green-concrete-service/model/best.pt
```

Model dosyası yoksa servis çöküp durmaz — `/health` `ready:false` döner,
`/segment` çağrıları `503` ile net bir hata mesajı verir.

## Çalıştırma

Waste-detection-service ile aynı anda çalışacağı için **farklı bir port**
kullanır:

```bash
uvicorn app:app --host 127.0.0.1 --port 8001
```

## Endpoint'ler

- `GET /health` → `{ "ready": bool, "model_path": str, "error": str|null }`
- `POST /segment` (multipart, alan adı `file`) →
  `{ "green_pct": number, "concrete_pct": number, "other_pct": number, "width": int, "height": int }`

  Yüzdeler her sınıf için bağımsız hesaplanır (aynı sınıfın çakışan
  instance maskeleri OR'lanır, ama `yesil` ve `beton` maskeleri
  birbiriyle çakışabilir) — bu yüzden `green_pct + concrete_pct` her
  zaman 100'ü tutturmayabilir. `other_pct`, kalan (ne yeşil ne beton
  sayılan) alanı temsil eder.
