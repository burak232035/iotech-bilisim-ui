const express = require("express");
const TelemetryService = require("../services/telemetry.service");

const router = express.Router();

// GET telemetry for a session
router.get("/session/:sessionId", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const telemetry = await TelemetryService.getBySession(req.params.sessionId, limit);
    res.json(telemetry);
  } catch (err) {
    console.error("Error fetching telemetry:", err);
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});

// GET latest telemetry for a session
router.get("/session/:sessionId/latest", async (req, res) => {
  try {
    const telemetry = await TelemetryService.getLatest(req.params.sessionId);
    if (!telemetry) {
      return res.status(404).json({ error: "No telemetry found for this session" });
    }
    res.json(telemetry);
  } catch (err) {
    console.error("Error fetching latest telemetry:", err);
    res.status(500).json({ error: "Failed to fetch latest telemetry" });
  }
});

module.exports = router;
