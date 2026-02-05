const express = require("express");
const fs = require("fs");
const path = require("path");
const generatePDF = require("../services/pdf.service");
const ReportDataService = require("../services/reportData.service");
const { getCurrentSession } = require("../socket.io");

const router = express.Router();

router.post("/generate", async (req, res) => {
  try {
    // Get session ID from request or use current active session
    let sessionId = req.body.sessionId;

    if (!sessionId) {
      const currentSession = getCurrentSession();
      if (currentSession) {
        sessionId = currentSession.id;
        console.log(`ℹ️ Using current session: ${sessionId}`);
      } else {
        console.warn("⚠️ No session found, using fallback");
        // Create a temporary session for report generation
        const FlightSessionModel = require("../models/flightSession.model");
        const tempSession = await FlightSessionModel.createSession({
          start_time: new Date()
        });
        sessionId = tempSession.id;
        console.log(`ℹ️ Created temporary session: ${sessionId}`);
      }
    } else {
      console.log(`ℹ️ Using provided session: ${sessionId}`);
    }

    // Generate report data from real telemetry
    const reportData = await ReportDataService.generateReportData(sessionId);
    console.log(`✅ Report data generated for session ${sessionId}`);

    // TODO: Get waste categories from YOLO/DETR detection results
    const kategoriler = [
      { ad: "Metal", adet: 12, oran: 12 },
      { ad: "Karton", adet: 8, oran: 8 },
      { ad: "Kağıt", adet: 14, oran: 14 },
      { ad: "Cam", adet: 6, oran: 6 },
      { ad: "Organik Atık", adet: 22, oran: 22 },
      { ad: "Geri Dönüştürülemez", adet: 18, oran: 18 },
      { ad: "Plastik", adet: 20, oran: 20 }
    ];

    const templatePath = path.join(__dirname, "../templates/report.template.html");
    let html = fs.readFileSync(templatePath, "utf8");

    // Placeholder doldurma
    const replaceAll = (key, val) => {
      html = html.replaceAll(`{{${key}}}`, String(val));
    };

    Object.entries(reportData).forEach(([k, v]) => replaceAll(k, v));

    const kategoriSatirlari = kategoriler.map(k =>
      `<tr><td>${k.ad}</td><td>${k.adet}</td><td>%${k.oran}</td></tr>`
    ).join("");

    replaceAll("kategoriSatirlari", kategoriSatirlari);

    // Opsiyonel alanları ekle (real data ile)
    const options = req.body.options || {};
    let opsHtml = "";
    if (options.includeBattery || options.includeFlightTime) {
      opsHtml += `<h3>Uçuş Teknik Bilgileri</h3><table>`;
      if (options.includeBattery && reportData.droneSarj) {
        opsHtml += `<tr><td>Drone Ortalama Şarj</td><td>${reportData.droneSarj}</td></tr>`;
        opsHtml += `<tr><td>Minimum Batarya</td><td>${reportData.minBattery}</td></tr>`;
        opsHtml += `<tr><td>Maksimum İrtifa</td><td>${reportData.maxAltitude}</td></tr>`;
      }
      if (options.includeFlightTime) {
        opsHtml += `<tr><td>Toplam Uçuş Süresi</td><td>${reportData.ucusSuresiDetay}</td></tr>`;
      }
      opsHtml += `</table>`;
    }
    replaceAll("opsiyonelAlanlar", opsHtml);

    const fileName = `rapor_${Date.now()}.pdf`;
    const pdfPath = await generatePDF(html, fileName);

    // Direkt indir
    res.download(pdfPath, fileName);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "PDF oluşturulamadı." });
  }
});

module.exports = router;
