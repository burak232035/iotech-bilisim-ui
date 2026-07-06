/**
 * WaypointPlannerService
 * Boustrophedon (lawnmower) coverage path planning for DJI Mini 4 Pro.
 *
 * Algorithm:
 *  1. Project polygon lat/lon → local metres (equirectangular, centroid origin)
 *  2. Find the sweep angle [0-179°] that minimises the polygon height (fewest strips)
 *  3. Rotate polygon into sweep coordinates, slice with horizontal scan lines
 *  4. Clip each scan line to the polygon (even-odd rule → handles concave shapes)
 *  5. Insert bypass waypoints around obstacle circles
 *  6. Order strips in boustrophedon pattern (left→right / right→left alternating)
 *  7. Rotate all waypoints back and convert to lat/lon
 *
 * DJI Mini 4 Pro specs used:
 *   Horizontal FOV : 82.1°
 *   Max waypoint speed: 15 m/s
 */

const EARTH_R = 6371000;           // metres
const HFOV_DEG = 82.1;             // DJI Mini 4 Pro horizontal FOV
const OBSTACLE_BUFFER_M = 8;       // safety margin added to obstacle radius

class WaypointPlannerService {

  /**
   * Main entry point.
   *
   * @param {Array<[number,number]>} polygonPoints  [[lat,lon], …]  min 3 pts
   * @param {Array<{lat,lon,radius_m}>} obstacles   (may be empty)
   * @param {{ altitudeM, overlapPercent, speedMs }} options
   * @returns {{
   *   waypoints:       Array<{lat,lon,altitude,speed,actions}>,
   *   totalDistanceM:  number,
   *   waypointCount:   number,
   *   stripSpacingM:   number,
   *   footprintWidthM: number,
   *   sweepAngleDeg:   number
   * }}
   */
  static generateScanRoute(polygonPoints, obstacles = [], options = {}) {
    const {
      altitudeM      = 50,
      overlapPercent = 70,
      speedMs        = 8
    } = options;

    if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) {
      throw new Error("Geçersiz poligon: en az 3 nokta gerekli");
    }

    // Camera footprint and strip spacing
    const footprintWidthM = 2 * altitudeM * Math.tan((HFOV_DEG / 2) * Math.PI / 180);
    const stripSpacingM   = footprintWidthM * (1 - overlapPercent / 100);

    if (stripSpacingM < 0.5) {
      throw new Error("Çakışma oranı çok yüksek: şerit aralığı < 0.5 m");
    }

    // Remove duplicate closing point if present
    let pts = polygonPoints.slice();
    const f = pts[0], l = pts[pts.length - 1];
    if (pts.length >= 4 && Math.abs(f[0] - l[0]) < 1e-8 && Math.abs(f[1] - l[1]) < 1e-8) {
      pts = pts.slice(0, -1);
    }

    // Project to local metric space
    const centroid = this._centroid(pts);
    const localPoly = pts.map(([lat, lon]) => this._toLocal(lat, lon, centroid));
    const localObs  = obstacles.map(o => ({
      ...this._toLocal(Number(o.lat), Number(o.lon), centroid),
      r: (Number(o.radius_m) || 5) + OBSTACLE_BUFFER_M
    }));

    // Optimal sweep angle
    const sweepAngleDeg = this._optimalSweepAngle(localPoly);
    const sweepRad      = sweepAngleDeg * Math.PI / 180;

    // Rotate to sweep coordinate system
    const rotPoly = localPoly.map(p => this._rotate(p, -sweepRad));
    const rotObs  = localObs.map(o => ({
      ...this._rotate({ x: o.x, y: o.y }, -sweepRad),
      r: o.r
    }));

    const ys   = rotPoly.map(p => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Collect all clipped scan segments
    const allSegs = [];
    for (let y = minY + stripSpacingM / 2; y < maxY; y += stripSpacingM) {
      this._clipHLine(y, rotPoly).forEach(seg => allSegs.push({ y, ...seg }));
    }

    if (allSegs.length === 0) {
      throw new Error(
        "Alan için tarama şeridi oluşturulamadı. Alan çok küçük ya da poligon geçersiz."
      );
    }

    // Group by y-level (floating-point safe: round to cm)
    const yGroups = new Map();
    for (const seg of allSegs) {
      const key = seg.y.toFixed(4);
      if (!yGroups.has(key)) yGroups.set(key, []);
      yGroups.get(key).push(seg);
    }

    const sortedYKeys = [...yGroups.keys()].sort(
      (a, b) => parseFloat(a) - parseFloat(b)
    );

    // Boustrophedon traversal
    const waypoints = [];
    let totalDistM  = 0;
    let prevLocal   = null;
    let dir         = 1; // +1 = left→right, -1 = right→left

    for (const yKey of sortedYKeys) {
      const segs = yGroups.get(yKey);

      // Sort sub-segments within this strip according to travel direction
      segs.sort((a, b) => dir > 0 ? a.x1 - b.x1 : b.x2 - a.x2);

      for (const seg of segs) {
        const fromX = dir > 0 ? seg.x1 : seg.x2;
        const toX   = dir > 0 ? seg.x2 : seg.x1;

        const pts2D = this._withObstacleBypass(
          { x: fromX, y: seg.y },
          { x: toX,   y: seg.y },
          rotObs,
          dir
        );

        for (const rPt of pts2D) {
          const origPt = this._rotate(rPt, sweepRad);
          const ll     = this._fromLocal(origPt, centroid);

          if (prevLocal) totalDistM += this._dist(prevLocal, origPt);

          waypoints.push({
            lat:      Math.round(ll.lat * 1e8) / 1e8,
            lon:      Math.round(ll.lon * 1e8) / 1e8,
            altitude: altitudeM,
            speed:    speedMs,
            actions:  ["shoot_photo"]
          });

          prevLocal = origPt;
        }
      }

      dir *= -1;
    }

    return {
      waypoints,
      totalDistanceM:  Math.round(totalDistM),
      waypointCount:   waypoints.length,
      stripSpacingM:   Math.round(stripSpacingM * 10) / 10,
      footprintWidthM: Math.round(footprintWidthM * 10) / 10,
      sweepAngleDeg:   Math.round(sweepAngleDeg * 10) / 10
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Find angle [0, 179°] that minimises polygon height (= fewest strips). */
  static _optimalSweepAngle(polygon) {
    let bestAngle = 0, bestH = Infinity;

    // Coarse pass: every 5°
    for (let d = 0; d < 180; d += 5) {
      const r  = d * Math.PI / 180;
      const ys = polygon.map(p => this._rotate(p, -r).y);
      const h  = Math.max(...ys) - Math.min(...ys);
      if (h < bestH) { bestH = h; bestAngle = d; }
    }

    // Fine pass: ±5° in 0.5° steps
    for (let d = bestAngle - 5; d <= bestAngle + 5; d += 0.5) {
      const r  = d * Math.PI / 180;
      const ys = polygon.map(p => this._rotate(p, -r).y);
      const h  = Math.max(...ys) - Math.min(...ys);
      if (h < bestH) { bestH = h; bestAngle = d; }
    }

    return bestAngle;
  }

  /**
   * Clip horizontal line y=Y to polygon (even-odd rule).
   * Handles convex AND concave polygons.
   * @returns {Array<{x1,x2}>}
   */
  static _clipHLine(y, polygon) {
    const xs = [];
    const n  = polygon.length;

    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];

      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }

    xs.sort((a, b) => a - b);

    const segs = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 0.05) {
        segs.push({ x1: xs[i], x2: xs[i + 1] });
      }
    }
    return segs;
  }

  /**
   * Build waypoints for one scan segment, inserting bypass around obstacles.
   * All coordinates are in rotated (sweep) space.
   */
  static _withObstacleBypass(from, to, obstacles, dir) {
    const y    = from.y;
    const xMin = Math.min(from.x, to.x);
    const xMax = Math.max(from.x, to.x);

    const blocking = obstacles.filter(o => {
      const dy = Math.abs(y - o.y);
      if (dy >= o.r) return false;
      const hw = Math.sqrt(o.r * o.r - dy * dy);
      return o.x + hw > xMin && o.x - hw < xMax;
    });

    if (blocking.length === 0) return [from, to];

    blocking.sort((a, b) => dir > 0 ? a.x - b.x : b.x - a.x);

    const pts = [from];

    for (const obs of blocking) {
      const dy  = Math.abs(y - obs.y);
      const hw  = Math.sqrt(obs.r * obs.r - dy * dy);

      const entryX  = dir > 0 ? obs.x - hw : obs.x + hw;
      const exitX   = dir > 0 ? obs.x + hw : obs.x - hw;

      // Bypass on the same side as the scan line (closest point outside the circle)
      const bypassY = obs.y + (y <= obs.y ? -obs.r : obs.r);

      pts.push({ x: entryX, y });
      pts.push({ x: obs.x,  y: bypassY });
      pts.push({ x: exitX,  y });
    }

    pts.push(to);
    return pts;
  }

  static _centroid(pts) {
    return {
      lat: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      lon: pts.reduce((s, p) => s + p[1], 0) / pts.length
    };
  }

  static _toLocal(lat, lon, c) {
    return {
      x: (lon - c.lon) * Math.PI / 180 * EARTH_R * Math.cos(c.lat * Math.PI / 180),
      y: (lat - c.lat) * Math.PI / 180 * EARTH_R
    };
  }

  static _fromLocal(pt, c) {
    return {
      lat: c.lat + (pt.y / EARTH_R) * (180 / Math.PI),
      lon: c.lon + (pt.x / (EARTH_R * Math.cos(c.lat * Math.PI / 180))) * (180 / Math.PI)
    };
  }

  static _rotate(pt, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos };
  }

  static _dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}

module.exports = WaypointPlannerService;
