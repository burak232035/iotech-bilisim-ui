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

      setLastUpdate(new Date());
    };

    // Listen to both telemetry events
    socket.on(SOCKET_EVENTS.DRONE_TELEMETRY, handleTelemetry);
    socket.on(SOCKET_EVENTS.DATA_RESPONSE, handleTelemetry);

    return () => {
      socket.off(SOCKET_EVENTS.DRONE_TELEMETRY, handleTelemetry);
      socket.off(SOCKET_EVENTS.DATA_RESPONSE, handleTelemetry);
    };
  }, [socket]);

  const value = useMemo(
    () => ({
      telemetry,
      lastUpdate,
      isConnected
    }),
    [telemetry, lastUpdate, isConnected]
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
