const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const PhotoModel = require("../models/photo.model");
const OrthomosaicModel = require("../models/orthomosaic.model");

const JOBS_ROOT   = path.join(__dirname, "../orthomosaic-jobs");
const OUTPUT_ROOT = path.join(__dirname, "../uploads/orthomosaics");
const ODM_IMAGE    = process.env.ODM_DOCKER_IMAGE || "opendronemap/odm";

// "opencv" (default): Docker-free Python service in orthomosaic-service/ (port 8002).
// "odm": OpenDroneMap in Docker — real photogrammetry, needs Docker Desktop.
const ENGINE = (process.env.ORTHOMOSAIC_ENGINE || "opencv").toLowerCase();
const STITCH_SERVICE_URL = process.env.ORTHOMOSAIC_SERVICE_URL || "http://127.0.0.1:8002";

// The test instance (npm run start:test) shares these folders with the live
// one, and both number orthomosaics from 1 — prefix non-default databases so
// a test job never overwrites a live result.
const DB_NAME = process.env.DB_NAME || "drone_tracking";
const FILE_PREFIX = DB_NAME === "drone_tracking" ? "" : `${DB_NAME}_`;

/**
 * OrthomosaicService
 *
 * Stitches a flight session's full-resolution photos into a single
 * georeferenced aerial composite. Two engines (ORTHOMOSAIC_ENGINE):
 *
 * - "opencv" (default): orthomosaic-service/ — GPS placement refined by
 *   feature matching, no Docker. Image registration, not photogrammetry.
 * - "odm": OpenDroneMap, described below —
 * real feature-matching photogrammetry, not GPS-approximate rectangle
 * placement (see geoProjection.service.js / LeafletMap.jsx for that
 * simpler approach, which is what's used for live thumbnails and YOLO
 * detection markers).
 *
 * Runs the bare `opendronemap/odm` Docker image as a one-shot CLI job
 * (not WebODM) — reuses the same async job + DB row pattern as
 * wasteDetection.service.js. Requires Docker Desktop running locally.
 *
 * NOTE: exact ODM CLI flags / internal container paths are per ODM's
 * documented usage as of writing — verify against the actual installed
 * image version once Docker is available, same caveat pattern as the
 * DJI SDK method-name uncertainties noted elsewhere in this project.
 */
class OrthomosaicService {
  /**
   * Kick off orthomosaic generation for a session. Caller should already
   * have created an OrthomosaicModel row (status='processing') and pass
   * its id here; this runs in the background.
   * @param {number} orthomosaicId
   * @param {number} sessionId
   */
  static async generate(orthomosaicId, sessionId) {
    if (ENGINE === "odm") return this._generateWithOdm(orthomosaicId, sessionId);
    return this._generateWithOpenCv(orthomosaicId, sessionId);
  }

  /** Docker-free engine: hand the photo paths to orthomosaic-service. */
  static async _generateWithOpenCv(orthomosaicId, sessionId) {
    try {
      const photos = await PhotoModel.getBySession(sessionId);
      if (photos.length < 3) {
        throw new Error(`Ortomozaik için en az 3 fotoğraf gerekli, ${photos.length} bulundu`);
      }

      fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
      const finalPngPath = path.join(OUTPUT_ROOT, `${FILE_PREFIX}${orthomosaicId}.png`);

      console.log(`🧵 Ortomozaik job ${orthomosaicId}: ${photos.length} foto, OpenCV servisi başlıyor...`);
      const result = await this._postJson(`${STITCH_SERVICE_URL}/stitch`, {
        photos: photos.map((p) => ({
          path:     path.resolve(p.file_path),
          lat:      Number(p.lat),
          lon:      Number(p.lon),
          altitude: p.altitude_agl != null ? Number(p.altitude_agl) : null,
          heading:  p.heading != null ? Number(p.heading) : null
        })),
        outputPath: finalPngPath
      });

      await OrthomosaicModel.markDone(orthomosaicId, { filePath: finalPngPath, bounds: result.bounds });
      console.log(
        `✅ Ortomozaik job ${orthomosaicId} tamamlandı (${result.seconds}s, ` +
        `${result.placedByFeatures} eşleştirme / ${result.placedByGps} GPS): ${finalPngPath}`
      );
    } catch (err) {
      console.error(`❌ Ortomozaik job ${orthomosaicId} hata:`, err.message);
      await OrthomosaicModel.markError(orthomosaicId, err.message);
    }
  }

  /** POST JSON without a client-side timeout (stitching many photos can take minutes). */
  static _postJson(url, body) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const req = http.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": data.length }
      }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(text); } catch { /* not JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300 && json) return resolve(json);
          reject(new Error(json?.detail || `Ortomozaik servisi HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        });
      });
      req.on("error", (err) => {
        if (err.code === "ECONNREFUSED") {
          reject(new Error(`Ortomozaik servisi çalışmıyor (${STITCH_SERVICE_URL}) — orthomosaic-service'i başlatın`));
        } else {
          reject(err);
        }
      });
      req.end(data);
    });
  }

  /** Docker engine: OpenDroneMap fast-orthophoto. */
  static async _generateWithOdm(orthomosaicId, sessionId) {
    const jobDir     = path.join(JOBS_ROOT, `${FILE_PREFIX}${orthomosaicId}`);
    const projectDir = path.join(jobDir, "project");
    const imagesDir   = path.join(projectDir, "images");

    try {
      const photos = await PhotoModel.getBySession(sessionId);
      if (photos.length < 3) {
        throw new Error(`Ortomozaik için en az 3 fotoğraf gerekli, ${photos.length} bulundu`);
      }

      // Fail fast with a clear message instead of ODM's generic exit code
      await this._checkDocker();

      fs.mkdirSync(imagesDir, { recursive: true });

      // Copy photos into the job's images/ folder + build geo.txt (ODM reads
      // this instead of relying on EXIF GPS tags, which our uploads may lack).
      const geoLines = ["EPSG:4326"];
      for (const photo of photos) {
        const destName = `photo_${photo.id}${path.extname(photo.file_path) || ".jpg"}`;
        fs.copyFileSync(photo.file_path, path.join(imagesDir, destName));

        const lon = Number(photo.lon);
        const lat = Number(photo.lat);
        const alt = Number(photo.altitude_agl) || 30;
        const yaw = Number(photo.heading) || 0;
        // filename lon lat alt yaw pitch roll horz_accuracy_m vert_accuracy_m
        geoLines.push(`${destName} ${lon} ${lat} ${alt} ${yaw} 0 0 3.0 3.0`);
      }
      fs.writeFileSync(path.join(projectDir, "geo.txt"), geoLines.join("\n"), "utf8");

      console.log(`🧵 Ortomozaik job ${orthomosaicId}: ${photos.length} foto, ODM başlıyor...`);
      await this._runOdm(jobDir);

      const tifPath = path.join(projectDir, "odm_orthophoto", "odm_orthophoto.tif");
      if (!fs.existsSync(tifPath)) {
        throw new Error("ODM tamamlandı ama odm_orthophoto.tif üretilmedi — job loglarını kontrol edin");
      }

      const { pngPath, bounds } = await this._convertToPng(jobDir, tifPath);

      fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
      const finalPngPath = path.join(OUTPUT_ROOT, `${FILE_PREFIX}${orthomosaicId}.png`);
      fs.copyFileSync(pngPath, finalPngPath);

      await OrthomosaicModel.markDone(orthomosaicId, { filePath: finalPngPath, bounds });
      console.log(`✅ Ortomozaik job ${orthomosaicId} tamamlandı: ${finalPngPath}`);
    } catch (err) {
      console.error(`❌ Ortomozaik job ${orthomosaicId} hata:`, err.message);
      await OrthomosaicModel.markError(orthomosaicId, err.message);
    } finally {
      // Job workspace can be large (input photos + ODM intermediates) — clean up
      // regardless of success/failure, the result PNG was already copied out.
      fs.rm(jobDir, { recursive: true, force: true }, () => {});
    }
  }

  /** Reject with a readable message when Docker Desktop isn't running. */
  static _checkDocker() {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["info", "--format", "{{.ServerVersion}}"]);
      let err = "";
      proc.stderr.on("data", (d) => { err += d; });
      proc.on("error", () => reject(new Error("Docker bulunamadı — Docker Desktop kurulu ve açık olmalı")));
      proc.on("close", (code) => {
        if (code === 0) return resolve();
        console.error(`[docker] ${err.trim()}`);
        reject(new Error("Docker Desktop çalışmıyor — Docker Desktop'ı açıp motorun başlamasını bekleyin, sonra tekrar deneyin"));
      });
    });
  }

  /** Run the ODM pipeline in fast-orthophoto mode. Resolves on success, rejects on failure. */
  static _runOdm(jobDir) {
    return new Promise((resolve, reject) => {
      const args = [
        "run", "--rm",
        "-v", `${jobDir}:/datasets/code`,
        ODM_IMAGE,
        "--project-path", "/datasets/code",
        "--fast-orthophoto",
        "--skip-3dmodel",
        "--orthophoto-resolution", "5", // cm/pixel — lower = faster, coarser
        "project"
      ];

      const proc = spawn("docker", args);
      // Keep the output tail so a failure can say *why* (ODM prints its
      // error as one of the last lines), not just the exit code.
      let tail = "";
      const keep = (d) => { tail = (tail + d).slice(-4000); };
      proc.stdout.on("data", (d) => { keep(d); process.stdout.write(`[odm] ${d}`); });
      proc.stderr.on("data", (d) => { keep(d); process.stderr.write(`[odm] ${d}`); });

      proc.on("error", (err) => reject(new Error(`docker çalıştırılamadı: ${err.message} (Docker Desktop açık mı?)`)));
      proc.on("close", (code) => {
        if (code === 0) return resolve();
        const lines = tail.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const reason = [...lines].reverse().find(l => /error|exception|not enough|failed/i.test(l)) || lines[lines.length - 1];
        reject(new Error(`ODM işlemi ${code} koduyla başarısız oldu${reason ? `: ${reason.slice(0, 300)}` : ""}`));
      });
    });
  }

  /**
   * Convert the GeoTIFF orthophoto to a PNG + extract its WGS84 bounding box,
   * both via GDAL bundled inside the same ODM image (no host GDAL install needed).
   */
  static async _convertToPng(jobDir, tifPath) {
    const relTif = path.relative(jobDir, tifPath).split(path.sep).join("/");
    const relPng = relTif.replace(/\.tif$/, ".png");

    // ODM image doesn't put GDAL's CLI tools on PATH when the entrypoint is
    // overridden directly (its normal entrypoint script sets that up) — the
    // real binaries live under SuperBuild/install/bin, so call them by full path.
    const GDAL_BIN = "/code/SuperBuild/install/bin";
    await this._runInOdmImage(jobDir, `${GDAL_BIN}/gdal_translate`, ["-of", "PNG", `/datasets/code/${relTif}`, `/datasets/code/${relPng}`]);
    const infoJson = await this._runInOdmImage(jobDir, `${GDAL_BIN}/gdalinfo`, ["-json", `/datasets/code/${relTif}`], true);

    const info = JSON.parse(infoJson);
    // ODM's orthophoto is georeferenced in a projected CRS (UTM, meters) —
    // `cornerCoordinates` is in that native CRS, NOT lon/lat. `wgs84Extent`
    // is GDAL's own reprojection of the extent to WGS84 degrees, which is
    // what Leaflet needs; use its ring directly instead of re-deriving one.
    const ring = info.wgs84Extent?.coordinates?.[0];
    if (!ring || !ring.length) {
      throw new Error("gdalinfo çıktısında wgs84Extent bulunamadı — GDAL sürümü/CRS beklenmedik");
    }
    const lons = ring.map(c => c[0]);
    const lats = ring.map(c => c[1]);
    const bounds = {
      swLat: Math.min(...lats),
      swLon: Math.min(...lons),
      neLat: Math.max(...lats),
      neLon: Math.max(...lons)
    };

    return { pngPath: path.join(jobDir, relPng), bounds };
  }

  /** Run a single command inside the ODM image (overriding its default entrypoint). */
  static _runInOdmImage(jobDir, entrypoint, cmdArgs, captureStdout = false) {
    return new Promise((resolve, reject) => {
      const args = ["run", "--rm", "--entrypoint", entrypoint, "-v", `${jobDir}:/datasets/code`, ODM_IMAGE, ...cmdArgs];
      const proc = spawn("docker", args);
      let out = "";
      proc.stdout.on("data", (d) => { out += d; if (!captureStdout) process.stdout.write(`[gdal] ${d}`); });
      proc.stderr.on("data", (d) => process.stderr.write(`[gdal] ${d}`));
      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`${entrypoint} ${code} koduyla başarısız oldu`));
      });
    });
  }
}

module.exports = OrthomosaicService;
