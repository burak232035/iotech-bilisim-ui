const pool = require("../config/database");

class LandcoverAnalysisModel {
  /**
   * Persist one photo's green/concrete segmentation result.
   * @param {number} photoId
   * @param {{green_pct:number, concrete_pct:number, other_pct:number}} data
   * @returns {Promise<Object>}
   */
  static async insert(photoId, { green_pct, concrete_pct, other_pct }) {
    const result = await pool.query(
      `INSERT INTO landcover_analyses (photo_id, green_pct, concrete_pct, other_pct)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [photoId, green_pct, concrete_pct, other_pct]
    );
    return result.rows[0];
  }

  /**
   * Session-wide average green/concrete/other percentages — feeds the
   * dashboard card. Averaging per-photo percentages (rather than summing
   * raw pixel counts across photos) is intentional: photos can differ in
   * altitude/footprint, so a simple mean over comparable percentages is
   * a fairer summary than pooling absolute pixel counts.
   * @param {number} sessionId
   * @returns {Promise<{greenPct:number, concretePct:number, otherPct:number, photoCount:number}>}
   */
  static async getSessionAverage(sessionId) {
    const result = await pool.query(
      `SELECT
         AVG(la.green_pct)::numeric(5,2) as green_pct,
         AVG(la.concrete_pct)::numeric(5,2) as concrete_pct,
         AVG(la.other_pct)::numeric(5,2) as other_pct,
         COUNT(*)::int as photo_count
       FROM landcover_analyses la
       JOIN photos p ON la.photo_id = p.id
       WHERE p.session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0];
    return {
      greenPct: row.photo_count > 0 ? Number(row.green_pct) : 0,
      concretePct: row.photo_count > 0 ? Number(row.concrete_pct) : 0,
      otherPct: row.photo_count > 0 ? Number(row.other_pct) : 0,
      photoCount: row.photo_count
    };
  }
}

module.exports = LandcoverAnalysisModel;
