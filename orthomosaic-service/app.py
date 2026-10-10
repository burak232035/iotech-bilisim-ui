"""
Orthomosaic stitching service (FastAPI, Docker-free).

Called only by the Node backend on 127.0.0.1:8002. The backend passes the
absolute paths of a session's uploaded photos (same machine) plus where to
write the PNG; this service stitches them (see stitcher.py) and returns the
mosaic's WGS84 bounds.
"""

import logging
import os
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from stitcher import stitch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("orthomosaic-service")

app = FastAPI(title="Orthomosaic Stitching Service")


class PhotoIn(BaseModel):
    path: str
    lat: float
    lon: float
    altitude: Optional[float] = None
    heading: Optional[float] = None


class StitchRequest(BaseModel):
    photos: List[PhotoIn]
    outputPath: str


@app.get("/health")
def health():
    return {"status": "ok", "engine": "opencv"}


# Sync endpoint: FastAPI runs it in a worker thread, so the CPU-heavy
# stitching doesn't block the event loop.
@app.post("/stitch")
def stitch_endpoint(req: StitchRequest):
    missing = [p.path for p in req.photos if not os.path.isfile(p.path)]
    if missing:
        raise HTTPException(status_code=422, detail=f"{len(missing)} fotoğraf dosyası bulunamadı (ör. {missing[0]})")

    os.makedirs(os.path.dirname(req.outputPath) or ".", exist_ok=True)
    started = time.time()
    logger.info("Stitching %d photos -> %s", len(req.photos), req.outputPath)
    try:
        result = stitch([p.model_dump() for p in req.photos], req.outputPath)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err))
    except Exception as err:  # noqa: BLE001 — report any OpenCV failure to the backend
        logger.exception("Stitching failed")
        raise HTTPException(status_code=500, detail=f"Birleştirme hatası: {err}")

    result["seconds"] = round(time.time() - started, 1)
    logger.info(
        "Done in %ss: %dx%d px, %d by features / %d by GPS",
        result["seconds"], result["width"], result["height"],
        result["placedByFeatures"], result["placedByGps"],
    )
    return result
