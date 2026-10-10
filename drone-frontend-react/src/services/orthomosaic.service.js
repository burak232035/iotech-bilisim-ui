/**
 * OrthomosaicService
 * Uçuş sonrası yüklenmiş tam-çözünürlük fotoğrafları OpenDroneMap ile
 * dikişsiz tek bir hava görüntüsüne dönüştürme (tetikleme + iş takibi).
 */

import { API_BASE_URL } from '@utils/constants';

class OrthomosaicServiceClass {

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
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  /** Ortomozaik üretimini başlatır. */
  generate(sessionId, areaId) {
    return this._post(`/api/orthomosaic/sessions/${sessionId}/generate`, { areaId });
  }

  /** İş durumunu sorgular — { status: 'processing'|'done'|'error', file_path?, bounds?, error? } */
  getStatus(orthomosaicId) {
    return this._get(`/api/orthomosaic/status/${orthomosaicId}`);
  }

  /** Bir session'ın en son ortomozaiğini döner (yoksa null). */
  getBySession(sessionId) {
    return this._get(`/api/orthomosaic/sessions/${sessionId}`);
  }

  /**
   * generate + iş bitene kadar poll eder. Bu işlem gerçek fotogrametri
   * (ODM) çalıştırdığı için dakikalar sürebilir.
   * @param {number|string} sessionId
   * @param {number|string} areaId
   * @param {(status:string)=>void} onProgress
   * @returns {Promise<{url:string, bounds:Object}>}
   */
  async generateAndWait(sessionId, areaId, onProgress) {
    const { orthomosaicId } = await this.generate(sessionId, areaId);

    while (true) {
      const job = await this.getStatus(orthomosaicId);
      onProgress?.(job.status);

      if (job.status === 'done') {
        // job.file_path is an absolute filesystem path (backend/uploads/orthomosaics/<name>.png;
        // the test instance prefixes the name) — served via the /uploads static route.
        const fileName = (job.file_path || '').split(/[\\/]/).pop() || `${orthomosaicId}.png`;
        return { url: `${API_BASE_URL}/uploads/orthomosaics/${fileName}`, bounds: job.bounds };
      }
      if (job.status === 'error') {
        throw new Error(job.error || 'Ortomozaik oluşturulamadı');
      }

      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

export const OrthomosaicService = new OrthomosaicServiceClass();
