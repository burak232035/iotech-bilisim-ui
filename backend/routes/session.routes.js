const express = require("express");
const FlightSessionModel = require("../models/flightSession.model");

const router = express.Router();

// GET all sessions
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const sessions = await FlightSessionModel.getAll(limit);
    res.json(sessions);
  } catch (err) {
    console.error("Error fetching sessions:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// GET active sessions
router.get("/active", async (req, res) => {
  try {
    const sessions = await FlightSessionModel.getActiveSessions();
    res.json(sessions);
  } catch (err) {
    console.error("Error fetching active sessions:", err);
    res.status(500).json({ error: "Failed to fetch active sessions" });
  }
});

// GET session by ID
router.get("/:id", async (req, res) => {
  try {
    const session = await FlightSessionModel.getById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  } catch (err) {
    console.error("Error fetching session:", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// POST end session
router.post("/end/:id", async (req, res) => {
  try {
    const session = await FlightSessionModel.endSession(req.params.id);
    res.json({ message: "Session ended successfully", session });
  } catch (err) {
    console.error("Error ending session:", err);
    res.status(500).json({ error: "Failed to end session" });
  }
});

module.exports = router;
