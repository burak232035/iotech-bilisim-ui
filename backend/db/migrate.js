const pool = require("../config/database");

// Idempotent column additions for databases created before a schema change.
// New databases get the same columns from init.sql via setup-database.js.
const MIGRATIONS = [
  // Multi-drone (protocol v2) — MULTI_DRONE_PROTOCOL.md
  "ALTER TABLE flight_sessions ADD COLUMN IF NOT EXISTS drone_id VARCHAR(50)",
  "ALTER TABLE flight_sessions ADD COLUMN IF NOT EXISTS drone_serial VARCHAR(100)",
  "CREATE INDEX IF NOT EXISTS idx_flight_sessions_drone_id ON flight_sessions(drone_id)",
  "ALTER TABLE photos ADD COLUMN IF NOT EXISTS drone_id VARCHAR(50)"
];

async function runMigrations() {
  for (const sql of MIGRATIONS) {
    await pool.query(sql);
  }
  console.log("✅ Database migrations applied");
}

module.exports = { runMigrations };
