const pool = require("../config/database");

class PhotoModel {
  /**
   * Persist an uploaded full-resolution photo's metadata.
   * @param {{sessionId, droneId, areaId, filePath, lat, lon, altitude, heading, capturedAt}} data
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const {
      sessionId, droneId = null, areaId = null, filePath,
      lat, lon, altitude = null, heading = null, capturedAt = null
    } = data;

    const result = await pool.query(
      `INSERT INTO photos (session_id, drone_id, area_id, file_path, lat, lon, altitude_agl, heading, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [sessionId, droneId, areaId, filePath, lat, lon, altitude, heading, capturedAt]
    );
    return result.rows[0];
  }

  /**
   * Photos for a session that haven't been run through YOLO yet.
   * @param {number} sessionId
   * @returns {Promise<Array>}
   */
  static async getUnclassifiedBySession(sessionId) {
    const result = await pool.query(
      `SELECT * FROM photos WHERE session_id = $1 AND classified_at IS NULL ORDER BY captured_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * All photos for a session (classified or not).
   * @param {number} sessionId
   * @returns {Promise<Array>}
   */
  static async getBySession(sessionId) {
    const result = await pool.query(
      `SELECT * FROM photos WHERE session_id = $1 ORDER BY captured_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * All photos for an area, across sessions.
   * @param {number} areaId
   * @returns {Promise<Array>}
   */
  static async getByArea(areaId) {
    const result = await pool.query(
      `SELECT * FROM photos WHERE area_id = $1 ORDER BY captured_at ASC`,
      [areaId]
    );
    return result.rows;
  }

  /**
   * Photos for a session that haven't gone through green/concrete
   * segmentation yet. Deliberately independent from classified_at —
   * waste classification and landcover analysis are separate jobs, a
   * photo can be waste-classified and still awaiting landcover analysis
   * (or vice versa), so this checks for the absence of a
   * landcover_analyses row instead of a shared "processed" flag.
   * @param {number} sessionId
   * @returns {Promise<Array>}
   */
  static async getUnanalyzedForLandcover(sessionId) {
    const result = await pool.query(
      `SELECT p.* FROM photos p
       LEFT JOIN landcover_analyses la ON la.photo_id = p.id
       WHERE p.session_id = $1 AND la.id IS NULL
       ORDER BY p.captured_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * Mark a photo as processed by YOLO.
   * @param {number} photoId
   * @returns {Promise<Object|null>}
   */
  static async markClassified(photoId) {
    const result = await pool.query(
      `UPDATE photos SET classified_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [photoId]
    );
    return result.rows[0] || null;
  }
}

module.exports = PhotoModel;
