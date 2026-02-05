/**
 * GimbalCard Component
 * Gimbal (camera) angles display
 * Adapted from harita.js lines 289-305
 */

import { Card } from '@components/common/Card';
import { useTelemetry } from '@contexts/TelemetryContext';

export function GimbalCard() {
  const { telemetry } = useTelemetry();
  const { gimbal } = telemetry;

  return (
    <Card title="Gimbal (Kamera)" icon="fas fa-video" variant="warning">
      <div className="d-flex justify-content-between mb-2">
        <span>Pitch (Yukarı/Aşağı):</span>
        <strong className="text-primary">
          {gimbal.pitch !== undefined ? `${gimbal.pitch.toFixed(1)}°` : '--'}
        </strong>
      </div>
      <div className="d-flex justify-content-between mb-2">
        <span>Roll (Yatış):</span>
        <strong className="text-primary">
          {gimbal.roll !== undefined ? `${gimbal.roll.toFixed(1)}°` : '--'}
        </strong>
      </div>
      <div className="d-flex justify-content-between">
        <span>Yaw (Dönüş):</span>
        <strong className="text-primary">
          {gimbal.yaw !== undefined ? `${gimbal.yaw.toFixed(1)}°` : '--'}
        </strong>
      </div>
    </Card>
  );
}
