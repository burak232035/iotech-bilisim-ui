const pool = require("../config/database");

class OrthomosaicModel {
  /**
   * Create a placeholder row while the ODM job is running.
   * @param {{sessionId, areaId, photoCount}} data
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const { sessionId, areaId = null, photoCount = 0 } = data;
    const result = await pool.query(
      `INSERT INTO orthomosaics (session_id, area_id, photo_count, status)
       VALUES ($1, $2, $3, 'processing')
       RETURNING *`,
      [sessionId, areaId, photoCount]
    );
    return result.rows[0];
  }

  /**
   * Mark a job done and attach the generated file + bounds.
   * @param {number} id
   * @param {{filePath, bounds}} data
   * @returns {Promise<Object|null>}
   */
  static async markDone(id, { filePath, bounds }) {
    const result = await pool.query(
      `UPDATE orthomosaics SET status = 'done', file_path = $1, bounds = $2, error = NULL WHERE id = $3 RETURNING *`,
      [filePath, JSON.stringify(bounds), id]
    );
    const row = result.rows[0] || null;
    // A new result goes on the map and replaces the area's previous one
    if (row) await this.setOnMap(id, true);
    return row;
  }

  /**
   * Pin/unpin an orthomosaic on the dashboard map. Pinning hides other
   * orthomosaics of the same area so only the newest pinned one shows.
   * @param {number} id
   * @param {boolean} visible
   * @returns {Promise<Object|null>}
   */
  static async setOnMap(id, visible) {
    const result = await pool.query(
      `UPDATE orthomosaics SET on_map = $1 WHERE id = $2 RETURNING *`,
      [!!visible, id]
    );
    const row = result.rows[0] || null;
    if (row && visible && row.area_id != null) {
      await pool.query(
        `UPDATE orthomosaics SET on_map = FALSE WHERE area_id = $1 AND id <> $2`,
        [row.area_id, id]
      );
    }
    return row;
  }

  /**
   * Finished orthomosaics pinned to the map, with drone/area labels.
   * @returns {Promise<Array>}
   */
  static async getOnMap() {
    const result = await pool.query(
      `SELECT o.*, s.drone_id, a.name AS area_name
       FROM orthomosaics o
       LEFT JOIN flight_sessions s ON s.id = o.session_id
       LEFT JOIN areas a ON a.id = o.area_id
       WHERE o.on_map = TRUE AND o.status = 'done' AND o.file_path IS NOT NULL
       ORDER BY o.created_at ASC`
    );
    return result.rows;
  }

  /**
   * Mark a job failed with an error message.
   * @param {number} id
   * @param {string} error
   * @returns {Promise<Object|null>}
   */
  static async markError(id, error) {
    const result = await pool.query(
      `UPDATE orthomosaics SET status = 'error', error = $1 WHERE id = $2 RETURNING *`,
      [error, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Most recent orthomosaic for a session (any status).
   * @param {number} sessionId
   * @returns {Promise<Object|null>}
   */
  static async getBySession(sessionId) {
    const result = await pool.query(
      `SELECT * FROM orthomosaics WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * All completed orthomosaics for an area, newest first.
   * @param {number} areaId
   * @returns {Promise<Array>}
   */
  static async getByArea(areaId) {
    const result = await pool.query(
      `SELECT * FROM orthomosaics WHERE area_id = $1 AND status = 'done' ORDER BY created_at DESC`,
      [areaId]
    );
    return result.rows;
  }
}

module.exports = OrthomosaicModel;
