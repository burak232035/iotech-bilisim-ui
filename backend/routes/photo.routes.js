const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PhotoModel = require("../models/photo.model");
const FlightSessionModel = require("../models/flightSession.model");
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
 * multipart/form-data: file + sessionId, areaId?, lat, lon, altitude?, heading?, capturedAt?, droneId?
 * droneId is optional (the session already belongs to one drone); a mismatch is only logged.
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file zorunludur" });

    const { sessionId, areaId, lat, lon, altitude, heading, capturedAt, droneId } = req.body;
    if (!sessionId || lat === undefined || lon === undefined) {
      return res.status(400).json({ error: "sessionId, lat, lon zorunludur" });
    }

    const session = await FlightSessionModel.getById(Number(sessionId));
    const resolvedDroneId = session?.drone_id || droneId || null;
    if (droneId && session?.drone_id && droneId !== session.drone_id) {
      console.warn(`⚠️  Foto yükleme: droneId "${droneId}" ≠ oturum ${sessionId} (${session.drone_id})`);
    }

    const photo = await PhotoModel.create({
      sessionId: Number(sessionId),
      droneId: resolvedDroneId,
      areaId: areaId ? Number(areaId) : null,
      filePath: req.file.path,
      lat: Number(lat),
      lon: Number(lon),
      altitude: altitude !== undefined ? Number(altitude) : null,
      heading: heading !== undefined ? Number(heading) : null,
      capturedAt: capturedAt ? new Date(Number(capturedAt)) : null
    });

    console.log(`📸 Foto yüklendi: session=${sessionId}, drone=${resolvedDroneId ?? "?"}, id=${photo.id}`);
    res.status(201).json(photo);
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
