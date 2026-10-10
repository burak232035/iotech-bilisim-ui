const express = require("express");
const pool = require("../config/database");
const WaypointPlannerService = require("../services/waypointPlanner.service");
const ScanRouteModel = require("../models/scanRoute.model");
const ObstacleModel  = require("../models/obstacle.model");
const {
  getIO, getDrones, resolveCommandTargets, sendToDrone, prepareMissionStart, getLastKnownPosition
} = require("../socket.io");

const router = express.Router();

// RTH separation — MULTI_DRONE_PROTOCOL.md §6.2
const RTH_MAX_M            = 120;
const RTH_MIN_M            = 20;
const RTH_BASE_OFFSET_M    = 10;  // drone-1: highest mission altitude + 10 m
const RTH_STEP_M           = 15;  // each further drone +15 m (drone-2: +25 m)
const RTH_MIN_SEPARATION_M = 10;
// Takeoff altitude check — §6.1 (to be replaced by the field-measured value)
const HOME_ALT_WARN_DIFF_M = Number(process.env.HOME_ALT_WARN_DIFF_M) || 3;

function droneIndex(droneId) {
  const m = /^drone-(\d+)$/.exec(droneId || "");
  return m ? Math.max(1, Number(m[1])) : 1;
}

/**
 * Compute rthHeight for `entry` given the other drones' active missions, or
 * return an error when separation can't be kept under the 120 m ceiling.
 */
function computeRthHeight(entry, missionMaxAltitude) {
  if (missionMaxAltitude > RTH_MAX_M) {
    return { error: `Görev irtifası ${missionMaxAltitude} m — üst sınır ${RTH_MAX_M} m` };
  }
  const others = getDrones().filter(d => d.droneId !== entry.droneId && d.activeMission);
  const highest = Math.max(missionMaxAltitude, ...others.map(d => d.activeMission.maxAltitude));
  const offset = RTH_BASE_OFFSET_M + RTH_STEP_M * (droneIndex(entry.droneId) - 1);
  const rthHeight = Math.max(RTH_MIN_M, Math.min(RTH_MAX_M, Math.round(highest + offset)));

  const clash = others.find(d => Math.abs(d.activeMission.rthHeight - rthHeight) < RTH_MIN_SEPARATION_M);
  if (clash) {
    return {
      error: `Görev irtifası çok yüksek, RTH ayrımı sağlanamıyor (${entry.droneId} ${rthHeight} m, ` +
             `${clash.droneId} ${clash.activeMission.rthHeight} m); görev irtifasını düşürün`
    };
  }
  return { rthHeight };
}

/** Warn (don't block) when two drones took off from noticeably different heights. */
function homeAltitudeWarning(entry) {
  const others = getDrones().filter(d => d.droneId !== entry.droneId && d.activeMission);
  if (others.length === 0) return null;
  const myAlt = entry.lastTelemetry?.home?.alt;
  if (typeof myAlt !== "number") return "Kalkış rakımı bilinmiyor — irtifa ayrımı kontrol edilemedi";
  for (const d of others) {
    const alt = d.lastTelemetry?.home?.alt;
    if (typeof alt !== "number") return `${d.droneId} kalkış rakımı bilinmiyor — irtifa ayrımı kontrol edilemedi`;
    const diff = Math.abs(alt - myAlt);
    if (diff > HOME_ALT_WARN_DIFF_M) {
      return `${entry.droneId} ile ${d.droneId} kalkış rakımları ${diff.toFixed(1)} m farklı ` +
             `(eşik ${HOME_ALT_WARN_DIFF_M} m) — gerçek irtifa ayrımı azalabilir`;
    }
  }
  return null;
}

/**
 * A v1 client (old tablet build) ignores mission.rthHeight, so its RTH altitude
 * is uncontrolled. Refuse missions while a v1 drone shares the sky with another
 * drone; a lone v1 drone keeps working as before. MULTI_DRONE_PROTOCOL.md §6.2
 */
function legacyClientError(entry) {
  const others = getDrones().filter(d => d.droneId !== entry.droneId && (d.socketId || d.activeMission));
  if (others.length === 0) return null;
  const legacy = [entry, ...others].filter(d => d.protocol < 2).map(d => d.droneId);
  if (legacy.length === 0) return null;
  return `${legacy.join(", ")} eski uygulama sürümünde (protokol v1) ve RTH irtifasını uygulamıyor — ` +
         `başka bir drone bağlıyken görev gönderilemez. Tableti v2 sürümüne güncelleyin.`;
}

function targetErrorStatus(error) {
  return /bağlı değil|Bağlı drone yok/.test(error) ? 503 : 400;
}

/**
 * POST /api/mission/plan
 * Compute boustrophedon scan waypoints for an area and optionally persist the route.
 *
 * Body: { areaId, altitudeM?, overlapPercent?, frontOverlapPercent?, speedMs?, saveRoute?, homeLat?, homeLon?, droneId? }
 *
 * homeLat/homeLon (optional): drone's current/takeoff position. If omitted, falls back
 * to the last known position reported by that drone (droneId) or by any drone. Used to
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
      homeLon             = null,
      droneId             = null
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
    const lastPos = getLastKnownPosition(droneId || undefined);
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
 * Send drone_command(waypoint_mission) to ONE drone (never broadcast).
 *
 * Body: { waypoints, droneId?, areaId?, areaName?, altitudeM?, speedMs?, savedRouteId? }
 * droneId may be omitted only while exactly one drone is connected.
 * rthHeight is computed here (MULTI_DRONE_PROTOCOL.md §6.2) and sent in mission.rthHeight.
 */
router.post("/start", async (req, res) => {
  try {
    const {
      waypoints,
      droneId      = null,
      areaId,
      areaName,
      altitudeM    = 50,
      speedMs      = 8,
      savedRouteId = null
    } = req.body;

    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return res.status(400).json({ error: "waypoints[] zorunludur" });
    }
    if (droneId === "all") {
      return res.status(400).json({ error: "Görev tek bir drone'a gönderilmelidir" });
    }

    const io = getIO();
    if (!io) return res.status(503).json({ error: "Socket.IO henüz başlatılmadı" });

    const { targets, error } = resolveCommandTargets(droneId, "waypoint_mission");
    if (error) return res.status(targetErrorStatus(error)).json({ error });
    const entry = targets[0];

    const legacyError = legacyClientError(entry);
    if (legacyError) return res.status(409).json({ error: legacyError });

    const mappedWaypoints = waypoints.map((wp, i) => ({
      index:    i,
      lat:      wp.lat,
      lon:      wp.lon,
      altitude: wp.altitude ?? Number(altitudeM),
      speed:    wp.speed    ?? Number(speedMs),
      actions:  wp.actions  ?? ["shoot_photo"]
    }));
    const maxAltitude = Math.max(...mappedWaypoints.map(wp => Number(wp.altitude)));

    const rth = computeRthHeight(entry, maxAltitude);
    if (rth.error) return res.status(400).json({ error: rth.error });

    const warning = homeAltitudeWarning(entry);
    const parsedAreaId = areaId != null && areaId !== "" ? Number(areaId) : null;

    // Records area + mission and re-sends session_started (with areaId) first.
    await prepareMissionStart(entry, { areaId: parsedAreaId, maxAltitude, rthHeight: rth.rthHeight });

    const command = {
      command: "waypoint_mission",
      mission: {
        areaId:       parsedAreaId,
        areaName,
        altitude:     Number(altitudeM),
        speed:        Number(speedMs),
        rthHeight:    rth.rthHeight,
        finishAction: "go_home",      // drone returns home after completion
        headingMode:  "auto",         // heading follows flight path
        waypoints:    mappedWaypoints
      },
      savedRouteId,
      timestamp: Date.now()
    };

    sendToDrone(entry, "drone_command", command);

    console.log(
      `🚁 Waypoint mission gönderildi: ${entry.droneId}, ${waypoints.length} WP, ` +
      `RTH ${rth.rthHeight} m` + (warning ? ` — ⚠️ ${warning}` : "")
    );

    res.json({
      message:       `Görev ${entry.droneId} için gönderildi`,
      droneId:       entry.droneId,
      waypointCount: waypoints.length,
      rthHeight:     rth.rthHeight,
      warning
    });

  } catch (err) {
    console.error("Mission start error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mission/stop
 * Send stop_mission to one drone, or to every drone with droneId "all".
 *
 * Body: { droneId? } — may be omitted only while exactly one drone is connected.
 */
router.post("/stop", (req, res) => {
  const io = getIO();
  if (!io) return res.status(503).json({ error: "Socket.IO başlatılmamış" });

  const { targets, error } = resolveCommandTargets(req.body?.droneId ?? null, "stop_mission");
  if (error) return res.status(targetErrorStatus(error)).json({ error });

  const command = { command: "stop_mission", timestamp: Date.now() };
  targets.forEach(entry => sendToDrone(entry, "drone_command", command));

  const droneIds = targets.map(t => t.droneId);
  console.log(`🛑 stop_mission gönderildi: ${droneIds.join(", ")}`);
  res.json({ message: "Görev durdurma komutu gönderildi", droneCount: targets.length, droneIds });
});

/**
 * GET /api/mission/status
 * Returns connected drones and socket readiness.
 */
router.get("/status", (req, res) => {
  const drones = getDrones().filter(d => d.socketId);
  res.json({
    socketReady:     !!getIO(),
    connectedDrones: drones.length,
    drones: drones.map(d => ({
      droneId:   d.droneId,
      sessionId: d.session ? d.session.id : null,
      areaId:    d.activeAreaId,
      rthHeight: d.activeMission ? d.activeMission.rthHeight : null
    }))
  });
});

module.exports = router;
