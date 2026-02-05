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

export function ReportGenerator() {
  const { selectedAreaId, areas } = useMap();
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
        message: 'PDF oluşturulamadı. Backend çalışıyor mu? (localhost:3001)',
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
          <ul className="mb-0">
            <li>
              Kategori: <span>Plastik</span>
            </li>
            <li>
              Koordinat: <span>--</span>
            </li>
            <li>
              Zaman: <span>{new Date().toLocaleString('tr-TR')}</span>
            </li>
          </ul>
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
