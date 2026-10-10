/**
 * ManualControlPanel
 * Açık elle kontrol modu paneli — joystick, hover, kamera/gimbal, acil iniş.
 *
 * Gönderilen komutlar (drone_command event'i üzerinden):
 *   virtual_stick  — { leftStick:{x,y}, rightStick:{x,y} }  10 Hz
 *   hover          — Pozisyon kilidi (olduğu yerde dur)
 *   gimbal_pitch   — { pitch: number }  -90° … +30°
 *   emergency_land — Hemen in, RTH yok
 *
 * Android geri bildirimi:
 *   command_response — { command, status, error?, timestamp }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@contexts/SocketContext';
import { useTelemetry } from '@contexts/TelemetryContext';
import { droneLabel, droneColor } from '@utils/constants';

// ─── Sabitler ──────────────────────────────────────────────────────────────────
const STICK_SEND_HZ = 10;   // virtual stick gönderim frekansı
const STICK_MS = 1000 / STICK_SEND_HZ;

// ─── Yardımcılar ───────────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;

// ─── Joystick alt bileşeni ─────────────────────────────────────────────────────
function Joystick({ topLabel, bottomLabel, onChange }) {
  const CONTAINER = 138;
  const THUMB = 44;
  const MAX = (CONTAINER / 2) - (THUMB / 2) - 6;

  const wrapRef   = useRef(null);
  const thumbRef  = useRef(null);
  const dragging  = useRef(false);
  const origin    = useRef({ x: 0, y: 0 });

  const setThumb = (nx, ny) => {
    if (!thumbRef.current) return;
    thumbRef.current.style.left      = `calc(50% + ${nx * MAX}px)`;
    thumbRef.current.style.top       = `calc(50% + ${-ny * MAX}px)`;
    thumbRef.current.style.transition = dragging.current ? 'none' : 'left .12s ease, top .12s ease';
  };

  const onDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    const r = wrapRef.current.getBoundingClientRect();
    origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    wrapRef.current.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    const d = Math.hypot(dx, dy);
    const s = d > MAX ? MAX / d : 1;
    const nx =  (dx * s) / MAX;
    const ny = -(dy * s) / MAX;
    setThumb(nx, ny);
    onChange(nx, ny);
  };

  const onUp = () => {
    dragging.current = false;
    setThumb(0, 0);
    onChange(0, 0);
  };

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          width: CONTAINER, height: CONTAINER, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #1e3a5f, #0a0f1a)',
          border: '2px solid #1e3a5f',
          boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px #0f172a',
          position: 'relative', margin: '0 auto',
          cursor: 'crosshair', touchAction: 'none'
        }}
      >
        {/* Crosshair */}
        <div style={{ position:'absolute', top:'50%', left:10, right:10, height:1, background:'#1e3a5f', marginTop:-0.5 }} />
        <div style={{ position:'absolute', left:'50%', top:10, bottom:10, width:1, background:'#1e3a5f', marginLeft:-0.5 }} />
        {/* Thumb */}
        <div
          ref={thumbRef}
          style={{
            position:'absolute', width:THUMB, height:THUMB, borderRadius:'50%',
            background:'radial-gradient(circle at 35% 30%, #93c5fd, #1d4ed8)',
            border:'2px solid #60a5fa',
            top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            pointerEvents:'none',
            boxShadow:'0 0 16px rgba(59,130,246,0.55)'
          }}
        />
      </div>
      <div style={{ marginTop: 7, lineHeight: 1.4 }}>
        <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#cbd5e1' }}>{topLabel}</div>
        <div style={{ fontSize:'0.67rem', color:'#64748b' }}>{bottomLabel}</div>
      </div>
    </div>
  );
}

// ─── Bağlantı durumu rozeti ────────────────────────────────────────────────────
function ConnBadge({ isConnected, droneStatus }) {
  const active = isConnected && droneStatus === 'active';
  const partial = isConnected && !active;
  const color = active ? '#22c55e' : partial ? '#f59e0b' : '#ef4444';
  const label = active   ? 'DRONE BAĞLI & AKTİF'
              : partial  ? 'SUNUCU BAĞLI — Drone Bekleniyor'
              : 'BAĞLANTI YOK';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:7,
      padding:'4px 12px', background:'rgba(0,0,0,0.35)', borderRadius:20
    }}>
      <div style={{
        width:9, height:9, borderRadius:'50%', background:color,
        boxShadow:`0 0 7px ${color}`
      }} />
      <span style={{ fontSize:'0.72rem', fontWeight:700, color, letterSpacing:0.5 }}>{label}</span>
    </div>
  );
}

// ─── Ana bileşen ───────────────────────────────────────────────────────────────
export function ManualControlPanel({ onClose }) {
  const { socket, isConnected, sendCommand: sendToSelected, drones, selectedDroneId } = useSocket();
  const { telemetryByDrone } = useTelemetry();

  // The panel's target is fixed when it opens: selecting another drone while
  // the joysticks stream virtual_stick at 10 Hz must not retarget them.
  const [targetDroneId] = useState(selectedDroneId);
  const sendCommand = useCallback(
    (command, payload = {}) => sendToSelected(command, { ...payload, droneId: targetDroneId ?? undefined }),
    [sendToSelected, targetDroneId]
  );
  const targetDrone = drones.find(d => d.droneId === targetDroneId);
  const droneStatus = targetDrone ? (targetDrone.connected ? 'active' : 'waiting') : (drones.length ? 'waiting' : 'unknown');
  const telemetry = telemetryByDrone[targetDroneId || 'drone-1']?.telemetry ?? {
    battery: 0, gimbal: { pitch: 0, roll: 0, yaw: 0 }, altitude: { agl: 0, amsl: 0 },
    gps: { signalLevel: 'WEAK', satelliteCount: 0 }
  };

  // Joystick değerleri (ref — render tetikleme gerekmez)
  const leftRef  = useRef({ x: 0, y: 0 });
  const rightRef = useRef({ x: 0, y: 0 });

  // sendCommand değiştiğinde ref'i güncelle (interval'de kullanmak için)
  const sendRef = useRef(sendCommand);
  useEffect(() => { sendRef.current = sendCommand; }, [sendCommand]);

  const [showCamera, setShowCamera] = useState(false);
  const [pendingPitch, setPendingPitch] = useState(-45);
  const [appliedPitch, setAppliedPitch] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null); // { type, text }
  const [lastResp, setLastResp] = useState(null);

  const flash = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // Virtual stick gönderim döngüsü (10 Hz)
  useEffect(() => {
    const iv = setInterval(() => {
      const ls = leftRef.current;
      const rs = rightRef.current;
      sendRef.current('virtual_stick', {
        leftStick:  { x: r2(ls.x), y: r2(ls.y) },
        rightStick: { x: r2(rs.x), y: r2(rs.y) }
      });
    }, STICK_MS);
    return () => clearInterval(iv);
  }, []); // sadece mount/unmount

  // Android'den gelen command_response dinleyicisi
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      // Only this panel's drone (responses without droneId come from v1 / backend)
      if (data?.droneId && targetDroneId && data.droneId !== targetDroneId) return;
      setLastResp(data);
      if (data?.status === 'success')
        flash('success', `✅ "${data.command}" komutu başarılı`);
      else if (data?.status === 'failed' || data?.status === 'rejected')
        flash('error', `❌ "${data.command}" başarısız${data.error ? `: ${data.error}` : ''}`);
    };
    socket.on('command_response', handler);
    return () => socket.off('command_response', handler);
  }, [socket, targetDroneId]);

  // ── Aksiyonlar ──────────────────────────────────────────────────────────────
  const handleHover = () => {
    leftRef.current  = { x: 0, y: 0 };
    rightRef.current = { x: 0, y: 0 };
    sendCommand('hover', {});
    flash('info', '📍 Pozisyon kilidi komutu gönderildi — drone olduğu yerde hover yapacak');
  };

  const handleGimbalApply = () => {
    const pitch = Number(pendingPitch);
    sendCommand('gimbal_pitch', { pitch });
    setAppliedPitch(pitch);
    flash('info', `📷 Gimbal pitch ${pitch}° olarak ayarlandı`);
  };

  const handleEmergencyLand = () => {
    sendCommand('emergency_land', {});
    flash('warning', '⚠️ ACİL İNİŞ KOMUTU GÖNDERİLDİ — Drone hemen inecek!');
  };

  // ── Gimbal önayarları ────────────────────────────────────────────────────────
  const GIMBAL_PRESETS = [
    { v: -90, lbl: '−90° Dik' },
    { v: -75, lbl: '−75° Fotoğraf' },
    { v: -45, lbl: '−45° Genel' },
    { v: -15, lbl: '−15° İleri' },
    { v: 0,   lbl: '0° Düz' },
    { v: 25,  lbl: '+25° Yukarı' }
  ];

  const pitchLabel =
    pendingPitch <= -80 ? 'Dik aşağı bakış (haritalama)' :
    pendingPitch <= -55 ? 'Çapraz aşağı (genel izleme)' :
    pendingPitch <= -25 ? 'Hafif aşağı (sinematik)' :
    pendingPitch <=  5  ? 'İleri bak (ufuk)' :
                          'Yukarı bak';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="row mt-2">
      <div className="col-12">
        <div style={{
          background: 'linear-gradient(135deg, #0c111b 0%, #111827 100%)',
          border: '2px solid #1e3a5f',
          borderRadius: 14,
          padding: '18px 20px',
          color: '#e2e8f0'
        }}>

          {/* ── Başlık satırı ────────────────────────────────────────────── */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fbbf24', letterSpacing: 1 }}>
                <i className="fas fa-gamepad me-2"></i>ELLE KONTROL MODU
              </span>
              <ConnBadge isConnected={isConnected} droneStatus={droneStatus} />
              {targetDroneId && (
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                  border: `1px solid ${droneColor(targetDroneId)}`, color: droneColor(targetDroneId)
                }} title="Panel açıkken hedef değişmez; başka drone için paneli kapatıp yeniden açın">
                  Hedef: {droneLabel(targetDroneId)} (sabit)
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              <i className="fas fa-times me-1"></i>Kapat
            </button>
          </div>

          {/* ── Joystick satırı ─────────────────────────────────────────── */}
          <div style={{ display:'flex', justifyContent:'space-around', alignItems:'flex-start', gap:16, marginBottom:20 }}>
            {/* Sol çubuk */}
            <div>
              <div style={{ textAlign:'center', marginBottom:6 }}>
                <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.5 }}>SOL ÇUBUK</span>
              </div>
              <Joystick
                topLabel="Throttle / Yaw"
                bottomLabel="↑↓ İrtifa · ←→ Dönüş"
                onChange={(x, y) => { leftRef.current = { x, y }; }}
              />
            </div>

            {/* Orta bilgi kutusu */}
            <div style={{
              minWidth: 120, textAlign:'center', paddingTop:10,
              fontSize:'0.7rem', color:'#475569', lineHeight:1.9
            }}>
              <i className="fas fa-circle" style={{ fontSize:8, color:'#22c55e' }}></i>
              <div style={{ marginTop:4 }}>Sol: irtifa + yaw</div>
              <div>Sağ: pitch + roll</div>
              <div style={{ marginTop:8, height:1, background:'#1e293b' }} />
              <div style={{ marginTop:8, fontSize:'0.65rem', color:'#334155' }}>
                Bırakınca drone<br/>hover yapar
              </div>
            </div>

            {/* Sağ çubuk */}
            <div>
              <div style={{ textAlign:'center', marginBottom:6 }}>
                <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.5 }}>SAĞ ÇUBUK</span>
              </div>
              <Joystick
                topLabel="Pitch / Roll"
                bottomLabel="↑↓ İleri/Geri · ←→ Sağ/Sol"
                onChange={(x, y) => { rightRef.current = { x, y }; }}
              />
            </div>
          </div>

          {/* ── 3 ana buton ─────────────────────────────────────────────── */}
          <div className="row g-2 mb-3">

            {/* Pozisyon Tut */}
            <div className="col-md-4">
              <button
                className="btn w-100"
                onClick={handleHover}
                disabled={!isConnected}
                style={{
                  padding: '12px 8px',
                  background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                  border: '1px solid #3b82f6',
                  color: '#fff',
                  borderRadius: 10
                }}
              >
                <div style={{ fontSize:'1.3rem' }}>
                  <i className="fas fa-crosshairs"></i>
                </div>
                <div style={{ fontSize:'0.88rem', fontWeight:700, marginTop:4 }}>Pozisyon Tut</div>
                <div style={{ fontSize:'0.67rem', opacity:0.75, marginTop:2 }}>
                  Hover — olduğu yerde askıda kal
                </div>
              </button>
            </div>

            {/* Kamera & Gimbal */}
            <div className="col-md-4">
              <button
                className="btn w-100"
                onClick={() => setShowCamera(v => !v)}
                style={{
                  padding: '12px 8px',
                  background: showCamera
                    ? 'linear-gradient(135deg,#92400e,#b45309)'
                    : 'linear-gradient(135deg,#164e63,#0e7490)',
                  border: `1px solid ${showCamera ? '#f59e0b' : '#06b6d4'}`,
                  color: '#fff',
                  borderRadius: 10
                }}
              >
                <div style={{ fontSize:'1.3rem' }}>
                  <i className={`fas ${showCamera ? 'fa-eye-slash' : 'fa-camera'}`}></i>
                </div>
                <div style={{ fontSize:'0.88rem', fontWeight:700, marginTop:4 }}>
                  {showCamera ? 'Kamerayı Gizle' : 'Kamera & Gimbal'}
                </div>
                <div style={{ fontSize:'0.67rem', opacity:0.75, marginTop:2 }}>
                  {showCamera ? 'Paneli kapat' : 'Video + açı kontrolü'}
                </div>
              </button>
            </div>

            {/* Acil İniş */}
            <div className="col-md-4">
              <button
                className="btn w-100"
                onClick={handleEmergencyLand}
                disabled={!isConnected}
                style={{
                  padding: '12px 8px',
                  background: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
                  border: '2px solid #fca5a5',
                  color: '#fff',
                  borderRadius: 10,
                  boxShadow: '0 0 18px rgba(239,68,68,0.35)'
                }}
              >
                <div style={{ fontSize:'1.3rem' }}>
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div style={{ fontSize:'0.88rem', fontWeight:800, marginTop:4 }}>ACİL İNİŞ</div>
                <div style={{ fontSize:'0.67rem', opacity:0.82, marginTop:2 }}>
                  Hemen in — RTH yok
                </div>
              </button>
            </div>
          </div>

          {/* ── Durum mesajı ─────────────────────────────────────────────── */}
          {statusMsg && (
            <div className={`alert py-2 mb-3 ${
              statusMsg.type === 'error'   ? 'alert-danger'  :
              statusMsg.type === 'success' ? 'alert-success' :
              statusMsg.type === 'warning' ? 'alert-warning' :
                                             'alert-info'
            }`} style={{ fontSize:'0.85rem' }}>
              {statusMsg.text}
            </div>
          )}

          {/* ── Kamera & Gimbal paneli ───────────────────────────────────── */}
          {showCamera && (
            <div style={{
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: 16,
              marginBottom: 4
            }}>
              <div className="row g-3">

                {/* Kamera görüntüsü */}
                <div className="col-md-7">
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#94a3b8', marginBottom:8, letterSpacing:1 }}>
                    <i className="fas fa-video me-2 text-yellow-400" style={{ color:'#fbbf24' }}></i>
                    KAMERA AKIŞI
                  </div>

                  <div style={{
                    width:'100%', aspectRatio:'16/9',
                    background:'#050b14',
                    border:'1px solid #1e293b', borderRadius:10,
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center',
                    position:'relative', overflow:'hidden'
                  }}>
                    {/* Köşe işaretleri */}
                    {[
                      { top:8,    left:8,    borderTop:'2px solid #22c55e', borderLeft:'2px solid #22c55e' },
                      { top:8,    right:8,   borderTop:'2px solid #22c55e', borderRight:'2px solid #22c55e' },
                      { bottom:8, left:8,    borderBottom:'2px solid #22c55e', borderLeft:'2px solid #22c55e' },
                      { bottom:8, right:8,   borderBottom:'2px solid #22c55e', borderRight:'2px solid #22c55e' }
                    ].map((s, i) => (
                      <div key={i} style={{ position:'absolute', width:18, height:18, ...s }} />
                    ))}

                    {/* Merkez iç halka */}
                    <div style={{
                      width:24, height:24, borderRadius:'50%',
                      border:'1px solid rgba(34,197,94,0.3)',
                      position:'absolute', top:'50%', left:'50%',
                      transform:'translate(-50%,-50%)',
                      pointerEvents:'none'
                    }} />

                    <i className="fas fa-camera" style={{ fontSize:28, color:'#1e3a5f', marginBottom:10 }}></i>
                    <div style={{ fontSize:'0.78rem', color:'#334155', textAlign:'center', maxWidth:220, lineHeight:1.6, padding:'0 10px' }}>
                      Kamera akışı için Android uygulamasından
                      <strong style={{ color:'#475569' }}> DJI RC bağlantısı</strong> gereklidir.<br/>
                      RTSP / WebRTC bağlantısı bekleniyor…
                    </div>

                    {/* Alt bilgi şeridi (telemetriden) */}
                    <div style={{
                      position:'absolute', bottom:0, left:0, right:0,
                      padding:'5px 10px',
                      background:'rgba(0,0,0,0.65)',
                      display:'flex', justifyContent:'space-between',
                      fontSize:'0.67rem', color:'#22c55e', letterSpacing:0.5
                    }}>
                      <span>PITCH {telemetry.gimbal?.pitch?.toFixed(1) ?? '--'}°</span>
                      <span>ALT {telemetry.altitude?.agl?.toFixed(1) ?? '--'} m</span>
                      <span>BAT {telemetry.battery ?? '--'}%</span>
                      <span>GPS {telemetry.gps?.satelliteCount ?? '--'} uydu</span>
                    </div>
                  </div>
                </div>

                {/* Gimbal kontrolü */}
                <div className="col-md-5">
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#94a3b8', marginBottom:10, letterSpacing:1 }}>
                    <i className="fas fa-sliders-h me-2" style={{ color:'#38bdf8' }}></i>
                    GİMBAL PITCH AÇISI
                  </div>

                  {/* Büyük açı göstergesi */}
                  <div style={{ textAlign:'center', marginBottom:12 }}>
                    <div style={{ fontSize:'2.4rem', fontWeight:800, color:'#60a5fa', lineHeight:1 }}>
                      {pendingPitch}°
                    </div>
                    <div style={{ fontSize:'0.7rem', color:'#64748b', marginTop:4 }}>
                      {pitchLabel}
                    </div>
                    {appliedPitch !== null && (
                      <div style={{ fontSize:'0.67rem', color:'#22c55e', marginTop:2 }}>
                        Uygulanan: {appliedPitch}°
                        {telemetry.gimbal?.pitch !== undefined && (
                          <span> · Mevcut: {telemetry.gimbal.pitch.toFixed(1)}°</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Slider */}
                  <div style={{ padding:'0 4px', marginBottom:6 }}>
                    <input
                      type="range"
                      className="form-range"
                      min={-90} max={30} step={1}
                      value={pendingPitch}
                      onChange={e => setPendingPitch(Number(e.target.value))}
                      style={{ accentColor:'#3b82f6', cursor:'pointer' }}
                    />
                    <div className="d-flex justify-content-between" style={{ fontSize:'0.64rem', color:'#475569', marginTop:-2 }}>
                      <span>−90° (dik)</span>
                      <span>0°</span>
                      <span>+30°</span>
                    </div>
                  </div>

                  {/* Önayar butonları */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:12 }}>
                    {GIMBAL_PRESETS.map(({ v, lbl }) => (
                      <button
                        key={v}
                        onClick={() => setPendingPitch(v)}
                        style={{
                          padding:'3px 9px', fontSize:'0.67rem', borderRadius:6, cursor:'pointer',
                          border:`1px solid ${pendingPitch === v ? '#3b82f6' : '#334155'}`,
                          background: pendingPitch === v ? '#1d4ed8' : 'transparent',
                          color: pendingPitch === v ? '#fff' : '#94a3b8'
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* Uygula butonu */}
                  <button
                    className="btn w-100"
                    onClick={handleGimbalApply}
                    disabled={!isConnected}
                    style={{
                      background:'linear-gradient(135deg,#0c4a6e,#0369a1)',
                      border:'1px solid #38bdf8', color:'#fff', borderRadius:8, padding:'9px'
                    }}
                  >
                    <i className="fas fa-check me-2"></i>
                    Gimbal Açısını Uygula ({pendingPitch}°)
                  </button>

                  {/* Mevcut telemetri özeti */}
                  <div style={{
                    marginTop:10, padding:'7px 10px',
                    background:'rgba(0,0,0,0.3)', borderRadius:8,
                    fontSize:'0.68rem', color:'#475569', lineHeight:1.7
                  }}>
                    <div><strong style={{ color:'#64748b' }}>Telemetri</strong></div>
                    <div>Pitch: {telemetry.gimbal?.pitch?.toFixed(1) ?? '--'}°
                       · Roll: {telemetry.gimbal?.roll?.toFixed(1) ?? '--'}°
                       · Yaw: {telemetry.gimbal?.yaw?.toFixed(1) ?? '--'}°</div>
                    <div>İrtifa: {telemetry.altitude?.agl?.toFixed(1) ?? '--'} m (AGL)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Son komut yanıtı ─────────────────────────────────────────── */}
          {lastResp && (
            <div style={{ fontSize:'0.67rem', color:'#334155', textAlign:'right', marginTop:4 }}>
              Son Android yanıtı: <strong style={{ color:'#475569' }}>{lastResp.command}</strong>
              {' → '}{lastResp.status}
              {lastResp.timestamp && (
                <> ({new Date(lastResp.timestamp).toLocaleTimeString('tr-TR')})</>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
