const fs = require("fs");
const path = require("path");

const PhotoModel = require("../models/photo.model");
const WasteDetectionModel = require("../models/wasteDetection.model");
const GeoProjectionService = require("./geoProjection.service");

const DETECTION_SERVICE_URL = process.env.WASTE_DETECTION_URL || "http://127.0.0.1:8000";

// Overlapping photos see the same item twice: a detection of the same
// category this close to one already stored for the session is dropped.
const DEDUP_RADIUS_M = Number(process.env.WASTE_DEDUP_RADIUS_M) || 2;
// Largest ground size (longest side, metres) a single waste item can have
const MAX_ITEM_SIZE_M = Number(process.env.WASTE_MAX_ITEM_SIZE_M) || 6;
// DJI Mini 4 Pro camera — same values as geoProjection.service.js
const HFOV_DEG = 82.1;
const PHOTO_ASPECT = 4 / 3;
const M_PER_DEG_LAT = 111319.9;

function distanceM(aLat, aLon, bLat, bLon) {
  const dy = (aLat - bLat) * M_PER_DEG_LAT;
  const dx = (aLon - bLon) * M_PER_DEG_LAT * Math.cos(aLat * Math.PI / 180);
  return Math.hypot(dx, dy);
}

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
        const stored = await this.detectAndStore(photo);
        summary.processed += 1;
        summary.detections += stored.length;
      } catch (err) {
        console.error(`❌ Foto ${photo.id} sınıflandırma hatası:`, err.message);
        summary.failed += 1;
      }
    }

    return summary;
  }

  /**
   * Detect one photo, drop near-duplicates of detections already stored for
   * its session, store the rest and mark the photo classified.
   * @param {Object} photo - a row from the photos table
   * @returns {Promise<Array>} the newly stored detection rows
   */
  static async detectAndStore(photo) {
    const detections = await this._detectPhoto(photo);
    let fresh = detections;
    if (detections.length > 0) {
      const existing = await WasteDetectionModel.getBySession(photo.session_id);
      const kept = [];
      fresh = detections.filter((d) => {
        const dup = [...existing, ...kept].some((e) =>
          e.category === d.category &&
          distanceM(Number(e.lat), Number(e.lon), d.lat, d.lon) < DEDUP_RADIUS_M
        );
        if (!dup) kept.push(d);
        return !dup;
      });
    }
    const stored = fresh.length > 0 ? await WasteDetectionModel.bulkInsert(photo.id, fresh) : [];
    await PhotoModel.markClassified(photo.id);
    return stored;
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

    // Drop boxes too big to be a single waste item (e.g. a parked car or a
    // scaffold): convert the box to metres on the ground from the altitude.
    const footprintW = 2 * Math.max(photoAlt || 30, 5) * Math.tan((HFOV_DEG / 2) * Math.PI / 180);
    const footprintH = footprintW / PHOTO_ASPECT;
    const fitsItem = (b) =>
      Math.max((b[2] - b[0]) * footprintW, (b[3] - b[1]) * footprintH) <= MAX_ITEM_SIZE_M;

    return detections.filter((d) => fitsItem(d.bbox_norm)).map((d) => {
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
