const fs = require("fs");
const path = require("path");

const LivePhotoModel = require("../models/livePhoto.model");

const LIVE_ROOT = path.join(__dirname, "../uploads/live");

// Day folder name, e.g. "17.10" (local date, DD.MM) — as requested by the team
function dayFolderName(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

/**
 * Persist one drone_photo preview: JPEG to uploads/live/<DD.MM>/, metadata to
 * live_photos. Never throws — a storage problem must not affect the live feed.
 * @param {object} data   drone_photo payload ({ imageBase64, lat, lon, altitude?, heading?, timestamp? })
 * @param {{droneId: string|null, sessionId: number|null}} ctx
 */
async function saveLivePhoto(data, { droneId, sessionId }) {
  try {
    const base64 = String(data.imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) return null;

    const now = new Date();
    const dayFolder = dayFolderName(now);
    const dir = path.join(LIVE_ROOT, dayFolder);
    fs.mkdirSync(dir, { recursive: true });

    const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const unique = `${now.getTime() % 1000}${Math.random().toString(36).slice(2, 6)}`;
    const fileName = `${droneId || "drone"}_s${sessionId ?? "x"}_${time}_${unique}.jpg`;
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    return await LivePhotoModel.create({
      sessionId,
      droneId,
      dayFolder,
      filePath,
      lat: Number(data.lat),
      lon: Number(data.lon),
      altitude: data.altitude != null ? Number(data.altitude) : null,
      heading: data.heading != null ? Number(data.heading) : null,
      capturedAt: data.timestamp ? new Date(Number(data.timestamp)) : now
    });
  } catch (err) {
    console.error("❌ Canlı önizleme kaydedilemedi:", err.message);
    return null;
  }
}

/** URL path for a stored preview (served by the /uploads static route). */
function livePhotoUrl(row) {
  return `/uploads/live/${encodeURIComponent(row.day_folder)}/${encodeURIComponent(path.basename(row.file_path))}`;
}

module.exports = { saveLivePhoto, livePhotoUrl, dayFolderName };
