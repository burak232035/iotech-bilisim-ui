/**
 * API Service
 * REST API abstraction layer
 */

import { API_BASE_URL, API_ENDPOINTS } from '@utils/constants';

class ApiServiceClass {
  /**
   * Generic API request method
   * @param {string} endpoint
   * @param {Object} options
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }

      return response;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // ========== AREAS ==========

  /**
   * Get all areas
   * @returns {Promise<Array>}
   */
  async getAreas() {
    return this.request(API_ENDPOINTS.AREAS);
  }

  /**
   * Get area by ID
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async getArea(id) {
    return this.request(`${API_ENDPOINTS.AREAS}/${id}`);
  }

  /**
   * Create new area
   * @param {string} name
   * @param {Object} coordinates
   * @returns {Promise<Object>}
   */
  async createArea(name, coordinates) {
    return this.request(API_ENDPOINTS.AREAS, {
      method: 'POST',
      body: JSON.stringify({ name, coordinates })
    });
  }

  /**
   * Update area
   * @param {number|string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateArea(id, data) {
    return this.request(`${API_ENDPOINTS.AREAS}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Delete area
   * @param {number|string} id
   * @returns {Promise<any>}
   */
  async deleteArea(id) {
    return this.request(`${API_ENDPOINTS.AREAS}/${id}`, {
      method: 'DELETE'
    });
  }

  // ========== SESSIONS ==========

  /**
   * Get all sessions
   * @returns {Promise<Array>}
   */
  async getSessions() {
    return this.request(API_ENDPOINTS.SESSIONS);
  }

  /**
   * Get active sessions
   * @returns {Promise<Array>}
   */
  async getActiveSessions() {
    return this.request(`${API_ENDPOINTS.SESSIONS}/active`);
  }

  /**
   * Get session by ID
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async getSession(id) {
    return this.request(`${API_ENDPOINTS.SESSIONS}/${id}`);
  }

  /**
   * End session
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async endSession(id) {
    return this.request(`${API_ENDPOINTS.SESSIONS}/end/${id}`, {
      method: 'POST'
    });
  }

  // ========== TELEMETRY ==========

  /**
   * Get telemetry for session
   * @param {number|string} sessionId
   * @returns {Promise<Array>}
   */
  async getSessionTelemetry(sessionId) {
    return this.request(`${API_ENDPOINTS.TELEMETRY}/session/${sessionId}`);
  }

  /**
   * Get latest telemetry for session
   * @param {number|string} sessionId
   * @returns {Promise<Object>}
   */
  async getLatestTelemetry(sessionId) {
    return this.request(`${API_ENDPOINTS.TELEMETRY}/session/${sessionId}/latest`);
  }

  // ========== REPORTS ==========

  /**
   * Generate PDF report
   * @param {number|string} sessionId
   * @param {number|string} areaId
   * @param {Array} points
   * @param {Object} options
   * @returns {Promise<Blob>}
   */
  async generateReport(sessionId, areaId, points, options = {}) {
    const response = await this.request(API_ENDPOINTS.REPORTS, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        areaId,
        points,
        options
      })
    });

    return await response.blob();
  }
}

export const ApiService = new ApiServiceClass();
