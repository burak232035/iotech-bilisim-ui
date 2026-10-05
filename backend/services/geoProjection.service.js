/**
 * GeoProjectionService
 *
 * Converts a YOLO bounding box (normalized 0-1, within the photo) into a
 * real-world lat/lon, using the photo's own GPS position + altitude +
 * compass heading.
 *
 * Same DJI Mini 4 Pro HFOV (82.1°) and photo-footprint math already used
 * on the frontend (LeafletMap.jsx calcRotatedPhotoCorners) and in the
 * mission planner (waypointPlanner.service.js) — kept in sync here for
 * the server-side detection pipeline.
 *
 * Heading rotation IS applied (as of the mosaic-alignment fix): the
 * mission's sweep angle is rarely due north, so treating every photo as a
 * north-aligned rectangle placed real detections at the wrong spot
 * whenever the flight heading wasn't ~0°. "Top" of the photo = the far
 * edge in the direction of travel (nose-forward = image-up for a nadir,
 * non-rolled shot), matching the frontend's corner calculation.
 */

const HFOV_DEG = 82.1;
const PHOTO_ASPECT = 4 / 3; // width / height
const METERS_PER_DEG_LAT = 111319.9;

class GeoProjectionService {
  /**
   * @param {number} photoLat
   * @param {number} photoLon
   * @param {number} altitudeM - AGL altitude the photo was taken at
   * @param {[number,number,number,number]} bboxNorm - [x1,y1,x2,y2], each 0-1
   * @param {number} headingDeg - compass bearing in degrees, 0=N, 90=E, clockwise
   * @returns {{lat:number, lon:number}}
   */
  static projectBboxToLatLon(photoLat, photoLon, altitudeM, bboxNorm, headingDeg = 0) {
    const alt = Math.max(Number(altitudeM) || 30, 5);
    const halfWidthM = alt * Math.tan((HFOV_DEG / 2) * Math.PI / 180);
    const halfHeightM = halfWidthM / PHOTO_ASPECT;

    const [x1, y1, x2, y2] = bboxNorm;
    const fx = (x1 + x2) / 2; // 0 = left edge, 1 = right edge
    const fy = (y1 + y2) / 2; // 0 = top edge (forward), 1 = bottom edge (backward)

    // Offsets in the photo's own frame, in metres, before rotation
    const offsetForward = (0.5 - fy) * 2 * halfHeightM; // + = ahead (heading direction)
    const offsetRight    = (fx - 0.5) * 2 * halfWidthM;  // + = right of heading

    const h = (Number(headingDeg) || 0) * Math.PI / 180;
    const fwd   = [Math.sin(h), Math.cos(h)];   // [East, North] unit vector along heading
    const right = [Math.cos(h), -Math.sin(h)];  // [East, North] unit vector 90° clockwise of heading

    const east  = fwd[0] * offsetForward + right[0] * offsetRight;
    const north = fwd[1] * offsetForward + right[1] * offsetRight;

    return {
      lat: photoLat + north / METERS_PER_DEG_LAT,
      lon: photoLon + east / (METERS_PER_DEG_LAT * Math.cos(photoLat * Math.PI / 180))
    };
  }
}

module.exports = GeoProjectionService;
