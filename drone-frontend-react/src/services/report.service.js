/**
 * Report Service
 * PDF report generation and download utilities
 */

import { ApiService } from './api.service';

class ReportServiceClass {
  /**
   * Generate and download PDF report
   * @param {number|string} sessionId
   * @param {number|string} areaId
   * @param {Array} points
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async generateAndDownload(sessionId, areaId, points, options = {}) {
    try {
      // Get PDF blob from API
      const blob = await ApiService.generateReport(
        sessionId,
        areaId,
        points,
        {
          includeBattery: true,
          includeFlightTime: true,
          ...options
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapor-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Cleanup
      window.URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      console.error('Report generation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate report data before generation
   * @param {number|string} sessionId
   * @param {Array} points
   * @returns {Object} { isValid: boolean, message: string }
   */
  validateReportData(sessionId, points) {
    if (!points || !Array.isArray(points) || points.length < 3) {
      return {
        isValid: false,
        message: 'Lütfen rapor için bir alan seç (en az 3 nokta gerekli).'
      };
    }

    return { isValid: true, message: '' };
  }
}

export const ReportService = new ReportServiceClass();
