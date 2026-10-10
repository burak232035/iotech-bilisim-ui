const express = require("express");
const http = require("http");
const path = require("path");
const { initializeSocketIO, getConnectionSnapshot } = require("./socket.io");
const { runMigrations } = require("./db/migrate");

const reportRoutes   = require("./routes/report.routes");
const areaRoutes     = require("./routes/area.routes");
const sessionRoutes  = require("./routes/session.routes");
const telemetryRoutes = require("./routes/telemetry.routes");
const scanRoutes     = require("./routes/scan.routes");
const missionRoutes  = require("./routes/mission.routes");
const photoRoutes    = require("./routes/photo.routes");
const orthomosaicRoutes = require("./routes/orthomosaic.routes");
const landcoverRoutes = require("./routes/landcover.routes");

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
      },
      photos: {
        "POST /api/photos/upload": "Upload a full-resolution flight photo",
        "POST /api/photos/sessions/:id/classify": "Run YOLO waste detection on a session's photos",
        "GET /api/photos/classify/status/:jobId": "Check classify job status",
        "GET /api/photos/sessions/:id/detections": "Get waste detections for a session",
        "GET /api/photos/areas/:id/detections": "Get waste detections for an area"
      },
      orthomosaic: {
        "POST /api/orthomosaic/sessions/:id/generate": "Stitch a session's photos into a seamless aerial composite (OpenDroneMap)",
        "GET /api/orthomosaic/status/:id": "Check orthomosaic job status",
        "GET /api/orthomosaic/sessions/:id": "Get latest orthomosaic for a session",
        "GET /api/orthomosaic/areas/:id": "Get completed orthomosaics for an area"
      },
      landcover: {
        "POST /api/landcover/sessions/:id/analyze": "Run YOLO-seg green/concrete segmentation on a session's photos",
        "GET /api/landcover/status/:jobId": "Check analyze job status",
        "GET /api/landcover/sessions/:id": "Get average green/concrete percentages for a session"
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
app.use("/api/photos",    photoRoutes);
app.use("/api/orthomosaic", orthomosaicRoutes);
app.use("/api/landcover", landcoverRoutes);

// Çıktı klasörü (istersen tarayıcıdan da açabilirsin)
app.use("/reports", express.static(path.join(__dirname, "reports")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// PORT / DB_NAME env vars let a test instance run beside the live one
// (npm run start:test → port 3002, drone_tracking_test).
const PORT = Number(process.env.PORT) || 3001;

runMigrations()
  .catch((err) => console.error("❌ Database migration failed:", err.message))
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`✅ Backend çalışıyor: http://localhost:${PORT} (db: ${process.env.DB_NAME || "drone_tracking"})`);
      console.log(`🔌 Socket.IO ready on port ${PORT}`);
    });
  });
