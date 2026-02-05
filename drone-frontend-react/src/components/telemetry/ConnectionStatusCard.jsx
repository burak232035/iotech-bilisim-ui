/**
 * ConnectionStatusCard Component
 * Socket and Drone connection status display
 * Adapted from harita.js lines 193-214
 */

import { Card } from '@components/common/Card';
import { Badge } from '@components/common/Badge';
import { useSocket } from '@contexts/SocketContext';

export function ConnectionStatusCard() {
  const { isConnected, droneStatus } = useSocket();

  const getDroneStatusBadge = () => {
    if (droneStatus === 'active') {
      return { variant: 'success', text: 'Bağlı' };
    }
    if (droneStatus === 'waiting') {
      return { variant: 'secondary', text: 'Bekleniyor...' };
    }
    if (droneStatus === 'session_ended') {
      return { variant: 'warning', text: 'Oturum Bitti' };
    }
    return { variant: 'secondary', text: 'Bilinmiyor' };
  };

  const droneStatusBadge = getDroneStatusBadge();

  return (
    <Card title="Bağlantı" icon="fas fa-plug" variant="light">
      <div className="d-flex align-items-center justify-content-between">
        <span>Socket:</span>
        <Badge variant={isConnected ? 'success' : 'danger'}>
          {isConnected ? 'Bağlı' : 'Bağlantı Yok'}
        </Badge>
      </div>
      <div className="d-flex align-items-center justify-content-between mt-2">
        <span>Drone:</span>
        <Badge variant={droneStatusBadge.variant}>
          {droneStatusBadge.text}
        </Badge>
      </div>
    </Card>
  );
}
