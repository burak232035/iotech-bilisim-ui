const fs = require("fs");
const path = require("path");

const PhotoModel = require("../models/photo.model");
const LandcoverAnalysisModel = require("../models/landcoverAnalysis.model");

const LANDCOVER_SERVICE_URL = process.env.LANDCOVER_SERVICE_URL || "http://127.0.0.1:8001";

class LandcoverAnalysisService {
  /**
   * Run green/concrete segmentation on every not-yet-analyzed photo for
   * a session, then return the session-wide average.
   * @param {number} sessionId
   * @returns {Promise<{total:number, processed:number, failed:number, greenPct:number, concretePct:number, otherPct:number, photoCount:number}>}
   */
  static async analyzeSession(sessionId) {
    const photos = await PhotoModel.getUnanalyzedForLandcover(sessionId);
    const summary = { total: photos.length, processed: 0, failed: 0 };

    for (const photo of photos) {
      try {
        const result = await this._segmentPhoto(photo);
        await LandcoverAnalysisModel.insert(photo.id, result);
        summary.processed += 1;
      } catch (err) {
        console.error(`❌ Foto ${photo.id} yeşil/beton analiz hatası:`, err.message);
        summary.failed += 1;
      }
    }

    const average = await LandcoverAnalysisModel.getSessionAverage(sessionId);
    return { ...summary, ...average };
  }

  /**
   * Call the Python segmentation service for one photo.
   * @param {Object} photo - a row from the photos table
   * @returns {Promise<{green_pct:number, concrete_pct:number, other_pct:number}>}
   */
  static async _segmentPhoto(photo) {
    const fileBuffer = fs.readFileSync(photo.file_path);
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), path.basename(photo.file_path));

    const resp = await fetch(`${LANDCOVER_SERVICE_URL}/segment`, {
      method: "POST",
      body: form
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Segmentasyon servisi hatası (${resp.status}): ${errText}`);
    }

    const { green_pct, concrete_pct, other_pct } = await resp.json();
    return { green_pct, concrete_pct, other_pct };
  }
}

module.exports = LandcoverAnalysisService;
