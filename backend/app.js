const express = require("express");
const http = require("http");
const path = require("path");
const { initializeSocketIO, getConnectionSnapshot } = require("./socket.io");

const reportRoutes   = require("./routes/report.routes");
const areaRoutes     = require("./routes/area.routes");
const sessionRoutes  = require("./routes/session.routes");
const telemetryRoutes = require("./routes/telemetry.routes");
const scanRoutes     = require("./routes/scan.routes");
const missionRoutes  = require("./routes/mission.routes");

const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(httpServer);

app.use(express.json());

// CORS (frontend farklı porttan gelirse sorun olmasın)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Root route - API info
app.get("/", (req, res) => {
  res.json({
    name: "Drone Tracking Backend",
    version: "1.0.0",
    status: "running",
    socketio: "active",
    endpoints: {
      areas: {
        "GET /api/areas": "Get all areas",
        "GET /api/areas/:id": "Get area by ID",
        "POST /api/areas": "Create new area",
        "PUT /api/areas/:id": "Update area",
        "DELETE /api/areas/:id": "Delete area"
      },
      sessions: {
        "GET /api/sessions": "Get all sessions",
        "GET /api/sessions/active": "Get active sessions",
        "GET /api/sessions/:id": "Get session by ID",
        "POST /api/sessions/end/:id": "End session"
      },
      telemetry: {
        "GET /api/telemetry/session/:sessionId": "Get telemetry for session",
        "GET /api/telemetry/session/:sessionId/latest": "Get latest telemetry"
      },
      reports: {
        "POST /api/reports/generate": "Generate PDF report"
      }
    }
  });
});

// Debug: live connection snapshot (drone bağlı mı?)
app.get("/api/debug/connections", (req, res) => {
  res.json(getConnectionSnapshot());
});

// API Routes
app.use("/api/reports",   reportRoutes);
app.use("/api/areas",     areaRoutes);
app.use("/api/sessions",  sessionRoutes);
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/scan",      scanRoutes);
app.use("/api/mission",   missionRoutes);

// Çıktı klasörü (istersen tarayıcıdan da açabilirsin)
app.use("/reports", express.static(path.join(__dirname, "reports")));

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`✅ Backend çalışıyor: http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready on port ${PORT}`);
});
