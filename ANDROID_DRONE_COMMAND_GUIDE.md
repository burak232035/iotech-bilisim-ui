# Android App - drone_command Entegrasyonu

Bu belge, Android drone uygulamasina `drone_command` destegi eklemek icin yapilmasi gereken degisiklikleri aciklar. Backend tarafi **zaten hazir** — sadece Android tarafi guncellenmeli.

---

## Sorun

Web dashboard'daki "Kalkis (Takeoff)" ve "Inis (Land)" butonlari backend'e komut gonderiyor. Backend bu komutu `drone_command` eventi olarak drone client'lara iletiyor. **Ancak Android app bu eventi dinlemiyor**, bu yuzden komutlar drone'a ulasmiyor.

### Mevcut Akis (Eksik)
```
Web Butonu → Backend(3001) → drone_command → ??? (Android dinlemiyor)
```

### Hedef Akis
```
Web Butonu → Backend(3001) → drone_command → Android App → DJI SDK → Drone Kalkis/Inis
```

---

## Degisiklik 1: Port Guncellemesi

**Dosya:** `MainActivity.kt` — satir 42 civari

Android app su anda port `3000`'e baglanmaya calisiyor, ama backend port `3001`'de calisiyor.

```kotlin
// ESKI:
private val serverUrl = "http://192.168.1.105:3000"

// YENI (backend portuna uyumlu):
private val serverUrl = "http://<BACKEND_PC_IP>:3001"
```

> **Not:** `<BACKEND_PC_IP>` yerine backend bilgisayarinin yerel IP adresini yaz. Backend bilgisayarinda `ipconfig` komutuyla bulunabilir. Ornek: `192.168.1.105`

---

## Degisiklik 2: `drone_command` Listener Eklenmesi

**Dosya:** `MainActivity.kt` — socket baglantisinin kuruldugu bolum

Mevcut `socket.on("data_request")` blogundan **sonra** asagidaki kodu ekle:

```kotlin
// Web dashboard'dan gelen drone komutlarini dinle (takeoff, land, vb.)
socket.on("drone_command") { args ->
    try {
        val data = args[0] as JSONObject
        val command = data.getString("command")

        Log.i("DroneCommand", "Komut alindi: $command")

        when (command) {
            "takeoff" -> {
                KeyManager.getInstance().performAction(
                    KeyTools.createKey(FlightControllerKey.KeyStartTakeoff),
                    null,
                    object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
                        override fun onSuccess(result: EmptyMsg?) {
                            Log.i("DroneCommand", "Takeoff BASARILI")
                            // Backend'e basari bildirimi gonder
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "takeoff")
                                put("status", "success")
                                put("timestamp", System.currentTimeMillis())
                            })
                        }
                        override fun onFailure(error: IDJIError) {
                            Log.e("DroneCommand", "Takeoff BASARISIZ: ${error.description()}")
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "takeoff")
                                put("status", "failed")
                                put("error", error.description())
                                put("timestamp", System.currentTimeMillis())
                            })
                        }
                    }
                )
            }
            "land" -> {
                KeyManager.getInstance().performAction(
                    KeyTools.createKey(FlightControllerKey.KeyStartAutoLanding),
                    null,
                    object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
                        override fun onSuccess(result: EmptyMsg?) {
                            Log.i("DroneCommand", "Landing BASARILI")
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "land")
                                put("status", "success")
                                put("timestamp", System.currentTimeMillis())
                            })
                        }
                        override fun onFailure(error: IDJIError) {
                            Log.e("DroneCommand", "Landing BASARISIZ: ${error.description()}")
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "land")
                                put("status", "failed")
                                put("error", error.description())
                                put("timestamp", System.currentTimeMillis())
                            })
                        }
                    }
                )
            }
            "waypoint_mission" -> {
                val missionObj = data.getJSONObject("mission")
                handleWaypointMission(missionObj)
            }
            "stop_mission" -> {
                WaypointMissionManager.getInstance().stopMission(object : CommonCallbacks.CompletionCallback {
                    override fun onSuccess() {
                        Log.i("DroneCommand", "Gorev durduruldu, eve donuluyor")
                        socket.emit("mission_stopped", JSONObject().apply {
                            put("status", "stopped")
                            put("timestamp", System.currentTimeMillis())
                        })
                    }
                    override fun onFailure(error: IDJIError) {
                        Log.e("DroneCommand", "Durdurma hatasi: ${error.description()}")
                    }
                })
            }
            else -> {
                Log.w("DroneCommand", "Bilinmeyen komut: $command")
            }
        }
    } catch (e: Exception) {
        Log.e("DroneCommand", "Komut isleme hatasi: ${e.message}")
    }
}
```

### Gerekli Import'lar

```kotlin
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import dji.sdk.keyvalue.key.KeyTools
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import dji.sdk.wpmz.value.mission.WaypointV2
import dji.sdk.wpmz.value.mission.WaypointMissionV2
import dji.sdk.wpmz.value.mission.WaypointV2Action
import dji.sdk.wpmz.value.mission.WaypointV2AssociateTriggerParam
import dji.sdk.wpmz.value.mission.WaypointV2CameraActuatorParam
import dji.sdk.wpmz.value.mission.WaypointV2MissionConfig
import org.json.JSONObject
import org.json.JSONArray
```

---

## Degisiklik 3: Waypoint Gorevi (handleWaypointMission)

Web dashboard'daki **Waypoint Gorev Planlayici** paneli bir alan secilip "Gorevi Drone'a Gonder" 
butonuna basildiginda backend asagidaki event'i drone'a iletir.

### Alinan Event Formati

**Event:** `drone_command`

```json
{
  "command": "waypoint_mission",
  "mission": {
    "areaId": 1,
    "areaName": "Kuzey Bahce",
    "altitude": 50,
    "speed": 8,
    "finishAction": "go_home",
    "headingMode": "auto",
    "waypoints": [
      { "index": 0, "lat": 38.6815, "lon": 39.2198, "altitude": 50, "speed": 8, "actions": ["shoot_photo"] },
      { "index": 1, "lat": 38.6817, "lon": 39.2205, "altitude": 50, "speed": 8, "actions": ["shoot_photo"] }
    ]
  },
  "savedRouteId": 3,
  "timestamp": 1750000000000
}
```

### handleWaypointMission Fonksiyonu (MainActivity.kt'ye ekle)

```kotlin
private fun handleWaypointMission(missionObj: JSONObject) {
    val altitude  = missionObj.getDouble("altitude").toFloat()
    val speed     = missionObj.getDouble("speed").toFloat()
    val areaName  = missionObj.optString("areaName", "Gorev")
    val wpArray   = missionObj.getJSONArray("waypoints")

    Log.i("WaypointMission", "Gorev alindi: $areaName, ${wpArray.length()} waypoint, ${altitude}m, ${speed}m/s")

    // 1) Waypoint listesini olustur
    val waypointList = mutableListOf<WaypointV2>()
    for (i in 0 until wpArray.length()) {
        val wp = wpArray.getJSONObject(i)
        val actions = wp.optJSONArray("actions")

        // Waypoint'e kamera aksiyonu ekle (her noktada foto cek)
        val waypointActions = mutableListOf<WaypointV2Action>()
        if (actions != null) {
            for (j in 0 until actions.length()) {
                if (actions.getString(j) == "shoot_photo") {
                    val shootAction = WaypointV2Action.Builder()
                        .setActionID(i)
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
                    waypointActions.add(shootAction)
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

    // 2) Mission konfigurasyonunu olustur
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

    // 3) Gorevi yukle ve baslat
    WaypointMissionManager.getInstance().apply {

        // Once gorev yuklenir
        uploadMission(
            WaypointMissionV2.Builder()
                .waypointList(waypointList)
                .waypointCount(waypointList.size)
                .missionConfig(missionConfig)
                .build(),
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    Log.i("WaypointMission", "Gorev yuklendi, baslatiliyor...")

                    // Sonra baslatilir
                    startMission(object : CommonCallbacks.CompletionCallback {
                        override fun onSuccess() {
                            Log.i("WaypointMission", "Gorev BASLADI!")
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "waypoint_mission")
                                put("status", "started")
                                put("waypointCount", wpArray.length())
                                put("timestamp", System.currentTimeMillis())
                            })

                            // Ilerleme dinleyicisi ekle
                            addMissionStateListener(missionProgressListener)
                        }
                        override fun onFailure(error: IDJIError) {
                            Log.e("WaypointMission", "Baslatilamadi: ${error.description()}")
                            socket.emit("command_response", JSONObject().apply {
                                put("command", "waypoint_mission")
                                put("status", "failed")
                                put("error", error.description())
                                put("timestamp", System.currentTimeMillis())
                            })
                        }
                    })
                }
                override fun onFailure(error: IDJIError) {
                    Log.e("WaypointMission", "Yuklenemedi: ${error.description()}")
                    socket.emit("command_response", JSONObject().apply {
                        put("command", "waypoint_mission")
                        put("status", "upload_failed")
                        put("error", error.description())
                        put("timestamp", System.currentTimeMillis())
                    })
                }
            }
        )
    }
}
```

### Ilerleme Dinleyicisi (Mission Progress Listener)

Bu dinleyiciyi sinif degiskeni olarak tanimla, constructor veya onCreate'de baslat:

```kotlin
private val missionProgressListener =
    WaypointMissionManager.MissionStateListener { state ->
        val wpIdx = state?.currentWaypointIndex ?: return@MissionStateListener

        // Web dashboard'a ilerleme bildir
        socket.emit("mission_progress", JSONObject().apply {
            put("currentWaypointIndex", wpIdx)
            put("timestamp", System.currentTimeMillis())
        })

        Log.d("WaypointMission", "Waypoint: $wpIdx")

        // Gorev tamamlandi mi?
        if (state.state == WaypointMissionState.FINISHED) {
            socket.emit("mission_complete", JSONObject().apply {
                put("status", "complete")
                put("timestamp", System.currentTimeMillis())
            })
            Log.i("WaypointMission", "GOREV TAMAMLANDI - Eve donuluyor")
            WaypointMissionManager.getInstance().removeMissionStateListener(missionProgressListener)
        }
    }
```

---

## Degisiklik 4: Elle Kontrol Komutlari (hover, virtual_stick, gimbal_pitch, emergency_land)

Asagidaki `when` bloklari mevcut `drone_command` listener'inin `when (command)` anahtarina eklenecek.

### 4a — Hover (Pozisyon Tutma)

```kotlin
"hover" -> {
    // Virtual Stick'i devre disi birak ve pozisyon tutma moduna gec
    VirtualStickManager.getInstance().disableVirtualStick(
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.i("DroneCommand", "Hover - pozisyon tutma aktif")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "hover")
                    put("status", "success")
                    put("timestamp", System.currentTimeMillis())
                })
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Hover hatasi: ${error.description()}")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "hover")
                    put("status", "failed")
                    put("error", error.description())
                    put("timestamp", System.currentTimeMillis())
                })
            }
        }
    )
}
```

### 4b — Virtual Stick (Elle Yön Kontrolü)

Elle kontrol modunda web arayüzündeki joysticktan 10 Hz frekansiyla gelen sanal joystick verisi.

```kotlin
"virtual_stick" -> {
    val leftStick  = data.getJSONObject("leftStick")
    val rightStick = data.getJSONObject("rightStick")

    val throttle = leftStick.getDouble("y").toFloat()   // -1..+1  (asagi/yukari)
    val yaw      = leftStick.getDouble("x").toFloat()   // -1..+1  (sola/saga donus)
    val pitch    = rightStick.getDouble("y").toFloat()  // -1..+1  (ileri/geri)
    val roll     = rightStick.getDouble("x").toFloat()  // -1..+1  (sol/sag kayma)

    // Virtual stick aktif degilse etkinlestir
    if (!VirtualStickManager.getInstance().isVirtualStickEnabled) {
        VirtualStickManager.getInstance().enableVirtualStick(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    Log.d("VirtualStick", "Virtual stick etkinlestirildi")
                    sendVirtualStickData(throttle, yaw, pitch, roll)
                }
                override fun onFailure(error: IDJIError) {
                    Log.e("VirtualStick", "Etkinlestirme hatasi: ${error.description()}")
                }
            }
        )
    } else {
        sendVirtualStickData(throttle, yaw, pitch, roll)
    }
}
```

```kotlin
// sendVirtualStickData yardimci fonksiyonu (MainActivity.kt'ye ekle)
private fun sendVirtualStickData(throttle: Float, yaw: Float, pitch: Float, roll: Float) {
    // DJI Mini 4 Pro icin varsayilan modlar:
    //   Throttle: Velocity (dikey hiz, -4..+4 m/s)
    //   Yaw:      AngularVelocity (-100..+100 derece/s)
    //   Pitch:    Velocity (-15..+15 m/s)
    //   Roll:     Velocity (-15..+15 m/s)

    val MAX_VERT_SPEED = 4f
    val MAX_YAW_SPEED  = 100f
    val MAX_HORIZ_SPEED = 8f  // m/s

    VirtualStickManager.getInstance().setFlightCoordinateSystem(
        FlightCoordinateSystem.GROUND   // dunya koordinat sistemi
    )
    VirtualStickManager.getInstance().setRollPitchControlMode(
        RollPitchControlMode.VELOCITY
    )
    VirtualStickManager.getInstance().setYawControlMode(
        YawControlMode.ANGULAR_VELOCITY
    )
    VirtualStickManager.getInstance().setVerticalControlMode(
        VerticalControlMode.VELOCITY
    )

    val flightControlData = FlightControlData(
        /* pitch    */ pitch    * MAX_HORIZ_SPEED,
        /* roll     */ roll     * MAX_HORIZ_SPEED,
        /* yaw      */ yaw      * MAX_YAW_SPEED,
        /* throttle */ throttle * MAX_VERT_SPEED
    )

    VirtualStickManager.getInstance().sendVirtualStickFlightControlData(
        flightControlData,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() { /* 10 Hz - log erisimi kapatilmis */ }
            override fun onFailure(error: IDJIError) {
                Log.e("VirtualStick", "Gonderim hatasi: ${error.description()}")
            }
        }
    )
}
```

### 4c — Gimbal Pitch (Kamera Acisi)

```kotlin
"gimbal_pitch" -> {
    val targetPitch = data.getDouble("pitch").toFloat()   // -90.0 .. +30.0 derece

    val rotation = Rotation.Builder()
        .pitch(targetPitch)
        .mode(RotationMode.ABSOLUTE_ANGLE)
        .time(1.5)  // saniye icinde hedefe ulas
        .build()

    GimbalManager.getInstance().rotate(
        rotation,
        object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.i("DroneCommand", "Gimbal pitch $targetPitch° ayarlandi")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "gimbal_pitch")
                    put("status", "success")
                    put("pitch", targetPitch)
                    put("timestamp", System.currentTimeMillis())
                })
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Gimbal hatasi: ${error.description()}")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "gimbal_pitch")
                    put("status", "failed")
                    put("error", error.description())
                    put("timestamp", System.currentTimeMillis())
                })
            }
        }
    )
}
```

### 4d — Emergency Land (Acil Inis — RTH OLMADAN)

Drone bulundugu yere hemen iner, eve donmez.

```kotlin
"emergency_land" -> {
    // Once Virtual Stick'i devre disi birak
    VirtualStickManager.getInstance().disableVirtualStick(null)

    // Hemen bulundugu yere otomatik inis
    KeyManager.getInstance().performAction(
        KeyTools.createKey(FlightControllerKey.KeyStartAutoLanding),
        null,
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(result: EmptyMsg?) {
                Log.i("DroneCommand", "ACIL INIS baslatildi")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "emergency_land")
                    put("status", "success")
                    put("timestamp", System.currentTimeMillis())
                })
            }
            override fun onFailure(error: IDJIError) {
                Log.e("DroneCommand", "Acil inis HATASI: ${error.description()}")
                socket.emit("command_response", JSONObject().apply {
                    put("command", "emergency_land")
                    put("status", "failed")
                    put("error", error.description())
                    put("timestamp", System.currentTimeMillis())
                })
            }
        }
    )
}
```

### Ekstra Import'lar (4. degisiklik icin)

```kotlin
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.v5.manager.aircraft.virtualstick.FlightControlData
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.flightcontroller.RollPitchControlMode
import dji.sdk.keyvalue.value.flightcontroller.YawControlMode
import dji.sdk.keyvalue.value.flightcontroller.VerticalControlMode
import dji.v5.manager.aircraft.gimbal.GimbalManager
import dji.sdk.keyvalue.value.gimbal.Rotation
import dji.sdk.keyvalue.value.gimbal.RotationMode
```

---

## Backend'in Gonderdigi Event Formati (Ozet)

**Event:** `drone_command`

| `command` degeri | Aciklama | Ek alanlar |
|-----------------|----------|------------|
| `takeoff` | Drone kalkis yapar | — |
| `land` | Kontrollü inis | — |
| `hover` | Olduğu yerde askıda kal | — |
| `virtual_stick` | Sanal joystick verisi (10 Hz) | `leftStick:{x,y}`, `rightStick:{x,y}` |
| `gimbal_pitch` | Kamera açısı ayarla | `pitch: number (-90..+30)` |
| `emergency_land` | Hemen in (RTH yok) | — |
| `waypoint_mission` | Boustrophedon tarama gorevi | `mission:{...}` |
| `stop_mission` | Aktif gorev durdur, RTH | — |

**Drone yanıt eventi:** `command_response`

```json
{
  "command": "hover",
  "status": "success",
  "timestamp": 1750000000000
}
```

---

## Elle Kontrol Modu — Yasam Dongusu

```
Web "Elle Kontrol" aç
    ↓
virtual_stick { x:0, y:0, ... }  ← 10 Hz (boş değerler = hover)
    ↓
Kullanıcı joystick hareket ettirir
    ↓
virtual_stick { x:0.8, y:0.3, ... }  ← hareket komutu
    ↓
Bırakır → virtual_stick { x:0, y:0 }  ← tekrar hover
    ↓
"Pozisyon Tut" → hover komutu → VirtualStick devre dışı → drone sabitlenir
    ↓
"Gimbal" → gimbal_pitch { pitch: -45 } → GimbalManager.rotate(...)
    ↓
"ACİL İNİŞ" → emergency_land → AutoLanding başlar
```

---

## Ag Yapilndirmasi (Onemli)

1. **Ayni Wi-Fi:** Android telefon ve backend PC ayni Wi-Fi aginda olmali
2. **Backend IP:** Backend PC'de `ipconfig` calistirip IPv4 adresini bul
3. **Firewall:** Windows Firewall'da TCP port **3001** icin gelen baglantiya izin ver:
   - Windows Defender Firewall → Gelismis Ayarlar → Gelen Kurallar → Yeni Kural
   - Port → TCP → 3001 → Baglantiya Izin Ver
4. **DJI RC:** USB baglantili kumanda kullaniliyorsa, telefonun Wi-Fi'si backend icin musait olmali

---

## Test Adimlari

1. Backend PC'de backend'i baslat: `node backend/app.js`
2. Web dashboard'u tarayicida ac
3. Android app'i calistir (ayni Wi-Fi'de, dogru IP ve port ile)
4. Backend loglarinda su mesaji gor:
   ```
   Auto-registering [socket_id] as drone (received telemetry)
   ```
5. Web dashboard'da telemetri verilerinin geldigini dogrula
6. Web dashboard'da **"Takeoff"** butonuna bas
7. Backend loglarinda su mesaji gor:
   ```
   Drone command from [web_socket_id]: takeoff
   ```
8. Android Logcat'te su mesaji gor:
   ```
   DroneCommand: Komut alindi: takeoff
   DroneCommand: Takeoff BASARILI
   ```
9. Drone'un kalkis yaptigini gozlemle

---

## Ozet

| Ne | Nerede | Degisiklik |
|----|--------|-----------|
| Port | `MainActivity.kt` satir ~42 | `3000` → `3001` |
| Listener | `MainActivity.kt` socket bolumu | `drone_command` listener ekle |
| Firewall | Backend PC | TCP 3001 izin ver |
| Backend | Degisiklik yok | Zaten hazir |
