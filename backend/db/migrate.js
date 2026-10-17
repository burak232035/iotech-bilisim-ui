const pool = require("../config/database");

// Idempotent column additions for databases created before a schema change.
// New databases get the same columns from init.sql via setup-database.js.
const MIGRATIONS = [
  // Multi-drone (protocol v2) — MULTI_DRONE_PROTOCOL.md
  "ALTER TABLE flight_sessions ADD COLUMN IF NOT EXISTS drone_id VARCHAR(50)",
  "ALTER TABLE flight_sessions ADD COLUMN IF NOT EXISTS drone_serial VARCHAR(100)",
  "CREATE INDEX IF NOT EXISTS idx_flight_sessions_drone_id ON flight_sessions(drone_id)",
  "ALTER TABLE photos ADD COLUMN IF NOT EXISTS drone_id VARCHAR(50)",
  // Live map previews (drone_photo) kept on disk under uploads/live/<DD.MM>/
  `CREATE TABLE IF NOT EXISTS live_photos (
  id SERIAL PRIMARY KEY,
  session_id INTEGER,
  drone_id VARCHAR(50),
  day_folder VARCHAR(10) NOT NULL,
  file_path TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  altitude NUMERIC(8, 2),
  heading NUMERIC(7, 2),
  captured_at TIMESTAMP,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  "CREATE INDEX IF NOT EXISTS idx_live_photos_day ON live_photos(day_folder)",
  "CREATE INDEX IF NOT EXISTS idx_live_photos_session ON live_photos(session_id)"
];

async function runMigrations() {
  for (const sql of MIGRATIONS) {
    await pool.query(sql);
  }
  console.log("✅ Database migrations applied");
}

module.exports = { runMigrations };
