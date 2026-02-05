/**
 * Main Entry Point
 * Initializes React app with all providers
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Import AdminLTE and Bootstrap CSS
import 'admin-lte/dist/css/adminlte.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Import custom styles
import '@styles/global.css';
import '@styles/adminlte-overrides.css';
import '@styles/transitions.css';

// Import context providers
import { AuthProvider } from '@contexts/AuthContext';
import { SocketProvider } from '@contexts/SocketContext';
import { TelemetryProvider } from '@contexts/TelemetryContext';
import { MapProvider } from '@contexts/MapContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <TelemetryProvider>
          <MapProvider>
            <App />
          </MapProvider>
        </TelemetryProvider>
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
