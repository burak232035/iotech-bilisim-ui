"""
Docker-free orthomosaic stitching for nadir drone photos (DJI Mini 4 Pro).

Each photo is first placed on a local east/north metre grid from its GPS
position, altitude and compass heading (same footprint math as the backend's
geoProjection.service.js: HFOV 82.1°, image top = heading direction). Its
placement is then refined by matching SIFT features against already-placed
neighbours and estimating a similarity transform (rotation + uniform scale +
shift). A feature-based placement that disagrees too much with GPS is
rejected in favour of the GPS one, so a bad match can't fling a photo away.

Photos are warped onto a north-up canvas and feather-blended. The result is
a transparent-background PNG plus its WGS84 bounding box, which Leaflet shows
as a plain imageOverlay.

This is image registration, not full photogrammetry (no 3D reconstruction or
bundle adjustment): fine for small, flat areas; tall structures and large
areas will show parallax and some drift.
"""

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

HFOV_DEG = 82.1
M_PER_DEG_LAT = 111319.9

MAX_DIM = 1400            # longest side photos are downscaled to before matching/warping
MAX_CANVAS = 4000         # longest side of the output mosaic, pixels
RATIO_TEST = 0.75         # Lowe ratio for SIFT matches
MIN_INLIERS = 15
NEIGHBOURS_TO_TRY = 4

# A feature placement is accepted only if it stays this close to the GPS one
MAX_CENTER_OFFSET_M = 15.0
MAX_CENTER_OFFSET_FRAC = 0.35   # …or this fraction of the footprint width, whichever is larger
MAX_SCALE_RATIO = 1.25
MAX_ROTATION_DIFF_DEG = 30.0


@dataclass
class Photo:
    path: str
    lat: float
    lon: float
    altitude: float
    heading: float
    image: np.ndarray = None
    gsd: float = 0.0                  # metres per (downscaled) pixel
    x: float = 0.0                    # GPS centre, metres east of origin
    y: float = 0.0                    # GPS centre, metres north of origin
    gps_affine: np.ndarray = None     # 2x3: pixel -> world (metres)
    affine: np.ndarray = None         # final placement
    keypoints: list = field(default_factory=list)
    descriptors: np.ndarray = None
    method: str = "gps"


def _to3(a):
    return np.vstack([a, [0.0, 0.0, 1.0]])


def _enu(lat, lon, lat0, lon0):
    x = (lon - lon0) * M_PER_DEG_LAT * math.cos(math.radians(lat0))
    y = (lat - lat0) * M_PER_DEG_LAT
    return x, y


def _latlon(x, y, lat0, lon0):
    lat = lat0 + y / M_PER_DEG_LAT
    lon = lon0 + x / (M_PER_DEG_LAT * math.cos(math.radians(lat0)))
    return lat, lon


def _gps_affine(width, height, gsd, cx, cy, heading_deg):
    """Pixel (col,row) -> world (east,north) metres; image up = heading."""
    h = math.radians(heading_deg)
    fwd = (math.sin(h), math.cos(h))
    right = (math.cos(h), -math.sin(h))
    a, b = gsd * right[0], -gsd * fwd[0]
    c, d = gsd * right[1], -gsd * fwd[1]
    tx = cx - a * width / 2 - b * height / 2
    ty = cy - c * width / 2 - d * height / 2
    return np.array([[a, b, tx], [c, d, ty]], dtype=np.float64)


def _center_of(affine, width, height):
    return affine @ np.array([width / 2, height / 2, 1.0])


def _scale_and_angle(affine):
    m = affine[:, :2]
    scale = math.sqrt(abs(np.linalg.det(m)))
    angle = math.degrees(math.atan2(m[1, 0], m[0, 0]))
    return scale, angle


def _load(photo, sift):
    img = cv2.imread(photo.path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Fotoğraf okunamadı: {photo.path}")
    h, w = img.shape[:2]
    s = min(1.0, MAX_DIM / max(h, w))
    if s < 1.0:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    photo.image = img
    h, w = img.shape[:2]
    footprint_w = 2 * max(photo.altitude, 5.0) * math.tan(math.radians(HFOV_DEG / 2))
    photo.gsd = footprint_w / w
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    photo.keypoints, photo.descriptors = sift.detectAndCompute(gray, None)


def _match(src, dst, matcher):
    """Similarity transform mapping src pixels -> dst pixels, or (None, 0)."""
    if src.descriptors is None or dst.descriptors is None:
        return None, 0
    if len(src.keypoints) < MIN_INLIERS or len(dst.keypoints) < MIN_INLIERS:
        return None, 0
    pairs = matcher.knnMatch(src.descriptors, dst.descriptors, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < RATIO_TEST * p[1].distance]
    if len(good) < MIN_INLIERS:
        return None, 0
    pts_src = np.float32([src.keypoints[m.queryIdx].pt for m in good])
    pts_dst = np.float32([dst.keypoints[m.trainIdx].pt for m in good])
    m, inliers = cv2.estimateAffinePartial2D(
        pts_src, pts_dst, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=4000, confidence=0.995
    )
    n = int(inliers.sum()) if inliers is not None else 0
    if m is None or n < MIN_INLIERS:
        return None, 0
    # Same-altitude photos map at ~1:1 pixel scale; anything far off is a degenerate fit
    scale = math.sqrt(abs(np.linalg.det(m[:, :2])))
    if not 0.5 < scale < 2.0:
        return None, 0
    return m.astype(np.float64), n


def _plausible(candidate, photo):
    h, w = photo.image.shape[:2]
    cx, cy = _center_of(candidate, w, h)
    footprint_w = photo.gsd * w
    offset = math.hypot(cx - photo.x, cy - photo.y)
    if offset > max(MAX_CENTER_OFFSET_M, MAX_CENTER_OFFSET_FRAC * footprint_w):
        return False
    scale, angle = _scale_and_angle(candidate)
    gps_scale, gps_angle = _scale_and_angle(photo.gps_affine)
    ratio = scale / gps_scale
    if ratio > MAX_SCALE_RATIO or ratio < 1 / MAX_SCALE_RATIO:
        return False
    diff = abs((angle - gps_angle + 180) % 360 - 180)
    return diff <= MAX_ROTATION_DIFF_DEG


def stitch(photo_dicts, output_path):
    photos = [
        Photo(
            path=p["path"], lat=float(p["lat"]), lon=float(p["lon"]),
            altitude=float(p.get("altitude") or 30.0), heading=float(p.get("heading") or 0.0),
        )
        for p in photo_dicts
    ]
    if len(photos) < 2:
        raise ValueError("Ortomozaik için en az 2 fotoğraf gerekli")

    lat0 = sum(p.lat for p in photos) / len(photos)
    lon0 = sum(p.lon for p in photos) / len(photos)

    sift = cv2.SIFT_create(nfeatures=4000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    for p in photos:
        _load(p, sift)
        p.x, p.y = _enu(p.lat, p.lon, lat0, lon0)
        h, w = p.image.shape[:2]
        p.gps_affine = _gps_affine(w, h, p.gsd, p.x, p.y, p.heading)

    # Place outward from the photo nearest the centre, always attaching the
    # unplaced photo closest to anything already placed.
    ref = min(photos, key=lambda p: math.hypot(p.x, p.y))
    ref.affine = ref.gps_affine
    placed, unplaced = [ref], [p for p in photos if p is not ref]

    while unplaced:
        def nearest_dist(p):
            return min(math.hypot(p.x - q.x, p.y - q.y) for q in placed)

        photo = min(unplaced, key=nearest_dist)
        unplaced.remove(photo)
        h, w = photo.image.shape[:2]
        reach = 1.2 * max(w, h) * photo.gsd
        neighbours = sorted(
            (q for q in placed if math.hypot(photo.x - q.x, photo.y - q.y) < reach),
            key=lambda q: math.hypot(photo.x - q.x, photo.y - q.y),
        )[:NEIGHBOURS_TO_TRY]

        best, best_inliers = None, 0
        for q in neighbours:
            m, n = _match(photo, q, matcher)
            if m is None or n <= best_inliers:
                continue
            candidate = (_to3(q.affine) @ _to3(m))[:2]
            if _plausible(candidate, photo):
                best, best_inliers = candidate, n

        if best is not None:
            photo.affine, photo.method = best, "features"
        else:
            photo.affine, photo.method = photo.gps_affine, "gps"
        placed.append(photo)

    # North-up canvas covering every warped photo
    corners = []
    for p in photos:
        h, w = p.image.shape[:2]
        for c in ((0, 0), (w, 0), (0, h), (w, h)):
            corners.append(p.affine @ np.array([c[0], c[1], 1.0]))
    corners = np.array(corners)
    min_x, min_y = corners.min(axis=0)
    max_x, max_y = corners.max(axis=0)
    res = max(min(p.gsd for p in photos), max(max_x - min_x, max_y - min_y) / MAX_CANVAS)
    cw = int(math.ceil((max_x - min_x) / res))
    ch = int(math.ceil((max_y - min_y) / res))
    world_to_canvas = np.array([[1 / res, 0, -min_x / res], [0, -1 / res, max_y / res], [0, 0, 1]])

    acc = np.zeros((ch, cw, 3), np.float32)
    weight = np.zeros((ch, cw), np.float32)
    for p in photos:
        h, w = p.image.shape[:2]
        t = (world_to_canvas @ _to3(p.affine))[:2]

        # Warp only into the photo's own bounding box on the canvas
        pts = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], np.float64).T
        cc = t @ pts
        x0, y0 = max(int(cc[0].min()) - 1, 0), max(int(cc[1].min()) - 1, 0)
        x1, y1 = min(int(cc[0].max()) + 2, cw), min(int(cc[1].max()) + 2, ch)
        if x1 <= x0 or y1 <= y0:
            continue
        t_roi = t.copy()
        t_roi[0, 2] -= x0
        t_roi[1, 2] -= y0
        size = (x1 - x0, y1 - y0)

        # Feather weight: highest in the photo centre, zero at its edges
        mask = np.zeros((h, w), np.uint8)
        mask[1:-1, 1:-1] = 255
        feather = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        feather /= max(float(feather.max()), 1e-6)

        warped = cv2.warpAffine(p.image, t_roi, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        wf = cv2.warpAffine(feather, t_roi, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        acc[y0:y1, x0:x1] += warped.astype(np.float32) * wf[..., None]
        weight[y0:y1, x0:x1] += wf

    covered = weight > 1e-6
    out = np.zeros((ch, cw, 4), np.uint8)
    out[..., :3][covered] = np.clip(acc[covered] / weight[covered][:, None], 0, 255).astype(np.uint8)
    out[..., 3][covered] = 255
    if not cv2.imwrite(output_path, out, [cv2.IMWRITE_PNG_COMPRESSION, 3]):
        raise ValueError(f"Çıktı yazılamadı: {output_path}")

    sw_lat, sw_lon = _latlon(min_x, max_y - ch * res, lat0, lon0)
    ne_lat, ne_lon = _latlon(min_x + cw * res, max_y, lat0, lon0)
    by_features = sum(1 for p in photos if p.method == "features")
    return {
        "bounds": {"swLat": sw_lat, "swLon": sw_lon, "neLat": ne_lat, "neLon": ne_lon},
        "width": cw,
        "height": ch,
        "resolutionM": round(res, 4),
        "photoCount": len(photos),
        "placedByFeatures": by_features,
        "placedByGps": len(photos) - by_features,
    }
