/**
 * WasteAnalysisPanel
 * Uçuş sonrası yüklenmiş fotoğrafları YOLO ile sınıflandırır (kağıt/cam/
 * metal/plastik/geri dönüştürülemez/organik), ilerleme durumunu gösterir,
 * bitince kategori sayılarını özetler ve tespitleri haritaya
 * (wasteDetections) yansıtır.
 */

import { useState } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { WasteService } from '@services/waste.service';
import { WASTE_CATEGORY_COLORS } from '@utils/constants';

const STATUS_LABELS = {
  processing: 'Fotoğraflar işleniyor…',
  done: 'Tamamlandı',
  error: 'Hata'
};

export function WasteAnalysisPanel() {
  const { setWasteDetections } = useMap();
  const { currentSessionId } = useSocket();

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

      const counts = {};
      for (const d of detections) counts[d.category] = (counts[d.category] || 0) + 1;
      setCategoryCounts(counts);
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

          {!currentSessionId && (
            <small className="d-block mt-2 text-muted">
              <i className="fas fa-info-circle"></i> Analiz için aktif/tamamlanmış bir uçuş oturumu gerekir
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
