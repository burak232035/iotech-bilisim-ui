// ======================
// SOCKET.IO (TELEMETRİ) - GÜVENLİ BAŞLAT
// ======================
let socket = null;
let currentSessionId = null;

(function initSocket() {
  if (typeof io === "undefined") {
    console.warn("Socket.IO yüklenmedi (io undefined). Telemetri devre dışı.");
    // dashboard durumları
    if (typeof setSocketStatus === "function") setSocketStatus(false);
    if (typeof setAndroidStatus === "function") setAndroidStatus("Bilinmiyor", "text-muted");
    return;
  }

  // küçük helper: yüzde + progress bar
  function setPercentUI(valueId, barId, percent) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const vEl = document.getElementById(valueId);
    const bEl = document.getElementById(barId);
    if (vEl) vEl.textContent = `${p}%`;
    if (bEl) bEl.style.width = `${p}%`;
  }

  try {
    socket = io("http://localhost:3001", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 3000
    });

    // Bağlantı durumları
    socket.on("connect", () => {
      console.log("🔌 Socket bağlı:", socket.id);
      if (typeof setSocketStatus === "function") setSocketStatus(true);
      if (typeof setAndroidStatus === "function") setAndroidStatus("Bekleniyor...", "text-muted");

      // Web client olarak kayıt (connect sonrası daha sağlıklı)
      socket.emit("register", { role: "web" });
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket koptu");
      if (typeof setSocketStatus === "function") setSocketStatus(false);
      if (typeof setAndroidStatus === "function") setAndroidStatus("Bilinmiyor", "text-muted");
    });

    socket.on("connect_error", (err) => {
      console.warn("⚠️ Socket connect_error:", err?.message || err);
      if (typeof setSocketStatus === "function") setSocketStatus(false);
    });

    // Android → Web (canlı telemetri)
    socket.on("drone_telemetry", (data) => {
      console.log("📡 Telemetri geldi:", data);

      // Android bağlı sayabiliriz
      if (typeof setAndroidStatus === "function") {
        setAndroidStatus("Bağlı", "text-success");
      }

      // Batarya
      if (typeof data?.battery === "number") {
        updateBatteryUI(data.battery);
      }

      // Gimbal
      if (data?.gimbal) {
        updateGimbalUI(data.gimbal);
      }

      // Altitude
      if (data?.altitude) {
        updateAltitudeUI(data.altitude);
      }

      // GPS
      if (data?.gps) {
        updateGpsUI(data.gps);
      }

      // ✅ Tarama oranı alan bazlı güncelle
      // Android şu formatta yollarsa ideal:
      // { areaId: 12, scanPercent: 67, battery: 80, ... }
      const incomingAreaId =
        (data?.areaId != null ? String(data.areaId) :
          data?.selectedAreaDbId != null ? String(data.selectedAreaDbId) :
            null);

      if (typeof data?.scanPercent === "number") {
        // areaId geldiyse o alanı güncelle, yoksa seçili alanı güncelle
        const targetId = incomingAreaId || selectedAreaDbId;

        if (targetId) {
          const prev = areaMetrics.get(String(targetId)) || {};
          areaMetrics.set(String(targetId), { ...prev, scanPercent: data.scanPercent });

          // eğer güncellenen alan şu an seçiliyse ekranda da yenile
          if (String(targetId) === String(selectedAreaDbId)) {
            updateSelectedAreaTelemetryCards();
          }
        }
      }


      // Tarama oranı (%)
      if (typeof data?.scanPercent === "number") {
        setCircularPercent(
          "scanCircle",
          "scanPercentValue",
          data.scanPercent
        );
      }

      // Drone harita konumu
      if (data?.lat != null && data?.lon != null) {
        updateDroneMarker(data.lat, data.lon, data?.heading ?? 0);
      }
    });

    // Drone → Web: Engel tespiti
    socket.on("obstacle_detected", (data) => {
      console.log("🚧 Engel tespit edildi:", data);
      if (typeof handleObstacleDetected === "function") {
        handleObstacleDetected(data);
      }
    });


    // Session info (from backend when drone connects)
    socket.on("session_info", (data) => {
      console.log("🚁 Session info:", data);
      if (data?.id) {
        currentSessionId = data.id;
        console.log(`✅ Current session ID: ${currentSessionId}`);
      }
    });

    // Session started event
    socket.on("session_started", (data) => {
      console.log("🚁 Session started:", data);
      if (data?.sessionId) {
        currentSessionId = data.sessionId;
        console.log(`✅ Session started with ID: ${currentSessionId}`);
      }
    });

    // Session ended event
    socket.on("session_ended", (data) => {
      console.log("🛑 Session ended:", data);
      currentSessionId = null;
      if (typeof setAndroidStatus === "function") {
        setAndroidStatus("Session Ended", "text-warning");
      }
    });

    // Android → Web (istek cevabı)
    socket.on("data_response", (data) => {
      console.log("✅ data_response:", data);

      if (typeof setAndroidStatus === "function") setAndroidStatus("Bağlı", "text-success");

      if (data?.type === "battery" && typeof data?.value === "number") {
        updateBatteryUI(data.value);
        return;
      }

      if (data?.type === "flightTime") {
        const ftEl = document.getElementById("flightTimeValue");
        if (ftEl && data?.value != null) ftEl.textContent = String(data.value);
        return;
      }
    });
  } catch (err) {
    console.warn("Socket başlatılamadı. Telemetri devre dışı:", err);
    socket = null;
    if (typeof setSocketStatus === "function") setSocketStatus(false);
    if (typeof setAndroidStatus === "function") setAndroidStatus("Bilinmiyor", "text-muted");
  }
})();


// Web → Android örnek istek
function requestBattery() {
  if (!socket || !socket.connected) {
    console.warn("Socket yok/bağlı değil. requestBattery() çalıştırılamaz.");
    return;
  }

  const requestId =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `req-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  socket.emit("data_request", {
    type: "battery",
    requestId
  });
}


// ======================
// DASHBOARD STATUS FONKSİYONLARI
// ======================
function setSocketStatus(isConnected) {
  const socketStatusEl = document.getElementById("socketStatus");
  const socketStatusText = document.getElementById("socketStatusText");
  if (socketStatusEl && socketStatusText) {
    if (isConnected) {
      socketStatusEl.className = "badge badge-success";
      socketStatusText.textContent = "Bağlı";
    } else {
      socketStatusEl.className = "badge badge-danger";
      socketStatusText.textContent = "Bağlantı Yok";
    }
  }
}

function setAndroidStatus(text, cssClass) {
  const androidStatusEl = document.getElementById("androidStatus");
  const androidStatusText = document.getElementById("androidStatusText");
  if (androidStatusEl && androidStatusText) {
    androidStatusEl.className = `badge ${cssClass}`;
    androidStatusText.textContent = text;
  }
}

// ======================
// DRONE KONTROL FONKSİYONLARI
// ======================
function droneTakeoff() {
  if (!socket || !socket.connected) {
    alert("Socket bağlantısı yok! Lütfen backend'in çalıştığından emin olun.");
    return;
  }

  const confirm = window.confirm("Drone kalkış yapacak. Emin misiniz?");
  if (!confirm) return;

  console.log("🚁 Drone takeoff komutu gönderiliyor...");
  socket.emit("drone_command", {
    command: "takeoff",
    timestamp: Date.now()
  });

  alert("✅ Kalkış komutu gönderildi!");
}

function droneLand() {
  if (!socket || !socket.connected) {
    alert("Socket bağlantısı yok! Lütfen backend'in çalıştığından emin olun.");
    return;
  }

  const confirm = window.confirm("Drone iniş yapacak. Emin misiniz?");
  if (!confirm) return;

  console.log("🛬 Drone landing komutu gönderiliyor...");
  socket.emit("drone_command", {
    command: "land",
    timestamp: Date.now()
  });

  alert("✅ İniş komutu gönderildi!");
}

// ======================
// UI GÜNCELLEMELERİ
// ======================
function updateBatteryUI(battery) {
  const value = Math.max(0, Math.min(100, Number(battery)));

  const circle = document.getElementById("batteryCircle");
  const text = document.getElementById("batteryValue");

  if (!circle || !text) return;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const offset = circumference - (value / 100) * circumference;

  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${offset}`;

  text.textContent = `%${value}`;

  // Renkler
  if (value <= 20) {
    circle.style.stroke = "#dc2626"; // kırmızı
    text.style.fill = "#dc2626";
  } else if (value <= 50) {
    circle.style.stroke = "#f59e0b"; // amber
    text.style.fill = "#f59e0b";
  } else {
    circle.style.stroke = "#16a34a"; // yeşil
    text.style.fill = "#16a34a";
  }
}

function updateGimbalUI(gimbal) {
  const pitchEl = document.getElementById("gimbalPitch");
  const rollEl = document.getElementById("gimbalRoll");
  const yawEl = document.getElementById("gimbalYaw");

  if (pitchEl && typeof gimbal.pitch === "number") {
    pitchEl.textContent = `${gimbal.pitch.toFixed(1)}°`;
  }
  if (rollEl && typeof gimbal.roll === "number") {
    rollEl.textContent = `${gimbal.roll.toFixed(1)}°`;
  }
  if (yawEl && typeof gimbal.yaw === "number") {
    yawEl.textContent = `${gimbal.yaw.toFixed(1)}°`;
  }

  console.log("📐 Gimbal güncellendi:", gimbal);
}

function updateAltitudeUI(altitude) {
  const aglEl = document.getElementById("altitudeAgl");
  const amslEl = document.getElementById("altitudeAmsl");

  if (aglEl && typeof altitude.agl === "number") {
    aglEl.textContent = `${altitude.agl.toFixed(1)} m`;
  }
  if (amslEl && typeof altitude.amsl === "number") {
    amslEl.textContent = `${altitude.amsl.toFixed(1)} m`;
  }

  console.log("📏 Altitude güncellendi:", altitude);
}

function updateGpsUI(gps) {
  const signalEl = document.getElementById("gpsSignal");
  const satelliteEl = document.getElementById("gpsSatellite");

  if (signalEl && gps.signalLevel) {
    signalEl.textContent = gps.signalLevel;

    // Sinyal kalitesine göre renk
    if (gps.signalLevel === "STRONG") {
      signalEl.className = "badge badge-success";
    } else if (gps.signalLevel === "MEDIUM") {
      signalEl.className = "badge badge-warning";
    } else {
      signalEl.className = "badge badge-danger";
    }
  }

  if (satelliteEl && typeof gps.satelliteCount === "number") {
    satelliteEl.textContent = `${gps.satelliteCount} uydu`;
  }

  console.log("🛰️ GPS güncellendi:", gps);
}

function setCircularPercent(circleId, textId, percent) {
  const circle = document.getElementById(circleId);
  const text = document.getElementById(textId);
  if (!circle || !text) return;

  const clamped = Math.max(0, Math.min(100, percent));
  const circumference = 314;
  const offset = circumference - (clamped / 100) * circumference;

  circle.style.strokeDashoffset = offset;
  text.textContent = `%${clamped}`;

  // renk mantığı
  const color =
    clamped < 30 ? "#dc2626" :   // kırmızı
      clamped < 70 ? "#f59e0b" :   // amber
        "#16a34a";                   // yeşil

  circle.style.stroke = color;
  text.style.fill = color;
}






// ======================
// ====== AYARLAR ======
// ======================
const API_BASE_URL = "http://localhost:3001";
const AREAS_ENDPOINT = `${API_BASE_URL}/api/areas`;
const REPORT_ENDPOINT = `${API_BASE_URL}/api/reports/generate`;
// ✅ Alan bazlı metrikler (dbId -> { scanPercent, ... })
const areaMetrics = new Map();
let map;
let drawnItems;

// ====== ALAN TARAMA ======
const SCAN_API = `${API_BASE_URL}/api/scan`;
let currentRoute        = null;   // [[lat, lon], ...]
let currentObstacles    = [];     // [{lat, lon, radiusM, ...}]
let routeLayerGroup     = null;   // Leaflet layer group (rota)
let obstacleLayerGroup  = null;   // Leaflet layer group (engeller)
let droneMarker         = null;   // Drone harita ikonu
let droneTrailLayer     = null;   // İz çizgisi
const droneTrailPoints  = [];     // Son 300 konum

// ✅ seçili alan (rapor üretirken kullanılacak)
let selectedAreaLayer = null; // Leaflet layer (GeoJSON layer)
let selectedAreaDbId = null;  // DB id varsa

// ====== ALAN RENK / LEJANT / LABEL ======
let drawOrder = [];                // [{ dbId, name, created_at }]
const areaLayers = new Map();      // dbId -> { polygonLayer, labelMarker, name }
const areaColors = new Map();      // dbId -> color

let legendControl = null;

function colorByOrder(orderIndex) {
  const palette = [
    "#2563eb", // blue
    "#dc2626", // red
    "#16a34a", // green
    "#f59e0b", // amber
    "#9333ea", // purple
    "#0ea5e9", // sky
    "#ea580c", // orange
    "#64748b"  // slate
  ];
  return palette[(orderIndex - 1) % palette.length];
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function createLabelIcon(text) {
  return L.divIcon({
    className: "area-label",
    html: `<div class="area-label__inner">${escapeHtml(text)}</div>`,
    iconSize: null
  });
}

// ======================
// SEÇİM (RAPOR İÇİN)
// ======================
function setSelectedArea(layer, dbId = null) {
  // önceki seçimi normale döndür
  if (selectedAreaLayer && selectedAreaLayer.setStyle) {
    refreshStylesAndLabels(); // tüm alanları default stile döndürür
  }

  selectedAreaLayer = layer;
  selectedAreaDbId = dbId ? String(dbId) : null;

  // seçili alanı belirgin yap
  if (selectedAreaLayer && selectedAreaLayer.setStyle) {
    selectedAreaLayer.setStyle({ weight: 6, fillOpacity: 0.25 });
  }

  // ✅ Seçili Alan kartını güncelle
  const nameEl = document.getElementById("selectedAreaName");
  const hintEl = document.getElementById("selectedAreaHint");

  if (selectedAreaDbId) {
    const info = areaLayers.get(String(selectedAreaDbId));
    const idx = drawOrder.findIndex((x) => String(x.dbId) === String(selectedAreaDbId));
    const orderIndex = idx + 1;
    const areaName = info?.name ?? `alan-${selectedAreaDbId}`;
    if (nameEl) nameEl.textContent = `Alan ${orderIndex}: ${areaName}`;
    if (hintEl) hintEl.textContent = `ID: ${selectedAreaDbId}`;
  } else {
    if (nameEl) nameEl.textContent = "Seçilmedi";
    if (hintEl) hintEl.textContent = "Lejanttan veya haritadaki polygona tıklayarak seç.";
  }

  console.log("✅ Seçili alan güncellendi:", { selectedAreaDbId });
}

function updateSelectedAreaTelemetryCards() {
  // seçili alan yoksa 0 gösterelim (veya boş)
  if (!selectedAreaDbId) {
    setCircularPercent("scanCircle", "scanPercentValue", 0);
    return;
  }

  const m = areaMetrics.get(String(selectedAreaDbId));
  const scan = (m && typeof m.scanPercent === "number") ? m.scanPercent : 0;

  setCircularPercent("scanCircle", "scanPercentValue", scan);
}


// Leaflet layer -> points [[lat,lon], ...]
function getPointsFromLayer(layer) {
  if (!layer) return null;

  const geojson = layer.toGeoJSON?.();
  if (!geojson) return null;

  // L.geoJSON() dönen layer FeatureCollection olabilir, tek Feature de olabilir
  let geom = null;
  if (geojson.type === "FeatureCollection" && geojson.features?.length > 0) {
    geom = geojson.features[0].geometry;
  } else if (geojson.type === "Feature") {
    geom = geojson.geometry;
  } else {
    geom = geojson.geometry || geojson;
  }

  if (!geom || geom.type !== "Polygon") return null;

  const ring = geom.coordinates?.[0]; // [ [lon,lat], ... ]
  if (!Array.isArray(ring) || ring.length < 3) return null;

  // [lat,lon]
  const pointsLatLon = ring.map(([lon, lat]) => [lat, lon]);

  // closed ring varsa son noktayı kırp
  if (pointsLatLon.length >= 2) {
    const first = pointsLatLon[0];
    const last = pointsLatLon[pointsLatLon.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      pointsLatLon.pop();
    }
  }

  return pointsLatLon;
}

// ======================
// LEGEND
// ======================
function ensureLegend() {
  if (legendControl) return;

  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create("div", "area-legend");
    div.innerHTML = `
      <div class="area-legend__title">Alanlar</div>
      <div id="legendItems"></div>
    `;
    return div;
  };
  legendControl.addTo(map);

  const el = document.querySelector(".area-legend");
  if (el) {
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);

    el.addEventListener("click", async (ev) => {
      // 1) Silme butonu
      const delBtn = ev.target.closest("[data-delete-area]");
      if (delBtn) {
        const dbId = delBtn.getAttribute("data-delete-area");
        await deleteArea(dbId);
        return;
      }

      // 2) Seçim (item'e tıklama)
      const item = ev.target.closest("[data-select-area]");
      if (item) {
        const dbId = item.getAttribute("data-select-area");
        const info = areaLayers.get(String(dbId));
        if (info?.polygonLayer) {
          setSelectedArea(info.polygonLayer, dbId);
          // haritayı seçili alana zoomlamak istersen:
          // map.fitBounds(info.polygonLayer.getBounds(), { padding: [20, 20] });
        }
      }


      // 3) Lejanttan seçim (yeni)
      const sel = ev.target.closest("[data-select-area]");
      if (sel) {
        const dbId = sel.getAttribute("data-select-area");
        const info = areaLayers.get(String(dbId));
        if (info?.polygonLayer) {
          setSelectedArea(info.polygonLayer, dbId);

          // küçük UX: alan görünür değilse ekrana sığdır
          try {
            const bounds = info.polygonLayer.getBounds?.();
            if (bounds && bounds.isValid && bounds.isValid()) {
              map.fitBounds(bounds, { padding: [30, 30] });
            }
          } catch { }
        }
        return;
      }
    });
  }
}

function updateLegend() {
  ensureLegend();
  const container = document.getElementById("legendItems");
  if (!container) return;

  if (drawOrder.length === 0) {
    container.innerHTML = `
  <div class="area-legend__empty text-center p-3">
    <i class="fas fa-draw-polygon mb-2" style="font-size:24px; color:#9ca3af;"></i>
    <div style="font-weight:600; color:#374151;">
      Henüz tanımlı alan yok
    </div>
    <div style="font-size:12px; color:#6b7280; margin-top:4px;">
      Harita üzerinden yeni bir alan çizerek başlayabilirsin
    </div>
  </div>
`;

  }

  container.innerHTML = drawOrder.map((item, idx) => {
    const dbId = String(item.dbId);
    const info = areaLayers.get(dbId);
    const orderIndex = idx + 1;
    const color = areaColors.get(dbId) || colorByOrder(orderIndex);
    const displayName = `Alan ${orderIndex}: ${info?.name ?? item.name ?? dbId}`;

    // ✅ tüm satır seçilebilir (silme butonu hariç)
    // data-select-area: lejanttan seçim için
    return `
      <div class="area-legend__item" data-select-area="${dbId}" title="Seçmek için tıkla">
        <span class="swatch" style="background:${color}"></span>
        <span class="label">${escapeHtml(displayName)}</span>
        <button class="legend-del" title="Sil" data-delete-area="${dbId}">✕</button>
      </div>
    `;
  }).join("");
}

function refreshStylesAndLabels() {
  drawOrder.forEach((item, idx) => {
    const dbId = String(item.dbId);
    const info = areaLayers.get(dbId);
    if (!info) return;

    const orderIndex = idx + 1;
    const color = colorByOrder(orderIndex);
    areaColors.set(dbId, color);

    if (info.polygonLayer?.setStyle) {
      info.polygonLayer.setStyle({
        color,
        weight: 3,
        fillColor: color,
        fillOpacity: 0.18
      });
    }

    const labelText = `Alan ${orderIndex} (${info.name})`;
    if (info.labelMarker?.setIcon) {
      info.labelMarker.setIcon(createLabelIcon(labelText));
    }
  });

  updateLegend();

  // seçili alan varsa tekrar highlight et
  if (selectedAreaLayer && selectedAreaLayer.setStyle) {
    selectedAreaLayer.setStyle({ weight: 6, fillOpacity: 0.25 });
  }
}

function addAreaToMap(areaRow) {
  const dbId = String(areaRow.id ?? Date.now());
  const name = areaRow.name ?? `alan-${dbId}`;

  if (!drawOrder.some((x) => String(x.dbId) === dbId)) {
    drawOrder.push({ dbId, name, created_at: areaRow.created_at ?? null });
  }

  if (areaLayers.has(dbId)) {
    refreshStylesAndLabels();
    return;
  }

  const orderIndex = drawOrder.findIndex((x) => String(x.dbId) === dbId) + 1;
  const color = colorByOrder(orderIndex);
  areaColors.set(dbId, color);

  const feature = dbPolygonToGeojsonFeature(areaRow);

  const polygonLayer = L.geoJSON(feature, {
    style: {
      color,
      weight: 3,
      fillColor: color,
      fillOpacity: 0.18
    }
  });

  // ✅ haritada tıklanınca seç
  polygonLayer.on("click", (e) => {
    // Leaflet: event propagation’ı kontrol etmek için
    try { L.DomEvent.stopPropagation(e); } catch { }
    setSelectedArea(polygonLayer, dbId);
  });

  polygonLayer.addTo(drawnItems);

  const bounds = polygonLayer.getBounds();
  const center = bounds.getCenter();

  const labelText = `Alan ${orderIndex} (${name})`;
  const labelMarker = L.marker(center, {
    icon: createLabelIcon(labelText),
    interactive: false
  });

  labelMarker.addTo(drawnItems);

  areaLayers.set(dbId, { polygonLayer, labelMarker, name });

  refreshStylesAndLabels();
}

async function deleteArea(dbId) {
  const id = String(dbId);
  const info = areaLayers.get(id);
  if (!info) return;

  const ok = confirm(`"${info.name}" alanını silmek istiyor musun?`);
  if (!ok) return;

  try {
    const res = await fetch(`${AREAS_ENDPOINT}/${id}`, { method: "DELETE" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

    if (info.polygonLayer) drawnItems.removeLayer(info.polygonLayer);
    if (info.labelMarker) drawnItems.removeLayer(info.labelMarker);

    if (selectedAreaDbId === id) {
      selectedAreaLayer = null;
      selectedAreaDbId = null;
    }

    areaLayers.delete(id);
    areaColors.delete(id);
    drawOrder = drawOrder.filter((x) => String(x.dbId) !== id);

    refreshStylesAndLabels();
    alert("Alan silindi ✅");
  } catch (err) {
    console.error(err);
    alert("Silme sırasında hata oldu ❌\nDetay: " + err.message);
  }
}

// ======================
// HARİTAYI BAŞLAT
// ======================
document.addEventListener("DOMContentLoaded", () => {
  if (typeof L === "undefined") {
    console.error("Leaflet (L) yüklenmedi. Harita başlatılamıyor.");
    return;
  }

  map = L.map("map").setView([38.6811, 39.2203], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap katkıcıları"
  }).addTo(map);

  // Drone marker
  L.marker([38.6811, 39.2203]).addTo(map).bindPopup("Drone Konumu");

  // Çizim katmanı
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  // Haritanın boş yerine tıklanınca seçimi kaldır (silme özelliğine dokunmaz)
  map.on("click", () => {
    setSelectedArea(null, null);
  });

  // Draw
  if (L.Control && L.Control.Draw) {
    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: true,
        rectangle: true,
        circle: false,
        circlemarker: false,
        polyline: false,
        marker: false
      },
      edit: { featureGroup: drawnItems }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, async (e) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);

      // çizilen alanı seçili yap (DB’ye kaydedilene kadar geçici)
      setSelectedArea(layer, null);

      const feature = layer.toGeoJSON();
      const name = prompt("Bu alanın adı ne olsun?", `alan-${drawOrder.length + 1}`);
      if (!name) {
        drawnItems.removeLayer(layer);
        selectedAreaLayer = null;
        selectedAreaDbId = null;
        refreshStylesAndLabels();
        return;
      }

      let dbPolygon;
      try {
        dbPolygon = geojsonFeatureToDbPolygon(feature);
      } catch (err) {
        console.error(err);
        alert(err.message);
        return;
      }

      try {
        const res = await fetch(AREAS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, coordinates: dbPolygon })
        });

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

        let saved = null;
        try { saved = JSON.parse(text); } catch { saved = null; }

        if (saved && saved.id && saved.coordinates) {
          // DB’den gelen alanı ekle
          addAreaToMap(saved);

          // seçimi DB layer’ına taşı
          const info = areaLayers.get(String(saved.id));
          if (info?.polygonLayer) setSelectedArea(info.polygonLayer, saved.id);

          // geçici layer’ı temizle
          try { drawnItems.removeLayer(layer); } catch { }
        } else {
          await loadSavedAreas(true);
        }

        alert("Alan başarıyla kaydedildi ✅");
      } catch (err) {
        console.error(err);
        alert("Kaydetme sırasında hata oldu ❌\nDetay: " + err.message);
      }
    });
  } else {
    console.warn("Leaflet Draw yüklenmedi. Çizim araçları devre dışı.");
  }

  // Açılışta alanları yükle
  loadSavedAreas();

  // Rapor butonu
  initReportButton();

  // Elle kontrol modal
  initElleKontrolModal();

  // Tarama modal
  initScanModal();

  // Drone harita ikonu
  initDroneMarker();
});

// ======================
// RAPOR (PDF) - SEÇİLİ ALANI BACKEND'E GÖNDER
// ======================
const RAPOR_KATEGORILER = ["Metal", "Karton", "Kağıt", "Cam", "Organik Atık", "Geri Dönüştürülemez", "Plastik"];

const RAPOR_DRONE_BILGILERI = [
  { key: "includeBattery",    label: "Batarya (Ort. Şarj / Min. Batarya)" },
  { key: "includeFlightTime", label: "Uçuş Süresi" },
  { key: "includeAltitude",   label: "Maksimum İrtifa" },
  { key: "includeGps",        label: "Başlangıç / Bitiş Koordinatları" },
  { key: "includeGimbal",     label: "Gimbal Bilgisi" }
];

function initReportButton() {
  const raporBtn = document.getElementById("raporOlusturBtn");
  const raporDurum = document.getElementById("raporDurum");

  if (!raporBtn) return;

  // Modal elemanları
  const modal = document.getElementById("raporAyarModal");
  const backdrop = document.getElementById("raporAyarBackdrop");
  const kategoriContainer = document.getElementById("kategoriCheckboxlar");
  const droneContainer = document.getElementById("droneCheckboxlar");

  // Checkbox'ları oluştur
  RAPOR_KATEGORILER.forEach((kat, i) => {
    kategoriContainer.innerHTML += `
      <div class="rapor-checkbox-item">
        <input type="checkbox" id="kat_${i}" value="${kat}" checked>
        <label for="kat_${i}">${kat}</label>
      </div>`;
  });

  RAPOR_DRONE_BILGILERI.forEach((item, i) => {
    droneContainer.innerHTML += `
      <div class="rapor-checkbox-item">
        <input type="checkbox" id="drone_${i}" data-key="${item.key}" checked>
        <label for="drone_${i}">${item.label}</label>
      </div>`;
  });

  // Modal aç / kapat
  function openModal() {
    backdrop.style.display = "block";
    modal.style.display = "flex";
  }

  function closeModal() {
    backdrop.style.display = "none";
    modal.style.display = "none";
  }

  // Tümünü Seç / Kaldır yardımcıları
  document.getElementById("kategoriTumunuSec").addEventListener("click", () => {
    kategoriContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById("kategoriTumunuKaldir").addEventListener("click", () => {
    kategoriContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });
  document.getElementById("droneTumunuSec").addEventListener("click", () => {
    droneContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById("droneTumunuKaldir").addEventListener("click", () => {
    droneContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  // Kapatma butonları
  document.getElementById("raporModalKapat").addEventListener("click", closeModal);
  document.getElementById("raporModalIptal").addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  // Ana buton: modal aç
  raporBtn.addEventListener("click", () => {
    const points = getPointsFromLayer(selectedAreaLayer);
    if (!points || points.length < 3) {
      alert("Lütfen rapor için bir alan seç (lejantdaki alana tıkla veya haritada alanın üstüne tıkla).");
      return;
    }
    openModal();
  });

  // "Raporu Oluştur" (modal içi)
  document.getElementById("raporModalOlustur").addEventListener("click", async () => {
    // Seçili kategorileri topla
    const seciliKategoriler = [];
    kategoriContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      seciliKategoriler.push(cb.value);
    });

    // Seçili drone seçeneklerini topla
    const droneOptions = {};
    droneContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      droneOptions[cb.dataset.key] = cb.checked;
    });

    closeModal();
    await generateReport(seciliKategoriler, droneOptions);
  });

  // Asıl rapor oluşturma
  async function generateReport(kategoriler, droneOptions) {
    try {
      const points = getPointsFromLayer(selectedAreaLayer);

      raporBtn.disabled = true;
      raporBtn.textContent = "Rapor oluşturuluyor...";
      if (raporDurum) {
        raporDurum.className = "text-info";
        raporDurum.textContent = "Rapor oluşturuluyor...";
      }

      const startRes = await fetch(REPORT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          areaId: selectedAreaDbId,
          points,
          kategoriler,
          options: droneOptions
        })
      });

      if (!startRes.ok) {
        const t = await startRes.text().catch(() => "");
        throw new Error(`Backend hata: ${startRes.status} ${t}`);
      }

      const { jobId } = await startRes.json();

      window.open(`${API_BASE_URL}/api/reports/wait-and-download/${jobId}`, "_blank");

      const pollStatus = async () => {
        const maxAttempts = 80;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const statusRes = await fetch(`${API_BASE_URL}/api/reports/status/${jobId}`);
            const job = await statusRes.json();
            if (job.status === "ready") {
              if (raporDurum) {
                raporDurum.className = "text-success";
                raporDurum.textContent = "Rapor başarıyla oluşturuldu.";
              }
              return;
            }
            if (job.status === "error") {
              throw new Error(job.error);
            }
          } catch { break; }
        }
      };
      pollStatus();

    } catch (err) {
      console.error(err);
      if (raporDurum) {
        raporDurum.className = "text-danger";
        raporDurum.textContent = "Rapor oluşturulamadı. Backend çalışıyor mu? (localhost:3001)";
      }
    } finally {
      raporBtn.disabled = false;
      raporBtn.textContent = "Seçili Alanın Raporunu Oluştur (PDF)";
    }
  }
}

// ======================
// DB’DEN ALANLARI ÇEK / ÇİZ
// ======================
async function loadSavedAreas(clearBefore = false) {
  try {
    const res = await fetch(AREAS_ENDPOINT);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

    let areas = JSON.parse(text);
    if (!Array.isArray(areas)) areas = [];

    areas.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : NaN;
      const tb = b.created_at ? Date.parse(b.created_at) : NaN;
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    if (clearBefore && drawnItems) {
      drawnItems.clearLayers();
      areaLayers.clear();
      areaColors.clear();
      // seçim otomatik yapılmasın
      selectedAreaLayer = null;
      selectedAreaDbId = null;
    }

    drawOrder = areas.map((a) => ({ dbId: a.id, name: a.name, created_at: a.created_at ?? null }));

    areas.forEach((a) => {
      if (a?.coordinates?.type === "polygon" && Array.isArray(a.coordinates.points)) {
        addAreaToMap(a);
      }
    });

    refreshStylesAndLabels();

    // ❌ Otomatik ilk alan seçimi YOK (kullanıcı seçsin)
  } catch (err) {
    console.error("Alanları çekerken hata:", err);
  }
}

// ======================
// DÖNÜŞÜMLER
// ======================
function geojsonFeatureToDbPolygon(feature) {
  const geom = feature?.geometry;
  if (!geom || geom.type !== "Polygon") {
    throw new Error("Sadece Polygon/Rectangle destekleniyor.");
  }

  const ring = geom.coordinates[0]; // [ [lon,lat], ... ]
  const pointsLatLon = ring.map(([lon, lat]) => [lat, lon]);
  return { type: "polygon", points: pointsLatLon };
}

function dbPolygonToGeojsonFeature(areaRow) {
  const ringLonLat = areaRow.coordinates.points.map(([lat, lon]) => [lon, lat]);

  const first = ringLonLat[0];
  const last = ringLonLat[ringLonLat.length - 1];
  const closedRing =
    first && last && (first[0] !== last[0] || first[1] !== last[1])
      ? [...ringLonLat, first]
      : ringLonLat;

  return {
    type: "Feature",
    properties: { title: areaRow.name, id: areaRow.id },
    geometry: {
      type: "Polygon",
      coordinates: [closedRing]
    }
  };
}

// ======================
// DİĞER DEMO FONKSİYONLAR
// ======================
function startExploration() { alert("Alan keşfi başlatıldı (demo)."); }

// ======================
// ALAN TARAMA
// ======================
function startScan() {
  if (!selectedAreaDbId || !selectedAreaLayer) {
    alert("Lütfen önce bir alan seçin (lejanttan veya harita üzerinden).");
    return;
  }
  document.getElementById("taramaBackdrop").style.display = "block";
  document.getElementById("taramaModal").style.display    = "flex";
  document.getElementById("taramaBaslat").disabled = true;
  document.getElementById("routeInfo").style.display = "none";
  setRouteStatusMsg("", "");

  // Kayıtlı rota ve engelleri yükle
  loadSavedRoute(selectedAreaDbId);
  loadObstacles(selectedAreaDbId);
}

function closeTaramaModal() {
  document.getElementById("taramaBackdrop").style.display = "none";
  document.getElementById("taramaModal").style.display    = "none";
}

function setRouteStatusMsg(msg, type) {
  const el = document.getElementById("routeStatusMsg");
  if (!el) return;
  if (!msg) { el.style.display = "none"; return; }
  el.className = `tarama-status-msg ${type}`;
  el.textContent = msg;
  el.style.display = "block";
}

async function loadSavedRoute(areaId) {
  try {
    const res = await fetch(`${SCAN_API}/route/${areaId}`);
    if (!res.ok) {
      setRouteStatusMsg("Bu alan için kayıtlı rota yok. 'Rotayı Hesapla' ile yeni rota oluşturun.", "info");
      return;
    }
    const data = await res.json();
    if (Array.isArray(data?.waypoints) && data.waypoints.length > 0) {
      currentRoute = data.waypoints;
      drawRouteOnMap(currentRoute);
      updateRouteInfoUI(currentRoute, currentObstacles);
      document.getElementById("taramaBaslat").disabled = false;
      if (data.scan_width_m) document.getElementById("stripWidth").value    = data.scan_width_m;
      if (data.altitude_m)   document.getElementById("flightAltitude").value = data.altitude_m;
      setRouteStatusMsg(`Kayıtlı rota yüklendi (${currentRoute.length} waypoint).`, "success");
    }
  } catch { /* yeni alan */ }
}

async function loadObstacles(areaId) {
  try {
    const res = await fetch(`${SCAN_API}/obstacles/${areaId}`);
    if (!res.ok) return;
    const list = await res.json();
    currentObstacles = list.map(o => ({
      id: o.id,
      lat:        parseFloat(o.lat),
      lon:        parseFloat(o.lon),
      radiusM:    parseFloat(o.radius_m) || 5,
      obstacleType: o.obstacle_type || "unknown"
    }));
    drawObstaclesOnMap(currentObstacles);
    const el = document.getElementById("obstacleCount");
    if (el) el.textContent = currentObstacles.length;
  } catch { }
}

// Engel socket'ten geldiğinde (uçuş sırasında canlı)
async function handleObstacleDetected(data) {
  const obs = {
    lat:      data.lat,
    lon:      data.lon,
    radiusM:  data.radiusM || data.radius_m || 5,
    obstacleType: data.type || data.obstacleType || "sensor"
  };
  currentObstacles.push(obs);
  drawObstaclesOnMap(currentObstacles);

  // DB'ye kaydet (areaId varsa)
  if (selectedAreaDbId) {
    try {
      await fetch(`${SCAN_API}/obstacles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId:       selectedAreaDbId,
          lat:          obs.lat,
          lon:          obs.lon,
          radiusM:      obs.radiusM,
          obstacleType: obs.obstacleType
        })
      });
    } catch { }
  }
}

function updateRouteInfoUI(waypoints, obstacles = []) {
  const infoBox = document.getElementById("routeInfo");
  if (infoBox) infoBox.style.display = "block";

  const dist    = totalRouteDistance(waypoints);
  const timeMin = Math.round(dist / 5 / 60);   // 5 m/s nominal speed

  const wpEl   = document.getElementById("waypointCount");
  const distEl = document.getElementById("routeDistance");
  const timeEl = document.getElementById("routeTime");
  const obsEl  = document.getElementById("obstacleCount");

  if (wpEl)   wpEl.textContent   = waypoints.length;
  if (distEl) distEl.textContent = `${(dist / 1000).toFixed(2)} km`;
  if (timeEl) timeEl.textContent = `~${timeMin} dk`;
  if (obsEl)  obsEl.textContent  = obstacles.length;
}

function initScanModal() {
  document.getElementById("taramaKapat").addEventListener("click", closeTaramaModal);
  document.getElementById("taramaBackdrop").addEventListener("click", closeTaramaModal);
  document.getElementById("taramaIptal").addEventListener("click", closeTaramaModal);

  document.getElementById("rotayiHesapla").addEventListener("click", () => {
    const stripW  = parseFloat(document.getElementById("stripWidth").value)    || 20;
    const altM    = parseFloat(document.getElementById("flightAltitude").value) || 50;
    const safety  = parseFloat(document.getElementById("safetyBuffer").value)  || 5;

    const points = getPointsFromLayer(selectedAreaLayer);
    if (!points || points.length < 3) {
      setRouteStatusMsg("Seçili alan geçersiz.", "error");
      return;
    }

    const btn = document.getElementById("rotayiHesapla");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hesaplanıyor...';
    setRouteStatusMsg("Optimal rota hesaplanıyor...", "info");

    // setTimeout ile UI'ın render etmesine izin ver
    setTimeout(() => {
      try {
        let waypoints = planBoustrophedonRoute(points, stripW);
        if (waypoints.length === 0) {
          setRouteStatusMsg("Rota hesaplanamadı. Farklı şerit genişliği deneyin.", "error");
          return;
        }
        if (currentObstacles.length > 0) {
          waypoints = applyObstacleAvoidance(waypoints, currentObstacles, safety);
          setRouteStatusMsg(`Rota ${currentObstacles.length} engel etrafında yeniden düzenlendi.`, "success");
        } else {
          setRouteStatusMsg(`Rota hazır: ${waypoints.length} waypoint, ${(totalRouteDistance(waypoints)/1000).toFixed(2)} km.`, "success");
        }
        currentRoute = waypoints;
        drawRouteOnMap(currentRoute);
        updateRouteInfoUI(currentRoute, currentObstacles);
        document.getElementById("taramaBaslat").disabled = false;
      } catch (err) {
        setRouteStatusMsg("Rota hesaplanırken hata: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-calculator"></i> Rotayı Hesapla';
      }
    }, 80);
  });

  document.getElementById("taramaBaslat").addEventListener("click", async () => {
    if (!currentRoute || currentRoute.length === 0) return;
    if (!socket || !socket.connected) {
      alert("Socket bağlantısı yok! Backend çalışıyor mu?");
      return;
    }

    const stripW = parseFloat(document.getElementById("stripWidth").value)    || 20;
    const altM   = parseFloat(document.getElementById("flightAltitude").value) || 50;

    const ok = confirm(`${currentRoute.length} waypoint ile alan taraması başlatılsın mı?\nDrone otonom uçuşa geçecek.`);
    if (!ok) return;

    // Drone'a tarama komutunu gönder
    socket.emit("drone_command", {
      command:      "start_area_scan",
      waypoints:    currentRoute,
      altitudeM:    altM,
      stripWidthM:  stripW,
      areaId:       selectedAreaDbId,
      timestamp:    Date.now()
    });

    // Rotayı backend'e kaydet
    try {
      const dist = totalRouteDistance(currentRoute);
      await fetch(`${SCAN_API}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId:         selectedAreaDbId,
          waypoints:      currentRoute,
          obstacles:      currentObstacles,
          scanWidthM:     stripW,
          altitudeM:      altM,
          totalDistanceM: Math.round(dist),
          waypointCount:  currentRoute.length
        })
      });
    } catch (e) {
      console.warn("Rota kaydedilemedi:", e);
    }

    closeTaramaModal();
    alert(`Alan taraması başlatıldı! Drone ${currentRoute.length} waypoint'i takip ediyor.`);
  });
}

// ======================
// ROTA HARİTA GÖRSELLEŞTİRME
// ======================
function drawRouteOnMap(waypoints) {
  if (!routeLayerGroup) routeLayerGroup = L.layerGroup().addTo(map);
  routeLayerGroup.clearLayers();
  if (!waypoints || waypoints.length === 0) return;

  // Ana çizgi
  L.polyline(waypoints, {
    color: "#f59e0b", weight: 2.5, opacity: 0.85, dashArray: "6, 4"
  }).addTo(routeLayerGroup);

  // Başlangıç (yeşil)
  L.circleMarker(waypoints[0], {
    radius: 7, color: "#16a34a", fillColor: "#4ade80", fillOpacity: 1, weight: 2
  }).bindTooltip("Başlangıç", { permanent: false }).addTo(routeLayerGroup);

  // Bitiş (kırmızı)
  L.circleMarker(waypoints[waypoints.length - 1], {
    radius: 7, color: "#dc2626", fillColor: "#f87171", fillOpacity: 1, weight: 2
  }).bindTooltip("Bitiş", { permanent: false }).addTo(routeLayerGroup);

  // Ara waypoint noktaları (küçük)
  for (let i = 1; i < waypoints.length - 1; i++) {
    L.circleMarker(waypoints[i], {
      radius: 3, color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.85, weight: 1
    }).addTo(routeLayerGroup);
  }

  // Yön okları (her 4 waypoint'te bir)
  for (let i = 0; i < waypoints.length - 1; i += 4) {
    const a = waypoints[i], b = waypoints[i + 1];
    const midLat = (a[0] + b[0]) / 2;
    const midLon = (a[1] + b[1]) / 2;
    const angle  = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    L.marker([midLat, midLon], {
      icon: L.divIcon({
        className: "route-arrow",
        html: `<div style="transform:rotate(${angle}deg);font-size:13px;color:#f59e0b;line-height:1;">→</div>`,
        iconSize: [16, 16], iconAnchor: [8, 8]
      }),
      interactive: false
    }).addTo(routeLayerGroup);
  }
}

function drawObstaclesOnMap(obstacles) {
  if (!obstacleLayerGroup) obstacleLayerGroup = L.layerGroup().addTo(map);
  obstacleLayerGroup.clearLayers();

  obstacles.forEach((obs, idx) => {
    const r = obs.radiusM || 5;
    L.circle([obs.lat, obs.lon], {
      radius: r, color: "#dc2626", fillColor: "#fca5a5",
      fillOpacity: 0.3, weight: 2, dashArray: "4, 3"
    }).bindTooltip(`Engel ${idx + 1} (${obs.obstacleType || "bilinmiyor"})`, { permanent: false })
      .addTo(obstacleLayerGroup);

    L.circleMarker([obs.lat, obs.lon], {
      radius: 4, color: "#dc2626", fillColor: "#ef4444", fillOpacity: 1, weight: 2
    }).addTo(obstacleLayerGroup);
  });
}

// ======================
// DRONE HARİTA İKONU
// ======================
function initDroneMarker() {
  if (droneMarker) return;

  const icon = L.divIcon({
    className: "drone-map-icon",
    html: `
      <div class="drone-icon-wrapper" id="droneIconWrapper">
        <svg viewBox="0 0 44 44" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
          <!-- Kollar -->
          <line x1="22" y1="22" x2="6"  y2="6"  stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="22" y1="22" x2="38" y2="6"  stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="22" y1="22" x2="6"  y2="38" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="22" y1="22" x2="38" y2="38" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Rotorlar -->
          <circle cx="6"  cy="6"  r="5" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
          <circle cx="38" cy="6"  r="5" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
          <circle cx="6"  cy="38" r="5" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
          <circle cx="38" cy="38" r="5" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
          <!-- Gövde -->
          <circle cx="22" cy="22" r="7" fill="#2563eb" opacity="0.95"/>
          <!-- Kamera (ön) -->
          <circle cx="22" cy="16" r="2.5" fill="#fbbf24" opacity="0.9"/>
        </svg>
        <div class="drone-pulse"></div>
      </div>`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
    popupAnchor:[0, -24]
  });

  droneMarker = L.marker([38.6811, 39.2203], { icon, zIndexOffset: 1000 })
    .bindPopup("DJI Mini 4 Pro<br><small>Konum bekleniyor...</small>")
    .addTo(map);

  droneTrailLayer = L.polyline([], {
    color: "#60a5fa", weight: 1.8, opacity: 0.5, dashArray: "3, 6"
  }).addTo(map);
}

function updateDroneMarker(lat, lon, heading = 0) {
  if (!droneMarker) initDroneMarker();

  droneMarker.setLatLng([lat, lon]);

  // Yönü dön
  const wrapper = document.getElementById("droneIconWrapper");
  if (wrapper) wrapper.style.transform = `rotate(${heading}deg)`;

  droneMarker.getPopup()?.setContent(
    `DJI Mini 4 Pro<br>
     <small>Lat: ${lat.toFixed(6)}</small><br>
     <small>Lon: ${lon.toFixed(6)}</small><br>
     <small>Heading: ${heading.toFixed(1)}°</small>`
  );

  // İz noktası ekle
  droneTrailPoints.push([lat, lon]);
  if (droneTrailPoints.length > 300) droneTrailPoints.shift();
  droneTrailLayer.setLatLngs(droneTrailPoints);
}

// ======================
// BOUSTROPHEDON ROTA PLANLAMA ALGORİTMASI
// ======================
const _DEG2RAD      = Math.PI / 180;
const _EARTH_M_LAT  = 111319;  // metre / derece enlem

function _ll2m(lat, lon, oLat, oLon) {
  const mPerLon = _EARTH_M_LAT * Math.cos(oLat * _DEG2RAD);
  return { x: (lon - oLon) * mPerLon, y: (lat - oLat) * _EARTH_M_LAT };
}

function _m2ll(x, y, oLat, oLon) {
  const mPerLon = _EARTH_M_LAT * Math.cos(oLat * _DEG2RAD);
  return [oLat + y / _EARTH_M_LAT, oLon + x / mPerLon];
}

function _rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

// Tarama çizgisi (y = Y) ile poligon kenarının kesişim x noktası
function _intersectY(p1, p2, Y) {
  if ((p1.y <= Y) === (p2.y <= Y)) return null;
  return p1.x + (Y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x);
}

function latlonDist(a, b) {
  const dy = (b[0] - a[0]) * _EARTH_M_LAT;
  const dx = (b[1] - a[1]) * _EARTH_M_LAT * Math.cos(a[0] * _DEG2RAD);
  return Math.sqrt(dx * dx + dy * dy);
}

function totalRouteDistance(waypoints) {
  let d = 0;
  for (let i = 1; i < waypoints.length; i++) d += latlonDist(waypoints[i - 1], waypoints[i]);
  return d;
}

function planBoustrophedonRoute(polygonPoints, stripWidthM = 20) {
  if (polygonPoints.length < 3) return [];

  // Ağırlık merkezi (origin)
  const oLat = polygonPoints.reduce((s, p) => s + p[0], 0) / polygonPoints.length;
  const oLon = polygonPoints.reduce((s, p) => s + p[1], 0) / polygonPoints.length;

  // Lat/lon → yerel metre
  const pts = polygonPoints.map(p => _ll2m(p[0], p[1], oLat, oLon));

  // Süpürme açısı: en uzun kenar yönü
  let sweepAngle = 0, maxLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > maxLen) { maxLen = len; sweepAngle = Math.atan2(dy, dx); }
  }

  // Poligonu süpürme eksenine hizala (döndür)
  const rPts = pts.map(p => _rot(p.x, p.y, -sweepAngle));

  const minY = Math.min(...rPts.map(p => p.y));
  const maxY = Math.max(...rPts.map(p => p.y));

  const waypoints = [];
  let rowIndex = 0;

  for (let y = minY + stripWidthM / 2; y <= maxY; y += stripWidthM) {
    const xs = [];
    for (let i = 0; i < rPts.length; i++) {
      const xi = _intersectY(rPts[i], rPts[(i + 1) % rPts.length], y);
      if (xi !== null) xs.push(xi);
    }
    if (xs.length < 2) { rowIndex++; continue; }

    xs.sort((a, b) => a - b);
    const x1 = xs[0], x2 = xs[xs.length - 1];

    // Boustrophedon: satır satır yön değiştir
    const r1 = _rot(x1, y, sweepAngle);
    const r2 = _rot(x2, y, sweepAngle);
    if (rowIndex % 2 === 0) {
      waypoints.push(_m2ll(r1.x, r1.y, oLat, oLon));
      waypoints.push(_m2ll(r2.x, r2.y, oLat, oLon));
    } else {
      waypoints.push(_m2ll(r2.x, r2.y, oLat, oLon));
      waypoints.push(_m2ll(r1.x, r1.y, oLat, oLon));
    }
    rowIndex++;
  }

  return waypoints;
}

// Engel kaçınma: waypoint'leri engelden uzaklaştır
function applyObstacleAvoidance(waypoints, obstacles, safetyBufferM = 5) {
  if (!obstacles || obstacles.length === 0) return waypoints;

  return waypoints.map(wp => {
    let [lat, lon] = wp;
    for (const obs of obstacles) {
      const d = latlonDist([lat, lon], [obs.lat, obs.lon]);
      const minDist = (obs.radiusM || 5) + safetyBufferM;
      if (d < minDist && d > 0.1) {
        // Engelden ters yönde it
        const bearRad = Math.atan2(lat - obs.lat, lon - obs.lon);
        const pushM   = minDist - d + 1;
        lat += (pushM / _EARTH_M_LAT) * Math.cos(bearRad);
        lon += (pushM / (_EARTH_M_LAT * Math.cos(lat * _DEG2RAD))) * Math.sin(bearRad);
      }
    }
    return [lat, lon];
  });
}

// ======================
// İSTASYONA DÖN (Return to Home)
// ======================
function returnToStation() {
  if (!socket || !socket.connected) {
    alert("Socket bağlantısı yok! Lütfen backend'in çalıştığından emin olun.");
    return;
  }
  const ok = window.confirm("Drone home point'e (istasyona) geri dönecek. Emin misiniz?");
  if (!ok) return;

  socket.emit("drone_command", {
    command: "return_to_home",
    timestamp: Date.now()
  });
  alert("İstasyona dön komutu gönderildi!");
}

// ======================
// ELLE KONTROL
// ======================
let manualControlActive = false;
let joystickSendInterval = null;

const joystickState = {
  left:  { x: 0, y: 0 },
  right: { x: 0, y: 0 }
};

function manualControl() {
  if (!socket || !socket.connected) {
    alert("Socket bağlantısı yok! Lütfen backend'in çalıştığından emin olun.");
    return;
  }
  const ok = window.confirm("Drone elle kontrol moduna geçecek. Emin misiniz?");
  if (!ok) return;

  document.getElementById("elleKontrolBackdrop").style.display = "block";
  document.getElementById("elleKontrolModal").style.display = "flex";

  socket.emit("drone_command", {
    command: "manual_control_mode",
    active: true,
    timestamp: Date.now()
  });

  manualControlActive = true;

  // 50 ms'de bir joystick değerlerini gönder
  joystickSendInterval = setInterval(() => {
    if (!socket || !socket.connected || !manualControlActive) return;
    socket.emit("drone_command", {
      command: "joystick_input",
      leftX:  joystickState.left.x,
      leftY:  joystickState.left.y,
      rightX: joystickState.right.x,
      rightY: joystickState.right.y,
      timestamp: Date.now()
    });
  }, 50);
}

function closeElleKontrolModal() {
  document.getElementById("elleKontrolBackdrop").style.display = "none";
  document.getElementById("elleKontrolModal").style.display = "none";

  manualControlActive = false;
  clearInterval(joystickSendInterval);
  joystickSendInterval = null;

  joystickState.left.x  = 0;
  joystickState.left.y  = 0;
  joystickState.right.x = 0;
  joystickState.right.y = 0;

  if (socket && socket.connected) {
    socket.emit("drone_command", {
      command: "manual_control_mode",
      active: false,
      timestamp: Date.now()
    });
  }
}

// Tek joystick için mouse/touch sürükleme mantığı
function initJoystick(baseEl, knobEl, side) {
  const BASE_R  = 80;  // base yarıçapı (px) — joystick-base 160px
  const KNOB_R  = 27;  // knob yarıçapı (px)
  const MAX_D   = BASE_R - KNOB_R; // ~53px

  let dragging = false;

  function getCenter() {
    const r = baseEl.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function applyMove(clientX, clientY) {
    const { cx, cy } = getCenter();
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_D) {
      dx = (dx / dist) * MAX_D;
      dy = (dy / dist) * MAX_D;
    }

    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Y ekseni: ekran yukarısı negatif, dronda gaz yukarısı pozitif → ters çevir
    const nx = parseFloat((dx / MAX_D).toFixed(3));
    const ny = parseFloat((-dy / MAX_D).toFixed(3));
    joystickState[side].x = nx;
    joystickState[side].y = ny;

    const valEl = document.getElementById(side === "left" ? "leftValue" : "rightValue");
    if (valEl) valEl.textContent = `X: ${nx.toFixed(2)} | Y: ${ny.toFixed(2)}`;
  }

  function resetKnob() {
    knobEl.style.transform = "translate(-50%, -50%)";
    joystickState[side].x = 0;
    joystickState[side].y = 0;
    const valEl = document.getElementById(side === "left" ? "leftValue" : "rightValue");
    if (valEl) valEl.textContent = "X: 0.00 | Y: 0.00";
  }

  // --- Mouse ---
  baseEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    baseEl.classList.add("dragging");
    applyMove(e.clientX, e.clientY);
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    applyMove(e.clientX, e.clientY);
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    baseEl.classList.remove("dragging");
    resetKnob();
  });

  // --- Touch ---
  baseEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    dragging = true;
    baseEl.classList.add("dragging");
    const t = e.touches[0];
    applyMove(t.clientX, t.clientY);
  }, { passive: false });

  baseEl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!dragging) return;
    const t = e.touches[0];
    applyMove(t.clientX, t.clientY);
  }, { passive: false });

  baseEl.addEventListener("touchend", () => {
    dragging = false;
    baseEl.classList.remove("dragging");
    resetKnob();
  });
}

function initElleKontrolModal() {
  document.getElementById("elleKontrolKapat").addEventListener("click", closeElleKontrolModal);
  document.getElementById("elleKontrolBackdrop").addEventListener("click", closeElleKontrolModal);

  // Joystick'leri başlat
  initJoystick(
    document.querySelector("#leftJoystick .joystick-base"),
    document.getElementById("leftKnob"),
    "left"
  );
  initJoystick(
    document.querySelector("#rightJoystick .joystick-base"),
    document.getElementById("rightKnob"),
    "right"
  );

  // Hız modu butonları
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.speed;
      document.getElementById("elleKontrolModeLabel").textContent = `MOD: ${mode.toUpperCase()}`;
      if (socket && socket.connected) {
        socket.emit("drone_command", { command: "set_speed_mode", mode, timestamp: Date.now() });
      }
    });
  });

  // Gimbal slider
  const gimbalSlider = document.getElementById("gimbalSlider");
  const gimbalSliderVal = document.getElementById("gimbalSliderVal");
  gimbalSlider.addEventListener("input", () => {
    const angle = parseInt(gimbalSlider.value);
    gimbalSliderVal.textContent = `${angle}°`;
    if (socket && socket.connected) {
      socket.emit("drone_command", { command: "gimbal_pitch", angle, timestamp: Date.now() });
    }
  });

  // Modal içi RTH butonu
  document.getElementById("rthFromManual").addEventListener("click", () => {
    const ok = confirm("İstasyona (home point'e) dönülsün mü?");
    if (!ok) return;
    closeElleKontrolModal();
    if (socket && socket.connected) {
      socket.emit("drone_command", { command: "return_to_home", timestamp: Date.now() });
    }
  });
}
