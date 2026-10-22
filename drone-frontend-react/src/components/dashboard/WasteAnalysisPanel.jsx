/**
 * WasteAnalysisPanel
 * Uçuş sonrası yüklenmiş fotoğrafları YOLO ile sınıflandırır (kağıt/cam/
 * metal/plastik/geri dönüştürülemez/organik), ilerleme durumunu gösterir,
 * bitince kategori sayılarını özetler ve tespitleri haritaya
 * (wasteDetections) yansıtır.
 */

import { useState, useEffect, useRef } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { WasteService } from '@services/waste.service';
import { API_BASE_URL, API_ENDPOINTS, SOCKET_EVENTS, WASTE_CATEGORY_COLORS } from '@utils/constants';

function countByCategory(detections) {
  const counts = {};
  for (const d of detections) counts[d.category] = (counts[d.category] || 0) + 1;
  return counts;
}

/** Id of the latest finished orthomosaic of an area, or null. */
async function latestAreaOrthomosaicId(areaId) {
  const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AREA_ORTHOMOSAICS(areaId)}`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.find(r => r.file_path && r.bounds)?.id ?? null;
}

const STATUS_LABELS = {
  processing: 'Fotoğraflar işleniyor…',
  done: 'Tamamlandı',
  error: 'Hata'
};

export function WasteAnalysisPanel() {
  const { setWasteDetections, setOrthomosaicOnMap, orthomosaics, selectedAreaId } = useMap();
  const { currentSessionId, socket } = useSocket();
  const [scanInfo, setScanInfo] = useState(null); // { areaId, points, photos } during a live waste scan
  const [areaLoading, setAreaLoading] = useState(false);
  const shownAreaRef = useRef(null);                // area whose orthomosaic is under the points
  const pinnedAreasRef = useRef(new Set());          // areas that already have a pinned orthomosaic
  useEffect(() => {
    pinnedAreasRef.current = new Set(orthomosaics.map(o => o.area_id).filter(a => a != null));
  }, [orthomosaics]);

  /** Make sure the area's latest orthomosaic is on the map; returns false if it has none. */
  const pinAreaOrthomosaic = async (areaId) => {
    if (pinnedAreasRef.current.has(Number(areaId))) return true;
    const id = await latestAreaOrthomosaicId(areaId);
    if (id == null) return false;
    await setOrthomosaicOnMap(id, true);
    return true;
  };

  // Live waste-scan results: each uploaded scan photo is detected on the server
  // and its new points arrive here; show them over the area's orthomosaic.
  useEffect(() => {
    if (!socket) return;
    const onDetections = async (data) => {
      const fresh = data?.detections || [];
      if (fresh.length) setWasteDetections(prev => [...(prev || []), ...fresh]);
      setScanInfo(prev => ({
        areaId: data?.areaId ?? prev?.areaId ?? null,
        points: (prev?.points || 0) + fresh.length,
        photos: (prev?.photos || 0) + 1
      }));
      if (data?.areaId && shownAreaRef.current !== data.areaId) {
        shownAreaRef.current = data.areaId;
        await pinAreaOrthomosaic(data.areaId).catch(() => false);
      }
    };
    socket.on(SOCKET_EVENTS.WASTE_DETECTIONS, onDetections);
    return () => socket.off(SOCKET_EVENTS.WASTE_DETECTIONS, onDetections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, setWasteDetections]);

  // Area waste map: latest orthomosaic + every detection in the area (all flights)
  const handleShowAreaMap = async () => {
    if (!selectedAreaId) return;
    setAreaLoading(true);
    setError('');
    try {
      const [hasOrtho, detections] = await Promise.all([
        pinAreaOrthomosaic(selectedAreaId),
        WasteService.getAreaDetections(selectedAreaId)
      ]);
      shownAreaRef.current = Number(selectedAreaId);
      setWasteDetections(detections);
      setCategoryCounts(countByCategory(detections));
      setSummary(null);
      if (!hasOrtho) setError('Bu alan için hazır ortomozaik yok — noktalar normal harita üzerinde gösteriliyor.');
    } catch (err) {
      setError(err.message || 'Alan haritası yüklenemedi.');
    } finally {
      setAreaLoading(false);
    }
  };

  const [isRunning, setIsRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [summary, setSummary] = useState(null); // { total, processed, failed, detections }
  const [categoryCounts, setCategoryCounts] = useState(null); // { kağıt: N, ... }
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!currentSessionId) {
      alert('Aktif bir uçuş oturumu yok — analiz için önce bir uçuş tamamlanmalı.');
      return;
    }

    setIsRunning(true);
    setError('');
    setSummary(null);
    setCategoryCounts(null);
    setProgressLabel(STATUS_LABELS.processing);

    try {
      const result = await WasteService.classifyAndWait(currentSessionId, (status) => {
        setProgressLabel(STATUS_LABELS[status] || status);
      });
      setSummary(result);

      const detections = await WasteService.getSessionDetections(currentSessionId);
      setWasteDetections(detections);
      setCategoryCounts(countByCategory(detections));
    } catch (err) {
      console.error('Waste classification error:', err);
      setError(err.message || 'Sınıflandırma başarısız oldu.');
    } finally {
      setIsRunning(false);
      setProgressLabel('');
    }
  };

  return (
    <div className="row mt-2">
      <div className="col-12">
        <Card title="Çöp Sınıflandırma (YOLO)" icon="fas fa-recycle" variant="success">
          {/* Two actions side by side, same width and height */}
          <div className="row g-3">
            <div className="col-md-6 d-flex">
              <button
                type="button"
                className="btn btn-success w-100"
                style={{ minHeight: 48 }}
                onClick={handleAnalyze}
                disabled={isRunning || !currentSessionId}
              >
                {isRunning ? (
                  <><span className="loading-spinner"></span> {progressLabel}</>
                ) : (
                  <><i className="fas fa-search me-2"></i>Fotoğrafları Analiz Et</>
                )}
              </button>
            </div>
            <div className="col-md-6 d-flex">
              <button
                type="button"
                className="btn btn-outline-success w-100"
                style={{ minHeight: 48 }}
                onClick={handleShowAreaMap}
                disabled={areaLoading || !selectedAreaId}
                title={selectedAreaId ? 'Ortomozaik + alandaki tüm tespitler' : 'Önce haritadan bir alan seçin'}
              >
                {areaLoading ? 'Yükleniyor…' : <><i className="fas fa-map me-2"></i>Alanın Çöp Haritasını Göster</>}
              </button>
            </div>
          </div>

          {!currentSessionId && (
            <small className="d-block mt-2 text-muted">
              <i className="fas fa-info-circle"></i> Analiz için aktif/tamamlanmış bir uçuş oturumu gerekir
            </small>
          )}

          {scanInfo && (
            <small className="d-block mt-2 text-success">
              <i className="fas fa-satellite-dish me-1"></i>
              Canlı çöp taraması: {scanInfo.photos} fotoğraf işlendi, {scanInfo.points} çöp noktası haritada
            </small>
          )}

          {error && (
            <small className="d-block mt-2 text-danger">{error}</small>
          )}

          {summary && (
            <small className="d-block mt-2 text-muted">
              {summary.processed}/{summary.total} foto işlendi
              {summary.failed > 0 && `, ${summary.failed} başarısız`}
              {` — ${summary.detections} tespit`}
            </small>
          )}

          {categoryCounts && (
            <div className="row g-2 mt-2">
              {Object.entries(categoryCounts).map(([category, count]) => (
                <div key={category} className="col-6 col-md-4">
                  <div
                    className="border rounded p-2 text-center h-100"
                    style={{ borderColor: WASTE_CATEGORY_COLORS[category] }}
                  >
                    <div className="fw-bold fs-5" style={{ color: WASTE_CATEGORY_COLORS[category] }}>
                      {count}
                    </div>
                    <small className="text-muted text-capitalize">{category}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
