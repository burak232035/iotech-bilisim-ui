const pool = require("../config/database");

class TelemetryService {
  constructor() {
    this.buffer = [];
    this.lastBroadcast = new Map(); // clientId -> timestamp
    this.BUFFER_FLUSH_INTERVAL = 5000; // 5 seconds
    this.BROADCAST_THROTTLE = 1000; // 1 Hz to web clients
    this.SAMPLING_INTERVAL = 5 * 60 * 1000; // 5 minutes

    // Start background jobs
    this.startBufferFlush();
    this.startSampling();
  }

  /**
   * Add telemetry to in-memory buffer
   * @param {number} sessionId
   * @param {Object} data - Telemetry data from drone
   */
  bufferTelemetry(sessionId, data) {
    this.buffer.push({
      session_id: sessionId,
      timestamp: data.timestamp || Date.now(),
      battery: data.battery || null,
      gimbal_pitch: data.gimbal?.pitch || null,
      gimbal_roll: data.gimbal?.roll || null,
      gimbal_yaw: data.gimbal?.yaw || null,
      altitude_agl: data.altitude?.agl || null,
      altitude_amsl: data.altitude?.amsl || null,
      gps_signal_level: data.gps?.signalLevel || null,
      gps_satellite_count: data.gps?.satelliteCount || null
    });
  }

  /**
   * Flush buffer to database every 5 seconds (batch insert)
   */
  startBufferFlush() {
    setInterval(async () => {
      if (this.buffer.length === 0) return;

      const batch = this.buffer.splice(0, this.buffer.length);

      try {
        // Build batch INSERT query
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const t of batch) {
          values.push(
            `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9})`
          );
          params.push(
            t.session_id, t.timestamp, t.battery, t.gimbal_pitch, t.gimbal_roll,
            t.gimbal_yaw, t.altitude_agl, t.altitude_amsl, t.gps_signal_level, t.gps_satellite_count
          );
          paramIndex += 10;
        }

        await pool.query(`
          INSERT INTO telemetry_buffer
          (session_id, timestamp, battery, gimbal_pitch, gimbal_roll, gimbal_yaw,
           altitude_agl, altitude_amsl, gps_signal_level, gps_satellite_count)
          VALUES ${values.join(',')}
        `, params);

        console.log(`📊 Flushed ${batch.length} telemetry records to buffer`);
      } catch (err) {
        console.error("❌ Buffer flush error:", err.message);
        // Re-add to buffer on failure
        this.buffer.unshift(...batch);
      }
    }, this.BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Sample buffer data to permanent storage (every 5 minutes)
   * Samples every 10th record (1 Hz) from buffer
   */
  startSampling() {
    setInterval(async () => {
      try {
        // Sample every 10th record (1 Hz) from buffer and insert into telemetry_data
        const sampleResult = await pool.query(`
          INSERT INTO telemetry_data
          (session_id, timestamp, battery, gimbal_pitch, gimbal_roll, gimbal_yaw,
           altitude_agl, altitude_amsl, gps_signal_level, gps_satellite_count)
          SELECT session_id, timestamp, battery, gimbal_pitch, gimbal_roll, gimbal_yaw,
                 altitude_agl, altitude_amsl, gps_signal_level, gps_satellite_count
          FROM (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp) as rn
            FROM telemetry_buffer
            WHERE received_at < NOW() - INTERVAL '1 minute'
          ) sampled
          WHERE rn % 10 = 0
          ON CONFLICT DO NOTHING
        `);

        // Delete old buffer data (older than 1 hour)
        const deleteResult = await pool.query(`
          DELETE FROM telemetry_buffer
          WHERE received_at < NOW() - INTERVAL '1 hour'
        `);

        console.log(`🗂️  Sampled ${sampleResult.rowCount || 0} records. Deleted ${deleteResult.rowCount || 0} old buffer records`);
      } catch (err) {
        console.error("❌ Sampling error:", err.message);
      }
    }, this.SAMPLING_INTERVAL);
  }

  /**
   * Broadcast telemetry to web clients (throttled to 1 Hz per client)
   * @param {Object} io - Socket.IO server instance
   * @param {Set} webClients - Set of web client IDs
   * @param {Object} data - Telemetry data
   */
  broadcastTelemetry(io, webClients, data) {
    const now = Date.now();

    webClients.forEach((clientId) => {
      const lastSent = this.lastBroadcast.get(clientId) || 0;

      if (now - lastSent >= this.BROADCAST_THROTTLE) {
        io.to(clientId).emit("drone_telemetry", data);
        this.lastBroadcast.set(clientId, now);
      }
    });
  }

  /**
   * Get telemetry for a session
   * @param {number} sessionId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getBySession(sessionId, limit = 1000) {
    const result = await pool.query(
      `SELECT * FROM telemetry_data
       WHERE session_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows;
  }

  /**
   * Get latest telemetry for a session
   * @param {number} sessionId
   * @returns {Promise<Object|null>}
   */
  static async getLatest(sessionId) {
    const result = await pool.query(
      `SELECT * FROM telemetry_buffer
       WHERE session_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [sessionId]
    );
    return result.rows[0] || null;
  }
}

// Export singleton instance
module.exports = new TelemetryService();
