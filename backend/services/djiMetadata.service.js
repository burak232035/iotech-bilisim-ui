const fs = require("fs");

/**
 * Reads the capture metadata DJI writes into every photo's XMP block
 * (drone-dji:GpsLatitude, RelativeAltitude, GimbalYawDegree, …).
 *
 * This is what the camera actually recorded at the shutter moment, so it is
 * preferred over what the app sends alongside the upload: it fixes headings
 * of photos taken mid-turn and lets photos be uploaded without a waypoint
 * list (e.g. recovering old flights from the SD card).
 */
const XMP_SCAN_BYTES = 256 * 1024; // DJI puts the XMP packet near the start of the JPEG

function readTag(xmp, name) {
  const m = xmp.match(new RegExp(`drone-dji:${name}="([^"]+)"`)) ||
            xmp.match(new RegExp(`<drone-dji:${name}>([^<]+)<`));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} filePath
 * @returns {{lat:number|null, lon:number|null, relativeAltitude:number|null,
 *            gimbalYaw:number|null, flightYaw:number|null, gimbalPitch:number|null}|null}
 *          null when the file has no DJI XMP block
 */
function readDjiXmp(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(XMP_SCAN_BYTES);
    const n = fs.readSync(fd, buf, 0, XMP_SCAN_BYTES, 0);
    const text = buf.subarray(0, n).toString("latin1");
    if (!text.includes("drone-dji:")) return null;
    return {
      lat: readTag(text, "GpsLatitude"),
      // Some DJI firmwares spell it "GpsLongtitude"
      lon: readTag(text, "GpsLongitude") ?? readTag(text, "GpsLongtitude"),
      relativeAltitude: readTag(text, "RelativeAltitude"),
      gimbalYaw: readTag(text, "GimbalYawDegree"),
      flightYaw: readTag(text, "FlightYawDegree"),
      gimbalPitch: readTag(text, "GimbalPitchDegree")
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = { readDjiXmp };
