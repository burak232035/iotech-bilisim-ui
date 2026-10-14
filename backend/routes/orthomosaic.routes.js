const express = require("express");
const pool = require("../config/database");
const OrthomosaicModel = require("../models/orthomosaic.model");
const OrthomosaicService = require("../services/orthomosaic.service");
const PhotoModel = require("../models/photo.model");
const FlightSessionModel = require("../models/flightSession.model");

const router = express.Router();

/**
 * POST /api/orthomosaic/sessions/:id/generate
 * Kicks off ODM stitching for a session's uploaded full-res photos.
 * Same "create row immediately, process in background" pattern as
 * photo.routes.js's classify job.
 */
router.post("/sessions/:id/generate", async (req, res) => {
  const sessionId = Number(req.params.id);

  try {
    const photos = await PhotoModel.getBySession(sessionId);
    if (photos.length < 3) {
      const session = await FlightSessionModel.getById(sessionId);
      const who = session?.drone_id ? `${session.drone_id}, ` : "";
      return res.status(400).json({
        error: `Ortomozaik için en az 3 tam çözünürlüklü fotoğraf gerekli; ${who}oturum ${sessionId} için ` +
               `sunucuya ${photos.length} fotoğraf yüklenmiş. Haritadaki önizlemeler sayılmaz — ` +
               `Android'in iniş sonrası fotoğraf yüklemesi tamamlandı mı?`
      });
    }

    const areaId = req.body?.areaId || null;
    const row = await OrthomosaicModel.create({ sessionId, areaId, photoCount: photos.length });

    res.status(201).json({ orthomosaicId: row.id, status: "processing" });
    console.log(`🧵 Ortomozaik job başlatıldı: id=${row.id}, session=${sessionId}, ${photos.length} foto`);

    // Arka planda çalışır, hata olursa DB satırı status='error' olarak güncellenir
    OrthomosaicService.generate(row.id, sessionId);
  } catch (err) {
    console.error("❌ Orthomosaic generate error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orthomosaic/status/:id — poll job status
router.get("/status/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orthomosaics WHERE id = $1", [req.params.id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "Job bulunamadı" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orthomosaic/sessions/:id — latest orthomosaic for a session
router.get("/sessions/:id", async (req, res) => {
  try {
    const row = await OrthomosaicModel.getBySession(req.params.id);
    if (!row) return res.status(404).json({ error: "Bu session için ortomozaik yok" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orthomosaic/areas/:id — all completed orthomosaics for an area
router.get("/areas/:id", async (req, res) => {
  try {
    const rows = await OrthomosaicModel.getByArea(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
