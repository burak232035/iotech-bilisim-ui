/**
 * TelemetryContext - Real-time Telemetry Data Management
 * Listens to Socket.IO telemetry events and updates state
 * Adapted from harita.js lines 56-116
 *
 * Telemetry is kept per drone (keyed by droneId; payloads without one count as
 * drone-1). `telemetry`, `lastUpdate` and `dronePosition` describe the drone
 * selected in SocketContext, so existing cards show that drone.
 */

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { SOCKET_EVENTS } from '@utils/constants';

const TelemetryContext = createContext(null);

const DEFAULT_TELEMETRY = {
  battery: 0,
  gimbal: { pitch: 0, roll: 0, yaw: 0 },
  altitude: { agl: 0, amsl: 0 },
  gps: { signalLevel: 'WEAK', satelliteCount: 0 },
  scanPercent: 0,
  heading: null,
  speed: null,
  flightMode: null,
  isFlying: null,
  home: null
};

export function TelemetryProvider({ children }) {
  const { socket, isConnected, selectedDroneId } = useSocket();

  // droneId -> { telemetry, lastUpdate, position }
  const [byDrone, setByDrone] = useState({});

  useEffect(() => {
    if (!socket) return;

    const handleTelemetry = (data) => {
      const droneId = data?.droneId || 'drone-1';

      setByDrone((prev) => {
        const old = prev[droneId] || { telemetry: DEFAULT_TELEMETRY, position: null };
        const t = old.telemetry;
        const hasFix = typeof data.lat === 'number' && typeof data.lon === 'number';
        return {
          ...prev,
          [droneId]: {
            telemetry: {
              battery: data.battery ?? t.battery,
              gimbal: data.gimbal ?? t.gimbal,
              altitude: data.altitude ?? t.altitude,
              gps: data.gps ?? t.gps,
              scanPercent: data.scanPercent ?? t.scanPercent,
              heading: data.heading ?? t.heading,
              speed: data.speed ?? t.speed,
              flightMode: data.flightMode ?? t.flightMode,
              isFlying: data.isFlying ?? t.isFlying,
              home: data.home ?? t.home
            },
            lastUpdate: new Date(),
            position: hasFix ? { lat: data.lat, lon: data.lon } : old.position
          }
        };
      });
    };

    // Last known GPS fix also comes from drone_photo (used as mission "home")
    const handlePhoto = (data) => {
      if (typeof data?.lat !== 'number' || typeof data?.lon !== 'number') return;
      const droneId = data.droneId || 'drone-1';
      setByDrone((prev) => {
        const old = prev[droneId] || { telemetry: DEFAULT_TELEMETRY, lastUpdate: null };
        return { ...prev, [droneId]: { ...old, position: { lat: data.lat, lon: data.lon } } };
      });
    };

    // Listen to both telemetry events
    socket.on(SOCKET_EVENTS.DRONE_TELEMETRY, handleTelemetry);
    socket.on(SOCKET_EVENTS.DATA_RESPONSE, handleTelemetry);
    socket.on(SOCKET_EVENTS.DRONE_PHOTO, handlePhoto);

    return () => {
      socket.off(SOCKET_EVENTS.DRONE_TELEMETRY, handleTelemetry);
      socket.off(SOCKET_EVENTS.DATA_RESPONSE, handleTelemetry);
      socket.off(SOCKET_EVENTS.DRONE_PHOTO, handlePhoto);
    };
  }, [socket]);

  const value = useMemo(() => {
    const selected = byDrone[selectedDroneId || 'drone-1'];
    return {
      telemetry: selected?.telemetry ?? DEFAULT_TELEMETRY,
      lastUpdate: selected?.lastUpdate ?? null,
      dronePosition: selected?.position ?? null,
      telemetryByDrone: byDrone,
      isConnected
    };
  }, [byDrone, selectedDroneId, isConnected]);

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within TelemetryProvider');
  }
  return context;
};
