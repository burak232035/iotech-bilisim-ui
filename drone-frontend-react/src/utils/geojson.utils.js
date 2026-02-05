/**
 * GeoJSON ↔ Database Polygon Conversion Utilities
 * Ported from harita.js lines 950-979
 */

/**
 * Convert Leaflet GeoJSON feature to DB polygon format
 * @param {Object} feature - GeoJSON feature from Leaflet
 * @returns {Object} DB polygon format { type: "polygon", points: [[lat,lon], ...] }
 */
export function geojsonFeatureToDbPolygon(feature) {
  const geom = feature?.geometry;
  if (!geom || geom.type !== 'Polygon') {
    throw new Error('Sadece Polygon/Rectangle destekleniyor.');
  }

  const ring = geom.coordinates[0]; // [ [lon,lat], ... ]
  const pointsLatLon = ring.map(([lon, lat]) => [lat, lon]);

  return {
    type: 'polygon',
    points: pointsLatLon
  };
}

/**
 * Convert DB polygon to GeoJSON feature
 * @param {Object} areaRow - Area from database with coordinates: { type, points }
 * @returns {Object} GeoJSON feature
 */
export function dbPolygonToGeojsonFeature(areaRow) {
  const ringLonLat = areaRow.coordinates.points.map(([lat, lon]) => [lon, lat]);

  const first = ringLonLat[0];
  const last = ringLonLat[ringLonLat.length - 1];

  // Close ring if not already closed
  const closedRing =
    first && last && (first[0] !== last[0] || first[1] !== last[1])
      ? [...ringLonLat, first]
      : ringLonLat;

  return {
    type: 'Feature',
    properties: {
      title: areaRow.name,
      id: areaRow.id
    },
    geometry: {
      type: 'Polygon',
      coordinates: [closedRing]
    }
  };
}

/**
 * Extract points [[lat,lon],...] from Leaflet layer
 * @param {L.Layer} layer - Leaflet layer
 * @returns {Array|null} Array of [lat,lon] points or null
 */
export function getPointsFromLayer(layer) {
  if (!layer) return null;

  const feature = layer.toGeoJSON?.();
  const geom = feature?.geometry;

  if (!geom || geom.type !== 'Polygon') return null;

  const ring = geom.coordinates?.[0]; // [ [lon,lat], ... ]
  if (!Array.isArray(ring) || ring.length < 3) return null;

  // Convert to [lat,lon]
  const pointsLatLon = ring.map(([lon, lat]) => [lat, lon]);

  // Remove last point if ring is closed
  if (pointsLatLon.length >= 2) {
    const first = pointsLatLon[0];
    const last = pointsLatLon[pointsLatLon.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      pointsLatLon.pop();
    }
  }

  return pointsLatLon;
}
