const express = require("express");
const pool = require("../config/database");
const WaypointPlannerService = require("../services/waypointPlanner.service");
const ScanRouteModel = require("../models/scanRoute.model");
const ObstacleModel  = require("../models/obstacle.model");
const { getIO, getDroneClients, getLastKnownPosition } = require("../socket.io");

const router = express.Router();

/**
 * POST /api/mission/plan
 * Compute boustrophedon scan waypoints for an area and optionally persist the route.
 *
 * Body: { areaId, altitudeM?, overlapPercent?, frontOverlapPercent?, speedMs?, saveRoute?, homeLat?, homeLon? }
 *
 * homeLat/homeLon (optional): drone's current/takeoff position. If omitted, falls back
 * to the last known position reported by the drone (telemetry or drone_photo). Used to
 * orient the route so it starts at whichever end is closest to the drone — it can't be
 * guaranteed the drone is sitting exactly on waypoint 0.
 *
 * overlapPercent (cross-track, strip-to-strip) and frontOverlapPercent (along-track,
 * within-strip) both default to real photogrammetric-stitching values (65% / 75%) —
 * needed for the orthomosaic pipeline to find matching features between neighbouring
 * photos. Lower them toward 0 only if you just want individually-georeferenced tiles.
 */
router.post("/plan", async (req, res) => {
  try {
    const {
      areaId,
      altitudeM           = 50,
      overlapPercent      = 65,
      frontOverlapPercent = 75,
      speedMs             = 8,
      saveRoute           = true,
      homeLat             = null,
      homeLon             = null
    } = req.body;

    if (!areaId) {
      return res.status(400).json({ error: "areaId zorunludur" });
    }

    // Load area polygon
    const areaRes = await pool.query("SELECT * FROM areas WHERE id = $1", [areaId]);
    const area = areaRes.rows[0];
    if (!area) return res.status(404).json({ error: "Alan bulunamadı" });

    const polygonPoints = area.coordinates.points; // [[lat,lon],…]

    // Load persisted obstacles for this area
    const obstacles = await ObstacleModel.getByAreaId(areaId);

    // Resolve home position: explicit body value wins, else last known drone fix
    const lastPos = getLastKnownPosition();
    const resolvedHomeLat = homeLat != null ? Number(homeLat) : (lastPos ? lastPos.lat : null);
    const resolvedHomeLon = homeLon != null ? Number(homeLon) : (lastPos ? lastPos.lon : null);

    // Run planner
    const result = WaypointPlannerService.generateScanRoute(
      polygonPoints,
      obstacles,
      {
        altitudeM:           Number(altitudeM),
        overlapPercent:      Number(overlapPercent),
        frontOverlapPercent: Number(frontOverlapPercent),
        speedMs:             Number(speedMs),
        homeLat:             resolvedHomeLat,
        homeLon:             resolvedHomeLon
      }
    );

    // Persist to scan_routes table
    let savedRouteId = null;
    if (saveRoute) {
      const saved = await ScanRouteModel.save({
        areaId,
        waypoints:      result.waypoints,
        obstacles:      obstacles.map(o => ({ lat: o.lat, lon: o.lon, radiusM: o.radius_m })),
        scanWidthM:     result.stripSpacingM,
        altitudeM:      Number(altitudeM),
        totalDistanceM: result.totalDistanceM,
        waypointCount:  result.waypointCount
      });
      savedRouteId = saved.id;
    }

    console.log(
      `✅ Mission planned: alan=${areaId} "${area.name}", ` +
      `${result.waypointCount} WP, ${result.totalDistanceM} m, ` +
      `${result.sweepAngleDeg}° sweep, ${result.stripSpacingM} m şerit` +
      (result.homeDistanceM != null ? `, home→WP0 ${result.homeDistanceM} m` : ", home konumu bilinmiyor")
    );
    if (result.homeDistanceM != null && result.homeDistanceM > 450) {
      console.warn(
        `⚠️  İlk waypoint home'dan ${result.homeDistanceM} m uzakta — Android'in 500m güvenlik ` +
        `limitine yakın/üstünde, görev reddedilebilir.`
      );
    }

    res.json({ ...result, areaId, areaName: area.name, savedRouteId });

  } catch (err) {
    console.error("Mission plan error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mission/start
 * Emit a drone_command(waypoint_mission) event to every connected drone client.
 *
 * Body: { waypoints, areaId?, areaName?, altitudeM?, speedMs?, savedRouteId? }
 */
router.post("/start", (req, res) => {
  try {
    const {
      waypoints,
      areaId,
      areaName,
      altitudeM    = 50,
      speedMs      = 8,
      savedRouteId = null
    } = req.body;

    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return res.status(400).json({ error: "waypoints[] zorunludur" });
    }

    const io = getIO();
    if (!io) return res.status(503).json({ error: "Socket.IO henüz başlatılmadı" });

    const droneClients = getDroneClients();
    if (!droneClients || droneClients.size === 0) {
      return res.status(503).json({ error: "Bağlı drone yok – Android uygulaması bağlanmamış" });
    }

    const command = {
      command: "waypoint_mission",
      mission: {
        areaId,
        areaName,
        altitude:     Number(altitudeM),
        speed:        Number(speedMs),
        finishAction: "go_home",      // drone returns home after completion
        headingMode:  "auto",         // heading follows flight path
        waypoints: waypoints.map((wp, i) => ({
          index:    i,
          lat:      wp.lat,
          lon:      wp.lon,
          altitude: wp.altitude ?? Number(altitudeM),
          speed:    wp.speed    ?? Number(speedMs),
          actions:  wp.actions  ?? ["shoot_photo"]
        }))
      },
      savedRouteId,
      timestamp: Date.now()
    };

    droneClients.forEach(clientId => {
      io.to(clientId).emit("drone_command", command);
    });

    console.log(
      `🚁 Waypoint mission gönderildi: ${droneClients.size} drone, ${waypoints.length} WP`
    );

    res.json({
      message:      `Görev ${droneClients.size} drone'a gönderildi`,
      waypointCount: waypoints.length,
      droneCount:    droneClients.size
    });

  } catch (err) {
    console.error("Mission start error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mission/stop
 * Send a stop/RTH command to all connected drones.
 */
router.post("/stop", (req, res) => {
  const io = getIO();
  if (!io) return res.status(503).json({ error: "Socket.IO başlatılmamış" });

  const droneClients = getDroneClients();
  if (!droneClients || droneClients.size === 0) {
    return res.status(503).json({ error: "Bağlı drone yok" });
  }

  const command = { command: "stop_mission", timestamp: Date.now() };
  droneClients.forEach(id => io.to(id).emit("drone_command", command));

  console.log(`🛑 stop_mission gönderildi: ${droneClients.size} drone`);
  res.json({ message: "Görev durdurma komutu gönderildi", droneCount: droneClients.size });
});

/**
 * GET /api/mission/status
 * Returns connected drone count and socket readiness.
 */
router.get("/status", (req, res) => {
  const droneClients = getDroneClients();
  res.json({
    socketReady:     !!getIO(),
    connectedDrones: droneClients ? droneClients.size : 0
  });
});

module.exports = router;
