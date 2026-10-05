/**
 * WasteService
 * Uçuş-sonrası fotoğraf sınıflandırma (YOLO) tetikleme, iş durumu takibi
 * ve tespit sonuçlarını çekme.
 */

import { API_BASE_URL, API_ENDPOINTS } from '@utils/constants';

class WasteServiceClass {

  async _post(endpoint, body) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
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

  /** Bir session'ın yüklenmiş fotoğraflarını YOLO ile sınıflandırmayı başlatır. */
  triggerClassify(sessionId) {
    return this._post(API_ENDPOINTS.PHOTOS_CLASSIFY(sessionId));
  }

  /** classify job durumunu sorgular: { status: 'processing'|'done'|'error', summary?, error? } */
  pollStatus(jobId) {
    return this._get(API_ENDPOINTS.CLASSIFY_STATUS(jobId));
  }

  /** Bir session'ın tüm çöp tespitlerini döner. */
  getSessionDetections(sessionId) {
    return this._get(API_ENDPOINTS.SESSION_DETECTIONS(sessionId));
  }

  /** Bir alanın (tüm session'lar dahil) çöp tespitlerini döner. */
  getAreaDetections(areaId) {
    return this._get(API_ENDPOINTS.AREA_DETECTIONS(areaId));
  }

  /**
   * triggerClassify + iş bitene kadar poll eder.
   * @param {number|string} sessionId
   * @param {(status:string)=>void} onProgress - opsiyonel ilerleme callback'i
   * @returns {Promise<Object>} classify summary
   */
  async classifyAndWait(sessionId, onProgress) {
    const { jobId } = await this.triggerClassify(sessionId);

    while (true) {
      const job = await this.pollStatus(jobId);
      onProgress?.(job.status);

      if (job.status === 'done') return job.summary;
      if (job.status === 'error') throw new Error(job.error || 'Sınıflandırma başarısız');

      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

export const WasteService = new WasteServiceClass();
