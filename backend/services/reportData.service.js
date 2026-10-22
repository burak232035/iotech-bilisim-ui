const pool = require("../config/database");

class ReportDataService {
  /**
   * Generate report data from real telemetry and session data
   * @param {number} sessionId
   * @returns {Promise<Object>}
   */
  static async generateReportData(sessionId) {
    // Query session data with area information
    const sessionResult = await pool.query(
      `SELECT s.*, a.name as area_name, a.coordinates
       FROM flight_sessions s
       LEFT JOIN areas a ON s.area_id = a.id
       WHERE s.id = $1`,
      [sessionId]
    );

    const session = sessionResult.rows[0];
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Query telemetry statistics
    const telemetryResult = await pool.query(
      `SELECT
         MIN(battery) as min_battery,
         MAX(battery) as max_battery,
         AVG(battery) as avg_battery,
         MAX(altitude_agl) as max_altitude,
         COUNT(*) as data_points
       FROM telemetry_data
       WHERE session_id = $1`,
      [sessionId]
    );

    const stats = telemetryResult.rows[0];

    // If no telemetry_data, try buffer
    let bufferStats = null;
    if (!stats.data_points || stats.data_points === "0") {
      const bufferResult = await pool.query(
        `SELECT
           MIN(battery) as min_battery,
           MAX(battery) as max_battery,
           AVG(battery) as avg_battery,
           MAX(altitude_agl) as max_altitude,
           COUNT(*) as data_points
         FROM telemetry_buffer
         WHERE session_id = $1`,
        [sessionId]
      );
      bufferStats = bufferResult.rows[0];
    }

    const finalStats = (stats.data_points && stats.data_points !== "0") ? stats : bufferStats;

    // Calculate flight duration
    const startTime = new Date(session.start_time);
    const endTime = session.end_time ? new Date(session.end_time) : new Date();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);
    const durationSecs = durationSeconds % 60;
    const durationFormatted = `${String(durationMinutes).padStart(2, '0')}:${String(durationSecs).padStart(2, '0')}`;

    // Coordinates: the session's recorded first/last GPS fix; for flights
    // recorded before that was tracked, fall back to the first/last photo.
    const fmtCoord = (c) =>
      c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))
        ? `${Number(c.lat).toFixed(6)}, ${Number(c.lon).toFixed(6)}`
        : null;

    let startCoords = fmtCoord(session.start_coordinates);
    let endCoords = fmtCoord(session.end_coordinates);
    let distanceM = session.total_distance_meters != null ? Number(session.total_distance_meters) : null;

    if (!startCoords || !endCoords || distanceM == null) {
      const photos = await pool.query(
        `SELECT lat, lon FROM photos WHERE session_id = $1
         ORDER BY COALESCE(captured_at, uploaded_at), id`,
        [sessionId]
      );
      const rows = photos.rows;
      if (rows.length) {
        if (!startCoords) startCoords = fmtCoord(rows[0]);
        if (!endCoords) endCoords = fmtCoord(rows[rows.length - 1]);
        if (distanceM == null && rows.length > 1) {
          // Photo-to-photo path length: a lower bound of the distance flown
          const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
          distanceM = 0;
          for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1], b = rows[i];
            const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
            const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLon / 2) ** 2;
            distanceM += 2 * R * Math.asin(Math.sqrt(h));
          }
        }
      }
    }
    startCoords = startCoords || "N/A";
    endCoords = endCoords || startCoords;

    // Generate report number
    const reportNumber = `RPR-${session.id}-${Date.now()}`;

    // Format dates in Turkish format
    const formatDate = (date) => {
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    };

    const formatTime = (date) => {
      const d = new Date(date);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    const now = new Date();

    return {
      raporNo: reportNumber,
      vakaEtiketi: session.area_name || `Session ${session.id}`,
      ucusTarihi: formatDate(startTime),
      ucusSaati: formatTime(startTime),
      analizTarihi: formatDate(now),
      analizSaati: formatTime(now),
      baslangic: startCoords,
      bitis: endCoords,
      taramaMesafesi: distanceM != null && distanceM > 0
        ? (distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km` : `${Math.round(distanceM)} m`)
        : "N/A",
      ucusSuresi: durationFormatted,
      genelDegerlendirme: "0 tespit", // report.routes.js gerçek waste_detections toplamıyla değiştirir
      toplamFrame: finalStats?.data_points || 0,
      raporStride: "10", // 1 Hz sampling (every 10th record from 10 Hz)
      haritaGorseli: "https://via.placeholder.com/420x260?text=Harita+Gorseli", // TODO: Generate from area coordinates

      // Real telemetry data
      droneSarj: finalStats?.avg_battery
        ? `${Number(finalStats.avg_battery).toFixed(1)}%`
        : "N/A",
      minBattery: finalStats?.min_battery
        ? `${Number(finalStats.min_battery).toFixed(1)}%`
        : "N/A",
      maxAltitude: finalStats?.max_altitude
        ? `${Number(finalStats.max_altitude).toFixed(1)} m`
        : "N/A",
      ucusSuresiDetay: durationFormatted,
      gimbalBilgisi: "Pitch: 0° / Roll: 0° / Yaw: 0°"
    };
  }
}

module.exports = ReportDataService;
