/**
 * LandcoverService
 * Uçuş-sonrası fotoğraflar üzerinde yeşil/beton segmentasyonu (YOLO-seg)
 * tetikleme, iş durumu takibi ve session ortalama yüzdelerini çekme.
 */

import { API_BASE_URL, API_ENDPOINTS } from '@utils/constants';

class LandcoverServiceClass {

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

  /** Bir session'ın yüklenmiş fotoğraflarında yeşil/beton analizini başlatır. */
  triggerAnalyze(sessionId) {
    return this._post(API_ENDPOINTS.LANDCOVER_ANALYZE(sessionId));
  }

  /** analyze job durumunu sorgular: { status: 'processing'|'done'|'error', summary?, error? } */
  pollStatus(jobId) {
    return this._get(API_ENDPOINTS.LANDCOVER_STATUS(jobId));
  }

  /** Bir session'ın ortalama yeşil/beton/diğer yüzdelerini döner. */
  getResult(sessionId) {
    return this._get(API_ENDPOINTS.LANDCOVER_RESULT(sessionId));
  }

  /**
   * triggerAnalyze + iş bitene kadar poll eder.
   * @param {number|string} sessionId
   * @param {(status:string)=>void} onProgress - opsiyonel ilerleme callback'i
   * @returns {Promise<Object>} analyze summary (greenPct, concretePct, otherPct, photoCount dahil)
   */
  async analyzeAndWait(sessionId, onProgress) {
    const { jobId } = await this.triggerAnalyze(sessionId);

    while (true) {
      const job = await this.pollStatus(jobId);
      onProgress?.(job.status);

      if (job.status === 'done') return job.summary;
      if (job.status === 'error') throw new Error(job.error || 'Analiz başarısız');

      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

export const LandcoverService = new LandcoverServiceClass();
