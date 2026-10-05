-- ================================================
-- Drone Tracking Database Schema
-- ================================================
-- Database: drone_tracking
-- Description: Schema for storing drone telemetry, flight sessions, areas, and reports
-- ================================================

-- Table 1: Areas (polygon definitions from map)
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  coordinates JSONB NOT NULL,  -- {type: "polygon", points: [[lat,lon], ...]}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_areas_created_at ON areas(created_at);

-- Table 2: Flight Sessions (tracks each flight)
CREATE TABLE IF NOT EXISTS flight_sessions (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'aborted'
  start_coordinates JSONB,  -- {lat: 38.682861, lon: 39.915584}
  end_coordinates JSONB,
  total_distance_meters NUMERIC(10, 2),
  total_flight_time_seconds INTEGER,
  average_battery NUMERIC(5, 2),
  min_battery NUMERIC(5, 2),
  max_altitude_agl NUMERIC(8, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flight_sessions_area_id ON flight_sessions(area_id);
CREATE INDEX IF NOT EXISTS idx_flight_sessions_start_time ON flight_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_flight_sessions_status ON flight_sessions(status);

-- Table 3: Telemetry Buffer (temporary high-frequency storage)
-- Stores ALL telemetry (10 Hz) temporarily, then aggregates to telemetry_data
CREATE TABLE IF NOT EXISTS telemetry_buffer (
  id BIGSERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  timestamp BIGINT NOT NULL,
  battery NUMERIC(5, 2),
  gimbal_pitch NUMERIC(6, 2),
  gimbal_roll NUMERIC(6, 2),
  gimbal_yaw NUMERIC(6, 2),
  altitude_agl NUMERIC(8, 2),
  altitude_amsl NUMERIC(8, 2),
  gps_signal_level VARCHAR(20),
  gps_satellite_count INTEGER,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telemetry_buffer_session ON telemetry_buffer(session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_buffer_timestamp ON telemetry_buffer(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_buffer_received_at ON telemetry_buffer(received_at);

-- Table 4: Telemetry Data (sampled, permanent storage)
-- Strategy: Store every 10th record (1 Hz) to balance storage vs. resolution
CREATE TABLE IF NOT EXISTS telemetry_data (
  id BIGSERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES flight_sessions(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,  -- Unix timestamp in milliseconds
  battery NUMERIC(5, 2),
  gimbal_pitch NUMERIC(6, 2),
  gimbal_roll NUMERIC(6, 2),
  gimbal_yaw NUMERIC(6, 2),
  altitude_agl NUMERIC(8, 2),
  altitude_amsl NUMERIC(8, 2),
  gps_signal_level VARCHAR(20),
  gps_satellite_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telemetry_session_timestamp ON telemetry_data(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_data(timestamp);

-- Table 5: Reports (metadata for generated reports)
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES flight_sessions(id) ON DELETE SET NULL,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  report_number VARCHAR(50) UNIQUE NOT NULL,
  file_path VARCHAR(500),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  report_data JSONB,  -- Store computed metrics: waste categories, scan percent, etc.
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at);

-- Table 6: Scan Routes (boustrophedon coverage waypoints)
CREATE TABLE IF NOT EXISTS scan_routes (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas(id) ON DELETE CASCADE,
  waypoints JSONB NOT NULL,          -- [[lat, lon], ...]
  obstacles JSONB DEFAULT '[]',      -- [{lat, lon, radiusM}, ...]
  scan_width_m NUMERIC(8, 2) DEFAULT 20,
  altitude_m NUMERIC(8, 2) DEFAULT 50,
  total_distance_m NUMERIC(10, 2),
  waypoint_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_routes_area_id ON scan_routes(area_id);
CREATE INDEX IF NOT EXISTS idx_scan_routes_created_at ON scan_routes(created_at);

-- Table 7: Obstacles (detected during flights or manually added)
CREATE TABLE IF NOT EXISTS obstacles (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas(id) ON DELETE CASCADE,
  lat NUMERIC(12, 8) NOT NULL,
  lon NUMERIC(12, 8) NOT NULL,
  radius_m NUMERIC(8, 2) DEFAULT 5,
  obstacle_type VARCHAR(50) DEFAULT 'unknown',
  session_id INTEGER REFERENCES flight_sessions(id) ON DELETE SET NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_obstacles_area_id ON obstacles(area_id);

-- Table 8: Photos (full-resolution originals uploaded after landing)
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES flight_sessions(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  file_path VARCHAR(500) NOT NULL,
  lat NUMERIC(12, 8) NOT NULL,
  lon NUMERIC(12, 8) NOT NULL,
  altitude_agl NUMERIC(8, 2),
  heading NUMERIC(6, 2),
  captured_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  classified_at TIMESTAMP  -- NULL until YOLO has processed this photo
);

CREATE INDEX IF NOT EXISTS idx_photos_session_id ON photos(session_id);
CREATE INDEX IF NOT EXISTS idx_photos_area_id ON photos(area_id);
CREATE INDEX IF NOT EXISTS idx_photos_classified_at ON photos(classified_at);

-- Table 9: Waste Detections (one row per YOLO-detected object)
CREATE TABLE IF NOT EXISTS waste_detections (
  id SERIAL PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL,  -- 'kağıt' | 'cam' | 'plastik' | 'metal' | 'geri dönüştürülemez' | 'organik'
  confidence NUMERIC(5, 4) NOT NULL,
  bbox JSONB NOT NULL,            -- {x1,y1,x2,y2} normalized 0-1, in-photo coords
  lat NUMERIC(12, 8) NOT NULL,    -- real-world position of the detected object
  lon NUMERIC(12, 8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waste_detections_photo_id ON waste_detections(photo_id);
CREATE INDEX IF NOT EXISTS idx_waste_detections_category ON waste_detections(category);

-- Table 10: Orthomosaics (stitched aerial composite from a flight's full-res photos)
CREATE TABLE IF NOT EXISTS orthomosaics (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES flight_sessions(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  file_path VARCHAR(500),         -- PNG on disk, NULL until status='done'
  bounds JSONB,                   -- {swLat,swLon,neLat,neLon} WGS84, NULL until done
  photo_count INTEGER,
  status VARCHAR(20) DEFAULT 'processing', -- 'processing' | 'done' | 'error'
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orthomosaics_session_id ON orthomosaics(session_id);
CREATE INDEX IF NOT EXISTS idx_orthomosaics_area_id ON orthomosaics(area_id);

-- Table 11: Landcover Analyses (one row per photo, YOLO-seg green/concrete percentages)
CREATE TABLE IF NOT EXISTS landcover_analyses (
  id SERIAL PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  green_pct NUMERIC(5, 2) NOT NULL,     -- % of photo pixels classified as vegetation
  concrete_pct NUMERIC(5, 2) NOT NULL,  -- % of photo pixels classified as concrete/paved
  other_pct NUMERIC(5, 2) NOT NULL,     -- remainder (neither green nor concrete)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_landcover_analyses_photo_id ON landcover_analyses(photo_id);

-- ================================================
-- Success Message
-- ================================================
DO $$
BEGIN
  RAISE NOTICE 'Database schema initialized successfully!';
  RAISE NOTICE 'Tables created: areas, flight_sessions, telemetry_buffer, telemetry_data, reports, scan_routes, obstacles, photos, waste_detections, orthomosaics, landcover_analyses';
END $$;
