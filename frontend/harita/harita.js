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

  const feature = layer.toGeoJSON?.();
  const geom = feature?.geometry;

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
    selectedAreaLayer = null;
    selectedAreaDbId = null;
    refreshStylesAndLabels();
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
});

// ======================
// RAPOR (PDF) - SEÇİLİ ALANI BACKEND’E GÖNDER
// ======================
function initReportButton() {
  const raporBtn = document.getElementById("raporOlusturBtn");
  const raporDurum = document.getElementById("raporDurum");

  if (!raporBtn) return;

  raporBtn.addEventListener("click", async () => {
    try {
      const points = getPointsFromLayer(selectedAreaLayer);

      if (!points || points.length < 3) {
        alert("Lütfen rapor için bir alan seç (lejantdaki alana tıkla veya haritada alanın üstüne tıkla).");
        return;
      }

      raporBtn.disabled = true;
      raporBtn.textContent = "Rapor oluşturuluyor...";
      if (raporDurum) {
        raporDurum.className = "text-muted";
        raporDurum.textContent = "Seçili alan backend’e gönderildi. PDF hazırlanıyor...";
      }

      const res = await fetch(REPORT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId, // ✅ gerçek telemetri verisi için
          areaId: selectedAreaDbId, // ✅ alan bazlı rapor için
          points,
          options: {
            includeBattery: true,
            includeFlightTime: true
          }
        })
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Backend hata: ${res.status} ${t}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "rapor.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      if (raporDurum) {
        raporDurum.className = "text-success";
        raporDurum.textContent = "PDF indirildi ✅";
      }
    } catch (err) {
      console.error(err);
      if (raporDurum) {
        raporDurum.className = "text-danger";
        raporDurum.textContent = "PDF oluşturulamadı. Backend çalışıyor mu? (localhost:3001)";
      }
      alert("PDF oluşturulamadı. Backend çalışıyor mu? (localhost:3001)");
    } finally {
      raporBtn.disabled = false;
      raporBtn.textContent = "Rapor Oluştur (PDF)";
    }
  });
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
function startScan() { alert("Alan tarama başlatıldı (demo)."); }
function returnToStation() { alert("Drone istasyona çağrıldı (demo)."); }
function manualControl() { alert("Elle kontrol modu açıldı (demo)."); }
