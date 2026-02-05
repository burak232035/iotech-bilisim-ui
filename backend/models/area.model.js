const pool = require("../config/database");

class AreaModel {
  /**
   * Get all areas
   * @returns {Promise<Array>}
   */
  static async getAll() {
    const result = await pool.query(
      "SELECT * FROM areas ORDER BY created_at ASC"
    );
    return result.rows;
  }

  /**
   * Get area by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async getById(id) {
    const result = await pool.query(
      "SELECT * FROM areas WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new area
   * @param {string} name
   * @param {Object} coordinates - {type: "polygon", points: [[lat, lon], ...]}
   * @returns {Promise<Object>}
   */
  static async create(name, coordinates) {
    const result = await pool.query(
      `INSERT INTO areas (name, coordinates)
       VALUES ($1, $2)
       RETURNING *`,
      [name, JSON.stringify(coordinates)]
    );
    return result.rows[0];
  }

  /**
   * Update area
   * @param {number} id
   * @param {string} name
   * @param {Object} coordinates
   * @returns {Promise<Object|null>}
   */
  static async update(id, name, coordinates) {
    const result = await pool.query(
      `UPDATE areas
       SET name = $1, coordinates = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [name, JSON.stringify(coordinates), id]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete area
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async delete(id) {
    const result = await pool.query(
      "DELETE FROM areas WHERE id = $1 RETURNING *",
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = AreaModel;
