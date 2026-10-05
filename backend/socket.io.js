const { Server } = require("socket.io");
const TelemetryService = require("./services/telemetry.service");
const FlightSessionModel = require("./models/flightSession.model");

let io = null;
let currentSession = null;
const webClients = new Set();
const droneClients = new Set();

// Last known drone GPS fix (from telemetry once it carries lat/lon, or from drone_photo
// today). Used as the default "home" position so mission planning can start the route
// from whichever end is closest to the drone instead of assuming it sits on waypoint 0.
let lastKnownPosition = null; // { lat, lon, updatedAt }

function updateLastKnownPosition(lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return;
  lastKnownPosition = { lat, lon, updatedAt: Date.now() };
}

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

  io.on("connection", async (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // Auto-detect drone client (fallback)
    // If first event is drone_telemetry, treat as drone
    let isDroneAutoDetected = false;

    // Client registration
    socket.on("register", async (data) => {
      if (data?.role === "drone") {
        droneClients.add(socket.id);
        console.log(`📱 Drone registered: ${socket.id}`);

        // Auto-start new session when drone connects
        try {
          currentSession = await FlightSessionModel.createSession({
            start_time: new Date()
          });

          socket.emit("session_started", {
            sessionId: currentSession.id,
            startTime: currentSession.start_time
          });

          // Notify all web clients
          webClients.forEach((clientId) => {
            io.to(clientId).emit("session_info", currentSession);
          });

          console.log(`🚁 Flight session started: ID ${currentSession.id}`);
        } catch (err) {
          console.error("❌ Error starting session:", err.message);
        }
      }
      else if (data?.role === "web") {
        webClients.add(socket.id);
        console.log(`🖥️  Web client registered: ${socket.id}`);

        // Send current session info if exists
        if (currentSession) {
          socket.emit("session_info", currentSession);
        }
      }
    });

    // Drone → Server: High-frequency telemetry (10 Hz)
    socket.on("drone_telemetry", async (data) => {
      // Auto-register as drone if not registered
      if (!droneClients.has(socket.id) && !webClients.has(socket.id)) {
        console.log(`📱 Auto-registering ${socket.id} as drone (received telemetry)`);
        droneClients.add(socket.id);
        isDroneAutoDetected = true;

        // Auto-start session
        if (!currentSession) {
          try {
            currentSession = await FlightSessionModel.createSession({
              start_time: new Date()
            });

            socket.emit("session_started", {
              sessionId: currentSession.id,
              startTime: currentSession.start_time
            });

            webClients.forEach((clientId) => {
              io.to(clientId).emit("session_info", currentSession);
            });

            console.log(`🚁 Flight session auto-started: ID ${currentSession.id}`);
          } catch (err) {
            console.error("❌ Error auto-starting session:", err.message);
          }
        }
      }

      if (!currentSession) {
        console.warn("⚠️  Telemetry received but no active session");
        return;
      }

      // Track live position if the telemetry payload carries lat/lon
      updateLastKnownPosition(data?.lat, data?.lon);

      // Buffer telemetry (non-blocking)
      TelemetryService.bufferTelemetry(currentSession.id, data);

      // Broadcast to web clients (throttled to 1 Hz per client)
      TelemetryService.broadcastTelemetry(io, webClients, data);
    });

    // Web → Drone: Data request
    socket.on("data_request", (request) => {
      console.log(`📤 Data request from ${socket.id}:`, request.type);

      // Forward to all drone clients
      droneClients.forEach((droneId) => {
        io.to(droneId).emit("data_request", request);
      });
    });

    // Drone → Web: Data response
    socket.on("data_response", (response) => {
      console.log(`📥 Data response:`, response.type);

      // Broadcast to all web clients
      webClients.forEach((clientId) => {
        io.to(clientId).emit("data_response", response);
      });
    });

    // Drone → Web: Command execution result (takeoff/land/hover/gimbal/emergency_land vb.)
    socket.on("command_response", (data) => {
      webClients.forEach((clientId) => {
        io.to(clientId).emit("command_response", data);
      });
    });

    // Web → Drone: Control commands (takeoff, land, etc.)
    socket.on("drone_command", (command) => {
      console.log(`🎮 Drone command from ${socket.id}:`, command.command);

      // Forward to all drone clients
      droneClients.forEach((droneId) => {
        io.to(droneId).emit("drone_command", command);
      });

      // Notify other web clients
      webClients.forEach((clientId) => {
        if (clientId !== socket.id) {
          io.to(clientId).emit("drone_command_sent", {
            command: command.command,
            sentBy: socket.id
          });
        }
      });
    });

    // Drone → Web: Obstacle detected (from drone sensors)
    socket.on("obstacle_detected", (data) => {
      console.log(`🚧 Obstacle detected from ${socket.id}:`, data);
      webClients.forEach((clientId) => {
        io.to(clientId).emit("obstacle_detected", data);
      });
    });

    // Drone → Web: Waypoint mission progress updates
    socket.on("mission_progress", (data) => {
      webClients.forEach((clientId) => {
        io.to(clientId).emit("mission_progress", data);
      });
    });

    // Drone → Web: Waypoint mission completed
    socket.on("mission_complete", (data) => {
      console.log(`✅ Mission complete from ${socket.id}`);
      webClients.forEach((clientId) => {
        io.to(clientId).emit("mission_complete", data);
      });
    });

    // Drone → Web: Mission stopped/aborted
    socket.on("mission_stopped", (data) => {
      console.log(`🛑 Mission stopped from ${socket.id}`);
      webClients.forEach((clientId) => {
        io.to(clientId).emit("mission_stopped", data);
      });
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
      console.log(
        `📷 Photo from drone: ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)} ` +
        `@ ${data.altitude ?? '?'}m, heading ${data.heading ?? '?'}°`
      );
      photoStats.receivedCount += 1;
      photoStats.lastReceivedAt = Date.now();
      photoStats.lastSizeBytes = typeof data.imageBase64 === "string" ? data.imageBase64.length : null;
      // Kept for debugging without needing terminal scrollback access —
      // full recent payload metadata queryable via /api/debug/connections.
      photoStats.lastPhotoMeta = {
        lat: data.lat, lon: data.lon, altitude: data.altitude ?? null, heading: data.heading ?? null
      };
      updateLastKnownPosition(data.lat, data.lon);
      webClients.forEach((clientId) => {
        io.to(clientId).emit("drone_photo", data);
      });
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log(`❌ Disconnected: ${socket.id}`);

      const wasDrone = droneClients.has(socket.id);
      webClients.delete(socket.id);
      droneClients.delete(socket.id);

      // If drone disconnects, end session
      if (wasDrone && droneClients.size === 0 && currentSession) {
        try {
          await FlightSessionModel.endSession(currentSession.id);
          console.log(`🛑 Flight session ended: ID ${currentSession.id}`);

          // Notify web clients
          webClients.forEach((clientId) => {
            io.to(clientId).emit("session_ended", {
              sessionId: currentSession.id
            });
          });

          currentSession = null;
        } catch (err) {
          console.error("❌ Error ending session:", err.message);
        }
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
 * Get current active session
 * @returns {Object|null}
 */
function getCurrentSession() {
  return currentSession;
}

/**
 * Get the live Set of drone client socket IDs.
 * Used by mission.routes.js to send waypoint_mission commands.
 * @returns {Set<string>}
 */
function getDroneClients() {
  return droneClients;
}

/**
 * Returns a snapshot of current connection state.
 * Used by GET /api/debug/connections
 */
function getConnectionSnapshot() {
  return {
    droneCount:       droneClients.size,
    webCount:         webClients.size,
    droneSocketIds:   [...droneClients],
    webSocketIds:     [...webClients],
    activeSession:    currentSession
      ? { id: currentSession.id, startTime: currentSession.start_time }
      : null,
    lastKnownPosition,
    photoStats
  };
}

/**
 * Last known drone GPS fix, or null if none received yet.
 * @returns {{lat:number, lon:number, updatedAt:number}|null}
 */
function getLastKnownPosition() {
  return lastKnownPosition;
}

module.exports = {
  initializeSocketIO,
  getIO,
  getCurrentSession,
  getDroneClients,
  getConnectionSnapshot,
  getLastKnownPosition
};
