const pool = require("../config/database");

class WasteDetectionModel {
  /**
   * Persist multiple detections for one photo in a single round-trip.
   * @param {number} photoId
   * @param {Array<{category, confidence, bbox, lat, lon}>} detections
   * @returns {Promise<Array>}
   */
  static async bulkInsert(photoId, detections) {
    if (!detections || detections.length === 0) return [];

    const values = [];
    const params = [];
    let i = 1;

    for (const d of detections) {
      values.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
      params.push(photoId, d.category, d.confidence, JSON.stringify(d.bbox), d.lat, d.lon);
      i += 6;
    }

    const result = await pool.query(
      `INSERT INTO waste_detections (photo_id, category, confidence, bbox, lat, lon)
       VALUES ${values.join(",")}
       RETURNING *`,
      params
    );
    return result.rows;
  }

  /**
   * All detections for a flight session (joins through photos).
   * @param {number} sessionId
   * @returns {Promise<Array>}
   */
  static async getBySession(sessionId) {
    const result = await pool.query(
      `SELECT wd.* FROM waste_detections wd
       JOIN photos p ON wd.photo_id = p.id
       WHERE p.session_id = $1
       ORDER BY wd.created_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * All detections for an area, across sessions.
   * @param {number} areaId
   * @returns {Promise<Array>}
   */
  static async getByArea(areaId) {
    const result = await pool.query(
      `SELECT wd.* FROM waste_detections wd
       JOIN photos p ON wd.photo_id = p.id
       WHERE p.area_id = $1
       ORDER BY wd.created_at ASC`,
      [areaId]
    );
    return result.rows;
  }

  /**
   * Per-category counts for a session — feeds the PDF report table.
   * @param {number} sessionId
   * @returns {Promise<Array<{category, count}>>}
   */
  static async getCategoryCounts(sessionId) {
    const result = await pool.query(
      `SELECT wd.category, COUNT(*)::int as count
       FROM waste_detections wd
       JOIN photos p ON wd.photo_id = p.id
       WHERE p.session_id = $1
       GROUP BY wd.category
       ORDER BY count DESC`,
      [sessionId]
    );
    return result.rows;
  }
}

module.exports = WasteDetectionModel;
