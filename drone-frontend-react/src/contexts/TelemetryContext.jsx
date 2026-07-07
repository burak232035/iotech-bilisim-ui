/**
 * TelemetryContext - Real-time Telemetry Data Management
 * Listens to Socket.IO telemetry events and updates state
 * Adapted from harita.js lines 56-116
 */

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { SOCKET_EVENTS } from '@utils/constants';

const TelemetryContext = createContext(null);

export function TelemetryProvider({ children }) {
  const { socket, isConnected } = useSocket();

  const [telemetry, setTelemetry] = useState({
    battery: 0,
    gimbal: { pitch: 0, roll: 0, yaw: 0 },
    altitude: { agl: 0, amsl: 0 },
    gps: { signalLevel: 'WEAK', satelliteCount: 0 },
    scanPercent: 0
  });

  const [lastUpdate, setLastUpdate] = useState(null);
  // Last known drone GPS fix — from telemetry once it carries lat/lon, or from
  // drone_photo today. Used as the mission planner's "home" reference point.
  const [dronePosition, setDronePosition] = useState(null); // { lat, lon } | null

  useEffect(() => {
    if (!socket) return;

    const handleTelemetry = (data) => {
      console.log('📡 Telemetry received:', data);

      setTelemetry((prev) => ({
        battery: data.battery ?? prev.battery,
        gimbal: data.gimbal ?? prev.gimbal,
        altitude: data.altitude ?? prev.altitude,
        gps: data.gps ?? prev.gps,
        scanPercent: data.scanPercent ?? prev.scanPercent
      }));

      if (typeof data.lat === 'number' && typeof data.lon === 'number') {
        setDronePosition({ lat: data.lat, lon: data.lon });
      }

      setLastUpdate(new Date());
    };

    const handlePhoto = (data) => {
      if (typeof data?.lat === 'number' && typeof data?.lon === 'number') {
        setDronePosition({ lat: data.lat, lon: data.lon });
      }
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

  const value = useMemo(
    () => ({
      telemetry,
      lastUpdate,
      isConnected,
      dronePosition
    }),
    [telemetry, lastUpdate, isConnected, dronePosition]
  );

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
