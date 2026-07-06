/**
 * DashboardPage Component
 * Main dashboard with map, telemetry, and controls
 * Adapted from harita/harita.html
 */

import { PageTransition } from '@components/layout/PageTransition';
import { Card } from '@components/common/Card';
import { LeafletMap } from '@components/map/LeafletMap';
import { AreaLegend } from '@components/map/AreaLegend';
import { TelemetryGrid } from '@components/telemetry/TelemetryGrid';
import { GimbalCard } from '@components/telemetry/GimbalCard';
import { AltitudeCard } from '@components/telemetry/AltitudeCard';
import { GpsCard } from '@components/telemetry/GpsCard';
import { DroneControls } from '@components/dashboard/DroneControls';
import { ActionButtons } from '@components/dashboard/ActionButtons';
import { ReportGenerator } from '@components/dashboard/ReportGenerator';
import { MissionPlanner } from '@components/dashboard/MissionPlanner';
import { useMap } from '@contexts/MapContext';

function PhotoOverlayPanel() {
  const { photoCount, clearPhotoOverlays } = useMap();
  if (photoCount === 0) return null;
  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)', color: '#fff',
      borderRadius: 8, padding: '6px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: '0.82rem', backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.15)'
    }}>
      <span>📷 <strong>{photoCount}</strong> fotoğraf haritada</span>
      <button
        onClick={clearPhotoOverlays}
        style={{
          background: 'rgba(239,68,68,0.7)', border: 'none',
          color: '#fff', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: '0.73rem', fontWeight: 600
        }}
      >
        Temizle
      </button>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PageTransition>
      <section className="content-header">
        <div className="container-fluid">
          <h4>Drone Telemetri & Alan Analizi Dashboard</h4>
        </div>
      </section>

      <section className="content">
        <div className="container-fluid">
          {/* MAP */}
          <div className="row">
            <div className="col-12">
              <Card
                title="Fırat Üniversitesi Mühendislik Fakültesi Drone Konumu"
                icon="fas fa-map-marked-alt"
                variant="primary"
              >
                <div style={{ position: 'relative' }}>
                  <LeafletMap />
                  {/* Photo overlay counter */}
                  <PhotoOverlayPanel />
                  {/* Area Legend positioned over map */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      right: '10px',
                      zIndex: 1000
                    }}
                  >
                    <AreaLegend />
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* TELEMETRY CARDS */}
          <TelemetryGrid />

          {/* GIMBAL, ALTITUDE, GPS ROW */}
          <div className="row mt-3">
            <div className="col-md-4 mb-3">
              <GimbalCard />
            </div>
            <div className="col-md-4 mb-3">
              <AltitudeCard />
            </div>
            <div className="col-md-4 mb-3">
              <GpsCard />
            </div>
          </div>

          {/* WAYPOINT MISSION PLANNER */}
          <MissionPlanner />

          {/* DRONE CONTROLS */}
          <DroneControls />

          {/* ACTION BUTTONS */}
          <ActionButtons />

          {/* REPORT GENERATOR */}
          <ReportGenerator />
        </div>
      </section>
    </PageTransition>
  );
}
