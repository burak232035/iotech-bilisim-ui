/**
 * MissionPlanner — Boustrophedon waypoint scan mission planner
 *
 * Numbered step flow:
 *   1  Connect (Android bağlanır — otomatik)
 *   2  Draw / select area on map
 *   3  Set overlap & speed, then "Rota Hesapla"
 *   4  "Görevi Gönder" → AltitudeModal (max 50 m) → confirm → drone
 */

import { useState, useEffect } from 'react';
import { Card } from '@components/common/Card';
import { useMap } from '@contexts/MapContext';
import { useSocket } from '@contexts/SocketContext';
import { useTelemetry } from '@contexts/TelemetryContext';
import { MissionService } from '@services/mission.service';
import { SOCKET_EVENTS, droneIndex, droneLabel, droneColor } from '@utils/constants';

const DEFAULT_ALTITUDE  = 30;
// drone-2 flies 10 m above drone-1 by default (MULTI_DRONE_PROTOCOL.md §6.1)
const DRONE_ALTITUDE_STEP = 10;
const MIN_ALTITUDE_SEPARATION = 10;
const DEFAULT_OVERLAP   = 65; // backend'in fotogrametri-uyumlu varsayılanıyla eşleşiyor
// Düşük tutulursa (örn. 20-30) canlı harita önizlemesinde daha az kare üst üste
// biner, görüntü daha temiz görünür. Yüksek tutulursa (75) ODM ortomozaik için
// gereken örtüşme sağlanır ama çok sayıda üst üste binen kare canlı önizlemede
// dağınık görünür. İkisi aynı anda optimize edilemiyor — uçuşun amacına göre seçin.
const DEFAULT_FRONT_OVERLAP = 20;
const DEFAULT_SPEED     = 8;
const MAX_ALTITUDE      = 50;

function defaultAltitudeFor(droneId) {
  return Math.min(DEFAULT_ALTITUDE + DRONE_ALTITUDE_STEP * (droneIndex(droneId) - 1), MAX_ALTITUDE);
}

// ─── Step badge ────────────────────────────────────────────────────────────────
function Step({ n, label, done, active }) {
  const bg = done ? '#16a34a' : active ? '#1d4ed8' : '#1e293b';
  const border = done ? '#4ade80' : active ? '#60a5fa' : '#334155';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: bg, border: `2px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.78rem', fontWeight: 800, color: '#fff'
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{
        fontSize: '0.8rem', fontWeight: active ? 700 : 500,
        color: done ? '#4ade80' : active ? '#93c5fd' : '#64748b'
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Altitude confirm modal ────────────────────────────────────────────────────
function AltitudeModal({ mission, speedMs, droneId, otherMissions, onConfirm, onCancel }) {
  const [alt, setAlt] = useState(Math.min(mission?.altitudePlanned ?? DEFAULT_ALTITUDE, MAX_ALTITUDE));
  const tooClose = otherMissions.filter(o => Math.abs(o.altitude - alt) < MIN_ALTITUDE_SEPARATION);

  const distKm     = mission ? (mission.totalDistanceM / 1000).toFixed(2) : '—';
  const etaMin     = mission ? Math.round(mission.totalDistanceM / Number(speedMs) / 60) : '—';
  const footprintW = Math.round(2 * alt * Math.tan(82.1 / 2 * Math.PI / 180));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'linear-gradient(135deg,#0c111b,#111827)',
        border: '2px solid #1e3a5f', borderRadius: 16,
        padding: '28px 32px', width: 480, maxWidth: '95vw',
        color: '#e2e8f0', boxShadow: '0 24px 60px rgba(0,0,0,0.7)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: '1.4rem' }}>🚁</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fbbf24', letterSpacing: 0.5 }}>
              ADIM 4 — İRTİFA SEÇ & GÖREVI GÖNDER
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              <strong style={{ color: droneColor(droneId) }}>{droneLabel(droneId)}</strong> · {mission?.areaName ?? '—'} · {mission?.waypointCount} waypoint · {distKm} km · ~{etaMin} dk
            </div>
          </div>
        </div>

        <hr style={{ borderColor: '#1e3a5f', margin: '0 0 20px' }} />

        <div style={{ marginBottom: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '3.2rem', fontWeight: 900, color: '#60a5fa', lineHeight: 1 }}>
              {alt} <span style={{ fontSize: '1.4rem', color: '#94a3b8' }}>m</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6 }}>
              Kamera footprint genişliği: ~{footprintW} m
            </div>
          </div>

          <input
            type="range" min={5} max={MAX_ALTITUDE} step={5}
            value={alt} onChange={e => setAlt(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', marginTop: 2 }}>
            <span>5 m (düşük)</span><span>25 m</span><span>50 m (max)</span>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {[10, 20, 30, 40, 50].map(v => (
              <button key={v} onClick={() => setAlt(v)} style={{
                padding: '4px 14px', fontSize: '0.75rem', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${alt === v ? '#3b82f6' : '#334155'}`,
                background: alt === v ? '#1d4ed8' : 'transparent',
                color: alt === v ? '#fff' : '#94a3b8', fontWeight: alt === v ? 700 : 400
              }}>
                {v} m
              </button>
            ))}
          </div>
        </div>

        {alt === MAX_ALTITUDE && (
          <div style={{
            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            fontSize: '0.75rem', color: '#fbbf24'
          }}>
            <i className="fas fa-exclamation-triangle me-2"></i>
            Maksimum irtifa — mevzuat sınırı 50 m.
          </div>
        )}

        {tooClose.length > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            fontSize: '0.75rem', color: '#fca5a5'
          }}>
            <i className="fas fa-exclamation-triangle me-2"></i>
            {tooClose.map(o => `${droneLabel(o.droneId)} ${o.altitude} m`).join(', ')} irtifasında görevde —
            aradaki fark {MIN_ALTITUDE_SEPARATION} m'den az. Farklı bir irtifa seçin.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { lbl: 'İrtifa', val: `${alt} m`, color: '#60a5fa' },
            { lbl: 'Waypoint', val: mission?.waypointCount, color: '#a78bfa' },
            { lbl: 'Mesafe', val: `${distKm} km`, color: '#34d399' },
            { lbl: 'Süre', val: `~${etaMin} dk`, color: '#fb923c' }
          ].map(({ lbl, val, color }) => (
            <div key={lbl} style={{
              flex: '1 1 80px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1e293b', borderRadius: 8,
              padding: '8px 10px', textAlign: 'center'
            }}>
              <div style={{ fontWeight: 700, color, fontSize: '1rem' }}>{val}</div>
              <div style={{ fontSize: '0.67rem', color: '#64748b' }}>{lbl}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid #334155',
            color: '#94a3b8', fontWeight: 600, fontSize: '0.88rem'
          }}>
            İptal
          </button>
          <button onClick={() => onConfirm(alt)} style={{
            flex: 2, padding: '11px', borderRadius: 10, cursor: 'pointer',
            background: 'linear-gradient(135deg,#166534,#16a34a)',
            border: '1px solid #4ade80', color: '#fff',
            fontWeight: 700, fontSize: '0.95rem',
            boxShadow: '0 0 16px rgba(34,197,94,0.35)'
          }}>
            <i className="fas fa-play me-2"></i>Görevi Drone'a Gönder ({alt} m)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({ status }) {
  if (!status) return null;
  const cls = status.type === 'error'   ? 'alert-danger'  :
              status.type === 'success' ? 'alert-success' :
              status.type === 'warning' ? 'alert-warning' : 'alert-info';
  return <div className={`alert ${cls} py-2 mb-2`} role="alert">{status.msg}</div>;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function MissionPlanner() {
  const { selectedAreaId, drawOrder, setScanRoute } = useMap();
  const { socket, isConnected, droneStatus, selectedDroneId, drones } = useSocket();
  const { dronePosition } = useTelemetry();

  const [areaId,         setAreaId]         = useState('');
  const [altitudeM,      setAltitudeM]      = useState(() => defaultAltitudeFor(selectedDroneId));
  const [overlapPercent, setOverlapPercent] = useState(DEFAULT_OVERLAP);
  const [frontOverlapPercent, setFrontOverlapPercent] = useState(DEFAULT_FRONT_OVERLAP);
  const [speedMs,        setSpeedMs]        = useState(DEFAULT_SPEED);
  const [plannedMission, setPlannedMission] = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [status,         setStatus]         = useState(null);
  const [showAltModal,   setShowAltModal]   = useState(false);
  const [missionStatus,  setMissionStatus]  = useState(null);
  const [currentWpIdx,   setCurrentWpIdx]   = useState(0);
  // Drone the running/last mission was sent to — progress events and the stop
  // button follow it even if the operator selects another drone meanwhile.
  const [missionDroneId, setMissionDroneId] = useState(null);

  // New target drone → its default planning altitude
  useEffect(() => {
    if (selectedDroneId) setAltitudeM(defaultAltitudeFor(selectedDroneId));
  }, [selectedDroneId]);

  // The backend knows which drones are on a mission (drones_state.rthHeight),
  // so the stop button works for the selected drone even if its mission was
  // started before another drone's.
  const selectedOnMission = drones.some(d => d.droneId === selectedDroneId && d.rthHeight != null);

  // Other drones' active missions, for the altitude separation warning
  const otherMissions = drones
    .filter(d => d.droneId !== selectedDroneId && d.missionAltitude != null)
    .map(d => ({ droneId: d.droneId, altitude: d.missionAltitude }));

  const effectiveAreaId  = areaId || selectedAreaId || '';
  const droneConnected   = isConnected && droneStatus === 'active';

  // ── Step state derivation ─────────────────────────────────────────────────────
  const step1Done  = droneConnected;
  const step2Done  = !!effectiveAreaId;
  const step3Done  = !!plannedMission;
  const step4Done  = missionStatus === 'running' || missionStatus === 'complete';

  const activeStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 4;

  // ── Mission socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Events from a drone other than the one this planner's mission went to are ignored
    const isMine = (data) => !data?.droneId || !missionDroneId || data.droneId === missionDroneId;

    const onProgress = (data) => {
      if (!isMine(data)) return;
      setMissionStatus('running');
      if (data?.currentWaypointIndex !== undefined) setCurrentWpIdx(data.currentWaypointIndex);
    };
    const onComplete = (data) => {
      if (!isMine(data)) return;
      setMissionStatus('complete');
      setStatus({ type: 'success', msg: '✅ Drone tarama görevini tamamladı ve eve döndü.' });
    };
    const onStopped = (data) => {
      if (!isMine(data)) return;
      setMissionStatus('stopped');
      setStatus({ type: 'warning', msg: '⚠️ Görev durduruldu.' });
    };
    // Android, waypoint_mission'ı kabul etmezse (örn. 500m güvenlik kilidi)
    // bunu command_response ile bildirir — mission_progress hiç gelmez.
    const onCommandResponse = (data) => {
      if (data?.command !== 'waypoint_mission' || !isMine(data)) return;
      if (data?.status !== 'failed' && data?.status !== 'rejected') return;
      setMissionStatus(null);
      setStatus({ type: 'error', msg: `❌ Görev reddedildi: ${data.error || 'bilinmeyen hata'}` });
    };

    socket.on(SOCKET_EVENTS.MISSION_PROGRESS, onProgress);
    socket.on(SOCKET_EVENTS.MISSION_COMPLETE, onComplete);
    socket.on(SOCKET_EVENTS.MISSION_STOPPED,  onStopped);
    socket.on(SOCKET_EVENTS.COMMAND_RESPONSE, onCommandResponse);
    return () => {
      socket.off(SOCKET_EVENTS.MISSION_PROGRESS, onProgress);
      socket.off(SOCKET_EVENTS.MISSION_COMPLETE, onComplete);
      socket.off(SOCKET_EVENTS.MISSION_STOPPED,  onStopped);
      socket.off(SOCKET_EVENTS.COMMAND_RESPONSE, onCommandResponse);
    };
  }, [socket, missionDroneId]);

  // ── Plan route ────────────────────────────────────────────────────────────────
  const handlePlan = async () => {
    if (!effectiveAreaId) {
      setStatus({ type: 'error', msg: 'Önce haritadan bir alan seçin veya çizin.' });
      return;
    }
    const clampedAlt = Math.min(Number(altitudeM), MAX_ALTITUDE);
    if (clampedAlt !== Number(altitudeM)) setAltitudeM(clampedAlt);

    setLoading(true);
    setPlannedMission(null);
    setScanRoute(null);
    setMissionStatus(null);
    setStatus({ type: 'info', msg: 'Rota hesaplanıyor…' });

    try {
      const result = await MissionService.planMission(effectiveAreaId, {
        altitudeM: clampedAlt, overlapPercent: Number(overlapPercent),
        frontOverlapPercent: Number(frontOverlapPercent), speedMs: Number(speedMs),
        homeLat: dronePosition?.lat ?? undefined,
        homeLon: dronePosition?.lon ?? undefined,
        droneId: selectedDroneId ?? undefined
      });
      setPlannedMission({ ...result, altitudePlanned: clampedAlt });
      setScanRoute(result.waypoints);
      const distKm = (result.totalDistanceM / 1000).toFixed(2);
      const etaMin = Math.round(result.totalDistanceM / Number(speedMs) / 60);

      if (result.homeDistanceM == null) {
        setStatus({
          type: 'success',
          msg: `✅ Rota hazır — ${result.waypointCount} waypoint · ${distKm} km · ~${etaMin} dk · şerit ${result.stripSpacingM} m. ` +
               `⚠️ Drone konumu henüz bilinmiyor — ilk waypoint mesafesi kontrol edilemedi (500 m güvenlik limiti var, dikkatli olun).`
        });
      } else if (result.homeDistanceM > 450) {
        setStatus({
          type: 'error',
          msg: `⚠️ İlk waypoint drone'dan ${result.homeDistanceM} m uzakta — Android'in 500 m güvenlik limitine yakın/üstünde, görev muhtemelen reddedilecek. Alanı drone'a yaklaştırın.`
        });
      } else {
        setStatus({
          type: 'success',
          msg: `✅ Rota hazır — ${result.waypointCount} waypoint · ${distKm} km · ~${etaMin} dk · şerit ${result.stripSpacingM} m · ilk waypoint'e ${result.homeDistanceM} m`
        });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Hata: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // ── Altitude modal confirmed ──────────────────────────────────────────────────
  const handleModalConfirm = async (selectedAlt) => {
    setShowAltModal(false);
    if (!plannedMission || !isConnected) return;

    setLoading(true);
    setStatus({ type: 'info', msg: 'Görev drone\'a iletiliyor…' });

    try {
      const res = await MissionService.startMission({
        droneId:      selectedDroneId ?? undefined,
        waypoints:    plannedMission.waypoints,
        areaId:       plannedMission.areaId,
        areaName:     plannedMission.areaName,
        altitudeM:    selectedAlt,
        speedMs:      Number(speedMs),
        savedRouteId: plannedMission.savedRouteId
      });
      setMissionDroneId(res.droneId ?? selectedDroneId);
      setMissionStatus('running');
      setCurrentWpIdx(0);
      const rth = res.rthHeight != null ? ` · RTH irtifası ${res.rthHeight} m` : '';
      setStatus(res.warning
        ? { type: 'warning', msg: `🚁 ${res.message}${rth}. ⚠️ ${res.warning}` }
        : { type: 'success', msg: `🚁 ${res.message}${rth}` });
    } catch (err) {
      setStatus({ type: 'error', msg: `Görev gönderilemedi: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    const target = selectedDroneId ?? missionDroneId;
    if (!window.confirm(`${droneLabel(target)} görevi durdurulsun ve eve dönsün mü?`)) return;
    try {
      await MissionService.stopMission(target);
      if (target === missionDroneId) setMissionStatus('stopped');
      setStatus({ type: 'warning', msg: 'Durdurma komutu gönderildi.' });
    } catch (err) {
      setStatus({ type: 'error', msg: `Durdurma hatası: ${err.message}` });
    }
  };

  const handleClearRoute = () => {
    setScanRoute(null); setPlannedMission(null);
    setStatus(null); setMissionStatus(null);
  };

  const canPlan  = !!effectiveAreaId && !loading;
  const canStart = !!plannedMission && isConnected && !loading && missionStatus !== 'running';
  const canStop  = isConnected && (selectedOnMission || (missionStatus === 'running' && missionDroneId === selectedDroneId));
  const stripPrev = (2 * Number(altitudeM) * Math.tan(82.1 / 2 * Math.PI / 180) * (1 - Number(overlapPercent) / 100)).toFixed(0);

  return (
    <>
      {showAltModal && (
        <AltitudeModal
          mission={plannedMission}
          speedMs={speedMs}
          droneId={selectedDroneId}
          otherMissions={otherMissions}
          onConfirm={handleModalConfirm}
          onCancel={() => setShowAltModal(false)}
        />
      )}

      <div className="row mt-3">
        <div className="col-12">
          <Card title="Waypoint Görev Planlayıcı (DJI Mini 4 Pro)" icon="fas fa-route" variant="success">

            {/* ── Step progress ── */}
            <div style={{
              display: 'flex', gap: 14, marginBottom: 24,
              background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 18px',
              flexWrap: 'wrap', alignItems: 'center'
            }}>
              <Step n={1} label="Android Bağlantısı" done={step1Done} active={activeStep === 1} />
              <div style={{ color: '#334155', fontSize: '1rem' }}>→</div>
              <Step n={2} label="Alan Seç / Çiz" done={step2Done} active={activeStep === 2} />
              <div style={{ color: '#334155', fontSize: '1rem' }}>→</div>
              <Step n={3} label="Rota Hesapla" done={step3Done} active={activeStep === 3} />
              <div style={{ color: '#334155', fontSize: '1rem' }}>→</div>
              <Step n={4} label="İrtifa Seç & Gönder" done={step4Done} active={activeStep === 4} />

              {/* Target drone + connection badge */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedDroneId && (
                  <span style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                    border: `1px solid ${droneColor(selectedDroneId)}`, color: droneColor(selectedDroneId)
                  }}>
                    Hedef: {droneLabel(selectedDroneId)}
                  </span>
                )}
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                  background: droneConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  border: `1px solid ${droneConnected ? '#4ade80' : '#f87171'}`,
                  color: droneConnected ? '#4ade80' : '#f87171'
                }}>
                  {droneConnected ? '● Drone Bağlı' : isConnected ? '◌ Sunucu Bağlı — Drone Bekleniyor' : '✕ Bağlantı Yok'}
                </span>
              </div>
            </div>

            {/* ── Step 1 hint ── */}
            {!step1Done && (
              <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.85rem' }}>
                <i className="fas fa-mobile-alt me-2"></i>
                <strong>Adım 1:</strong> Android uygulamasını başlatın ve aynı WiFi ağına bağlı olduğundan emin olun.
                Bağlantı kurulduğunda "Drone Bağlı" rozeti yeşile döner.
              </div>
            )}

            {/* ── Step 2 hint ── */}
            {step1Done && !step2Done && (
              <div className="alert alert-info py-2 mb-3" style={{ fontSize: '0.85rem' }}>
                <i className="fas fa-draw-polygon me-2"></i>
                <strong>Adım 2:</strong> Haritada sol üstteki çizim araçlarıyla bir alan çizin (poligon veya dikdörtgen),
                ya da aşağıdan mevcut bir alanı seçin.
              </div>
            )}

            {/* ── Config row ── */}
            <div className="row g-3 mb-3">
              <div className="col-md-5">
                <label className="form-label fw-bold">
                  <i className="fas fa-map-marker-alt me-1 text-primary"></i>
                  Alan {activeStep === 2 && <span className="badge bg-info ms-1">Adım 2</span>}
                </label>
                <select
                  className="form-select"
                  value={areaId || selectedAreaId || ''}
                  onChange={e => setAreaId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Alan seçin (veya haritadan tıklayın) --</option>
                  {drawOrder.map(a => (
                    <option key={a.dbId} value={a.dbId}>{a.name} (ID: {a.dbId})</option>
                  ))}
                </select>
                {selectedAreaId && !areaId && (
                  <small className="text-success">
                    <i className="fas fa-check-circle me-1"></i>Haritadan seçili: ID {selectedAreaId}
                  </small>
                )}
              </div>

              <div className="col-md-2 col-6">
                <label className="form-label fw-bold">
                  <i className="fas fa-arrows-alt-v me-1 text-info"></i>Planlama İrtifası (m)
                </label>
                <input
                  type="number" className="form-control"
                  value={altitudeM} min={5} max={MAX_ALTITUDE} step={5}
                  onChange={e => setAltitudeM(Math.min(Number(e.target.value), MAX_ALTITUDE))}
                  disabled={loading}
                />
                <small className="text-muted">Maks {MAX_ALTITUDE} m</small>
              </div>

              <div className="col-md-2 col-6">
                <label className="form-label fw-bold">
                  <i className="fas fa-layer-group me-1 text-warning"></i>Örtüşme (%)
                </label>
                <input
                  type="number" className="form-control"
                  value={overlapPercent} min={0} max={90} step={5}
                  onChange={e => setOverlapPercent(e.target.value)}
                  disabled={loading}
                />
                <small className="text-muted">Yan örtüşme</small>
              </div>

              <div className="col-md-2 col-6">
                <label className="form-label fw-bold">
                  <i className="fas fa-layer-group me-1 text-warning"></i>İleri Örtüşme (%)
                </label>
                <input
                  type="number" className="form-control"
                  value={frontOverlapPercent} min={0} max={90} step={5}
                  onChange={e => setFrontOverlapPercent(e.target.value)}
                  disabled={loading}
                />
                <small className="text-muted">
                  Düşük (~20): temiz canlı önizleme. Yüksek (~75): ODM ortomozaik için gerekli, ama kareler üst üste biner.
                </small>
              </div>

              <div className="col-md-2 col-6">
                <label className="form-label fw-bold">
                  <i className="fas fa-tachometer-alt me-1 text-danger"></i>Hız (m/s)
                </label>
                <input
                  type="number" className="form-control"
                  value={speedMs} min={1} max={15} step={1}
                  onChange={e => setSpeedMs(e.target.value)}
                  disabled={loading}
                />
                <small className="text-muted">Max 15 m/s</small>
              </div>

              <div className="col-md-1 col-6 d-flex align-items-center">
                <div className="text-center w-100">
                  <div className="fw-bold text-muted" style={{ fontSize: '0.75rem' }}>Şerit</div>
                  <div className="fw-bold text-primary">{stripPrev} m</div>
                </div>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className="d-flex flex-wrap gap-2 mb-3">
              <button
                className={`btn ${activeStep === 3 ? 'btn-info' : 'btn-outline-info'}`}
                onClick={handlePlan}
                disabled={!canPlan}
              >
                {loading && !showAltModal ? (
                  <><i className="fas fa-spinner fa-spin me-2"></i>Hesaplanıyor…</>
                ) : (
                  <><i className="fas fa-calculator me-2"></i>Adım 3 — Rota Hesapla</>
                )}
              </button>

              <button
                className={`btn ${activeStep === 4 && canStart ? 'btn-success' : 'btn-outline-success'}`}
                onClick={() => setShowAltModal(true)}
                disabled={!canStart}
              >
                <i className="fas fa-paper-plane me-2"></i>Adım 4 — Görevi Gönder{selectedDroneId ? ` (${droneLabel(selectedDroneId)})` : ''}
              </button>

              {canStop && (
                <button className="btn btn-danger" onClick={handleStop}>
                  <i className="fas fa-stop me-2"></i>Görevi Durdur (RTH){selectedDroneId ? ` — ${droneLabel(selectedDroneId)}` : ''}
                </button>
              )}

              {plannedMission && (
                <button
                  className="btn btn-outline-secondary ms-auto"
                  onClick={handleClearRoute} disabled={loading}
                >
                  <i className="fas fa-times me-1"></i>Rotayı Temizle
                </button>
              )}
            </div>

            {/* ── Status ── */}
            <StatusBanner status={status} />

            {/* ── Progress bar ── */}
            {missionStatus === 'running' && plannedMission && (
              <div className="mb-3">
                <div className="d-flex justify-content-between mb-1">
                  <small className="text-muted">Görev ilerleme{missionDroneId ? ` — ${droneLabel(missionDroneId)}` : ''}</small>
                  <small className="fw-bold">WP {currentWpIdx + 1} / {plannedMission.waypointCount}</small>
                </div>
                <div className="progress" style={{ height: '10px' }}>
                  <div
                    className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                    style={{ width: `${Math.round((currentWpIdx / Math.max(1, plannedMission.waypointCount - 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Summary cards ── */}
            {plannedMission && (
              <div className="row g-2">
                {[
                  { val: plannedMission.waypointCount, lbl: 'Waypoint', cls: 'text-primary' },
                  { val: `${(plannedMission.totalDistanceM/1000).toFixed(2)} km`, lbl: 'Toplam Mesafe', cls: 'text-primary' },
                  { val: `${Math.round(plannedMission.totalDistanceM / Number(speedMs) / 60)} dk`, lbl: 'Tahmini Süre', cls: 'text-primary' },
                  { val: `${plannedMission.stripSpacingM} m`, lbl: 'Şerit Aralığı', cls: 'text-primary' },
                  {
                    val: plannedMission.homeDistanceM != null ? `${plannedMission.homeDistanceM} m` : '—',
                    lbl: "İlk WP'ye Mesafe",
                    cls: plannedMission.homeDistanceM > 450 ? 'text-danger' : 'text-primary'
                  },
                  { val: `${plannedMission.footprintWidthM} m`, lbl: 'Kamera Genişliği', cls: 'text-secondary' },
                  { val: `${plannedMission.sweepAngleDeg}°`, lbl: 'Tarama Açısı', cls: 'text-secondary' },
                  { val: `${plannedMission.altitudePlanned ?? altitudeM} m`, lbl: 'Planlama İrtifası', cls: 'text-secondary' },
                  {
                    val: missionStatus === 'running'  ? 'UÇUYOR'     :
                         missionStatus === 'complete' ? 'TAMAMLANDI' :
                         missionStatus === 'stopped'  ? 'DURDURULDU' : 'HAZIR',
                    lbl: 'Görev Durumu',
                    cls: missionStatus === 'running'  ? 'text-warning' :
                         missionStatus === 'complete' ? 'text-success' :
                         missionStatus === 'stopped'  ? 'text-danger'  : 'text-muted'
                  }
                ].map(({ val, lbl, cls }) => (
                  <div key={lbl} className="col-6 col-md-3">
                    <div className="border rounded p-2 text-center h-100">
                      <div className={`fw-bold fs-5 ${cls}`}>{val}</div>
                      <small className="text-muted">{lbl}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!plannedMission && step1Done && step2Done && (
              <p className="text-muted mb-0 mt-2" style={{ fontSize: '0.85rem' }}>
                <i className="fas fa-info-circle me-1"></i>
                Alan seçildi. Şimdi <strong>Adım 3 — Rota Hesapla</strong> butonuna basın.
                Rota haritada gösterilecek, ardından irtifa seçip gönderebilirsiniz.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
