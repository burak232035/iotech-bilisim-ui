"""
Green/concrete land-cover segmentation service.

Single-purpose FastAPI service, sibling to waste-detection-service (same
"single trained model, single endpoint" philosophy — see that service's
app.py docstring): receives a photo, runs a trained YOLOv8-seg model, and
returns what percentage of the photo's pixels are vegetation ("yesil")
vs. concrete/paved surface ("beton"). Runs on 127.0.0.1 only — the Node
backend is the only caller, never exposed publicly.

Percentages are computed per-class independently (pixels covered by any
instance mask of that class, OR'd together to avoid double-counting
overlapping instances of the SAME class). Green and concrete masks are
NOT mutually exclusive by construction — if the model's masks for the two
classes overlap, green_pct + concrete_pct can exceed 100. This is
reported as-is; the frontend renders them as two independent bars, not a
pie chart, so this is not a bug.

Training is out of scope here. Drop a trained weights file at MODEL_PATH
(default: model/best.pt) and restart the service; until then /health
reports ready=false and /segment returns 503 instead of crashing.
"""

import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from class_map import to_landcover

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("green-concrete-service")

MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join("model", "best.pt"))
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.35"))

app = FastAPI(title="Green/Concrete Segmentation Service")

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


@app.post("/segment")
async def segment(file: UploadFile = File(...)):
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
    total_pixels = width * height

    # retina_masks=True upsamples masks to the original image resolution
    # (instead of the model's lower-res mask-prototype grid) so pixel
    # counts here are directly comparable to width*height.
    results = _model.predict(image, conf=CONFIDENCE_THRESHOLD, retina_masks=True, verbose=False)
    result = results[0]

    combined_masks = {"yesil": None, "beton": None}

    if result.masks is not None and result.boxes is not None:
        names = result.names
        for i, mask in enumerate(result.masks.data):
            raw_class = names[int(result.boxes.cls[i])]
            landcover = to_landcover(raw_class)
            if landcover is None:
                continue

            mask_np = mask.cpu().numpy() > 0.5
            if combined_masks[landcover] is None:
                combined_masks[landcover] = mask_np
            else:
                combined_masks[landcover] |= mask_np

    green_px = int(combined_masks["yesil"].sum()) if combined_masks["yesil"] is not None else 0
    concrete_px = int(combined_masks["beton"].sum()) if combined_masks["beton"] is not None else 0

    green_pct = round(green_px / total_pixels * 100, 2) if total_pixels else 0.0
    concrete_pct = round(concrete_px / total_pixels * 100, 2) if total_pixels else 0.0
    other_pct = round(max(0.0, 100.0 - green_pct - concrete_pct), 2)

    return JSONResponse({
        "green_pct": green_pct,
        "concrete_pct": concrete_pct,
        "other_pct": other_pct,
        "width": width,
        "height": height,
    })
