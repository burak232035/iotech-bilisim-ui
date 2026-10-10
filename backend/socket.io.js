const { Server } = require("socket.io");
const TelemetryService = require("./services/telemetry.service");
const FlightSessionModel = require("./models/flightSession.model");

/*
 * Multi-drone Socket.IO hub — protocol v2, see MULTI_DRONE_PROTOCOL.md.
 *
 * Each drone is identified by a droneId ("drone-1", "drone-2", …). A v1 client
 * (no `protocol` field in register) is treated as "drone-1", so the existing
 * tablet build keeps working unchanged.
 *
 * Commands from the web are never broadcast to every drone: they go to the
 * target drone's room only (see resolveCommandTargets).
 */

let io = null;
const webClients = new Set();

// droneId -> drone entry (survives disconnects so sessions can resume)
const drones = new Map();
// socket.id -> droneId, for sockets that are the drone's active connection
const socketToDrone = new Map();
// socket.id -> { droneId, protocol } for v2 sockets that registered without a
// serial while another device holds that droneId (app connected before the
// aircraft). They get no commands until a register with a serial arrives.
const pendingSockets = new Map();

// hover pauses a running waypoint mission on Android (resume_mission continues
// it). resume_mission itself is deliberately per-drone only. §3.3
const ALL_TARGET_COMMANDS = new Set(["emergency_land", "returnHome", "hover", "stop_mission"]);

const SESSION_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000; // end session after 30 min offline
const LANDED_CONFIRM_MS             = 60 * 1000;      // landed this long after mission_complete
const LANDED_AGL_THRESHOLD_M        = 1.5;            // v1 fallback when isFlying is absent
const SWEEP_INTERVAL_MS             = 30 * 1000;

// Last known GPS fix of any drone — kept for callers that don't pass a droneId.
let lastKnownPosition = null; // { lat, lon, updatedAt, droneId }

// drone_photo diagnostics — polled via /api/debug/connections so we can verify
// live whether photos are arriving without needing terminal scrollback access.
const photoStats = {
  receivedCount:  0,
  rejectedCount:  0,
  lastReceivedAt: null,
  lastRejectedAt: null,
  lastRejectReason: null,
  lastSizeBytes:  null
};

// Serialises async work per key (register handling per droneId) so two quick
// registers on the same socket can't create two sessions.
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

function getOrCreateDrone(droneId) {
  let entry = drones.get(droneId);
  if (!entry) {
    entry = {
      droneId,
      socketId:          null,
      serial:            null,
      protocol:          1,
      appVersion:        null,
      session:           null,   // flight_sessions row
      lastSessionId:     null,   // most recent session (open or closed) — for post-flight analysis
      activeAreaId:      null,
      activeMission:     null,   // { maxAltitude, rthHeight, startedAt }
      lastTelemetry:     null,
      lastPosition:      null,   // { lat, lon, updatedAt }
      connectedAt:       null,
      disconnectedAt:    null,
      missionEndedAt:    null,   // mission_complete or mission_stopped received
      landedSince:       null
    };
    drones.set(droneId, entry);
  }
  return entry;
}

function isConnected(entry) {
  return !!entry.socketId;
}

function connectedDrones() {
  return [...drones.values()].filter(isConnected);
}

function droneRoom(droneId) {
  return `drone:${droneId}`;
}

function emitToWeb(event, payload) {
  webClients.forEach((clientId) => io.to(clientId).emit(event, payload));
}

function droneSummary(entry) {
  return {
    droneId:     entry.droneId,
    connected:   isConnected(entry),
    serial:      entry.serial,
    protocol:    entry.protocol,
    appVersion:  entry.appVersion,
    sessionId:   entry.session ? entry.session.id : null,
    lastSessionId: entry.session ? entry.session.id : entry.lastSessionId,
    areaId:      entry.activeAreaId,
    rthHeight:   entry.activeMission ? entry.activeMission.rthHeight : null,
    missionAltitude: entry.activeMission ? entry.activeMission.maxAltitude : null,
    lastPosition: entry.lastPosition,
    connectedAt: entry.connectedAt,
    disconnectedAt: entry.disconnectedAt
  };
}

function broadcastDronesState() {
  emitToWeb("drones_state", { drones: [...drones.values()].map(droneSummary) });
}

function updatePosition(entry, lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return;
  const now = Date.now();
  entry.lastPosition = { lat, lon, updatedAt: now };
  lastKnownPosition = { lat, lon, updatedAt: now, droneId: entry.droneId };
}

function sessionStartedPayload(entry) {
  return {
    sessionId: entry.session.id,
    droneId:   entry.droneId,
    startTime: entry.session.start_time,
    areaId:    entry.activeAreaId ?? entry.session.area_id ?? null
  };
}

async function endDroneSession(entry, reason) {
  if (!entry.session) return;
  const sessionId = entry.session.id;
  entry.lastSessionId = sessionId;
  entry.session = null;
  entry.activeAreaId = null;
  entry.activeMission = null;
  entry.missionEndedAt = null;
  entry.landedSince = null;
  try {
    await FlightSessionModel.endSession(sessionId);
    console.log(`🛑 Flight session ended: ID ${sessionId} (${entry.droneId}, ${reason})`);
  } catch (err) {
    console.error(`❌ Error ending session ${sessionId}:`, err.message);
  }
  emitToWeb("session_ended", { sessionId, droneId: entry.droneId, reason });
  broadcastDronesState();
}

/**
 * Give the drone an open session: keep the one in memory, resume lastSessionId
 * if it's still open and belongs to this drone, otherwise start a new one.
 */
async function ensureSession(entry, lastSessionId, { createIfNone = true } = {}) {
  if (entry.session) return;

  if (lastSessionId) {
    try {
      const row = await FlightSessionModel.getById(Number(lastSessionId));
      const ownedByDrone = row && (row.drone_id === entry.droneId || row.drone_id == null);
      if (row && row.status === "active" && ownedByDrone) {
        entry.session = row;
        entry.activeAreaId = row.area_id ?? null;
        console.log(`🔁 Session resumed: ID ${row.id} (${entry.droneId})`);
        return;
      }
    } catch (err) {
      console.error("❌ Error resuming session:", err.message);
    }
  }

  if (!createIfNone) return;
  entry.session = await FlightSessionModel.createSession({
    start_time:   new Date(),
    drone_id:     entry.droneId,
    drone_serial: entry.serial
  });
  entry.activeAreaId = null;
  console.log(`🚁 Flight session started: ID ${entry.session.id} (${entry.droneId})`);
}

async function handleDroneRegister(socket, data) {
  const protocol = Number(data?.protocol) || 1;
  const droneId  = protocol >= 2 && data?.droneId ? String(data.droneId) : "drone-1";
  const serial   = data?.serial ? String(data.serial) : null;

  return withLock(droneId, async () => {
    // Socket was the active connection of another droneId: detach it (rare).
    const previousId = socketToDrone.get(socket.id);
    if (previousId && previousId !== droneId) {
      const prev = drones.get(previousId);
      if (prev && prev.socketId === socket.id) prev.socketId = null;
      socketToDrone.delete(socket.id);
      socket.leave(droneRoom(previousId));
    }

    const entry = getOrCreateDrone(droneId);
    const otherSocketId = entry.socketId && entry.socketId !== socket.id ? entry.socketId : null;

    if (otherSocketId) {
      if (entry.serial && serial && entry.serial !== serial) {
        console.warn(`⛔ register_rejected: ${droneId} in use by serial ${entry.serial}, got ${serial}`);
        pendingSockets.delete(socket.id);
        socket.emit("register_rejected", {
          reason: "droneId_in_use",
          droneId,
          activeSerial: entry.serial
        });
        socket.disconnect(true);
        return;
      }
      if (entry.serial && !serial && protocol >= 2) {
        // App connected before its aircraft — can't tell yet whether it's the
        // same device. Wait for the register that carries the serial.
        pendingSockets.set(socket.id, { droneId, protocol });
        console.log(`⏳ ${droneId} register without serial on ${socket.id} — pending until serial arrives`);
        return;
      }
      // Same device reconnecting (same serial, or v1 client without serial).
      const oldSocket = io.sockets.sockets.get(otherSocketId);
      socketToDrone.delete(otherSocketId);
      if (oldSocket) oldSocket.disconnect(true);
      console.log(`🔄 ${droneId} reconnected: ${otherSocketId} → ${socket.id}`);
    }

    pendingSockets.delete(socket.id);
    const isNewConnection = entry.socketId !== socket.id;
    entry.socketId   = socket.id;
    entry.protocol   = protocol;
    entry.serial     = serial || entry.serial;
    entry.appVersion = data?.appVersion || entry.appVersion;
    if (isNewConnection) {
      entry.connectedAt    = Date.now();
      entry.disconnectedAt = null;
    }
    socketToDrone.set(socket.id, droneId);
    socket.join(droneRoom(droneId));

    try {
      // A reconnect (lastSessionId given) after that session closed doesn't
      // open an empty one: the next takeoff / mission does (§4.5), and the
      // drone keeps using its last sessionId for post-landing uploads.
      await ensureSession(entry, data?.lastSessionId, { createIfNone: !data?.lastSessionId });
      if (!entry.session && !entry.lastSessionId) {
        entry.lastSessionId = await FlightSessionModel.getLatestIdForDrone(droneId);
      }
      if (entry.serial && entry.session && !entry.session.drone_serial) {
        entry.session = (await FlightSessionModel.setDroneSerial(entry.session.id, entry.serial)) || entry.session;
      }
    } catch (err) {
      console.error("❌ Error starting session:", err.message);
    }

    console.log(
      `📱 Drone registered: ${droneId} (protocol ${protocol}` +
      `${entry.serial ? `, serial ${entry.serial}` : ""}) on ${socket.id}`
    );

    if (entry.session) {
      socket.emit("session_started", sessionStartedPayload(entry));
      emitToWeb("session_info", { ...entry.session, droneId });
    }
    broadcastDronesState();
  });
}

/**
 * Resolve which drones a web-originated command goes to.
 * @returns {{targets: Array, error?: string}}
 */
function resolveCommandTargets(droneId, commandName) {
  const online = connectedDrones();

  if (droneId === "all") {
    if (!ALL_TARGET_COMMANDS.has(commandName)) {
      return { targets: [], error: `"all" hedefi yalnızca ${[...ALL_TARGET_COMMANDS].join(", ")} için kullanılabilir` };
    }
    if (online.length === 0) return { targets: [], error: "Bağlı drone yok" };
    return { targets: online };
  }

  if (droneId) {
    const entry = drones.get(String(droneId));
    if (!entry || !isConnected(entry)) return { targets: [], error: `${droneId} bağlı değil` };
    return { targets: [entry] };
  }

  if (online.length === 0) return { targets: [], error: "Bağlı drone yok" };
  if (online.length > 1) {
    return { targets: [], error: "Birden fazla drone bağlı — komut için droneId seçilmeli" };
  }
  return { targets: online };
}

/** Emit to a drone's room, stamping the payload with that drone's own id. */
function sendToDrone(entry, event, payload) {
  io.to(droneRoom(entry.droneId)).emit(event, { ...payload, droneId: entry.droneId });
}

/**
 * Start a fresh session for a drone that is still connected after its last
 * session closed (landing after a mission), and tell the drone about it.
 */
async function openNewSession(entry, reason) {
  return withLock(entry.droneId, async () => {
    if (entry.session) return;
    try {
      await ensureSession(entry, null);
      console.log(`🆕 New session for ${entry.droneId} (${reason})`);
      io.to(droneRoom(entry.droneId)).emit("session_started", sessionStartedPayload(entry));
      emitToWeb("session_info", { ...entry.session, droneId: entry.droneId });
      broadcastDronesState();
    } catch (err) {
      console.error("❌ Error opening session:", err.message);
    }
  });
}

/**
 * Called by the mission route right before waypoint_mission: records the area
 * and mission, then re-sends session_started carrying the areaId.
 */
async function prepareMissionStart(entry, { areaId, maxAltitude, rthHeight }) {
  // Previous session may have closed after landing while the drone stayed connected
  if (!entry.session) await openNewSession(entry, "mission");

  entry.activeAreaId      = areaId ?? null;
  entry.activeMission     = { maxAltitude, rthHeight, startedAt: Date.now() };
  entry.missionEndedAt    = null;
  entry.landedSince       = null;

  if (!entry.session) return;
  if (areaId != null && entry.session.area_id !== areaId) {
    try {
      entry.session = (await FlightSessionModel.setArea(entry.session.id, areaId)) || entry.session;
    } catch (err) {
      console.error("❌ Error setting session area:", err.message);
    }
  }
  io.to(droneRoom(entry.droneId)).emit("session_started", sessionStartedPayload(entry));
  broadcastDronesState();
}

const mismatchWarnedAt = new Map();
/** Attach the socket's droneId to an upstream payload (socket mapping wins). */
function stampDroneId(socket, data, eventName) {
  const droneId = socketToDrone.get(socket.id);
  if (!droneId) return data;
  if (data && data.droneId && data.droneId !== droneId) {
    const key = `${socket.id}:${eventName}`;
    const last = mismatchWarnedAt.get(key) || 0;
    if (Date.now() - last > 60000) {
      console.warn(`⚠️  ${eventName}: payload droneId "${data.droneId}" ≠ socket ${droneId} — socket eşlemesi kullanılıyor`);
      mismatchWarnedAt.set(key, Date.now());
    }
  }
  return { ...(data || {}), droneId };
}

function checkLanded(entry, data) {
  if (!entry.missionEndedAt || !entry.session) return;
  const flying = typeof data?.isFlying === "boolean"
    ? data.isFlying
    : (typeof data?.altitude?.agl === "number" ? data.altitude.agl > LANDED_AGL_THRESHOLD_M : null);
  if (flying === null) return;

  if (flying) {
    entry.landedSince = null;
    return;
  }
  const now = Date.now();
  if (!entry.landedSince) entry.landedSince = now;
  if (now - entry.landedSince >= LANDED_CONFIRM_MS) {
    endDroneSession(entry, "landed");
  }
}

function startSessionSweeper() {
  setInterval(() => {
    const now = Date.now();
    for (const entry of drones.values()) {
      if (entry.session && !isConnected(entry) && entry.disconnectedAt &&
          now - entry.disconnectedAt >= SESSION_DISCONNECT_TIMEOUT_MS) {
        endDroneSession(entry, "disconnect_timeout");
      }
    }
  }, SWEEP_INTERVAL_MS);
}

/**
 * Initialize Socket.IO server
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} Socket.IO server instance
 */
function initializeSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
  });

  startSessionSweeper();

  io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // Client registration
    socket.on("register", async (data) => {
      if (data?.role === "drone") {
        await handleDroneRegister(socket, data);
      }
      else if (data?.role === "web") {
        webClients.add(socket.id);
        console.log(`🖥️  Web client registered: ${socket.id}`);

        for (const entry of drones.values()) {
          if (entry.session) socket.emit("session_info", { ...entry.session, droneId: entry.droneId });
        }
        socket.emit("drones_state", { drones: [...drones.values()].map(droneSummary) });
      }
    });

    // Drone → Server: High-frequency telemetry (10 Hz)
    socket.on("drone_telemetry", async (data) => {
      if (pendingSockets.has(socket.id)) return;

      // v1 fallback: a client that sends telemetry without registering is drone-1
      if (!socketToDrone.has(socket.id) && !webClients.has(socket.id)) {
        console.log(`📱 Auto-registering ${socket.id} as drone (received telemetry)`);
        await handleDroneRegister(socket, { role: "drone" });
      }

      const droneId = socketToDrone.get(socket.id);
      const entry = droneId && drones.get(droneId);
      if (!entry) return;

      // No session between flights (closed after landing); taking off opens one
      if (!entry.session && data?.isFlying === true) await openNewSession(entry, "takeoff");

      const stamped = stampDroneId(socket, data, "drone_telemetry");
      entry.lastTelemetry = stamped;
      updatePosition(entry, data?.lat, data?.lon);

      // Buffer telemetry (non-blocking) — only flights are recorded
      if (entry.session) TelemetryService.bufferTelemetry(entry.session.id, stamped);

      // Broadcast to web clients (throttled to 1 Hz per client per drone)
      TelemetryService.broadcastTelemetry(io, webClients, stamped);

      checkLanded(entry, data);
    });

    // Web → Drone: Data request (read-only, so a missing droneId fans out to every drone)
    socket.on("data_request", (request) => {
      console.log(`📤 Data request from ${socket.id}:`, request?.type);
      const targets = request?.droneId && request.droneId !== "all"
        ? resolveCommandTargets(request.droneId, "data_request").targets
        : connectedDrones();
      targets.forEach((entry) => sendToDrone(entry, "data_request", request));
    });

    // Drone → Web: Data response
    socket.on("data_response", (response) => {
      console.log(`📥 Data response:`, response?.type);
      emitToWeb("data_response", stampDroneId(socket, response, "data_response"));
    });

    // Drone → Web: Command execution result (takeoff/land/hover/gimbal/emergency_land vb.)
    socket.on("command_response", (data) => {
      emitToWeb("command_response", stampDroneId(socket, data, "command_response"));
    });

    // Web → Drone: Control commands (takeoff, land, etc.) — targeted, never broadcast
    socket.on("drone_command", (command) => {
      const name = command?.command;
      const { targets, error } = resolveCommandTargets(command?.droneId, name);

      if (error) {
        console.warn(`⛔ Drone command "${name}" rejected: ${error}`);
        socket.emit("command_response", {
          command:   name,
          droneId:   command?.droneId ?? null,
          status:    "failed",
          error,
          source:    "backend",
          timestamp: Date.now()
        });
        return;
      }

      const targetIds = targets.map((t) => t.droneId);
      console.log(`🎮 Drone command from ${socket.id}: ${name} → ${targetIds.join(", ")}`);
      targets.forEach((entry) => sendToDrone(entry, "drone_command", command));

      // Notify other web clients
      webClients.forEach((clientId) => {
        if (clientId !== socket.id) {
          io.to(clientId).emit("drone_command_sent", {
            command:  name,
            droneIds: targetIds,
            sentBy:   socket.id
          });
        }
      });
    });

    // Drone → Web: Obstacle detected (from drone sensors)
    socket.on("obstacle_detected", (data) => {
      console.log(`🚧 Obstacle detected from ${socket.id}:`, data);
      emitToWeb("obstacle_detected", stampDroneId(socket, data, "obstacle_detected"));
    });

    // Drone → Web: Waypoint mission progress updates
    socket.on("mission_progress", (data) => {
      emitToWeb("mission_progress", stampDroneId(socket, data, "mission_progress"));
    });

    // Drone → Web: Waypoint mission completed
    socket.on("mission_complete", (data) => {
      const stamped = stampDroneId(socket, data, "mission_complete");
      console.log(`✅ Mission complete from ${stamped.droneId || socket.id}`);
      const entry = drones.get(stamped.droneId);
      if (entry) {
        entry.missionEndedAt = Date.now();
        entry.landedSince = null;
      }
      emitToWeb("mission_complete", stamped);
    });

    // Drone → Web: Mission stopped/aborted
    socket.on("mission_stopped", (data) => {
      const stamped = stampDroneId(socket, data, "mission_stopped");
      console.log(`🛑 Mission stopped from ${stamped.droneId || socket.id}`);
      const entry = drones.get(stamped.droneId);
      if (entry) {
        // A stopped mission ends the flight too: close the session once landed
        entry.activeMission = null;
        entry.missionEndedAt = Date.now();
        entry.landedSince = null;
      }
      emitToWeb("mission_stopped", stamped);
      broadcastDronesState();
    });

    // Drone → Web: Post-landing full-resolution upload progress
    socket.on("photo_upload_status", (data) => {
      emitToWeb("photo_upload_status", stampDroneId(socket, data, "photo_upload_status"));
    });

    // Drone → Web: Camera photo with GPS coordinates for map overlay
    // Expected: { imageBase64, lat, lon, altitude, heading, timestamp }
    // imageBase64 should be a compressed JPEG thumbnail (~100 KB max)
    socket.on("drone_photo", (data) => {
      if (!data?.imageBase64 || !data?.lat || !data?.lon) {
        const reason = !data?.imageBase64 ? "imageBase64 eksik" : !data?.lat ? "lat eksik" : "lon eksik";
        console.warn(`⚠️  drone_photo: eksik alan (${reason})`);
        photoStats.rejectedCount += 1;
        photoStats.lastRejectedAt = Date.now();
        photoStats.lastRejectReason = reason;
        return;
      }
      const stamped = stampDroneId(socket, data, "drone_photo");
      console.log(
        `📷 Photo from ${stamped.droneId || "drone"}: ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)} ` +
        `@ ${data.altitude ?? '?'}m, heading ${data.heading ?? '?'}°`
      );
      photoStats.receivedCount += 1;
      photoStats.lastReceivedAt = Date.now();
      photoStats.lastSizeBytes = typeof data.imageBase64 === "string" ? data.imageBase64.length : null;
      // Kept for debugging without needing terminal scrollback access —
      // full recent payload metadata queryable via /api/debug/connections.
      photoStats.lastPhotoMeta = {
        droneId: stamped.droneId ?? null,
        lat: data.lat, lon: data.lon, altitude: data.altitude ?? null, heading: data.heading ?? null
      };
      const entry = drones.get(stamped.droneId);
      if (entry) updatePosition(entry, data.lat, data.lon);
      emitToWeb("drone_photo", stamped);
    });

    // Handle disconnection — a drone's session is NOT ended here; it ends on
    // landing after mission_complete or after SESSION_DISCONNECT_TIMEOUT_MS.
    socket.on("disconnect", () => {
      console.log(`❌ Disconnected: ${socket.id}`);
      webClients.delete(socket.id);
      pendingSockets.delete(socket.id);
      TelemetryService.forgetClient(socket.id);

      const droneId = socketToDrone.get(socket.id);
      socketToDrone.delete(socket.id);
      const entry = droneId && drones.get(droneId);
      if (entry && entry.socketId === socket.id) {
        entry.socketId = null;
        entry.disconnectedAt = Date.now();
        console.log(`📴 ${droneId} offline${entry.session ? ` — session ${entry.session.id} kept open` : ""}`);
        broadcastDronesState();
      }
    });
  });

  console.log("✅ Socket.IO server initialized");
  return io;
}

/**
 * Get Socket.IO server instance
 * @returns {Object|null}
 */
function getIO() {
  return io;
}

/**
 * Active session for callers that predate multi-drone support (e.g. report
 * generation without a sessionId): the most recently started open session.
 * @returns {Object|null}
 */
function getCurrentSession() {
  let latest = null;
  for (const entry of drones.values()) {
    if (!entry.session) continue;
    if (!latest || new Date(entry.session.start_time) > new Date(latest.start_time)) {
      latest = entry.session;
    }
  }
  return latest;
}

/**
 * Get the Set of connected drone socket IDs.
 * @returns {Set<string>}
 */
function getDroneClients() {
  return new Set(connectedDrones().map((e) => e.socketId));
}

/**
 * Drone entry by id, or null.
 */
function getDrone(droneId) {
  return drones.get(droneId) || null;
}

/**
 * All known drone entries (connected or not).
 */
function getDrones() {
  return [...drones.values()];
}

/**
 * Returns a snapshot of current connection state.
 * Used by GET /api/debug/connections
 */
function getConnectionSnapshot() {
  const online = connectedDrones();
  const current = getCurrentSession();
  return {
    droneCount:       online.length,
    webCount:         webClients.size,
    droneSocketIds:   online.map((e) => e.socketId),
    webSocketIds:     [...webClients],
    pendingSockets:   [...pendingSockets.entries()].map(([socketId, p]) => ({ socketId, ...p })),
    drones:           [...drones.values()].map(droneSummary),
    activeSession:    current ? { id: current.id, startTime: current.start_time } : null,
    lastKnownPosition,
    photoStats
  };
}

/**
 * Last known GPS fix of the given drone, or of any drone when droneId is omitted.
 * @returns {{lat:number, lon:number, updatedAt:number}|null}
 */
function getLastKnownPosition(droneId) {
  if (droneId) {
    const entry = drones.get(droneId);
    return entry ? entry.lastPosition : null;
  }
  return lastKnownPosition;
}

module.exports = {
  initializeSocketIO,
  getIO,
  getCurrentSession,
  getDroneClients,
  getDrone,
  getDrones,
  resolveCommandTargets,
  sendToDrone,
  prepareMissionStart,
  getConnectionSnapshot,
  getLastKnownPosition
};
