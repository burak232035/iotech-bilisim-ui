const { Server } = require("socket.io");
const TelemetryService = require("./services/telemetry.service");
const FlightSessionModel = require("./models/flightSession.model");

let io = null;
let currentSession = null;
const webClients = new Set();
const droneClients = new Set();

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

module.exports = {
  initializeSocketIO,
  getIO,
  getCurrentSession
};
