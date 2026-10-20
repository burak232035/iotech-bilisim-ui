/**
 * OrthomosaicPanel
 * Uçuş sonrası yüklenmiş tam-çözünürlük fotoğrafları tek bir hava
 * görüntüsünde birleştirir ve haritaya sabitler (kaldırılana kadar kalır).
 *
 * Varsayılan motor Docker'sız orthomosaic-service (OpenCV): her foto önce
 * GPS+pusula ile yerleştirilir, sonra komşularıyla görsel özellik
 * eşleştirmesiyle hizalanır. ORTHOMOSAIC_ENGINE=odm ile Docker'daki
 * OpenDroneMap (gerçek fotogrametri) kullanılabilir.
 */

import { useState } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { OrthomosaicService } from '@services/orthomosaic.service';

const STATUS_LABELS = {
  processing: 'ODM ile dikişleniyor… (birkaç dakika sürebilir)',
  done: 'Tamamlandı',
  error: 'Hata'
};

export function OrthomosaicPanel() {
  const { refreshOrthomosaics, setOrthomosaicOnMap, orthomosaics, selectedAreaId } = useMap();
  const { currentSessionId } = useSocket();

  const [isRunning, setIsRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (!currentSessionId) {
      alert('Aktif bir uçuş oturumu yok — ortomozaik için önce bir uçuş tamamlanmalı.');
      return;
    }

    setIsRunning(true);
    setError('');
    setDone(false);
    setProgressLabel(STATUS_LABELS.processing);

    try {
      await OrthomosaicService.generateAndWait(
        currentSessionId,
        selectedAreaId,
        (status) => setProgressLabel(STATUS_LABELS[status] || status)
      );
      // The backend pins a finished result to the map — just reload the list
      await refreshOrthomosaics();
      setDone(true);
    } catch (err) {
      console.error('Orthomosaic generation error:', err);
      setError(err.message || 'Ortomozaik oluşturulamadı.');
    } finally {
      setIsRunning(false);
      setProgressLabel('');
    }
  };

  return (
    <div className="row mt-2">
      <div className="col-12">
        <Card title="Ortomozaik (Fotoğraf Birleştirme)" icon="fas fa-layer-group" variant="info">
          <button
            type="button"
            className="btn btn-info btn-block"
            onClick={handleGenerate}
            disabled={isRunning || !currentSessionId}
          >
            {isRunning ? (
              <><span className="loading-spinner"></span> {progressLabel}</>
            ) : (
              'Ortomozaik Oluştur'
            )}
          </button>

          {!currentSessionId && (
            <small className="d-block mt-2 text-muted">
              <i className="fas fa-info-circle"></i> Ortomozaik için aktif/tamamlanmış bir uçuş oturumu gerekir
            </small>
          )}

          <small className="d-block mt-2 text-muted">
            Fotoğraflar GPS ile yerleştirilip komşularıyla görüntü eşleştirmesiyle hizalanır
            (Docker gerekmez). İyi sonuç için görevi <strong>ileri örtüşme %60+</strong> ile uçurun;
            düşük örtüşmede ardışık fotoğraflar eşleşmez ve yalnızca GPS'e göre yerleşir.
          </small>

          {error && (
            <small className="d-block mt-2 text-danger">{error}</small>
          )}

          {orthomosaics.length > 0 && (
            <div className="mt-3">
              <div className="fw-bold mb-1" style={{ fontSize: '0.85rem' }}>
                <i className="fas fa-map me-1"></i>Haritadaki ortomozaikler
                <small className="text-muted fw-normal"> — kaldırılana kadar sayfa yenilense de kalır</small>
              </div>
              {orthomosaics.map(o => (
                <div key={o.id} className="d-flex align-items-center justify-content-between border rounded px-2 py-1 mb-1"
                     style={{ fontSize: '0.82rem' }}>
                  <span>
                    {o.area_name ? `${o.area_name} (alan ${o.area_id})` : (o.area_id ? `Alan ${o.area_id}` : 'Alan yok')}
                    {o.drone_id && ` · ${o.drone_id}`}
                    {` · oturum ${o.session_id} · ${o.photo_count} foto · `}
                    {new Date(o.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button type="button" className="btn btn-sm btn-outline-danger py-0"
                          onClick={() => setOrthomosaicOnMap(o.id, false)}>
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          )}

          {done && (
            <small className="d-block mt-2 text-success">
              ✅ Ortomozaik haritaya eklendi.
            </small>
          )}
        </Card>
      </div>
    </div>
  );
}
