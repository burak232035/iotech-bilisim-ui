const fs = require("fs");
const path = require("path");

const PhotoModel = require("../models/photo.model");
const WasteDetectionModel = require("../models/wasteDetection.model");
const GeoProjectionService = require("./geoProjection.service");

const DETECTION_SERVICE_URL = process.env.WASTE_DETECTION_URL || "http://127.0.0.1:8000";

class WasteDetectionService {
  /**
   * Run YOLO classification on every not-yet-classified photo for a session.
   * @param {number} sessionId
   * @returns {Promise<{total:number, processed:number, failed:number, detections:number}>}
   */
  static async classifySession(sessionId) {
    const photos = await PhotoModel.getUnclassifiedBySession(sessionId);
    const summary = { total: photos.length, processed: 0, failed: 0, detections: 0 };

    for (const photo of photos) {
      try {
        const detections = await this._detectPhoto(photo);

        if (detections.length > 0) {
          await WasteDetectionModel.bulkInsert(photo.id, detections);
        }
        await PhotoModel.markClassified(photo.id);

        summary.processed += 1;
        summary.detections += detections.length;
      } catch (err) {
        console.error(`❌ Foto ${photo.id} sınıflandırma hatası:`, err.message);
        summary.failed += 1;
      }
    }

    return summary;
  }

  /**
   * Call the Python detection service for one photo and project the
   * resulting bounding boxes to real-world lat/lon.
   * @param {Object} photo - a row from the photos table
   * @returns {Promise<Array<{category, confidence, bbox, lat, lon}>>}
   */
  static async _detectPhoto(photo) {
    const fileBuffer = fs.readFileSync(photo.file_path);
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), path.basename(photo.file_path));

    const resp = await fetch(`${DETECTION_SERVICE_URL}/detect`, {
      method: "POST",
      body: form
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Detection servisi hatası (${resp.status}): ${errText}`);
    }

    const { detections } = await resp.json();
    const photoLat = Number(photo.lat);
    const photoLon = Number(photo.lon);
    const photoAlt = Number(photo.altitude_agl);
    const photoHeading = Number(photo.heading) || 0;

    return detections.map((d) => {
      const pos = GeoProjectionService.projectBboxToLatLon(photoLat, photoLon, photoAlt, d.bbox_norm, photoHeading);
      return {
        category: d.category,
        confidence: d.confidence,
        bbox: d.bbox_norm,
        lat: pos.lat,
        lon: pos.lon
      };
    });
  }
}

module.exports = WasteDetectionService;
