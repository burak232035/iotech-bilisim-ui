/**
 * GpsCard Component
 * GPS signal and satellite count display
 * Adapted from harita.js lines 321-343
 */

import { Card } from '@components/common/Card';
import { Badge } from '@components/common/Badge';
import { useTelemetry } from '@contexts/TelemetryContext';

export function GpsCard() {
  const { telemetry } = useTelemetry();
  const { gps } = telemetry;

  const getSignalVariant = (level) => {
    if (level === 'STRONG') return 'success';
    if (level === 'MEDIUM') return 'warning';
    return 'danger';
  };

  return (
    <Card title="GPS" icon="fas fa-satellite" variant="primary">
      <div className="d-flex justify-content-between mb-2">
        <span>Sinyal Kalitesi:</span>
        <Badge variant={getSignalVariant(gps.signalLevel)}>
          {gps.signalLevel || 'WEAK'}
        </Badge>
      </div>
      <div className="d-flex justify-content-between">
        <span>Uydu Sayısı:</span>
        <strong className="text-info">
          {gps.satelliteCount !== undefined
            ? `${gps.satelliteCount} uydu`
            : '-- uydu'}
        </strong>
      </div>
    </Card>
  );
}
