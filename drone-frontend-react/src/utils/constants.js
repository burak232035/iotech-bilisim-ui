// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// API Endpoints
export const API_ENDPOINTS = {
  AREAS: '/api/areas',
  SESSIONS: '/api/sessions',
  TELEMETRY: '/api/telemetry',
  REPORTS: '/api/reports/generate'
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
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  REGISTER: 'register',
  DRONE_TELEMETRY: 'drone_telemetry',
  DATA_REQUEST: 'data_request',
  DATA_RESPONSE: 'data_response',
  DRONE_COMMAND: 'drone_command',
  SESSION_INFO: 'session_info',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended'
};

// Local Storage Keys
export const STORAGE_KEYS = {
  USER: 'akilliKampusUser',
  REMEMBER_ME: 'akilliKampusRememberMe'
};
