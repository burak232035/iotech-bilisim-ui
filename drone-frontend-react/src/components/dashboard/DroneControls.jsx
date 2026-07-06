/**
 * DroneControls — Takeoff / Land + Bağlantı Tanılama Paneli
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@components/common/Card';
import { useSocket } from '@contexts/SocketContext';
import { API_BASE_URL } from '@utils/constants';

function ConnectionDiagPanel() {
  const { isConnected } = useSocket();
  const [snap,    setSnap]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  const fetchSnap = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/debug/connections`);
      setSnap(await r.json());
    } catch {
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 s when panel is open
  useEffect(() => {
    if (!open) return;
    fetchSnap();
    const iv = setInterval(fetchSnap, 5000);
    return () => clearInterval(iv);
  }, [open, fetchSnap]);

  const drone = snap?.droneCount ?? 0;
  const web   = snap?.webCount   ?? 0;

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #2d3748', paddingTop: 12 }}>
      <button
        className="btn btn-sm btn-outline-secondary"
        onClick={() => setOpen(v => !v)}
        style={{ fontSize: '0.78rem' }}
      >
        <i className={`fas fa-stethoscope me-1 ${open ? 'text-info' : ''}`}></i>
        {open ? 'Bağlantı Tanılamasını Gizle' : 'Bağlantı Tanılaması'}
        {!open && drone === 0 && snap !== null && (
          <span className="badge bg-danger ms-2">Drone Yok!</span>
        )}
      </button>

      {open && (
        <div style={{
          marginTop: 10,
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: '14px 16px',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          color: '#c9d1d9'
        }}>
          {/* Status satırları */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <span style={{ color: '#8b949e' }}>Tarayıcı → Sunucu: </span>
              <span style={{ color: isConnected ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                {isConnected ? '✓ BAĞLI' : '✗ BAĞLI DEĞİL'}
              </span>
            </div>
            <div>
              <span style={{ color: '#8b949e' }}>Android → Sunucu: </span>
              {snap === null ? (
                <span style={{ color: '#8b949e' }}>—</span>
              ) : (
                <span style={{ color: drone > 0 ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                  {drone > 0 ? `✓ ${drone} drone bağlı` : '✗ DRONE YOK'}
                </span>
              )}
            </div>
            <div>
              <span style={{ color: '#8b949e' }}>Web istemci: </span>
              <span style={{ color: '#79c0ff' }}>{snap !== null ? web : '—'}</span>
            </div>
            {snap?.activeSession && (
              <div>
                <span style={{ color: '#8b949e' }}>Oturum: </span>
                <span style={{ color: '#d2a8ff' }}>#{snap.activeSession.id}</span>
              </div>
            )}
          </div>

          {snap && drone === 0 && (
            <div style={{
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.4)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 10
            }}>
              <div style={{ color: '#f85149', fontWeight: 700, marginBottom: 6 }}>
                ⚠ Android uygulaması sunucuya bağlı değil
              </div>
              <div style={{ color: '#8b949e', lineHeight: 1.8 }}>
                Olası sebepler:<br />
                1. Android uygulama <strong style={{ color: '#e3b341' }}>3001</strong> portuna bağlanmıyor<br />
                2. Yanlış sunucu IP — Android'de <code style={{ color: '#79c0ff' }}>ipconfig</code> ile PC IP'sini doğrula<br />
                3. Android ve PC <strong>aynı WiFi ağında değil</strong><br />
                4. Windows Firewall port 3001'i engelliyor<br />
                5. Android uygulama <code style={{ color: '#79c0ff' }}>register &#123;role:"drone"&#125;</code> göndermiyor
              </div>
            </div>
          )}

          {snap && drone > 0 && (
            <div style={{
              background: 'rgba(63,185,80,0.1)',
              border: '1px solid rgba(63,185,80,0.4)',
              borderRadius: 6, padding: '8px 12px', marginBottom: 10
            }}>
              <div style={{ color: '#3fb950' }}>
                ✓ Android bağlı — komutlar iletilecek
              </div>
              {snap.droneSocketIds?.length > 0 && (
                <div style={{ color: '#8b949e', marginTop: 4 }}>
                  Socket ID: {snap.droneSocketIds.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Firewall fix komutu */}
          {snap && drone === 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#8b949e', marginBottom: 4 }}>Windows Firewall için (Admin PowerShell):</div>
              <div style={{
                background: '#161b22', borderRadius: 4, padding: '6px 10px',
                color: '#a5d6ff', userSelect: 'all', cursor: 'text'
              }}>
                netsh advfirewall firewall add rule name="Drone Backend 3001" dir=in action=allow protocol=TCP localport=3001
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, color: '#484f58', fontSize: '0.72rem' }}>
            {loading ? 'Güncelleniyor…' : snap ? `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}` : ''}
            {' · '}
            <button
              onClick={fetchSnap}
              style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
            >
              Yenile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DroneControls() {
  const { sendCommand, isConnected } = useSocket();

  const handleTakeoff = () => {
    if (!isConnected) {
      alert('Socket bağlantısı yok! Lütfen backend çalıştığından emin olun.');
      return;
    }
    if (!window.confirm('Drone kalkış yapacak. Emin misiniz?')) return;
    sendCommand('takeoff');
  };

  const handleLand = () => {
    if (!isConnected) {
      alert('Socket bağlantısı yok! Lütfen backend çalıştığından emin olun.');
      return;
    }
    if (!window.confirm('Drone iniş yapacak. Emin misiniz?')) return;
    sendCommand('land');
  };

  return (
    <div className="row mt-3">
      <div className="col-12">
        <Card title="Drone Kontrol" icon="fas fa-gamepad" variant="danger">
          <div className="d-flex justify-content-center gap-3">
            <button
              type="button"
              className="btn btn-success btn-lg"
              onClick={handleTakeoff}
              disabled={!isConnected}
            >
              <i className="fas fa-plane-departure"></i> Kalkış (Takeoff)
            </button>
            <button
              type="button"
              className="btn btn-warning btn-lg"
              onClick={handleLand}
              disabled={!isConnected}
            >
              <i className="fas fa-plane-arrival"></i> İniş (Land)
            </button>
          </div>
          <p className="text-center text-muted mt-3 mb-0">
            <small>
              <i className="fas fa-info-circle"></i> Komutlar backend üzerinden Android'e iletilir.
              Android'in sunucuya bağlı olması gerekir.
            </small>
          </p>

          <ConnectionDiagPanel />
        </Card>
      </div>
    </div>
  );
}
