# Android DJI Drone Uygulaması — Socket.IO Entegrasyon Görevi

Bu belge, mevcut bir Node.js + React web sistemine bağlanacak **Android DJI Mini 4 Pro** uygulamasının Socket.IO entegrasyonunu sıfırdan veya mevcut koda ekleyerek yazman için gereken her şeyi içerir. Backend tamamen hazır ve değiştirilmeyecek. Sadece Android tarafını yazman gerekiyor.

---

## 1. Proje Bağlamı

**Akıllı Kampüs Drone Takip ve Alan Tarama Sistemi.**

- Fırat Üniversitesi kampüsünde DJI Mini 4 Pro drone ile alan taraması yapılıyor.
- Web dashboard (React + AdminLTE) haritada poligon alanlar çiziyor, otomatik boustrophedon (çim biçer) waypoint rotası hesaplayıp drone'a gönderiyor.
- Android uygulama DJI MSDK v5 kullanıyor. Bu uygulama drone'a takılı RC (remote controller) üzerinde çalışıyor.
- Aynı Wi-Fi ağındaki bir PC'de Node.js backend çalışıyor (port 3001).
- Android uygulama hem drone'a komut uygulayan hem de telemetriyi backend'e ileten köprüdür.

---

## 2. Sistem Mimarisi

```
┌──────────────────────────────────────────────────────────────┐
│                     Aynı Wi-Fi Ağı                           │
│                                                              │
│  ┌─────────────────┐    Socket.IO     ┌──────────────────┐  │
│  │  Web Dashboard   │◄────────────────►│  Node.js Backend │  │
│  │  (React/Tarayıcı)│                 │  port 3001        │  │
│  └─────────────────┘                 └────────┬─────────┘  │
│                                               │              │
│                                        Socket.IO             │
│                                               │              │
│                                    ┌──────────▼──────────┐  │
│                                    │   Android App        │  │
│                                    │   (DJI RC üzerinde)  │  │
│                                    └──────────┬──────────┘  │
│                                               │ DJI MSDK v5  │
│                                    ┌──────────▼──────────┐  │
│                                    │   DJI Mini 4 Pro     │  │
│                                    │   Drone              │  │
│                                    └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Veri akışı:**
- Drone → Android (DJI SDK) → Backend (Socket.IO) → Web Dashboard
- Web Dashboard → Backend (Socket.IO) → Android → Drone (DJI SDK)

---

## 3. Bağlantı Kurulumu

### Kütüphane
```kotlin
// build.gradle (app)
implementation("io.socket:socket.io-client:2.1.0") {
    exclude(group = "org.json", module = "json")
}
```

### Bağlantı Kodu (MainActivity.kt)
```kotlin
private val serverUrl = "http://192.168.1.XXX:3001"
// ↑ Backend PC'nin yerel IP'si. ipconfig ile bulunur.
// Değişken veya BuildConfig üzerinden yönetilebilir.

private lateinit var socket: Socket

private fun connectToServer() {
    try {
        val opts = IO.Options().apply {
            transports    = arrayOf("websocket", "polling")
            reconnection  = true
            reconnectionAttempts = Int.MAX_VALUE
            reconnectionDelay = 2000L
            timeout       = 10000L
        }
        socket = IO.socket(serverUrl, opts)
        setupSocketListeners()
        socket.connect()
    } catch (e: Exception) {
        Log.e("Socket", "Bağlantı hatası: ${e.message}")
    }
}
```

### Bağlantı Olayları
```kotlin
private fun setupSocketListeners() {
    socket.on(Socket.EVENT_CONNECT) {
        Log.i("Socket", "Backend'e bağlandı")
        // Drone olarak kayıt ol
        socket.emit("register", JSONObject().apply {
            put("role", "drone")
        })
    }

    socket.on(Socket.EVENT_DISCONNECT) {
        Log.w("Socket", "Bağlantı kesildi — otomatik yeniden bağlanacak")
    }

    socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
        Log.e("Socket", "Bağlantı hatası: ${args[0]}")
    }

    // Backend'den uçuş seansı onayı
    socket.on("session_started") { args ->
        val data = args[0] as JSONObject
        val sessionId = data.getInt("sessionId")
        Log.i("Socket", "Uçuş seansı başladı: ID $sessionId")
        currentSessionId = sessionId
    }

    // Tüm komut dinleyicilerini kur
    setupCommandListener()
}
```

---

## 4. Android → Backend: Telemetri Gönderimi (10 Hz)

Android uygulama her 100ms'de bir aşağıdaki veriyi backend'e gönderir. Backend bu veriyi DB'ye kaydeder ve web dashboard'a iletir.

> **⚠️ Güncelleme talebi — `lat`/`lon` eksik:** Şu anki telemetri payload'ında drone'un GPS konumu (enlem/boylam) yok. Backend/web tarafı, waypoint görevini planlarken rotayı drone'un **gerçek konumuna göre** yönlendirmek için (bkz. §4 waypoint bölümü) bu konuma ihtiyaç duyuyor — bu bilgi olmadan sistem "home" konumunu ancak `drone_photo` event'i geldiğinde öğrenebiliyor (ki o da henüz uygulanmadı). Lütfen `getGpsCoordinates()` gibi bir fonksiyonla `FlightControllerKey.KeyAircraftLocation3D` (veya eşdeğeri) okuyup payload'a `"lat"` ve `"lon"` (WGS-84 derece, `Double`) alanlarını ekleyin.

### Event Adı: `drone_telemetry`

```kotlin
private var telemetryTimer: Timer? = null

fun startTelemetryStream() {
    telemetryTimer = Timer()
    telemetryTimer?.scheduleAtFixedRate(object : TimerTask() {
        override fun run() {
            sendTelemetry()
        }
    }, 0L, 100L) // 100ms = 10 Hz
}

fun stopTelemetryStream() {
    telemetryTimer?.cancel()
    telemetryTimer = null
}

private fun sendTelemetry() {
    if (!socket.connected()) return

    // DJI MSDK v5 ile güncel değerleri oku
    val battery  = getBatteryLevel()    // Int, 0-100
    val gimbal   = getGimbalAngles()    // {pitch, roll, yaw}
    val altitude = getAltitude()        // {agl, amsl}
    val gps      = getGpsStatus()       // {signalLevel, satelliteCount}
    val position = getGpsCoordinates()  // {lat, lon} — YENİ, bkz. uyarı yukarıda

    val payload = JSONObject().apply {
        put("battery", battery)
        put("gimbal", JSONObject().apply {
            put("pitch", gimbal.pitch)
            put("roll",  gimbal.roll)
            put("yaw",   gimbal.yaw)
        })
        put("altitude", JSONObject().apply {
            put("agl",  altitude.agl)   // Yerden yükseklik (metre)
            put("amsl", altitude.amsl)  // Deniz seviyesinden yükseklik
        })
        put("gps", JSONObject().apply {
            put("signalLevel",    gps.signalLevel)    // "WEAK", "MEDIUM", "STRONG"
            put("satelliteCount", gps.satelliteCount) // 0-20+
        })
        put("lat", position.lat)   // YENİ — WGS-84 derece
        put("lon", position.lon)   // YENİ — WGS-84 derece
        put("timestamp", System.currentTimeMillis())
    }

    socket.emit("drone_telemetry", payload)
}
```

### DJI MSDK v5 ile Veri Okuma (Örnek)
```kotlin
// Batarya
private fun getBatteryLevel(): Int {
    return KeyManager.getInstance()
        .getValue(KeyTools.createKey(BatteryKey.KeyChargeRemainingInPercent)) ?: 0
}

// Gimbal açıları
private fun getGimbalAngles(): GimbalData {
    val pitch = KeyManager.getInstance()
        .getValue(KeyTools.createKey(GimbalKey.KeyGimbalAttitudePitch)) ?: 0.0
    val roll = KeyManager.getInstance()
        .getValue(KeyTools.createKey(GimbalKey.KeyGimbalAttitudeRoll)) ?: 0.0
    val yaw = KeyManager.getInstance()
        .getValue(KeyTools.createKey(GimbalKey.KeyGimbalAttitudeYaw)) ?: 0.0
    return GimbalData(pitch.toFloat(), roll.toFloat(), yaw.toFloat())
}

// İrtifa
private fun getAltitude(): AltitudeData {
    val agl = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyAltitude)) ?: 0.0
    val amsl = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyAltitudeFromSeaLevel)) ?: 0.0
    return AltitudeData(agl.toFloat(), amsl.toFloat())
}

// GPS
private fun getGpsStatus(): GpsData {
    val signalLevel = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyGPSSignalLevel))?.name ?: "UNKNOWN"
    val satCount = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyGPSSatelliteCount)) ?: 0
    return GpsData(signalLevel, satCount)
}

// Konum (YENİ — telemetriye eklenmesi istenen alan)
private fun getGpsCoordinates(): PositionData {
    val loc = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyAircraftLocation3D))
    return PositionData(loc?.latitude ?: 0.0, loc?.longitude ?: 0.0)
}
```

---

## 5. Backend → Android: Komut Dinleyicisi

Backend web dashboard'dan gelen her komutu Android'e iletir. Tek bir event üzerinden gelir, `command` alanına göre dallanılır.

### Event Adı: `drone_command`

```kotlin
private fun setupCommandListener() {
    socket.on("drone_command") { args ->
        try {
            val data    = args[0] as JSONObject
            val command = data.getString("command")
            Log.i("DroneCommand", "Komut alındı: $command")

            when (command) {
                "takeoff"          -> handleTakeoff()
                "land"             -> handleLand()
                "hover"            -> handleHover()
                "virtual_stick"    -> handleVirtualStick(data)
                "gimbal_pitch"     -> handleGimbalPitch(data)
                "emergency_land"   -> handleEmergencyLand()
                "waypoint_mission" -> handleWaypointMission(data.getJSONObject("mission"))
                "stop_mission"     -> handleStopMission()
                else               -> Log.w("DroneCommand", "Bilinmeyen komut: $command")
            }
        } catch (e: Exception) {
            Log.e("DroneCommand", "Komut işleme hatası: ${e.message}")
        }
    }

    // Backend veri isteği (opsiyonel)
    socket.on("data_request") { args ->
        val req  = args[0] as JSONObject
        val type = req.optString("type", "all")
        handleDataRequest(type)
    }
}
```

---

## 6. Komut Uygulamaları (DJI MSDK v5)

### 6.1 — TAKEOFF (Kalkış)

```kotlin
private fun handleTakeoff() {
    KeyManager.getInstance().performAction(
        KeyTools.createKey(FlightControllerKey.KeyStartTakeoff),
        null,
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(result: EmptyMsg?) {
                Log.i("DroneCommand", "Takeoff BAŞARILI")
                sendCommandResponse("takeoff", "success")
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Takeoff BAŞARISIZ: ${error.description()}")
                sendCommandResponse("takeoff", "failed", error.description())
            }
        }
    )
}
```

### 6.2 — LAND (Kontrollü İniş)

```kotlin
private fun handleLand() {
    KeyManager.getInstance().performAction(
        KeyTools.createKey(FlightControllerKey.KeyStartAutoLanding),
        null,
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(result: EmptyMsg?) {
                Log.i("DroneCommand", "Landing BAŞARILI")
                sendCommandResponse("land", "success")
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Landing BAŞARISIZ: ${error.description()}")
                sendCommandResponse("land", "failed", error.description())
            }
        }
    )
}
```

### 6.3 — HOVER (Pozisyon Tutma / Askıda Kal)

Virtual stick modundaysa devre dışı bırakarak drone'un o noktada sabitlenmesini sağlar.

```kotlin
private fun handleHover() {
    // Virtual stick aktifse durdur
    if (isVirtualStickEnabled) {
        VirtualStickManager.getInstance().disableVirtualStick(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    isVirtualStickEnabled = false
                    Log.i("DroneCommand", "Hover — pozisyon kilidi aktif")
                    sendCommandResponse("hover", "success")
                }
                override fun onFailure(error: IDJIError) {
                    Log.e("DroneCommand", "Hover hatası: ${error.description()}")
                    sendCommandResponse("hover", "failed", error.description())
                }
            }
        )
    } else {
        // Zaten hover modunda, yine de yanıt gönder
        sendCommandResponse("hover", "success")
    }
}
```

### 6.4 — VIRTUAL STICK (Elle Joystick Kontrolü)

Web arayüzündeki sanal joysticktan **10 Hz** frekansıyla gelir. Her 100ms'de bir çağrılır. Stickler sıfırken drone hover yapar.

```kotlin
private var isVirtualStickEnabled = false

private fun handleVirtualStick(data: JSONObject) {
    val leftStick  = data.getJSONObject("leftStick")
    val rightStick = data.getJSONObject("rightStick")

    // Sol çubuk: Y = throttle (dikey hız), X = yaw (dönüş hızı)
    // Sağ çubuk: Y = pitch (ileri/geri), X = roll (sağ/sol kayma)
    val throttle = leftStick.getDouble("y").toFloat()   // -1.0 .. +1.0
    val yaw      = leftStick.getDouble("x").toFloat()   // -1.0 .. +1.0
    val pitch    = rightStick.getDouble("y").toFloat()  // -1.0 .. +1.0
    val roll     = rightStick.getDouble("x").toFloat()  // -1.0 .. +1.0

    if (!isVirtualStickEnabled) {
        // İlk çağrıda Virtual Stick modunu etkinleştir
        VirtualStickManager.getInstance().enableVirtualStick(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    isVirtualStickEnabled = true
                    configureVirtualStick()
                    sendFlightControlData(throttle, yaw, pitch, roll)
                }
                override fun onFailure(error: IDJIError) {
                    Log.e("VirtualStick", "Etkinleştirme hatası: ${error.description()}")
                }
            }
        )
    } else {
        sendFlightControlData(throttle, yaw, pitch, roll)
    }
}

private fun configureVirtualStick() {
    VirtualStickManager.getInstance().apply {
        setFlightCoordinateSystem(FlightCoordinateSystem.GROUND)
        setRollPitchControlMode(RollPitchControlMode.VELOCITY)
        setYawControlMode(YawControlMode.ANGULAR_VELOCITY)
        setVerticalControlMode(VerticalControlMode.VELOCITY)
    }
}

private fun sendFlightControlData(throttle: Float, yaw: Float, pitch: Float, roll: Float) {
    // Normalize → gerçek birime çevir
    val MAX_HORIZ_MS = 8f    // m/s (yatay hız limiti)
    val MAX_VERT_MS  = 4f    // m/s (dikey hız limiti)
    val MAX_YAW_DS   = 100f  // derece/s (dönüş hız limiti)

    val data = FlightControlData(
        /* pitch    */ pitch    * MAX_HORIZ_MS,
        /* roll     */ roll     * MAX_HORIZ_MS,
        /* yaw      */ yaw      * MAX_YAW_DS,
        /* throttle */ throttle * MAX_VERT_MS
    )

    VirtualStickManager.getInstance().sendVirtualStickFlightControlData(
        data,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() { /* 10 Hz log çok fazla olur — susturulmuş */ }
            override fun onFailure(error: IDJIError) {
                Log.e("VirtualStick", "Veri gönderim hatası: ${error.description()}")
            }
        }
    )
}
```

### 6.5 — GIMBAL PITCH (Kamera Açısı)

Gimbal pitch açısını mutlak açıya (absolute angle) ayarlar.
Aralık: **-90° (dik aşağı) … +30° (yukarı)** — DJI Mini 4 Pro sınırı.

```kotlin
private fun handleGimbalPitch(data: JSONObject) {
    val targetPitch = data.getDouble("pitch").toFloat()

    val rotation = Rotation.Builder()
        .pitch(targetPitch)
        .mode(RotationMode.ABSOLUTE_ANGLE)
        .time(1.5)   // 1.5 saniyede hedefe ulaş
        .build()

    GimbalManager.getInstance().rotate(
        rotation,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.i("DroneCommand", "Gimbal pitch $targetPitch° ayarlandı")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "gimbal_pitch")
                    put("status", "success")
                    put("pitch", targetPitch)
                    put("timestamp", System.currentTimeMillis())
                })
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Gimbal hatası: ${error.description()}")
                sendCommandResponse("gimbal_pitch", "failed", error.description())
            }
        }
    )
}
```

### 6.6 — EMERGENCY LAND (Acil İniş — RTH Olmadan)

Onay yok, hemen bulunduğu yere iner. Eve dönmez.

```kotlin
private fun handleEmergencyLand() {
    // Virtual stick çalışıyorsa durdur
    if (isVirtualStickEnabled) {
        VirtualStickManager.getInstance().disableVirtualStick(null)
        isVirtualStickEnabled = false
    }

    // Anlık otomatik iniş
    KeyManager.getInstance().performAction(
        KeyTools.createKey(FlightControllerKey.KeyStartAutoLanding),
        null,
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(result: EmptyMsg?) {
                Log.i("DroneCommand", "ACİL İNİŞ başlatıldı")
                sendCommandResponse("emergency_land", "success")
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Acil iniş HATASI: ${error.description()}")
                sendCommandResponse("emergency_land", "failed", error.description())
            }
        }
    )
}
```

### 6.7 — WAYPOINT MISSION (Otomatik Alan Tarama)

Web dashboard haritada çizilen poligon alanın boustrophedon (çim biçer) tarama rotasını hesaplayıp Android'e gönderir. Her waypoint için kamera fotoğraf aksiyonu içerir.

#### Alınan Veri Formatı:
```json
{
  "command": "waypoint_mission",
  "mission": {
    "areaId": 3,
    "areaName": "Kuzey Bahçe",
    "altitude": 50,
    "speed": 8,
    "finishAction": "go_home",
    "headingMode": "auto",
    "waypoints": [
      {
        "index": 0,
        "lat": 38.68150000,
        "lon": 39.22050000,
        "altitude": 50,
        "speed": 8,
        "actions": ["shoot_photo"]
      },
      {
        "index": 1,
        "lat": 38.68170000,
        "lon": 39.22120000,
        "altitude": 50,
        "speed": 8,
        "actions": ["shoot_photo"]
      }
    ]
  },
  "savedRouteId": 7,
  "timestamp": 1750000000000
}
```

#### Kotlin Uygulaması:
```kotlin
private fun handleWaypointMission(missionObj: JSONObject) {
    val altitude   = missionObj.getDouble("altitude").toFloat()
    val speed      = missionObj.getDouble("speed").toFloat()
    val areaName   = missionObj.optString("areaName", "Görev")
    val wpArray    = missionObj.getJSONArray("waypoints")
    val totalWP    = wpArray.length()

    Log.i("WaypointMission", "Görev alındı: $areaName, $totalWP WP, ${altitude}m, ${speed}m/s")

    // 1) Waypoint listesini oluştur
    val waypointList = mutableListOf<WaypointV2>()

    for (i in 0 until totalWP) {
        val wp      = wpArray.getJSONObject(i)
        val actions = wp.optJSONArray("actions")

        val waypointActions = mutableListOf<WaypointV2Action>()
        if (actions != null) {
            for (j in 0 until actions.length()) {
                if (actions.getString(j) == "shoot_photo") {
                    val action = WaypointV2Action.Builder()
                        .setActionID(i * 10 + j)
                        .setTriggerParam(
                            WaypointV2AssociateTriggerParam.Builder()
                                .setActionAssociatedType(
                                    WaypointV2AssociateTriggerParam.ActionAssociatedType.SIMULTANEOUSLY_START
                                )
                                .setWaitingTime(0)
                                .setActionIdAssociated(0)
                                .build()
                        )
                        .setActuatorParam(
                            WaypointV2CameraActuatorParam.Builder()
                                .setOperationType(
                                    WaypointV2CameraActuatorParam.OperationType.SHOOT_SINGLE_PHOTO
                                )
                                .build()
                        )
                        .build()
                    waypointActions.add(action)
                }
            }
        }

        val waypoint = WaypointV2.Builder()
            .setCoordinate(
                LocationCoordinate2D(
                    wp.getDouble("lat"),
                    wp.getDouble("lon")
                )
            )
            .setAltitude(wp.optDouble("altitude", altitude.toDouble()).toFloat())
            .setAutoFlightSpeed(wp.optDouble("speed", speed.toDouble()).toFloat())
            .setHeadingMode(WaypointV2.WaypointV2FlightPathMode.GOTO_POINT_STRAIGHT_LINE_AND_STOP)
            .setTurnMode(WaypointV2.WaypointV2TurnMode.CLOCK_WISE)
            .setActions(waypointActions)
            .build()

        waypointList.add(waypoint)
    }

    // 2) Görev konfigürasyonu
    val missionConfig = WaypointV2MissionConfig.Builder()
        .setFinishedAction(WaypointV2MissionConfig.WaypointV2MissionFinishedAction.GO_HOME)
        .setRepeatTimes(1)
        .setMaxFlightSpeed(15f)
        .setAutoFlightSpeed(speed)
        .setExitMissionOnRCSignalLost(true)
        .setGotoFirstWaypointMode(
            WaypointV2MissionConfig.WaypointV2MissionGotoFirstWaypointMode.SAFELY
        )
        .build()

    val mission = WaypointMissionV2.Builder()
        .waypointList(waypointList)
        .waypointCount(waypointList.size)
        .missionConfig(missionConfig)
        .build()

    // 3) Yükle ve başlat
    WaypointMissionManager.getInstance().uploadMission(mission,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.i("WaypointMission", "Görev yüklendi, başlatılıyor...")
                WaypointMissionManager.getInstance().startMission(
                    object : CommonCallbacks.CompletionCallback {
                        override fun onSuccess() {
                            Log.i("WaypointMission", "Görev BAŞLADI!")
                            sendCommandResponse("waypoint_mission", "started")
                            WaypointMissionManager.getInstance()
                                .addMissionStateListener(missionStateListener)
                        }
                        override fun onFailure(error: IDJIError) {
                            sendCommandResponse("waypoint_mission", "failed", error.description())
                        }
                    }
                )
            }
            override fun onFailure(error: IDJIError) {
                Log.e("WaypointMission", "Yükleme hatası: ${error.description()}")
                sendCommandResponse("waypoint_mission", "upload_failed", error.description())
            }
        }
    )
}

// Görev ilerleme dinleyicisi (sınıf değişkeni olarak tanımla)
private val missionStateListener =
    WaypointMissionManager.MissionStateListener { state ->
        val wpIdx = state?.currentWaypointIndex ?: return@MissionStateListener

        // Web dashboard'a ilerleme bildir
        socket.emit("mission_progress", JSONObject().apply {
            put("currentWaypointIndex", wpIdx)
            put("timestamp", System.currentTimeMillis())
        })

        if (state.state == WaypointMissionState.FINISHED) {
            socket.emit("mission_complete", JSONObject().apply {
                put("status", "complete")
                put("timestamp", System.currentTimeMillis())
            })
            Log.i("WaypointMission", "GÖREV TAMAMLANDI — Eve dönülüyor")
            WaypointMissionManager.getInstance()
                .removeMissionStateListener(missionStateListener)
        }
    }
```

### 6.8 — STOP MISSION (Görevi Durdur / RTH)

```kotlin
private fun handleStopMission() {
    WaypointMissionManager.getInstance().stopMission(
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.i("DroneCommand", "Görev durduruldu, eve dönülüyor")
                socket.emit("mission_stopped", JSONObject().apply {
                    put("status", "stopped")
                    put("timestamp", System.currentTimeMillis())
                })
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Durdurma hatası: ${error.description()}")
                sendCommandResponse("stop_mission", "failed", error.description())
            }
        }
    )
}
```

### 6.9 — WAYPOINT FOTOĞRAFI (`drone_photo`)

Her waypoint'te (`actions: ["shoot_photo"]` işaretliyse) fotoğraf çekip küçük bir
JPEG önizlemesini GPS koordinatıyla birlikte web'e gönderir. Web tarafı bunu
zaten dinliyor ve haritada fotoğrafın çekildiği konuma otomatik olarak overlay
basıyor — eksik olan tek şey bu fonksiyonun Android'de tetiklenmesi.

**Ne zaman tetiklenir:** `missionStateListener` içinde waypoint indeksi
değiştiğinde (§6.7'deki `missionStateListener`'ın devamı), o waypoint'in
action listesinde `"shoot_photo"` varsa.

```kotlin
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

private const val CAMERA_INDEX = ComponentIndexType.LEFT_OR_MAIN // Mini 4 Pro tek kamera

/**
 * WP index'e ulaşıldığında çağır (missionStateListener içinden).
 * wpActions: o waypoint'in "actions" listesi — "shoot_photo" içermiyorsa atla.
 *
 * İki güvenlik kontrolü:
 *  1) Drone havada değilse (henüz kalkmadıysa) çekim tamamen atlanır —
 *     kalkış öncesi/kalkış noktasında kötü bir ilk fotoğraf çekilmesini önler.
 *  2) Çekimden önce gimbal her seferinde tekrar nadire (−90°) zorlanır —
 *     transit sırasında düz bakışa dönmüş olsa bile çekim anında düzeltilir.
 */
private fun onWaypointReached(wpIndex: Int, wpActions: List<String>) {
    if ("shoot_photo" !in wpActions) return

    if (!isAircraftFlying()) {
        Log.w("WaypointPhoto", "WP $wpIndex: drone henüz havada değil, çekim atlanıyor")
        return
    }

    aimNadirThenShoot(wpIndex)
}

/**
 * Drone fiilen havada mı? (kalkıştan önceki sahte ilk çekimi engellemek için)
 *
 * GÜNCELLEME: KeyIsFlying güvenilmez çıktı (sürekli false dönüp HİÇBİR
 * waypoint'te çekim tetiklenmemesine yol açtı — sadece kalkıştaki değil,
 * sonraki tüm çekimleri de engelledi). Ayrı bir "isFlying" key'ine güvenmek
 * yerine, telemetride zaten sorunsuz çalışan irtifa okumasını kullanıyoruz.
 */
private fun isAircraftFlying(): Boolean {
    return getAltitude().agl > 1.5f  // ~1.5 m üzeri = havada kabul et
}

/**
 * Çekimden önce gimbal'i mutlak −90° (dik aşağı) açıya döndürür, fiilen o açıya
 * ulaşması için kısa bir ek bekleme yapar, sonra fotoğrafı çeker. §6.5'teki
 * handleGimbalPitch ile aynı Rotation API'sini kullanır ama "bekle + sonra çek"
 * sırasını garanti eder.
 */
private fun aimNadirThenShoot(wpIndex: Int) {
    val rotation = Rotation.Builder()
        .pitch(-90f)
        .mode(RotationMode.ABSOLUTE_ANGLE)
        .time(1.0)  // hızlı dönüş — çekim gecikmesini artırmamak için
        .build()

    GimbalManager.getInstance().rotate(
        rotation,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                // rotate() "başladı" anlamına gelir, fiilen −90°'ye oturması için
                // küçük bir ek bekleme (mekanik gimbal'in son birkaç derecesi yavaş olabilir).
                Handler(Looper.getMainLooper()).postDelayed(
                    { shootPhotoAndSend(wpIndex) }, 400L
                )
            }
            override fun onFailure(error: IDJIError) {
                Log.e("WaypointPhoto", "WP $wpIndex gimbal nadir hatası: ${error.description()} — yine de çekiliyor")
                shootPhotoAndSend(wpIndex)
            }
        }
    )
}

/** 1) Fotoğrafı çek. 2) Kamera işleyip SD karta yazana kadar kısa bekle. 3) Gönder. */
private fun shootPhotoAndSend(wpIndex: Int) {
    val shootKey = KeyTools.createKey(CameraKey.KeyStartShootPhoto, CAMERA_INDEX)

    KeyManager.getInstance().performAction(
        shootKey,
        null,
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(result: EmptyMsg?) {
                Log.i("WaypointPhoto", "WP $wpIndex fotoğraf çekildi, işleniyor…")
                // Kameranın fotoğrafı SD karta yazıp media listesine eklemesi için
                // kısa bir gecikme — cihaza göre 800–1500ms arası ayarlanabilir.
                Handler(Looper.getMainLooper()).postDelayed(
                    { fetchLatestThumbnailAndSend(wpIndex) }, 1200L
                )
            }
            override fun onFailure(error: IDJIError) {
                Log.e("WaypointPhoto", "Fotoğraf çekme hatası: ${error.description()}")
            }
        }
    )
}

/** SD karttaki en son medya dosyasının küçük önizlemesini çekip base64 olarak yollar. */
private fun fetchLatestThumbnailAndSend(wpIndex: Int) {
    val mediaManager = MediaDataCenter.getInstance().mediaManager

    mediaManager.getMediaFileListData(CAMERA_INDEX)?.getData()?.let { files ->
        val latest: MediaFile = files.maxByOrNull { it.timeCreated } ?: run {
            Log.w("WaypointPhoto", "Medya listesi boş, WP $wpIndex fotoğrafı gönderilemedi")
            return
        }

        latest.pullThumbnailFromCamera(object : CommonCallbacks.CompletionCallbackWithParam<Bitmap> {
            override fun onSuccess(bitmap: Bitmap?) {
                if (bitmap == null) return
                sendPhotoPayload(bitmap, wpIndex)
            }
            override fun onFailure(error: IDJIError) {
                Log.e("WaypointPhoto", "Thumbnail indirme hatası: ${error.description()}")
            }
        })
    }
}

/** Bitmap'i sıkıştırıp (~100 KB hedef) GPS/irtifa/heading ile birlikte socket'e yollar. */
private fun sendPhotoPayload(bitmap: Bitmap, wpIndex: Int) {
    val baos = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 60, baos) // kalite 60 → küçük dosya
    val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

    val pos = getGpsCoordinates()      // §4'te tanımlı — {lat, lon}
    val alt = getAltitude()            // §4'te tanımlı — {agl, amsl}
    val heading = KeyManager.getInstance()
        .getValue(KeyTools.createKey(FlightControllerKey.KeyCompassHeading)) ?: 0.0

    socket.emit("drone_photo", JSONObject().apply {
        put("imageBase64", "data:image/jpeg;base64,$base64")
        put("lat", pos.lat)
        put("lon", pos.lon)
        put("altitude", alt.agl)
        put("heading", heading)
        put("timestamp", System.currentTimeMillis())
    })

    Log.i("WaypointPhoto", "WP $wpIndex fotoğrafı gönderildi (${baos.size() / 1024} KB)")
}
```

> **Notlar / dikkat edilmesi gerekenler:**
> - `pullThumbnailFromCamera` yerine cihazınızda `pullPreviewImageFromCamera` da kullanılabilir (biraz daha büyük/kaliteli görsel) — API adı SDK 5.17.0'da farklıysa DJI'nin `MediaFile` sınıfındaki güncel metod imzasını kontrol edin.
> - JPEG kalitesini (`60`) ayarlayarak dosya boyutunu backend yorumundaki **~100 KB** hedefine göre kalibre edin; büyük base64 payload'lar socket.io mesaj boyutu sınırına takılabilir.
> - `missionStateListener`'da her waypoint'in kendi `actions` listesine erişiminiz yoksa, gönderilen `mission.waypoints[]` dizisini bir class-level değişkende saklayıp `wpIndex` ile eşleştirin.
> - `KeyIsFlying` sizin SDK sürümünüzde farklı bir key adıyla geliyorsa (bazı MSDK v5 sürümlerinde `FlightControllerKey.KeyIsFlying` yerine `KeyAircraftIsFlying` olabilir), o karşılığı kullanın — önemli olan mantık: **kalkış tamamlanmadan çekim yapılmaması**.
> - `aimNadirThenShoot`'taki `400L`'lik ek bekleme, gimbal'in mekanik olarak −90°'ye tam oturması için bir tampon — sahada test edip gerekirse 200–800ms arasında ayarlayın.

---

## 7. Android → Backend: Engel Bildirimi (Opsiyonel)

Drone'un kendi sensörleriyle tespit ettiği engelleri backend'e gönderir.

### Event: `obstacle_detected`

```kotlin
fun reportObstacle(lat: Double, lon: Double, radiusM: Float, type: String = "unknown") {
    socket.emit("obstacle_detected", JSONObject().apply {
        put("lat",      lat)
        put("lon",      lon)
        put("radiusM",  radiusM)
        put("type",     type)
        put("timestamp", System.currentTimeMillis())
    })
}
```

---

## 8. Yardımcı Fonksiyon: sendCommandResponse

```kotlin
private fun sendCommandResponse(command: String, status: String, error: String? = null) {
    socket.emit("command_response", JSONObject().apply {
        put("command",   command)
        put("status",    status)
        if (error != null) put("error", error)
        put("timestamp", System.currentTimeMillis())
    })
}
```

---

## 9. Veri İsteklerine Yanıt (data_request)

Backend zaman zaman spesifik veri ister. Android bu isteğe `data_response` ile yanıt verir.

```kotlin
private fun handleDataRequest(type: String) {
    val responseData = when (type) {
        "battery"  -> JSONObject().apply { put("battery", getBatteryLevel()) }
        "gimbal"   -> {
            val g = getGimbalAngles()
            JSONObject().apply {
                put("gimbal", JSONObject().apply {
                    put("pitch", g.pitch); put("roll", g.roll); put("yaw", g.yaw)
                })
            }
        }
        "altitude" -> {
            val a = getAltitude()
            JSONObject().apply {
                put("altitude", JSONObject().apply {
                    put("agl", a.agl); put("amsl", a.amsl)
                })
            }
        }
        "gps"      -> {
            val gps = getGpsStatus()
            JSONObject().apply {
                put("gps", JSONObject().apply {
                    put("signalLevel", gps.signalLevel)
                    put("satelliteCount", gps.satelliteCount)
                })
            }
        }
        else       -> JSONObject().apply {
            val b = getBatteryLevel()
            val g = getGimbalAngles()
            val a = getAltitude()
            val gps = getGpsStatus()
            put("battery", b)
            put("gimbal",   JSONObject().apply { put("pitch",g.pitch); put("roll",g.roll); put("yaw",g.yaw) })
            put("altitude", JSONObject().apply { put("agl",a.agl); put("amsl",a.amsl) })
            put("gps",      JSONObject().apply { put("signalLevel",gps.signalLevel); put("satelliteCount",gps.satelliteCount) })
        }
    }

    socket.emit("data_response", JSONObject().apply {
        put("type",      type)
        put("data",      responseData)
        put("timestamp", System.currentTimeMillis())
    })
}
```

---

## 10. Gerekli Import'ların Tam Listesi

```kotlin
// Socket.IO
import io.socket.client.IO
import io.socket.client.Socket

// JSON
import org.json.JSONObject
import org.json.JSONArray

// DJI MSDK v5 — Temel
import dji.v5.manager.KeyManager
import dji.sdk.keyvalue.key.KeyTools
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.sdk.keyvalue.value.common.EmptyMsg

// DJI MSDK v5 — Uçuş Kontrolü
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.flightcontroller.RollPitchControlMode
import dji.sdk.keyvalue.value.flightcontroller.YawControlMode
import dji.sdk.keyvalue.value.flightcontroller.VerticalControlMode

// DJI MSDK v5 — Virtual Stick
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.v5.manager.aircraft.virtualstick.FlightControlData

// DJI MSDK v5 — Gimbal
import dji.v5.manager.aircraft.gimbal.GimbalManager
import dji.sdk.keyvalue.value.gimbal.Rotation
import dji.sdk.keyvalue.value.gimbal.RotationMode
import dji.sdk.keyvalue.key.GimbalKey

// DJI MSDK v5 — Batarya / GPS
import dji.sdk.keyvalue.key.BatteryKey

// DJI MSDK v5 — Waypoint
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import dji.sdk.wpmz.value.mission.WaypointV2
import dji.sdk.wpmz.value.mission.WaypointMissionV2
import dji.sdk.wpmz.value.mission.WaypointV2Action
import dji.sdk.wpmz.value.mission.WaypointV2AssociateTriggerParam
import dji.sdk.wpmz.value.mission.WaypointV2CameraActuatorParam
import dji.sdk.wpmz.value.mission.WaypointV2MissionConfig
import dji.sdk.wpmz.value.mission.WaypointMissionState

// DJI MSDK v5 — Konum
import dji.sdk.keyvalue.value.common.LocationCoordinate2D

// Android
import android.util.Log
import java.util.Timer
import java.util.TimerTask
```

---

## 11. Tam Socket.IO Event Tablosu

### Android'in DİNLEMESİ gereken eventler (Backend → Android)

| Event | Ne zaman gelir | İçerik |
|---|---|---|
| `drone_command` | Web dashboard'dan herhangi bir komut | `{ command, ...alanlar, timestamp }` |
| `data_request` | Backend veri istediğinde | `{ type: "battery"\|"gimbal"\|"altitude"\|"gps"\|"all" }` |

### Android'in GÖNDERMESİ gereken eventler (Android → Backend)

| Event | Ne zaman gönderilir | İçerik |
|---|---|---|
| `register` | Socket bağlandığında (ilk adım) | `{ role: "drone" }` |
| `drone_telemetry` | Her 100ms'de bir (10 Hz) | `{ battery, gimbal, altitude, gps, timestamp }` |
| `command_response` | Her komut tamamlandığında | `{ command, status, error?, timestamp }` |
| `data_response` | `data_request` alındığında | `{ type, data, timestamp }` |
| `mission_progress` | Görev sırasında her WP'de | `{ currentWaypointIndex, timestamp }` |
| `mission_complete` | Görev tamamlanınca | `{ status: "complete", timestamp }` |
| `mission_stopped` | Görev durdurulunca | `{ status: "stopped", timestamp }` |
| `obstacle_detected` | Engel tespit edilince | `{ lat, lon, radiusM, type, timestamp }` |

---

## 12. Drone Komutları Özet Tablosu

| `command` değeri | Kaynak (kim gönderir) | DJI MSDK v5 Eylemi | `command_response` gerekli mi |
|---|---|---|---|
| `takeoff` | Takeoff butonu | `FlightControllerKey.KeyStartTakeoff` | Evet |
| `land` | Land butonu | `FlightControllerKey.KeyStartAutoLanding` | Evet |
| `hover` | Pozisyon Tut butonu | `VirtualStickManager.disableVirtualStick()` | Evet |
| `virtual_stick` | Joystick (10 Hz) | `VirtualStickManager.sendVirtualStickFlightControlData()` | Hayır (çok sık) |
| `gimbal_pitch` | Gimbal slider | `GimbalManager.rotate(ABSOLUTE_ANGLE)` | Evet |
| `emergency_land` | Acil İniş butonu | `FlightControllerKey.KeyStartAutoLanding` | Evet |
| `waypoint_mission` | Görev Başlat butonu | `WaypointMissionManager.uploadMission()` + `startMission()` | Evet (started/failed) |
| `stop_mission` | Görevi Durdur butonu | `WaypointMissionManager.stopMission()` | `mission_stopped` olarak |

---

## 13. Ağ Yapılandırması

1. **Aynı Wi-Fi:** Android telefon/tablet ve backend PC aynı yerel ağda olmalı.
2. **Backend IP:** PC'de `ipconfig` (Windows) → `IPv4 Address` → kod içine yaz.
3. **Port:** Backend **3001** TCP portunda çalışır.
4. **Firewall:** Windows Defender → Gelişmiş Ayarlar → Gelen Kurallar → TCP 3001 → İzin Ver.
5. **DJI RC Ağı:** DJI RC kumanda USB bağlı değilse telefonun Wi-Fi'si serbest olmalı.

---

## 14. Uygulama Yaşam Döngüsü

```
onCreate()
    ↓
DJI SDK başlatılır (ProductManager, KeyManager, vb.)
    ↓
connectToServer() → socket.connect()
    ↓
EVENT_CONNECT ateşlenir → register { role: "drone" } gönderilir
    ↓
Backend → session_started { sessionId } yanıtı
    ↓
startTelemetryStream() → 10 Hz telemetri gönderimi başlar
    ↓
[ drone_command eventleri dinleniyor ]
    ↓
onDestroy()
    ↓
stopTelemetryStream()
socket.disconnect()
```

---

## 15. Test Akışı

1. PC'de backend başlat: `node backend/app.js`
   - Log: `✅ Backend çalışıyor: http://localhost:3001`

2. Tarayıcıda web dashboard'u aç: `http://localhost:5173`

3. Android uygulamayı başlat (doğru IP ve port ile, aynı Wi-Fi'de).

4. PC backend loglarında görülmesi beklenen:
   ```
   🔌 New connection: [socket_id]
   📱 Drone registered: [socket_id]
   🚁 Flight session started: ID 1
   ```

5. Web dashboard'da telemetri değerlerinin güncellenmesi beklenir.

6. **Takeoff testi:** Web'de "Kalkış" butonuna bas → backend logu:
   ```
   🎮 Drone command from [web_id]: takeoff
   ```
   → Android Logcat: `Takeoff BAŞARILI`

7. **Waypoint Görev testi:** Haritada bir poligon çiz → "Rota Hesapla" → "Görevi Gönder" → Android Logcat: `Görev BAŞLADI!` → Web'de progress bar dolmaya başlar.

8. **Joystick testi:** "Elle Kontrol" panelini aç → joystick'i hareket ettir → Android Logcat'te `virtual_stick` gönderim logları görülür.

---

## 16. Önemli Notlar

- `virtual_stick` event'i **çok sık** gelir (10 Hz). Bu event için `command_response` gönderme, sadece yeterli sıklıkta log tut.
- Virtual stick aktifken `waypoint_mission` veya `hover` gelirse, önce `VirtualStickManager.disableVirtualStick()` çağırılmalı.
- `emergency_land`, `land` ile aynı DJI API çağrısını kullanır fakat onay beklenmez ve virtual stick durdurulur.
- Waypoint görevinde her waypoint geçilince `mission_progress` gönderilmesi web'deki progress bar'ı günceller.
- Drone bağlantısı kesilirse backend otomatik olarak `session_ended` eventi web'e gönderir, uçuş seansını kapatır.
- Backend CORS tamamen açık (`*`), socket bağlantısı için herhangi bir auth token gerekmez.

---

## 17. Uçuş Sonrası Fotoğraf Yükleme (Toplu YOLO Çöp Sınıflandırması)

Bu, §6.9'daki (waypoint fotoğrafı) akıştan **ayrı ve ek** bir özellik.
§6.9'da her waypoint'te çekilen fotoğrafın küçük bir **thumbnail**'i
`drone_photo` ile canlı harita önizlemesi için gönderiliyordu. Bu bölüm,
**iniş sonrası**, o uçuşta çekilen fotoğrafların **orijinal/tam
çözünürlüklü** SD kart dosyalarını sunucuya HTTP ile yükleyip YOLO tabanlı
çöp sınıflandırması (kağıt/cam/plastik/metal/diğer) yapılmasını sağlıyor.

### Ne zaman tetiklenir

`mission_complete` gönderildikten (ya da iniş onaylandıktan) sonra,
Android o uçuşta çekilen tüm fotoğrafları tek tek yükler. **Analizi
Android tetiklemez** — web dashboard'daki "Fotoğrafları Analiz Et"
butonu tetikler (rapor oluşturmayla aynı, kullanıcı kontrollü desen).
Android'in tek görevi: fotoğrafları güvenilir şekilde sunucuya taşımak.

### Endpoint

```
POST http://<backend-ip>:3001/api/photos/upload
Content-Type: multipart/form-data

file          — orijinal JPEG (SD karttan, thumbnail DEĞİL)
sessionId     — o uçuşun session id'si (session_started'tan gelen)
areaId        — (opsiyonel) taranan alanın id'si
lat           — fotoğrafın çekildiği enlem
lon           — fotoğrafın çekildiği boylam
altitude      — AGL irtifa (metre)
heading       — pusula yönü (derece)
capturedAt    — çekim zamanı (Unix ms)
```

Yanıt (201): kaydedilen `photos` satırı, `{ id, session_id, file_path, ... }`.

### Orijinal dosyayı SD karttan indirme

§6.9'daki `fetchLatestThumbnailAndSend`'de `pullThumbnailFromCamera`
kullanılmıştı (küçük önizleme). Bu sefer **tam boyutlu** dosya
gerekiyor — DJI MSDK v5'in `MediaFile` sınıfında buna karşılık gelen
metod muhtemelen `pullOriginalMediaFileFromCamera` (indirme ilerlemesini
bir callback ile bildiren, birkaç MB'lık gerçek dosya transferi
yapan bir metod) — **kesin metod adı ve imzası MSDK 5.17.0
dokümantasyonunda teyit edilmeli**, önceki notlarımızdaki gibi bir
belirsizlik bu da.

```kotlin
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

private val httpClient = OkHttpClient()
private const val BACKEND_UPLOAD_URL = "http://192.168.1.XXX:3001/api/photos/upload"

/**
 * Uçuş sonrası çağrılır — o session'da çekilen tüm fotoğrafları sırayla yükler.
 * capturedPhotos: her waypoint'te (§6.9) toplanan {file, lat, lon, altitude, heading, timestamp} listesi.
 */
private fun uploadFlightPhotos(sessionId: Int, capturedPhotos: List<CapturedPhoto>) {
    capturedPhotos.forEach { photo ->
        uploadSinglePhoto(sessionId, photo)
    }
}

private fun uploadSinglePhoto(sessionId: Int, photo: CapturedPhoto) {
    val file = File(photo.localFilePath)
    if (!file.exists()) {
        Log.w("PhotoUpload", "Dosya bulunamadı, atlanıyor: ${photo.localFilePath}")
        return
    }

    val body = MultipartBody.Builder()
        .setType(MultipartBody.FORM)
        .addFormDataPart("file", file.name, file.asRequestBody("image/jpeg".toMediaType()))
        .addFormDataPart("sessionId", sessionId.toString())
        .addFormDataPart("lat", photo.lat.toString())
        .addFormDataPart("lon", photo.lon.toString())
        .addFormDataPart("altitude", photo.altitude.toString())
        .addFormDataPart("heading", photo.heading.toString())
        .addFormDataPart("capturedAt", photo.timestamp.toString())
        .build()

    val request = Request.Builder().url(BACKEND_UPLOAD_URL).post(body).build()

    httpClient.newCall(request).execute().use { response ->
        if (response.isSuccessful) {
            Log.i("PhotoUpload", "Yüklendi: ${file.name}")
        } else {
            Log.e("PhotoUpload", "Yükleme hatası (${response.code}): ${file.name}")
        }
    }
}
```

> **Notlar:**
> - Bu senkron (`execute()`) çağrı örneği basitlik için — gerçek uygulamada
>   bir arka plan thread/coroutine içinde çalıştırılmalı, ana thread'i
>   bloklamamalı.
> - `OkHttpClient` projede zaten yoksa eklenmesi gerekir (`com.squareup.okhttp3:okhttp`)
>   — ya da Android'in `HttpURLConnection`'ı ile eşdeğer bir multipart
>   istek de kurulabilir.
> - Yükleme başarısız olursa (ağ kopması vb.) o fotoğraf kaybolur —
>   isterseniz basit bir retry (2-3 deneme) eklenebilir, backend idempotent
>   değil (her başarılı istek yeni bir `photos` satırı oluşturur).
> - Analiz endpoint'i (`POST /api/photos/sessions/:id/classify`) Android
>   tarafından çağrılmaz, sadece web dashboard'dan tetiklenir.

---

## 18. Fotoğraf Mozaiği — Kenar Kenara Yoğun Waypoint'ler

**Ayrı bir belgeye taşındı:** [`ANDROID_MOSAIC_UPDATE.md`](./ANDROID_MOSAIC_UPDATE.md)

Sunucu tarafında (`waypointPlanner.service.js`) yapılan bir değişikliği
ve Android'de kontrol edilmesi/değişmesi gereken 5 maddeyi (DJI waypoint
limiti, çekim temposu, gimbal tutarlılığı, toplu yükleme hacmi, heading)
özetliyor — bağımsız, Android geliştiriciye doğrudan iletilebilecek bir
belge olması için burada tekrar etmiyoruz, güncel kaynak orada.
