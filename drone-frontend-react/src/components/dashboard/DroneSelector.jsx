/**
 * DroneSelector — multi-drone bar above the map.
 *
 * Shows every drone the backend knows (drones_state) as a selectable chip.
 * The selected drone is the target of every command, mission and telemetry
 * card on the dashboard. "Tümü" buttons send emergency commands to all
 * connected drones (backend fans them out per drone; hover is excluded until
 * Android stops running missions on hover — MULTI_DRONE_PROTOCOL.md §3.3).
 */

import { useSocket } from '@contexts/SocketContext';
import { useTelemetry } from '@contexts/TelemetryContext';
import { droneColor, droneLabel, flightModeLabel } from '@utils/constants';

const ALL_ACTIONS = [
  { command: 'emergency_land', label: 'Acil İniş', icon: 'fa-arrow-down', confirm: 'TÜM drone\'lar bulundukları yere acil iniş yapsın mı?', cls: 'btn-danger' },
  { command: 'returnHome',     label: 'Eve Dön',   icon: 'fa-home',       confirm: 'TÜM drone\'lar eve dönsün mü (RTH)?',               cls: 'btn-warning' },
  { command: 'stop_mission',   label: 'Görevi Durdur', icon: 'fa-stop',   confirm: 'TÜM drone\'ların görevi durdurulsun mu?',           cls: 'btn-outline-danger' }
];

function DroneChip({ drone, telemetry, selected, onSelect }) {
  const color = droneColor(drone.droneId);
  const t = telemetry?.telemetry;
  const mode = flightModeLabel(t?.flightMode);
  const legacy = drone.protocol < 2;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
        background: selected ? 'rgba(59,130,246,0.12)' : '#fff',
        border: `2px solid ${selected ? color : '#dee2e6'}`,
        boxShadow: selected ? `0 0 0 3px ${color}33` : 'none',
        minWidth: 190
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        background: drone.connected ? color : '#adb5bd',
        boxShadow: drone.connected ? `0 0 6px ${color}` : 'none'
      }} />
      <span style={{ lineHeight: 1.25 }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
          {droneLabel(drone.droneId)}
          {legacy && (
            <span className="badge bg-warning text-dark ms-2" title="Eski uygulama sürümü: RTH irtifası uygulanmıyor">
              eski sürüm
            </span>
          )}
        </span>
        <br />
        <small className={drone.connected ? 'text-success' : 'text-muted'}>
          {drone.connected ? 'Bağlı' : 'Bağlantı yok'}
        </small>
        {drone.connected && t && (
          <small className="text-muted">
            {' · '}%{Math.round(t.battery ?? 0)}
            {mode && ` · ${mode}`}
          </small>
        )}
        {drone.rthHeight != null && (
          <small className="text-muted d-block">Görevde · RTH {drone.rthHeight} m</small>
        )}
      </span>
    </button>
  );
}

export function DroneSelector() {
  const { drones, selectedDroneId, setSelectedDroneId, sendCommand, isConnected } = useSocket();
  const { telemetryByDrone } = useTelemetry();

  const online = drones.filter((d) => d.connected);
  const legacyWithOthers = online.length > 1 && online.some((d) => d.protocol < 2);

  const sendToAll = (action) => {
    if (!window.confirm(action.confirm)) return;
    sendCommand(action.command, { droneId: 'all' });
  };

  return (
    <div className="card mb-3">
      <div className="card-body py-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-bold me-1">
            <i className="fas fa-helicopter me-1"></i>Drone'lar
          </span>

          {drones.length === 0 && (
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              {isConnected ? 'Henüz bağlanan drone yok — Android uygulamasını açın.' : 'Sunucuya bağlanılamıyor.'}
            </span>
          )}

          {drones.map((d) => (
            <DroneChip
              key={d.droneId}
              drone={d}
              telemetry={telemetryByDrone[d.droneId]}
              selected={d.droneId === selectedDroneId}
              onSelect={() => setSelectedDroneId(d.droneId)}
            />
          ))}

          {online.length > 0 && (
            <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
              <span className="fw-bold text-danger" style={{ fontSize: '0.85rem' }}>Tümü:</span>
              {ALL_ACTIONS.map((a) => (
                <button
                  key={a.command}
                  type="button"
                  className={`btn btn-sm ${a.cls}`}
                  onClick={() => sendToAll(a)}
                  disabled={!isConnected}
                >
                  <i className={`fas ${a.icon} me-1`}></i>{a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedDroneId && (
          <small className="text-muted d-block mt-1">
            Komutlar, görevler ve aşağıdaki telemetri kartları <strong>{droneLabel(selectedDroneId)}</strong> içindir.
            {drones.find((d) => d.droneId === selectedDroneId && !d.connected) && (
              <span className="text-danger"> Seçili drone şu an bağlı değil — komutlar reddedilir.</span>
            )}
          </small>
        )}

        {legacyWithOthers && (
          <div className="alert alert-warning py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.8rem' }}>
            <i className="fas fa-exclamation-triangle me-1"></i>
            Eski sürümdeki bir drone (protokol v1) başka bir drone ile birlikte bağlı. Eski sürüm RTH irtifasını
            uygulamadığı için bu durumda görev gönderilemez — tableti yeni sürüme güncelleyin.
          </div>
        )}
      </div>
    </div>
  );
}
