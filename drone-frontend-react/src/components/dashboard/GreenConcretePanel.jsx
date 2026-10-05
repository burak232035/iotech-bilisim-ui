/**
 * GreenConcretePanel
 * Uçuş sonrası yüklenmiş fotoğrafları YOLO-seg ile analiz ederek her
 * fotoğrafın yüzde kaçının bitki örtüsü (yeşil) ve yüzde kaçının beton/
 * sert zemin olduğunu hesaplar, session ortalamasını bir card olarak
 * gösterir. Haritada ayrı bir katman yok — sadece bu card.
 */

import { useState } from 'react';
import { Card } from '@components/common/Card';
import { CircularProgress } from '@components/common/CircularProgress';
import { useSocket } from '@contexts/SocketContext';
import { LandcoverService } from '@services/landcover.service';
import { LANDCOVER_COLORS } from '@utils/constants';

const STATUS_LABELS = {
  processing: 'Fotoğraflar analiz ediliyor…',
  done: 'Tamamlandı',
  error: 'Hata'
};

export function GreenConcretePanel() {
  const { currentSessionId } = useSocket();

  const [isRunning, setIsRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState(null); // { greenPct, concretePct, otherPct, photoCount, processed, failed, total }
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!currentSessionId) {
      alert('Aktif bir uçuş oturumu yok — analiz için önce bir uçuş tamamlanmalı.');
      return;
    }

    setIsRunning(true);
    setError('');
    setResult(null);
    setProgressLabel(STATUS_LABELS.processing);

    try {
      const summary = await LandcoverService.analyzeAndWait(currentSessionId, (status) => {
        setProgressLabel(STATUS_LABELS[status] || status);
      });
      setResult(summary);
    } catch (err) {
      console.error('Landcover analysis error:', err);
      setError(err.message || 'Analiz başarısız oldu.');
    } finally {
      setIsRunning(false);
      setProgressLabel('');
    }
  };

  return (
    <div className="row mt-2">
      <div className="col-12">
        <Card title="Yeşil/Beton Oranı (YOLO-seg)" icon="fas fa-seedling" variant="success">
          <button
            type="button"
            className="btn btn-success btn-block"
            onClick={handleAnalyze}
            disabled={isRunning || !currentSessionId}
          >
            {isRunning ? (
              <><span className="loading-spinner"></span> {progressLabel}</>
            ) : (
              'Yeşil/Beton Analizi Yap'
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

          {result && (
            <>
              <small className="d-block mt-2 text-muted">
                {result.processed}/{result.total} foto işlendi
                {result.failed > 0 && `, ${result.failed} başarısız`}
                {` — ${result.photoCount} fotoğraf ortalaması`}
              </small>

              <div className="row g-2 mt-2 text-center">
                <div className="col-6">
                  <CircularProgress
                    value={result.greenPct}
                    size={100}
                    color={LANDCOVER_COLORS.green}
                  />
                  <div className="mt-1">🌳 Yeşil Alan</div>
                </div>
                <div className="col-6">
                  <CircularProgress
                    value={result.concretePct}
                    size={100}
                    color={LANDCOVER_COLORS.concrete}
                  />
                  <div className="mt-1">🧱 Beton/Sert Zemin</div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
