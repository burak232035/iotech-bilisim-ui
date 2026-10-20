const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PhotoModel = require("../models/photo.model");
const FlightSessionModel = require("../models/flightSession.model");
const LivePhotoModel = require("../models/livePhoto.model");
const { livePhotoUrl, saveLivePhoto } = require("../services/livePhoto.service");
const { readDjiXmp } = require("../services/djiMetadata.service");
const { getIO } = require("../socket.io");
const WasteDetectionModel = require("../models/wasteDetection.model");
const WasteDetectionService = require("../services/wasteDetection.service");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "../uploads/photos");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Flat directory, no per-session subfolder: multer's destination/filename
// callbacks fire while the multipart body is still being parsed, so
// req.body.sessionId is only reliably populated if the client sends that
// field BEFORE the file part — not guaranteed (and our own Android upload
// example in ANDROID_AI_PROMPT.md §17 sends "file" first). The DB row's
// session_id column is the actual source of truth for which flight a
// photo belongs to; the filename just needs to be unique.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB / foto
});

/**
 * POST /api/photos/upload
 * Android'in iniş sonrası SD karttaki orijinal fotoğrafı yüklediği endpoint.
 * multipart/form-data: file + sessionId, areaId?, lat?, lon?, altitude?, heading?, capturedAt?, droneId?
 * Position/altitude/heading come from the photo's DJI XMP when present (the
 * form values are a fallback); lat/lon are required only if the photo has none.
 * droneId is optional (the session already belongs to one drone); a mismatch is only logged.
 */
/**
 * GET /api/photos/live?day=17.10&droneId=drone-1&sessionId=11
 * Stored live map previews (drone_photo), oldest first. All filters optional.
 */
router.get("/live", async (req, res) => {
  try {
    const rows = await LivePhotoModel.list({
      day: req.query.day || undefined,
      droneId: req.query.droneId || undefined,
      sessionId: req.query.sessionId ? Number(req.query.sessionId) : undefined
    });
    res.json(rows.map(r => ({ ...r, url: livePhotoUrl(r) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/photos/live/import
 * Body: { photos: [{ imageBase64, lat, lon, altitude?, heading?, timestamp?, droneId?, sessionId? }] }
 * Recovers previews that only exist in an open dashboard page (sent from the
 * browser console). Stored like live ones, under today's day folder.
 */
router.post("/live/import", express.json({ limit: "50mb" }), async (req, res) => {
  const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
  let saved = 0;
  for (const p of photos) {
    if (!p?.imageBase64 || typeof p.lat !== "number" || typeof p.lon !== "number") continue;
    const row = await saveLivePhoto(p, { droneId: p.droneId || null, sessionId: p.sessionId || null });
    if (row) saved += 1;
  }
  console.log(`🗂️  Önizleme içe aktarma: ${saved}/${photos.length} kaydedildi`);
  res.json({ received: photos.length, saved });
});

/** GET /api/photos/live/summary — preview counts per day / drone / session */
router.get("/live/summary", async (req, res) => {
  try {
    res.json(await LivePhotoModel.summary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file zorunludur" });

    const { sessionId, areaId, lat, lon, altitude, heading, capturedAt, droneId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId zorunludur" });
    }

    // What the camera recorded at the shutter moment wins over the app's values:
    // true position, and the real camera yaw for photos taken mid-turn. It also
    // lets lat/lon be omitted (recovering old flights from the SD card).
    const xmp = readDjiXmp(req.file.path);
    const num = (v) => (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    const finalLat = xmp?.lat ?? num(lat);
    const finalLon = xmp?.lon ?? num(lon);
    if (finalLat === null || finalLon === null) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Konum yok: lat/lon gönderilmedi ve fotoğrafta DJI GPS bilgisi bulunamadı" });
    }

    const session = await FlightSessionModel.getById(Number(sessionId));
    const resolvedDroneId = session?.drone_id || droneId || null;
    if (droneId && session?.drone_id && droneId !== session.drone_id) {
      console.warn(`⚠️  Foto yükleme: droneId "${droneId}" ≠ oturum ${sessionId} (${session.drone_id})`);
    }

    const photo = await PhotoModel.create({
      sessionId: Number(sessionId),
      droneId: resolvedDroneId,
      areaId: areaId ? Number(areaId) : (session?.area_id ?? null),
      filePath: req.file.path,
      lat: finalLat,
      lon: finalLon,
      altitude: xmp?.relativeAltitude ?? num(altitude),
      heading: xmp?.gimbalYaw ?? num(heading),
      capturedAt: capturedAt ? new Date(Number(capturedAt)) : null
    });

    console.log(
      `📸 Foto yüklendi: session=${sessionId}, drone=${resolvedDroneId ?? "?"}, id=${photo.id}` +
      (xmp ? ` (DJI XMP: yaw ${xmp.gimbalYaw ?? "?"}°, ${xmp.relativeAltitude ?? "?"} m)` : " (XMP yok)")
    );
    res.status(201).json(photo);

    // Waste scan: detect each photo as it arrives and push the points to the map
    if (session?.purpose === "waste_scan") {
      WasteDetectionService.detectAndStore(photo)
        .then((stored) => {
          console.log(`♻️  Tarama tespiti: foto ${photo.id} → ${stored.length} yeni nokta`);
          getIO()?.emit("waste_detections", {
            sessionId: photo.session_id,
            areaId: photo.area_id,
            droneId: photo.drone_id,
            photoId: photo.id,
            detections: stored
          });
        })
        .catch((err) => console.error(`❌ Tarama tespiti başarısız (foto ${photo.id}):`, err.message));
    }
  } catch (err) {
    console.error("❌ Photo upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Bekleyen classify işleri: jobId -> { status, summary?, error? }
const classifyJobs = new Map();

/**
 * POST /api/photos/sessions/:id/classify
 * O session'ın henüz sınıflanmamış tüm fotoğraflarını YOLO servisine gönderir.
 * report.routes.js'deki pdfJobs deseniyle aynı: anında jobId döner, arka planda işler.
 */
router.post("/sessions/:id/classify", async (req, res) => {
  const sessionId = Number(req.params.id);
  const jobId = `classify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  classifyJobs.set(jobId, { status: "processing" });
  res.json({ jobId, status: "processing" });

  try {
    const summary = await WasteDetectionService.classifySession(sessionId);
    classifyJobs.set(jobId, { status: "done", summary });
    console.log(`✅ Classify job tamam: ${jobId}`, summary);
  } catch (err) {
    console.error("❌ Classify job error:", err.message);
    classifyJobs.set(jobId, { status: "error", error: err.message });
  }

  setTimeout(() => classifyJobs.delete(jobId), 5 * 60 * 1000);
});

// GET /api/photos/classify/status/:jobId
router.get("/classify/status/:jobId", (req, res) => {
  const job = classifyJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job bulunamadı" });
  res.json(job);
});

// GET /api/photos/sessions/:id/detections
router.get("/sessions/:id/detections", async (req, res) => {
  try {
    const detections = await WasteDetectionModel.getBySession(req.params.id);
    res.json(detections);
  } catch (err) {
    console.error("❌ Error fetching session detections:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/photos/areas/:id/detections
router.get("/areas/:id/detections", async (req, res) => {
  try {
    const detections = await WasteDetectionModel.getByArea(req.params.id);
    res.json(detections);
  } catch (err) {
    console.error("❌ Error fetching area detections:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
