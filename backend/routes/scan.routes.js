const express = require("express");
const ScanRouteModel = require("../models/scanRoute.model");
const ObstacleModel  = require("../models/obstacle.model");

const router = express.Router();

// ---- SCAN ROUTES ----

// GET latest saved route for an area
router.get("/route/:areaId", async (req, res) => {
  try {
    const route = await ScanRouteModel.getLatestByAreaId(req.params.areaId);
    if (!route) return res.status(404).json({ error: "No route found for this area" });
    res.json(route);
  } catch (err) {
    console.error("Error fetching scan route:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET all saved routes for an area (metadata only)
router.get("/routes/:areaId", async (req, res) => {
  try {
    const routes = await ScanRouteModel.getAllByAreaId(req.params.areaId);
    res.json(routes);
  } catch (err) {
    console.error("Error fetching scan routes:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST save a new route
router.post("/route", async (req, res) => {
  try {
    const { areaId, waypoints, obstacles, scanWidthM, altitudeM, totalDistanceM, waypointCount } = req.body;
    if (!areaId || !waypoints || !Array.isArray(waypoints)) {
      return res.status(400).json({ error: "areaId and waypoints[] required" });
    }
    const route = await ScanRouteModel.save({ areaId, waypoints, obstacles, scanWidthM, altitudeM, totalDistanceM, waypointCount });
    console.log(`✅ Scan route saved: area ${areaId}, ${waypoints.length} waypoints`);
    res.status(201).json(route);
  } catch (err) {
    console.error("Error saving scan route:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a route
router.delete("/route/:id", async (req, res) => {
  try {
    const route = await ScanRouteModel.delete(req.params.id);
    if (!route) return res.status(404).json({ error: "Route not found" });
    res.json({ message: "Deleted", route });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- OBSTACLES ----

// GET obstacles for an area
router.get("/obstacles/:areaId", async (req, res) => {
  try {
    const obstacles = await ObstacleModel.getByAreaId(req.params.areaId);
    res.json(obstacles);
  } catch (err) {
    console.error("Error fetching obstacles:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST add a new obstacle
router.post("/obstacles", async (req, res) => {
  try {
    const { areaId, lat, lon, radiusM, obstacleType, sessionId } = req.body;
    if (!areaId || lat == null || lon == null) {
      return res.status(400).json({ error: "areaId, lat, lon required" });
    }
    const obstacle = await ObstacleModel.create({ areaId, lat, lon, radiusM, obstacleType, sessionId });
    console.log(`✅ Obstacle saved: area ${areaId} at (${lat}, ${lon})`);
    res.status(201).json(obstacle);
  } catch (err) {
    console.error("Error saving obstacle:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE an obstacle
router.delete("/obstacles/:id", async (req, res) => {
  try {
    const obs = await ObstacleModel.delete(req.params.id);
    if (!obs) return res.status(404).json({ error: "Obstacle not found" });
    res.json({ message: "Deleted", obstacle: obs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
