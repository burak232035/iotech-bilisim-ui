/**
 * AltitudeCard Component
 * Altitude display (AGL and AMSL)
 * Adapted from harita.js lines 307-319
 */

import { Card } from '@components/common/Card';
import { useTelemetry } from '@contexts/TelemetryContext';

export function AltitudeCard() {
  const { telemetry } = useTelemetry();
  const { altitude } = telemetry;

  return (
    <Card title="Yükseklik" icon="fas fa-arrows-alt-v" variant="info">
      <div className="d-flex justify-content-between mb-2">
        <span>Yerden Yükseklik (AGL):</span>
        <strong className="text-success">
          {altitude.agl !== undefined ? `${altitude.agl.toFixed(1)} m` : '-- m'}
        </strong>
      </div>
      <div className="d-flex justify-content-between">
        <span>Deniz Seviyesi (AMSL):</span>
        <strong className="text-success">
          {altitude.amsl !== undefined
            ? `${altitude.amsl.toFixed(1)} m`
            : '-- m'}
        </strong>
      </div>
    </Card>
  );
}
