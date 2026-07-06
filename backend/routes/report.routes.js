const express = require("express");
const fs = require("fs");
const path = require("path");
const generatePDF = require("../services/pdf.service");
const ReportDataService = require("../services/reportData.service");
const { getCurrentSession } = require("../socket.io");

const router = express.Router();

// Bekleyen PDF işleri: jobId -> { status, fileName, error }
const pdfJobs = new Map();

// Adım 1: PDF oluşturmayı başlat (hemen cevap döner)
router.post("/generate", async (req, res) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    let sessionId = req.body.sessionId;

    if (!sessionId) {
      const currentSession = getCurrentSession();
      if (currentSession) {
        sessionId = currentSession.id;
      } else {
        console.warn("⚠️ No session found, using fallback");
        const FlightSessionModel = require("../models/flightSession.model");
        const tempSession = await FlightSessionModel.createSession({
          start_time: new Date()
        });
        sessionId = tempSession.id;
      }
    }

    // Hemen "başladı" cevabı dön
    pdfJobs.set(jobId, { status: "generating" });
    res.json({ jobId, status: "generating" });
    console.log(`⏳ PDF job başlatıldı: ${jobId} (session ${sessionId})`);

    // Arka planda PDF oluştur
    const reportData = await ReportDataService.generateReportData(sessionId);

    const tumKategoriler = [
      { ad: "Metal", adet: 12, oran: 12 },
      { ad: "Karton", adet: 8, oran: 8 },
      { ad: "Kağıt", adet: 14, oran: 14 },
      { ad: "Cam", adet: 6, oran: 6 },
      { ad: "Organik Atık", adet: 22, oran: 22 },
      { ad: "Geri Dönüştürülemez", adet: 18, oran: 18 },
      { ad: "Plastik", adet: 20, oran: 20 }
    ];

    // Kullanıcının seçtiği kategorilerle filtrele (gelmezse tümünü dahil et)
    const seciliKategoriAdlari = req.body.kategoriler;
    const kategoriler = Array.isArray(seciliKategoriAdlari) && seciliKategoriAdlari.length > 0
      ? tumKategoriler.filter(k => seciliKategoriAdlari.includes(k.ad))
      : tumKategoriler;

    const templatePath = path.join(__dirname, "../templates/report.template.html");
    let html = fs.readFileSync(templatePath, "utf8");

    const replaceAllFn = (key, val) => {
      html = html.replaceAll(`{{${key}}}`, String(val));
    };

    Object.entries(reportData).forEach(([k, v]) => replaceAllFn(k, v));

    // Logo (base64 olarak göm)
    const logoPath = path.join(__dirname, "../templates/logo.png");
    let logoDataUri = "";
    try {
      const logoBuffer = fs.readFileSync(logoPath);
      logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    } catch (e) {
      console.warn("Logo dosyası okunamadı:", e.message);
    }
    replaceAllFn("logoBase64", logoDataUri);

    // Harita koordinatları (seçili alanın polygon noktaları)
    const points = req.body.points || [];

    const kategoriSatirlari = kategoriler.map(k =>
      `<tr><td>${k.ad}</td><td>${k.adet}</td><td>%${k.oran}</td></tr>`
    ).join("");
    replaceAllFn("kategoriSatirlari", kategoriSatirlari);

    const options = req.body.options || {};
    let opsHtml = "";

    const hasAnyDroneOption = options.includeBattery || options.includeFlightTime
      || options.includeAltitude || options.includeGps || options.includeGimbal;

    if (hasAnyDroneOption) {
      opsHtml += `<h3>Uçuş Teknik Bilgileri</h3><table>`;
      if (options.includeBattery && reportData.droneSarj) {
        opsHtml += `<tr><td>Drone Ortalama Şarj</td><td>${reportData.droneSarj}</td></tr>`;
        opsHtml += `<tr><td>Minimum Batarya</td><td>${reportData.minBattery}</td></tr>`;
      }
      if (options.includeAltitude && reportData.maxAltitude) {
        opsHtml += `<tr><td>Maksimum İrtifa</td><td>${reportData.maxAltitude}</td></tr>`;
      }
      if (options.includeFlightTime) {
        opsHtml += `<tr><td>Toplam Uçuş Süresi</td><td>${reportData.ucusSuresiDetay}</td></tr>`;
      }
      if (options.includeGps) {
        opsHtml += `<tr><td>Başlangıç Koordinatları</td><td>${reportData.baslangic}</td></tr>`;
        opsHtml += `<tr><td>Bitiş Koordinatları</td><td>${reportData.bitis}</td></tr>`;
      }
      if (options.includeGimbal) {
        opsHtml += `<tr><td>Gimbal Bilgisi</td><td>${reportData.gimbalBilgisi || "N/A"}</td></tr>`;
      }
      opsHtml += `</table>`;
    }
    replaceAllFn("opsiyonelAlanlar", opsHtml);

    const fileName = `rapor_${Date.now()}.pdf`;
    await generatePDF(html, fileName, points);

    pdfJobs.set(jobId, { status: "ready", fileName });
    console.log(`✅ PDF hazır: ${jobId} -> ${fileName}`);

    // 5 dakika sonra job'u temizle
    setTimeout(() => pdfJobs.delete(jobId), 5 * 60 * 1000);

  } catch (e) {
    console.error("❌ PDF hatası:", e.message);
    pdfJobs.set(jobId, { status: "error", error: e.message });
  }
});

// Adım 2: PDF durumunu kontrol et
router.get("/status/:jobId", (req, res) => {
  const job = pdfJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job bulunamadı" });
  res.json(job);
});

// Adım 3: PDF hazır olana kadar bekle, sonra indir (tarayıcı kendi indirir)
router.get("/wait-and-download/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  const maxWait = 120000; // 2 dakika
  const start = Date.now();

  // PDF hazır olana kadar bekle
  while (Date.now() - start < maxWait) {
    const job = pdfJobs.get(jobId);
    if (!job) return res.status(404).json({ error: "Job bulunamadı" });

    if (job.status === "error") {
      return res.status(500).json({ error: job.error });
    }

    if (job.status === "ready") {
      const filePath = path.join(__dirname, "../reports/generated", job.fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Dosya bulunamadı" });
      }
      console.log(`📥 PDF indiriliyor: ${job.fileName}`);
      return res.download(filePath, job.fileName);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  res.status(408).json({ error: "Zaman aşımı" });
});

module.exports = router;
