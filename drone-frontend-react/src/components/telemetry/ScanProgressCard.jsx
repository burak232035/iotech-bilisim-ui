/**
 * ScanProgressCard Component
 * Waypoint progress of the selected drone's mission (running, or the last
 * one once it finished/stopped), from the backend's drones_state.
 */

import { Card } from '@components/common/Card';
import { CircularProgress } from '@components/common/CircularProgress';
import { useSocket } from '@contexts/SocketContext';
import { droneLabel } from '@utils/constants';

const STATE_LABELS = {
  running:   { text: 'Görevde',     cls: 'text-warning' },
  completed: { text: 'Tamamlandı',  cls: 'text-success' },
  stopped:   { text: 'Durduruldu',  cls: 'text-danger' }
};

const PURPOSE_LABELS = {
  mapping:    'Haritalama',
  waste_scan: 'Çöp taraması'
};

export function ScanProgressCard() {
  const { selectedDrone, selectedDroneId } = useSocket();
  const progress = selectedDrone?.missionProgress || null;
  const state = progress ? STATE_LABELS[progress.state] || STATE_LABELS.running : null;

  return (
    <Card title="Tarama Oranı" icon="fas fa-radar" variant="success">
      <div className="d-flex flex-column align-items-center justify-content-center">
        <CircularProgress
          value={progress ? progress.percent : 0}
          colorThresholds={{ low: 30, medium: 70 }}
        />
        {progress ? (
          <small className="text-muted mt-2 text-center">
            <span className={`fw-bold ${state.cls}`}>{state.text}</span>
            {' · '}WP {progress.reached} / {progress.total}
            <br />
            {droneLabel(selectedDroneId)} · {PURPOSE_LABELS[progress.purpose] || progress.purpose}
            {progress.areaId != null && ` · alan ${progress.areaId}`}
          </small>
        ) : (
          <small className="text-muted mt-2">
            {selectedDroneId ? `${droneLabel(selectedDroneId)} için görev yok` : 'Drone seçilmedi'}
          </small>
        )}
      </div>
    </Card>
  );
}
