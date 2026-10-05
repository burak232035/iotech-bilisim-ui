/**
 * LeafletMap Component
 * Core map with Leaflet + Leaflet Draw integration + drone photo overlay
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-imageoverlay-rotated';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { ApiService } from '@services/api.service';
import { MAP_CONFIG, AREA_COLORS, WASTE_CATEGORY_COLORS } from '@utils/constants';
import {
  geojsonFeatureToDbPolygon,
  dbPolygonToGeojsonFeature
} from '@utils/geojson.utils';
import { escapeHtml } from '@utils/validation.utils';

// Fix Leaflet default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

// DJI Mini 4 Pro: HFOV 82.1°, aspect 4:3
const HFOV_DEG = 82.1;
const PHOTO_ASPECT = 4 / 3; // width / height

const METERS_PER_DEG_LAT = 111319.9;

/**
 * Given a nadir photo's GPS position, altitude and compass heading, return
 * the three corners (topLeft, topRight, bottomLeft) L.imageOverlay.rotated
 * needs to place the image with the correct real-world rotation.
 *
 * "Top" of the image = the far edge in the direction of travel (heading);
 * this matches how the drone captures it (nose-forward = image-up) and how
 * the backend's geoProjection.service.js interprets waypoint photos.
 * heading: compass bearing in degrees, 0=N, 90=E, clockwise.
 */
function calcRotatedPhotoCorners(lat, lon, altitudeM, headingDeg) {
  const alt = Math.max(altitudeM || 30, 5);
  const halfWidthM  = alt * Math.tan((HFOV_DEG / 2) * Math.PI / 180);
  const halfHeightM = halfWidthM / PHOTO_ASPECT;

  const h = ((headingDeg || 0) * Math.PI) / 180;
  // Forward (heading direction) and right (90° clockwise from heading) unit vectors, as [East, North]
  const fwd   = [Math.sin(h), Math.cos(h)];
  const right = [Math.cos(h), -Math.sin(h)];

  const toLatLon = ([east, north]) => [
    lat + north / METERS_PER_DEG_LAT,
    lon + east / (METERS_PER_DEG_LAT * Math.cos(lat * Math.PI / 180))
  ];

  const add = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s];

  const topLeft    = toLatLon(add(add([0, 0], fwd, halfHeightM), right, -halfWidthM));
  const topRight   = toLatLon(add(add([0, 0], fwd, halfHeightM), right,  halfWidthM));
  const bottomLeft = toLatLon(add(add([0, 0], fwd, -halfHeightM), right, -halfWidthM));

  return { topLeft, topRight, bottomLeft };
}

export function LeafletMap() {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const drawnItemsRef  = useRef(null);
  const scanLayerRef   = useRef(null);
  const wasteLayerRef  = useRef(null);
  const orthomosaicLayerRef = useRef(null);
  const photoLayersRef = useRef([]);   // array of L.imageOverlay instances
  const droneMarkerRef = useRef(null); // live drone position marker
  const hasCenteredOnDroneRef = useRef(false); // pan to drone only on its first live fix

  const {
    setMap,
    setDrawnItems,
    loadAreas,
    selectArea,
    drawOrder,
    addArea,
    scanRoute,
    incrementPhotoCount,
    clearPhotosFlag,
    wasteDetections,
    orthomosaicLayer
  } = useMap();

  const { socket } = useSocket();

  // ── Map initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = L.map(mapRef.current).setView(
      MAP_CONFIG.CENTER,
      MAP_CONFIG.ZOOM
    );
    mapInstanceRef.current = mapInstance;

    L.tileLayer(MAP_CONFIG.TILE_LAYER, {
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);

    // Drone marker (updated via telemetry)
    const droneIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px; height:28px;
        background:radial-gradient(circle,#22c55e,#166534);
        border:2px solid #fff;
        border-radius:50%;
        box-shadow:0 0 8px rgba(34,197,94,0.8);
        display:flex; align-items:center; justify-content:center;
        font-size:14px;
      ">🚁</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    droneMarkerRef.current = L.marker(MAP_CONFIG.CENTER, { icon: droneIcon })
      .addTo(mapInstance)
      .bindPopup('Drone Konumu');

    const drawnItemsLayer = new L.FeatureGroup();
    mapInstance.addLayer(drawnItemsLayer);
    drawnItemsRef.current = drawnItemsLayer;

    setMap(mapInstance);
    setDrawnItems(drawnItemsLayer);

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon:      true,
        rectangle:    true,
        circle:       false,
        circlemarker: false,
        polyline:     false,
        marker:       false
      },
      edit: { featureGroup: drawnItemsLayer }
    });
    mapInstance.addControl(drawControl);

    mapInstance.on(L.Draw.Event.CREATED, async (e) => {
      const layer = e.layer;
      drawnItemsLayer.addLayer(layer);

      const name = prompt(
        'Bu alanın adı ne olsun?',
        `alan-${drawOrder.length + 1}`
      );
      if (!name) {
        drawnItemsLayer.removeLayer(layer);
        return;
      }

      try {
        const feature  = layer.toGeoJSON();
        const dbPolygon = geojsonFeatureToDbPolygon(feature);
        const savedArea = await ApiService.createArea(name, dbPolygon);
        const sortedAreas = await loadAreas();
        drawnItemsLayer.removeLayer(layer);

        // Render the newly saved area immediately — without this, it only appeared
        // after a full page reload (loadAreas() alone just updates the dropdown list,
        // it doesn't draw anything), and deleting it right after creating silently
        // no-op'd because it was never added to the `areas` map either.
        const orderIndex = sortedAreas.findIndex(a => String(a.id) === String(savedArea.id));
        renderAreaOnMap(savedArea, orderIndex >= 0 ? orderIndex : sortedAreas.length - 1);

        selectArea(savedArea.id);
        alert('Alan başarıyla kaydedildi ✅');
      } catch (error) {
        console.error('Failed to save area:', error);
        alert('Alan kaydedilemedi: ' + error.message);
        drawnItemsLayer.removeLayer(layer);
      }
    });

    mapInstance.on('click', () => selectArea(null));

    loadAreasFromDB();

    return () => { mapInstance.remove(); };
  }, []);

  // ── Load & render saved areas ───────────────────────────────────────────────
  const loadAreasFromDB = async () => {
    try {
      const areas = await loadAreas();
      areas.forEach((areaRow, index) => renderAreaOnMap(areaRow, index));
    } catch (error) {
      console.error('Failed to load areas:', error);
    }
  };

  const renderAreaOnMap = (areaRow, orderIndex) => {
    if (!mapInstanceRef.current || !drawnItemsRef.current) return;

    const dbId  = String(areaRow.id);
    const color = AREA_COLORS[orderIndex % AREA_COLORS.length];

    try {
      const feature      = dbPolygonToGeojsonFeature(areaRow);
      const polygonLayer = L.geoJSON(feature, {
        style: { color, weight: 3, fillColor: color, fillOpacity: 0.18 }
      });

      polygonLayer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectArea(dbId);
      });

      polygonLayer.addTo(drawnItemsRef.current);

      const bounds     = polygonLayer.getBounds();
      const center     = bounds.getCenter();
      const labelText  = `Alan ${orderIndex + 1} (${areaRow.name})`;
      const labelMarker = L.marker(center, {
        icon: L.divIcon({
          className: 'area-label',
          html: `<div class="area-label__inner">${escapeHtml(labelText)}</div>`,
          iconSize: null
        }),
        interactive: false
      });

      labelMarker.addTo(drawnItemsRef.current);
      addArea(dbId, { polygonLayer, labelMarker, name: areaRow.name });
    } catch (error) {
      console.error('Failed to render area:', error);
    }
  };

  // ── Scan route overlay ──────────────────────────────────────────────────────
  useEffect(() => {
    const mapInst = mapInstanceRef.current;
    if (!mapInst) return;

    if (scanLayerRef.current) {
      mapInst.removeLayer(scanLayerRef.current);
      scanLayerRef.current = null;
    }

    if (!scanRoute || scanRoute.length < 2) return;

    const latlngs = scanRoute.map(wp => [wp.lat, wp.lon]);
    const layers  = [];

    layers.push(L.polyline(latlngs, {
      color: '#22c55e', weight: 2, opacity: 0.85, dashArray: '8 5'
    }));

    layers.push(
      L.circleMarker(latlngs[0], {
        radius: 8, fillColor: '#16a34a', color: '#fff', weight: 2, fillOpacity: 1
      }).bindTooltip('Başlangıç', { permanent: false })
    );

    layers.push(
      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 8, fillColor: '#dc2626', color: '#fff', weight: 2, fillOpacity: 1
      }).bindTooltip('Bitiş', { permanent: false })
    );

    const step = Math.max(1, Math.floor(latlngs.length / 40));
    for (let i = 1; i < latlngs.length - 1; i += step) {
      layers.push(
        L.circleMarker(latlngs[i], {
          radius: 3, fillColor: '#3b82f6', color: '#fff', weight: 1, fillOpacity: 0.8
        }).bindTooltip(`WP ${i + 1}`, { permanent: false })
      );
    }

    const group = L.featureGroup(layers).addTo(mapInst);
    scanLayerRef.current = group;
    mapInst.fitBounds(group.getBounds(), { padding: [30, 30] });
  }, [scanRoute]);

  // ── Waste detection markers (YOLO sonuçları) ─────────────────────────────────
  useEffect(() => {
    const mapInst = mapInstanceRef.current;
    if (!mapInst) return;

    if (wasteLayerRef.current) {
      mapInst.removeLayer(wasteLayerRef.current);
      wasteLayerRef.current = null;
    }

    if (!wasteDetections || wasteDetections.length === 0) return;

    const markers = wasteDetections.map(d => {
      const color = WASTE_CATEGORY_COLORS[d.category] || WASTE_CATEGORY_COLORS['geri dönüştürülemez'];
      return L.circleMarker([d.lat, d.lon], {
        radius: 6, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9
      }).bindTooltip(
        `${d.category} · %${Math.round(d.confidence * 100)}`,
        { direction: 'top', sticky: true }
      );
    });

    const group = L.featureGroup(markers).addTo(mapInst);
    wasteLayerRef.current = group;
  }, [wasteDetections]);

  // ── Orthomosaic overlay (ODM-stitched composite) ─────────────────────────────
  // Already ortho-rectified/north-aligned by ODM — plain (non-rotated) overlay.
  useEffect(() => {
    const mapInst = mapInstanceRef.current;
    if (!mapInst) return;

    if (orthomosaicLayerRef.current) {
      mapInst.removeLayer(orthomosaicLayerRef.current);
      orthomosaicLayerRef.current = null;
    }

    if (!orthomosaicLayer?.url || !orthomosaicLayer?.bounds) return;

    const { swLat, swLon, neLat, neLon } = orthomosaicLayer.bounds;
    const overlay = L.imageOverlay(
      orthomosaicLayer.url,
      [[swLat, swLon], [neLat, neLon]],
      { opacity: 0.95, interactive: false }
    ).addTo(mapInst);

    orthomosaicLayerRef.current = overlay;
    mapInst.fitBounds(overlay.getBounds(), { padding: [30, 30] });
  }, [orthomosaicLayer]);

  // ── Drone photo overlay (Socket.IO) ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onPhoto = (data) => {
      const mapInst = mapInstanceRef.current;
      if (!mapInst) return;
      if (!data?.imageBase64 || !data?.lat || !data?.lon) return;

      const { topLeft, topRight, bottomLeft } = calcRotatedPhotoCorners(
        data.lat, data.lon, data.altitude, data.heading
      );
      const overlay = L.imageOverlay.rotated(
        data.imageBase64,
        L.latLng(topLeft), L.latLng(topRight), L.latLng(bottomLeft),
        { opacity: 0.88, interactive: true, crossOrigin: false }
      );

      const ts = data.timestamp
        ? new Date(data.timestamp).toLocaleTimeString('tr-TR')
        : '--';

      overlay.bindTooltip(
        `<b>📷 Drone Fotoğrafı</b><br>` +
        `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}<br>` +
        `İrtifa: ${data.altitude ?? '?'} m · Yön: ${data.heading ?? '?'}° &nbsp;|&nbsp; ${ts}`,
        { direction: 'top', sticky: true }
      );

      overlay.addTo(mapInst);
      photoLayersRef.current.push(overlay);
      incrementPhotoCount();
    };

    socket.on('drone_photo', onPhoto);
    return () => socket.off('drone_photo', onPhoto);
  }, [socket, incrementPhotoCount]);

  // ── Clear photo overlays when flag changes ───────────────────────────────────
  useEffect(() => {
    if (clearPhotosFlag === 0) return;
    const mapInst = mapInstanceRef.current;
    if (!mapInst) return;
    photoLayersRef.current.forEach(layer => mapInst.removeLayer(layer));
    photoLayersRef.current = [];
  }, [clearPhotosFlag]);

  // ── Update drone marker position from telemetry and/or photos ───────────────
  useEffect(() => {
    if (!socket) return;
    const moveMarker = (data) => {
      if (typeof data?.lat !== 'number' || typeof data?.lon !== 'number') return;
      const marker = droneMarkerRef.current;
      if (marker) marker.setLatLng([data.lat, data.lon]);

      // First live fix: pan the map to the drone so it isn't lost off-screen
      // if the drone's real position is far from the default campus view.
      if (!hasCenteredOnDroneRef.current && mapInstanceRef.current) {
        hasCenteredOnDroneRef.current = true;
        mapInstanceRef.current.panTo([data.lat, data.lon]);
      }
    };
    socket.on('drone_telemetry', moveMarker);
    socket.on('drone_photo', moveMarker);
    return () => {
      socket.off('drone_telemetry', moveMarker);
      socket.off('drone_photo', moveMarker);
    };
  }, [socket]);

  return (
    <div ref={mapRef}
      id="map"
      style={{ minHeight: '480px', width: '100%', zIndex: 1 }}
    />
  );
}
