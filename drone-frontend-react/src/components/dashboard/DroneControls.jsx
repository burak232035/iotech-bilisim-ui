/**
 * DroneControls Component
 * Takeoff and Land buttons
 * Adapted from harita.js lines 219-253
 */

import { Card } from '@components/common/Card';
import { useSocket } from '@contexts/SocketContext';

export function DroneControls() {
  const { sendCommand, isConnected } = useSocket();

  const handleTakeoff = () => {
    if (!isConnected) {
      alert('Socket bağlantısı yok! Lütfen backend çalıştığından emin olun.');
      return;
    }

    const confirmed = window.confirm('Drone kalkış yapacak. Emin misiniz?');
    if (!confirmed) return;

    console.log('🚁 Drone takeoff komutu gönderiliyor...');
    const success = sendCommand('takeoff');

    if (success) {
      alert('✅ Kalkış komutu gönderildi!');
    }
  };

  const handleLand = () => {
    if (!isConnected) {
      alert('Socket bağlantısı yok! Lütfen backend çalıştığından emin olun.');
      return;
    }

    const confirmed = window.confirm('Drone iniş yapacak. Emin misiniz?');
    if (!confirmed) return;

    console.log('🛬 Drone landing komutu gönderiliyor...');
    const success = sendCommand('land');

    if (success) {
      alert('✅ İniş komutu gönderildi!');
    }
  };

  return (
    <div className="row mt-3">
      <div className="col-12">
        <Card title="Drone Kontrol" icon="fas fa-gamepad" variant="danger">
          <div className="d-flex justify-content-center gap-3">
            <button
              type="button"
              className="btn btn-success btn-lg"
              onClick={handleTakeoff}
              disabled={!isConnected}
            >
              <i className="fas fa-plane-departure"></i> Kalkış (Takeoff)
            </button>
            <button
              type="button"
              className="btn btn-warning btn-lg"
              onClick={handleLand}
              disabled={!isConnected}
            >
              <i className="fas fa-plane-arrival"></i> İniş (Land)
            </button>
          </div>
          <p className="text-center text-muted mt-3 mb-0">
            <small>
              <i className="fas fa-info-circle"></i> Butonlar drone'a komut
              gönderir. Drone bulunduğu alanda işlem yapar.
            </small>
          </p>
        </Card>
      </div>
    </div>
  );
}
