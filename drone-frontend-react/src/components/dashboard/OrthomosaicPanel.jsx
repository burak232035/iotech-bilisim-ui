/**
 * OrthomosaicPanel
 * Uçuş sonrası yüklenmiş tam-çözünürlük fotoğrafları OpenDroneMap ile
 * gerçek fotogrametrik dikişleme yaparak tek, dikişsiz bir hava
 * görüntüsüne dönüştürür ve haritaya (orthomosaicLayer) basar.
 *
 * Basit GPS+pusula tabanlı yerleştirmeden (drone_photo canlı önizleme,
 * waste tespit marker'ları) farklı olarak, bu gerçek görsel özellik
 * eşleştirmesi kullanır — Google Haritalar kalitesinde sonuç verir ama
 * dakikalar sürebilir (Docker + OpenDroneMap).
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
  const { setOrthomosaicLayer, selectedAreaId } = useMap();
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
      const { url, bounds } = await OrthomosaicService.generateAndWait(
        currentSessionId,
        selectedAreaId,
        (status) => setProgressLabel(STATUS_LABELS[status] || status)
      );
      setOrthomosaicLayer({ url: `${url}?t=${Date.now()}`, bounds });
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
        <Card title="Ortomozaik (Fotogrametrik Dikişleme)" icon="fas fa-layer-group" variant="info">
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
            Google Haritalar tarzı dikişsiz bir sonuç için gerçek fotogrametri
            (OpenDroneMap) çalıştırır — Docker gerektirir, işlem birkaç dakika
            sürebilir.
          </small>

          {error && (
            <small className="d-block mt-2 text-danger">{error}</small>
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
