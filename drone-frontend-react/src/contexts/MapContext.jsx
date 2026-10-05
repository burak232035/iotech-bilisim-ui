/**
 * MapContext - Map State and Area Management
 * Manages Leaflet map, areas, selection, and metrics
 * Adapted from harita.js lines 372-945
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ApiService } from '@services/api.service';
import { MissionService } from '@services/mission.service';

const MapContext = createContext(null);

export function MapProvider({ children }) {
  const [map, setMap] = useState(null);
  const [drawnItems, setDrawnItems] = useState(null);
  const [areas, setAreas] = useState(new Map()); // dbId -> { polygonLayer, labelMarker, name }
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [areaMetrics, setAreaMetrics] = useState(new Map()); // dbId -> { scanPercent }
  const [drawOrder, setDrawOrder] = useState([]); // [{ dbId, name, created_at }]
  // Waypoints from the latest planned mission — shown as a polyline on the map
  const [scanRoute, setScanRoute] = useState(null); // Array<{lat,lon}> | null

  // Photo overlay state — incremented each time a drone photo lands on the map
  const [photoCount, setPhotoCount] = useState(0);
  // Bumping this triggers LeafletMap to remove all photo overlays from the canvas
  const [clearPhotosFlag, setClearPhotosFlag] = useState(0);

  // YOLO waste detections for the currently analyzed session — shown as
  // colored markers on the map. Array<{id, category, confidence, lat, lon}> | null
  const [wasteDetections, setWasteDetections] = useState(null);

  // Stitched ODM orthomosaic for the currently analyzed session — a single
  // north-aligned image overlay. {url, bounds:{swLat,swLon,neLat,neLon}} | null
  const [orthomosaicLayer, setOrthomosaicLayer] = useState(null);

  /**
   * Load areas from database
   */
  const loadAreas = useCallback(async () => {
    try {
      const areasData = await ApiService.getAreas();

      // Sort by creation date
      const sorted = areasData.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return ta - tb;
      });

      setDrawOrder(
        sorted.map((a) => ({
          dbId: a.id,
          name: a.name,
          created_at: a.created_at
        }))
      );

      return sorted;
    } catch (error) {
      console.error('Failed to load areas:', error);
      return [];
    }
  }, []);

  /**
   * Select an area
   */
  const selectArea = useCallback((areaId) => {
    setSelectedAreaId(areaId ? String(areaId) : null);
  }, []);

  /**
   * Delete an area
   */
  const deleteArea = useCallback(
    async (areaId) => {
      const areaIdStr = String(areaId);
      const areaInfo = areas.get(areaIdStr);

      if (!areaInfo) return false;

      const confirmed = window.confirm(
        `"${areaInfo.name}" alanını silmek istiyor musun?`
      );

      if (!confirmed) return false;

      try {
        await ApiService.deleteArea(areaId);

        // Remove from map
        if (areaInfo.polygonLayer && drawnItems) {
          drawnItems.removeLayer(areaInfo.polygonLayer);
        }
        if (areaInfo.labelMarker && drawnItems) {
          drawnItems.removeLayer(areaInfo.labelMarker);
        }

        // Update state
        setAreas((prev) => {
          const next = new Map(prev);
          next.delete(areaIdStr);
          return next;
        });

        setDrawOrder((prev) =>
          prev.filter((a) => String(a.dbId) !== areaIdStr)
        );

        if (selectedAreaId === areaIdStr) {
          setSelectedAreaId(null);
        }

        return true;
      } catch (error) {
        console.error('Failed to delete area:', error);
        alert('Alan silinemedi: ' + error.message);
        return false;
      }
    },
    [areas, drawnItems, selectedAreaId]
  );

  /**
   * Update area metric (e.g., scan percentage)
   */
  const updateAreaMetric = useCallback((areaId, scanPercent) => {
    setAreaMetrics((prev) => {
      const next = new Map(prev);
      next.set(String(areaId), { scanPercent });
      return next;
    });
  }, []);

  /**
   * Add area to internal state
   */
  const addArea = useCallback((areaId, layerData) => {
    setAreas((prev) => {
      const next = new Map(prev);
      next.set(String(areaId), layerData);
      return next;
    });
  }, []);

  /** Called by LeafletMap each time a new drone photo overlay is placed */
  const incrementPhotoCount = useCallback(() => {
    setPhotoCount((c) => c + 1);
  }, []);

  /** Remove all photo overlays from the map canvas */
  const clearPhotoOverlays = useCallback(() => {
    setClearPhotosFlag((f) => f + 1);
    setPhotoCount(0);
  }, []);

  /**
   * Get selected area info
   */
  const getSelectedArea = useCallback(() => {
    if (!selectedAreaId) return null;
    return areas.get(selectedAreaId);
  }, [selectedAreaId, areas]);

  const value = useMemo(
    () => ({
      map,
      setMap,
      drawnItems,
      setDrawnItems,
      areas,
      addArea,
      selectedAreaId,
      selectArea,
      getSelectedArea,
      deleteArea,
      areaMetrics,
      updateAreaMetric,
      drawOrder,
      setDrawOrder,
      loadAreas,
      scanRoute,
      setScanRoute,
      photoCount,
      incrementPhotoCount,
      clearPhotoOverlays,
      clearPhotosFlag,
      wasteDetections,
      setWasteDetections,
      orthomosaicLayer,
      setOrthomosaicLayer
    }),
    [
      map,
      drawnItems,
      areas,
      addArea,
      selectedAreaId,
      selectArea,
      getSelectedArea,
      deleteArea,
      areaMetrics,
      updateAreaMetric,
      drawOrder,
      loadAreas,
      scanRoute,
      photoCount,
      incrementPhotoCount,
      clearPhotoOverlays,
      clearPhotosFlag,
      wasteDetections,
      orthomosaicLayer
    ]
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export const useMap = () => {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMap must be used within MapProvider');
  }
  return context;
};
