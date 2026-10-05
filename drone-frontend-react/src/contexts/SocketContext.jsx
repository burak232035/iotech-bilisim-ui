/**
 * SocketContext - Socket.IO Connection Management
 * Handles WebSocket connection lifecycle and events
 * Adapted from harita.js lines 1-169
 */

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { SocketService } from '@services/socket.service';
import { SOCKET_EVENTS } from '@utils/constants';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [droneStatus, setDroneStatus] = useState('unknown');
  const [currentSessionId, setCurrentSessionId] = useState(null);

  useEffect(() => {
    // Initialize Socket.IO connection
    const socketInstance = SocketService.connect();
    setSocket(socketInstance);

    // Connection events
    socketInstance.on(SOCKET_EVENTS.CONNECT, () => {
      console.log('🔌 Socket connected:', socketInstance.id);
      setIsConnected(true);
      setDroneStatus('waiting');

      // Register as web client
      socketInstance.emit(SOCKET_EVENTS.REGISTER, { role: 'web' });
    });

    socketInstance.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
      setDroneStatus('unknown');
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('⚠️ Socket connect_error:', err?.message || err);
      setIsConnected(false);
    });

    // Session events
    socketInstance.on(SOCKET_EVENTS.SESSION_INFO, (data) => {
      console.log('🚁 Session info:', data);
      if (data?.id) {
        setCurrentSessionId(data.id);
      }
    });

    socketInstance.on(SOCKET_EVENTS.SESSION_STARTED, (data) => {
      console.log('🚁 Session started:', data);
      if (data?.sessionId) {
        setCurrentSessionId(data.sessionId);
        setDroneStatus('active');
      }
    });

    socketInstance.on(SOCKET_EVENTS.SESSION_ENDED, (data) => {
      console.log('🛑 Session ended:', data);
      setCurrentSessionId(null);
      setDroneStatus('session_ended');
    });

    // Cleanup on unmount
    return () => {
      SocketService.disconnect();
    };
  }, []);

  const sendCommand = (command, payload = {}) => {
    if (!socket || !isConnected) {
      console.warn('Socket not connected');
      return false;
    }

    console.log('📤 drone_command gönderiliyor:', command, payload);

    socket.emit(SOCKET_EVENTS.DRONE_COMMAND, {
      command,
      ...payload,
      timestamp: Date.now()
    });

    return true;
  };

  const requestData = (type, requestId) => {
    if (!socket || !isConnected) {
      console.warn('Socket not connected');
      return false;
    }

    socket.emit(SOCKET_EVENTS.DATA_REQUEST, {
      type,
      requestId: requestId || `req-${Date.now()}`
    });

    return true;
  };

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      droneStatus,
      currentSessionId,
      sendCommand,
      requestData
    }),
    [socket, isConnected, droneStatus, currentSessionId]
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
