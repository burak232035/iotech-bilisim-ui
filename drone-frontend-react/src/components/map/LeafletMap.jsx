/**
 * LeafletMap Component
 * Core map with Leaflet + Leaflet Draw integration
 * Adapted from harita.js lines 716-827
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { useMap } from '@contexts/MapContext';
import { ApiService } from '@services/api.service';
import { MAP_CONFIG, AREA_COLORS } from '@utils/constants';
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

export function LeafletMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const drawnItemsRef = useRef(null);

  const {
    setMap,
    setDrawnItems,
    loadAreas,
    selectArea,
    drawOrder,
    addArea
  } = useMap();

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    const mapInstance = L.map(mapRef.current).setView(
      MAP_CONFIG.CENTER,
      MAP_CONFIG.ZOOM
    );

    mapInstanceRef.current = mapInstance;

    // Add tile layer
    L.tileLayer(MAP_CONFIG.TILE_LAYER, {
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);

    // Drone marker
    L.marker(MAP_CONFIG.CENTER)
      .addTo(mapInstance)
      .bindPopup('Drone Konumu');

    // Drawn items layer
    const drawnItemsLayer = new L.FeatureGroup();
    mapInstance.addLayer(drawnItemsLayer);
    drawnItemsRef.current = drawnItemsLayer;

    // Share with context
    setMap(mapInstance);
    setDrawnItems(drawnItemsLayer);

    // Draw control
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: true,
        rectangle: true,
        circle: false,
        circlemarker: false,
        polyline: false,
        marker: false
      },
      edit: { featureGroup: drawnItemsLayer }
    });
    mapInstance.addControl(drawControl);

    // Handle draw created
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
        const feature = layer.toGeoJSON();
        const dbPolygon = geojsonFeatureToDbPolygon(feature);

        const savedArea = await ApiService.createArea(name, dbPolygon);

        // Reload areas to update map and legend
        await loadAreas();

        // Remove temporary layer
        drawnItemsLayer.removeLayer(layer);

        // Select newly created area
        selectArea(savedArea.id);

        alert('Alan başarıyla kaydedildi ✅');
      } catch (error) {
        console.error('Failed to save area:', error);
        alert('Alan kaydedilemedi: ' + error.message);
        drawnItemsLayer.removeLayer(layer);
      }
    });

    // Deselect on map click
    mapInstance.on('click', () => {
      selectArea(null);
    });

    // Load existing areas
    loadAreasFromDB();

    // Cleanup
    return () => {
      mapInstance.remove();
    };
  }, []);

  // Load and render areas from database
  const loadAreasFromDB = async () => {
    try {
      const areas = await loadAreas();

      areas.forEach((areaRow, index) => {
        renderAreaOnMap(areaRow, index);
      });
    } catch (error) {
      console.error('Failed to load areas:', error);
    }
  };

  // Render single area on map
  const renderAreaOnMap = (areaRow, orderIndex) => {
    if (!mapInstanceRef.current || !drawnItemsRef.current) return;

    const dbId = String(areaRow.id);
    const color = AREA_COLORS[orderIndex % AREA_COLORS.length];

    try {
      const feature = dbPolygonToGeojsonFeature(areaRow);

      const polygonLayer = L.geoJSON(feature, {
        style: {
          color,
          weight: 3,
          fillColor: color,
          fillOpacity: 0.18
        }
      });

      // Click handler for selection
      polygonLayer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectArea(dbId);
      });

      polygonLayer.addTo(drawnItemsRef.current);

      // Add label at center
      const bounds = polygonLayer.getBounds();
      const center = bounds.getCenter();

      const labelText = `Alan ${orderIndex + 1} (${areaRow.name})`;
      const labelMarker = L.marker(center, {
        icon: L.divIcon({
          className: 'area-label',
          html: `<div class="area-label__inner">${escapeHtml(
            labelText
          )}</div>`,
          iconSize: null
        }),
        interactive: false
      });

      labelMarker.addTo(drawnItemsRef.current);

      // Store in context
      addArea(dbId, { polygonLayer, labelMarker, name: areaRow.name });
    } catch (error) {
      console.error('Failed to render area:', error);
    }
  };

  return (
    <div
      ref={mapRef}
      id="map"
      style={{ minHeight: '480px', width: '100%', zIndex: 1 }}
    />
  );
}
