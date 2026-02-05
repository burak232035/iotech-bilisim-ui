/**
 * TelemetryGrid Component
 * Grid layout wrapper for telemetry cards
 */

import { BatteryCard } from './BatteryCard';
import { ScanProgressCard } from './ScanProgressCard';
import { ConnectionStatusCard } from './ConnectionStatusCard';

export function TelemetryGrid() {
  return (
    <div className="row mt-3">
      <div className="col-md-3 mb-3">
        <BatteryCard />
      </div>
      <div className="col-md-3 mb-3">
        <ScanProgressCard />
      </div>
      <div className="col-md-3 mb-3">
        <div className="card card-light">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-draw-polygon"></i> Seçili Alan
            </h3>
          </div>
          <div className="card-body">
            <div>
              <strong id="selectedAreaName">Seçilmedi</strong>
            </div>
            <small className="text-muted">
              Lejanttan veya haritadaki polygona tıklayarak seç.
            </small>
          </div>
        </div>
      </div>
      <div className="col-md-3 mb-3">
        <ConnectionStatusCard />
      </div>
    </div>
  );
}
