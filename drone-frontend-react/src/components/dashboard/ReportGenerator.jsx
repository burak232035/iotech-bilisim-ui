/**
 * ReportGenerator Component
 * "Yeni Atık" card + PDF report card. Clicking "Raporu Oluştur" first opens a
 * dialog where the categories and flight details to print are chosen (same
 * options the old harita.html dashboard offered), then the PDF is built.
 */

import { useState } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { ReportService } from '@services/report.service';
import { getPointsFromLayer } from '@utils/geojson.utils';
import { WASTE_CATEGORY_COLORS } from '@utils/constants';

// Category display names as report.routes.js prints them (CATEGORY_DISPLAY_NAMES)
const REPORT_CATEGORIES = ['Kağıt', 'Cam', 'Plastik', 'Metal', 'Geri Dönüştürülemez', 'Organik'];

const REPORT_FLIGHT_OPTIONS = [
  { key: 'includeBattery',    label: 'Batarya (ortalama şarj / minimum batarya)' },
  { key: 'includeFlightTime', label: 'Uçuş süresi' },
  { key: 'includeAltitude',   label: 'Maksimum irtifa' },
  { key: 'includeGps',        label: 'Başlangıç / bitiş koordinatları' },
  { key: 'includeGimbal',     label: 'Gimbal bilgisi' }
];

const allOn = (keys) => Object.fromEntries(keys.map(k => [k, true]));

/** Most recent detection on the map (by creation time), or null. */
function latestDetection(detections) {
  if (!detections || detections.length === 0) return null;
  return detections.reduce((a, b) =>
    new Date(b.created_at || 0) > new Date(a.created_at || 0) ? b : a
  );
}

function CheckList({ title, items, state, onChange }) {
  const setAll = (v) => onChange(Object.fromEntries(items.map(i => [i.key, v])));
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <strong>{title}</strong>
        <span>
          <button type="button" className="btn btn-link btn-sm p-0 me-2" onClick={() => setAll(true)}>Tümünü seç</button>
          <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setAll(false)}>Kaldır</button>
        </span>
      </div>
      {items.map(i => (
        <div className="form-check" key={i.key}>
          <input
            className="form-check-input"
            type="checkbox"
            id={`rpt_${i.key}`}
            checked={!!state[i.key]}
            onChange={e => onChange({ ...state, [i.key]: e.target.checked })}
          />
          <label className="form-check-label" htmlFor={`rpt_${i.key}`}>{i.label}</label>
        </div>
      ))}
    </div>
  );
}

function ReportOptionsModal({ areaName, onConfirm, onCancel }) {
  const [cats, setCats] = useState(allOn(REPORT_CATEGORIES));
  const [opts, setOpts] = useState(allOn(REPORT_FLIGHT_OPTIONS.map(o => o.key)));
  const selectedCats = REPORT_CATEGORIES.filter(c => cats[c]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={onCancel}
    >
      <div
        className="card mb-0"
        style={{ width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="card-header">
          <h3 className="card-title"><i className="fas fa-file-pdf"></i> Rapor içeriği — {areaName}</h3>
        </div>
        <div className="card-body">
          <CheckList
            title="Atık kategorileri"
            items={REPORT_CATEGORIES.map(c => ({ key: c, label: c }))}
            state={cats}
            onChange={setCats}
          />
          <CheckList
            title="Uçuş teknik bilgileri"
            items={REPORT_FLIGHT_OPTIONS}
            state={opts}
            onChange={setOpts}
          />
          {selectedCats.length === 0 && (
            <small className="text-danger d-block mb-2">En az bir kategori seçin.</small>
          )}
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>İptal</button>
            <button
              type="button"
              className="btn btn-success"
              disabled={selectedCats.length === 0}
              onClick={() => onConfirm({ kategoriler: selectedCats, options: opts })}
            >
              <i className="fas fa-file-pdf me-1"></i> Raporu Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportGenerator() {
  const { selectedAreaId, areas, wasteDetections } = useMap();
  const latest = latestDetection(wasteDetections);
  const { currentSessionId } = useSocket();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState({ message: '', type: '' });
  const [modalOpen, setModalOpen] = useState(false);

  const selectedArea = areas.get(selectedAreaId) || areas.get(String(selectedAreaId));

  const handleOpenOptions = () => {
    if (!selectedArea || !selectedArea.polygonLayer) {
      alert('Lütfen rapor için bir alan seç (lejanttan veya haritadaki alana tıkla).');
      return;
    }
    const points = getPointsFromLayer(selectedArea.polygonLayer);
    const validation = ReportService.validateReportData(currentSessionId, points);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }
    setModalOpen(true);
  };

  const handleGenerateReport = async ({ kategoriler, options }) => {
    setModalOpen(false);
    const points = getPointsFromLayer(selectedArea.polygonLayer);

    setIsGenerating(true);
    setStatus({ message: 'Rapor oluşturuluyor… (harita ve PDF hazırlanıyor, ~15-30 sn)', type: 'info' });

    try {
      const result = await ReportService.generateAndDownload(
        currentSessionId,
        selectedAreaId,
        points,
        { ...options, kategoriler }
      );

      if (result.success) {
        setStatus({ message: 'PDF indirildi ✅', type: 'success' });
      } else {
        setStatus({ message: `PDF oluşturulamadı: ${result.error}`, type: 'danger' });
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
    <>
      <div className="row mt-2 cards-equal">
        <div className="col-md-6 mb-3">
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

        <div className="col-md-6 mb-3">
          <Card title="Rapor" icon="fas fa-file-pdf" variant="success">
            <button
              type="button"
              className="btn btn-success btn-block"
              onClick={handleOpenOptions}
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

            {!selectedAreaId ? (
              <small className="d-block mt-2 text-muted">
                <i className="fas fa-info-circle"></i> Önce bir alan seçin
              </small>
            ) : (
              <small className="d-block mt-2 text-muted">
                <i className="fas fa-info-circle"></i> Rapor, seçili alanın son uçuşunu kapsar.
                Butona basınca rapora girecek bilgiler sorulur.
              </small>
            )}
          </Card>
        </div>
      </div>

      {modalOpen && (
        <ReportOptionsModal
          areaName={selectedArea?.name || `Alan ${selectedAreaId}`}
          onConfirm={handleGenerateReport}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
