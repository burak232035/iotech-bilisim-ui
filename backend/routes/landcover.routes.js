const express = require("express");

const LandcoverAnalysisModel = require("../models/landcoverAnalysis.model");
const LandcoverAnalysisService = require("../services/landcoverAnalysis.service");

const router = express.Router();

// Bekleyen analyze işleri: jobId -> { status, summary?, error? }
// Aynı desen: backend/routes/photo.routes.js'teki classifyJobs
const landcoverJobs = new Map();

/**
 * POST /api/landcover/sessions/:id/analyze
 * O session'ın henüz yeşil/beton analizinden geçmemiş fotoğraflarını
 * segmentasyon servisine gönderir. Anında jobId döner, arka planda işler.
 */
router.post("/sessions/:id/analyze", async (req, res) => {
  const sessionId = Number(req.params.id);
  const jobId = `landcover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  landcoverJobs.set(jobId, { status: "processing" });
  res.json({ jobId, status: "processing" });

  try {
    const summary = await LandcoverAnalysisService.analyzeSession(sessionId);
    landcoverJobs.set(jobId, { status: "done", summary });
    console.log(`✅ Landcover job tamam: ${jobId}`, summary);
  } catch (err) {
    console.error("❌ Landcover job error:", err.message);
    landcoverJobs.set(jobId, { status: "error", error: err.message });
  }

  setTimeout(() => landcoverJobs.delete(jobId), 5 * 60 * 1000);
});

// GET /api/landcover/status/:jobId
router.get("/status/:jobId", (req, res) => {
  const job = landcoverJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job bulunamadı" });
  res.json(job);
});

// GET /api/landcover/sessions/:id — session'ın ortalama yeşil/beton yüzdeleri
router.get("/sessions/:id", async (req, res) => {
  try {
    const average = await LandcoverAnalysisModel.getSessionAverage(req.params.id);
    res.json(average);
  } catch (err) {
    console.error("❌ Error fetching landcover average:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
