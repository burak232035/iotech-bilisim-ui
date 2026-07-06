const pool = require("../config/database");

class ScanRouteModel {
  static async getLatestByAreaId(areaId) {
    const result = await pool.query(
      `SELECT * FROM scan_routes WHERE area_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [areaId]
    );
    return result.rows[0] || null;
  }

  static async getAllByAreaId(areaId) {
    const result = await pool.query(
      `SELECT id, area_id, scan_width_m, altitude_m, total_distance_m, waypoint_count, created_at
       FROM scan_routes WHERE area_id = $1 ORDER BY created_at DESC`,
      [areaId]
    );
    return result.rows;
  }

  static async save({ areaId, waypoints, obstacles = [], scanWidthM = 20, altitudeM = 50, totalDistanceM, waypointCount }) {
    const result = await pool.query(
      `INSERT INTO scan_routes (area_id, waypoints, obstacles, scan_width_m, altitude_m, total_distance_m, waypoint_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [areaId, JSON.stringify(waypoints), JSON.stringify(obstacles), scanWidthM, altitudeM, totalDistanceM || null, waypointCount || null]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      `DELETE FROM scan_routes WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = ScanRouteModel;
