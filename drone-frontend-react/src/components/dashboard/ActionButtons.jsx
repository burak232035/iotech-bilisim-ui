/**
 * ActionButtons
 * "İstasyona Dön" ve "Elle Kontrol" kartları; Elle Kontrol açılınca
 * ManualControlPanel gösterilir.
 */

import { useState } from 'react';
import { ManualControlPanel } from '@components/dashboard/ManualControlPanel';
import { useSocket } from '@contexts/SocketContext';
import { droneLabel } from '@utils/constants';

export function ActionButtons() {
  const [manualOpen, setManualOpen] = useState(false);
  const { sendCommand, isConnected, selectedDroneId } = useSocket();

  const handleReturnToStation = () => {
    const target = selectedDroneId ? droneLabel(selectedDroneId) : 'Drone';
    if (!window.confirm(`${target} istasyona (eve) dönsün mü?`)) return;
    sendCommand('returnHome', {});
  };

  return (
    <>
      <div className="row mt-2">
        <div className="col-md-6 mb-3">
          <button
            type="button"
            className="card action-card bg-warning"
            onClick={handleReturnToStation}
            disabled={!isConnected}
            style={{ width: '100%' }}
          >
            <div className="card-body action-card-body">
              <i className="fas fa-home"></i>
              <span>İstasyona Dön{selectedDroneId ? ` (${droneLabel(selectedDroneId)})` : ''}</span>
            </div>
          </button>
        </div>

        <div className="col-md-6 mb-3">
          <button
            type="button"
            className={`card action-card ${manualOpen ? 'bg-success' : 'bg-danger'}`}
            onClick={() => setManualOpen(v => !v)}
            style={{ width: '100%', border: manualOpen ? '2px solid #4ade80' : undefined }}
          >
            <div className="card-body action-card-body">
              <i className="fas fa-gamepad"></i>
              <span>{manualOpen ? 'Elle Kontrol (Aktif)' : 'Elle Kontrol'}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Manuel kontrol paneli — butonun hemen altında açılır */}
      {manualOpen && (
        <ManualControlPanel onClose={() => setManualOpen(false)} />
      )}
    </>
  );
}
