const pool = require("../config/database");

class FlightSessionModel {
  /**
   * Create new flight session
   * @param {Object} data - {area_id, start_time, start_coordinates, drone_id, drone_serial}
   * @returns {Promise<Object>}
   */
  static async createSession(data) {
    const { area_id, start_time, start_coordinates, drone_id, drone_serial } = data;
    const result = await pool.query(
      `INSERT INTO flight_sessions (area_id, start_time, start_coordinates, status, drone_id, drone_serial)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING *`,
      [
        area_id || null, start_time || new Date(), JSON.stringify(start_coordinates || {}),
        drone_id || null, drone_serial || null
      ]
    );
    console.log(`✅ Flight session created: ID ${result.rows[0].id}`);
    return result.rows[0];
  }

  /**
   * Link a session to the area its mission scans.
   * @param {number} sessionId
   * @param {number} areaId
   * @returns {Promise<Object|null>}
   */
  static async setArea(sessionId, areaId) {
    const result = await pool.query(
      `UPDATE flight_sessions SET area_id = $1 WHERE id = $2 RETURNING *`,
      [areaId, sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * Record the DJI serial once it's known (the app may register before the aircraft connects).
   * @param {number} sessionId
   * @param {string} serial
   * @returns {Promise<Object|null>}
   */
  static async setDroneSerial(sessionId, serial) {
    const result = await pool.query(
      `UPDATE flight_sessions SET drone_serial = $1 WHERE id = $2 RETURNING *`,
      [serial, sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * End flight session and update statistics
   * @param {number} sessionId
   * @returns {Promise<Object>}
   */
  static async endSession(sessionId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Calculate statistics from telemetry_buffer
      const stats = await client.query(
        `SELECT
          COUNT(*) as total_records,
          MIN(battery) as min_battery,
          MAX(battery) as max_battery,
          AVG(battery) as avg_battery,
          MAX(altitude_agl) as max_altitude
         FROM telemetry_buffer
         WHERE session_id = $1`,
        [sessionId]
      );

      const statsData = stats.rows[0];

      // Calculate flight time
      const sessionData = await client.query(
        "SELECT start_time FROM flight_sessions WHERE id = $1",
        [sessionId]
      );

      const startTime = new Date(sessionData.rows[0].start_time);
      const endTime = new Date();
      const flightTimeSeconds = Math.floor((endTime - startTime) / 1000);

      // Update session
      const result = await client.query(
        `UPDATE flight_sessions
         SET
           end_time = $1,
           status = 'completed',
           total_flight_time_seconds = $2,
           min_battery = $3,
           average_battery = $4,
           max_altitude_agl = $5
         WHERE id = $6
         RETURNING *`,
        [
          endTime,
          flightTimeSeconds,
          statsData.min_battery,
          statsData.avg_battery,
          statsData.max_altitude,
          sessionId
        ]
      );

      await client.query("COMMIT");
      console.log(`✅ Flight session ended: ID ${sessionId}, Duration: ${flightTimeSeconds}s`);
      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get session by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async getById(id) {
    const result = await pool.query(
      `SELECT s.*, a.name as area_name
       FROM flight_sessions s
       LEFT JOIN areas a ON s.area_id = a.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all sessions
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getAll(limit = 50) {
    const result = await pool.query(
      `SELECT s.*, a.name as area_name
       FROM flight_sessions s
       LEFT JOIN areas a ON s.area_id = a.id
       ORDER BY s.start_time DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get active sessions
   * @returns {Promise<Array>}
   */
  static async getActiveSessions() {
    const result = await pool.query(
      `SELECT s.*, a.name as area_name
       FROM flight_sessions s
       LEFT JOIN areas a ON s.area_id = a.id
       WHERE s.status = 'active'
       ORDER BY s.start_time DESC`
    );
    return result.rows;
  }
}

module.exports = FlightSessionModel;
