"""
Waste detection inference service.

Single-purpose FastAPI service: receives a photo, runs the trained YOLO
model, returns detections mapped to the 6 report categories. Runs on
127.0.0.1 only — the Node backend is the only caller, never exposed
publicly.

Training is out of scope here. Drop a trained weights file at
MODEL_PATH (default: model/best.pt) and restart the service; until then
/health reports ready=false and /detect returns 503 instead of crashing.
"""

import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from class_map import to_category

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("waste-detection-service")

MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join("model", "best.pt"))
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.35"))

app = FastAPI(title="Waste Detection Service")

_model = None
_model_load_error = None


def _try_load_model():
    global _model, _model_load_error
    if not os.path.exists(MODEL_PATH):
        _model_load_error = f"Model dosyası bulunamadı: {MODEL_PATH}"
        logger.warning(_model_load_error)
        return

    try:
        from ultralytics import YOLO
        _model = YOLO(MODEL_PATH)
        logger.info(f"Model yüklendi: {MODEL_PATH}")
    except Exception as e:  # noqa: BLE001 - report any load failure via /health
        _model_load_error = f"Model yüklenemedi: {e}"
        logger.error(_model_load_error)


@app.on_event("startup")
def on_startup():
    _try_load_model()


@app.get("/health")
def health():
    return {
        "ready": _model is not None,
        "model_path": MODEL_PATH,
        "error": _model_load_error,
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail=_model_load_error or "Model henüz yüklenmedi",
        )

    import io

    from PIL import Image

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Görüntü okunamadı: {e}")

    width, height = image.size
    results = _model.predict(image, conf=CONFIDENCE_THRESHOLD, verbose=False)

    detections = []
    for result in results:
        names = result.names
        for box in result.boxes:
            raw_class = names[int(box.cls[0])]
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]

            detections.append({
                "class_raw": raw_class,
                "category": to_category(raw_class),
                "confidence": round(confidence, 4),
                "bbox_norm": [
                    round(x1 / width, 4),
                    round(y1 / height, 4),
                    round(x2 / width, 4),
                    round(y2 / height, 4),
                ],
            })

    return JSONResponse({"detections": detections})
