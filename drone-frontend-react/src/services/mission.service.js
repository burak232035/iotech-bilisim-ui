/**
 * MissionService
 * REST API calls for waypoint mission planning and dispatch.
 */

import { API_BASE_URL, API_ENDPOINTS } from '@utils/constants';

class MissionServiceClass {

  async _post(endpoint, body) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res.json();
  }

  async _get(endpoint) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /**
   * Ask the backend to compute a boustrophedon scan route for an area.
   * @param {number|string} areaId
   * @param {{ altitudeM, overlapPercent, speedMs }} options
   */
  planMission(areaId, options = {}) {
    return this._post(API_ENDPOINTS.MISSION_PLAN, {
      areaId,
      saveRoute: true,
      ...options
    });
  }

  /**
   * Send the pre-planned mission to all connected drones via Socket.IO.
   * @param {{ waypoints, areaId, areaName, altitudeM, speedMs, savedRouteId }} data
   */
  startMission(data) {
    return this._post(API_ENDPOINTS.MISSION_START, data);
  }

  /** Send stop/RTH command to all connected drones. */
  stopMission() {
    return this._post(API_ENDPOINTS.MISSION_STOP, {});
  }

  /** Check how many drones are connected. */
  getStatus() {
    return this._get(API_ENDPOINTS.MISSION_STATUS);
  }
}

export const MissionService = new MissionServiceClass();
