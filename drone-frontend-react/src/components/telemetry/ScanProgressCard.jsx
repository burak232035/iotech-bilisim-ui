/**
 * ScanProgressCard Component
 * Area scan progress display with circular progress
 * Adapted from harita.js lines 345-365
 */

import { Card } from '@components/common/Card';
import { CircularProgress } from '@components/common/CircularProgress';
import { useTelemetry } from '@contexts/TelemetryContext';
import { useMap } from '@contexts/MapContext';

export function ScanProgressCard() {
  const { telemetry } = useTelemetry();
  const { selectedAreaId, areaMetrics } = useMap();

  // Get scan percentage for selected area, fallback to telemetry
  const getScanPercent = () => {
    if (selectedAreaId) {
      const metric = areaMetrics.get(selectedAreaId);
      if (metric?.scanPercent !== undefined) {
        return metric.scanPercent;
      }
    }
    return telemetry.scanPercent || 0;
  };

  return (
    <Card title="Tarama Oranı" icon="fas fa-radar" variant="success">
      <div className="d-flex justify-content-center">
        <CircularProgress
          value={getScanPercent()}
          colorThresholds={{ low: 30, medium: 70 }}
        />
      </div>
    </Card>
  );
}
