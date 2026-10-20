/**
 * ReportGenerator Component
 * PDF report generation for selected area
 * Adapted from harita.js lines 832-901
 */

import { useState } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { ReportService } from '@services/report.service';
import { getPointsFromLayer } from '@utils/geojson.utils';
import { WASTE_CATEGORY_COLORS } from '@utils/constants';

/** Most recent detection on the map (by creation time), or null. */
function latestDetection(detections) {
  if (!detections || detections.length === 0) return null;
  return detections.reduce((a, b) =>
    new Date(b.created_at || 0) > new Date(a.created_at || 0) ? b : a
  );
}

export function ReportGenerator() {
  const { selectedAreaId, areas, wasteDetections } = useMap();
  const latest = latestDetection(wasteDetections);
  const { currentSessionId } = useSocket();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState({ message: '', type: '' });

  const handleGenerateReport = async () => {
    const selectedArea = areas.get(selectedAreaId);

    if (!selectedArea || !selectedArea.polygonLayer) {
      alert(
        'Lütfen rapor için bir alan seç (lejanttan veya haritadaki alana tıkla).'
      );
      return;
    }

    const points = getPointsFromLayer(selectedArea.polygonLayer);

    const validation = ReportService.validateReportData(
      currentSessionId,
      points
    );

    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    setIsGenerating(true);
    setStatus({ message: 'Rapor oluşturuluyor...', type: 'info' });

    try {
      const result = await ReportService.generateAndDownload(
        currentSessionId,
        selectedAreaId,
        points,
        {
          includeBattery: true,
          includeFlightTime: true
        }
      );

      if (result.success) {
        setStatus({ message: 'PDF indirildi ✅', type: 'success' });
      } else {
        setStatus({
          message: `PDF oluşturulamadı: ${result.error}`,
          type: 'danger'
        });
      }
    } catch (error) {
      console.error('Report generation error:', error);
      setStatus({
        message: `PDF oluşturulamadı: ${error.message || 'backend çalışıyor mu?'}`,
        type: 'danger'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="row mt-2">
      <div className="col-md-6">
        <Card title="Yeni Atık" icon="fas fa-trash" variant="warning">
          {latest ? (
            <ul className="mb-0">
              <li>
                Kategori:{' '}
                <span className="fw-bold text-capitalize" style={{ color: WASTE_CATEGORY_COLORS[latest.category] }}>
                  {latest.category}
                </span>
                {latest.confidence != null && (
                  <small className="text-muted"> (%{Math.round(Number(latest.confidence) * 100)} güven)</small>
                )}
              </li>
              <li>
                Koordinat:{' '}
                <span>{Number(latest.lat).toFixed(6)}, {Number(latest.lon).toFixed(6)}</span>{' '}
                <a
                  href={`https://www.google.com/maps?q=${Number(latest.lat)},${Number(latest.lon)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  haritada aç
                </a>
              </li>
              <li>
                Zaman: <span>{latest.created_at ? new Date(latest.created_at).toLocaleString('tr-TR') : '--'}</span>
              </li>
              <li>
                <small className="text-muted">Haritada toplam {wasteDetections.length} tespit</small>
              </li>
            </ul>
          ) : (
            <small className="text-muted">
              Henüz tespit yok — "Fotoğrafları Analiz Et", "Alanın Çöp Haritasını Göster"
              ya da bir çöp taraması sonrası en son bulunan atık burada görünür.
            </small>
          )}
        </Card>
      </div>

      <div className="col-md-6">
        <Card title="Rapor" icon="fas fa-file-pdf" variant="success">
          <button
            type="button"
            className="btn btn-success btn-block"
            onClick={handleGenerateReport}
            disabled={isGenerating || !selectedAreaId}
          >
            {isGenerating ? (
              <>
                <span className="loading-spinner"></span> Oluşturuluyor...
              </>
            ) : (
              'Seçili Alanın Raporunu Oluştur (PDF)'
            )}
          </button>

          {status.message && (
            <small className={`d-block mt-2 text-${status.type}`}>
              {status.message}
            </small>
          )}

          {!selectedAreaId && (
            <small className="d-block mt-2 text-muted">
              <i className="fas fa-info-circle"></i> Önce bir alan seçin
            </small>
          )}
        </Card>
      </div>
    </div>
  );
}
