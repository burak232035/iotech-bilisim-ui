/**
 * ActionButtons
 * 4 eylem kartı + "Elle Kontrol" kartı açılınca ManualControlPanel gösterilir.
 */

import { useState } from 'react';
import { ManualControlPanel } from '@components/dashboard/ManualControlPanel';
import { useSocket } from '@contexts/SocketContext';
import { droneLabel } from '@utils/constants';

export function ActionButtons() {
  const [manualOpen, setManualOpen] = useState(false);
  const { sendCommand, isConnected, selectedDroneId } = useSocket();

  const handleExploration = () => {
    alert('Alan keşfi başlatıldı (demo).');
  };

  const handleScan = () => {
    alert('Alan tarama başlatıldı (demo).');
  };

  const handleReturnToStation = () => {
    const target = selectedDroneId ? droneLabel(selectedDroneId) : 'Drone';
    if (!window.confirm(`${target} istasyona (eve) dönsün mü?`)) return;
    sendCommand('returnHome', {});
  };

  return (
    <>
      <div className="row mt-2">
        <div className="col-md-3 mb-3">
          <button
            type="button"
            className="card action-card bg-primary"
            onClick={handleExploration}
            style={{ width: '100%' }}
          >
            <div className="card-body action-card-body">
              <i className="fas fa-route"></i>
              <span>Alan Keşfi</span>
            </div>
          </button>
        </div>

        <div className="col-md-3 mb-3">
          <button
            type="button"
            className="card action-card bg-info"
            onClick={handleScan}
            style={{ width: '100%' }}
          >
            <div className="card-body action-card-body">
              <i className="fas fa-search"></i>
              <span>Alan Tarama</span>
            </div>
          </button>
        </div>

        <div className="col-md-3 mb-3">
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

        <div className="col-md-3 mb-3">
          <button
            type="button"
            className={`card action-card ${manualOpen ? 'bg-success' : 'bg-danger'}`}
            onClick={() => setManualOpen(v => !v)}
            style={{ width: '100%', border: manualOpen ? '2px solid #4ade80' : undefined }}
          >
            <div className="card-body action-card-body">
              <i className={`fas ${manualOpen ? 'fa-gamepad' : 'fa-gamepad'}`}></i>
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
