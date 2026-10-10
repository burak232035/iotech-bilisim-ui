/**
 * SocketContext - Socket.IO Connection Management
 * Handles WebSocket connection lifecycle and events
 * Adapted from harita.js lines 1-169
 *
 * Multi-drone: keeps the backend's drone list (drones_state) and the drone the
 * operator selected. sendCommand/requestData target the selected drone unless
 * the payload names another droneId (e.g. "all" for emergency commands).
 * See MULTI_DRONE_PROTOCOL.md.
 */

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { SocketService } from '@services/socket.service';
import { SOCKET_EVENTS } from '@utils/constants';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [drones, setDrones] = useState([]);
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  // Last session per drone — kept after the session ends so post-landing
  // photo analysis / reports still have a session to work on.
  const [lastSessionByDrone, setLastSessionByDrone] = useState({});
  const [endedDrones, setEndedDrones] = useState({});
  const [legacySessionId, setLegacySessionId] = useState(null);

  useEffect(() => {
    // Initialize Socket.IO connection
    const socketInstance = SocketService.connect();
    setSocket(socketInstance);

    // Connection events
    socketInstance.on(SOCKET_EVENTS.CONNECT, () => {
      console.log('🔌 Socket connected:', socketInstance.id);
      setIsConnected(true);

      // Register as web client
      socketInstance.emit(SOCKET_EVENTS.REGISTER, { role: 'web' });
    });

    socketInstance.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('⚠️ Socket connect_error:', err?.message || err);
      setIsConnected(false);
    });

    // Session events
    socketInstance.on(SOCKET_EVENTS.SESSION_INFO, (data) => {
      console.log('🚁 Session info:', data);
      if (!data?.id) return;
      if (data.droneId) {
        setLastSessionByDrone((prev) => ({ ...prev, [data.droneId]: data.id }));
      } else {
        setLegacySessionId(data.id);
      }
    });

    socketInstance.on(SOCKET_EVENTS.SESSION_ENDED, (data) => {
      console.log('🛑 Session ended:', data);
      const droneId = data?.droneId || 'drone-1';
      setEndedDrones((prev) => ({ ...prev, [droneId]: true }));
    });

    // Backend's live drone list (sent on register and on every connect/disconnect)
    socketInstance.on(SOCKET_EVENTS.DRONES_STATE, (data) => {
      const list = [...(data?.drones || [])].sort((a, b) => a.droneId.localeCompare(b.droneId));
      setDrones(list);
      setLastSessionByDrone((prev) => {
        const next = { ...prev };
        list.forEach((d) => { if (d.sessionId) next[d.droneId] = d.sessionId; });
        return next;
      });
      setEndedDrones((prev) => {
        const next = { ...prev };
        list.forEach((d) => { if (d.sessionId) delete next[d.droneId]; });
        return next;
      });
      // Pick a drone only when nothing valid is selected. A selected drone that
      // drops offline stays selected — silently retargeting commands to another
      // drone mid-flight would be dangerous.
      setSelectedDroneId((prev) => {
        if (prev && list.some((d) => d.droneId === prev)) return prev;
        const online = list.find((d) => d.connected);
        return online ? online.droneId : (list[0]?.droneId ?? null);
      });
    });

    // Cleanup on unmount
    return () => {
      SocketService.disconnect();
    };
  }, []);

  const selectedDrone = useMemo(
    () => drones.find((d) => d.droneId === selectedDroneId) || null,
    [drones, selectedDroneId]
  );

  const droneStatus = useMemo(() => {
    if (!isConnected) return 'unknown';
    if (selectedDrone?.connected) return 'active';
    if (selectedDroneId && endedDrones[selectedDroneId]) return 'session_ended';
    return 'waiting';
  }, [isConnected, selectedDrone, selectedDroneId, endedDrones]);

  const currentSessionId = selectedDroneId
    ? (lastSessionByDrone[selectedDroneId] ?? null)
    : legacySessionId;

  const sendCommand = useCallback((command, payload = {}) => {
    if (!socket || !isConnected) {
      console.warn('Socket not connected');
      return false;
    }

    const droneId = payload.droneId ?? selectedDroneId ?? undefined;
    console.log('📤 drone_command gönderiliyor:', command, droneId, payload);

    socket.emit(SOCKET_EVENTS.DRONE_COMMAND, {
      command,
      ...payload,
      droneId,
      timestamp: Date.now()
    });

    return true;
  }, [socket, isConnected, selectedDroneId]);

  const requestData = useCallback((type, requestId) => {
    if (!socket || !isConnected) {
      console.warn('Socket not connected');
      return false;
    }

    socket.emit(SOCKET_EVENTS.DATA_REQUEST, {
      type,
      droneId: selectedDroneId ?? undefined,
      requestId: requestId || `req-${Date.now()}`
    });

    return true;
  }, [socket, isConnected, selectedDroneId]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      droneStatus,
      currentSessionId,
      drones,
      selectedDroneId,
      selectedDrone,
      setSelectedDroneId,
      sendCommand,
      requestData
    }),
    [socket, isConnected, droneStatus, currentSessionId, drones, selectedDroneId, selectedDrone, sendCommand, requestData]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};
