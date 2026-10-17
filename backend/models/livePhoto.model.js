const pool = require("../config/database");

/**
 * Live preview thumbnails (drone_photo socket event) kept on disk under
 * uploads/live/<DD.MM>/ — separate from the full-resolution post-landing
 * uploads in `photos`. Previews can't feed the orthomosaic; they're kept so
 * a flight's map preview can be looked at again later.
 */
class LivePhotoModel {
  static async create(data) {
    const {
      sessionId = null, droneId = null, dayFolder, filePath,
      lat, lon, altitude = null, heading = null, capturedAt = null
    } = data;
    const result = await pool.query(
      `INSERT INTO live_photos (session_id, drone_id, day_folder, file_path, lat, lon, altitude, heading, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [sessionId, droneId, dayFolder, filePath, lat, lon, altitude, heading, capturedAt]
    );
    return result.rows[0];
  }

  /**
   * @param {{day?: string, droneId?: string, sessionId?: number}} filter
   */
  static async list({ day, droneId, sessionId } = {}) {
    const where = [];
    const params = [];
    if (day)       { params.push(day);       where.push(`day_folder = $${params.length}`); }
    if (droneId)   { params.push(droneId);   where.push(`drone_id = $${params.length}`); }
    if (sessionId) { params.push(sessionId); where.push(`session_id = $${params.length}`); }
    const result = await pool.query(
      `SELECT * FROM live_photos ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY received_at ASC`,
      params
    );
    return result.rows;
  }

  /** Per-day / drone / session counts, newest day first. */
  static async summary() {
    const result = await pool.query(
      `SELECT day_folder, drone_id, session_id, count(*)::int AS count,
              min(received_at) AS first_at, max(received_at) AS last_at
       FROM live_photos
       GROUP BY day_folder, drone_id, session_id
       ORDER BY max(received_at) DESC`
    );
    return result.rows;
  }
}

module.exports = LivePhotoModel;
