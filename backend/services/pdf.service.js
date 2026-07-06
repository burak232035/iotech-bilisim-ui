const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

/**
 * Seçili alanın harita görselini Leaflet + OpenStreetMap ile render edip
 * base64 PNG olarak döndürür.
 */
async function generateMapScreenshot(browser, points) {
  if (!points || points.length < 3) return null;

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 340 });

  const mapHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      * { margin: 0; padding: 0; }
      #map { width: 900px; height: 340px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <script>
      var map = L.map('map', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);
      var polygon = L.polygon(${JSON.stringify(points)}, {
        color: '#2563eb',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 0.2
      }).addTo(map);
      map.fitBounds(polygon.getBounds(), { padding: [30, 30] });
    <\/script>
  </body>
  </html>`;

  // Geçici dosyaya yaz ve file:// ile aç (CDN kaynakları düzgün yüklensin)
  const tempPath = path.join(__dirname, `../reports/generated/temp_map_${Date.now()}.html`);
  fs.writeFileSync(tempPath, mapHtml, "utf8");

  try {
    await page.goto(`file:///${tempPath.replace(/\\/g, "/")}`, {
      waitUntil: "networkidle0",
      timeout: 20000
    });
    // Tile'ların tam render olması için ek bekleme
    await new Promise(r => setTimeout(r, 3000));

    const screenshot = await page.screenshot({ encoding: "base64", type: "png" });
    return `data:image/png;base64,${screenshot}`;
  } finally {
    await page.close();
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

async function generatePDF(htmlContent, fileName, points) {
  const outDir = path.join(__dirname, "../reports/generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: "new" });

  try {
    // 1) Harita screenshot'ını al
    const mapBase64 = await generateMapScreenshot(browser, points);
    if (mapBase64) {
      htmlContent = htmlContent.replace("{{mapImage}}", mapBase64);
    } else {
      htmlContent = htmlContent.replace(
        "{{mapImage}}",
        "data:image/svg+xml;base64," + Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="340"><rect width="900" height="340" fill="#e5e7eb"/><text x="450" y="170" text-anchor="middle" fill="#6b7280" font-size="16">Harita verisi bulunamadı</text></svg>'
        ).toString("base64")
      );
    }

    // 2) PDF oluştur
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "load" });

    const outputPath = path.join(outDir, fileName);

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" }
    });

    await page.close();
    return outputPath;
  } finally {
    await browser.close();
  }
}

module.exports = generatePDF;
