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

/** Latest finished orthomosaic of an area as an overlay spec, or null. */
async function loadAreaOrthomosaic(areaId) {
  const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AREA_ORTHOMOSAICS(areaId)}`);
  if (!res.ok) return null;
  const rows = await res.json();
  const latest = rows.find(r => r.file_path && r.bounds);
  if (!latest) return null;
  const fileName = latest.file_path.split(/[\\/]/).pop();
  return { url: `${API_BASE_URL}/uploads/orthomosaics/${fileName}?t=${latest.id}`, bounds: latest.bounds };
}

const STATUS_LABELS = {
  processing: 'Fotoğraflar işleniyor…',
  done: 'Tamamlandı',
  error: 'Hata'
};

export function WasteAnalysisPanel() {
  const { setWasteDetections, setOrthomosaicLayer, orthomosaicLayer, selectedAreaId } = useMap();
  const { currentSessionId, socket } = useSocket();
  const [scanInfo, setScanInfo] = useState(null); // { areaId, points, photos } during a live waste scan
  const [areaLoading, setAreaLoading] = useState(false);
  const shownAreaRef = useRef(null);                // area whose orthomosaic is under the points
  const orthoShownRef = useRef(false);
  useEffect(() => { orthoShownRef.current = !!orthomosaicLayer; }, [orthomosaicLayer]);

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
        if (!orthoShownRef.current) {
          const layer = await loadAreaOrthomosaic(data.areaId).catch(() => null);
          if (layer) setOrthomosaicLayer(layer);
        }
      }
    };
    socket.on(SOCKET_EVENTS.WASTE_DETECTIONS, onDetections);
    return () => socket.off(SOCKET_EVENTS.WASTE_DETECTIONS, onDetections);
  }, [socket, setWasteDetections, setOrthomosaicLayer]);

  // Area waste map: latest orthomosaic + every detection in the area (all flights)
  const handleShowAreaMap = async () => {
    if (!selectedAreaId) return;
    setAreaLoading(true);
    setError('');
    try {
      const [layer, detections] = await Promise.all([
        loadAreaOrthomosaic(selectedAreaId),
        WasteService.getAreaDetections(selectedAreaId)
      ]);
      if (layer) setOrthomosaicLayer(layer);
      shownAreaRef.current = Number(selectedAreaId);
      setWasteDetections(detections);
      setCategoryCounts(countByCategory(detections));
      setSummary(null);
      if (!layer) setError('Bu alan için hazır ortomozaik yok — noktalar normal harita üzerinde gösteriliyor.');
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
          <button
            type="button"
            className="btn btn-success btn-block"
            onClick={handleAnalyze}
            disabled={isRunning || !currentSessionId}
          >
            {isRunning ? (
              <><span className="loading-spinner"></span> {progressLabel}</>
            ) : (
              'Fotoğrafları Analiz Et'
            )}
          </button>

          <button
            type="button"
            className="btn btn-outline-success btn-block mt-2"
            onClick={handleShowAreaMap}
            disabled={areaLoading || !selectedAreaId}
            title={selectedAreaId ? '' : 'Önce haritadan bir alan seçin'}
          >
            {areaLoading ? 'Yükleniyor…' : 'Alanın Çöp Haritasını Göster (ortomozaik + tüm tespitler)'}
          </button>

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
