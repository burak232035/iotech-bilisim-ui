// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// API Endpoints
export const API_ENDPOINTS = {
  AREAS:          '/api/areas',
  SESSIONS:       '/api/sessions',
  TELEMETRY:      '/api/telemetry',
  REPORTS:        '/api/reports/generate',
  MISSION_PLAN:   '/api/mission/plan',
  MISSION_START:  '/api/mission/start',
  MISSION_STOP:   '/api/mission/stop',
  MISSION_STATUS: '/api/mission/status',
  PHOTOS_UPLOAD:     '/api/photos/upload',
  PHOTOS_CLASSIFY:   (sessionId) => `/api/photos/sessions/${sessionId}/classify`,
  CLASSIFY_STATUS:   (jobId) => `/api/photos/classify/status/${jobId}`,
  SESSION_DETECTIONS: (sessionId) => `/api/photos/sessions/${sessionId}/detections`,
  AREA_DETECTIONS:    (areaId) => `/api/photos/areas/${areaId}/detections`,
  LANDCOVER_ANALYZE: (sessionId) => `/api/landcover/sessions/${sessionId}/analyze`,
  LANDCOVER_STATUS:  (jobId) => `/api/landcover/status/${jobId}`,
  LANDCOVER_RESULT:  (sessionId) => `/api/landcover/sessions/${sessionId}`
};

// Map Configuration
export const MAP_CONFIG = {
  CENTER: [38.6811, 39.2203], // Fırat Üniversitesi Mühendislik Fakültesi
  ZOOM: 16,
  TILE_LAYER: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  MAX_ZOOM: 19
};

// Color Palette for Areas (8 colors, rotating)
export const AREA_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#f59e0b', // amber
  '#9333ea', // purple
  '#0ea5e9', // sky
  '#ea580c', // orange
  '#64748b'  // slate
];

// Waste category colors (map markers + report)
export const WASTE_CATEGORY_COLORS = {
  'kağıt':   '#a16207', // brown
  'cam':     '#0ea5e9', // sky
  'plastik': '#eab308', // yellow
  'metal':   '#64748b', // slate
  'geri dönüştürülemez': '#71717a', // gray
  'organik': '#65a30d'  // olive green
};

// Land-cover colors (green/concrete ratio card)
export const LANDCOVER_COLORS = {
  green:    '#16a34a',
  concrete: '#78716c'
};

// Telemetry Thresholds
export const BATTERY_THRESHOLDS = {
  LOW: 20,
  MEDIUM: 50
};

export const SCAN_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 70
};

// Demo Credentials (will be replaced with real auth)
export const DEMO_CREDENTIALS = {
  USERNAME: 'admin',
  PASSWORD: 'admin123'
};

// Socket.IO Events
export const SOCKET_EVENTS = {
  CONNECT:          'connect',
  DISCONNECT:       'disconnect',
  REGISTER:         'register',
  DRONE_TELEMETRY:  'drone_telemetry',
  DATA_REQUEST:     'data_request',
  DATA_RESPONSE:    'data_response',
  DRONE_COMMAND:    'drone_command',
  COMMAND_RESPONSE: 'command_response',
  SESSION_INFO:     'session_info',
  SESSION_STARTED:  'session_started',
  SESSION_ENDED:    'session_ended',
  DRONES_STATE:     'drones_state',
  MISSION_PROGRESS: 'mission_progress',
  MISSION_COMPLETE: 'mission_complete',
  MISSION_STOPPED:  'mission_stopped',
  DRONE_PHOTO:      'drone_photo'
};

// Drone komut sabitleri (drone_command event'indeki "command" alanı)
export const DRONE_COMMANDS = {
  TAKEOFF:         'takeoff',
  LAND:            'land',
  HOVER:           'hover',
  RETURN_HOME:     'returnHome',
  EMERGENCY_LAND:  'emergency_land',
  VIRTUAL_STICK:   'virtual_stick',
  GIMBAL_PITCH:    'gimbal_pitch',
  WAYPOINT_MISSION: 'waypoint_mission',
  STOP_MISSION:    'stop_mission'
};

// Local Storage Keys
export const STORAGE_KEYS = {
  USER: 'akilliKampusUser',
  REMEMBER_ME: 'akilliKampusRememberMe'
};

// ── Multi-drone (MULTI_DRONE_PROTOCOL.md) ─────────────────────────────────────

// Marker / chip colour per drone; further drones cycle through the palette.
const DRONE_PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

export function droneIndex(droneId) {
  const m = /^drone-(\d+)$/.exec(droneId || '');
  return m ? Math.max(1, Number(m[1])) : 1;
}

export function droneColor(droneId) {
  return DRONE_PALETTE[(droneIndex(droneId) - 1) % DRONE_PALETTE.length];
}

export function droneLabel(droneId) {
  const m = /^drone-(\d+)$/.exec(droneId || '');
  return m ? `Drone ${m[1]}` : (droneId || 'Drone');
}

// Commands the backend accepts with droneId "all". "hover" is left out until
// Android makes it stop a running waypoint mission (§3.3).
export const ALL_DRONE_COMMANDS = ['emergency_land', 'returnHome', 'stop_mission'];

// DJI flight mode enum names → Turkish labels (unknown values are shown raw)
export const FLIGHT_MODE_LABELS = {
  GPS_NORMAL:     'Normal (GPS)',
  GPS_SPORT:      'Spor',
  GPS_TRIPOD:     'Sinematik',
  ATTI:           'ATTI (GPS yok)',
  WAYPOINT:       'Waypoint görevi',
  GO_HOME:        'Eve dönüyor',
  AUTO_LANDING:   'İniş yapıyor',
  AUTO_TAKE_OFF:  'Kalkış yapıyor',
  VIRTUAL_STICK:  'Sanal çubuk',
  MOTOR_START:    'Motorlar çalışıyor',
  MANUAL:         'Manuel'
};

export function flightModeLabel(mode) {
  if (!mode) return null;
  return FLIGHT_MODE_LABELS[mode] || mode;
}
