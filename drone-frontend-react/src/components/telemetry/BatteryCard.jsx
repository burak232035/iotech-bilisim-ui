/**
 * BatteryCard Component
 * Battery telemetry display with circular progress
 * Adapted from harita.js lines 258-287
 */

import { Card } from '@components/common/Card';
import { CircularProgress } from '@components/common/CircularProgress';
import { useTelemetry } from '@contexts/TelemetryContext';

export function BatteryCard() {
  const { telemetry, lastUpdate } = useTelemetry();

  return (
    <Card title="Drone Bataryası" icon="fas fa-battery-half" variant="info">
      <div className="d-flex flex-column align-items-center justify-content-center">
        <CircularProgress
          value={telemetry.battery}
          colorThresholds={{ low: 20, medium: 50 }}
        />
        <small className="text-muted mt-2">
          Son güncelleme:{' '}
          {lastUpdate ? lastUpdate.toLocaleTimeString('tr-TR') : '--'}
        </small>
      </div>
    </Card>
  );
}
