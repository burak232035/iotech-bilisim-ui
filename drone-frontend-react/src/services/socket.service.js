/**
 * Socket.IO Service
 * Singleton WebSocket connection management
 */

import io from 'socket.io-client';
import { SOCKET_URL } from '@utils/constants';

class SocketServiceClass {
  constructor() {
    this.socket = null;
  }

  /**
   * Connect to Socket.IO server
   * @param {string} url - Socket server URL (default: from env)
   * @returns {Socket} Socket.IO instance
   */
  connect(url = SOCKET_URL) {
    if (this.socket) return this.socket;

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 3000
    });

    return this.socket;
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Emit event to server
   * @param {string} event
   * @param {any} data
   */
  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  /**
   * Listen to event from server
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Stop listening to event
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Get socket instance
   * @returns {Socket|null}
   */
  getSocket() {
    return this.socket;
  }
}

export const SocketService = new SocketServiceClass();
