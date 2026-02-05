const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function generatePDF(htmlContent, fileName) {
  const outDir = path.join(__dirname, "../reports/generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const outputPath = path.join(outDir, fileName);

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" }
  });

  await browser.close();
  return outputPath;
}

module.exports = generatePDF;
