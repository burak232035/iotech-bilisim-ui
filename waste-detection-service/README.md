# Waste Detection Service

Küçük bir FastAPI servisi: bir fotoğraf alır, eğitilmiş YOLO modeliyle
çöp tespiti yapar, sonuçları 6 rapor kategorisine (`kağıt`, `cam`,
`plastik`, `metal`, `geri dönüştürülemez`, `organik`) eşlenmiş olarak
döner. Sadece Node backend'den çağrılır (`127.0.0.1:8000`), dışa açılmaz.

**Model eğitimi bu servisin kapsamında değil.** `train_waste_detection_colab.ipynb`
notebook'unu Google Colab'da (Drive'daki etiketli veri setinizle) çalıştırıp
çıkan `best.pt` dosyasını `model/best.pt` konumuna koyup servisi başlatmanız
yeterli.

## Kurulum

```bash
cd waste-detection-service
python -m venv .venv
.venv\Scripts\activate        # Windows

pip install -r requirements.txt
```

GPU (CUDA) kullanmak için `ultralytics`'in kurduğu varsayılan `torch`
yerine CUDA destekli sürümü kurun (CUDA sürümünüze göre komut değişir,
bkz. https://pytorch.org/get-started/locally/), örnek:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

## Model

Eğitilmiş ağırlığı şuraya koyun:

```
waste-detection-service/model/best.pt
```

Model dosyası yoksa servis çöküp durmaz — `/health` `ready:false` döner,
`/detect` çağrıları `503` ile net bir hata mesajı verir.

Eğitim için `train_waste_detection_colab.ipynb`'ı kullanın. Etiketli veri
seti Drive'da `Benimle Paylaşılanlar / Drone-proje / dataset /
goruntuler_veriseti` konumunda (`data.yaml` + `train/`, `valid/`, `test/`)
— `dataset` klasörü `Drive'ım` köküne kısayol olarak eklendiyse notebook
`data.yaml`'ı otomatik bulur. Ham sınıf adları ne olursa olsun
`class_map.py` bunları 6 kategoriye eşliyor.

## Çalıştırma

```bash
uvicorn app:app --host 127.0.0.1 --port 8000
```

## Endpoint'ler

- `GET /health` → `{ "ready": bool, "model_path": str, "error": str|null }`
- `POST /detect` (multipart, alan adı `file`) →
  `{ "detections": [{ "class_raw", "category", "confidence", "bbox_norm": [x1,y1,x2,y2] }] }`
  (`bbox_norm` 0-1 arası normalize koordinat, sol-üst → sağ-alt)
