const pool = require("../config/database");

class ObstacleModel {
  static async getByAreaId(areaId) {
    const result = await pool.query(
      `SELECT * FROM obstacles WHERE area_id = $1 ORDER BY detected_at ASC`,
      [areaId]
    );
    return result.rows;
  }

  static async create({ areaId, lat, lon, radiusM = 5, obstacleType = "unknown", sessionId = null }) {
    const result = await pool.query(
      `INSERT INTO obstacles (area_id, lat, lon, radius_m, obstacle_type, session_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [areaId, lat, lon, radiusM, obstacleType, sessionId || null]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      `DELETE FROM obstacles WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async deleteByAreaId(areaId) {
    const result = await pool.query(
      `DELETE FROM obstacles WHERE area_id = $1 RETURNING *`,
      [areaId]
    );
    return result.rows;
  }
}

module.exports = ObstacleModel;
