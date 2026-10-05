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
    return result.rows[0] || null;
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
